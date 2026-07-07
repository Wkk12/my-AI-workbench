import { NextRequest, NextResponse } from "next/server";
import * as SubDB from "@/lib/data/subscriptions";
import { v4 as uuidv4 } from "uuid";

// GET /api/subscriptions — 列表（含状态）
export async function GET() {
  const subs = await SubDB.getAll();
  const items = subs.map((s) => ({
    ...s,
    daysLeft: SubDB.daysUntil(s.expireDate),
    status: SubDB.getStatus(s),
  }));
  return NextResponse.json({ subscriptions: items, stats: await SubDB.getStats() });
}

// POST /api/subscriptions — 新增
export async function POST(request: NextRequest) {
  const body = await request.json();
  const sub = {
    id: uuidv4(),
    name: body.name || "未命名",
    category: body.category || "other",
    cycle: body.cycle || "month",
    amount: Number(body.amount) || 0,
    startDate: body.startDate || new Date().toISOString().slice(0, 10),
    expireDate: body.expireDate || new Date().toISOString().slice(0, 10),
    autoRenew: body.autoRenew ?? true,
    provider: body.provider || "",
    notes: body.notes || "",
    history: [
      {
        action: "开通",
        amount: Number(body.amount) || 0,
        date: body.startDate || new Date().toISOString().slice(0, 10),
        expireDate: body.expireDate || "",
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await SubDB.save(sub);
  return NextResponse.json({ success: true, item: sub }, { status: 201 });
}
