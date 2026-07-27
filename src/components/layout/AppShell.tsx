"use client";

import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import TunnelBanner from "./TunnelBanner";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // 移动端：简化布局，不渲染 sidebar/topbar/tunnelbanner
  if (isMobile) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="shrink-0 border-b bg-background px-4 py-3">
          <h1 className="text-lg font-bold">喵站工作台</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-4">
          {mounted ? children : <div className="text-center py-12 text-muted-foreground">加载中...</div>}
        </main>
      </div>
    );
  }

  // 桌面端：完整布局
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TunnelBanner />
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          {mounted ? children : null}
        </main>
      </div>
    </div>
  );
}
