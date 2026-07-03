import { NextRequest, NextResponse } from "next/server";
import { getAllIdeas, saveIdea } from "@/lib/data/ideas";
import type { Idea } from "@/lib/types";

export async function GET() {
  const ideas = getAllIdeas();
  return NextResponse.json({ ideas });
}

export async function POST(request: NextRequest) {
  const item: Idea = await request.json();
  saveIdea(item);
  return NextResponse.json({ success: true });
}
