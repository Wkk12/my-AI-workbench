import { NextRequest, NextResponse } from "next/server";
import { getDueTasks, saveTask, getAllTasks } from "@/lib/data/scheduler";
import { getSettings } from "@/lib/data/settings";
import type { ScheduledTask } from "@/lib/types";

/**
 * 执行定时任务
 * GET /api/scheduler/run — 检查并执行当前应运行的任务
 * POST /api/scheduler/run { taskId } — 手动触发指定任务
 */

/** 轮询发布任务直到完成或超时，返回实际日志 */
async function pollPublishJob(
  jobId: string,
  platform: string,
  timeoutMs = 300_000
): Promise<string> {
  const startTime = Date.now();
  const emoji = platform === "xiaohongshu" ? "📕" : "🎵";
  while (Date.now() - startTime < timeoutMs) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const resp = await fetch(`${getBaseUrl()}/api/publish?jobId=${jobId}`);
      const data = await resp.json();
      if (data.done) {
        const log = (data.log || "").slice(-800);
        if (data.status === "done") {
          // 检查日志中是否有明确的发布成功/失败标记
          // 注意：不能简单匹配 "error"/"fail"，因为 browser-act 的 stderr
          // 输出中常含 "Error" 字样（如 help text），这些不是真正的发布失败。
          // 只看明确的失败关键词：❌、bail、process.exit、ENOENT
          if (/❌|发布失败|脚本未找到|ENOENT|ECONNREFUSED|browser-act: command not found/i.test(log)) {
            return `${emoji} 发布可能失败: ${log}`;
          }
          // 有正常输出 → 发布流程已执行
          if (log.trim()) {
            return `${emoji} 发布完成，详情: ${log}`;
          }
          return `${emoji} 发布完成（无日志输出）`;
        }
        if (data.status === "error") {
          return `${emoji} 发布脚本异常退出: ${log || "无输出"}`;
        }
      }
    } catch {
      // 轮询出错，继续重试
    }
  }
  return `${emoji} 发布超时（超过${timeoutMs / 1000}秒），任务可能仍在后台运行`;
}

