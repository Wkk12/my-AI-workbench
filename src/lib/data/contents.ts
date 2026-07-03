// ============================================================
// 内容创作数据 CRUD
// ============================================================

import { readJSONSafe, writeJSON } from "./base";
import type { ContentIndex, ContentItem } from "@/lib/types";

const INDEX_PATH = "contents/index.json";

function getIndex(): ContentIndex {
  return readJSONSafe<ContentIndex>(INDEX_PATH, { contents: [] });
}

function saveIndex(index: ContentIndex): void {
  writeJSON(INDEX_PATH, index);
}

export function getAllContents(): ContentItem[] {
  return getIndex().contents.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getContent(id: string): ContentItem | undefined {
  return getIndex().contents.find((c) => c.id === id);
}

export function saveContent(item: ContentItem): void {
  const index = getIndex();
  const idx = index.contents.findIndex((c) => c.id === item.id);
  if (idx >= 0) {
    index.contents[idx] = item;
  } else {
    index.contents.push(item);
  }
  saveIndex(index);
}

export function deleteContent(id: string): void {
  const index = getIndex();
  index.contents = index.contents.filter((c) => c.id !== id);
  saveIndex(index);
}
