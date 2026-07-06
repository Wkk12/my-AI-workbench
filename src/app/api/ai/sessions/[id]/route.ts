import { NextRequest, NextResponse } from "next/server";
import { getSession, updateSession, deleteSession } from "@/lib/data/memory";

/** 获取单个会话 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }
  return NextResponse.json({ session });
}

/** 更新会话 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const session = updateSession(id, body.messages || [], body.title);
    if (!session) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** 删除会话 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = deleteSession(id);
  if (!deleted) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
