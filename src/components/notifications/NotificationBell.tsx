"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, Trash2, X } from "lucide-react";
import { useNotifications, type AppNotification } from "./NotificationProvider";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<string, string> = {
  success: "✅",
  info: "🔔",
  error: "❌",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const d = Math.floor(hr / 24);
  return `${d} 天前`;
}

export default function NotificationBell() {
  const {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    removeNotification,
    clearAll,
    permission,
    requestPermission,
    testDesktopNotification,
    diagLog,
  } = useNotifications();

  const [open, setOpen] = useState(false);

  const handleItemClick = (n: AppNotification) => {
    if (!n.read) markRead(n.id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className={`h-4 w-4 ${permission !== "granted" ? "text-amber-500 animate-pulse" : ""}`} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          {permission !== "granted" && unreadCount === 0 && (
            <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-amber-500" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-sm font-medium flex items-center gap-1.5">
            🔔 通知中心
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                {unreadCount} 条未读
              </Badge>
            )}
          </span>
          <div className="flex gap-1">
            {permission !== "granted" && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs border-amber-300 text-amber-600 hover:bg-amber-50"
                onClick={requestPermission}
              >
                {permission === "denied" ? "⚠️ 通知已阻止 (点此重试)" : "🔔 开启桌面通知"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={markAllRead}
              title="全部已读"
            >
              <CheckCheck className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={clearAll}
              title="清空"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <Separator />

        {/* 列表 */}
        {notifications.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p>暂无通知</p>
            <p className="text-xs mt-0.5">定时任务执行结果会出现在这里</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="divide-y divide-border/50">
              {notifications.slice(0, 30).map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "group px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors",
                    !n.read && "bg-primary/5"
                  )}
                  onClick={() => handleItemClick(n)}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-lg shrink-0 mt-0.5">
                      {TYPE_ICONS[n.type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium truncate">
                          {n.title}
                        </p>
                        <button
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeNotification(n.id);
                          }}
                        >
                          <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {n.body}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground/60">
                          {timeAgo(n.createdAt)}
                        </span>
                        {!n.read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
        {/* 权限状态 + 测试按钮 */}
        <div className="px-4 py-2 border-t space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${permission === "granted" ? "bg-green-500" : permission === "denied" ? "bg-red-500" : "bg-amber-500"}`} />
              {permission === "granted"
                ? "桌面通知已开启"
                : permission === "denied"
                ? "桌面通知已阻止"
                : "桌面通知未开启"}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={testDesktopNotification}>
                🧪 测试
              </Button>
              {permission !== "granted" && (
                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-amber-600" onClick={requestPermission}>
                  授权
                </Button>
              )}
            </div>
          </div>
          {/* 诊断日志（最近 3 条） */}
          {diagLog.length > 0 && (
            <div className="space-y-0.5 max-h-20 overflow-y-auto">
              {diagLog.slice(0, 3).map((d, i) => (
                <div key={i} className={`text-[10px] ${d.ok ? "text-green-600" : "text-red-500"}`}>
                  {d.time} {d.ok ? "✅" : "❌"} {d.msg}
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
