#!/usr/bin/env node
/**
 * 🔥 抖音自动续火花脚本 v3
 *
 * 每天自动给指定好友发送私信，保持火花不灭。
 * 复用 dy_monitor 的已有 session 和登录态，不创建新浏览器窗口。
 *
 * 用法:
 *   node scripts/auto-renew-spark.js                    # 正常执行
 *   node scripts/auto-renew-spark.js --dry-run           # 只检查，不发消息
 *   node scripts/auto-renew-spark.js --target "小明"     # 只给指定好友发
 *
 * 配置: data/spark-config.json
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ── 配置 ──
const CONFIG_PATH = path.join(process.cwd(), "data", "spark-config.json");
const STATE_PATH = path.join(process.cwd(), "data", "spark-state.json");
// 复用已有的抖音 monitor session（已登录，无需新建浏览器）
const SESSION = "dy_monitor";
const MESSAGE_URL =
  "https://creator.douyin.com/creator-micro/data/following/chat";

const DEFAULT_MESSAGES = [
  "早呀 ☀️",
  "今天天气不错～",
  "吃饭了吗",
  "哈哈哈",
  "👍🏼",
  "在干嘛呢",
  "今天好忙😂",
  "滴滴",
  "😴✨",
  "晚上好呀",
  "🌙 晚安",
  "🤔 想什么呢",
];

// ── 工具函数 ──

function ts() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function log(level, msg) {
  console.log(`[${ts()}] [${level}] ${msg}`);
}

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    return { targets: cfg.targets || [], messages: cfg.messages || DEFAULT_MESSAGES };
  }
  const tpl = { targets: [], messages: DEFAULT_MESSAGES, _comment: "在 targets 中填入好友昵称" };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(tpl, null, 2));
  return { targets: [], messages: DEFAULT_MESSAGES };
}

function loadState() {
  return fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) : {};
}

function saveState(state) {
  const keys = Object.keys(state).sort();
  keys.slice(0, -30).forEach((k) => delete state[k]);
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function pickMessage(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function ba(cmd, timeoutMs = 30000) {
  const full = `browser-act --session ${SESSION} ${cmd}`;
  log("CMD", full.slice(0, 150));
  try {
    return execSync(full, { encoding: "utf-8", timeout: timeoutMs, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (e) {
    const msg = ((e.stderr || e.stdout || e.message) + "").trim();
    // 尝试诊断 session 问题
    if (msg.includes("230301") || msg.includes("No active session")) {
      throw new Error(`SESSION_DEAD: dy_monitor 会话不可用，请确保 monitor cron 正在运行`);
    }
    throw new Error(msg.slice(0, 400));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 在 contenteditable 中输中文 */
function typeText(text) {
  const safe = text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const js = `
    (()=>{const d=document.querySelector('.chat-input-nSWBco');
    if(!d)return'NO_INPUT';d.focus();d.textContent='${safe}';
    d.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true}));
    d.dispatchEvent(new Event('change',{bubbles:true}));
    const b=document.querySelector('.chat-btn');
    return b&&!b.disabled?'BTN_READY':'BTN_DISABLED'})()`;
  return ba(`eval "${js}"`);
}

/** 把当前页面 URL 保存下来，完事后恢复 */
function saveCurrentPage() {
  try {
    const url = ba('eval "window.location.href"', 5000);
    return url;
  } catch {
    return "https://creator.douyin.com/";
  }
}

function restorePage(url) {
  try {
    ba(`navigate ${url}`);
  } catch {
    ba("navigate https://creator.douyin.com/");
  }
}

