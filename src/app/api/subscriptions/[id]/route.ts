import { NextRequest, NextResponse } from "next/server";
import * as SubDB from "@/lib/data/subscriptions";

// PUT /api/subscriptions/[id] — 更新
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = SubDB.getById(id);
  if (!existing) return NextResponse.json({ error: "不存在" }, { status: 404 });

  const body = await request.json();
  const updated = { ...existing, ...body, id, updatedAt: new Date().toISOString() };
  SubDB.save(updated);
  return NextResponse.json({ success: true, item: updated });
}

// DELETE /api/subscriptions/[id] — 删除
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  SubDB.remove(id);
  return NextResponse.json({ success: true });
}

// PATCH /api/subscriptions/[id] — 续费
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const result = SubDB.renew(id, {
    cycle: body.cycle,
    amount: Number(body.amount),
    fromDate: body.fromDate,
  });
  if (!result) return NextResponse.json({ error: "不存在" }, { status: 404 });
  return NextResponse.json({ success: true, item: result });
}
