import { NextRequest, NextResponse } from "next/server";
import { getAllContents, saveContent } from "@/lib/data/contents";
import type { ContentItem } from "@/lib/types";

export async function GET() {
  const contents = await getAllContents();
  return NextResponse.json({ contents });
}

export async function POST(request: NextRequest) {
  const item: ContentItem = await request.json();
  await saveContent(item);
  return NextResponse.json({ success: true });
}
