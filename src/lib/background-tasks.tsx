"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";

// ─── 类型 ───

export type TaskType = "image_generation" | "publish" | "generic";
export type TaskStatus = "running" | "done" | "error";

export interface TaskProgress {
  done: number;
  total: number;
}

export interface BackgroundTask {
  id: string;
  type: TaskType;
  title: string;
  status: TaskStatus;
  progress?: TaskProgress;
  message: string;
  jobId?: string;
  createdAt: number;
  onRetry?: () => void;
  result?: any; // Arbitrary result data for completed tasks
}

interface TaskConfig {
  title: string;
  type: TaskType;
  jobId: string;
  /** Poll URL relative to base, e.g. "/api/publish?jobId=xxx" */
  pollUrl: string;
  pollIntervalMs?: number;
  onRetry?: () => void;
}

interface TaskContextValue {
  tasks: BackgroundTask[];
  addTask: (cfg: TaskConfig) => string;
  updateTask: (id: string, patch: Partial<BackgroundTask>) => void;
  removeTask: (id: string) => void;
}

// ─── Context ───

const TaskContext = createContext<TaskContextValue | null>(null);

/** 解析不同端点的轮询结果 */
function parsePollResult(prev: BackgroundTask, data: any): Partial<BackgroundTask> {
  // AI 图片生成
  if (prev.type === "image_generation") {
    if (data.status === "done") {
      return {
        status: "done",
        message: `${data.images?.length || 0}/${data.total || "?"} 张图片已生成`,
        progress: { done: data.total || 0, total: data.total || 0 },
        result: { images: data.images || [], errors: data.errors || [] },
      };
    }
    if (data.status === "error") {
      return {
        status: "error",
        message: data.errors?.join("; ") || "生成失败",
      };
    }
    return {
      message: `正在生成... ${data.done || 0}/${data.total || "?"}`,
      progress: { done: data.done || 0, total: data.total || 1 },
    };
  }

  // 发布
  if (prev.type === "publish") {
    if (data.status === "expired") {
      return { status: "error", message: "任务状态已过期（服务器可能已重启）" };
    }
    const log = (data.log as string) || "";
    const hasError = /💥|❌|bail|脚本异常|发布失败|login_required|CDP.*失败|找不到/.test(log);
    if (data.done && hasError) {
      return { status: "error", message: log.slice(-200) || "发布失败", result: { log } };
    }
    if (data.done) {
      return { status: "done", message: "发布完成 ✅", result: { log } };
    }
    return {
      message: `发布中... ${data.elapsed ? Math.round(data.elapsed / 1000) + "s" : ""}`,
    };
  }

  return {};
}

export function BackgroundTasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const pollTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const tasksRef = useRef(tasks);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // 清理所有轮询
  useEffect(() => {
    return () => {
      pollTimers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<BackgroundTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const removeTask = useCallback((id: string) => {
    // 停止该任务的轮询
    const timer = pollTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      pollTimers.current.delete(id);
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const startPolling = useCallback(
    (taskId: string, pollUrl: string, intervalMs: number) => {
      const poll = async () => {
        try {
          const resp = await fetch(pollUrl, { credentials: "include" });
          const data = await resp.json();

          const current = tasksRef.current.find((t) => t.id === taskId);
          if (!current || current.status !== "running") return; // 已结束

          const patch = parsePollResult(current, data);
          setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));

          // 如果没结束，继续轮询
          const updated = { ...current, ...patch };
          if (updated.status === "running") {
            const t = setTimeout(poll, intervalMs);
            pollTimers.current.set(taskId, t);
          } else {
            pollTimers.current.delete(taskId);
          }
        } catch {
          // 轮询失败，继续尝试
          const t = setTimeout(poll, intervalMs);
          pollTimers.current.set(taskId, t);
        }
      };

      const t = setTimeout(poll, intervalMs);
      pollTimers.current.set(taskId, t);
    },
    []
  );

  const addTask = useCallback(
    (cfg: TaskConfig): string => {
      const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const task: BackgroundTask = {
        id,
        type: cfg.type,
        title: cfg.title,
        status: "running",
        message: "启动中...",
        jobId: cfg.jobId,
        createdAt: Date.now(),
        onRetry: cfg.onRetry,
      };

      setTasks((prev) => [...prev, task]);

      // 启动后台轮询
      startPolling(id, cfg.pollUrl, cfg.pollIntervalMs || 3000);

      return id;
    },
    [startPolling]
  );

  return (
    <TaskContext.Provider value={{ tasks, addTask, updateTask, removeTask }}>
      {children}
    </TaskContext.Provider>
  );
}

export function useBackgroundTasks() {
  const ctx = useContext(TaskContext);
  if (!ctx) {
    throw new Error("useBackgroundTasks must be used within BackgroundTasksProvider");
  }
  return ctx;
}
