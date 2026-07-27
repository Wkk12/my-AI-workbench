#!/usr/bin/env node
/**
 * 🐱 奶油小红书晚间复盘脚本
 * 功能：复盘今日发布 → AI分析 → 生成明日3条主题 → 更新定时任务
 * 触发：每日 22:00 OpenClaw cron
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const WORKBENCH_DB = "/Users/wkk/Desktop/my-AI-workbench/dev.db";
const WORKBENCH_API = "http://localhost:3000";
const QWAPI_BASE = "https://qweapi.com/v1";

// 从工作台 settings 读取 API key
function getQwapiKey() {
  try {
    const settings = execSync(
      `sqlite3 "${WORKBENCH_DB}" "SELECT value FROM Setting WHERE key='settings';"`,
      { encoding: "utf8", timeout: 5000 }
    ).trim();
    const data = JSON.parse(settings);
    return data?.claude?.qwapiKey || process.env.QWAPI_API_KEY || "";
  } catch {
    return process.env.QWAPI_API_KEY || "";
  }
}

// ── AI 文本生成 ──
async function aiChat(system, user) {
  const models = ["deepseek-v3.2", "deepseek-chat", "gpt-4o-mini"];
  const apiKey = getQwapiKey();
  if (!apiKey) {
    console.error("❌ 未找到 QWAPI_API_KEY");
    return null;
  }
  for (const model of models) {
      try {
        const resp = await fetch(`${QWAPI_BASE}/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user }
            ],
            max_tokens: 2000,
            temperature: 0.8
          }),
          signal: AbortSignal.timeout(30000)
        });
        if (!resp.ok) continue;
        const data = await resp.json();
        return data.choices[0].message.content.trim();
      } catch {}
    }
  return null;
}

// ── 读今日发布记录 ──
function getTodayResults() {
  try {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
    // 用换行符分隔行，取 lastResult 的前80字符避免 | 干扰
    const result = execSync(
      `sqlite3 -separator $'\\t' "${WORKBENCH_DB}" "SELECT name, schedule, substr(lastResult,1,200), lastRun FROM ScheduledTask WHERE actionType='publish_xhs' AND enabled=1 AND lastRun LIKE '${dateStr}%' ORDER BY schedule;"`,
      { encoding: "utf8", timeout: 5000 }
    ).trim();
    
    if (!result) return [];
    return result.split("\n").map(line => {
      const parts = line.split("\t");
      return { name: parts[0], schedule: parts[1], result: (parts[2] || "").replace(/\n/g, " "), time: parts[3] || "" };
    });
  } catch {
    return [];
  }
}

// ── 获取奶油账号 ID ──
function getCreamTaskIds() {
  try {
    const result = execSync(
      `sqlite3 -separator $'\\t' "${WORKBENCH_DB}" "SELECT id, name FROM ScheduledTask WHERE actionType='publish_xhs' AND enabled=1 AND (name LIKE '%奶油%' OR name LIKE '%养猫%' OR name LIKE '%猫咪%') ORDER BY schedule;"`,
      { encoding: "utf8", timeout: 5000 }
    ).trim();
    if (!result) return [];
    return result.split("\n").map(line => {
      const [id, name] = line.split("\t");
      return { id, name };
    });
  } catch {
    return [];
  }
}

// ── 通过 API 更新任务 topic ──
async function updateTaskTopic(taskId, name, topic) {
  try {
    const resp = await fetch(`${WORKBENCH_API}/api/scheduler`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: taskId,
        name,
        config: { topic, city: "北京", noNotify: true }
      })
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// 直接通过 SQLite 更新（API PUT可能不存在，兜底）
function updateTaskTopicSQL(taskId, topic) {
  try {
    const fs = require("fs");
    const config = JSON.stringify({ topic, city: "北京", noNotify: true });
    const safeConfig = config.replace(/'/g, "''");
    const safeId = taskId.replace(/'/g, "''");
    const sql = "UPDATE ScheduledTask SET config = '" + safeConfig + "' WHERE id = '" + safeId + "';";
    fs.writeFileSync("/tmp/_xhs_review_update.sql", sql);
    execSync(`sqlite3 "${WORKBENCH_DB}" < /tmp/_xhs_review_update.sql`, { encoding: "utf8", timeout: 5000 });
    return true;
  } catch(e) {
    console.error("  SQL更新失败:", e.message);
    return false;
  }
}

// ── 主流程 ──
async function main() {
  console.log("🌙 奶油小红书晚间复盘\n");
  console.log(`📅 ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}\n`);

  // 1. 获取今日发布结果
  const todayResults = getTodayResults();
  console.log("── 今日发布记录 ──");
  if (todayResults.length === 0) {
    console.log("  ⚠️ 今日无发布记录");
  } else {
    for (const r of todayResults) {
      const status = r.result?.includes("发布完成") ? "✅" : r.result?.includes("失败") ? "❌" : "⏳";
      console.log(`  ${status} ${r.schedule} ${r.name}`);
      if (r.result) {
        const short = r.result.slice(0, 150).replace(/\n/g, " ");
        console.log(`     ${short}...`);
      }
    }
  }

  // 2. 获取当前任务配置
  const tasks = getCreamTaskIds();
  console.log(`\n── 当前任务 ──`);
  for (const t of tasks) {
    console.log(`  📌 ${t.name}`);
  }

  if (tasks.length === 0) {
    console.log("  ⚠️ 未找到奶油相关任务");
    process.exit(0);
  }

  // 3. AI 分析今日表现 + 生成明日主题
  console.log("\n🧠 AI 分析今日表现并生成明日主题...\n");
  
  const todaySummary = todayResults.length > 0
    ? todayResults.map(r => `[${r.schedule}] ${r.name}: ${r.result?.slice(0, 200)}`).join("\n")
    : "今日无发布";

  const reviewPrompt = `你是小红书猫咪账号「奶油de日常」的运营专家。账号养了一只灰白色英短猫咪叫「奶油」，目前粉丝35，获赞118，处于起步阶段。

今日发布情况：
${todaySummary}

账号定位：治愈系英短猫咪日常，内容方向包括养猫干货、互动问答、猫猫日记。
发布时间策略：12:00 午休发干货（收藏型）、16:30 下午茶发互动（评论型）、21:00 黄金夜发日记（情感型）。

请完成以下任务：
1. 一针见血地指出今天的问题和改进方向（30字内）
2. 生成明天 3 条帖子的具体主题。要求：
   - 3条主题分别是：养猫干货(12:00)、互动问答(16:30)、奶油日记(21:00)
   - 每条主题要具体、有记忆点，不要泛泛
   - 结合当下热点/季节/节日（目前是7月盛夏）
   - 按时段匹配内容类型：中午干货要实用收藏向，下午互动要轻松评论向，晚上日记要温暖情感向
   - 风格治愈、温暖、接地气
   - 输出格式严格为JSON：
{
  "review": "今日复盘一句话",
  "problem": "核心问题一句话", 
  "topics": {
    "tips": "养猫干货类主题（12:00发布）",
    "qa": "互动问答类主题（16:30发布）",
    "diary": "奶油日记类主题（21:00发布）"
  }
}`;

  const aiResult = await aiChat(
    "你是专业的小红书猫咪账号运营专家。只输出合法JSON，不要任何额外文字。",
    reviewPrompt
  );

  if (!aiResult) {
    console.log("❌ AI 调用失败，保留当前主题不变");
    process.exit(1);
  }

  let plan;
  try {
    // 尝试提取 JSON
    const jsonMatch = aiResult.match(/\{[\s\S]*\}/);
    plan = JSON.parse(jsonMatch ? jsonMatch[0] : aiResult);
  } catch {
    console.log("❌ AI 返回格式错误，保留当前主题\n原始输出:", aiResult.slice(0, 300));
    process.exit(1);
  }

  console.log("📊 复盘:", plan.review || "无");
  console.log("⚠️ 问题:", plan.problem || "无");
  console.log("\n📝 明日主题:");
  const topicKeys = ["tips", "qa", "diary"];
  const topicLabels = ["📖 养猫干货(12:00)", "💬 互动问答(16:30)", "📓 奶油日记(21:00)"];
  
  for (let i = 0; i < 3; i++) {
    const key = topicKeys[i];
    const topic = plan.topics?.[key] || "";
    console.log(`  ${topicLabels[i]}: ${topic}`);
  }

  // 4. 更新定时任务
  console.log("\n🔄 更新定时任务...");
  let updated = 0;
  // 按 schedule 排序匹配：tips→12:00, qa→16:30, diary→21:00
  const sortedTasks = tasks.sort((a, b) => {
    const order = { tips: 0, qa: 1, diary: 2 };
    return (order[a._type] || 0) - (order[b._type] || 0);
  });
  for (let i = 0; i < Math.min(3, tasks.length); i++) {
    const topic = plan.topics?.[topicKeys[i]] || "";
    if (!topic) continue;
    // 按 schedule 找到对应时段的 task
    const targetTask = tasks.find(t => {
      const s = t.schedule;
      if (i === 0) return s === "12:00";
      if (i === 1) return s === "16:30";
      if (i === 2) return s === "21:00";
      return false;
    });
    if (!targetTask) { console.log(`  ⚠️ 未找到 ${topicLabels[i]} 对应的任务`); continue; }
    const ok = updateTaskTopicSQL(targetTask.id, topic);
    if (ok) {
      console.log(`  ✅ ${topicLabels[i]}`);
      updated++;
    } else {
      console.log(`  ❌ ${topicLabels[i]}`);
    }
  }

  // 5. 输出总结
  console.log(`\n${"=".repeat(40)}`);
  console.log(`✅ 复盘完成！更新了 ${updated}/3 条明日任务`);
  console.log(`📌 明日 12:00 / 16:30 / 21:00 定时发布`);
  console.log("=".repeat(40));
}

main().catch(e => {
  console.error("复盘脚本异常:", e.message);
  process.exit(1);
});
