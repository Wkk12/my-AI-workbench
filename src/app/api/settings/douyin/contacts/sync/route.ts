import { NextResponse } from "next/server";
import { exec } from "child_process";

/**
 * POST /api/settings/douyin/contacts/sync
 * 从浏览器 dy_monitor session 同步联系人列表（需 browser-act + Chrome 已登录抖音）
 * 注意: 此接口依赖本地 Mac 环境，Windows 服务器上不可用，会返回错误提示
 */
export async function POST() {
  return NextResponse.json(
    { 
      error: "此功能需要在本地开发环境运行。请在 Mac 上执行: node scripts/sync-douyin-contacts.cjs",
      contacts: [] 
    },
    { status: 500 }
  );
}
