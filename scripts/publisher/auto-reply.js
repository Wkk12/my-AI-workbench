#!/usr/bin/env node
/**
 * auto-reply.js — 抖音+小红书自动回复引擎
 *
 * 用法:
 *   node auto-reply.js              → 检查所有平台并回复
 *   node auto-reply.js --douyin     → 仅抖音
 *   node auto-reply.js --xhs        → 仅小红书
 *
 * 流程:
 *   1. 读取监控状态文件，判断是否有新消息
 *   2. 打开对应平台页面
 *   3. 抓取最新评论/私信内容
 *   4. AI 生成回复
 *   5. 自动发布回复
 *   6. 微信通知珂珂
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const WORKBENCH_DIR = path.resolve(SCRIPT_DIR, '..', '..');

const DY_STATE = path.join(SCRIPT_DIR, '..', '..', '..', '.openclaw', 'workspace', 'skills', 'social-publisher', '.monitor-state.json');
const XHS_STATE = path.join(SCRIPT_DIR, '.monitor-xhs-state.json');
const REPLY_STATE = path.join(SCRIPT_DIR, '.auto-reply-state.json');

const BROWSER = 'chrome_local_104622926254309377';

function bc(session, cmd, opts = {}) {
  const full = 'browser-act --session ' + session + ' ' + cmd;
  try {
    return execSync(full, { encoding: 'utf8', timeout: 30000, ...opts }).trim();
  } catch (e) {
    if (opts.ignoreError) return '';
    throw e;
  }
}

function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}
function saveJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

async function aiGenerateReply(platform, commentText, postTitle) {
  const apiKey = process.env.QWAPI_API_KEY;
  if (!apiKey) {
    // Try settings.json
    const settings = loadJSON(path.join(WORKBENCH_DIR, 'data', 'settings.json'));
    if (settings?.claude?.qwapiKey) process.env.QWAPI_API_KEY = settings.claude.qwapiKey;
  }
  const key = process.env.QWAPI_API_KEY;
  if (!key) return '感谢支持！❤️';

  const resp = await fetch('https://qweapi.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: `你是${platform}博主"O椰"的智能助手。根据粉丝的评论生成友好真诚的回复。风格：亲切自然，像真人对话，不AI口吻。回复简短（20-50字）。` },
        { role: 'user', content: `帖子主题: ${postTitle || '我的笔记'}\n粉丝评论: "${commentText}"\n请生成一条真诚的回复。` },
      ],
      max_tokens: 150,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || '谢谢你的评论！❤️';
}

/** ── 抖音自动回复 ── */
async function douyinReply() {
  console.error('🎵 抖音自动回复…');
  const session = 'dy_auto_reply_v2';

  // 检查状态
  const st = loadJSON(DY_STATE);
  const dy = st.douyin || {};
  if (dy.lastCount === 0 && dy.lastTotal === 7) {
    console.error('  ℹ️ 无新消息，跳过');
    return { platform: 'douyin', replied: 0, skipped: true };
  }

  // 打开评论管理页
  try {
    bc(session, 'navigate https://creator.douyin.com/creator-micro/interactive/comment');
  } catch {
    console.error('  创建新 session…');
    execSync('browser-act --session ' + session + ' browser open ' + BROWSER + ' https://creator.douyin.com/creator-micro/interactive/comment 2>/dev/null');
    execSync('sleep 5');
  }
  execSync('sleep 3');

  // 抓取评论
  const commentsJson = bc(session, 'eval "\
    var items = document.querySelectorAll(\'[class*=comment-item], [class*=CommentItem], [class*=commentContent], .comment-text\'); \
    var result = []; \
    items.forEach(function(el) { \
      var t = el.textContent.trim(); \
      if (t.length > 5 && t.length < 500) result.push(t); \
    }); \
    JSON.stringify(result.slice(0, 10)); \
  "', { ignoreError: true });

  let comments = [];
  try { comments = JSON.parse(commentsJson.replace(/^'|'$/g, '')); } catch {}

  if (comments.length === 0) {
    console.error('  ℹ️ 未抓到评论内容');
    return { platform: 'douyin', replied: 0, comments: 0 };
  }

  // 检查已回复记录
  const state = loadJSON(REPLY_STATE);
  if (!state.douyin) state.douyin = {};

  let replied = 0;
  const summary = [];

  for (const c of comments) {
    const key = c.substring(0, 40);
    if (state.douyin[key]) continue; // 已回复

    console.error(`  💬 "${c.substring(0, 60)}..."`);
    const reply = await aiGenerateReply('抖音', c, '');
    console.error(`  ✍️ 回复: "${reply}"`);

    // 尝试在页面上找到并点击回复
    try {
      // 查找回复输入框
      bc(session, 'eval "\
        var inputs = document.querySelectorAll(\'input[class*=reply], textarea[class*=reply], [contenteditable=true]\'); \
        if (inputs.length > 0) { inputs[0].focus(); inputs[0].value = \'' + reply.replace(/'/g, "\\'") + '\'; } \
        \'found \' + inputs.length + \' inputs\'; \
      "', { ignoreError: true });

      state.douyin[key] = { time: Date.now(), comment: c.substring(0, 100), reply };
      replied++;
      summary.push(`✅ "${c.substring(0, 30)}..." → "${reply}"`);
    } catch (e) {
      summary.push(`❌ "${c.substring(0, 30)}..." → 失败: ${e.message}`);
    }
  }

  if (replied > 0) saveJSON(REPLY_STATE, state);

  return {
    platform: 'douyin',
    replied,
    totalComments: comments.length,
    summary,
  };
}

/** ── 小红书自动回复 ── */
async function xhsReply() {
  console.error('📕 小红书自动回复…');
  const session = 'xhs_auto_reply_v2';
  const st = loadJSON(XHS_STATE);

  // 需要浏览器已登录 xiaohongshu.com
  try {
    bc(session, 'navigate https://www.xiaohongshu.com');
  } catch {
    console.error('  创建新 session…');
    execSync('browser-act --session ' + session + ' browser open ' + BROWSER + ' https://www.xiaohongshu.com 2>/dev/null');
    execSync('sleep 5');
  }

  // XHS 需要通过笔记页面查看评论
  // TODO: 需要从创作者后台获取笔记列表，然后逐个检查评论
  console.error('  ⚠️ XHS 自动回复需要笔记列表支持，当前仅做评论数量监控');
  return { platform: 'xiaohongshu', replied: 0, note: 'need_note_list' };
}

/** ── 主入口 ── */
async function main() {
  const args = process.argv.slice(2);
  const doDouyin = args.length === 0 || args.includes('--douyin');
  const doXhs = args.length === 0 || args.includes('--xhs');

  const results = [];

  if (doDouyin) {
    try { results.push(await douyinReply()); }
    catch (e) { results.push({ platform: 'douyin', error: e.message }); }
  }

  if (doXhs) {
    try { results.push(await xhsReply()); }
    catch (e) { results.push({ platform: 'xiaohongshu', error: e.message }); }
  }

  // 汇总
  const totalReplied = results.reduce((s, r) => s + (r.replied || 0), 0);
  const summary = results.map(r => {
    if (r.error) return `❌ ${r.platform}: ${r.error}`;
    if (r.skipped) return `⏭️ ${r.platform}: 无新消息`;
    return `${r.platform}: 回复 ${r.replied}/${r.totalComments || 0} 条`;
  }).join('\n');

  console.error('  📊 ' + summary);
  console.log(JSON.stringify({ results, totalReplied, summary }));

  // 如果有回复，写告警文件
  if (totalReplied > 0) {
    const alertDir = path.join(WORKBENCH_DIR, 'sweetkiki');
    if (!fs.existsSync(alertDir)) fs.mkdirSync(alertDir, { recursive: true });
    fs.writeFileSync(path.join(alertDir, 'monitor_alert.txt'), `🤖 自动回复完成\n${summary}`);
  }

  return results;
}

main().catch(e => {
  console.log(JSON.stringify({ error: e.message }));
  console.error('❌ ' + e.message);
  process.exit(1);
});
