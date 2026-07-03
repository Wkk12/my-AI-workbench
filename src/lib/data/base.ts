// ============================================================
// 通用数据访问层 — JSON + Markdown 文件读写
// 所有数据存储在项目根目录 data/ 下
// ============================================================

import fs from "fs";
import path from "path";

const DATA_ROOT = path.resolve(process.cwd(), "data");

/** 获取 data/ 目录下的绝对路径 */
export function dataPath(...segments: string[]): string {
  return path.join(DATA_ROOT, ...segments);
}

/** 确保目录存在 */
export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/** 读取 JSON 文件并解析 */
export function readJSON<T>(relativePath: string): T {
  const fullPath = dataPath(relativePath);
  const raw = fs.readFileSync(fullPath, "utf-8");
  return JSON.parse(raw) as T;
}

/** 写入 JSON 文件（自动创建目录） */
export function writeJSON<T>(relativePath: string, data: T): void {
  const fullPath = dataPath(relativePath);
  const dir = path.dirname(fullPath);
  ensureDir(dir);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), "utf-8");
}

/** 读取纯文本文件 */
export function readTextFile(relativePath: string): string {
  const fullPath = dataPath(relativePath);
  return fs.readFileSync(fullPath, "utf-8");
}

/** 写入纯文本文件（自动创建目录） */
export function writeTextFile(relativePath: string, content: string): void {
  const fullPath = dataPath(relativePath);
  const dir = path.dirname(fullPath);
  ensureDir(dir);
  fs.writeFileSync(fullPath, content, "utf-8");
}

/** 安全读取 JSON，文件不存在时返回默认值 */
export function readJSONSafe<T>(relativePath: string, fallback: T): T {
  try {
    return readJSON<T>(relativePath);
  } catch {
    return fallback;
  }
}

/** 检查文件是否存在 */
export function fileExists(relativePath: string): boolean {
  return fs.existsSync(dataPath(relativePath));
}

/** 列出目录下的所有文件 */
export function listFiles(dirRelative: string): string[] {
  const dirPath = dataPath(dirRelative);
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath).filter((f) => {
    return fs.statSync(path.join(dirPath, f)).isFile();
  });
}

/** 删除文件 */
export function deleteFile(relativePath: string): void {
  const fullPath = dataPath(relativePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}
