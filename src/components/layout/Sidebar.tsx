"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, CAT_QUOTES } from "@/lib/constants";
import {
  ChevronLeft,
  ChevronRight,
  PanelLeft,
  Cat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(NAV_ITEMS.map((g) => g.title))
  );

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const randomQuote = CAT_QUOTES[Math.floor(Math.random() * CAT_QUOTES.length)];

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-sidebar transition-all duration-300 h-screen sticky top-0",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo 区 */}
      <div className="flex h-14 items-center justify-between px-3 border-b border-sidebar-border">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2 font-bold text-sm">
            <span className="text-lg">🐱</span>
            <span className="text-sidebar-foreground">喵站工作台</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/" className="mx-auto text-lg">
            🐱
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <PanelLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* 导航区 */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {NAV_ITEMS.map((group) => (
          <div key={group.title}>
            {/* 分组标题 */}
            {!collapsed ? (
              <button
                onClick={() => toggleGroup(group.title)}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider hover:text-sidebar-foreground/80 transition-colors"
              >
                <group.icon className="h-4 w-4" />
                {group.title}
              </button>
            ) : (
              <div className="flex justify-center py-1">
                <Tooltip>
                  <TooltipTrigger>
                    <button
                      onClick={() => toggleGroup(group.title)}
                      className="p-2 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors"
                    >
                      <group.icon className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{group.title}</TooltipContent>
                </Tooltip>
              </div>
            )}

            {/* 子菜单 */}
            {openGroups.has(group.title) &&
              group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));
                const Icon = item.icon;

                if (collapsed) {
                  return (
                    <div key={item.href} className="flex justify-center py-0.5">
                      <Tooltip>
                        <TooltipTrigger>
                          <Link
                            href={item.badge ? "#" : item.href}
                            className={cn(
                              "p-2 rounded-lg transition-colors",
                              isActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
                              item.badge && "opacity-50 cursor-not-allowed"
                            )}
                            onClick={(e) => item.badge && e.preventDefault()}
                          >
                            <Icon className="h-4 w-4" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          {item.title}
                          {item.badge && ` (${item.badge})`}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.badge ? "#" : item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 ml-2 rounded-lg text-sm transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
                      item.badge && "opacity-50 cursor-not-allowed"
                    )}
                    onClick={(e) => item.badge && e.preventDefault()}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{item.title}</span>
                    {item.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sidebar-accent text-sidebar-accent-foreground/60">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>

      {/* 底部 - 奶油猫猫 */}
      <div className="border-t border-sidebar-border p-3">
        {collapsed ? (
          <div className="flex justify-center">
            <Tooltip>
              <TooltipTrigger>
                <div className="cursor-pointer text-lg hover:scale-110 transition-transform">
                  🐱
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">{randomQuote}</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger>
              <div className="flex items-center gap-2 cursor-pointer group">
                <span className="text-xl group-hover:scale-110 transition-transform">
                  🐱
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-sidebar-foreground truncate">
                    奶油
                  </p>
                  <p className="text-[10px] text-sidebar-foreground/50 truncate">
                    陪伴你工作的小猫咪
                  </p>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">{randomQuote}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </aside>
  );
}
