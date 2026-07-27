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

// ── 安全参数解析（不经过 shell，避免 () 等特殊字符被 bash 误解析）──
function splitArgs(str) {
  const args = [];
  let cur = '', sq = false, dq = false;
  for (const ch of str) {
    if (sq) { if (ch === "'") sq = false; else cur += ch; }
    else if (dq) { if (ch === '"') dq = false; else cur += ch; }
    else if (ch === "'") sq = true;
    else if (ch === '"') dq = true;
    else if (ch === ' ') { if (cur) { args.push(cur); cur = ''; } }
    else cur += ch;
  }
  if (cur) args.push(cur);
  return args;
}

function bc(cmd, opts = {}) {
  const { spawnSync } = require('child_process');
  const subArgs = splitArgs(cmd);
  const allArgs = ['--session', CONFIG.session, ...subArgs];
  const label = cmd.length > 55 ? cmd.slice(0, 52) + '...' : cmd;
  console.log('  ▶ ' + label);
  try {
    const r = spawnSync('browser-act', allArgs, { encoding: 'utf8', timeout: 30000, maxBuffer: 10 * 1024 * 1024, ...opts });
    if (r.error) {
      if (opts.ignoreError) return '';
      throw r.error;
    }
    // browser-act eval 在非交互式上下文中可能输出 SyntaxError，但不影响实际执行结果
    // 只在非 ignoreError 模式下打印 stderr 中真正有用的行
    if (r.stderr) {
      const usefulStderr = r.stderr.split('\n')
        .filter(l => l.trim() && !/^Error \d+:/.test(l.trim()) && !/SyntaxError/.test(l))
        .join('\n').trim();
      if (usefulStderr) console.error(usefulStderr);
    }
    return r.stdout.trim();
  } catch (e) {
    if (opts.ignoreError) return '';
    throw e;
  }
}

function sleep(ms) { execSync('sleep ' + (ms / 1000).toFixed(1)); }
function bail(msg) { console.error('\n❌ ' + msg); try { bc('session close ' + CONFIG.session, { ignoreError: true }); } catch {} process.exit(1); }

