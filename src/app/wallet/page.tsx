"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Wallet, Edit, Trash2, RefreshCw, Copy } from "lucide-react";
import type { Subscription, SubCategory, SubCycle } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

// ── 常量 ──
const CATEGORIES: { value: SubCategory; label: string; icon: string }[] = [
  { value: "video", label: "视频会员", icon: "🎬" },
  { value: "music", label: "音乐/音频", icon: "🎵" },
  { value: "vpn", label: "VPN/梯子", icon: "🔐" },
  { value: "cloud", label: "云存储", icon: "☁️" },
  { value: "insurance", label: "保险", icon: "🛡️" },
  { value: "shopping", label: "购物会员", icon: "🛒" },
  { value: "software", label: "软件订阅", icon: "💻" },
  { value: "other", label: "其他", icon: "📦" },
];
const CYCLES: { value: SubCycle; label: string }[] = [
  { value: "month", label: "包月" },
  { value: "quarter", label: "包季" },
  { value: "year", label: "包年" },
  { value: "once", label: "一次性" },
];
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  expired: { label: "🔴 已过期", cls: "bg-red-50 text-red-700 border-red-200" },
  urgent: { label: "🟠 3天内到期", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  soon: { label: "🟡 7天内到期", cls: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  normal: { label: "✅ 正常", cls: "bg-green-50 text-green-700 border-green-200" },
};

// ── 工具 ──
function catInfo(c: SubCategory) {
  return CATEGORIES.find((x) => x.value === c) || CATEGORIES[7];
}
function cycleLabel(c: SubCycle) {
  return CYCLES.find((x) => x.value === c)?.label || c;
}

// ── 组件 ──
export default function WalletPage() {
  const [subs, setSubs] = useState<(Subscription & { daysLeft: number; status: string })[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, expired: 0, monthCost: 0, yearCost: 0 });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form
  const [fName, setFName] = useState("");
  const [fCategory, setFCategory] = useState<SubCategory>("video");
  const [fCycle, setFCycle] = useState<SubCycle>("month");
  const [fAmount, setFAmount] = useState("");
  const [fStartDate, setFStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [fExpireDate, setFExpireDate] = useState("");
  const [fAutoRenew, setFAutoRenew] = useState(true);
  const [fProvider, setFProvider] = useState("");
  const [fNotes, setFNotes] = useState("");

  // Renew
  const [renewId, setRenewId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/subscriptions");
    const data = await res.json();
    setSubs(data.subscriptions || []);
    setStats(data.stats || { total: 0, active: 0, expired: 0, monthCost: 0, yearCost: 0 });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setFName(""); setFCategory("video"); setFCycle("month"); setFAmount("");
    setFStartDate(new Date().toISOString().slice(0, 10)); setFExpireDate("");
    setFAutoRenew(true); setFProvider(""); setFNotes("");
    setEditingId(null);
  };

  const openEdit = (sub: Subscription & { daysLeft: number }) => {
    setEditingId(sub.id);
    setFName(sub.name); setFCategory(sub.category); setFCycle(sub.cycle);
    setFAmount(String(sub.amount)); setFStartDate(sub.startDate); setFExpireDate(sub.expireDate);
    setFAutoRenew(sub.autoRenew); setFProvider(sub.provider); setFNotes(sub.notes);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const data: Record<string, unknown> = {
      name: fName.trim(), category: fCategory, cycle: fCycle,
      amount: Number(fAmount), startDate: fStartDate, expireDate: fExpireDate,
      autoRenew: fAutoRenew, provider: fProvider.trim(), notes: fNotes.trim(),
    };
    if (!data.name || !data.expireDate) return;

    const method = editingId ? "PUT" : "POST";
    const url = editingId ? `/api/subscriptions/${editingId}` : "/api/subscriptions";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

    resetForm();
    setDialogOpen(false);
    load();
  };

  const handleRenew = async (id: string) => {
    const sub = subs.find((s) => s.id === id);
    if (!sub) return;
    await fetch(`/api/subscriptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cycle: sub.cycle, amount: sub.amount }),
    });
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除？")) return;
    await fetch(`/api/subscriptions/${id}`, { method: "DELETE" });
    load();
  };

  const copyReminder = () => {
    const urgent = subs.filter((s) => s.status === "urgent" || s.status === "expired");
    if (!urgent.length) return alert("没有需要提醒的 🎉");
    const text = urgent.map((s) => `${s.name} · ¥${s.amount}/${cycleLabel(s.cycle)} · 到期 ${s.expireDate}`).join("\n");
    navigator.clipboard.writeText("📢 付费项目到期提醒：\n\n" + text + "\n\n记得续费哦～");
    alert("已复制到剪贴板 ✅");
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="💰 我的钱包"
        description="一站管理所有付费订阅和会员"
        action={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger>
              <Button className="gap-1" onClick={() => { resetForm(); setDialogOpen(true); }}>
                <Plus className="h-4 w-4" /> 添加订阅
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>{editingId ? "编辑" : "添加"}订阅</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <div className="space-y-1"><Label>名称 *</Label><Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="如：腾讯视频VIP" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>分类</Label>
                    <Select value={fCategory} onValueChange={(v) => setFCategory(v as SubCategory)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.icon} {c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>周期</Label>
                    <Select value={fCycle} onValueChange={(v) => setFCycle(v as SubCycle)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CYCLES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1"><Label>金额 (元)</Label><Input type="number" value={fAmount} onChange={(e) => setFAmount(e.target.value)} placeholder="30" /></div>
                  <div className="space-y-1"><Label>开始日期</Label><Input type="date" value={fStartDate} onChange={(e) => setFStartDate(e.target.value)} /></div>
                  <div className="space-y-1"><Label>到期日 *</Label><Input type="date" value={fExpireDate} onChange={(e) => setFExpireDate(e.target.value)} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>平台</Label><Input value={fProvider} onChange={(e) => setFProvider(e.target.value)} placeholder="如：腾讯视频" /></div>
                  <div className="space-y-1 flex items-end pb-1">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={fAutoRenew} onChange={(e) => setFAutoRenew(e.target.checked)} className="w-4 h-4" />
                      自动续费
                    </label>
                  </div>
                </div>
                <div className="space-y-1"><Label>备注</Label><Input value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="账号、密码提示等..." /></div>
                <Button onClick={handleSave} className="w-full">保存</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {/* 统计卡片 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "全部", value: stats.total, icon: "📋" },
          { label: "活跃中", value: stats.active, icon: "✅" },
          { label: "已过期", value: stats.expired, icon: "🔴", danger: true },
          { label: "月均支出", value: `¥${stats.monthCost}`, icon: "📅" },
          { label: "年均支出", value: `¥${stats.yearCost}`, icon: "📊" },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="py-3 flex items-center gap-3">
              <span className="text-2xl">{s.icon}</span>
              <div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className={`text-xl font-bold ${s.danger ? "text-red-500" : ""}`}>{s.value}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 操作栏 */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3 w-3 mr-1" />刷新</Button>
        <Button variant="outline" size="sm" onClick={copyReminder}><Copy className="h-3 w-3 mr-1" />复制到期提醒</Button>
      </div>

      {/* 到期高亮横幅 */}
      {subs.filter((s) => s.status === "expired" || s.status === "urgent").length > 0 && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900">
          <CardContent className="py-3 text-sm">
            <span className="font-semibold text-red-700 dark:text-red-400">⚠️ 需要关注：</span>
            {subs.filter((s) => s.status === "expired" || s.status === "urgent").map((s) => (
              <span key={s.id} className="ml-2 text-red-600 dark:text-red-300">
                {catInfo(s.category).icon} {s.name}（{s.status === "expired" ? `已过期${Math.abs(s.daysLeft)}天` : `剩${s.daysLeft}天`}）
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 订阅列表 */}
      {subs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Wallet className="h-16 w-16 mx-auto mb-3 opacity-20" />
            <p>还没有记录付费项目</p>
            <p className="text-xs mt-1">点「添加订阅」开始管理你的钱包～</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {subs.map((s) => {
            const cat = catInfo(s.category);
            const st = STATUS_MAP[s.status] || STATUS_MAP.normal;
            return (
              <Card key={s.id} className={`hover:shadow-md transition-shadow ${s.status === "expired" ? "border-red-300 opacity-80" : s.status === "urgent" ? "border-orange-300" : ""}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{cat.icon}</span>
                      <div>
                        <CardTitle className="text-base">{s.name}</CardTitle>
                        {s.provider && <p className="text-xs text-muted-foreground">{s.provider}</p>}
                      </div>
                    </div>
                    <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-lg font-bold">¥{s.amount}</span>
                    <span className="text-xs text-muted-foreground">/ {cycleLabel(s.cycle)}</span>
                    {s.autoRenew && <Badge variant="secondary" className="text-[10px] ml-1">自动续</Badge>}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-3">
                    <span>{s.startDate} → {s.expireDate}</span>
                    <span>{s.daysLeft < 0 ? `已过期${Math.abs(s.daysLeft)}天` : s.daysLeft === 0 ? "今天到期" : `剩${s.daysLeft}天`}</span>
                  </div>
                  {s.notes && <p className="text-xs text-muted-foreground mb-3 italic">💬 {s.notes}</p>}
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleRenew(s.id)}>
                      <RefreshCw className="h-3 w-3" />续费
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Edit className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(s.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
