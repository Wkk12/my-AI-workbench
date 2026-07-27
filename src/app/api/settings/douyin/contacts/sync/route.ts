import { NextResponse } from "next/server";
import { execSync } from "child_process";

/**
 * POST /api/settings/douyin/contacts/sync
 * 从浏览器 dy_monitor session 同步联系人列表
 * 提取非群聊的好友昵称
 */
export async function POST() {
  try {
    // 导航到私信页面并提取联系人
    const script = `
browser-act --session dy_monitor navigate "https://creator.douyin.com/creator-micro/data/following/chat" 2>&1
sleep 4
browser-act --session dy_monitor wait stable 2>&1
# Expand interaction menu
browser-act --session dy_monitor click 15 2>&1
sleep 1
browser-act --session dy_monitor click 33 2>&1
sleep 3
browser-act --session dy_monitor wait stable 2>&1
# Extract contact names (non-group)
browser-act --session dy_monitor eval "
(() => {
  const items = document.querySelectorAll('.item-header-name-eukBdz');
  const contents = document.querySelectorAll('.item-content-BSDfEh');
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const name = items[i].textContent.trim();
    const contentEl = contents[i];
    const content = contentEl ? contentEl.textContent.trim() : '';
    // Skip groups: content contains '你收到一条新类型消息' or name contains '群' or unread count > 1
    const isGroup = content.includes('你收到一条新类型消息') ||
                    name.includes('群') ||
                    content.includes('会员') ||
                    content.includes('进群');
    if (name && !isGroup && name.length < 20) {
      results.push(name);
    }
  }
  return JSON.stringify(results);
})()
" 2>&1
`;

    const output = execSync(script, {
      cwd: "/Users/wkk/Desktop/my-AI-workbench",
      encoding: "utf-8",
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    // Parse the last line(s) for JSON array
    const lines = output.trim().split("\n");
    const lastLine = lines[lines.length - 1].trim();
    let contacts: string[] = [];
    try {
      contacts = JSON.parse(lastLine);
    } catch {
      // Try to find JSON array in output
      const match = output.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          contacts = JSON.parse(match[0]);
        } catch { /* ignore */ }
      }
    }

    return NextResponse.json({ contacts });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "同步失败", contacts: [] },
      { status: 500 }
    );
  }
}
