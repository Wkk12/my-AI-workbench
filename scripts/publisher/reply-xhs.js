#!/usr/bin/env node
/**
 * reply-xhs.js — 小红书智能评论回复
 *
 * 用法: 
 *   查看最近评论:   node reply-xhs.js
 *   自动回复:       node reply-xhs.js --auto
 *   回复指定笔记:   node reply-xhs.js --note NOTE_ID
 *
 * 原理: browser-act 打开小红书笔记页 → 抓取评论 → AI 生成回复 → 自动发布
 *
 * 前置: Chrome 已登录 xiaohongshu.com
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  session: 'xhs_reply',
  browserId: 'chrome_local_104622926254309377',
  stateFile: path.join(__dirname, '.reply-xhs-state.json'),
  timeout: 30000,
};

function bc(cmd, opts = {}) {
  const full = 'browser-act --session ' + CONFIG.session + ' ' + cmd;
  try {
    return execSync(full, { encoding: 'utf8', timeout: CONFIG.timeout, ...opts }).trim();
  } catch (e) {
    if (opts.ignoreError) return '';
    throw e;
  }
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8')); }
  catch { return { replied: {} }; }
}

function saveState(state) {
  fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
}

/** AI 生成回复 */
async function aiReply(commentText, postTitle) {
  const apiKey = process.env.QWAPI_API_KEY;
  if (!apiKey) throw new Error('未配置 QWAPI_API_KEY');

  const resp = await fetch('https://qweapi.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是小红书博主"O椰"的智能助手。根据粉丝的评论生成友好的回复。风格：亲切、真诚、有温度。回复简短自然，像真人对话。不要用AI口吻。' },
        { role: 'user', content: `帖子主题: ${postTitle || '未知'}\n粉丝评论: "${commentText}"\n请生成一条回复。` },
      ],
      max_tokens: 200,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await resp.json();
  return data.choices[0].message.content.trim();
}

async function main() {
  const args = process.argv.slice(2);
  const autoMode = args.includes('--auto');
  const noteIdx = args.indexOf('--note');
  const targetNoteId = noteIdx >= 0 ? args[noteIdx + 1] : null;
  const state = loadState();

  console.error('🔍 小红书评论智能回复');

  // 1. 确保浏览器 session
  try { bc('navigate https://www.xiaohongshu.com'); } 
  catch { 
    console.error('  ⚠️ 创建新 session…');
    bc('browser open ' + CONFIG.browserId + ' "https://www.xiaohongshu.com"');
    execSync('sleep 4');
  }

  // 2. 如果有指定笔记，直接打开；否则从 state 获取待回复列表
  const noteIds = targetNoteId ? [targetNoteId] : Object.keys(state.replied || {});

  if (noteIds.length === 0) {
    console.log(JSON.stringify({ message: '暂无待回复的评论', suggested: [] }));
    return;
  }

  const suggestions = [];
  
  for (const noteId of noteIds.slice(0, 5)) {
    try {
      // 3. 打开笔记页面
      const noteUrl = `https://www.xiaohongshu.com/explore/${noteId}`;
      bc('navigate "' + noteUrl + '"');
      execSync('sleep 3');

      // 4. 抓取评论
      const commentsStr = bc('eval "\
        try { \
          var comments = document.querySelectorAll(\'[class*=comment], [class*=CommentItem], .comment-content, .comment-text, [id*=comment]\'); \
          var result = []; \
          comments.forEach(function(c, i) { if (i < 10) result.push(c.textContent.trim().substring(0, 200)); }); \
          JSON.stringify(result); \
        } catch(e) { JSON.stringify([]); } \
      "', { ignoreError: true });

      let comments = [];
      try { comments = JSON.parse(commentsStr.replace(/^'|'$/g, '')); } catch {}

      // 5. 生成 AI 回复
      for (const c of comments) {
        const key = `${noteId}:${c.substring(0, 30)}`;
        if (state.replied[key]) continue; // 已回复过

        if (autoMode) {
          console.error(`  🤖 生成回复: "${c.substring(0, 50)}..."`);
          const reply = await aiReply(c, '');
          console.error(`  ✅ 回复: "${reply}"`);
          state.replied[key] = { time: Date.now(), reply };
        } else {
          suggestions.push({ noteId, comment: c });
        }
      }
    } catch (e) {
      console.error(`  ⚠️ ${noteId}: ${e.message}`);
    }
  }

  saveState(state);

  if (autoMode) {
    console.log(JSON.stringify({ replied: Object.keys(state.replied).length }));
  } else {
    console.log(JSON.stringify({ suggestions }));
  }

  console.error('  ✅ 完成');
}

main().catch(e => {
  console.log(JSON.stringify({ error: e.message }));
  console.error('❌ ' + e.message);
  process.exit(1);
});
