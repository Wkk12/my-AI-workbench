import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { getSettings } from "@/lib/data/settings";
import { createLog, addStep, addErrorStep, completeLog } from "@/lib/publish-logger";
import { checkPublished, markPublished, computeFingerprint } from "@/lib/data/published-registry";

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

function getBrowserActBin(): string | null {
  const base = path.join(os.homedir(), ".local", "bin", "browser-act");
  if (fs.existsSync(base + ".exe")) return base + ".exe";
  if (fs.existsSync(base)) return base;
  return null;
}

/** 检测是否为奶油猫咪主题 */
function isCreamCatTopic(content: string): boolean {
  const keywords = ['奶油', '猫', '喵', '猫咪', '英短', '萌宠', '宠物', 'cat', 'kitten', 'cream', 'ragdoll'];
  const lower = content.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

/** 从内容自动生成生图 prompt */
async function generateImagePrompt(
  content: string,
  apiKey: string,
  platform: string
): Promise<string> {
  const isCatTopic = isCreamCatTopic(content);
  const styleHint =
    platform === "xiaohongshu"
      ? (isCatTopic
          ? "卡通插画风（cartoon illustration），主角是一只蓝眼睛灰白布偶猫（Ragdoll cat），圆脸、深色耳朵和尾巴，白色奶油色身体，毛茸茸可爱。温暖柔和色调，奶油系配色（cream/beige/warm gray），干净小清新，适合小红书宠物账号审美"
          : "干净、小清新、适合小红书审美，温暖柔和色调")
      : "醒目、冲击力强、适合抖音封面风格";

  const catContext = isCatTopic
    ? "【重要】图片主角必须是一只布偶猫（Ragdoll cat），蓝眼睛，灰白奶油色配色，卡通插画风格，不是真实照片。"
    : "";

  const userMessage = `${catContext}根据以下内容生成一个AI封面图英文prompt。要求：
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
  opts: { title?: string; content?: string; tags?: string[]; topic?: string; imagePaths?: string[]; imagePrompt?: string; batchId?: string; dryRun?: boolean }
): Promise<{ success: true; jobId: string; script: string } | { success: false; error: string }> {
  const { title, content, tags, topic, imagePaths, imagePrompt: preGeneratedPrompt, dryRun } = opts;
  const isWin = process.platform === "win32";
  let scriptName = platform === "xiaohongshu" ? "publish-xhs" : "publish-douyin";
  // Windows 使用适配版脚本（如果存在），否则回退到原版
  if (isWin) {
    const winScript = scriptName + "-win.js";
    if (fs.existsSync(path.join(getPublisherDir(), winScript))) {
      scriptName = winScript;
    } else {
      scriptName += ".js";
    }
  } else {
    scriptName += ".js";
  }
  const scriptPath = path.join(getPublisherDir(), scriptName);

  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: `发布脚本未找到: ${scriptPath}` };
  }

  const jobId = `${platform}_${Date.now()}`;
  const platformLabel = platform === "xiaohongshu" ? "小红书" : "抖音";
  createLog(jobId, platform, title || topic || "未命名", opts.batchId);
  addStep(jobId, "准备发布", `目标平台: ${platformLabel}${title ? ` | 标题: ${title}` : ` | 主题: ${topic}`}`);

  const settings = await getSettings();
  const apiKey = process.env.QWAPI_API_KEY || settings.claude?.qwapiKey || "";

  const LLM_MODELS = ["deepseek-v3.2", "deepseek-chat", "gpt-4o-mini"];

  // 转换 API 图片路径为本地路径
  let resolvedImagePaths = imagePaths;
  if (resolvedImagePaths) {
    resolvedImagePaths = resolvedImagePaths.map((p: string) => {
      if (p.startsWith("/api/images/")) {
        return path.join(process.cwd(), "public", "data", "images", p.replace("/api/images/", ""));
      }
      return p;
    });
  }

  const args = [scriptPath];
  if (dryRun) args.push("--dry-run");
  if (topic && topic !== "true") {
    args.push("--topic", topic);
  } else {
    if (title) args.push("--title", title);
    if (content) args.push("--content", content.replace(/\n/g, "\\n"));
    if (tags && tags.length > 0) args.push("--tags", tags.join(","));
    if (resolvedImagePaths && resolvedImagePaths.length > 0) {
      for (const img of resolvedImagePaths) {
        args.push("--image", img);
      }
      addStep(jobId, "使用已有图片", `共 ${resolvedImagePaths.length} 张图片: ${resolvedImagePaths.join(", ")}`);
    } else if (preGeneratedPrompt) {
      args.push("--prompt", preGeneratedPrompt);
      addStep(jobId, "复用封面图prompt", `双平台复用: ${preGeneratedPrompt.slice(0, 100)}...`);
    } else if (content && apiKey) {
      try {
        const t0 = Date.now();
        const prompt = await generateImagePrompt(content, apiKey, platform);
        if (prompt) {
          args.push("--prompt", prompt);
          const usedModel = LLM_MODELS[0] || "deepseek-v3.2";
          addStep(jobId, "生成封面图prompt", `使用 ${usedModel} 生成封面描述`, {
            model: usedModel,
            durationMs: Date.now() - t0,
          });
        }
      } catch (e) {
        addErrorStep(jobId, "生成封面图prompt", `失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const sep = process.platform === "win32" ? ";" : ":";
  const homePath = os.homedir();
  // 读取浏览器 ID（优先环境变量 → data/browser-id.json → 默认值）
  let browserId = process.env.BROWSER_ID || "";
  if (!browserId) {
    const idFile = path.join(process.cwd(), "data", "browser-id.json");
    try { browserId = JSON.parse(fs.readFileSync(idFile, "utf8")).browserId || ""; } catch {}
  }
  if (!browserId) browserId = "chrome_local_104622926254309377";
  const publisherDir = getPublisherDir();
  const env = {
    ...process.env,
    HOME: homePath,
    QWAPI_API_KEY: apiKey,
    BROWSER_ID: browserId,
    PATH: `${homePath}/.local/bin${sep}${process.env.PATH || ""}`,
  };

  let log = "";
  const scriptLabel = platform === "xiaohongshu" ? "publish-xhs.js" : "publish-douyin.js";

  // 🆕 去重检查：同一主题是否已发布成功
  const topicForCheck = topic || title || "";
  if (topicForCheck) {
    const alreadyPublished = checkPublished(topicForCheck, platform);
    if (alreadyPublished) {
      const when = new Date(alreadyPublished.publishedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
      const msg = `⏭️ 跳过重复发布: 「${topicForCheck.slice(0, 40)}」已在 ${when} 发布成功 (jobId: ${alreadyPublished.jobId.slice(-8)})`;
      console.log(msg);
      addStep(jobId, "去重检查", msg);
      addStep(jobId, "跳过发布", `该主题已于 ${when} 发布成功，跳过重复发布`);
      completeLog(jobId, "done", msg);
      runningJobs.set(jobId, { status: "done", log: msg, startTime: Date.now() });
      return { success: true, jobId, script: scriptName };
    }
  }

  addStep(jobId, "执行发布脚本", `启动 ${scriptLabel}${topic ? ` --topic ${topic}` : ""}`);
  runningJobs.set(jobId, { status: "running", log: "", startTime: Date.now() });

  const cmd = `node ${args.map(a => `"${a}"`).join(" ")}`;

  exec(cmd, { cwd: getPublisherDir(), env }, (error, stdout, stderr) => {
    const job = runningJobs.get(jobId);
    if (job) {
      const out = (stdout || "") + (stderr || "");
      job.log = out.slice(-5000);

      // ── 发布结果判定（多维度，成功标记优先）──
      const hasSuccessMarker = /🎉.*成功|发布成功|publish.*success/i.test(out);
      const hasFatalInOutput = /💥|❌|生图失败|bail|脚本异常|发布失败|login_required|api_not_found|CDP.*失败|找不到/.test(out);
      const hasExitError = !!error;

      // 判定逻辑（修正版）：
      // 1. 有明确成功标记 → done（即使 exit code ≠ 0，因为 browser-act eval 会输出 Error 但非致命）
      // 2. 无成功标记 + 有致命输出 → error
      // 3. 无成功标记 + exit code ≠ 0 → error
      // 4. 无成功标记 + 无 exit error + 无致命输出 → done（可能正常退出无标记）
      let finalStatus: "done" | "error";
      if (hasSuccessMarker) {
        finalStatus = "done";
      } else if (hasFatalInOutput || hasExitError) {
        finalStatus = "error";
      } else {
        finalStatus = "done";
      }
      job.status = finalStatus;

      if (finalStatus === "error") {
        // 提取错误摘要
        const errLines = out.split('\n').filter(l => /❌|💥|bail|失败|错误|找不到|login_required/i.test(l));
        const errSummary = errLines.slice(-3).join(' | ').slice(0, 300) || (error?.message || "脚本异常退出");
        addErrorStep(jobId, "发布脚本执行", `${hasExitError ? '进程异常退出' : '输出检测到错误'}: ${errSummary}`);
        completeLog(jobId, "error", out.slice(-3000));
      } else {
        addStep(jobId, "发布完成", `脚本执行完成，输出 ${out.length} 字符`, {
          durationMs: Date.now() - (runningJobs.get(jobId)?.startTime || Date.now()),
        });
        completeLog(jobId, "done", out.slice(-3000));

        // 🆕 记录到已发布注册表，防止重复发布
        const topicForRegistry = topic || title || "未命名";
        // 提取 AI 生成的标题（从输出中解析）
        const titleMatch = out.match(/✅\s*标题[:：]\s*(.+)/);
        const publishedTitle = titleMatch ? titleMatch[1].trim() : undefined;
        markPublished(topicForRegistry, platform, jobId, publishedTitle);
      }
    }
    setTimeout(() => runningJobs.delete(jobId), 3600_000);
  });

  return { success: true, jobId, script: scriptName };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform, title, content, tags, topic, imagePaths, ipId, dryRun } = body;

    if (!platform || !["xiaohongshu", "douyin", "both"].includes(platform)) {
      return NextResponse.json(
        { error: "platform 必须是 xiaohongshu、douyin 或 both" },
        { status: 400 }
      );
    }

    // 🛡️ 安全锁：发布需要手动解锁（防止测试/调度器误触发）
    const lockFile = path.join(process.cwd(), "scripts", "publisher", ".publish-lock");
    if (fs.existsSync(lockFile)) {
      const isDryRun = body.dryRun === true || body._unlock === true;
      if (!isDryRun) {
        return NextResponse.json(
          { error: "🔒 发布已锁定。删除 scripts/publisher/.publish-lock 或传 dryRun:true 解除", locked: true },
          { status: 423 }
        );
      }
    }

    // 双平台：生成一套内容，分别发布
    if (platform === "both") {
      const settings = await getSettings();
      const apiKey = process.env.QWAPI_API_KEY || settings.claude?.qwapiKey || "";

      // 预生成图片 prompt（仅一次）
      let sharedImagePrompt = "";
      if (!imagePaths?.length && content && apiKey) {
        try {
          sharedImagePrompt = await generateImagePrompt(content, apiKey, "xiaohongshu");
        } catch { /* 图片生成失败不影响发布 */ }
      }

      const batchId = `batch_${Date.now()}`;
      const platforms = ["xiaohongshu", "douyin"] as const;
      const jobs: { platform: string; jobId: string; script: string }[] = [];
      for (const p of platforms) {
        const result = await publishToPlatform(p, {
          batchId,
          title, content, tags, topic, dryRun,
          imagePaths: imagePaths?.length ? imagePaths : undefined,
          imagePrompt: sharedImagePrompt,
        });
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
    const baBin = getBrowserActBin();
    if (!baBin) {
      return NextResponse.json(
        { error: "browser-act 未安装。请运行: bash scripts/setup.sh" },
        { status: 500 }
      );
    }

    const result = await publishToPlatform(platform, { title, content, tags, topic, imagePaths, dryRun });
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
    // 任务可能已完成并被清理，或服务器重启导致状态丢失
    return NextResponse.json({
      jobId,
      status: "expired",
      log: "任务状态已过期（服务器可能已重启）。请重新发布。",
      done: true,
    });
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
