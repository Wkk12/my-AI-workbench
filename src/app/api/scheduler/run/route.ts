import { NextRequest, NextResponse } from "next/server";
import { getDueTasks, saveTask } from "@/lib/data/scheduler";
import { getSettings } from "@/lib/data/settings";
import type { ScheduledTask } from "@/lib/types";

/**
 * 执行定时任务
 * GET /api/scheduler/run — 检查并执行当前应运行的任务
 * POST /api/scheduler/run { taskId } — 手动触发指定任务
 */

async function executeTask(task: ScheduledTask): Promise<string> {
  const settings = getSettings();
  const qwapiKey = process.env.QWAPI_API_KEY || settings.claude?.qwapiKey || "";
  const claudeKey = settings.claude?.apiKey || "";

  switch (task.actionType) {
    // ── 发布小红书 ──
    case "publish_xhs": {
      const topic = task.config?.topic || "每日精选";
      const resp = await fetch(`${getBaseUrl()}/api/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "xiaohongshu", topic }),
      });
      const data = await resp.json();
      return data.success ? "小红书发布任务已启动" : `失败: ${data.error}`;
    }

    // ── 发布抖音 ──
    case "publish_douyin": {
      const topic = task.config?.topic || "每日精选";
      const resp = await fetch(`${getBaseUrl()}/api/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "douyin", topic }),
      });
      const data = await resp.json();
      return data.success ? "抖音发布任务已启动" : `失败: ${data.error}`;
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
  const tasks = getDueTasks();
  const results: { id: string; name: string; result: string }[] = [];

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
    checked: new Date().toISOString(),
    executed: results.length,
    results,
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
