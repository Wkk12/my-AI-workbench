import { NextRequest, NextResponse } from "next/server";
import { exec, execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { getSettings } from "@/lib/data/settings";

/**
 * 发布内容到小红书/抖音
 * POST /api/publish  { contentId, platform, title, content, tags, image? }
 */

const LLM_BASE = "https://qweapi.com/v1";
const LLM_MODELS = ["deepseek-v3.2", "deepseek-chat", "gpt-4o-mini"];

function getPublisherDir(): string {
  // 优先项目内 scripts/publisher/
  const projectDir = path.resolve(process.cwd(), "scripts", "publisher");
  if (fs.existsSync(path.join(projectDir, "publish-xhs.js"))) {
    return projectDir;
  }
  // fallback: 旧路径
  return path.join(os.homedir(), ".openclaw", "workspace", "skills", "social-publisher");
}

function getHermesEnvPath(): string {
  return path.join(os.homedir(), ".hermes", ".env");
}

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

// 运行中的任务
const runningJobs = new Map<
  string,
  { status: "running" | "done" | "error"; log: string; startTime: number }
>();

/** 发布到指定平台，返回 jobId */
async function publishToPlatform(
  platform: "xiaohongshu" | "douyin",
  opts: { title?: string; content?: string; tags?: string[]; topic?: string; imagePath?: string }
): Promise<{ success: true; jobId: string; script: string } | { success: false; error: string }> {
  const { title, content, tags, topic, imagePath } = opts;
  const scriptName = platform === "xiaohongshu" ? "publish-xhs.js" : "publish-douyin.js";
  const scriptPath = path.join(getPublisherDir(), scriptName);

  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: `发布脚本未找到: ${scriptPath}` };
  }

  const apiKey = process.env.QWAPI_API_KEY || getSettings().claude?.qwapiKey || "";

  const args = [scriptPath];
  if (topic && topic !== "true") {
    args.push("--topic", topic);
  } else {
    if (title) args.push("--title", title);
    if (content) args.push("--content", content.replace(/\n/g, "\\n"));
    if (tags && tags.length > 0) args.push("--tags", tags.join(","));
    if (imagePath) {
      args.push("--image", imagePath);
    } else if (content && apiKey) {
      try {
        const prompt = await generateImagePrompt(content, apiKey, platform);
        if (prompt) args.push("--prompt", prompt);
      } catch { /* ignore */ }
    }
  }

  const jobId = `${platform}_${Date.now()}`;

  const cmd = `node ${args.map(a => `"${a}"`).join(" ")}`;
  const sep = process.platform === "win32" ? ";" : ":";
  const homePath = os.homedir();
  // 读取浏览器 ID（优先环境变量 → data/browser-id.json → 默认值）
  let browserId = process.env.BROWSER_ID || "";
  if (!browserId) {
    const idFile = path.join(process.cwd(), "data", "browser-id.json");
    try { browserId = JSON.parse(fs.readFileSync(idFile, "utf8")).browserId || ""; } catch {}
  }
  if (!browserId) browserId = "chrome_local_104622926254309377";
  const env = {
    ...process.env,
    HOME: homePath,
    QWAPI_API_KEY: apiKey,
    BROWSER_ID: browserId,
    PATH: `${homePath}/.local/bin${sep}${process.env.PATH || ""}`,
  };

  runningJobs.set(jobId, { status: "running", log: "", startTime: Date.now() });

  exec(cmd, { cwd: getPublisherDir(), env }, (error, stdout, stderr) => {
    const job = runningJobs.get(jobId);
    if (job) {
      job.status = error ? "error" : "done";
      job.log = ((stdout || "") + (stderr ? "[stderr] " + stderr : "")).slice(-5000);
    }
    setTimeout(() => runningJobs.delete(jobId), 3600_000);
  });

  return { success: true, jobId, script: scriptName };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform, title, content, tags, topic, imagePath } = body;

    if (!platform || !["xiaohongshu", "douyin", "both"].includes(platform)) {
      return NextResponse.json(
        { error: "platform 必须是 xiaohongshu、douyin 或 both" },
        { status: 400 }
      );
    }

    // 双平台：分别发布
    if (platform === "both") {
      const platforms = ["xiaohongshu", "douyin"] as const;
      const jobs: { platform: string; jobId: string; script: string }[] = [];
      for (const p of platforms) {
        const result = await publishToPlatform(p, { title, content, tags, topic, imagePath });
        if (result.success) jobs.push({ platform: p, jobId: result.jobId, script: result.script });
      }
      if (jobs.length > 0) {
        return NextResponse.json({
          success: true,
          jobs,
          status: "running",
          message: `已启动 ${jobs.length} 个发布任务`,
        });
      }
      return NextResponse.json(
        { error: "双平台发布失败，请检查发布脚本是否安装" },
        { status: 500 }
      );
    }

    // 检查 browser-act
    try {
      execSync("browser-act --version", { stdio: "pipe", timeout: 5000 });
    } catch {
      return NextResponse.json(
        { error: "browser-act 未安装。请运行: bash scripts/setup.sh" },
        { status: 500 }
      );
    }

    const result = await publishToPlatform(platform, { title, content, tags, topic, imagePath });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      jobId: result.jobId,
      status: "running",
      script: result.script,
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
