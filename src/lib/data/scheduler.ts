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
    const existing = index.tasks[idx];
    // 如果执行时间或执行日变了，清空 lastRun 让任务能在新时间再次触发
    if (existing.schedule !== task.schedule || !arraysEqual(existing.daysOfWeek, task.daysOfWeek)) {
      task.lastRun = undefined;
      task.lastResult = undefined;
    }
    index.tasks[idx] = task;
  } else {
    index.tasks.push(task);
  }
  saveIndex(index);
}

function arraysEqual(a: number[] | undefined, b: number[] | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

export function deleteTask(id: string): void {
  const index = getIndex();
  index.tasks = index.tasks.filter((t) => t.id !== id);
  saveIndex(index);
}

/** 获取当前应执行的任务（精确分钟匹配，到点即执行一次） */
export function getDueTasks(): ScheduledTask[] {
  const now = new Date();
  const localHours = now.getHours();
  const timeKey = `${String(localHours).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dayOfWeek = now.getDay();
  // 今日日期 key，用于判断今天是否已执行过
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return getAllTasks().filter((t) => {
    if (!t.enabled) return false;
    // 严格分钟匹配：只在设定时间到达的这一分钟内触发
    if (t.schedule !== timeKey) return false;
    // 星期匹配
    if (t.daysOfWeek.length > 0 && !t.daysOfWeek.includes(dayOfWeek)) return false;
    // 今天已执行过则跳过（一天只执行一次）
    if (t.lastRun) {
      const lastDate = new Date(t.lastRun);
      const lastDayKey = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, "0")}-${String(lastDate.getDate()).padStart(2, "0")}`;
      if (lastDayKey === todayKey) return false;
    }
    return true;
  });
}
