import { NextRequest, NextResponse } from "next/server";
import { getLog } from "@/lib/publish-logger";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const log = getLog(jobId);
  if (!log) {
    return NextResponse.json({ error: "日志不存在" }, { status: 404 });
  }
  return NextResponse.json(log);
}
