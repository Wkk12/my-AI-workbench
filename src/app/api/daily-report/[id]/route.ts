import { NextRequest, NextResponse } from "next/server";
import { getReportMeta, getReportContent, deleteReport } from "@/lib/data/daily-reports";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const meta = getReportMeta(id);
  const content = getReportContent(id);

  if (!meta && !content) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ meta, content });
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  deleteReport(id);
  return NextResponse.json({ success: true });
}
