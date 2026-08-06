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

let _idCounter = 0;
function genId(): string {
  return `n_${Date.now()}_${++_idCounter}`;
}

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
  isTesting: boolean;
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
  isTesting: false,
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
  const [isTesting, setIsTesting] = useState(false);
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
  // 策略：1. SW postMessage（最可靠） 2. Registration.showNotification 3. 直接 Notification
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
    if (p !== "granted") {
      diag(`权限="${p}"，需授权`, false);
      return false;
    }

    const fullTitle = `🐱 ${title}`;
    const trimmedBody = body.slice(0, 200);

    // 方式1: Service Worker postMessage（最可靠，免用户手势）
    if (navigator.serviceWorker?.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: "SHOW_NOTIFICATION",
          title: fullTitle,
          body: trimmedBody,
          requireInteraction: false,
        });
        diag(`SW消息: ${title.slice(0, 20)}`, true);
        return true;
      } catch (e: unknown) {
        diag(`SW消息异常: ${String(e)}`, false);
      }
    }

    // 方式2: Registration.showNotification
    if (swRef.current) {
      try {
        swRef.current.showNotification(fullTitle, {
          body: trimmedBody,
          requireInteraction: false,
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

    // 方式3: 直接 Notification（Safari 需要 HTTPS + 用户手势，可能被忽略）
    try {
      new window.Notification(fullTitle, {
        body: trimmedBody,
        icon: "/file.svg",
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
      // 去重：同一 taskId 的最近一条与当前内容相同 → 跳过
      setNotifications((prev) => {
        if (n.taskId) {
          const lastSame = prev.find((existing) => existing.taskId === n.taskId);
          if (lastSame && lastSame.body === n.body && lastSame.type === n.type) {
            // 内容完全一样，不重复添加
            return prev;
          }
        }
        const item: AppNotification = {
          ...n,
          id: genId(),
          read: false,
          createdAt: new Date().toISOString(),
        };
        return [item, ...prev];
      });

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

  const testDesktopNotification = useCallback(async () => {
    if (isTesting) return;
    setIsTesting(true);
    try {
      // 检查权限
      if (permission !== "granted") {
        addNotification({ 
          title: "⚠️ 需要授权", 
          body: "请先点击「授权」按钮开启桌面通知权限", 
          type: "error" 
        });
        return;
      }

      const platform = navigator.platform || "";
      const isMac = /Mac|iPhone|iPad/.test(platform);

      // 方式1：直接发浏览器原生通知（最可靠，点击时已有用户手势）
      let nativeOk = false;
      try {
        new window.Notification("🧪 测试通知", {
          body: isMac ? "来自喵站工作台 — 右上角通知中心查看" : "来自喵站工作台 — 右下角操作中心查看",
          icon: "/file.svg",
          // 不加 tag，允许重复弹窗
        });
        nativeOk = true;
      } catch { nativeOk = false; }

      // 方式2：如果直接通知失败，走 SW 通道
      if (!nativeOk) {
        nativeOk = sendNativeNotification(
          "🧪 测试通知",
          isMac ? "来自喵站工作台 — 请在右上角通知中心查看" : "来自喵站工作台 — 请在右下角操作中心查看"
        );
      }

      // 方式3：服务端验证（快速超时）
      let serverOk = false;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        const resp = await fetch("/api/notify-test", { method: "POST", signal: ctrl.signal });
        clearTimeout(t);
        const data = await resp.json();
        serverOk = data.success;
      } catch { serverOk = false; }

      if (nativeOk || serverOk) {
        addNotification({ 
          title: "✅ 通知已发送", 
          body: `${nativeOk ? "浏览器原生通知" : ""}${nativeOk && serverOk ? " + " : ""}${serverOk ? "服务端验证通过" : ""}\n${
            isMac ? "请检查屏幕右上角通知中心" : "请检查屏幕右下角操作中心"
          }`,
          type: "success" 
        });
      } else {
        addNotification({ 
          title: "❌ 发送失败", 
          body: "请刷新页面后重试，或检查系统通知设置", 
          type: "error" 
        });
      }
    } catch {
      addNotification({ title: "❌ 请求失败", body: "未知错误", type: "error" });
    } finally {
      setIsTesting(false);
    }
  }, [isTesting, permission, sendNativeNotification, addNotification]);

  // 自动轮询
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/scheduler/run", { credentials: "include" });
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
        isTesting,
        diagLog,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
