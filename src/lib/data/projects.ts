// ============================================================
// 项目看板数据 CRUD（使用 Prisma + SQLite）
// ============================================================

import prisma from "@/lib/prisma";
import type { Project } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

function toProject(row: any): Project {
  return {
    id: row.id,
    name: row.title,
    description: row.description,
    status: row.status as Project["status"],
    icon: row.icon || undefined,
    techStack: JSON.parse(row.techStack || "[]"),
    tasks: JSON.parse(row.tasks || "[]"),
    milestones: JSON.parse(row.milestones || "[]"),
    revenue: row.revenue ?? undefined,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getAllProjects(): Promise<Project[]> {
  const rows = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toProject);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const row = await prisma.project.findUnique({ where: { id } });
  if (!row) return undefined;
  return toProject(row);
}

export async function saveProject(project: Project): Promise<void> {
  await prisma.project.upsert({
    where: { id: project.id },
    update: {
      title: project.name,
      description: project.description,
      status: project.status,
      icon: project.icon || "",
      techStack: JSON.stringify(project.techStack || []),
      tasks: JSON.stringify(project.tasks || []),
      milestones: JSON.stringify(project.milestones || []),
      revenue: project.revenue ?? null,
      notes: project.notes,
      updatedAt: project.updatedAt || new Date().toISOString(),
    },
    create: {
      id: project.id,
      title: project.name,
      description: project.description,
      status: project.status,
      icon: project.icon || "",
      techStack: JSON.stringify(project.techStack || []),
      tasks: JSON.stringify(project.tasks || []),
      milestones: JSON.stringify(project.milestones || []),
      revenue: project.revenue ?? null,
      notes: project.notes,
      createdAt: project.createdAt || new Date().toISOString(),
      updatedAt: project.updatedAt || new Date().toISOString(),
    },
  });
}

export async function deleteProject(id: string): Promise<void> {
  await prisma.project.delete({ where: { id } }).catch(() => {});
}
