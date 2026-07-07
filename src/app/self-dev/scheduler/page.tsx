"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Clock, Play, Trash2, Edit, RefreshCw, CheckCircle2,
  XCircle, Loader2, Bell, FileText, Send, Sunrise, Wrench,
  History, AlertTriangle, ExternalLink,
} from "lucide-react";
import type { ScheduledTask, SchedulerActionType, ContentItem } from "@/lib/types";
import { useNotifications } from "@/components/notifications/NotificationProvider";
import { v4 as uuidv4 } from "uuid";

// ── 常量 ──

const ACTION_TYPES: { value: SchedulerActionType; label: string; icon: string }[] = [
  { value: "publish_xhs", label: "发布小红书", icon: "📕" },
  { value: "publish_douyin", label: "发布抖音", icon: "🎵" },
  { value: "generate_report", label: "生成日报", icon: "📋" },
  { value: "ai_morning", label: "AI 早安问候", icon: "🌅" },
  { value: "custom", label: "自定义", icon: "🔧" },
];

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const ACTION_LABELS: Record<string, string> = {
  publish_xhs: "📕 发布小红书",
  publish_douyin: "🎵 发布抖音",
  generate_report: "📋 生成日报",
  ai_morning: "🌅 AI 早安",
  custom: "🔧 自定义",
};

// 快捷预设
const QUICK_PRESETS = [
  { name: "每日早安", actionType: "ai_morning" as SchedulerActionType, schedule: "08:00", config: { city: "北京" } },
  { name: "早上发小红书", actionType: "publish_xhs" as SchedulerActionType, schedule: "08:30", config: {} },
  { name: "下午生成日报", actionType: "generate_report" as SchedulerActionType, schedule: "17:00", config: {} },
  { name: "晚上发抖音", actionType: "publish_douyin" as SchedulerActionType, schedule: "20:00", config: {} },
];

// ── 组件 ──

