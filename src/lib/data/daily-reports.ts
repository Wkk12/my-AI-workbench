// ============================================================
// 日报数据 CRUD（使用 Prisma + SQLite）
// ============================================================

import prisma from "@/lib/prisma";
import type { DailyReportMeta } from "@/lib/types";

function toMeta(row: any): DailyReportMeta {
  return {
    id: row.id,
    date: row.date,
    projectCount: row.projectCount ?? 0,
    commitCount: row.commitCount ?? 0,
    createdAt: row.createdAt,
    source: row.source as "local" | "gitlab",
    summary: row.summary || undefined,
  };
}

export async function getAllReports(): Promise<DailyReportMeta[]> {
  const rows = await prisma.dailyReport.findMany({
    orderBy: { date: "desc" },
  });
  return rows.map(toMeta);
}

export async function getReportMeta(id: string): Promise<DailyReportMeta | undefined> {
  const row = await prisma.dailyReport.findUnique({ where: { id } });
  if (!row) return undefined;
  return toMeta(row);
}

export async function getReportContent(id: string): Promise<string | null> {
  const row = await prisma.dailyReport.findUnique({ where: { id } });
  if (!row) return null;
  return row.content || null;
}

export async function saveReport(meta: DailyReportMeta, content: string): Promise<void> {
  await prisma.dailyReport.upsert({
    where: { id: meta.id },
    update: {
      date: meta.date || meta.id,
      projectCount: meta.projectCount ?? 0,
      commitCount: meta.commitCount ?? 0,
      source: meta.source || "local",
      summary: meta.summary || "",
      content,
    },
    create: {
      id: meta.id,
      date: meta.date || meta.id,
      projectCount: meta.projectCount ?? 0,
      commitCount: meta.commitCount ?? 0,
      source: meta.source || "local",
      summary: meta.summary || "",
      content,
      createdAt: meta.createdAt || new Date().toISOString(),
    },
  });
}

export async function deleteReport(id: string): Promise<void> {
  await prisma.dailyReport.delete({ where: { id } }).catch(() => {});
}

export async function getExistingReportDates(): Promise<Set<string>> {
  const rows = await prisma.dailyReport.findMany({ select: { id: true } });
  return new Set(rows.map((r) => r.id));
}
