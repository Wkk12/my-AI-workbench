/**
 * 定时任务服务端心跳
 * 每 30 秒 ping /api/scheduler/run，让调度器不依赖浏览器打开
 */

let started = false;

export function schedulerHeartbeat() {
  if (started) return;
  started = true;

  const PORT = process.env.PORT || "3000";
  const BASE_URL = `http://localhost:${PORT}`;

  async function tick() {
    try {
      await fetch(`${BASE_URL}/api/scheduler/run`, { signal: AbortSignal.timeout(25_000) });
    } catch {
      // 忽略网络错误（服务可能还没就绪）
    }
  }

  // 启动后等 5 秒让服务就绪，然后每 30 秒检查
  setTimeout(() => {
    tick(); // 立即执行一次
    setInterval(tick, 30_000);
  }, 5_000);
}