/** 如果有 contentId，从内容库提取标题/正文/标签，标题为空时自动 AI 生成 */
async function resolveContentConfig(
  config: Record<string, string>,
  platform: string
): Promise<{ title?: string; content?: string; tags?: string[]; topic?: string }> {
  const contentId = config.contentId;
  if (!contentId) {
    return { topic: config.topic || "每日精选" };
  }

  try {
    const { getContent } = await import("@/lib/data/contents");
    const item = getContent(contentId);
    if (!item) return { topic: config.topic || "每日精选" };

    let title = item.title;
    // 标题为空时自动 AI 生成
    if (!title || !title.trim()) {
      const settings = getSettings();
      const apiKey = process.env.QWAPI_API_KEY || settings.claude?.qwapiKey || "";
      if (apiKey && (item.description || config.topic)) {
        try {
          const resp = await fetch(`${getBaseUrl()}/api/ai/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              topic: item.description?.slice(0, 100) || config.topic || "每日精选",
              platform,
            }),
          });
          const data = await resp.json();
          if (data.success && data.title) {
            title = data.title;
          }
        } catch { /* AI 生成失败，继续 */ }
      }
    }

    return {
      title: title || item.title || undefined,
      content: item.description || undefined,
      tags: item.tags?.length ? item.tags : undefined,
      topic: config.topic || undefined,
    };
  } catch {
    return { topic: config.topic || "每日精选" };
  }
}

async function executeTask(task: ScheduledTask): Promise<string> {
  const settings = getSettings();
  const qwapiKey = process.env.QWAPI_API_KEY || settings.claude?.qwapiKey || "";
  const claudeKey = settings.claude?.apiKey || "";

  switch (task.actionType) {
    // ── 发布小红书 ──
    case "publish_xhs": {
      const pubConfig = await resolveContentConfig(task.config, "xiaohongshu");
      const resp = await fetch(`${getBaseUrl()}/api/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "xiaohongshu", ...pubConfig }),
      });
      const data = await resp.json();
      if (!data.success) {
        if (data.error?.includes("脚本未找到")) {
          return "📕 发布脚本未安装。请将 social-publisher 脚本放到 ~/.openclaw/workspace/skills/social-publisher/";
        }
        return `📕 发布启动失败: ${data.error}`;
      }
      // 等待实际执行结果
      return await pollPublishJob(data.jobId, "xiaohongshu");
    }

    // ── 发布抖音 ──
    case "publish_douyin": {
      const pubConfig = await resolveContentConfig(task.config, "douyin");
      const resp = await fetch(`${getBaseUrl()}/api/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "douyin", ...pubConfig }),
      });
      const data = await resp.json();
      if (!data.success) {
        if (data.error?.includes("脚本未找到")) {
          return "🎵 发布脚本未安装。请将 social-publisher 脚本放到 ~/.openclaw/workspace/skills/social-publisher/";
        }
        return `🎵 发布启动失败: ${data.error}`;
      }
      return await pollPublishJob(data.jobId, "douyin");
    }

    // ── 生成日报 ──
    case "generate_report": {
      const today = new Date().toISOString().split("T")[0];
      const gitlab = settings.gitlab || {};
      const resp = await fetch(`${getBaseUrl()}/api/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateType: "single",
          date: today,
          localRoot: gitlab.localRoot || "F:\\RY",
          branch: gitlab.defaultBranch || "dev_wkk",
          author: gitlab.defaultAuthor || "Wkk12",
          source: "local",
        }),
      });
      const data = await resp.json();
      if (data.success) {
        // 自动保存
        await fetch(`${getBaseUrl()}/api/daily-report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meta: data.meta, content: data.content }),
        });
        return `日报已生成 (${data.meta?.commitCount || 0} commits)`;
      }
      return `日报生成失败: ${data.error || "未知"}`;
    }

    // ── AI 早安问候 ──
    case "ai_morning": {
      const city = task.config?.city || "北京";
      const apiKey = claudeKey || qwapiKey;
      if (!apiKey) return "未配置 AI API Key";

      const system = "你是一个贴心的生活小助手。用温柔可爱的语气，像朋友一样说话。";
      const userMsg = `现在是早上，请给我发一条早安问候，包含以下内容：
1. 温馨的早安问候
2. 今天${city}的天气大概如何（根据你对${city}的了解大致描述即可）
3. 给出今天的穿衣/穿搭建议
4. 一句暖心鼓励的话

整体语气温暖可爱，要有emoji，200字以内。称呼用户为「美少女珂」。`;

      const backend = claudeKey ? "anthropic" : "qweapi";

      try {
        if (backend === "anthropic") {
          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          const anthropic = new Anthropic({ apiKey: claudeKey });
          const resp = await anthropic.messages.create({
            model: settings.claude?.model || "claude-sonnet-4-20250514",
            max_tokens: 500,
            system,
            messages: [{ role: "user", content: userMsg }],
          });
          const text = resp.content
            .filter((b) => b.type === "text")
            .map((b) => (b as { text: string }).text)
            .join("\n");
          return text;
        } else {
          const resp = await fetch("https://qweapi.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "deepseek-v3.2",
              messages: [
                { role: "system", content: system },
                { role: "user", content: userMsg },
              ],
              max_tokens: 500,
            }),
          });
          const data = await resp.json();
          return data.choices?.[0]?.message?.content || "早安生成失败";
        }
      } catch (e) {
        return `AI 调用失败: ${String(e)}`;
      }
    }

    // ── 自定义 ──
    case "custom":
    default:
      return "自定义任务（待实现脚本调用）";
  }
}

function getBaseUrl() {
  return `http://localhost:${process.env.PORT || 3000}`;
}

/** 检查并执行到期任务 */
export async function GET() {
  const now = new Date();
  const timeKey = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dayOfWeek = now.getDay();

  const tasks = getDueTasks();
  const results: { id: string; name: string; result: string }[] = [];

  // 诊断：列出所有任务及其过滤状态
  const all = getAllTasks();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const diag = all.map((t) => {
    const reasons: string[] = [];
    if (!t.enabled) reasons.push("已禁用");
    if (t.schedule !== timeKey) reasons.push(`时间不匹配(schedule=${t.schedule} now=${timeKey})`);
    if (t.daysOfWeek.length > 0 && !t.daysOfWeek.includes(dayOfWeek)) reasons.push("今天不执行");
    if (t.lastRun) {
      const lastDate = new Date(t.lastRun);
      const lastDayKey = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, "0")}-${String(lastDate.getDate()).padStart(2, "0")}`;
      if (lastDayKey === todayKey) reasons.push("今日已执行");
    }
    return {
      id: t.id,
      name: t.name,
      schedule: t.schedule,
      enabled: t.enabled,
      lastRun: t.lastRun,
      willRun: reasons.length === 0,
      skipReasons: reasons,
    };
  });

  for (const task of tasks) {
    try {
      const result = await executeTask(task);
      task.lastRun = new Date().toISOString();
      task.lastResult = result;
      saveTask(task);
      results.push({ id: task.id, name: task.name, result });
    } catch (e) {
      const err = String(e);
      task.lastRun = new Date().toISOString();
      task.lastResult = `错误: ${err}`;
      saveTask(task);
      results.push({ id: task.id, name: task.name, result: err });
    }
  }

  return NextResponse.json({
    checked: now.toISOString(),
    timeKey,
    dayOfWeek,
    executed: results.length,
    results,
    diag,
  });
}

/** 手动触发指定任务 */
export async function POST(request: NextRequest) {
  const { taskId } = await request.json();
  if (!taskId) {
    return NextResponse.json({ error: "缺少 taskId" }, { status: 400 });
  }

  const { getTask } = await import("@/lib/data/scheduler");
  const task = getTask(taskId);
  if (!task) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  const result = await executeTask(task);
  task.lastRun = new Date().toISOString();
  task.lastResult = result;
  saveTask(task);

  return NextResponse.json({ success: true, result });
}
