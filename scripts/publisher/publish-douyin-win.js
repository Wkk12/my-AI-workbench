#!/usr/bin/env node
/**
 * publish-douyin.js — 抖音图文一键发布（v2: 主题→文案→提示词→生图→发布全链路）
 *
 * 用法:
 *   # 全自动：只给主题
 *   node publish-douyin.js --topic "搞笑日常段子"
 *
 *   # 手动模式
 *   node publish-douyin.js --title "标题" --content "正文" --image ./cover.png --tags "搞笑,日常"
 *
 *   # AI生图模式
 *   node publish-douyin.js --title "标题" --content "正文" --prompt "生图描述" --tags "搞笑"
 *
 * 前置: Chrome 已登录 creator.douyin.com
 * 注意: 发布需短信验证码（脚本会交互等待）
 * 文本: DeepSeek API（LLM Key 环境变量）
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');
const { generateCover } = require('./generate-cover');

function getBrowserId() {
  if (process.env.BROWSER_ID) return process.env.BROWSER_ID;
  try {
    const idFile = path.join(__dirname, '..', '..', 'data', 'browser-id.json');
    return JSON.parse(fs.readFileSync(idFile, 'utf8')).browserId || '';
  } catch { return ''; }
}

// ── 配置 ──
const CONFIG = {
  session: 'dy_persist',  // 固定会话名，cookie/localStorage 跨次复用 → 免二次验证
  browserId: getBrowserId(),
  publishUrl: 'https://creator.douyin.com/creator-micro/content/upload?default-tab=3',
  titleMax: 55,
  // 模型 fallback 列表（qweapi 可用模型）
  modelFallback: ['deepseek-v3.2', 'deepseek-chat', 'gpt-4o-mini'],
};

// ── 工具函数 ──

function bc(cmd, opts = {}) {
  const full = 'browser-act --session ' + CONFIG.session + ' ' + cmd;
  const label = cmd.length > 55 ? cmd.slice(0, 52) + '...' : cmd;
  console.log('  ▶ ' + label);
  try {
    return execSync(full, { encoding: 'utf8', timeout: 30000, maxBuffer: 10 * 1024 * 1024, ...opts }).trim();
  } catch (e) {
    if (opts.ignoreError) return '';
    throw e;
  }
}

function sleep(ms) { execSync('sleep ' + (ms / 1000).toFixed(1)); }
function bail(msg) { console.error('\n❌ ' + msg); process.exit(1); }

function parseArgs() {
  const args = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].startsWith('--')) {
      const key = raw[i].slice(2);
      const val = raw[i + 1] && !raw[i + 1].startsWith('--') ? raw[i + 1] : 'true';
      args[key] = val;
      if (val !== 'true') i++;
    }
  }
  return args;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(function(resolve) {
    rl.question(question, function(ans) { rl.close(); resolve(ans.trim()); });
  });
}

function getLLMConfig() {
  // 优先 qweapi（一个 Key 通吃文本+生图）
  const qk = process.env.QWAPI_API_KEY;
  if (qk) return { baseUrl: 'https://qweapi.com/v1', apiKey: qk, models: CONFIG.modelFallback };
  // DeepSeek 官方
  if (process.env.DEEPSEEK_API_KEY) return { baseUrl: 'https://api.deepseek.com/v1', apiKey: process.env.DEEPSEEK_API_KEY, models: ['deepseek-chat'] };
  // OpenAI
  if (process.env.OPENAI_API_KEY) return { baseUrl: 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY, models: ['gpt-4o-mini'] };
  return null;
}

async function callLLM(systemPrompt, userMessage) {
  const cfg = getLLMConfig();
  if (!cfg) bail('缺少 QWAPI_API_KEY 或 DEEPSEEK_API_KEY。\n  注册: https://qweapi.com → export QWAPI_API_KEY=***');

  // 自动 fallback：顺次尝试模型列表
  let lastErr = null;
  for (const model of cfg.models) {
    try {
      const resp = await fetch(cfg.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], temperature: 0.8, max_tokens: 2000 }),
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) {
        const err = await resp.text();
        if (resp.status === 404 || err.includes('model')) { lastErr = err; continue; }
        throw new Error('LLM ' + resp.status + ': ' + err.slice(0, 200));
      }
      const data = await resp.json();
      return data.choices[0].message.content;
    } catch (e) {
      if (e.message.startsWith('LLM ')) throw e;
      lastErr = e;
      continue;
    }
  }
  throw new Error('所有模型 fallback 均失败: ' + (lastErr ? lastErr.message || lastErr : 'unknown'));
}

async function generateFromTopic(topic) {
  console.log('🧠 主题 → 抖音文案...\n  主题: ' + topic + '\n');

  const contentPrompt = `你是抖音爆款文案写手。根据主题生成抖音图文笔记内容。

要求：
1. 标题：55字以内，简洁有吸引力
2. 正文：短小精悍，每段1-2句，口语化，加适当emoji
3. 标签：3-5个话题标签

严格只输出JSON：
{"title":"标题","content":"正文(用\\n分隔)","tags":"tag1,tag2,tag3"}

主题：${topic}`;

  const raw = await callLLM('你是抖音内容创作助手。只输出JSON。', contentPrompt);
  let parsed;
  try {
    const js = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    parsed = JSON.parse(js);
  } catch {
    const tm = raw.match(/"title"\s*:\s*"([^"]+)"/);
    const cm = raw.match(/"content"\s*:\s*"([^"]+)"/);
    const gm = raw.match(/"tags"\s*:\s*"([^"]+)"/);
    if (!tm || !cm) { console.error('LLM 返回:', raw.slice(0, 300)); bail('文案生成失败'); }
    parsed = { title: tm[1], content: cm[1], tags: gm ? gm[1] : '' };
  }

  console.log('  ✅ 标题: ' + parsed.title);
  console.log('  ✅ 正文: ' + parsed.content.length + ' 字符\n');

  console.log('🧠 文案 → 生图提示词...');
  const ipr = await callLLM(
    '你是图片提示词专家。只输出英文prompt，不要解释。',
    `根据以下抖音内容生成竖版封面图英文prompt，风格：适合抖音的醒目、冲击力强的设计风格。150字符以内。\n\n${parsed.content}`
  );
  console.log('  ✅ 提示词: ' + ipr.trim().slice(0, 80) + '\n');

  return {
    title: parsed.title.slice(0, CONFIG.titleMax),
    content: parsed.content.replace(/\\n/g, '\n'),
    tags: (parsed.tags || '').split(',').map(t => t.trim().replace(/^#+/, '')).filter(Boolean),
    imagePrompt: ipr.trim(),
  };
}

// 模拟真实鼠标点击（Douyin React 弹窗用 MouseEvent 才认）
function realClickEval(selector) {
  return 'eval "var el=' + selector + ';if(!el)throw new Error(\'not found\');[' +
    '\'mousedown\',\'mouseup\',\'click\'].forEach(function(t){' +
    'el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window}))' +
    '})" 2>&1';
}

async function handleSmsVerify() {
  console.log('📱 短信验证...');
  // 用 MouseEvent 点击「获取验证码」（React 弹窗只认完整鼠标事件链）
  bc('eval "var ps=[...document.querySelectorAll(\'p\')];var b=ps.find(function(x){return x.textContent.includes(\'获取\')&&x.textContent.includes(\'验证码\')});if(!b)throw new Error(\'no sms btn\');[\'mousedown\',\'mouseup\',\'click\'].forEach(function(t){b.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window}))})"', { ignoreError: true });
  sleep(2000);
  const code = await ask('📲 输入验证码: ');
  bc('eval "var i=document.querySelector(\'input[placeholder*=\\\"验证码\\\"]\')||document.querySelectorAll(\'input[type=number]\')[0];if(i){i.value=\'\';i.dispatchEvent(new Event(\'input\',{bubbles:true}))}"', { ignoreError: true });
  sleep(300);
  bc('keys "' + code + '"');
  sleep(500);
  // 用 MouseEvent 点击「验证」按钮
  bc('eval "var ds=[...document.querySelectorAll(\'div\')];var v=ds.find(function(x){return x.textContent.trim()===\'验证\'&&x.className.includes(\'primary\')});if(!v)throw new Error(\'no verify btn\');[\'mousedown\',\'mouseup\',\'click\'].forEach(function(t){v.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window}))})"', { ignoreError: true });
  sleep(8000);
}

async function checkSmsDialog() {
  const s = bc('state --format text', { ignoreError: true });
  return s.includes('接收短信验证码');
}

// ── 发布 ──

async function publishDY(title, content, tags, imagePath) {
  console.log('🎵 开始发布到抖音');
  console.log('  标题: ' + title);
  console.log('  正文: ' + content.replace(/\n/g, '\\n').length + ' 字符');
  console.log('  标签: ' + (tags.join(', ') || '(无)'));
  console.log('  图片: ' + imagePath + '\n');

  console.log('📂 打开发布页...');
  bc('browser open ' + CONFIG.browserId + ' "' + CONFIG.publishUrl + '" --headed');
  sleep(5000);
  bc('wait stable');

  console.log('🔐 检查登录状态...');
  let curUrl = bc('eval "window.location.href"');
  if (curUrl.includes('/upload') || curUrl.includes('/content')) {
    console.log('  ✅ 已登录');
  } else if (curUrl.includes('/login') || curUrl.includes('/signin')) {
    console.log('[NEED_LOGIN] 请在浏览器窗口中扫码或验证码登录，登录后会自动继续...');
    console.log('[NEED_LOGIN] 等待中...（最多等待 5 分钟）');
    for (let i = 0; i < 60; i++) {
      sleep(5000);
      try {
        curUrl = bc('eval "window.location.href"', { timeout: 10000 });
        if (!curUrl.includes('/login') && !curUrl.includes('/signin')) {
          console.log('  ✅ 已登录，继续发布...');
          break;
        }
      } catch { /* continue */ }
      if (i % 6 === 0) console.log('[NEED_LOGIN] 仍在等待登录... (' + Math.round((i + 1) * 5 / 60) + '分钟)');
    }
    curUrl = bc('eval "window.location.href"');
    if (curUrl.includes('/login') || curUrl.includes('/signin')) {
      bail('登录超时（5分钟），请先登录后再重试发布。');
    }
  } else {
    // 可能需要验证或其他情况
    const pgState = bc('state --format text');
    if (pgState.includes('身份验证')) {
      console.log('  🪪 刷脸验证中...');
      bc('eval "var items=[...document.querySelectorAll(\'[class*=\\\"uc_verification\\\"]\')];var f=items.find(function(x){return x.textContent.includes(\'刷脸\')});if(f)f.click()"', { ignoreError: true });
      sleep(3000);
      console.log('[NEED_LOGIN] 请在手机上完成刷脸验证...');
      sleep(5000);
      bc('wait stable');
      curUrl = bc('eval "window.location.href"');
    }
    // 导航到图文发布页
    if (curUrl.includes('/home') || !curUrl.includes('/upload')) {
      console.log('  🧭 导航到图文发布页...');
      bc('eval "var bs=[...document.querySelectorAll(\'[class*=\\\"btn-OkpBsP\\\"]\')];var b=bs.find(function(x){return x.querySelector(\'.title-HvY9Az\')&&x.querySelector(\'.title-HvY9Az\').textContent.includes(\'图文\')});if(b)b.click()"', { ignoreError: true });
      sleep(3000);
      bc('wait stable');
    }
  }

  console.log('📤 上传图片 (Win)...');
  const so = bc('state --format text');
  const um = so.match(/\[(\d+)\][^\[]*button[^>]*上传/) || so.match(/\[(\d+)\][^\[]*container-drag/) || so.match(/\[(\d+)\]\s*<div[^>]*上传/);
  if (!um) bail('找不到上传按钮');
  bc('upload ' + um[1] + ' "' + imagePath + '"');
  sleep(5000);
  bc('wait stable --timeout 60000');
  sleep(3000);
  bc('wait stable');

  // Win: 检查是否需要回到发布页
  let postUrl2 = bc('eval "window.location.href"');
  if (!postUrl2.includes('/upload') && !postUrl2.includes('/content')) {
    console.log('  🔄 导航回发布页...');
    bc('navigate "' + CONFIG.publishUrl + '"');
    sleep(3000);
    bc('wait stable --timeout 30000');
  }

  console.log('✏️  填写标题 (Win)...');
  bc('eval "var i=document.querySelector(\'input[placeholder*=\\\"标题\\\"]\')||document.querySelector(\'input[placeholder*=\\\"作品\\\"]\')||document.querySelector(\'[class*=\\\"title\\\"] input\');if(!i)throw new Error(\'no title\');i.value=\'' + title.replace(/'/g, "\\'") + '\';i.dispatchEvent(new Event(\'input\',{bubbles:true}));i.dispatchEvent(new Event(\'change\',{bubbles:true}))"');
  sleep(500);

  console.log('📝 填写正文...');
  // 抖音用 Slate.js 编辑器 — execCommand('selectAll') + insertText 才触发内部状态更新
  const scJson = JSON.stringify(content);
  bc('eval "window.__dyContent = ' + scJson.replace(/"/g, '\\"') + '"', { ignoreError: true });
  bc('eval "' +
    'var ed=document.querySelector(\'[class*=\\\"zone-container\\\"][contenteditable]\');' +
    'if(!ed)throw new Error(\'no editor\');' +
    'ed.focus();' +
    'document.execCommand(\'selectAll\',false,null);' +
    'document.execCommand(\'insertText\',false,window.__dyContent);' +
    'ed.dispatchEvent(new Event(\'input\',{bubbles:true}));' +
    'ed.dispatchEvent(new Event(\'blur\',{bubbles:true}));' +
  '"');
  sleep(2000);

  if (tags.length > 0) {
    console.log('🏷️  添加标签...');
    const tt = ' ' + tags.map(function(t) { return '#' + t; }).join(' ');
    bc('eval "document.execCommand(\'insertText\',false,\'' + tt + '\')"');
    sleep(1000);
    bc('keys "Escape"', { ignoreError: true });
    sleep(500);
  }

  console.log('🚀 发布...');
  bc('eval "window.scrollTo(0,document.body.scrollHeight)"');
  sleep(1000);
  // 用 MouseEvent 点击发布按钮（Douyin React 需要完整鼠标事件链）
  bc('eval "var bs=[...document.querySelectorAll(\'button\')];var p=bs.find(function(b){var r=b.getBoundingClientRect();return b.textContent.trim()===\'发布\'&&r.bottom>window.innerHeight-150});if(!p)throw new Error(\'no publish btn\');[\'mousedown\',\'mouseup\',\'click\'].forEach(function(t){p.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window}))})"');
  sleep(5000);

  let needsSms = await checkSmsDialog();
  while (needsSms) {
    await handleSmsVerify();
    sleep(5000);
    bc('wait stable');
    needsSms = await checkSmsDialog();
  }

  const fu = bc('eval "window.location.href"');
  if (fu.includes('/manage') || fu.includes('enter_from=publish')) {
    console.log('\n🎉 发布成功！');
  } else {
    console.log('\n✅ 流程结束，当前: ' + fu);
  }

  bc('session close ' + CONFIG.session);
}

// ── 主入口 ──

async function main() {
  const args = parseArgs();

  let title, content, tags, imagePath;

  if (args.topic && args.topic !== 'true') {
    console.log('🎵 抖音全自动发布 v2\n📡 模式: 全自动（主题→文案→生图→发布）\n');
    const gen = await generateFromTopic(args.topic);
    title = gen.title;
    content = gen.content;
    tags = gen.tags;

    console.log('🎨 AI 生成封面图...');
    imagePath = path.join(os.tmpdir(), 'dy_cover_' + Date.now() + '.png');
    try { await generateCover(gen.imagePrompt, imagePath, { size: '1024x1536' }); console.log(''); }
    catch (e) { bail(e.message); }
  } else {
    if (!args.title) bail('缺少 --title（或使用 --topic 全自动模式）');
    if (!args.content) bail('缺少 --content');
    if (!args.image && !args.prompt) bail('缺少 --image 或 --prompt');

    title = args.title.slice(0, CONFIG.titleMax);
    content = args.content.replace(/\\n/g, '\n');
    tags = (args.tags || '').split(',').map(t => t.trim()).filter(Boolean);

    if (args.prompt && !args.image) {
      console.log('🎵 抖音图文发布\n🎨 AI 生成封面图...');
      imagePath = path.join(os.tmpdir(), 'dy_cover_' + Date.now() + '.png');
      try { await generateCover(args.prompt, imagePath, { size: '1024x1536' }); console.log(''); }
      catch (e) { bail(e.message); }
    } else {
      imagePath = path.resolve(args.image);
      if (!fs.existsSync(imagePath)) bail('图片不存在: ' + imagePath);
      console.log('🎵 抖音图文发布\n');
    }
  }

  await publishDY(title, content, tags, imagePath);
}

main().catch(function(err) {
  console.error('\n💥 失败: ' + err.message);
  try { bc('session close ' + CONFIG.session); } catch {}
  process.exit(1);
});
