import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

/**
 * 发布内容到小红书/抖音
 * POST /api/publish  { contentId, platform, title, content, tags, image? }
 */

const LLM_BASE = "https://qweapi.com/v1";
const LLM_MODELS = ["deepseek-v3.2", "deepseek-chat", "gpt-4o-mini"];

/** 从内容自动生成生图 prompt */
async function generateImagePrompt(
  content: string,
  apiKey: string,
  platform: string
): Promise<string> {
  const styleHint =
    platform === "xiaohongshu"
      ? "干净、小清新、适合小红书审美，温暖柔和色调"
      : "醒目、冲击力强、适合抖音封面风格";

  const userMessage = `根据以下内容生成一个AI封面图英文prompt。要求：
- 风格：${styleHint}
- 画面：竖版3:4比例，适合手机封面
- 英文输出，不超过150字符

内容：${content.slice(0, 300)}`;

  for (const model of LLM_MODELS) {
    try {
      const resp = await fetch(`${LLM_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "你是AI图片提示词专家。只输出英文prompt，不要任何解释。" },
            { role: "user", content: userMessage },
          ],
          max_tokens: 200,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      return data.choices[0].message.content.trim();
    } catch { continue; }
  }
  return "";
}

const PUBLISHER_DIR = path.resolve(
  process.env.HOME || "/Users/wkk",
  ".openclaw/workspace/skills/social-publisher"
);

// 运行中的任务
const runningJobs = new Map<
  string,
  { status: "running" | "done" | "error"; log: string; startTime: number }
>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform, title, content, tags, topic, imagePath } = body;

    if (!platform || !["xiaohongshu", "douyin"].includes(platform)) {
      return NextResponse.json(
        { error: "platform 必须是 xiaohongshu 或 douyin" },
        { status: 400 }
      );
    }

    const scriptName =
      platform === "xiaohongshu" ? "publish-xhs.js" : "publish-douyin.js";
    const scriptPath = path.join(PUBLISHER_DIR, scriptName);

    if (!fs.existsSync(scriptPath)) {
      return NextResponse.json(
        { error: `发布脚本未找到: ${scriptPath}` },
        { status: 500 }
      );
    }

    // 获取 QWAPI_API_KEY（优先环境变量 → ~/.hermes/.env）
    let apiKey = process.env.QWAPI_API_KEY || "";
    if (!apiKey) {
      try {
        const hermPath = path.join(
          process.env.HOME || "/Users/wkk",
          ".hermes",
          ".env"
        );
        if (fs.existsSync(hermPath)) {
          const hermContent = fs.readFileSync(hermPath, "utf-8");
          const match = hermContent.match(/QWAPI_API_KEY=(.+)/);
          if (match?.[1]) apiKey = match[1].trim();
        }
      } catch { /* ignore */ }
    }

    // 构建命令行参数
    const args = [scriptPath];
    if (topic && topic !== "true") {
      args.push("--topic", topic);
    } else {
      if (title) args.push("--title", title);
      if (content) args.push("--content", content.replace(/\n/g, "\\n"));
      if (tags && tags.length > 0) {
        args.push("--tags", tags.join(","));
      }
      if (imagePath) {
        args.push("--image", imagePath);
      } else if (content && apiKey) {
        // 手动模式无图 → 用内容自动生成生图 prompt
        try {
          const prompt = await generateImagePrompt(content, apiKey, platform);
          if (prompt) args.push("--prompt", prompt);
        } catch { /* prompt 生成失败则跳过，脚本会报清晰错误 */ }
      }
    }

    const env = {
      ...process.env,
      HOME: process.env.HOME || "/Users/wkk",
      QWAPI_API_KEY: apiKey,
      BROWSER_ID:
        process.env.BROWSER_ID || "chrome_local_104622926254309377",
    };

    const jobId = `${platform}_${Date.now()}`;
    let log = "";

    const child = spawn("node", args, {
      cwd: PUBLISHER_DIR,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    runningJobs.set(jobId, {
      status: "running",
      log: "",
      startTime: Date.now(),
    });

    child.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      log += text;
      const job = runningJobs.get(jobId);
      if (job) job.log = log.slice(-5000); // 只保留最后 5KB
    });

    child.stderr.on("data", (data: Buffer) => {
      log += "[stderr] " + data.toString();
      const job = runningJobs.get(jobId);
      if (job) job.log = log.slice(-5000);
    });

    child.on("close", (code) => {
      const job = runningJobs.get(jobId);
      if (job) {
        job.status = code === 0 ? "done" : "error";
        job.log = log.slice(-5000);
      }
      // 1 小时后清理
      setTimeout(() => runningJobs.delete(jobId), 3600_000);
    });

    return NextResponse.json({
      success: true,
      jobId,
      status: "running",
      script: scriptName,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** 查询发布任务状态 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    // 列出所有运行中的任务
    const jobs: Record<string, unknown> = {};
    runningJobs.forEach((j, id) => {
      jobs[id] = { status: j.status, elapsed: Date.now() - j.startTime };
    });
    return NextResponse.json({ jobs });
  }

  const job = runningJobs.get(jobId);
  if (!job) {
    return NextResponse.json({ error: "任务不存在或已过期" }, { status: 404 });
  }

  const done = job.status === "done" || job.status === "error";
  return NextResponse.json({
    jobId,
    status: job.status,
    log: done ? job.log.slice(-3000) : job.log.slice(-500),
    elapsed: Date.now() - job.startTime,
    done,
  });
}
