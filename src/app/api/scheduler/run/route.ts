import { NextRequest, NextResponse } from "next/server";
import { getDueTasks, saveTask, getAllTasks } from "@/lib/data/scheduler";
import { getSettings } from "@/lib/data/settings";
import { getContent } from "@/lib/data/contents";
import type { ScheduledTask } from "@/lib/types";
import fs from "fs";
import path from "path";

/** 调度器互斥锁：防止同一任务被并发执行 */
const runningTaskIds = new Set<string>();
const SCHEDULER_LOCK_FILE = path.join(process.cwd(), "data", ".scheduler-running");

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
          // 🆕 跳过重复发布（去重检查）
          if (/⏭️|跳过重复|skip publish/i.test(log)) {
            return `${emoji} ${log.slice(0, 200)}`;
          }
          // 检测真正的失败（排除 browser-act 自身的 Error 数字编号）
          const isRealFailure = /❌|发布失败|脚本未找到|ENOENT|ECONNREFUSED|browser-act: command not found|未登录|login_required|登录过期/i.test(
            log.replace(/Error \d+:.*?\n?/g, "") // 排除 browser-act Error 210313 等非致命输出
          );
          if (isRealFailure) {
            return `${emoji} 发布可能失败: ${log}`;
          }
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

/** 如果有 contentId，从内容库提取标题/正文/标签 */
async function resolveContentConfig(
  config: Record<string, string>,
  platform: string
): Promise<{ title?: string; content?: string; tags?: string[]; topic?: string }> {
  const contentId = config.contentId;
  if (!contentId) {
    return { topic: config.topic || "每日精选" };
  }

  try {
    const item = await getContent(contentId);
    if (!item) return { topic: config.topic || "每日精选" };

    let title = item.title;
    if (!title || !title.trim()) {
      const settings = await getSettings();
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
  const settings = await getSettings();
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

    // ── 🔥 续火花 ──
    case "spark_renew": {
      const taskTargets: string[] = (() => {
        try { return JSON.parse(task.config?.targets || "[]"); } catch { return []; }
      })();

      // 如果任务没指定联系人，从设置中取默认勾选的
      let targets = taskTargets;
      if (!targets.length) {
        try {
          const resp = await fetch(`${getBaseUrl()}/api/settings/douyin/contacts`);
          const data = await resp.json();
          targets = (data.contacts || []).filter((c: any) => c.selected).map((c: any) => c.name);
        } catch { /* 获取失败继续 */ }
      }

      // 获取续火花文案
      let sparkMessage = task.config?.message || "美少女珂来续火花啦~";
      if (!task.config?.message) {
        try {
          const sResp = await fetch(`${getBaseUrl()}/api/settings/douyin`);
          const sData = await sResp.json();
          if (sData.sparkMessage) sparkMessage = sData.sparkMessage;
        } catch {}
      }

      if (!targets.length) {
        return "没有可续火花的联系人。请在系统设置 → 抖音模块中配置。";
      }

      try {
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);
        const workerConfig = JSON.stringify({ targets, message: sparkMessage });
        const cwd = process.env.WORKBENCH_ROOT || "C:\\my-AI-workbench";

        const { stdout } = await execAsync(
          `node scripts/spark-renew-worker.cjs '${workerConfig.replace(/'/g, "'\\''")}' 2>&1`,
          { cwd, encoding: "utf-8", timeout: 300_000, maxBuffer: 10 * 1024 * 1024 }
        );
        const output = stdout;

        const resultMatch = output.match(/SPARK_RESULT:(\[.*\])/);
        if (resultMatch) {
          const results = JSON.parse(resultMatch[1]);
          return "🔥 续火花: " + results.join(", ");
        }
        const errMatch = output.match(/SPARK_ERROR:(.+)/);
        if (errMatch) return "🔥 续火花失败: " + errMatch[1];
        return "🔥 续火花完成（无详细结果）";
      } catch (e: any) {
        if (e.message?.includes("SESSION_DEAD") || e.message?.includes("230301") || e.message?.includes("No active session")) {
          return "⚠️ 抖音会话不可用 (dy_monitor 未登录或离线)";
        }
        return "🔥 续火花执行失败: " + (e.message || String(e)).slice(0, 300);
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

/** 发送桌面原生通知（macOS: osascript / Windows: 写文件让心跳代理） */
async function sendDesktopNotification(title: string, subtitle: string) {
  try {
    if (process.platform === "darwin") {
      const { exec } = require("child_process");
      const { promisify } = require("util");
      const execAsync = promisify(exec);
      const safeTitle = title.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
      const safeBody = subtitle.slice(0, 150).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
      await execAsync(
        `osascript -e 'display alert "${safeBody}" as critical message title "${safeTitle}" buttons {"知道了"} default button "知道了" giving up after 300'`,
        { timeout: 5000 }
      );
      console.log("[scheduler] macOS 通知已弹");
    } else if (process.platform === "win32") {
      // Windows: 写文件让心跳代理（OpenClaw 有 GUI 权限）
      const fs = require("fs");
      const path = require("path");
      const dir = path.join(process.env.OPENCLAW_WORKSPACE || path.join(require("os").homedir(), ".openclaw", "workspace"), "sweetkiki");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "mac_notify.txt"),
        JSON.stringify({ title, body: subtitle.slice(0, 200), time: new Date().toISOString() }),
        "utf-8"
      );
      console.log("[scheduler] Windows 通知已写入文件");
    }
  } catch (e) {
    console.error("[scheduler] 通知失败:", e);
  }
}

/** 判断结果是否为致命错误（不应重试） */
function isFatalError(result: string): boolean {
  const fatalPatterns = [
    "未登录", "login_required", "登录过期", "会话过期", "SESSION_DEAD",
    "脚本未找到", "ENOENT", "未安装", "未配置", "API Key",
    "余额不足", "insufficient", "quota", "预扣费额度失败", "余额不足"
  ];
  return fatalPatterns.some((p) => result.includes(p));
}

/** 判断是否为登录类错误 */
function isLoginError(result: string): boolean {
  return result.includes("未登录") || result.includes("login_required") || result.includes("登录过期") || result.includes("SESSION_DEAD") || result.includes("会话过期");
}

/** 根据任务类型推断平台和登录页 */
function getLoginAction(task: { name: string; actionType: string }): { platform: string; url: string } | null {
  const platformMap: Record<string, { platform: string; url: string }> = {
    publish_xhs: { platform: "小红书", url: "https://creator.xiaohongshu.com/login" },
    publish_douyin: { platform: "抖音", url: "https://creator.douyin.com" },
    spark_renew: { platform: "抖音", url: "https://creator.douyin.com" },
  };
  return platformMap[task.actionType] || null;
}

/** 登录失效时的处理：打开浏览器到登录页 + 写入微信通知 */
function handleLoginFailure(task: { name: string; actionType: string }) {
  const info = getLoginAction(task);
  if (!info) return;
  
  // 打开浏览器到登录页（仅 macOS）
  if (process.platform === "darwin") {
    try {
      const { exec } = require("child_process");
      exec(`open "${info.url}"`, { timeout: 5000 });
      console.log(`[scheduler] 已打开${info.platform}登录页: ${info.url}`);
    } catch (e) {
      console.error("[scheduler] 打开登录页失败:", e);
    }
  }
  
  // 写入提醒文件 → 下次心跳推送到微信
  try {
    const fs = require("fs");
    const path = require("path");
    const dir = path.join("/Users/wkk/.openclaw/workspace", "sweetkiki");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const msg = `⚠️ ${info.platform}登录已过期！\n${task.name} 定时任务因未登录失败。\n浏览器已自动打开登录页，请扫码或输入验证码登录。`;
    fs.writeFileSync(path.join(dir, "pending_reminder.txt"), msg, "utf-8");
  } catch { /* ignore */ }
}

/** 判断结果是否失败 */
/** 最大重试次数（首次失败后最多重试 N 次） */
const MAX_RETRIES = 1;

/** 从 task 读取今日重试计数 */
function getRetryState(task: ScheduledTask, todayKey: string): { count: number; isToday: boolean } {
  const retryDate = task.config._retryDate || '';
  const count = parseInt(task.config._retryCount || '0', 10);
  return { count, isToday: retryDate === todayKey };
}

/** 判断任务是否已超过今日重试上限 */
function isRetryExhausted(task: ScheduledTask, todayKey: string): boolean {
  const { count, isToday } = getRetryState(task, todayKey);
  return isToday && count > MAX_RETRIES;
}

/** 更新重试计数 */
function bumpRetryCount(task: ScheduledTask, todayKey: string): void {
  const { count, isToday } = getRetryState(task, todayKey);
  task.config._retryCount = String((isToday ? count : 0) + 1);
  task.config._retryDate = todayKey;
}

/** 清除重试计数 */
function clearRetryCount(task: ScheduledTask): void {
  delete task.config._retryCount;
  delete task.config._retryDate;
}

function isFailure(result: string): boolean {
  return result.includes("失败") || result.includes("错误") || result.startsWith("错误")
    || result.includes("异常") || result.includes("超时")
    || result.includes("未登录") || result.includes("login_required")
    || result.includes("登录过期");
}

/** 检查并执行到期任务 */
export async function GET() {
  // 🆕 互斥锁：防止并发执行（超时 20 分钟，覆盖多任务串行执行）
  if (fs.existsSync(SCHEDULER_LOCK_FILE)) {
    const lockAge = Date.now() - fs.statSync(SCHEDULER_LOCK_FILE).mtimeMs;
    if (lockAge < 1_200_000) { // 20 分钟锁，匹配 pollPublishJob 300s × N 任务
      console.log(`[scheduler] 跳过：调度器已在运行中 (lock age: ${Math.round(lockAge/1000)}s)`);
      return NextResponse.json({
        checked: new Date().toISOString(),
        executed: 0,
        message: "调度器正在运行中，跳过",
      });
    }
    // 锁超过 20 分钟视为异常过期，强制解除
    console.log(`[scheduler] 锁过期 (${Math.round(lockAge/1000)}s)，强制解除`);
    try { fs.unlinkSync(SCHEDULER_LOCK_FILE); } catch {}
  }
  // 获取锁
  try {
    const dir = path.dirname(SCHEDULER_LOCK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SCHEDULER_LOCK_FILE, JSON.stringify({ pid: process.pid, time: new Date().toISOString() }), "utf-8");
  } catch { /* 获取锁失败不阻塞 */ }

  try {
    return await runSchedulerCheck();
  } finally {
    // 释放锁
    try { fs.unlinkSync(SCHEDULER_LOCK_FILE); } catch {}
  }
}

async function runSchedulerCheck() {
  const now = new Date();
  const timeKey = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dayOfWeek = now.getDay();

  const tasks = await getDueTasks();
  const results: { id: string; name: string; result: string }[] = [];
  const notifications: string[] = [];

  const all = await getAllTasks();
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
    // 🆕 任务级互斥锁：同一任务不能并发执行
    if (runningTaskIds.has(task.id)) {
      console.log(`[scheduler] 跳过 ${task.name}: 正在执行中`);
      continue;
    }

    // 🆕 重试上限检查：超过今日重试次数 → 跳过并通知
    if (isRetryExhausted(task, todayKey)) {
      const { count } = getRetryState(task, todayKey);
      const msg = `⛔ 重试已达上限: ${task.name} 今日已失败 ${count} 次，停止重试`;
      console.log(`[scheduler] ${msg}`);
      task.lastResult = msg;
      task.lastRun = new Date().toISOString();
      await saveTask(task);
      results.push({ id: task.id, name: task.name, result: msg });
      // 🆕 重试用尽 → 强制通知（即使 noNotify=true）
      sendDesktopNotification(
        `⛔ ${task.name} — 重试用尽`,
        `今日已执行失败 ${count} 次，已停止重试。请手动检查。`
      );
      continue;
    }

    runningTaskIds.add(task.id);
    try {
      const result = await executeTask(task);
      task.lastResult = result;

      if (!isFailure(result)) {
        // 成功 → 设 lastRun + 清除重试计数
        task.lastRun = new Date().toISOString();
        clearRetryCount(task);
      } else if (isFatalError(result)) {
        // 致命错误（余额不足等）→ 立即停，不重试
        task.lastRun = new Date().toISOString();
        clearRetryCount(task);
      } else {
        // 可重试错误 → 累计重试次数
        bumpRetryCount(task, todayKey);
        const { count } = getRetryState(task, todayKey);
        if (count > MAX_RETRIES) {
          // 重试已达上限 → 停止
          task.lastRun = new Date().toISOString();
          console.log(`[scheduler] ${task.name} 重试用尽 (${count}次)，标记为完成`);
        }
        // 否则不设 lastRun，允许重试
      }
      await saveTask(task);
      results.push({ id: task.id, name: task.name, result });
      
      // 失败时弹 macOS 原生通知（除非任务禁用了通知）
      if (isFailure(result) && !task.config?.noNotify) {
        sendDesktopNotification(
          `❌ ${task.name}`,
          result.slice(0, 120)
        );
        // 登录失效：打开浏览器登录页 + 微信通知
        if (isLoginError(result)) {
          handleLoginFailure(task);
        }
      }
    } catch (e) {
      const err = String(e);
      // 累计重试
      bumpRetryCount(task, todayKey);
      const { count } = getRetryState(task, todayKey);
      if (count > MAX_RETRIES) {
        task.lastRun = new Date().toISOString();
        task.lastResult = `⛔ 重试用尽: ${err}`;
      } else {
        task.lastResult = `错误: ${err}`;
      }
      await saveTask(task);
      results.push({ id: task.id, name: task.name, result: task.lastResult });
      if (!task.config?.noNotify) sendDesktopNotification(`💥 ${task.name}`, err.slice(0, 120));
    } finally {
      runningTaskIds.delete(task.id);
    }
  }

  // 通知写入：将执行结果写入提醒文件，下次心跳推送到微信
  // 🔇 如果任务 config.noNotify=true，跳过通知
  const notifyResults = results.filter(r => {
    const task = all.find(t => t.id === r.id);
    const noNotify = task?.config?.noNotify;
    return !noNotify;
  });
  if (notifyResults.length > 0) {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const reminderDir = path.default.join("/Users/wkk/.openclaw/workspace", "sweetkiki");
      if (!fs.default.existsSync(reminderDir)) fs.default.mkdirSync(reminderDir, { recursive: true });
      const reminderFile = path.default.join(reminderDir, "pending_reminder.txt");
      const lines = notifyResults.map((r) => {
        const emoji = r.name.includes("火花") ? "🔥" : r.name.includes("发布") ? "📤" : "⏰";
        const failed = r.result?.includes("失败") || r.result?.includes("错误") || r.result?.startsWith("错误");
        const loginExpired = r.result?.includes("未登录") || r.result?.includes("login_required") || r.result?.includes("登录过期");
        
        if (loginExpired) {
          return `⚠️ ${r.name} — 登录已过期！\n浏览器已自动打开登录页，请尽快登录恢复定时任务。`;
        }
        const ok = failed ? "❌" : "✅";
        return `${emoji} ${r.name} ${ok}\n${r.result}`;
      });
      fs.default.writeFileSync(reminderFile, lines.join("\n\n") + "\n", "utf-8");
      console.log(`[scheduler] ${results.length} 条结果已写入提醒文件`);
    } catch (e) {
      console.error("[scheduler] 写入提醒文件失败:", e);
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
  const task = await getTask(taskId);
  if (!task) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  const result = await executeTask(task);
  task.lastResult = result;
  if (!isFailure(result)) {
    task.lastRun = new Date().toISOString();
  } else if (isFatalError(result)) {
    task.lastRun = new Date().toISOString();
  }
  await saveTask(task);

  // 登录失效：打开浏览器登录页
  if (isLoginError(result)) {
    handleLoginFailure(task);
  }

  return NextResponse.json({ success: true, result });
}
