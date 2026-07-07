#!/usr/bin/env node
/**
 * generate-cover.js — AI 生成封面图
 *
 * 用法:
 *   node generate-cover.js --prompt "描述" --output ./cover.png
 *
 * 依赖: qweapi gpt-image-2, 代理 127.0.0.1:7890
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── 参数解析 ──
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

// ── 读取 API Key ──
function loadApiKey() {
  // 1. 环境变量
  if (process.env.QWAPI_API_KEY) return process.env.QWAPI_API_KEY;

  // 2. ~/.hermes/.env
  const envPath = path.join(os.homedir(), '.hermes', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/QWAPI_API_KEY\s*=\s*(.+)/);
    if (match) return match[1].trim().replace(/['"]/g, '');
  }

  return null;
}

// ── 主函数 ──
async function generateCover(prompt, outputPath, options) {
  options = options || {};
  const size = options.size || '1024x1536'; // 默认竖版 3:4

  const apiKey = loadApiKey();
  if (!apiKey) {
    throw new Error(
      '未找到 QWAPI_API_KEY。\n' +
      '  请设置环境变量: export QWAPI_API_KEY=***\n' +
      '  或确保 ~/.hermes/.env 中存在 QWAPI_API_KEY=***'
    );
  }

  console.log('🎨 AI 生成封面图...');
  console.log('  提示词: ' + prompt.slice(0, 60) + (prompt.length > 60 ? '...' : ''));
  console.log('  尺寸: ' + size);

  const proxy = options.proxy || 'http://127.0.0.1:7890';

  // 动态导入 fetch（Node.js ≥18 内置）
  let fetch;
  try {
    fetch = globalThis.fetch;
  } catch {
    const { default: f } = await import('node-fetch');
    fetch = f;
  }

  const startTime = Date.now();

  // 代理：qweapi 需要代理（默认 7890），传 null 可跳过
  if (proxy !== null) {
    const proxyUrl = proxy || 'http://127.0.0.1:7890';
    if (!process.env.HTTP_PROXY && !process.env.http_proxy) {
      process.env.HTTP_PROXY = proxyUrl;
      process.env.HTTPS_PROXY = proxyUrl;
      process.env.http_proxy = proxyUrl;
      process.env.https_proxy = proxyUrl;
    }
  }

  try {
    // 使用 JSON body（generations 端点）
    const resp = await fetch('https://qweapi.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-2',
        prompt: prompt,
        n: 1,
        size: size,
        response_format: 'b64_json',
      }),
      // 代理通过全局 fetch 无法直接设置，需要环境变量
      // 如果设置了代理环境变量会自动走代理
      signal: AbortSignal.timeout(120000),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error('API 返回 ' + resp.status + ': ' + errText.slice(0, 200));
    }

    const data = await resp.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!data.data || !data.data[0] || !data.data[0].b64_json) {
      throw new Error('API 返回格式异常: ' + JSON.stringify(data).slice(0, 200));
    }

    const b64 = data.data[0].b64_json;
    const buffer = Buffer.from(b64, 'base64');
    fs.writeFileSync(outputPath, buffer);

    const sizeKB = (buffer.length / 1024).toFixed(0);
    console.log('  ✅ 生成成功 ' + sizeKB + 'KB / ' + elapsed + 's');
    console.log('  输出: ' + outputPath);

    return outputPath;

  } catch (e) {
    if (e.message.includes('fetch')) {
      console.log('  ⚠️  直连失败，尝试代理...');
    }
    throw new Error('生图失败: ' + e.message + '\n  提示: 确保 Clash 代理 7890 已开启');
  }
}

// ── CLI 入口 ──
async function main() {
  const args = parseArgs();

  if (!args.prompt) {
    console.log('用法: node generate-cover.js --prompt "描述" [--output ./cover.png] [--size 1024x1536]');
    console.log('');
    console.log('参数:');
    console.log('  --prompt   必填，图片描述');
    console.log('  --output   输出路径，默认 ./cover-{timestamp}.png');
    console.log('  --size     尺寸，默认 1024x1536 (竖版)');
    console.log('              可选: 1024x1024 (方形) / 1536x1024 (横版)');
    process.exit(1);
  }

  const output = args.output || ('./cover-' + Date.now() + '.png');

  try {
    await generateCover(args.prompt, output, { size: args.size });
  } catch (e) {
    console.error('\n❌ ' + e.message);
    process.exit(1);
  }
}

// 只在直接运行时执行 CLI
if (require.main === module) {
  main();
}

// ── 导出供其他脚本调用 ──
module.exports = { generateCover, loadApiKey };
