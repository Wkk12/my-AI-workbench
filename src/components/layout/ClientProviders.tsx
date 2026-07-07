"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import NotificationProvider from "@/components/notifications/NotificationProvider";
import AppShell from "@/components/layout/AppShell";

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delay={300}>
      <NotificationProvider>
        <AppShell>{children}</AppShell>
      </NotificationProvider>
    </TooltipProvider>
  );
}
