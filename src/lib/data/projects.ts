// ============================================================
// 项目看板数据 CRUD
// ============================================================

import { readJSONSafe, writeJSON } from "./base";
import type { ProjectIndex, Project } from "@/lib/types";

const INDEX_PATH = "projects/index.json";

function getIndex(): ProjectIndex {
  return readJSONSafe<ProjectIndex>(INDEX_PATH, { projects: [] });
}

function saveIndex(index: ProjectIndex): void {
  writeJSON(INDEX_PATH, index);
}

export function getAllProjects(): Project[] {
  return getIndex().projects.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getProject(id: string): Project | undefined {
  return getIndex().projects.find((p) => p.id === id);
}

export function saveProject(project: Project): void {
  const index = getIndex();
  const idx = index.projects.findIndex((p) => p.id === project.id);
  if (idx >= 0) {
    index.projects[idx] = project;
  } else {
    index.projects.push(project);
  }
  saveIndex(index);
}

export function deleteProject(id: string): void {
  const index = getIndex();
  index.projects = index.projects.filter((p) => p.id !== id);
  saveIndex(index);
}
