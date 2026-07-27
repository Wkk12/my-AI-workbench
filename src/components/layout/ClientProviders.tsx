"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotificationProvider from "@/components/notifications/NotificationProvider";
import { BackgroundTasksProvider } from "@/lib/background-tasks";
import AppShell from "@/components/layout/AppShell";

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  // 登录页：完全不加载 AppShell/NotificationProvider（裸渲染，最稳定）
  if (isLoginPage) {
    return <>{children}</>;
  }

  // 手机非登录页：加载 AppShell 但跳过 NotificationProvider（WebView 不兼容）
  // 桌面非登录页：完整加载
  return (
    <TooltipProvider delay={300}>
      <BackgroundTasksProvider>
      {isMobile ? (
        <AppShell>{children}</AppShell>
      ) : (
        <NotificationProvider>
          <AppShell>{children}</AppShell>
        </NotificationProvider>
      )}
      </BackgroundTasksProvider>
    </TooltipProvider>
  );
}