export default function SchedulerPage() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const { addNotification } = useNotifications();
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Setup 环境检测
  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(null);
  const [setupWarnOpen, setSetupWarnOpen] = useState(false);

  // 表单
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState("");
  const [fActionType, setFActionType] = useState<SchedulerActionType>("ai_morning");
  const [fSchedule, setFSchedule] = useState("08:00");
  const [fDaysOfWeek, setFDaysOfWeek] = useState<number[]>([]);
  const [fEnabled, setFEnabled] = useState(true);
  const [fConfigTopic, setFConfigTopic] = useState("");
  const [fConfigCity, setFConfigCity] = useState("北京");
  const [fConfigContentId, setFConfigContentId] = useState("");

  // 内容列表（用于选择已有内容发布）
  const [contentList, setContentList] = useState<ContentItem[]>([]);

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/scheduler");
    const data = await res.json();
    setTasks(data.tasks || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();
    // 检查发布环境配置
    fetch("/api/setup").then(r => r.json()).then(d => setSetupCompleted(d.setupCompleted ?? false)).catch(() => setSetupCompleted(false));
    // 加载内容列表（供发布任务选择）
    fetch("/api/content").then(r => r.json()).then(d => setContentList(d.contents || [])).catch(() => {});
  }, [fetchTasks]);

  const resetForm = () => {
    setFName("");
    setFActionType("ai_morning");
    setFSchedule("08:00");
    setFDaysOfWeek([]);
    setFEnabled(true);
    setFConfigTopic("");
    setFConfigCity("北京");
    setFConfigContentId("");
    setEditingId(null);
  };

  const handleEdit = (t: ScheduledTask) => {
    setEditingId(t.id);
    setFName(t.name);
    setFActionType(t.actionType);
    setFSchedule(t.schedule);
    setFDaysOfWeek(t.daysOfWeek || []);
    setFEnabled(t.enabled);
    setFConfigTopic(t.config?.topic || "");
    setFConfigCity(t.config?.city || "北京");
    setFConfigContentId(t.config?.contentId || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    // 发布类任务需要环境配置
    if ((fActionType === "publish_xhs" || fActionType === "publish_douyin") && !setupCompleted) {
      setSetupWarnOpen(true);
      return;
    }

    const now = new Date().toISOString();
    const config: Record<string, string> = {};
    if (fConfigTopic) config.topic = fConfigTopic;
    if (fConfigCity) config.city = fConfigCity;
    if (fConfigContentId && fConfigContentId !== "none") config.contentId = fConfigContentId;

    const task: ScheduledTask = {
      id: editingId || uuidv4(),
      name: fName || "未命名任务",
      enabled: fEnabled,
      actionType: fActionType,
      schedule: fSchedule,
      daysOfWeek: fDaysOfWeek,
      config,
      lastRun: editingId ? tasks.find((t) => t.id === editingId)?.lastRun : undefined,
      lastResult: editingId ? tasks.find((t) => t.id === editingId)?.lastResult : undefined,
      createdAt: editingId ? tasks.find((t) => t.id === editingId)?.createdAt || now : now,
      updatedAt: now,
    };

    await fetch("/api/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });

    resetForm();
    setDialogOpen(false);
    fetchTasks();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/scheduler?id=${id}`, { method: "DELETE" });
    fetchTasks();
  };

  const handleRun = async (taskId: string) => {
    setRunningTaskId(taskId);
    // 利用用户点击手势请求通知权限
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    try {
      const res = await fetch("/api/scheduler/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json();
      if (data.success) {
        const task = tasks.find((t) => t.id === taskId);
        const isFail = /失败|错误|未安装|未找到|异常/.test(data.result || "");
        addNotification({
          taskId,
          title: `${task?.name || "任务"} — ${isFail ? "执行失败" : "执行完成"}`,
          body: data.result || "无结果",
          type: isFail ? "error" : "success",
        });
        fetchTasks();
      }
    } catch { /* ignore */ }
    setRunningTaskId(null);
  };

  const handleCheckAll = async () => {
    setChecking(true);
    const res = await fetch("/api/scheduler/run");
    const data = await res.json();
    if (data.executed > 0 && Array.isArray(data.results)) {
      for (const r of data.results) {
        addNotification({
          taskId: r.id,
          title: r.name,
          body: r.result.slice(0, 200),
          type: r.result.startsWith("失败") || r.result.startsWith("错误") ? "error" : "success",
        });
      }
    }
    setChecking(false);
    fetchTasks();
  };

  const handleToggle = async (task: ScheduledTask) => {
    task.enabled = !task.enabled;
    task.updatedAt = new Date().toISOString();
    await fetch("/api/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
    fetchTasks();
  };

  const handlePreset = (preset: typeof QUICK_PRESETS[number]) => {
    if ((preset.actionType === "publish_xhs" || preset.actionType === "publish_douyin") && !setupCompleted) {
      setSetupWarnOpen(true);
      return;
    }
    setFName(preset.name);
    setFActionType(preset.actionType);
    setFSchedule(preset.schedule);
    if (preset.config?.city) setFConfigCity(preset.config.city);
    setFDaysOfWeek([]);
    setFEnabled(true);
    setDialogOpen(true);
  };

  const toggleDay = (day: number) => {
    setFDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const daysLabel = (days: number[]): string => {
    if (days.length === 0) return "每天";
    return days.map((d) => `周${WEEKDAYS[d]}`).join("、");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="⏰ 定时任务"
        description="设定自动化任务 — 定时发布、自动日报、早安问候"
        action={
          <div className="flex gap-2">
            <Button variant="outline" className="gap-1" onClick={handleCheckAll} disabled={checking}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              立即检查
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger>
                <Button className="gap-1" onClick={() => { resetForm(); setDialogOpen(true); }}>
                  <Plus className="h-4 w-4" /> 新建任务
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingId ? "编辑任务" : "新建定时任务"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  {/* 快捷预设 */}
                  {!editingId && (
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_PRESETS.map((p) => (
                        <Badge
                          key={p.name}
                          variant="outline"
                          className="cursor-pointer hover:bg-accent"
                          onClick={() => handlePreset(p)}
                        >
                          + {p.name}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>任务名称</Label>
                    <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="如：每日早安问候" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>动作类型</Label>
                      <Select value={fActionType} onValueChange={(v) => setFActionType(v as SchedulerActionType)}>
                        <SelectTrigger>
                          {ACTION_LABELS[fActionType] || "选择动作"}
                        </SelectTrigger>
                        <SelectContent>
                          {ACTION_TYPES.map((a) => (
                            <SelectItem key={a.value} value={a.value}>{a.icon} {a.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>执行时间</Label>
                      <Input type="time" value={fSchedule} onChange={(e) => setFSchedule(e.target.value)} />
                    </div>
                  </div>

                  {/* 星期选择 */}
                  <div className="space-y-2">
                    <Label>执行日（不选=每天）</Label>
                    <div className="flex gap-1.5">
                      {WEEKDAYS.map((d, i) => (
                        <Badge
                          key={i}
                          variant={fDaysOfWeek.includes(i) ? "default" : "outline"}
                          className="cursor-pointer px-3 py-1.5"
                          onClick={() => toggleDay(i)}
                        >
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* 动作配置 */}
                  {(fActionType === "publish_xhs" || fActionType === "publish_douyin") && (
                    <div className="space-y-3">
                      {/* 选择已有内容 */}
                      <div className="space-y-2">
                        <Label>选择内容（可选）</Label>
                        <Select value={fConfigContentId} onValueChange={(v) => {
                          const val = v || "";
                          setFConfigContentId(val);
                          if (val && val !== "none") {
                            const selected = contentList.find((c) => c.id === val);
                            if (selected) {
                              if (selected.title) setFName(selected.title);
                              if (selected.description && !fConfigTopic) setFConfigTopic(selected.description.slice(0, 50));
                            }
                          }
                        }}>
                          <SelectTrigger>
                            {fConfigContentId && fConfigContentId !== "none"
                              ? (contentList.find(c => c.id === fConfigContentId)?.title || "已选择内容")
                              : "不使用已有内容（按主题生成）"}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">不使用已有内容（按主题生成）</SelectItem>
                            {contentList.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.title || "无标题"} {c.platform === "xiaohongshu" ? "📕" : c.platform === "douyin" ? "🎵" : "📱"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fConfigContentId && fConfigContentId !== "none" && (
                          <p className="text-xs text-muted-foreground">
                            将发布已选内容，标题为空时自动 AI 生成
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>发布主题（可选，无内容时使用）</Label>
                        <Input value={fConfigTopic} onChange={(e) => setFConfigTopic(e.target.value)} placeholder="如：每日精选话题" />
                      </div>
                    </div>
                  )}

                  {fActionType === "ai_morning" && (
                    <div className="space-y-2">
                      <Label>所在城市</Label>
                      <Input value={fConfigCity} onChange={(e) => setFConfigCity(e.target.value)} placeholder="北京" />
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t">
                    <Label className="cursor-pointer">启用任务</Label>
                    <Switch checked={fEnabled} onCheckedChange={setFEnabled} />
                  </div>

                  <Button onClick={handleSave} className="w-full">保存任务</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {/* 任务列表 */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">还没有定时任务</p>
            <p className="text-xs mt-1">
              点击「新建任务」或选择快捷预设开始～
            </p>
            <div className="flex gap-2 justify-center mt-3">
              {QUICK_PRESETS.map((p) => (
                <Badge
                  key={p.name}
                  variant="outline"
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => handlePreset(p)}
                >
                  + {p.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tasks.map((task) => (
            <Card key={task.id} className={`hover:shadow-md transition-shadow ${!task.enabled ? "opacity-50" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">
                      {ACTION_TYPES.find((a) => a.value === task.actionType)?.icon || "⏰"}
                    </span>
                    <div>
                      <CardTitle className="text-base">{task.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {ACTION_LABELS[task.actionType] || task.actionType}
                        {" · "}
                        {task.schedule}
                        {" · "}
                        {daysLabel(task.daysOfWeek)}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={task.enabled}
                    onCheckedChange={() => handleToggle(task)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                {/* 上次执行结果 */}
                {task.lastRun && (
                  <div className="mb-3 p-2.5 rounded-lg bg-muted/50 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                      <History className="h-3 w-3" />
                      上次执行：{new Date(task.lastRun).toLocaleString("zh-CN")}
                    </div>
                    <p className="text-foreground/80 line-clamp-2">
                      {task.lastResult || "无记录"}
                    </p>
                  </div>
                )}

                {/* 任务配置摘要 */}
                {task.config?.contentId && (
                  <div className="mb-3 text-xs text-muted-foreground">
                    📝 内容：
                    {contentList.find(c => c.id === task.config.contentId)?.title || task.config.contentId}
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-xs h-7"
                    onClick={() => handleRun(task.id)}
                    disabled={runningTaskId === task.id}
                  >
                    {runningTaskId === task.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                    立即执行
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => handleEdit(task)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-destructive"
                    onClick={() => handleDelete(task.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 说明卡 */}
      <Card className="bg-muted/30">
        <CardContent className="py-3 text-xs text-muted-foreground space-y-1">
          <p>💡 <strong>使用说明：</strong></p>
          <p>• 定时任务在设定时间到达时精确触发（每分钟检查一次，每天只执行一次）</p>
          <p>• 点击「立即执行」可手动触发任意任务（不受每日一次限制）</p>
          <p>• 点击「立即检查」可一次性运行所有到期任务</p>
          <p>• AI 功能需要在「系统设置」中配置 Claude API Key 或 QWAPI Key</p>
        </CardContent>
      </Card>

      {/* 发布环境未配置警告 */}
      <Dialog open={setupWarnOpen} onOpenChange={setSetupWarnOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              发布环境未配置
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              创建发布类定时任务需要先完成发布环境初始化。请前往「内容创作」页面完成环境配置。
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setSetupWarnOpen(false)}>
                知道了
              </Button>
              <Button size="sm" className="flex-1 gap-1" onClick={() => { setSetupWarnOpen(false); window.location.href = "/self-dev/content-creator"; }}>
                前往配置 <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
