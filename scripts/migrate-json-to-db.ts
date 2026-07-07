// ============================================================
// 数据迁移脚本：将 data/ 下所有 JSON 文件迁移到 SQLite
// 用法: npx tsx scripts/migrate-json-to-db.ts
// ============================================================

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import fs from "fs";
import path from "path";

const dbPath = path.resolve(process.cwd(), "dev.db");
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: `file:${dbPath}` }),
});
const DATA_ROOT = path.resolve(process.cwd(), "data");

function readJSONSafe<T>(relativePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(path.join(DATA_ROOT, relativePath), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function migrateSettings() {
  console.log("📋 迁移系统设置...");
  const settingsPath = "settings.json";
  const fullPath = path.join(DATA_ROOT, settingsPath);
  if (!fs.existsSync(fullPath)) {
    console.log("  ⚠️ settings.json 不存在，跳过");
    return;
  }
  const raw = fs.readFileSync(fullPath, "utf-8");
  await prisma.setting.upsert({
    where: { key: "settings" },
    update: { value: raw },
    create: { key: "settings", value: raw },
  });
  console.log("  ✅ 系统设置已迁移");
}

async function migrateContents() {
  console.log("📋 迁移内容创作数据...");
  const data = readJSONSafe<{ contents: any[] }>("contents/index.json", { contents: [] });
  if (data.contents.length === 0) {
    console.log("  ⚠️ 无内容数据，跳过");
    return;
  }
  for (const item of data.contents) {
    await prisma.content.upsert({
      where: { id: item.id },
      update: {
        title: item.title || "",
        description: item.description || "",
        platform: item.platform || "xiaohongshu",
        status: item.status || "draft",
        tags: JSON.stringify(item.tags || []),
        imagePrompt: item.imagePrompt || "",
        publishedAt: item.publishedAt || null,
        scheduledAt: item.scheduledAt || null,
        mediaPaths: JSON.stringify(item.mediaPaths || []),
        aiGenerated: item.aiGenerated ?? false,
        stats: item.stats ? JSON.stringify(item.stats) : null,
        ipId: item.ipId || null,
        ipName: item.ipName || null,
        imageCount: item.imageCount ?? 1,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      },
      create: {
        id: item.id,
        title: item.title || "",
        description: item.description || "",
        platform: item.platform || "xiaohongshu",
        status: item.status || "draft",
        tags: JSON.stringify(item.tags || []),
        imagePrompt: item.imagePrompt || "",
        publishedAt: item.publishedAt || null,
        scheduledAt: item.scheduledAt || null,
        mediaPaths: JSON.stringify(item.mediaPaths || []),
        aiGenerated: item.aiGenerated ?? false,
        stats: item.stats ? JSON.stringify(item.stats) : null,
        ipId: item.ipId || null,
        ipName: item.ipName || null,
        imageCount: item.imageCount ?? 1,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      },
    });
  }
  console.log(`  ✅ ${data.contents.length} 条内容已迁移`);
}

async function migrateProjects() {
  console.log("📋 迁移项目数据...");
  const data = readJSONSafe<{ projects: any[] }>("projects/index.json", { projects: [] });
  if (data.projects.length === 0) {
    console.log("  ⚠️ 无项目数据，跳过");
    return;
  }
  for (const item of data.projects) {
    await prisma.project.upsert({
      where: { id: item.id },
      update: {
        title: item.name || item.title || "",
        description: item.description || "",
        status: item.status || "idea",
        icon: item.icon || "",
        techStack: JSON.stringify(item.techStack || []),
        tasks: JSON.stringify(item.tasks || []),
        milestones: JSON.stringify(item.milestones || []),
        revenue: item.revenue ?? null,
        notes: item.notes || "",
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      },
      create: {
        id: item.id,
        title: item.name || item.title || "",
        description: item.description || "",
        status: item.status || "idea",
        icon: item.icon || "",
        techStack: JSON.stringify(item.techStack || []),
        tasks: JSON.stringify(item.tasks || []),
        milestones: JSON.stringify(item.milestones || []),
        revenue: item.revenue ?? null,
        notes: item.notes || "",
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      },
    });
  }
  console.log(`  ✅ ${data.projects.length} 个项目已迁移`);
}

async function migrateIdeas() {
  console.log("📋 迁移创意灵感数据...");
  const data = readJSONSafe<{ ideas: any[] }>("ideas/index.json", { ideas: [] });
  if (data.ideas.length === 0) {
    console.log("  ⚠️ 无灵感数据，跳过");
    return;
  }
  for (const item of data.ideas) {
    await prisma.idea.upsert({
      where: { id: item.id },
      update: {
        title: item.content?.slice(0, 50) || item.title || "",
        content: item.content || "",
        tags: JSON.stringify(item.tags || []),
        category: item.category || "other",
        source: item.source || "",
        status: item.status || "new",
        linkedProjectId: item.linkedProjectId || null,
        aiExpanded: item.aiExpanded || "",
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      },
      create: {
        id: item.id,
        title: item.content?.slice(0, 50) || item.title || "",
        content: item.content || "",
        tags: JSON.stringify(item.tags || []),
        category: item.category || "other",
        source: item.source || "",
        status: item.status || "new",
        linkedProjectId: item.linkedProjectId || null,
        aiExpanded: item.aiExpanded || "",
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      },
    });
  }
  console.log(`  ✅ ${data.ideas.length} 条灵感已迁移`);
}

async function migrateDailyReports() {
  console.log("📋 迁移日报数据...");
  const data = readJSONSafe<{ reports: any[] }>("daily-reports/index.json", { reports: [] });
  if (data.reports.length === 0) {
    console.log("  ⚠️ 无日报数据，跳过");
    return;
  }
  for (const item of data.reports) {
    // 读取 markdown 内容
    let content = "";
    try {
      const mdPath = path.join(DATA_ROOT, "daily-reports", "reports", `${item.id}.md`);
      if (fs.existsSync(mdPath)) {
        content = fs.readFileSync(mdPath, "utf-8");
      }
    } catch { /* ignore */ }

    await prisma.dailyReport.upsert({
      where: { id: item.id },
      update: {
        date: item.date || item.id || "",
        projectCount: item.projectCount ?? 0,
        commitCount: item.commitCount ?? 0,
        source: item.source || "local",
        summary: item.summary || "",
        content,
        createdAt: item.createdAt || new Date().toISOString(),
      },
      create: {
        id: item.id,
        date: item.date || item.id || "",
        projectCount: item.projectCount ?? 0,
        commitCount: item.commitCount ?? 0,
        source: item.source || "local",
        summary: item.summary || "",
        content,
        createdAt: item.createdAt || new Date().toISOString(),
      },
    });
  }
  console.log(`  ✅ ${data.reports.length} 篇日报已迁移`);
}

async function migrateSubscriptions() {
  console.log("📋 迁移订阅数据...");
  const data = readJSONSafe<{ subscriptions: any[] }>("subscriptions/index.json", { subscriptions: [] });
  if (data.subscriptions.length === 0) {
    console.log("  ⚠️ 无订阅数据，跳过");
    return;
  }
  for (const item of data.subscriptions) {
    await prisma.subscription.upsert({
      where: { id: item.id },
      update: {
        name: item.name || "",
        category: item.category || "other",
        cycle: item.cycle || "month",
        amount: item.amount ?? 0,
        startDate: item.startDate || "",
        expireDate: item.expireDate || "",
        autoRenew: item.autoRenew ?? true,
        provider: item.provider || "",
        notes: item.notes || "",
        history: JSON.stringify(item.history || []),
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      },
      create: {
        id: item.id,
        name: item.name || "",
        category: item.category || "other",
        cycle: item.cycle || "month",
        amount: item.amount ?? 0,
        startDate: item.startDate || "",
        expireDate: item.expireDate || "",
        autoRenew: item.autoRenew ?? true,
        provider: item.provider || "",
        notes: item.notes || "",
        history: JSON.stringify(item.history || []),
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      },
    });
  }
  console.log(`  ✅ ${data.subscriptions.length} 条订阅已迁移`);
}

async function migrateScheduledTasks() {
  console.log("📋 迁移定时任务数据...");
  const data = readJSONSafe<{ tasks: any[] }>("scheduler/index.json", { tasks: [] });
  if (data.tasks.length === 0) {
    console.log("  ⚠️ 无定时任务数据，跳过");
    return;
  }
  for (const item of data.tasks) {
    await prisma.scheduledTask.upsert({
      where: { id: item.id },
      update: {
        name: item.name || "",
        enabled: item.enabled ?? true,
        actionType: item.actionType || "custom",
        schedule: item.schedule || "",
        daysOfWeek: JSON.stringify(item.daysOfWeek || []),
        config: JSON.stringify(item.config || {}),
        lastRun: item.lastRun || null,
        lastResult: item.lastResult || "",
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      },
      create: {
        id: item.id,
        name: item.name || "",
        enabled: item.enabled ?? true,
        actionType: item.actionType || "custom",
        schedule: item.schedule || "",
        daysOfWeek: JSON.stringify(item.daysOfWeek || []),
        config: JSON.stringify(item.config || {}),
        lastRun: item.lastRun || null,
        lastResult: item.lastResult || "",
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      },
    });
  }
  console.log(`  ✅ ${data.tasks.length} 个定时任务已迁移`);
}

async function migrateIPS() {
  console.log("📋 迁移 IP 管理数据...");
  const data = readJSONSafe<{ ips: any[] }>("ips/index.json", { ips: [] });
  if (data.ips.length === 0) {
    console.log("  ⚠️ 无 IP 数据，跳过");
    return;
  }
  for (const item of data.ips) {
    await prisma.iPItem.upsert({
      where: { id: item.id },
      update: {
        name: item.name || "",
        description: item.description || "",
        imagePath: item.imagePath || "",
        stylePrompt: item.stylePrompt || "",
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      },
      create: {
        id: item.id,
        name: item.name || "",
        description: item.description || "",
        imagePath: item.imagePath || "",
        stylePrompt: item.stylePrompt || "",
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      },
    });
  }
  console.log(`  ✅ ${data.ips.length} 个 IP 已迁移`);
}

async function migrateChatSessions() {
  console.log("📋 迁移 AI 会话数据...");
  const data = readJSONSafe<{ sessions: any[] }>("ai/sessions/index.json", { sessions: [] });
  if (data.sessions.length === 0) {
    console.log("  ⚠️ 无会话数据，跳过");
    return;
  }
  for (const meta of data.sessions) {
    // 读取完整会话 JSON
    let messages = "[]";
    try {
      const sessionPath = path.join(DATA_ROOT, "ai", "sessions", `${meta.id}.json`);
      if (fs.existsSync(sessionPath)) {
        const sessionData = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
        messages = JSON.stringify(sessionData.messages || []);
      }
    } catch { /* ignore */ }

    await prisma.chatSession.upsert({
      where: { id: meta.id },
      update: {
        title: meta.title || "",
        messages,
        createdAt: meta.createdAt || new Date().toISOString(),
        updatedAt: meta.updatedAt || new Date().toISOString(),
      },
      create: {
        id: meta.id,
        title: meta.title || "",
        messages,
        createdAt: meta.createdAt || new Date().toISOString(),
        updatedAt: meta.updatedAt || new Date().toISOString(),
      },
    });
  }
  console.log(`  ✅ ${data.sessions.length} 个会话已迁移`);
}

async function main() {
  console.log("🚀 开始数据迁移：JSON → SQLite\n");

  await migrateSettings();
  await migrateContents();
  await migrateProjects();
  await migrateIdeas();
  await migrateDailyReports();
  await migrateSubscriptions();
  await migrateScheduledTasks();
  await migrateIPS();
  await migrateChatSessions();

  console.log("\n🎉 数据迁移完成！");
  console.log("💡 提示：原 data/ 目录下的 JSON 文件已保留作为备份。");
}

main()
  .catch((e) => {
    console.error("❌ 迁移失败:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
