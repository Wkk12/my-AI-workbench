#!/usr/bin/env node
/**
 * 图片生成 Worker — 独立子进程，不受 Next.js 请求上下文限制
 * 用法: node scripts/gen-images-worker.js <jobId>
 */
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://qweapi.com/v1";
const IMAGE_TIMEOUT_MS = 180000;
const JOB_DIR = path.join(process.cwd(), "data", "image-jobs");
const IMG_DIR = path.join(process.cwd(), "public", "data", "images");
const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");

async function getApiKey() {
  if (process.env.QWAPI_API_KEY) return process.env.QWAPI_API_KEY;
  const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
  const settings = JSON.parse(raw);
  const key = settings?.claude?.qwapiKey;
  if (key) return key;
  throw new Error("未配置 QWAPI_API_KEY");
}

async function getIPs() {
  const ipsPath = path.join(process.cwd(), "data", "ips", "index.json");
  if (!fs.existsSync(ipsPath)) return [];
  const data = JSON.parse(fs.readFileSync(ipsPath, "utf-8")); return data.ips || [];
}

/** 净化可能触发内容审核的 prompt */
function sanitizePromptForModeration(prompt) {
  let clean = prompt
    .replace(/少女|女孩|女性|女人|未成年|儿童|孩子|小孩/g, '人物')
    .replace(/性感|妩媚|诱惑|暴露|裸|泳装|内衣/g, '')
    .replace(/真实照片|真人|摄影|拍摄/g, '插画')
    .replace(/血腥|暴力|武器|枪/g, '')
    .slice(0, 300);
  if (clean.trim().length < 20) clean = '可爱的卡通猫咪插图，温暖柔和色调';
  return clean;
}

async function generateOneImage(prompt, apiKey, size, retries = 2) {
  let currentPrompt = prompt;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let resp;
    try {
      resp = await fetch(`${BASE_URL}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-image-2", prompt: currentPrompt, n: 1, size, response_format: "b64_json" }),
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      });
    } catch (fetchErr) {
      // 超时或网络错误也重试
      if (attempt < retries) {
        console.error(`  Timeout/network retry ${attempt + 1} (${IMAGE_TIMEOUT_MS / 1000}s): ${fetchErr.message.slice(0, 80)}`);
        // 重试间隔递增：2s → 4s
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        continue;
      }
      throw new Error(`第${attempt + 1}次尝试后仍超时: ${fetchErr.message.slice(0, 100)}`);
    }
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      const isModeration = resp.status === 400 && (errText.includes("抱歉") || errText.includes("无法"));
      if (isModeration && attempt < retries) {
        const old = currentPrompt;
        currentPrompt = sanitizePromptForModeration(currentPrompt);
        console.error(`  Moderation retry ${attempt + 1}: "${old.slice(0, 60)}..." → "${currentPrompt.slice(0, 60)}..."`);
        continue;
      }
      throw new Error(`生图 API ${resp.status}: ${errText.slice(0, 200)}`);
    }
    const data = await resp.json();
    if (!data.data?.[0]?.b64_json) throw new Error("API 返回格式异常");
    return data.data[0].b64_json;
  }
}

function updateJob(jobId, patch) {
  const file = path.join(JOB_DIR, `${jobId}.json`);
  const current = JSON.parse(fs.readFileSync(file, "utf-8"));
  Object.assign(current, patch);
  fs.writeFileSync(file, JSON.stringify(current));
}

(async () => {
  const jobId = process.argv[2];
  if (!jobId) { console.error("Usage: gen-images-worker.js <jobId>"); process.exit(1); }

  const jobFile = path.join(JOB_DIR, `${jobId}.json`);
  if (!fs.existsSync(jobFile)) {
    console.error("Job not found:", jobId);
    process.exit(1);
  }

  const job = JSON.parse(fs.readFileSync(jobFile, "utf-8"));

  try {
    const apiKey = await getApiKey();
    const ips = job.ipId ? await getIPs() : [];
    const ip = job.ipId ? ips.find((i) => i.id === job.ipId) : undefined;

    const CONCURRENCY = 2;

    for (let batch = 0; batch < job.tasks.length; batch += CONCURRENCY) {
      const batchTasks = job.tasks.slice(batch, batch + CONCURRENCY).map(async (prompt, j) => {
        const idx = batch + j;
        try {
          const b64 = await generateOneImage(prompt, apiKey, job.size);
          // Save image
          if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });
          const fileName = `ai_gen_${Date.now()}_${idx}.png`;
          fs.writeFileSync(path.join(IMG_DIR, fileName), Buffer.from(b64, "base64"));
          return { url: `/api/images/${fileName}`, index: idx, ok: true };
        } catch (e) {
          return { url: "", index: idx, ok: false, error: `第${idx + 1}张: ${e.message}` };
        }
      });

      const results = await Promise.allSettled(batchTasks);
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.ok) {
          job.images.push(r.value.url);
        } else if (r.status === "fulfilled" && r.value.error) {
          job.errors.push(r.value.error);
          console.error(r.value.error);
        } else if (r.status === "rejected") {
          job.errors.push(`Worker error: ${r.reason}`);
          console.error("Worker error:", r.reason);
        }
        job.done++;
      }
      // Update job file incrementally
      updateJob(jobId, { images: job.images, errors: job.errors, done: job.done });
    }

    updateJob(jobId, { status: "done" });
    console.log(`Job ${jobId} done: ${job.images.length}/${job.total}`);
  } catch (e) {
    updateJob(jobId, { status: "error", errors: [...job.errors, `Worker crash: ${e.message}`] });
    console.error("Worker crash:", e);
  }
})();
