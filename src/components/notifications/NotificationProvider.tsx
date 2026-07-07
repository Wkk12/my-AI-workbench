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

export interface DiagEntry {
  time: string;
  msg: string;
  ok: boolean;
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
  testDesktopNotification: () => void;
  diagLog: DiagEntry[];
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
  testDesktopNotification: () => {},
  diagLog: [],
});

export function useNotifications() {
  return useContext(NotificationContext);
}

const STORAGE_KEY = "meow-notifications";
const MAX_NOTIFICATIONS = 50;
const MAX_DIAG = 30;

function loadFromStorage(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveToStorage(notifications: AppNotification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
  } catch { /* ignore */ }
}

function now(): string {
  return new Date().toLocaleTimeString("zh-CN");
}

// ── Provider ──

export default function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [diagLog, setDiagLog] = useState<DiagEntry[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const swRef = useRef<ServiceWorkerRegistration | null>(null);
  const swReadyRef = useRef(false);

  const diag = useCallback((msg: string, ok: boolean) => {
    setDiagLog((prev) => [{ time: now(), msg, ok }, ...prev.slice(0, MAX_DIAG - 1)]);
    if (!ok) console.warn(`[通知诊断] ${msg}`);
    else console.log(`[通知诊断] ${msg}`);
  }, []);

  // 初始化 & 注册 Service Worker
  useEffect(() => {
    setNotifications(loadFromStorage());
    const p = Notification.permission || "default";
    setPermission(p);
    diag(`初始化: Notification.permission = "${p}", 支持Notification = ${"Notification" in window}`, p === "granted");

    // 注册 Service Worker 用于可靠跨平台桌面通知
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
        .then(async (reg) => {
          swRef.current = reg;
          // 等待 SW 激活并就绪（skipWaiting + claim 生效）
          if (reg.installing) {
            await new Promise<void>((resolve) => {
              reg.installing!.addEventListener("statechange", () => {
                if (reg.installing!.state === "activated") resolve();
              });
            });
          }
          // 等待 controller 就绪（clients.claim 生效）
          if (!navigator.serviceWorker.controller) {
            await new Promise<void>((resolve) => {
              const onControllerChange = () => {
                navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
                resolve();
              };
              navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
            });
          }
          swReadyRef.current = true;
          diag("Service Worker 已注册并就绪", true);
        })
        .catch((err) => {
          diag(`Service Worker 注册失败: ${err.message}`, false);
        });
    } else {
      diag("浏览器不支持 Service Worker", false);
    }
  }, [diag]);

  // 持久化
  useEffect(() => {
    saveToStorage(notifications);
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ── 核心：发送桌面通知 ──
  // 优先通过 ServiceWorkerRegistration.showNotification() 发送
  // （不依赖 navigator.serviceWorker.controller，SW 注册完即可用）
  // 降级方案：直接使用 window.Notification
  const sendNativeNotification = useCallback((title: string, body: string): boolean => {
    if (typeof window === "undefined") {
      diag("SSR 环境，跳过", false);
      return false;
    }
    if (!("Notification" in window)) {
      diag("浏览器不支持 Notification", false);
      return false;
    }

    const p = Notification.permission;
    diag(`权限="${p}"`, p === "granted");

    if (p === "denied") {
      diag("权限被拒。系统设置→通知→允许浏览器通知", false);
      return false;
    }
    if (p === "default") {
      diag("权限未决定，需用户手势授权（点击铃铛→测试通知）", false);
      return false;
    }

    const fullTitle = `🐱 ${title}`;
    const trimmedBody = body.slice(0, 200);

    // 通过 ServiceWorkerRegistration.showNotification() 发送
    // 不需要 controller 已激活，SW registration 对象可直接调用
    if (swRef.current) {
      try {
        swRef.current.showNotification(fullTitle, {
          body: trimmedBody,
          requireInteraction: true,
          icon: "/file.svg",
          badge: "/file.svg",
          tag: "meow-workbench",
        });
        diag(`SW显示: ${title.slice(0, 20)}`, true);
        return true;
      } catch (e: unknown) {
        diag(`SW显示异常: ${String(e)}，降级直接发送`, false);
      }
    }

    // 降级：直接使用 Notification API（Safari 无用户手势时可能被忽略）
    try {
      new window.Notification(fullTitle, {
        body: trimmedBody,
        requireInteraction: true,
        icon: "/file.svg",
        badge: "/file.svg",
        tag: "meow-workbench",
      });
      diag(`直接发送: ${title.slice(0, 20)}`, true);
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? (e as Error).message : String(e);
      diag(`异常: ${msg}`, false);
      return false;
    }
  }, [diag]);

  const addNotification = useCallback(
    (n: Omit<AppNotification, "id" | "read" | "createdAt">) => {
      // 先加入应用内通知列表（铃铛）
      const item: AppNotification = {
        ...n,
        id: uuidv4(),
        read: false,
        createdAt: new Date().toISOString(),
      };
      setNotifications((prev) => [item, ...prev]);

      // 再尝试桌面通知
      const sent = sendNativeNotification(n.title, n.body);
      if (!sent) {
        diag(`桌面通知未发送，仅显示在铃铛中`, false);
      }
    },
    [sendNativeNotification, diag]
  );

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
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

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      addNotification({ title: "❌ 不支持", body: "你的浏览器不支持桌面通知，请使用 Chrome", type: "error" });
      return;
    }
    diag("请求权限...", true);
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      diag(`结果: "${p}"`, p === "granted");

      if (p === "granted") {
        sendNativeNotification("喵站工作台", "桌面通知已开启！");
        addNotification({ title: "✅ 通知已开启", body: "桌面通知现在可用了", type: "success" });
      } else if (p === "denied") {
        addNotification({
          title: "❌ 权限被拒",
          body: "地址栏锁图标 → 通知 → 允许 → 刷新",
          type: "error",
        });
      }
    } catch (e: unknown) {
      diag(`异常: ${String(e)}`, false);
    }
  }, [sendNativeNotification, addNotification, diag]);

  const testDesktopNotification = useCallback(() => {
    diag("=== 手动测试 ===", true);
    const p = window.Notification?.permission || "unsupported";

    if (p === "granted") {
      const ok = sendNativeNotification("测试通知", `喵站工作台通知正常！${now()}`);
      addNotification({
        title: ok ? "✅ 通知已发送" : "❌ 发送失败",
        body: ok ? "检查屏幕右上角（Mac）或右下角（Win）" : "查看诊断日志",
        type: ok ? "success" : "error",
      });
    } else if (p === "denied") {
      addNotification({
        title: "❌ 权限被阻止",
        body: "Mac: 系统设置→通知→浏览器→允许 / Win: 地址栏锁图标→通知→允许",
        type: "error",
      });
    } else if (p === "default") {
      window.Notification.requestPermission().then((newP) => {
        setPermission(newP);
        if (newP === "granted") {
          sendNativeNotification("喵站工作台", "通知已开启！");
          addNotification({ title: "✅ 通知已开启", body: "桌面通知现在可用了", type: "success" });
        } else {
          addNotification({ title: "⚠️ 未授权", body: "需要允许通知权限才能弹窗", type: "error" });
        }
      });
    } else {
      addNotification({ title: "❌ 不支持", body: "请使用 Chrome 或 Safari 浏览器", type: "error" });
    }
  }, [sendNativeNotification, addNotification, diag]);

  // 自动轮询
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/scheduler/run");
        const data = await res.json();
        if (data.executed > 0 && Array.isArray(data.results)) {
          for (const r of data.results) {
            const isFail = /失败|错误|未安装|未找到|异常/.test(r.result);
            addNotification({
              taskId: r.id,
              title: r.name,
              body: r.result.slice(0, 200),
              type: isFail ? "error" : "success",
            });
          }
        }
      } catch { /* ignore */ }
    };

    pollingRef.current = setInterval(poll, 30_000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
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
        testDesktopNotification,
        diagLog,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
