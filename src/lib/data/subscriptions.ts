// ============================================================
// 我的钱包 — 订阅数据 CRUD
// ============================================================

import { readJSONSafe, writeJSON } from "./base";
import type { SubIndex, Subscription } from "@/lib/types";

const INDEX_PATH = "subscriptions/index.json";

function getIndex(): SubIndex {
  return readJSONSafe<SubIndex>(INDEX_PATH, { subscriptions: [] });
}

function saveIndex(index: SubIndex): void {
  writeJSON(INDEX_PATH, index);
}

export function getAll(): Subscription[] {
  return getIndex().subscriptions.sort(
    (a, b) => new Date(a.expireDate).getTime() - new Date(b.expireDate).getTime()
  );
}

export function getById(id: string): Subscription | undefined {
  return getIndex().subscriptions.find((s) => s.id === id);
}

export function save(sub: Subscription): void {
  const index = getIndex();
  const idx = index.subscriptions.findIndex((s) => s.id === sub.id);
  sub.updatedAt = new Date().toISOString();
  if (idx >= 0) {
    index.subscriptions[idx] = sub;
  } else {
    sub.createdAt = new Date().toISOString();
    index.subscriptions.push(sub);
  }
  saveIndex(index);
}

export function remove(id: string): void {
  const index = getIndex();
  index.subscriptions = index.subscriptions.filter((s) => s.id !== id);
  saveIndex(index);
}

/** 续费操作 */
export function renew(id: string, data: { cycle: string; amount: number; fromDate?: string }): Subscription | null {
  const index = getIndex();
  const sub = index.subscriptions.find((s) => s.id === id);
  if (!sub) return null;

  const daysMap: Record<string, number> = { month: 30, quarter: 90, year: 365, once: 0 };
  const days = daysMap[data.cycle] || 30;
  const from = data.fromDate || sub.expireDate;
  const newExpire = addDays(from, days);

  sub.cycle = data.cycle as Subscription["cycle"];
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
  saveIndex(index);
  return sub;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 到期状态 */
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

/** 统计 */
export function getStats(): { total: number; active: number; expired: number; monthCost: number; yearCost: number } {
  const subs = getAll();
  let active = 0, expired = 0, monthCost = 0, yearCost = 0;
  for (const s of subs) {
    const left = daysUntil(s.expireDate);
    if (left < 0) expired++; else active++;
    const monthlyRate = s.cycle === "month" ? s.amount : s.cycle === "quarter" ? s.amount / 3 : s.cycle === "year" ? s.amount / 12 : 0;
    monthCost += monthlyRate;
    yearCost += monthlyRate * 12;
  }
  return { total: subs.length, active, expired, monthCost: Math.round(monthCost), yearCost: Math.round(yearCost) };
}

/** 到期提醒 */
export function getReminders(): { urgent: Subscription[]; soon: Subscription[]; expired: Subscription[] } {
  const subs = getAll();
  const result = { urgent: [] as Subscription[], soon: [] as Subscription[], expired: [] as Subscription[] };
  for (const s of subs) {
    const left = daysUntil(s.expireDate);
    if (left < 0) result.expired.push(s);
    else if (left <= 3) result.urgent.push(s);
    else if (left <= 7) result.soon.push(s);
  }
  return result;
}
