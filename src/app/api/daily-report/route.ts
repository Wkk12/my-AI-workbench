import { NextRequest, NextResponse } from "next/server";
import { getAllReports, saveReport } from "@/lib/data/daily-reports";
import type { DailyReportMeta } from "@/lib/types";

export async function GET() {
  const reports = getAllReports();
  return NextResponse.json({ reports });
}

export async function POST(request: NextRequest) {
  const { meta, content }: { meta: DailyReportMeta; content: string } =
    await request.json();
  saveReport(meta, content);
  return NextResponse.json({ success: true });
}
