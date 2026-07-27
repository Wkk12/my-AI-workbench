// ============================================================
// 抖音续火花数据 CRUD（使用 Prisma + SQLite）
// ============================================================

import prisma from "@/lib/prisma";
import type { SparkContact } from "@/lib/types";

function toContact(row: any): SparkContact {
  return {
    id: row.id,
    name: row.name,
    douyinId: row.douyinId || "",
    avatar: row.avatar || "",
    selected: row.selected,
    sortOrder: row.sortOrder,
    lastSent: row.lastSent || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 获取所有联系人 */
export async function getAllContacts(): Promise<SparkContact[]> {
  const rows = await prisma.sparkContact.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toContact);
}

/** 获取已勾选的联系人 */
export async function getSelectedContacts(): Promise<SparkContact[]> {
  const rows = await prisma.sparkContact.findMany({
    where: { selected: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toContact);
}

/** 按 ID 获取 */
export async function getContact(id: string): Promise<SparkContact | undefined> {
  const row = await prisma.sparkContact.findUnique({ where: { id } });
  if (!row) return undefined;
  return toContact(row);
}

/** 批量保存（全量替换） */
export async function saveContacts(contacts: SparkContact[]): Promise<void> {
  // 先删后插（简单粗暴，联系人数量少）
  await prisma.sparkContact.deleteMany();
  if (contacts.length === 0) return;
  const now = new Date().toISOString();
  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    await prisma.sparkContact.create({
      data: {
        id: c.id,
        name: c.name,
        douyinId: c.douyinId || "",
        avatar: c.avatar || "",
        selected: c.selected,
        sortOrder: i,
        lastSent: c.lastSent || null,
        createdAt: c.createdAt || now,
        updatedAt: now,
      },
    });
  }
}

/** 更新单个联系人 */
export async function updateContact(id: string, data: Partial<SparkContact>): Promise<void> {
  const updateData: any = {
    updatedAt: new Date().toISOString(),
  };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.douyinId !== undefined) updateData.douyinId = data.douyinId;
  if (data.avatar !== undefined) updateData.avatar = data.avatar;
  if (data.selected !== undefined) updateData.selected = data.selected;
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
  if (data.lastSent !== undefined) updateData.lastSent = data.lastSent;

  await prisma.sparkContact.update({
    where: { id },
    data: updateData,
  });
}

/** 记录发送时间 */
export async function markContactSent(id: string): Promise<void> {
  await prisma.sparkContact.update({
    where: { id },
    data: {
      lastSent: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });
}

/** 删除联系人 */
export async function deleteContact(id: string): Promise<void> {
  await prisma.sparkContact.delete({ where: { id } }).catch(() => {});
}
