import { NextRequest, NextResponse } from "next/server";
import { getAllTasks, saveTask, deleteTask } from "@/lib/data/scheduler";
import type { ScheduledTask } from "@/lib/types";

export async function GET() {
  const tasks = await getAllTasks();
  return NextResponse.json({ tasks });
}

export async function POST(request: NextRequest) {
  const item: ScheduledTask = await request.json();
  await saveTask(item);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (id) await deleteTask(id);
  return NextResponse.json({ success: true });
}
