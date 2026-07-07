// ============================================================
// 我的钱包 — 订阅数据 CRUD（使用 Prisma + SQLite）
// ============================================================

import prisma from "@/lib/prisma";
import type { Subscription, SubHistory, SubCycle } from "@/lib/types";

function toSub(row: any): Subscription {
  return {
    id: row.id,
    name: row.name,
    category: row.category as Subscription["category"],
    cycle: row.cycle as Subscription["cycle"],
    amount: row.amount ?? 0,
    startDate: row.startDate,
    expireDate: row.expireDate,
    autoRenew: row.autoRenew ?? true,
    provider: row.provider,
    notes: row.notes,
    history: JSON.parse(row.history || "[]") as SubHistory[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getAll(): Promise<Subscription[]> {
  const rows = await prisma.subscription.findMany({
    orderBy: { expireDate: "asc" },
  });
  return rows.map(toSub);
}

export async function getById(id: string): Promise<Subscription | undefined> {
  const row = await prisma.subscription.findUnique({ where: { id } });
  if (!row) return undefined;
  return toSub(row);
}

export async function save(sub: Subscription): Promise<void> {
  sub.updatedAt = new Date().toISOString();
  await prisma.subscription.upsert({
    where: { id: sub.id },
    update: {
      name: sub.name,
      category: sub.category,
      cycle: sub.cycle,
      amount: sub.amount,
      startDate: sub.startDate,
      expireDate: sub.expireDate,
      autoRenew: sub.autoRenew,
      provider: sub.provider,
      notes: sub.notes,
      history: JSON.stringify(sub.history || []),
      updatedAt: sub.updatedAt,
    },
    create: {
      id: sub.id,
      name: sub.name,
      category: sub.category,
      cycle: sub.cycle,
      amount: sub.amount,
      startDate: sub.startDate,
      expireDate: sub.expireDate,
      autoRenew: sub.autoRenew,
      provider: sub.provider,
      notes: sub.notes,
      history: JSON.stringify(sub.history || []),
      createdAt: sub.createdAt || new Date().toISOString(),
      updatedAt: sub.updatedAt,
    },
  });
}

export async function remove(id: string): Promise<void> {
  await prisma.subscription.delete({ where: { id } }).catch(() => {});
}

export async function renew(
  id: string,
  data: { cycle: string; amount: number; fromDate?: string }
): Promise<Subscription | null> {
  const row = await prisma.subscription.findUnique({ where: { id } });
  if (!row) return null;

  const sub = toSub(row);
  const daysMap: Record<string, number> = { month: 30, quarter: 90, year: 365, once: 0 };
  const days = daysMap[data.cycle] || 30;
  const from = data.fromDate || sub.expireDate;
  const newExpire = addDays(from, days);

  sub.cycle = data.cycle as SubCycle;
  sub.amount = data.amount;
  sub.expireDate = newExpire;
  sub.history.push({
    action: "续费",
    plan: data.cycle,
    amount: data.amount,
    date: new Date().toISOString().slice(0, 10),
    expireDate: newExpire,
  });
  sub.updatedAt = new Date().toISOString();

  await save(sub);
  return sub;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysUntil(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

export type SubStatus = "expired" | "urgent" | "soon" | "normal";

export function getStatus(sub: Subscription): SubStatus {
  const left = daysUntil(sub.expireDate);
  if (left < 0) return "expired";
  if (left <= 3) return "urgent";
  if (left <= 7) return "soon";
  return "normal";
}

export async function getStats(): Promise<{
  total: number;
  active: number;
  expired: number;
  monthCost: number;
  yearCost: number;
}> {
  const subs = await getAll();
  let active = 0,
    expired = 0,
    monthCost = 0,
    yearCost = 0;
  for (const s of subs) {
    const left = daysUntil(s.expireDate);
    if (left < 0) expired++;
    else active++;
    const monthlyRate =
      s.cycle === "month"
        ? s.amount
        : s.cycle === "quarter"
          ? s.amount / 3
          : s.cycle === "year"
            ? s.amount / 12
            : 0;
    monthCost += monthlyRate;
    yearCost += monthlyRate * 12;
  }
  return {
    total: subs.length,
    active,
    expired,
    monthCost: Math.round(monthCost),
    yearCost: Math.round(yearCost),
  };
}

export async function getReminders(): Promise<{
  urgent: Subscription[];
  soon: Subscription[];
  expired: Subscription[];
}> {
  const subs = await getAll();
  const result = {
    urgent: [] as Subscription[],
    soon: [] as Subscription[],
    expired: [] as Subscription[],
  };
  for (const s of subs) {
    const left = daysUntil(s.expireDate);
    if (left < 0) result.expired.push(s);
    else if (left <= 3) result.urgent.push(s);
    else if (left <= 7) result.soon.push(s);
  }
  return result;
}
