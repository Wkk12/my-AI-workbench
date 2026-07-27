import { NextRequest, NextResponse } from "next/server";
import { listLogs } from "@/lib/publish-logger";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const page = parseInt(sp.get("page") || "1", 10) || 1;
  const limit = parseInt(sp.get("limit") || "10", 10) || 10;
  const result = listLogs(page, limit);
  return NextResponse.json(result);
}
