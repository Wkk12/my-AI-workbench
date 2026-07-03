"use client";

import { getGreeting } from "@/lib/constants";

export default function TopBar() {
  const greeting = getGreeting();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 backdrop-blur-sm px-6">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {greeting} <span className="font-medium text-foreground">美少女珂</span>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </span>
      </div>
    </header>
  );
}
