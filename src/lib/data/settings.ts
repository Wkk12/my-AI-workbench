// ============================================================
// 系统设置 CRUD
// ============================================================

import { readJSONSafe, writeJSON } from "./base";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import type { Settings } from "@/lib/types";

const SETTINGS_PATH = "settings.json";

/** 获取完整设置 */
export function getSettings(): Settings {
  return readJSONSafe<Settings>(SETTINGS_PATH, DEFAULT_SETTINGS);
}

/** 保存设置 */
export function saveSettings(settings: Settings): void {
  writeJSON(SETTINGS_PATH, settings);
}

/** 获取主题 */
export function getTheme(): string {
  return getSettings().theme;
}
