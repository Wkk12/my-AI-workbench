// ============================================================
// 定时任务数据 CRUD
// ============================================================

import { readJSONSafe, writeJSON } from "./base";
import type { SchedulerIndex, ScheduledTask } from "@/lib/types";

const INDEX_PATH = "scheduler/index.json";

function getIndex(): SchedulerIndex {
  return readJSONSafe<SchedulerIndex>(INDEX_PATH, { tasks: [] });
}

function saveIndex(index: SchedulerIndex): void {
  writeJSON(INDEX_PATH, index);
}

export function getAllTasks(): ScheduledTask[] {
  return getIndex().tasks.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getTask(id: string): ScheduledTask | undefined {
  return getIndex().tasks.find((t) => t.id === id);
}

export function saveTask(task: ScheduledTask): void {
  const index = getIndex();
  const idx = index.tasks.findIndex((t) => t.id === task.id);
  if (idx >= 0) {
    index.tasks[idx] = task;
  } else {
    index.tasks.push(task);
  }
  saveIndex(index);
}

export function deleteTask(id: string): void {
  const index = getIndex();
  index.tasks = index.tasks.filter((t) => t.id !== id);
  saveIndex(index);
}

/** 获取当前应执行的任务（到期后首次轮询即执行，不要求精确到分钟） */
export function getDueTasks(): ScheduledTask[] {
  const now = new Date();
  const timeKey = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dayOfWeek = now.getDay();
  const today = now.toISOString().split("T")[0];

  return getAllTasks().filter((t) => {
    if (!t.enabled) return false;
    // 时间已到（schedule <= 当前时间）
    if (t.schedule > timeKey) return false;
    // 星期匹配
    if (t.daysOfWeek.length > 0 && !t.daysOfWeek.includes(dayOfWeek)) return false;
    // 今天已执行过则跳过
    if (t.lastRun && t.lastRun.startsWith(today)) return false;
    return true;
  });
}
