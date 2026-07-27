// ============================================================
// 已发布文章注册表
// 防止同一篇文章被重复发布
// ============================================================

import fs from "fs";
import path from "path";

const REGISTRY_PATH = path.join(process.cwd(), "data", "published-registry.json");

export interface PublishedEntry {
  /** 文章指纹（topic 的标准化哈希） */
  fingerprint: string;
  /** 原始主题/标题 */
  topic: string;
  /** 发布平台 */
  platform: string;
  /** 发布成功的 jobId */
  jobId: string;
  /** 发布成功时间 */
  publishedAt: string;
  /** AI 生成的标题（用于人工审计） */
  publishedTitle?: string;
}

interface Registry {
  entries: PublishedEntry[];
  lastCleanup: string;
}

function loadRegistry(): Registry {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8"));
    }
  } catch { /* ignore */ }
  return { entries: [], lastCleanup: new Date(0).toISOString() };
}

function saveRegistry(reg: Registry): void {
  const dir = path.dirname(REGISTRY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2), "utf-8");
}

/**
 * 计算文章指纹：基于主题内容标准化
 * 相同主题（忽略标点、空格、大小写）产生相同指纹
 */
export function computeFingerprint(topic: string): string {
  const normalized = topic
    .toLowerCase()
    .replace(/[\s\p{P}]+/gu, "") // 移除空白和标点
    .slice(0, 200);
  
  // 简单哈希
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * 检查文章是否已发布成功
 * @returns 已发布的条目，或 null
 */
export function checkPublished(topic: string, platform: string): PublishedEntry | null {
  const reg = loadRegistry();
  const fp = computeFingerprint(topic);
  const entry = reg.entries.find(
    (e) => e.fingerprint === fp && e.platform === platform
  );
  
  // 清理 30 天前的记录
  const now = Date.now();
  const lastCleanup = new Date(reg.lastCleanup).getTime();
  if (now - lastCleanup > 24 * 60 * 60 * 1000) { // 每天清理一次
    reg.entries = reg.entries.filter(
      (e) => now - new Date(e.publishedAt).getTime() < 30 * 24 * 60 * 60 * 1000
    );
    reg.lastCleanup = new Date().toISOString();
    saveRegistry(reg);
  }
  
  return entry || null;
}

/**
 * 记录文章发布成功
 */
export function markPublished(
  topic: string,
  platform: string,
  jobId: string,
  publishedTitle?: string
): void {
  const reg = loadRegistry();
  const fp = computeFingerprint(topic);
  
  // 移除同指纹的旧记录（如果有）
  reg.entries = reg.entries.filter(
    (e) => !(e.fingerprint === fp && e.platform === platform)
  );
  
  reg.entries.push({
    fingerprint: fp,
    topic,
    platform,
    jobId,
    publishedAt: new Date().toISOString(),
    publishedTitle,
  });
  
  saveRegistry(reg);
}

/**
 * 获取所有已发布记录（用于管理页面）
 */
export function listPublished(platform?: string): PublishedEntry[] {
  const reg = loadRegistry();
  if (platform) {
    return reg.entries.filter((e) => e.platform === platform).sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }
  return reg.entries.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}
