import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * POST /api/settings/douyin/contacts/sync
 * 从浏览器 dy_monitor session 同步联系人列表（需 browser-act + Chrome 已登录抖音）
 * 注意: 此接口依赖本地 Mac 环境（browser-act + Chrome），Windows 服务器上不可用
 */
export async function POST() {
  try {
    // 导航到私信页面并提取联系人
    const script = [
      `browser-act --session dy_monitor navigate "https://creator.douyin.com/creator-micro/data/following/chat"`,
      `sleep 4`,
      `browser-act --session dy_monitor wait stable`,
      `browser-act --session dy_monitor click 15`,
      `sleep 1`,
      `browser-act --session dy_monitor click 33`,
      `sleep 3`,
      `browser-act --session dy_monitor wait stable`,
      `browser-act --session dy_monitor eval --stdin`,
    ].join(" && ");

    const jsCode = `(() => {
  const items = document.querySelectorAll('[class*=item-header-name]');
  const contents = document.querySelectorAll('[class*=item-content]');
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const name = items[i].textContent.trim();
    const contentEl = contents[i];
    const content = contentEl ? contentEl.textContent.trim() : '';
    const isGroup = content.includes('你收到一条新类型消息') ||
                    name.includes('群') ||
                    content.includes('会员') ||
                    content.includes('进群');
    if (name && !isGroup && name.length < 20) {
      results.push(name);
    }
  }
  return JSON.stringify(results);
})()`;

    const { stdout } = await execAsync(script, {
      encoding: "utf-8" as BufferEncoding,
      input: jsCode,
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    // 解析输出中的 JSON 数组
    const lines = stdout.trim().split("\n");
    const lastLine = lines[lines.length - 1].trim();
    let contacts: string[] = [];
    try {
      contacts = JSON.parse(lastLine);
    } catch {
      const match = stdout.match(/\[[\s\S]*\]/);
      if (match) {
        try { contacts = JSON.parse(match[0]); } catch { /* ignore */ }
      }
    }

    return NextResponse.json({ contacts });
  } catch (e: any) {
    const errMsg = e.stderr || e.message || String(e);
    return NextResponse.json(
      { error: `同步失败: ${errMsg.slice(0, 300)}`, contacts: [] },
      { status: 500 }
    );
  }
}
