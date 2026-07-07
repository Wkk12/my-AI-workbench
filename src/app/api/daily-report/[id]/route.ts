import { NextRequest, NextResponse } from "next/server";
import { getReportMeta, getReportContent, deleteReport } from "@/lib/data/daily-reports";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const meta = await getReportMeta(id);
  const content = await getReportContent(id);

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
  await deleteReport(id);
  return NextResponse.json({ success: true });
}
