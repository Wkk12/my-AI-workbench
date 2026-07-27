import fs from "fs";
import path from "path";

export interface PublishStep {
  step: string;
  status: "running" | "done" | "error";
  detail: string;
  timestamp: number;
  model?: string;
  durationMs?: number;
}

export interface PublishLogEntry {
  jobId: string;
  batchId?: string;
  platform: string;
  title: string;
  status: "running" | "done" | "error";
  steps: PublishStep[];
  startTime: number;
  endTime?: number;
  result?: string;
}

const LOGS_DIR = path.join(process.cwd(), "data", "publish-logs");

function ensureDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function logPath(jobId: string): string {
  return path.join(LOGS_DIR, `${jobId}.json`);
}

export function createLog(jobId: string, platform: string, title: string, batchId?: string): PublishLogEntry {
  ensureDir();
  const entry: PublishLogEntry = {
    jobId,
    batchId,
    platform,
    title,
    status: "running",
    steps: [],
    startTime: Date.now(),
  };
  fs.writeFileSync(logPath(jobId), JSON.stringify(entry, null, 2));
  return entry;
}

export function addStep(
  jobId: string,
  step: string,
  detail: string,
  extra?: { model?: string; durationMs?: number }
): void {
  try {
    const p = logPath(jobId);
    if (!fs.existsSync(p)) return;
    const entry: PublishLogEntry = JSON.parse(fs.readFileSync(p, "utf-8"));
    entry.steps.push({
      step,
      status: "done",
      detail,
      timestamp: Date.now(),
      model: extra?.model,
      durationMs: extra?.durationMs,
    });
    fs.writeFileSync(p, JSON.stringify(entry, null, 2));
  } catch {
    // 日志写入失败不影响发布
  }
}

export function addErrorStep(jobId: string, step: string, detail: string): void {
  try {
    const p = logPath(jobId);
    if (!fs.existsSync(p)) return;
    const entry: PublishLogEntry = JSON.parse(fs.readFileSync(p, "utf-8"));
    entry.steps.push({
      step,
      status: "error",
      detail,
      timestamp: Date.now(),
    });
    fs.writeFileSync(p, JSON.stringify(entry, null, 2));
  } catch {
    // ignore
  }
}

export function completeLog(jobId: string, status: "done" | "error", result: string): void {
  try {
    const p = logPath(jobId);
    if (!fs.existsSync(p)) return;
    const entry: PublishLogEntry = JSON.parse(fs.readFileSync(p, "utf-8"));
    entry.status = status;
    entry.endTime = Date.now();
    entry.result = result.slice(0, 3000);
    fs.writeFileSync(p, JSON.stringify(entry, null, 2));
  } catch {
    // ignore
  }
}

export function getLog(jobId: string): PublishLogEntry | null {
  try {
    const p = logPath(jobId);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

export interface GroupedLogEntry {
  jobId: string;
  batchId?: string;
  platform: string;
  title: string;
  status: "running" | "done" | "error";
  stepCount: number;
  startTime: number;
  endTime?: number;
  children: (PublishLogEntry & { stepCount: number })[];
}

export interface LogsResult {
  logs: GroupedLogEntry[];
  total: number;
  page: number;
  limit: number;
}

/** 分页获取日志（按 batchId 分组） */
export function listLogs(page = 1, limit = 10): LogsResult {
  ensureDir();
  const p = Math.max(1, page);
  const l = Math.min(Math.max(1, limit), 50);
  try {
    const files = fs.readdirSync(LOGS_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    const all: (PublishLogEntry & { stepCount: number })[] = [];
    for (const f of files) {
      try {
        const entry: PublishLogEntry = JSON.parse(
          fs.readFileSync(path.join(LOGS_DIR, f), "utf-8")
        );
        all.push({ ...entry, stepCount: entry.steps.length });
      } catch { /* skip */ }
    }

    // Group by batchId
    const groups = new Map<string, GroupedLogEntry>();
    const standalone: GroupedLogEntry[] = [];

    for (const entry of all) {
      if (entry.batchId) {
        if (groups.has(entry.batchId)) {
          const g = groups.get(entry.batchId)!;
          g.children.push(entry);
          g.stepCount += entry.stepCount;
          g.startTime = Math.min(g.startTime, entry.startTime);
          if (entry.endTime) g.endTime = Math.max(g.endTime || 0, entry.endTime);
          // Aggregate status
          if (entry.status === "running") g.status = "running";
          else if (entry.status === "error" && g.status !== "running") g.status = "error";
        } else {
          groups.set(entry.batchId, {
            jobId: entry.batchId,
            batchId: entry.batchId,
            platform: "both",
            title: entry.title,
            status: entry.status,
            stepCount: entry.stepCount,
            startTime: entry.startTime,
            endTime: entry.endTime,
            children: [entry],
          });
        }
      } else {
        standalone.push({
          jobId: entry.jobId,
          platform: entry.platform,
          title: entry.title,
          status: entry.status,
          stepCount: entry.stepCount,
          startTime: entry.startTime,
          endTime: entry.endTime,
          children: [entry],
        });
      }
    }

    // Sort by startTime desc
    const grouped = [...groups.values(), ...standalone];
    grouped.sort((a, b) => b.startTime - a.startTime);

    const total = grouped.length;
    const start = (p - 1) * l;
    return {
      logs: grouped.slice(start, start + l),
      total,
      page: p,
      limit: l,
    };
  } catch {
    return { logs: [], total: 0, page: p, limit: l };
  }
}
