import { NextRequest, NextResponse } from "next/server";
import { getIdea, deleteIdea } from "@/lib/data/ideas";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = getIdea(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(item);
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteIdea(id);
  return NextResponse.json({ success: true });
}
