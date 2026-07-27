/**
 * Next.js instrumentation — 服务端启动钩子
 * 启动定时任务调度器心跳，每分钟检查并执行到期任务
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { schedulerHeartbeat } = await import("./src/lib/scheduler-heartbeat");
    schedulerHeartbeat();
    console.log("[scheduler] 心跳已启动，每 30s 检查一次到期任务");
  }
}
