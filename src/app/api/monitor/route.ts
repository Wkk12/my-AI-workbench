import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

function getPublisherDir(): string {
  const projectDir = path.resolve(process.cwd(), "scripts", "publisher");
  if (fs.existsSync(path.join(projectDir, "publish-xhs.js"))) {
    return projectDir;
  }
  return path.resolve(os.homedir(), ".openclaw", "workspace", "skills", "social-publisher");
}

const PUBLISHER_DIR = getPublisherDir();

interface PlatformState {
  fansCount: number;
  likeCount: number;
  commentCount: number;
  lastCheck: string | null;
}

interface MonitorState {
  [platform: string]: PlatformState;
}

function loadState(file: string): MonitorState {
  const stateFile = path.join(PUBLISHER_DIR, file);
  try {
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

const PLATFORMS = [
  { key: "douyin", label: "抖音", icon: "🎵", stateFile: ".monitor-state.json", stateKey: "douyin", hasMonitor: true },
  { key: "xhs", label: "小红书", icon: "📕", stateFile: ".monitor-xhs-state.json", stateKey: "xhs", hasMonitor: true },
  { key: "xianyu", label: "闲鱼", icon: "🐟", stateFile: ".monitor-state.json", stateKey: "xianyu", hasMonitor: false },
];

/**
 * 读取监控状态
 * GET /api/monitor
 */
export async function GET() {
  const platforms = PLATFORMS.map((p) => {
    const state = loadState(p.stateFile);
    const platformState = state[p.stateKey];

    return {
      platform: p.key,
      label: p.label,
      icon: p.icon,
      supported: p.hasMonitor,
      // Douyin legacy fields
      lastCount: 0,
      lastTotal: 0,
      hasNew: false,
      // Unified fields
      fansCount: platformState?.fansCount ?? 0,
      likeCount: platformState?.likeCount ?? 0,
      commentCount: platformState?.commentCount ?? 0,
      lastCheck: platformState?.lastCheck || null,
    };
  });

  return NextResponse.json({ platforms });
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
