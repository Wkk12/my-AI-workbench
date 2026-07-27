"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getGreeting } from "@/lib/constants";
import NotificationBell from "@/components/notifications/NotificationBell";
import TaskManagerIcon from "@/components/layout/TaskManagerIcon";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function TopBar() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => { setMounted(true); }, []);
  
  const greeting = getGreeting();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  // 空占位避免 hydration mismatch（服务端不渲染动态内容）
  if (!mounted) {
    return (
      <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-background/80 backdrop-blur-sm px-6">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">美少女珂</span>
          </p>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 backdrop-blur-sm px-6">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {greeting} <span className="font-medium text-foreground">美少女珂</span>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <TaskManagerIcon />
        <NotificationBell />
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {new Date().toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="h-7 text-xs text-muted-foreground hover:text-red-500"
        >
          <LogOut className="h-3 w-3 mr-1" />
          登出
        </Button>
      </div>
    </header>
  );
}
