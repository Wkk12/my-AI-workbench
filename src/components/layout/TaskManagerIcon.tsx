"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCw,
  X,
  ImageIcon,
  Send,
} from "lucide-react";
import { useBackgroundTasks, type BackgroundTask } from "@/lib/background-tasks";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  image_generation: <ImageIcon className="h-3.5 w-3.5" />,
  publish: <Send className="h-3.5 w-3.5" />,
  generic: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
};

const TYPE_LABELS: Record<string, string> = {
  image_generation: "🎨 图片生成",
  publish: "📤 发布",
  generic: "⚙️ 任务",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  return `${Math.floor(hr / 24)}天前`;
}

function TaskItem({ task }: { task: BackgroundTask }) {
  const { removeTask } = useBackgroundTasks();
  const pct =
    task.progress && task.progress.total > 0
      ? Math.round((task.progress.done / task.progress.total) * 100)
      : null;

  return (
    <div className="px-3 py-2.5 hover:bg-muted/50 transition-colors group">
      <div className="flex items-start gap-2.5">
        {/* 图标 */}
        <div className="shrink-0 mt-0.5">
          {task.status === "done" ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : task.status === "error" ? (
            <XCircle className="h-4 w-4 text-destructive" />
          ) : (
            TYPE_ICONS[task.type] || TYPE_ICONS.generic
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* 标题行 */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <span className="text-muted-foreground">
                  {TYPE_LABELS[task.type]}
                </span>
                <span className="truncate">{task.title}</span>
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeTask(task.id);
              }}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          </div>

          {/* 进度条 */}
          {task.status === "running" && (
            <div className="mt-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${pct ?? 0}%` }}
                  />
                </div>
                {pct !== null && (
                  <span className="text-[10px] text-muted-foreground font-mono tabular-nums w-8 text-right">
                    {pct}%
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 消息 */}
          <p
            className={`text-[10px] mt-1 truncate ${
              task.status === "error"
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {task.message}
          </p>

          {/* 时间 + 按钮 */}
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground/60">
              {timeAgo(task.createdAt)}
            </span>
            {task.status === "error" && task.onRetry && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px] gap-1 text-destructive hover:text-destructive"
                onClick={task.onRetry}
              >
                <RotateCw className="h-2.5 w-2.5" />
                重试
              </Button>
            )}
            {task.status === "error" && !task.onRetry && (
              <Badge variant="destructive" className="text-[10px] h-4 px-1">
                失败
              </Badge>
            )}
            {task.status === "done" && (
              <Badge
                variant="secondary"
                className="text-[10px] h-4 px-1 bg-green-100 text-green-700 border-green-200"
              >
                完成
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TaskManagerIcon() {
  const { tasks } = useBackgroundTasks();
  const [open, setOpen] = useState(false);

  const runningCount = tasks.filter((t) => t.status === "running").length;
  const hasRunning = runningCount > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Activity
            className={`h-4 w-4 ${hasRunning ? "text-primary animate-pulse" : ""}`}
          />
          {runningCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {runningCount > 9 ? "9+" : runningCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-2.5 shrink-0">
          <span className="text-sm font-medium flex items-center gap-1.5">
            ⚡ 后台任务
            {runningCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                {runningCount} 个运行中
              </Badge>
            )}
          </span>
        </div>
        <Separator className="shrink-0" />

        {/* 列表 */}
        {tasks.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p>暂无后台任务</p>
            <p className="text-xs mt-0.5">生成图片、发布等操作会在这里显示</p>
          </div>
        ) : (
          <ScrollArea className="flex-1" style={{ maxHeight: 360 }}>
            <div className="divide-y divide-border/50">
              {[...tasks].reverse().map((t) => (
                <TaskItem key={t.id} task={t} />
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
