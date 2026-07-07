// ============================================================
// IP 管理数据 CRUD（使用 Prisma + SQLite）
// ============================================================

import prisma from "@/lib/prisma";
import type { IPItem } from "@/lib/types";

function toIPItem(row: any): IPItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    imagePath: row.imagePath,
    stylePrompt: row.stylePrompt || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getAllIPs(): Promise<IPItem[]> {
  const rows = await prisma.iPItem.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toIPItem);
}

export async function getIP(id: string): Promise<IPItem | undefined> {
  const row = await prisma.iPItem.findUnique({ where: { id } });
  if (!row) return undefined;
  return toIPItem(row);
}

export async function saveIP(item: IPItem): Promise<void> {
  await prisma.iPItem.upsert({
    where: { id: item.id },
    update: {
      name: item.name,
      description: item.description || "",
      imagePath: item.imagePath || "",
      stylePrompt: item.stylePrompt || "",
      updatedAt: item.updatedAt || new Date().toISOString(),
    },
    create: {
      id: item.id,
      name: item.name,
      description: item.description || "",
      imagePath: item.imagePath || "",
      stylePrompt: item.stylePrompt || "",
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
    },
  });
}

export async function deleteIP(id: string): Promise<void> {
  await prisma.iPItem.delete({ where: { id } }).catch(() => {});
}
