"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { v4 as uuidv4 } from "uuid";

// ── 类型 ──

export interface AppNotification {
  id: string;
  taskId?: string;
  title: string;
  body: string;
  type: "success" | "info" | "error";
  read: boolean;
  createdAt: string;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, "id" | "read" | "createdAt">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  permission: NotificationPermission;
  requestPermission: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  addNotification: () => {},
  markRead: () => {},
  markAllRead: () => {},
  removeNotification: () => {},
  clearAll: () => {},
  permission: "default",
  requestPermission: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

const STORAGE_KEY = "meow-notifications";
const MAX_NOTIFICATIONS = 50;

function loadFromStorage(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(notifications: AppNotification[]) {
  try {
    const trimmed = notifications.slice(0, MAX_NOTIFICATIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

// ── Provider ──

export default function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCheckRef = useRef<string>("");

  // 初始化
  useEffect(() => {
    setNotifications(loadFromStorage());
    setPermission(Notification.permission || "default");
  }, []);

  // 持久化
  useEffect(() => {
    saveToStorage(notifications);
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // 浏览器桌面通知
  const showDesktopNotification = useCallback((title: string, body: string) => {
    if (permission === "granted") {
      try {
        new Notification(title, {
          body: body.slice(0, 200),
          icon: "/favicon.ico",
          tag: "meow-scheduler",
        });
      } catch { /* ignore */ }
    }
  }, [permission]);

  const addNotification = useCallback(
    (n: Omit<AppNotification, "id" | "read" | "createdAt">) => {
      const item: AppNotification = {
        ...n,
        id: uuidv4(),
        read: false,
        createdAt: new Date().toISOString(),
      };
      setNotifications((prev) => [item, ...prev]);
      showDesktopNotification(n.title, n.body);
    },
    [showDesktopNotification]
  );

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const requestPermission = useCallback(() => {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then((p) => {
      setPermission(p);
    });
  }, []);

  // 请求通知权限
  useEffect(() => {
    if (permission === "default") {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // 自动轮询定时任务
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/scheduler/run");
        const data = await res.json();
        if (data.executed > 0 && Array.isArray(data.results)) {
          for (const r of data.results) {
            const isSuccess = !r.result.startsWith("失败") && !r.result.startsWith("错误");
            addNotification({
              taskId: r.id,
              title: `${r.name}`,
              body: r.result.slice(0, 200),
              type: isSuccess ? "success" : "error",
            });
          }
        }
      } catch { /* ignore poll errors */ }
    };

    pollingRef.current = setInterval(poll, 60_000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [addNotification]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markRead,
        markAllRead,
        removeNotification,
        clearAll,
        permission,
        requestPermission,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
