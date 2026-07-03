import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/data/settings";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import type { Settings } from "@/lib/types";

export async function GET() {
  const settings = getSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const current = getSettings();

  const updated: Settings = {
    ...DEFAULT_SETTINGS,
    ...current,
    ...body,
    gitlab: { ...DEFAULT_SETTINGS.gitlab, ...current.gitlab, ...body.gitlab },
    claude: { ...DEFAULT_SETTINGS.claude, ...current.claude, ...body.claude },
    platforms: { ...current.platforms, ...body.platforms },
  };

  saveSettings(updated);
  return NextResponse.json({ success: true });
}
