// ============================================================
// 定时任务数据 CRUD（使用 Prisma + SQLite）
// ============================================================

import prisma from "@/lib/prisma";
import type { ScheduledTask } from "@/lib/types";

function toTask(row: any): ScheduledTask {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    actionType: row.actionType as ScheduledTask["actionType"],
    schedule: row.schedule,
    daysOfWeek: JSON.parse(row.daysOfWeek || "[]"),
    config: JSON.parse(row.config || "{}"),
    lastRun: row.lastRun || undefined,
    lastResult: row.lastResult || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getAllTasks(): Promise<ScheduledTask[]> {
  const rows = await prisma.scheduledTask.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toTask);
}

export async function getTask(id: string): Promise<ScheduledTask | undefined> {
  const row = await prisma.scheduledTask.findUnique({ where: { id } });
  if (!row) return undefined;
  return toTask(row);
}

export async function saveTask(task: ScheduledTask): Promise<void> {
  const existing = await prisma.scheduledTask.findUnique({ where: { id: task.id } });
  if (existing) {
    // 如果执行时间或执行日变了，清空 lastRun
    if (
      existing.schedule !== task.schedule ||
      existing.daysOfWeek !== JSON.stringify(task.daysOfWeek || [])
    ) {
      task.lastRun = undefined;
      task.lastResult = undefined;
    }
  }

  await prisma.scheduledTask.upsert({
    where: { id: task.id },
    update: {
      name: task.name,
      enabled: task.enabled,
      actionType: task.actionType,
      schedule: task.schedule,
      daysOfWeek: JSON.stringify(task.daysOfWeek || []),
      config: JSON.stringify(task.config || {}),
      lastRun: task.lastRun || null,
      lastResult: task.lastResult || "",
      updatedAt: task.updatedAt || new Date().toISOString(),
    },
    create: {
      id: task.id,
      name: task.name,
      enabled: task.enabled,
      actionType: task.actionType,
      schedule: task.schedule,
      daysOfWeek: JSON.stringify(task.daysOfWeek || []),
      config: JSON.stringify(task.config || {}),
      lastRun: task.lastRun || null,
      lastResult: task.lastResult || "",
      createdAt: task.createdAt || new Date().toISOString(),
      updatedAt: task.updatedAt || new Date().toISOString(),
    },
  });
}

export async function deleteTask(id: string): Promise<void> {
  await prisma.scheduledTask.delete({ where: { id } }).catch(() => {});
}

/** 获取当前应执行的任务（精确分钟匹配） */
export async function getDueTasks(): Promise<ScheduledTask[]> {
  const now = new Date();
  const timeKey = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dayOfWeek = now.getDay();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const tasks = await getAllTasks();
  return tasks.filter((t) => {
    if (!t.enabled) return false;
    if (t.schedule !== timeKey) return false;
    if (t.daysOfWeek.length > 0 && !t.daysOfWeek.includes(dayOfWeek)) return false;
    if (t.lastRun) {
      const lastDate = new Date(t.lastRun);
      const lastDayKey = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, "0")}-${String(lastDate.getDate()).padStart(2, "0")}`;
      if (lastDayKey === todayKey) return false;
    }
    return true;
  });
}
