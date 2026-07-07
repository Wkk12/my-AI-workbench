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

/** 获取当前应执行的任务（到期后首次轮询即执行，30分钟内不重复） */
export function getDueTasks(): ScheduledTask[] {
  // 使用本地时间（UTC+8），与用户设置任务时的时区一致
  const now = new Date();
  const localHours = now.getHours(); // JS Date.getHours() 已返回本地时间
  const timeKey = `${String(localHours).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dayOfWeek = now.getDay();

  return getAllTasks().filter((t) => {
    if (!t.enabled) return false;
    // 时间已到（schedule <= 当前时间）
    if (t.schedule > timeKey) return false;
    // 星期匹配
    if (t.daysOfWeek.length > 0 && !t.daysOfWeek.includes(dayOfWeek)) return false;
    // 30 分钟内已执行过则跳过（避免轮询重复触发）
    if (t.lastRun) {
      const last = new Date(t.lastRun).getTime();
      if (now.getTime() - last < 30 * 60 * 1000) return false;
    }
    return true;
  });
}
