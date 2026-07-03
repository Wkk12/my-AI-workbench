// ============================================================
// 创意灵感数据 CRUD
// ============================================================

import { readJSONSafe, writeJSON } from "./base";
import type { IdeaIndex, Idea } from "@/lib/types";

const INDEX_PATH = "ideas/index.json";

function getIndex(): IdeaIndex {
  return readJSONSafe<IdeaIndex>(INDEX_PATH, { ideas: [] });
}

function saveIndex(index: IdeaIndex): void {
  writeJSON(INDEX_PATH, index);
}

export function getAllIdeas(): Idea[] {
  return getIndex().ideas.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getIdea(id: string): Idea | undefined {
  return getIndex().ideas.find((i) => i.id === id);
}

export function saveIdea(idea: Idea): void {
  const index = getIndex();
  const idx = index.ideas.findIndex((i) => i.id === idea.id);
  if (idx >= 0) {
    index.ideas[idx] = idea;
  } else {
    index.ideas.push(idea);
  }
  saveIndex(index);
}

export function deleteIdea(id: string): void {
  const index = getIndex();
  index.ideas = index.ideas.filter((i) => i.id !== id);
  saveIndex(index);
}
