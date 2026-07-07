// ============================================================
// 系统设置 CRUD（使用 Prisma + SQLite）
// ============================================================

import prisma from "@/lib/prisma";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import type { Settings } from "@/lib/types";

/** 获取完整设置 */
export async function getSettings(): Promise<Settings> {
  const row = await prisma.setting.findUnique({ where: { key: "settings" } });
  if (!row) return DEFAULT_SETTINGS;
  try {
    return JSON.parse(row.value) as Settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** 保存设置 */
export async function saveSettings(settings: Settings): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "settings" },
    update: { value: JSON.stringify(settings, null, 2) },
    create: { key: "settings", value: JSON.stringify(settings, null, 2) },
  });
}

/** 获取主题（同步版本，向后兼容） */
export function getTheme(): string {
  return "cream"; // 默认值，实际通过 getSettings() 获取
}