function parseArgs() {
  const args = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].startsWith('--')) {
      const key = raw[i].slice(2);
      const val = raw[i + 1] && !raw[i + 1].startsWith('--') ? raw[i + 1] : 'true';
      if (key === 'image') {
        if (!args.image) args.image = [];
        args.image.push(val);
      } else {
        args[key] = val;
      }
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
  const isCat = /奶油|猫|喵|猫咪|英短|萌宠|宠物/.test(parsed.title + parsed.content);
  const catContext = isCat
    ? '【重要】图片主角必须是一只布偶猫（Ragdoll cat），蓝眼睛，灰白奶油色配色，卡通插画风格（cartoon illustration），不是真实照片。'
    : '';
  const style = isCat
    ? '卡通插画风，蓝眼睛灰白布偶猫，圆脸毛茸茸，奶油色配色，温暖小清新'
    : '干净、小清新、适合小红书审美';
  const imgPromptRaw = await callLLM(
    '你是一个AI图片提示词专家。将内容转化为英文图片生成prompt。只输出prompt本身，不要任何解释。',
    `${catContext}根据以下小红书笔记内容，生成一个AI封面图英文prompt。要求：
- 风格：${style}
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

async function publishXHS(title, content, tags, imagePaths) {
  if (!Array.isArray(imagePaths)) imagePaths = [imagePaths];
  console.log('🦐 开始发布到小红书');
  console.log('  标题: ' + title);
  console.log('  正文: ' + content.replace(/\n/g, '\\n').length + ' 字符');
  console.log('  标签: ' + (tags.join(', ') || '(无)'));
  console.log('  图片: ' + imagePaths.length + ' 张');

  // Step 0: 关闭上一轮残留的 session，保证每次发布都从干净状态开始
  try { bc('session close ' + CONFIG.session, { ignoreError: true }); } catch {}
  sleep(1000);

  // Step 1+2: 打开 + 登录（强制刷新页面，清除上一轮的残留状态）
  console.log('📂 打开发布页...');
  bc('browser open ' + CONFIG.browserId + ' "' + CONFIG.publishUrl + '?from=tab_switch&target=image"');
  sleep(5000);
  // 强制刷新确保页面干净
  bc('eval "location.reload()"', { ignoreError: true });
  sleep(3000);
  bc('wait stable');

  // 再次确认 URL
  let curUrl = bc('eval "window.location.href"');
  if (!curUrl.includes('target=image')) {
    console.log('  🔄 页面未加载 target=image，强制导航...');
    bc(`eval "location.href = '${CONFIG.publishUrl}?from=tab_switch&target=image'"`);
    sleep(5000);
    bc('wait stable');
  }

  console.log('🔐 检查登录...');
  curUrl = bc('eval "window.location.href"');
  if (curUrl.includes('/login') || curUrl.includes('/signin')) {
    console.log('[NEED_LOGIN] 请在浏览器窗口中扫码或验证码登录，登录后会自动继续...');
    console.log('[NEED_LOGIN] 等待中...（最多等待 5 分钟）');
    // 轮询等待用户登录
    for (let i = 0; i < 60; i++) {
      sleep(5000);
      try {
        curUrl = bc('eval "window.location.href"', { timeout: 10000 });
        if (!curUrl.includes('/login') && !curUrl.includes('/signin')) {
          console.log('  ✅ 已登录，继续发布...');
          break;
        }
      } catch { /* 继续等待 */ }
      if (i % 6 === 0) console.log('[NEED_LOGIN] 仍在等待登录... (' + Math.round((i + 1) * 5 / 60) + '分钟)');
    }
    // 重新检查
    curUrl = bc('eval "window.location.href"');
    if (curUrl.includes('/login') || curUrl.includes('/signin')) {
      bail('登录超时（5分钟），请先登录后再重试发布。');
    }
  }
  console.log('  ✅ 已登录');

  // Step 3: 切图文（检查是否已在正确 tab）
  console.log('🖼️  检查上传图文tab...');
  const tabOk = bc('eval "var t=[...document.querySelectorAll(\'.creator-tab\')].find(function(x){return x.textContent.includes(\'上传图文\')});return t?(t.classList.contains(\'active\')||t.classList.contains(\'selected\')?\'already_active\':(t.click(),\'clicked\')):\'no_tab\'"');
  console.log('  tab状态: ' + tabOk);
  if (tabOk === 'no_tab') {
    // 可能页面仍在加载，等待后重试
    sleep(5000);
    bc('eval "var t=[...document.querySelectorAll(\'.creator-tab\')].find(function(x){return x.textContent.includes(\'上传图文\')});if(t)t.click();else throw new Error(\'no tab\')"');
  }
  sleep(2000);
  bc('wait stable');

  // Step 4: 上传图片（CDP 多文件批量上传，无 file:// 跳转问题）
  console.log('📤 上传图片...');
  const uploadPaths = imagePaths.filter(p => fs.existsSync(path.resolve(p)));
  if (uploadPaths.length === 0) bail('没有可上传的图片');
  
  console.log('  📤 CDP 批量上传 ' + uploadPaths.length + ' 张图片...');
  
  // CDP port for Chrome (browser-act uses this port)
  // Auto-detect CDP port from Chrome processes
  let cdpPort = 62414; // fallback
  try {
    const portOut = execSync("lsof -iTCP -sTCP:LISTEN -P 2>/dev/null | grep 'Google' | sed -n 's/.*localhost:\\([0-9]*\\).*/\\1/p' | head -1 || echo 62414", { encoding: 'utf8', timeout: 5000 }).trim();
    if (portOut && /^\d+$/.test(portOut)) cdpPort = parseInt(portOut, 10);
  } catch (e) { /* keep fallback */ }
  console.log('  CDP port: ' + cdpPort);
  const helperPath = path.join(__dirname, 'cdp-multi-upload.cjs');
  
  // Build the command with all image paths
  const cdpArgs = [helperPath, String(cdpPort), 'input[type="file"]', ...uploadPaths.map(p => path.resolve(p))];
  const cdpCmd = 'node ' + cdpArgs.map(a => '"' + a + '"').join(' ');
  
  console.log('  ▶ node cdp-multi-upload.cjs ... ' + uploadPaths.length + ' files');
  try {
    const cdpOut = execSync(cdpCmd, { encoding: 'utf8', timeout: 30000 });
    console.log('  ✅ CDP 上传成功: ' + cdpOut.trim());
  } catch (e) {
    console.error('  CDP stderr: ' + ((e.stderr || e.message || '') + '').split('\n').slice(0, 3).join(' | '));
    bail('CDP 多文件上传失败');
  }
  
  sleep(3000);
  bc('wait stable --timeout 60000');

  // Step 4.5: 等待新UI加载表单（上传后React需要时间渲染）
  console.log('⏳ 等待表单加载...');
  for (let attempt = 0; attempt < 12; attempt++) {
    const check = bc('eval "JSON.stringify({inputs:document.querySelectorAll(\'input:not([type=file])\').length,ces:document.querySelectorAll(\'[contenteditable=true]\').length,textboxes:document.querySelectorAll(\'[role=textbox]\').length})"');
    try {
      const s = JSON.parse(check);
      if (s.inputs > 0 || s.ces > 0 || s.textboxes > 0) {
        console.log('  ✅ 表单已加载 (inputs=' + s.inputs + ' ces=' + s.ces + ' textboxes=' + s.textboxes + ')');
        break;
      }
    } catch {}
    if (attempt >= 11) {
      const fullState = bc('state --format text').replace(/\n/g, ' ');
      bail('表单未出现（已等待60秒）。State: ' + fullState.substring(0, 500));
    }
    console.log('  ⏳ 等待中... (' + ((attempt + 1) * 5) + 's)');
    sleep(5000);
  }

  // Step 5: 标题 — 用 eval 直接操作DOM（兼容新旧UI）
  console.log('✏️  填写标题...');
  const safeTitle = title.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const titleOk = bc('eval "' +
    'var i=document.querySelector(\'input[placeholder*=\\"标题\\"]\')' +
    '||document.querySelector(\'input[placeholder*=\\"添加\\"]\')' +
    '||document.querySelector(\'[contenteditable=true][aria-label*=\\"标题\\"]\')' +
    '||document.querySelector(\'[role=textbox]\');' +
    'if(!i)return\'NO_TITLE_INPUT\';' +
    'if(i.tagName===\'INPUT\'||i.tagName===\'TEXTAREA\'){i.value=\'' + safeTitle + '\';i.dispatchEvent(new Event(\'input\',{bubbles:true}));i.dispatchEvent(new Event(\'change\',{bubbles:true}));}' +
    'else{i.focus();i.textContent=\'' + safeTitle + '\';i.dispatchEvent(new Event(\'input\',{bubbles:true}));}' +
    'return\'OK:\'+i.tagName' +
  '"');
  if (titleOk === 'NO_TITLE_INPUT') bail('找不到标题输入框');
  console.log('  ✅ 标题已填写 (' + titleOk + ')');
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

  // 🛡️ dry-run: 只生成内容不发布
  if (args['dry-run'] || args.dryRun) {
    console.log('🧪 DRY-RUN 模式 — 只生成内容，不实际发布\n');
    if (args.topic && args.topic !== 'true') {
      const gen = await generateFromTopic(args.topic);
      console.log('📝 标题:', gen.title);
      console.log('📄 内容:', gen.content.slice(0, 200) + '...');
      console.log('🏷️ 标签:', gen.tags.join(' '));
      console.log('🎨 图提示:', gen.imagePrompt.slice(0, 100) + '...');
      console.log('\n✅ dry-run 完成，未实际发布');
    } else {
      console.log('✅ dry-run 完成');
    }
    process.exit(0);
  }

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
      await generateCover(gen.imagePrompt, imagePath);
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
        await generateCover(args.prompt, imagePath);
        console.log('');
      } catch (e) {
        bail(e.message);
      }
    } else {
      // args.image 现在是数组（多图）或单图
      const rawImages = Array.isArray(args.image) ? args.image : [args.image];
      imagePath = [];
      for (const img of rawImages) {
        const resolved = path.resolve(img);
        if (!fs.existsSync(resolved)) {
          console.log('  ⚠️  图片不存在，跳过: ' + img);
          continue;
        }
        imagePath.push(resolved);
      }
      if (imagePath.length === 0) bail('没有找到有效图片');
      console.log('🦐 小红书图文发布\n');
    }
  }

  // 🆕 追加品牌标签
  if (!tags.includes('奶油de日常')) {
    tags.push('奶油de日常');
  }

  // 发布
  await publishXHS(title, content, tags, imagePath);
}

main().catch(function(err) {
  console.error('\n💥 发布失败: ' + err.message);
  try { bc('session close ' + CONFIG.session); } catch {}
  process.exit(1);
});