// ── 主流程 ──

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const targetFilter = args.includes("--target") ? args[args.indexOf("--target") + 1] : null;

  const config = loadConfig();
  const targets = targetFilter ? [targetFilter] : config.targets;
  if (!targets.length) {
    log("ERROR", "未配置目标好友");
    log("INFO", `编辑 ${CONFIG_PATH} 添加 targets, 或用 --target "昵称"`);
    process.exit(1);
  }

  const state = loadState();
  const today = new Date().toISOString().split("T")[0];
  if (state[today] && !dryRun) {
    log("WARN", `今日已执行, 跳过 → ${JSON.stringify(state[today].results)}`);
    process.exit(0);
  }

  log("INFO", `🔥 抖音续火花 — ${today}, ${targets.length}人`);
  if (dryRun) log("WARN", "DRY RUN: 不会实际发送");

  // ═══ 进入消息页 ═══
  const originalPage = saveCurrentPage();
  log("INFO", `原始页面: ${originalPage}`);

  ba(`navigate ${MESSAGE_URL}`);
  await sleep(4000);
  ba("wait stable");

  // 弹窗
  let st = ba("state");
  if (st.includes("稍后再看")) {
    const m = st.match(/\[(\d+)\].*稍后再看/);
    if (m) { ba(`click ${m[1]}`); await sleep(2000); ba("wait stable"); }
  }
  if (st.includes("星图消息")) {
    const m2 = st.match(/\[(\d+)\].*稍后再看/);
    if (m2) { ba(`click ${m2[1]}`); await sleep(2000); ba("wait stable"); }
  }

  const results = [];

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    log("INFO", `[${i + 1}/${targets.length}] ${target}`);

    try {
      st = ba("state");

      // ── 找联系人 ──
      const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\[([0-9]+)\\].*?item-header-name[^>]*>\\s*${escaped}`, "i");
      let m = st.match(re);

      for (let sc = 0; !m && sc < 5; sc++) {
        log("INFO", `  滚动 ${sc + 1}/5...`);
        ba(`eval "document.querySelector('[aria-label=grid]')?.scrollBy(0,350)"`);
        await sleep(1500);
        ba("wait stable");
        st = ba("state");
        m = st.match(re);
      }

      if (!m) {
        log("WARN", `  ⚠️ 未找到`);
        results.push({ target, status: "not_found" });
        continue;
      }

      // ── 打开对话 ──
      ba(`click ${m[1]}`);
      await sleep(3000);
      ba("wait stable");
      st = ba("state");

      const chatHasInput = st.includes("chat-input");
      const isGroup = st.includes("群成员") || st.includes("group");

      if (!chatHasInput || isGroup) {
        log("WARN", `  ⚠️ ${isGroup ? "群聊" : "无输入框"}, 跳过`);
        results.push({ target, status: isGroup ? "is_group" : "no_input" });
        ba("click 71"); // 返回全部列表
        await sleep(2000);
        ba("wait stable");
        continue;
      }

      // ── 发消息 ──
      const msg = pickMessage(config.messages);
      log("INFO", `  → "${msg}"`);

      if (dryRun) {
        results.push({ target, status: "dry_run", message: msg });
      } else {
        const ir = typeText(msg);
        log("INFO", `  输入: ${ir}`);
        await sleep(500);
        // 不管 BTN_READY 还是 BTN_DISABLED 都试 Enter
        ba("keys Enter");
        await sleep(2000);
        log("OK", `  ✅ 已发送: ${msg}`);
        results.push({ target, status: "sent", message: msg });
      }

      // 返回列表
      try { ba("click 71"); } catch { ba(`navigate ${MESSAGE_URL}`); }
      await sleep(2000);
      ba("wait stable");
    } catch (err) {
      log("ERROR", `  ❌ ${target}: ${err.message}`);
      results.push({ target, status: "error", error: err.message.slice(0, 200) });
      try { ba(`navigate ${MESSAGE_URL}`); await sleep(3000); ba("wait stable"); } catch {}
    }

    // 好友间随机延迟 3-8s
    if (i < targets.length - 1) {
      const d = 3000 + Math.random() * 5000;
      log("INFO", `  等 ${Math.round(d / 1000)}s...`);
      await sleep(d);
    }
  }

  // ═══ 恢复原始页面 ═══
  log("INFO", `恢复页面: ${originalPage}`);
  restorePage(originalPage);
  await sleep(2000);

  // ═══ 记录 ═══
  state[today] = { timestamp: new Date().toISOString(), dryRun, results };
  saveState(state);

  // dry_run 不算失败
  const ok = results.filter((r) => r.status === "sent" || r.status === "dry_run").length;
  const fail = results.filter((r) => r.status !== "sent" && r.status !== "dry_run").length;
  log(ok === results.length ? "DONE" : "WARN", `🔥 ${ok}/${results.length} 成功, ${fail} 失败`);

  if (fail) {
    results.filter((r) => r.status !== "sent").forEach((r) =>
      log("FAIL", `  ${r.target}: ${r.status} ${r.error || ""}`)
    );
  }

  console.log(JSON.stringify({ date: today, sent: ok, failed: fail, results }));
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  log("ERROR", e.message);
  process.exit(1);
});
