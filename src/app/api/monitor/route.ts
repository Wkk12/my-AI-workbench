import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PUBLISHER_DIR = path.resolve(
  process.env.HOME || "/Users/wkk",
  ".openclaw/workspace/skills/social-publisher"
);

interface MonitorState {
  [platform: string]: {
    lastCount: number;
    lastTotal: number;
    lastCheck: string | null;
  };
}

function loadState(): MonitorState {
  const stateFile = path.join(PUBLISHER_DIR, ".monitor-state.json");
  try {
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

const PLATFORMS = ["douyin", "xhs", "xianyu"] as const;
type Platform = (typeof PLATFORMS)[number];

function getDefaultState(): MonitorState {
  const state: MonitorState = {};
  for (const p of PLATFORMS) {
    state[p] = { lastCount: 0, lastTotal: 0, lastCheck: null };
  }
  return state;
}

/**
 * 读取监控状态
 * GET /api/monitor
 */
export async function GET() {
  const raw = loadState();
  const merged = { ...getDefaultState(), ...raw };

  return NextResponse.json({
    platforms: PLATFORMS.map((platform) => ({
      platform,
      label:
        platform === "douyin"
          ? "抖音"
          : platform === "xhs"
            ? "小红书"
            : "闲鱼",
      icon: platform === "douyin" ? "🎵" : platform === "xhs" ? "📕" : "🐟",
      ...merged[platform],
      hasNew: merged[platform]?.lastCount > 0,
      supported: platform === "douyin",
    })),
    checkedAt: merged.douyin?.lastCheck || null,
  });
}

/**
 * 手动触发检测
 * POST /api/monitor
 */
export async function POST() {
  const triggerFile = path.join(PUBLISHER_DIR, ".monitor-trigger");
  try {
    const data = { triggeredAt: new Date().toISOString() };
    fs.writeFileSync(triggerFile, JSON.stringify(data));
    return NextResponse.json({ ok: true, message: "检测已触发" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
