#!/usr/bin/env node
/**
 * retouch-photo.cjs — AI 一键精修（原图尺寸输入输出）
 *
 * 用法:
 *   node retouch-photo.cjs --input ./photo.jpg
 *   node retouch-photo.cjs --input ./photo.jpg --style pro
 *   node retouch-photo.cjs --batch ./目录 --style natural
 *
 * 原理: gpt-image-2 图像编辑 → sips 缩放回原图尺寸
 * 力度: gentle(轻微) | natural(自然·默认) | pro(强力)
 * 依赖: QWAPI_API_KEY (从 ~/.hermes/.env 读取)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// ══════════════════════════════════════════════════════════════════
// 精修力度
// ══════════════════════════════════════════════════════════════════

const RETOUCH_INTENSITY = {
  gentle: { face_slim:'5%', dark_circles:'30%', teeth:'8%', skin:'light frequency separation, very subtle', contrast:'8%', vibrance:'5%', label:'轻微精修（自然感）' },
  natural: { face_slim:'10%', dark_circles:'70%', teeth:'15%', skin:'medium frequency separation, smooth but natural, cream-toned', contrast:'15%', vibrance:'10%', label:'自然精修（奶油肌）' },
  pro:     { face_slim:'15%', dark_circles:'90%', teeth:'25%', skin:'medium-high frequency separation, porcelain finish', contrast:'20%', vibrance:'15%', label:'强力精修（影楼级）' },
};

const EDIT_PROMPT = 'Apply professional portrait retouching to this photo. ' +
  'Skin: {SKIN}, reduce redness, soft matte finish. ' +
  'Face: slim jawline and cheeks by {FACE_SLIM}, tighten double chin, keep natural. ' +
  'Eyes: brighten, reduce dark circles by {DARK_CIRCLES}, enhance catchlight. ' +
  'Teeth: whiten by {TEETH}, keep natural. Lips: enhance color slightly. Eyebrows: define. ' +
  'Hair: smooth frizz, enhance shine. Clothing: deepen blacks, enhance texture. ' +
  'Color: warmer by 10°, cream highlights, magenta shadows, contrast +{CONTRAST}, vibrance +{VIBRANCE}. ' +
  'Lighting: brighten face 0.3EV, soften shadows. ' +
  'CRITICAL: Keep the EXACT same person, face, pose, clothing, background, composition. Do NOT change identity.';

// ══════════════════════════════════════════════════════════════════
// 工具
// ══════════════════════════════════════════════════════════════════

function loadApiKey() {
  if (process.env.QWAPI_API_KEY) return process.env.QWAPI_API_KEY;
  const envPath = path.join(os.homedir(), '.hermes', '.env');
  if (fs.existsSync(envPath)) {
    const m = fs.readFileSync(envPath, 'utf8').match(/QWAPI_API_KEY\s*=\s*(.+)/);
    if (m) return m[1].trim().replace(/['"]/g, '');
  }
  return null;
}

function parseArgs() {
  const args = { input:[], style:'natural', batch:null };
  const raw = process.argv.slice(2);
  for (let i=0; i<raw.length; i++) {
    if (raw[i]==='--input' && raw[i+1]) { args.input.push(raw[i+1]); i++; }
    else if (raw[i]==='--style' && raw[i+1]) { args.style=raw[i+1]; i++; }
    else if (raw[i]==='--batch' && raw[i+1]) { args.batch=raw[i+1]; i++; }
    else if (raw[i]==='--output' && raw[i+1]) { args.output=raw[i+1]; i++; }
    else if (!raw[i].startsWith('--')) { args.input.push(raw[i]); }
  }
  return args;
}

function buildEditPrompt(style) {
  const s = RETOUCH_INTENSITY[style] || RETOUCH_INTENSITY.natural;
  return EDIT_PROMPT.replace('{SKIN}',s.skin).replace('{FACE_SLIM}',s.face_slim)
    .replace('{DARK_CIRCLES}',s.dark_circles).replace('{TEETH}',s.teeth)
    .replace('{CONTRAST}',s.contrast).replace('{VIBRANCE}',s.vibrance);
}

function getImageSize(filePath) {
  const out = execSync(`sips -g pixelWidth -g pixelHeight "${filePath}"`, { encoding:'utf8' });
  const w = out.match(/pixelWidth:\s*(\d+)/)[1];
  const h = out.match(/pixelHeight:\s*(\d+)/)[1];
  return [parseInt(w), parseInt(h)];
}

function pickBestSize(origW, origH) {
  // 选择最接近原图宽高比的标准尺寸（避免裁剪变形）
  const ratio = origW / origH;
  const stdSizes = [[1024,1024],[1024,1536],[1536,1024],[1024,1792],[1792,1024]];
  let best = stdSizes[0], bestDiff = Infinity;
  for (const [sw,sh] of stdSizes) {
    const diff = Math.abs(sw/sh - ratio);
    if (diff < bestDiff) { bestDiff = diff; best = [sw,sh]; }
  }
  return `${best[0]}x${best[1]}`;
}

// ══════════════════════════════════════════════════════════════════
// 核心：图生图 + 缩放回原尺寸
// ══════════════════════════════════════════════════════════════════

async function editImage(inputPath, outputPath, apiKey, style) {
  const [origW, origH] = getImageSize(inputPath);
  const apiSize = pickBestSize(origW, origH);
  console.log('🎨 AI精修（原图 ' + origW + 'x' + origH + ' → API ' + apiSize + '）');
  console.log('  力度: ' + (RETOUCH_INTENSITY[style]?.label || '自然'));
  console.log('  预算: ~35 RMB');

  const startTime = Date.now();
  const prompt = buildEditPrompt(style);
  const tmpJson = '/tmp/xhs_edit_' + Date.now() + '.json';
  const tmpImg = '/tmp/xhs_edit_raw_' + Date.now() + '.png';

  if (!process.env.HTTP_PROXY) {
    process.env.HTTP_PROXY = 'http://127.0.0.1:7890';
    process.env.HTTPS_PROXY = 'http://127.0.0.1:7890';
  }

  // 1. API 调用
  const escPrompt = prompt.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
  const cmd = `curl -s -o "${tmpJson}" -X POST "https://qweapi.com/v1/images/edits" -H "Authorization: Bearer ${apiKey}" -F "image=@${inputPath}" -F "prompt=${escPrompt}" -F "model=gpt-image-2" -F "n=1" -F "size=${apiSize}" -F "response_format=b64_json" --max-time 180`;
  try { execSync(cmd, { encoding:'utf8', stdio:'pipe', timeout:200000 }); }
  catch (e) { throw new Error('API调用失败: '+(e.stderr||e.message||'').slice(0,200)); }

  if (!fs.existsSync(tmpJson) || fs.statSync(tmpJson).size<100) throw new Error('API返回空');

  let respData;
  try { respData = JSON.parse(fs.readFileSync(tmpJson,'utf8')); }
  catch (e) { throw new Error('非JSON响应'); }
  finally { try { fs.unlinkSync(tmpJson); } catch {} }

  if (respData.error) throw new Error('API错误: '+JSON.stringify(respData.error).slice(0,200));
  if (!respData.data?.[0]?.b64_json) throw new Error('API无图片');

  // 2. 保存API原图
  const buffer = Buffer.from(respData.data[0].b64_json, 'base64');
  fs.writeFileSync(tmpImg, buffer);
  const apiElapsed = ((Date.now()-startTime)/1000).toFixed(1);

  // 3. 缩放到原图精确尺寸
  console.log('  📐 缩放至原图尺寸 ' + origW + 'x' + origH + '...');
  execSync(`sips -z ${origH} ${origW} "${tmpImg}" --out "${outputPath}"`, { encoding:'utf8', timeout:10000 });
  fs.unlinkSync(tmpImg);

  const totalElapsed = ((Date.now()-startTime)/1000).toFixed(1);
  const outSize = (fs.statSync(outputPath).size/1024).toFixed(0);
  console.log('  ✅ 完成! API ' + apiElapsed + 's + 缩放 → 总计 ' + totalElapsed + 's / ' + outSize + 'KB');
  console.log('  📸 ' + outputPath);
  return outputPath;
}

// ══════════════════════════════════════════════════════════════════
// 主流程
// ══════════════════════════════════════════════════════════════════

async function retouchOne(inputPath, apiKey, options) {
  const style = options.style || 'natural';
  const dir = options.outputDir || path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  const out = options.outputPath || path.join(dir, base + '_精修_' + style + '.png');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📷 ' + base);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await editImage(inputPath, out, apiKey, style);
  return out;
}

async function main() {
  const args = parseArgs();
  const apiKey = loadApiKey();
  if (!apiKey) { console.error('❌ 未找到 QWAPI_API_KEY'); process.exit(1); }

  if (args.batch) {
    const files = fs.readdirSync(args.batch).filter(f=>/\.(jpg|jpeg|png|webp)$/i.test(f)).map(f=>path.join(args.batch,f));
    if (files.length===0) { console.error('❌ 文件夹中无图片'); process.exit(1); }
    console.log('📦 批量精修 ' + files.length + ' 张 (力度: ' + args.style + ')');
    const outDir = path.join(args.batch, '精修输出');
    fs.mkdirSync(outDir, { recursive:true });
    let done=0;
    for (const f of files) {
      try { await retouchOne(f, apiKey, {...args, outputDir:outDir}); done++; console.log('  进度: '+done+'/'+files.length); }
      catch(e) { console.error('  ❌ '+path.basename(f)+': '+e.message); }
    }
    console.log('\n🎉 完成! '+done+'/'+files.length+' → '+outDir);
    return;
  }

  if (args.input.length===0) {
    console.log(['🖼️  AI 一键精修（原图尺寸）','','用法:','  node retouch-photo.cjs --input ./photo.jpg','  node retouch-photo.cjs --input ./photo.jpg --style pro','  node retouch-photo.cjs --batch ./照片文件夹','','力度: gentle | natural | pro','价格: ~35 RMB/张（gpt-image-2 图像编辑）','输出: 精修原图尺寸'].join('\n'));
    process.exit(0);
  }

  for (const f of args.input) {
    if (!fs.existsSync(f)) { console.error('❌ 文件不存在: '+f); continue; }
    try { await retouchOne(f, apiKey, args); console.log(''); }
    catch(e) { console.error('❌ '+e.message); }
  }
}

module.exports = { retouchOne, buildEditPrompt, RETOUCH_INTENSITY, loadApiKey };

if (require.main===module) { main(); }
