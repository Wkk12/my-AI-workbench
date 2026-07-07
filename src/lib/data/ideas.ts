// ============================================================
// 创意灵感数据 CRUD（使用 Prisma + SQLite）
// ============================================================

import prisma from "@/lib/prisma";
import type { Idea } from "@/lib/types";

function toIdea(row: any): Idea {
  return {
    id: row.id,
    content: row.content,
    category: row.category as Idea["category"],
    source: row.source || undefined,
    tags: JSON.parse(row.tags || "[]"),
    status: row.status as Idea["status"],
    linkedProjectId: row.linkedProjectId || undefined,
    aiExpanded: row.aiExpanded || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getAllIdeas(): Promise<Idea[]> {
  const rows = await prisma.idea.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toIdea);
}

export async function getIdea(id: string): Promise<Idea | undefined> {
  const row = await prisma.idea.findUnique({ where: { id } });
  if (!row) return undefined;
  return toIdea(row);
}

export async function saveIdea(idea: Idea): Promise<void> {
  await prisma.idea.upsert({
    where: { id: idea.id },
    update: {
      title: idea.content?.slice(0, 50) || "",
      content: idea.content,
      category: idea.category,
      source: idea.source || "",
      tags: JSON.stringify(idea.tags || []),
      status: idea.status,
      linkedProjectId: idea.linkedProjectId || null,
      aiExpanded: idea.aiExpanded || "",
      updatedAt: idea.updatedAt || new Date().toISOString(),
    },
    create: {
      id: idea.id,
      title: idea.content?.slice(0, 50) || "",
      content: idea.content,
      category: idea.category,
      source: idea.source || "",
      tags: JSON.stringify(idea.tags || []),
      status: idea.status,
      linkedProjectId: idea.linkedProjectId || null,
      aiExpanded: idea.aiExpanded || "",
      createdAt: idea.createdAt || new Date().toISOString(),
      updatedAt: idea.updatedAt || new Date().toISOString(),
    },
  });
}

export async function deleteIdea(id: string): Promise<void> {
  await prisma.idea.delete({ where: { id } }).catch(() => {});
}
