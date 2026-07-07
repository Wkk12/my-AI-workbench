import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/data/settings";

/**
 * Setup 完成标记 API
 * GET  /api/setup → { setupCompleted: boolean }
 * POST /api/setup → { setupCompleted: true } → 保存标记
 */
export async function GET() {
  const s = getSettings();
  return NextResponse.json({ setupCompleted: s.setupCompleted ?? false });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (body.setupCompleted === true || body.setupCompleted === false) {
    const s = getSettings();
    saveSettings({ ...s, setupCompleted: body.setupCompleted });
    return NextResponse.json({ success: true, setupCompleted: body.setupCompleted });
  }
  return NextResponse.json({ error: "缺少 setupCompleted 字段" }, { status: 400 });
}
