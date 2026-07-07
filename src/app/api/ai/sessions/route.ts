import { NextRequest, NextResponse } from "next/server";
import { getSessionList, createSession } from "@/lib/data/memory";

/** 获取所有会话列表 */
export async function GET() {
  const sessions = await getSessionList();
  return NextResponse.json({ sessions });
}

/** 创建新会话 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const session = await createSession(body.title);
    return NextResponse.json({ session });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
