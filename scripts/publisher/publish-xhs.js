#!/usr/bin/env node
/**
 * publish-xhs.js — 小红书图文一键发布（v2: 主题→文案→提示词→生图→发布全链路）
 *
 * 用法:
 *   # 全自动：只给主题
 *   node publish-xhs.js --topic "北京必吃美食推荐"
 *
 *   # 手动模式：自己提供所有内容
 *   node publish-xhs.js --title "标题" --content "正文" --image ./cover.png --tags "food,travel"
 *
 *   # AI生图模式：自己写文案，AI生图
 *   node publish-xhs.js --title "标题" --content "正文" --prompt "生图描述" --tags "food"
 *
 * 前置: Chrome 浏览器已登录 creator.xiaohongshu.com
 * AI: QWAPI_API_KEY 一个 Key 搞定文本+生图（qweapi.com）
 * 接口: qweapi.com（一个 Key 同时驱动文本+生图，生图需要代理 127.0.0.1:7890）
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
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
  session: 'xhs_' + Date.now().toString(36),
  browserId: getBrowserId(),
  publishUrl: 'https://creator.xiaohongshu.com/publish/publish',
  xhsTitleMax: 20,
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

// ── LLM 调用（qweapi 一个 Key 搞定文本+生图）──

function getLLMConfig() {
  // qweapi — 一个 Key 同时驱动文本模型和 gpt-image-2
  const qk = process.env.QWAPI_API_KEY;
  if (qk) return { baseUrl: 'https://qweapi.com/v1', apiKey: qk, models: ['deepseek-v3.2', 'deepseek-chat', 'gpt-4o-mini'] };
  // DeepSeek 官方
  if (process.env.DEEPSEEK_API_KEY) return { baseUrl: 'https://api.deepseek.com/v1', apiKey: process.env.DEEPSEEK_API_KEY, models: ['deepseek-chat'] };
  // OpenAI
  if (process.env.OPENAI_API_KEY) return { baseUrl: 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY, models: ['gpt-4o-mini'] };
  return null;
}

async function callLLM(systemPrompt, userMessage) {
  const cfg = getLLMConfig();
  if (!cfg) bail('缺少 QWAPI_API_KEY。\n  设置方法: export QWAPI_API_KEY=***\n  注册地址: https://qweapi.com');

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

// ── 内容生成 ──

async function generateFromTopic(topic) {
  console.log('🧠 主题 → 文案...');
  console.log('  主题: ' + topic + '\n');

  // Step 1: 生成标题+正文+标签
  const contentPrompt = `你是一个小红书爆款笔记写手。根据用户主题，生成小红书图文笔记的完整内容。

要求：
1. 标题：精炼吸睛，20字以内，带emoji
2. 正文：分段清晰(每段1-2句)，大量emoji，口语化，结尾带互动问题引导评论。正文总字数控制在200-300字。
3. 标签：3-5个，#号格式的话题标签

严格按以下JSON格式输出（只输出JSON，不要其他文字）：
{"title":"标题","content":"正文(用\\n分隔段落)","tags":"tag1,tag2,tag3"}

主题：${topic}`;

  const contentRaw = await callLLM(
    '你是一个专业的小红书内容创作助手。只输出JSON格式，不要解释。',
    contentPrompt
  );

  let parsed;
  try {
    // 清理可能的 markdown code fences
    const jsonStr = contentRaw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    // 尝试手动提取
    const titleM = contentRaw.match(/"title"\s*:\s*"([^"]+)"/);
    const contentM = contentRaw.match(/"content"\s*:\s*"([^"]+)"/);
    const tagsM = contentRaw.match(/"tags"\s*:\s*"([^"]+)"/);
    if (!titleM || !contentM) {
      console.error('LLM 返回格式异常:', contentRaw.slice(0, 300));
      bail('文案生成失败，请重试');
    }
    parsed = { title: titleM[1], content: contentM[1], tags: tagsM ? tagsM[1] : '' };
  }

  console.log('  ✅ 标题: ' + parsed.title);
  console.log('  ✅ 正文: ' + parsed.content.length + ' 字符');
  console.log('  ✅ 标签: ' + (parsed.tags || '(无)') + '\n');

  // Step 2: 根据正文生成图片 prompt
  console.log('🧠 文案 → 生图提示词...');
  const imgPromptRaw = await callLLM(
    '你是一个AI图片提示词专家。将内容转化为英文图片生成prompt。只输出prompt本身，不要任何解释。',
    `根据以下小红书笔记内容，生成一个AI封面图英文prompt。要求：
- 风格：干净、小清新、适合小红书审美
- 画面：竖版3:4比例，适合手机封面
- 颜色：温暖柔和
- 英文输出，不超过150字符

笔记内容：
${parsed.content}`
  );

  const imagePrompt = imgPromptRaw.trim();
  console.log('  ✅ 提示词: ' + imagePrompt.slice(0, 80) + (imagePrompt.length > 80 ? '...' : '') + '\n');

  return {
    title: parsed.title.slice(0, CONFIG.xhsTitleMax),
    content: parsed.content.replace(/\\n/g, '\n'),
    tags: (parsed.tags || '').split(',').map(t => t.trim().replace(/^#+/, '')).filter(Boolean),
    imagePrompt: imagePrompt,
  };
}

// ── 浏览器发布 ──

async function publishXHS(title, content, tags, imagePath) {
  console.log('🦐 开始发布到小红书');
  console.log('  标题: ' + title);
  console.log('  正文: ' + content.replace(/\n/g, '\\n').length + ' 字符');
  console.log('  标签: ' + (tags.join(', ') || '(无)'));
  console.log('  图片: ' + imagePath + '\n');

  // Step 1+2: 打开 + 登录
  console.log('📂 打开发布页...');
  bc('browser open ' + CONFIG.browserId + ' "' + CONFIG.publishUrl + '"');
  sleep(5000);
  bc('wait stable');

  console.log('🔐 检查登录...');
  const curUrl = bc('eval "window.location.href"');
  if (curUrl.includes('/login') || curUrl.includes('/signin')) {
    bail(
      '未登录！请运行:\n' +
      '  browser-act --session xhs_login browser open ' + CONFIG.browserId +
      ' "https://creator.xiaohongshu.com" --headed\n  在弹出窗口扫码/验证码登录后再试。'
    );
  }
  console.log('  ✅ 已登录');

  // Step 3: 切图文
  console.log('🖼️  切换上传图文...');
  bc('eval "var t=[...document.querySelectorAll(\'.creator-tab\')].find(function(x){return x.textContent.includes(\'上传图文\')});if(t)t.click()"');
  sleep(2000);
  bc('wait stable');

  // Step 4: 上传图片
  console.log('📤 上传图片...');
  const st = bc('state --format text').replace(/\n/g, ' ');
  let um = st.match(/\[(\d+)\][^\[]*button[^>]*>[^<]*上传图片/);
  if (!um) um = st.match(/\[(\d+)\]\s*<button[^>]*上传/);
  if (!um) bail('找不到上传按钮');
  bc('upload ' + um[1] + ' "' + imagePath + '"');
  sleep(3000);
  bc('wait stable --timeout 60000');

  // Step 5: 标题
  console.log('✏️  填写标题...');
  const safeTitle = title.replace(/'/g, "'\\''");
  const ts = bc('state --format text').replace(/\n/g, ' ');
  let tm = ts.match(/\[(\d+)\]\s*<input[^>]*placeholder[^>]*标题/);
  if (!tm) tm = ts.match(/\[(\d+)\]\s*<input[^>]*placeholder/);
  if (!tm) bail('找不到标题输入框。State: ' + ts.substring(0, 500));
  bc('input ' + tm[1] + ' "' + safeTitle + '"');
  sleep(500);

  // Step 6: 正文
  console.log('📝 填写正文...');
  const cf = path.join(os.tmpdir(), 'xhs_body_' + Date.now() + '.txt');
  fs.writeFileSync(cf, content, 'utf8');
  const raw = fs.readFileSync(cf, 'utf8');
  bc('eval "var c=decodeURIComponent(\'' + encodeURIComponent(raw) + '\');var ed=document.querySelector(\'.tiptap-container [contenteditable]\')||document.querySelector(\'[role=textbox][contenteditable]\');if(!ed)throw new Error(\'no editor\');ed.focus();ed.innerHTML=\'\';c.split(\'\\n\').forEach(function(l){var p=document.createElement(\'p\');p.textContent=l||\'\\u200B\';ed.appendChild(p)});ed.dispatchEvent(new Event(\'input\',{bubbles:true}))"');
  fs.unlinkSync(cf);
  sleep(1000);

  // Step 7: 标签
  if (tags.length > 0) {
    console.log('🏷️  添加标签...');
    let addedCount = 0;
    for (const tag of tags) {
      // 点击话题按钮打开话题面板
      bc('eval "var b=document.querySelector(\'#topicBtn\')||[...document.querySelectorAll(\'button\')].find(function(x){return x.textContent.includes(\'话题\')&&!x.textContent.includes(\'已添加\')});if(b)b.click()"');
      sleep(1500);
      // 输入标签关键词
      bc('keys "' + tag + '"');
      sleep(2500);
      // 尝试多种方式检测下拉列表是否出现
      const hs = bc('eval "(function(){var s=[\'#creator-editor-topic-container\',\'[class*=\\"topic\\"]\',\'[class*=\\"suggest\\"]\',\'[class*=\\"dropdown\\"]\'];for(var i=0;i<s.length;i++){var d=document.querySelector(s[i]);if(d&&d.offsetHeight>0)return true}return false})()"', { ignoreError: true });
      if (hs && hs.includes('true')) {
        bc('keys "Enter"');
        sleep(800);
        addedCount++;
      } else {
        // 兜底：直接按 Enter 试试
        bc('keys "Enter"', { ignoreError: true });
        sleep(500);
        addedCount++;
      }
      // 关闭话题面板残留，准备下一个标签
      bc('keys "Escape"', { ignoreError: true });
      sleep(400);
    }
    console.log('  ✅ 已添加 ' + addedCount + '/' + tags.length + ' 个标签');
  }

  // Step 8: 发布
  console.log('🚀 发布...');
  bc('eval "window.scrollTo(0,document.body.scrollHeight)"');
  sleep(1000);
  const ps = bc('state --format text');
  const pm = ps.match(/\[(\d+)\][^\]]*发布(?!笔记)/);
  if (!pm) bail('找不到发布按钮');
  bc('click ' + pm[1]);
  sleep(5000);

  const fu = bc('eval "window.location.href"');
  if (fu.includes('publish/success') || fu.includes('published=true') || fu.includes('/manage')) {
    console.log('\n🎉 发布成功！');
  } else {
    console.log('\n⚠️  发布状态待确认，当前: ' + fu);
  }

  bc('session close ' + CONFIG.session);
}

// ── 主入口 ──

async function main() {
  const args = parseArgs();

  let title, content, tags, imagePath;

  // ── 路径1: 全自动模式（--topic）────
  if (args.topic && args.topic !== 'true') {
    console.log('🦐 小红书全自动发布 v2\n');
    console.log('📡 模式: 全自动（主题→文案→生图→发布）\n');

    // 生成文案 + 图片提示词
    const gen = await generateFromTopic(args.topic);
    title = gen.title;
    content = gen.content;
    tags = gen.tags;

    // AI 生图（直连，不需要代理）
    console.log('🎨 AI 生成封面图...');
    imagePath = path.join(os.tmpdir(), 'xhs_cover_' + Date.now() + '.png');
    try {
      await generateCover(gen.imagePrompt, imagePath, { size: '1024x1536' });
      console.log('');
    } catch (e) {
      bail(e.message);
    }

  // ── 路径2: 手动模式 ────
  } else {
    if (!args.title) bail('缺少 --title 参数（或使用 --topic 全自动模式）');
    if (!args.content) bail('缺少 --content 参数');
    if (!args.image && !args.prompt) bail('缺少 --image 或 --prompt 参数');

    title = args.title.slice(0, CONFIG.xhsTitleMax);
    content = args.content.replace(/\\n/g, '\n');
    tags = (args.tags || '').split(',').map(t => t.trim()).filter(Boolean);

    if (args.prompt && !args.image) {
      console.log('🦐 小红书图文发布\n');
      console.log('🎨 AI 生成封面图...');
      imagePath = path.join(os.tmpdir(), 'xhs_cover_' + Date.now() + '.png');
      try {
        await generateCover(args.prompt, imagePath, { size: '1024x1536' });
        console.log('');
      } catch (e) {
        bail(e.message);
      }
    } else {
      imagePath = path.resolve(args.image);
      if (!fs.existsSync(imagePath)) bail('图片不存在: ' + imagePath);
      console.log('🦐 小红书图文发布\n');
    }
  }

  // 发布
  await publishXHS(title, content, tags, imagePath);
}

main().catch(function(err) {
  console.error('\n💥 发布失败: ' + err.message);
  try { bc('session close ' + CONFIG.session); } catch {}
  process.exit(1);
});
