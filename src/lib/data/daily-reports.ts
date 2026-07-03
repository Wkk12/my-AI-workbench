// ============================================================
// 日报数据 CRUD
// ============================================================

import { readJSONSafe, writeJSON, readTextFile, writeTextFile, deleteFile, listFiles } from "./base";
import type { DailyReportIndex, DailyReportMeta } from "@/lib/types";

const INDEX_PATH = "daily-reports/index.json";
const REPORTS_DIR = "daily-reports/reports";

/** 获取日报索引 */
export function getReportIndex(): DailyReportIndex {
  return readJSONSafe<DailyReportIndex>(INDEX_PATH, { reports: [] });
}

/** 保存日报索引 */
function saveReportIndex(index: DailyReportIndex): void {
  writeJSON(INDEX_PATH, index);
}

/** 获取所有日报列表（按日期倒序） */
export function getAllReports(): DailyReportMeta[] {
  const index = getReportIndex();
  return index.reports.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

/** 根据 ID（日期）获取单篇日报元数据 */
export function getReportMeta(id: string): DailyReportMeta | undefined {
  const index = getReportIndex();
  return index.reports.find((r) => r.id === id);
}

/** 获取日报内容（Markdown） */
export function getReportContent(id: string): string | null {
  try {
    return readTextFile(`${REPORTS_DIR}/${id}.md`);
  } catch {
    return null;
  }
}

/** 保存或更新日报（索引 + 内容） */
export function saveReport(meta: DailyReportMeta, content: string): void {
  const index = getReportIndex();
  const existingIdx = index.reports.findIndex((r) => r.id === meta.id);

  if (existingIdx >= 0) {
    index.reports[existingIdx] = meta;
  } else {
    index.reports.push(meta);
  }

  saveReportIndex(index);
  writeTextFile(`${REPORTS_DIR}/${meta.id}.md`, content);
}

/** 删除日报 */
export function deleteReport(id: string): void {
  const index = getReportIndex();
  index.reports = index.reports.filter((r) => r.id !== id);
  saveReportIndex(index);
  deleteFile(`${REPORTS_DIR}/${id}.md`);
}

/** 获取所有已有日报的日期集合 */
export function getExistingReportDates(): Set<string> {
  const index = getReportIndex();
  return new Set(index.reports.map((r) => r.id));
}

/** 列出 reports 目录下的 .md 文件 */
export function listReportFiles(): string[] {
  return listFiles(REPORTS_DIR).filter((f) => f.endsWith(".md"));
}
