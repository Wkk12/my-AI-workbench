import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/data/settings";

/** GET /api/settings/douyin — 获取抖音配置（账号信息） */
export async function GET() {
  const settings = await getSettings();
  const douyin = settings.platforms?.douyin || {};
  return NextResponse.json(douyin);
}

/** PUT /api/settings/douyin — 保存抖音配置 */
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const settings = await getSettings();
  settings.platforms = {
    ...settings.platforms,
    douyin: { ...settings.platforms?.douyin, ...body },
  };
  await saveSettings(settings);
  return NextResponse.json({ success: true });
}
