// ============================================================
// 内容创作数据 CRUD（使用 Prisma + SQLite）
// ============================================================

import prisma from "@/lib/prisma";
import type { ContentItem } from "@/lib/types";

function toContentItem(row: any): ContentItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    platform: row.platform as ContentItem["platform"],
    status: row.status as ContentItem["status"],
    tags: JSON.parse(row.tags || "[]"),
    mediaPaths: JSON.parse(row.mediaPaths || "[]"),
    aiGenerated: row.aiGenerated,
    publishedAt: row.publishedAt || undefined,
    scheduledAt: row.scheduledAt || undefined,
    stats: row.stats ? JSON.parse(row.stats) : undefined,
    ipId: row.ipId || undefined,
    ipName: row.ipName || undefined,
    imageCount: row.imageCount ?? 1,
    imagePrompt: row.imagePrompt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getAllContents(): Promise<ContentItem[]> {
  const rows = await prisma.content.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toContentItem);
}

export async function getContent(id: string): Promise<ContentItem | undefined> {
  const row = await prisma.content.findUnique({ where: { id } });
  if (!row) return undefined;
  return toContentItem(row);
}

export async function saveContent(item: ContentItem): Promise<void> {
  await prisma.content.upsert({
    where: { id: item.id },
    update: {
      title: item.title,
      description: item.description,
      platform: item.platform,
      status: item.status,
      tags: JSON.stringify(item.tags || []),
      mediaPaths: JSON.stringify(item.mediaPaths || []),
      aiGenerated: item.aiGenerated ?? false,
      publishedAt: item.publishedAt || null,
      scheduledAt: item.scheduledAt || null,
      stats: item.stats ? JSON.stringify(item.stats) : null,
      ipId: item.ipId || null,
      ipName: item.ipName || null,
      imageCount: item.imageCount ?? 1,
      imagePrompt: item.imagePrompt || "",
      updatedAt: item.updatedAt || new Date().toISOString(),
    },
    create: {
      id: item.id,
      title: item.title,
      description: item.description,
      platform: item.platform,
      status: item.status,
      tags: JSON.stringify(item.tags || []),
      mediaPaths: JSON.stringify(item.mediaPaths || []),
      aiGenerated: item.aiGenerated ?? false,
      publishedAt: item.publishedAt || null,
      scheduledAt: item.scheduledAt || null,
      stats: item.stats ? JSON.stringify(item.stats) : null,
      ipId: item.ipId || null,
      ipName: item.ipName || null,
      imageCount: item.imageCount ?? 1,
      imagePrompt: item.imagePrompt || "",
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
    },
  });
}

export async function deleteContent(id: string): Promise<void> {
  await prisma.content.delete({ where: { id } }).catch(() => {});
}
