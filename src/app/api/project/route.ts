import { NextRequest, NextResponse } from "next/server";
import { getAllProjects, saveProject } from "@/lib/data/projects";
import type { Project } from "@/lib/types";

export async function GET() {
  const projects = await getAllProjects();
  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  const item: Project = await request.json();
  await saveProject(item);
  return NextResponse.json({ success: true });
}
