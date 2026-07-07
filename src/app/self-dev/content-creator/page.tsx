"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  PencilRuler,
  Edit,
  Trash2,
  Sparkles,
  Loader2,
  Send,
  Eye,
  FileText,
  Bell,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RotateCw,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { CONTENT_STATUS_MAP } from "@/lib/constants";
import type { ContentItem, Platform, ContentStatus, MonitorPlatform, IPItem } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

const PLATFORM_LABELS: Record<string, string> = {
  xiaohongshu: "📕 小红书",
  douyin: "🎵 抖音",
  both: "📱 双平台",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  scheduled: "已排期",
  published: "已发布",
  failed: "发布失败",
};

export default function ContentCreatorPage() {
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContent, setEditingContent] = useState<ContentItem | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [platform, setPlatform] = useState<Platform>("xiaohongshu");
  const [status, setStatus] = useState<ContentStatus>("draft");
  const [tags, setTags] = useState("");

  // AI 生成状态
  const [aiTopic, setAiTopic] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");

  // IP 和多图生成
  const [ipList, setIpList] = useState<IPItem[]>([]);
  const [selectedIPId, setSelectedIPId] = useState("");
  const [imageCount, setImageCount] = useState(1);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");

  // 监控状态
  const [monitorData, setMonitorData] = useState<MonitorPlatform[]>([]);
  const [monitorChecking, setMonitorChecking] = useState(false);

  // 发布状态
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishJobId, setPublishJobId] = useState<string | null>(null);
  const [publishLog, setPublishLog] = useState("");

  // Setup 环境检测
  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(null);
  const [setupSteps, setSetupSteps] = useState<CheckStep[]>([]);
  const [setupFixing, setSetupFixing] = useState<string | null>(null);
  const [setupFixResult, setSetupFixResult] = useState<{ name: string; ok: boolean; msg: string } | null>(null);

  // CheckStep 类型
  interface CheckStep {
    step: number; name: string; label: string; ok: boolean;
    detail: string; hint?: string; action?: string; actionLabel?: string; required: boolean;
  }

  const fetchContents = async () => {
    try {
      const res = await fetch("/api/content");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setContents(data.contents || []);
    } catch (err) {
      console.error("加载内容列表失败:", err);
      setContents([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchMonitor = useCallback(async () => {
    try {
      const res = await fetch("/api/monitor");
      const data = await res.json();
      setMonitorData(data.platforms || []);
    } catch { /* 忽略 */ }
  }, []);

  const triggerCheck = async () => {
    setMonitorChecking(true);
    try {
      await fetch("/api/monitor", { method: "POST" });
      setTimeout(() => {
        fetchMonitor();
        setMonitorChecking(false);
      }, 5000);
    } catch {
      setMonitorChecking(false);
    }
  };

  const fetchIPs = useCallback(async () => {
    try {
      const res = await fetch("/api/ips");
      const data = await res.json();
      setIpList(data.ips || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchContents();
    fetchMonitor();
    fetchIPs();
    checkSetup();
  }, [fetchMonitor, fetchIPs]);

  // Setup 环境检测
  const checkSetup = async () => {
    try {
      const res = await fetch("/api/setup");
      const d = await res.json();
      setSetupCompleted(d.setupCompleted ?? false);
    } catch {
      setSetupCompleted(false);
    }
  };

  const runSetupChecks = async () => {
    try {
      const res = await fetch("/api/publish/check");
      const data = await res.json();
      setSetupSteps(data.steps || []);
    } catch {
      setSetupSteps([]);
    }
  };

  const handleSetupFix = async (step: CheckStep) => {
    if (!step.action || setupFixing) return;
    setSetupFixing(step.name);
    setSetupFixResult(null);
    try {
      const res = await fetch("/api/publish/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: step.name, action: step.action }),
      });
      const d = await res.json();
      setSetupFixResult({ name: step.name, ok: d.ok, msg: d.detail || d.output || (d.ok ? "修复成功" : "修复失败") });
      setTimeout(async () => {
        await runSetupChecks();
        setSetupFixing(null);
        setSetupFixResult(null);
      }, 2000);
    } catch {
      setSetupFixResult({ name: step.name, ok: false, msg: "修复请求失败" });
      setSetupFixing(null);
    }
  };

  const handleSetupComplete = async () => {
    await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupCompleted: true }),
    });
    setSetupCompleted(true);
  };

  // 每30秒刷新监控
  useEffect(() => {
    const t = setInterval(fetchMonitor, 30000);
    return () => clearInterval(t);
  }, [fetchMonitor]);

  // 轮询发布状态
  useEffect(() => {
    if (!publishJobId) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/publish?jobId=${publishJobId}`);
        const data = await res.json();
        setPublishLog(data.log || "");
        if (data.done) {
          clearInterval(timer);
          setPublishJobId(null);
          if (data.status === "done") {
            // 更新内容状态为已发布
            if (publishingId) {
              const content = contents.find((c) => c.id === publishingId);
              if (content) {
                await fetch("/api/content", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ...content,
                    status: "published" as ContentStatus,
                    publishedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  }),
                });
              }
            }
            fetchContents();
          }
          setPublishingId(null);
        }
      } catch {
        // 忽略轮询错误
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [publishJobId, publishingId, contents]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPlatform("xiaohongshu");
    setStatus("draft");
    setTags("");
    setEditingContent(null);
    setAiError("");
    setSelectedIPId("");
    setImageCount(1);
    setGeneratedImages([]);
    setImagePrompt("");
  };

  const handleSave = async () => {
    const now = new Date().toISOString();
    const selectedIP = ipList.find((ip) => ip.id === selectedIPId);
    const content: ContentItem = {
      id: editingContent?.id || uuidv4(),
      title,
      description,
      platform,
      status: editingContent?.status || "draft",
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      mediaPaths: generatedImages.length > 0 ? generatedImages : (editingContent?.mediaPaths || []),
      aiGenerated: editingContent?.aiGenerated || false,
      ipId: selectedIPId || undefined,
      ipName: selectedIP?.name,
      imageCount,
      scheduledAt: editingContent?.scheduledAt,
      publishedAt: editingContent?.publishedAt,
      stats: editingContent?.stats,
      createdAt: editingContent?.createdAt || now,
      updatedAt: now,
    };

    await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });

    resetForm();
    setDialogOpen(false);
    fetchContents();
  };

  // AI 生成文案
  const handleAiGenerate = async () => {
    if (!aiTopic.trim()) return;
    setAiGenerating(true);
    setAiError("");

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: aiTopic,
          platform: platform === "both" ? "xiaohongshu" : platform,
          ipId: selectedIPId || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTitle(data.title || "");
        setDescription(data.content || "");
        setTags((data.tags || []).join(", "));
        if (data.imagePrompt) setImagePrompt(data.imagePrompt);
        setAiGenerating(false);
        setAiTopic("");
      } else {
        setAiError(data.error || "生成失败");
        setAiGenerating(false);
      }
    } catch (err) {
      setAiError(String(err));
      setAiGenerating(false);
    }
  };

  // AI 批量生成图片
  const handleGenerateImages = async () => {
    const prompt = imagePrompt || description || title;
    if (!prompt) {
      setAiError("请先生成文案或填写描述，以便生成匹配的图片");
      return;
    }
    setImageGenerating(true);
    setAiError("");
    setGeneratedImages([]);

    try {
      const res = await fetch("/api/ai/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          ipId: selectedIPId || undefined,
          count: imageCount,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setGeneratedImages(data.images || []);
      } else {
        setAiError(data.error || "图片生成失败");
      }
    } catch (err) {
      setAiError(String(err));
    }
    setImageGenerating(false);
  };

  const handleEdit = (item: ContentItem) => {
    setEditingContent(item);
    setTitle(item.title);
    setDescription(item.description);
    setPlatform(item.platform);
    setStatus(item.status);
    setTags(item.tags.join(", "));
    setSelectedIPId(item.ipId || "");
    setImageCount(item.imageCount || 1);
    setGeneratedImages(item.mediaPaths || []);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/content/${id}`, { method: "DELETE" });
    fetchContents();
  };

  // 一键发布
  const handlePublish = async (item: ContentItem) => {
    doPublish(item);
  };

  const doPublish = async (item: ContentItem) => {
    setPublishingId(item.id);
    setPublishJobId(null);
    setPublishLog("正在启动发布任务...");

    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: item.platform,
          title: item.title,
          content: item.description,
          tags: item.tags,
          imagePaths: item.mediaPaths?.length ? item.mediaPaths : undefined,
          ipId: item.ipId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // 双平台返回 jobs 数组
        if (data.jobs) {
          setPublishJobId(data.jobs[0]?.jobId || "both");
          setPublishLog(`双平台发布已启动 (${data.jobs.length} 个任务)`);
        } else {
          setPublishJobId(data.jobId);
          setPublishLog(`发布任务已启动: ${data.script}`);
        }
      } else {
        setPublishLog(`启动失败: ${data.error}`);
        setPublishingId(null);
      }
    } catch (err) {
      setPublishLog(`请求失败: ${String(err)}`);
      setPublishingId(null);
    }
  };

  const statusBadge = (s: ContentStatus) => {
    const config = CONTENT_STATUS_MAP[s] || { label: s, color: "bg-gray-100" };
    return (
      <Badge variant="outline" className={config.color}>
        {config.label}
      </Badge>
    );
  };

  const platformLabel = (p: Platform) => {
    return p === "xiaohongshu"
      ? "📕 小红书"
      : p === "douyin"
      ? "🎵 抖音"
      : "📱 双平台";
  };

  const platformBadge = (p: Platform) => {
    return p === "xiaohongshu" ? (
      <Badge variant="secondary" className="text-xs bg-red-50 text-red-700">
        📕 小红书
      </Badge>
    ) : p === "douyin" ? (
      <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-700">
        🎵 抖音
      </Badge>
    ) : (
      <Badge variant="secondary" className="text-xs bg-purple-50 text-purple-700">
        📱 双平台
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="内容创作"
        description="AI 辅助创作 + 一键发布小红书/抖音"
        action={
          setupCompleted ? (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger>
              <Button
                className="gap-1"
                onClick={() => {
                  resetForm();
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> 新建内容
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingContent ? "编辑内容" : "新建内容"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                {/* AI 生成区 */}
                <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-100 dark:from-purple-950 dark:to-pink-950 dark:border-purple-900">
                  <CardContent className="p-4 space-y-3">
                    {/* IP 选择器 */}
                    <div className="flex items-center gap-2">
                      <Label className="text-xs shrink-0 whitespace-nowrap">IP 人设</Label>
                      <select
                        value={selectedIPId}
                        onChange={(e) => setSelectedIPId(e.target.value)}
                        className="h-8 text-sm flex-1 rounded-md border bg-background px-2"
                      >
                        <option value="">不使用 IP</option>
                        {ipList.map((ip) => (
                          <option key={ip.id} value={ip.id}>{ip.name}</option>
                        ))}
                      </select>
                    </div>

                    <p className="text-sm font-medium flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                      AI 生成文案
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={aiTopic}
                        onChange={(e) => setAiTopic(e.target.value)}
                        placeholder="输入主题，如「新手养猫必看」"
                        className="h-8 text-sm flex-1"
                        onKeyDown={(e) => e.key === "Enter" && handleAiGenerate()}
                      />
                      <Button
                        size="sm"
                        className="h-8 gap-1 shrink-0"
                        onClick={handleAiGenerate}
                        disabled={aiGenerating || !aiTopic.trim()}
                      >
                        {aiGenerating ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        生成
                      </Button>
                    </div>

                    {/* 图片生成区 */}
                    <div className="pt-2 border-t border-purple-200 dark:border-purple-800">
                      <p className="text-sm font-medium mb-2 flex items-center gap-1">
                        <ImageIcon className="h-3.5 w-3.5 text-purple-500" />
                        AI 生成图片
                      </p>
                      <div className="flex items-center gap-2 mb-2">
                        <Label className="text-xs shrink-0">张数</Label>
                        <select
                          value={imageCount}
                          onChange={(e) => setImageCount(Number(e.target.value))}
                          className="h-8 text-sm w-20 rounded-md border bg-background px-2"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                            <option key={n} value={n}>{n} 张</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          className="h-8 gap-1"
                          onClick={handleGenerateImages}
                          disabled={imageGenerating}
                        >
                          {imageGenerating ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <ImageIcon className="h-3 w-3" />
                          )}
                          生成图片
                        </Button>
                      </div>

                      {/* 生成图片预览 */}
                      {generatedImages.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {generatedImages.map((img, i) => (
                            <div key={i} className="relative group">
                              <img
                                src={img}
                                alt={`生成图 ${i + 1}`}
                                className="h-16 w-12 object-cover rounded border"
                              />
                              <button
                                className="absolute -top-1 -right-1 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => setGeneratedImages(prev => prev.filter((_, j) => j !== i))}
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {aiError && (
                      <p className="text-xs text-red-500">{aiError}</p>
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  <Label>标题</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="内容标题"
                  />
                </div>
                <div className="space-y-2">
                  <Label>描述/文案</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="内容描述或文案..."
                    rows={5}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>目标平台</Label>
                    <Select
                      value={platform}
                      onValueChange={(v) => setPlatform(v as Platform)}
                    >
                      <SelectTrigger>
                        {PLATFORM_LABELS[platform] || "选择平台"}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="xiaohongshu">📕 小红书</SelectItem>
                        <SelectItem value="douyin">🎵 抖音</SelectItem>
                        <SelectItem value="both">📱 双平台</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>状态</Label>
                    <Select
                      value={status}
                      onValueChange={(v) => setStatus(v as ContentStatus)}
                    >
                      <SelectTrigger>
                        {STATUS_LABELS[status] || "选择状态"}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">草稿</SelectItem>
                        <SelectItem value="scheduled">已排期</SelectItem>
                        <SelectItem value="published">已发布</SelectItem>
                        <SelectItem value="failed">发布失败</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>标签（逗号分隔）</Label>
                  <Input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="穿搭, 护肤, 生活"
                  />
                </div>
                <Button onClick={handleSave} className="w-full">
                  保存
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          ) : null
        }
      />

      {/* 消息监控面板 */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100 dark:from-blue-950 dark:to-indigo-950 dark:border-blue-900">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell className="h-4 w-4" /> 消息监控
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={triggerCheck}
              disabled={monitorChecking}
            >
              {monitorChecking ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              刷新检测
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {monitorData.map((platform) => (
              <div
                key={platform.platform}
                className={`rounded-lg border p-3 text-center ${
                  platform.supported
                    ? "bg-white dark:bg-gray-900"
                    : "bg-gray-50 dark:bg-gray-800 opacity-60"
                }`}
              >
                <div className="text-lg mb-1">{platform.icon}</div>
                <div className="text-xs font-medium mb-2">{platform.label}</div>
                {platform.supported ? (
                  <>
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          platform.lastCount > 0
                            ? "bg-orange-500"
                            : "bg-green-500"
                        }`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {platform.lastCount > 0
                          ? `${platform.lastCount} 条未读`
                          : "无未读"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      总消息: {platform.lastTotal}
                    </div>
                    {platform.lastCheck && (
                      <div className="text-xs text-muted-foreground mt-1">
                        检测:{" "}
                        {new Date(platform.lastCheck).toLocaleTimeString(
                          "zh-CN",
                          { hour: "2-digit", minute: "2-digit" }
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    暂未支持
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 发布任务日志 */}
      {publishingId && (
        <Card className="bg-muted/50 border-dashed">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-1">
              {publishJobId ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {publishJobId ? "发布中..." : "准备发布..."}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 ml-auto"
                onClick={() => {
                  setPublishingId(null);
                  setPublishJobId(null);
                }}
              >
                关闭
              </Button>
            </div>
            {publishLog.includes("[NEED_LOGIN]") && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-sm space-y-1.5">
                <p className="font-medium text-amber-800">🔐 请在浏览器中手动登录</p>
                <p className="text-xs text-amber-600">登录后脚本会自动检测并继续发布，无需额外操作</p>
              </div>
            )}
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
              {publishLog || "等待日志..."}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Setup 环境向导 — 未配置时替换内容列表 */}
      {setupCompleted === false ? (
        <SetupWizard
          steps={setupSteps}
          fixing={setupFixing}
          fixResult={setupFixResult}
          onRunChecks={runSetupChecks}
          onFix={handleSetupFix}
          onComplete={handleSetupComplete}
        />
      ) : setupCompleted === null ? (
        <div className="text-center py-8 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-sm">检查环境配置...</p>
        </div>
      ) : (
        <>
      {/* 内容列表 */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : contents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <PencilRuler className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">还没有内容</p>
            <p className="text-xs mt-1">
              点击「新建内容」，用 AI 生成第一篇吧～
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contents.map((item) => (
            <Card
              key={item.id}
              className={`hover:shadow-md transition-shadow ${
                publishingId === item.id ? "ring-2 ring-primary" : ""
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base truncate flex-1">
                    {item.title}
                  </CardTitle>
                  <div className="flex items-center gap-1 shrink-0">
                    {platformBadge(item.platform)}
                    {statusBadge(item.status)}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                  {item.description || "暂无描述"}
                </p>
                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {item.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                {/* 数据统计 */}
                {item.stats && (
                  <div className="flex gap-3 mb-3 text-xs text-muted-foreground">
                    {item.stats.likes !== undefined && (
                      <span>❤️ {item.stats.likes}</span>
                    )}
                    {item.stats.comments !== undefined && (
                      <span>💬 {item.stats.comments}</span>
                    )}
                    {item.stats.shares !== undefined && (
                      <span>🔄 {item.stats.shares}</span>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
                  </span>
                  <div className="flex gap-1">
                    {/* 发布按钮 */}
                    {(item.status === "draft" || item.status === "failed") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => handlePublish(item)}
                        disabled={publishingId === item.id}
                      >
                        {publishingId === item.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                        发布
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleEdit(item)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}

// ── SetupWizard 内嵌组件 ──

const STEP_ICONS: Record<string, string> = {
  node: "📦", python: "🐍", uv: "📥", "browser-act": "🌐",
  chrome: "🌐", "browser-id": "🔧", "qwapi-key": "🔑", login: "🔐",
};

interface CheckStep {
  step: number; name: string; label: string; ok: boolean;
  detail: string; hint?: string; action?: string; actionLabel?: string; required: boolean;
}

function SetupWizard({
  steps,
  fixing,
  fixResult,
  onRunChecks,
  onFix,
  onComplete,
}: {
  steps: CheckStep[];
  fixing: string | null;
  fixResult: { name: string; ok: boolean; msg: string } | null;
  onRunChecks: () => Promise<void>;
  onFix: (step: CheckStep) => void;
  onComplete: () => void;
}) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onRunChecks().then(() => setLoading(false));
  }, [onRunChecks]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Loader2 className="h-10 w-10 animate-spin mx-auto mb-3" />
          <p className="text-sm">正在检测发布环境...</p>
        </CardContent>
      </Card>
    );
  }

  const allDone = steps.length > 0 && steps.every((s) => s.ok);
  const currentStep = steps.find((s) => !s.ok);
  const passedCount = steps.filter((s) => s.ok).length;
  const totalCount = steps.length;

  // 全部通过 → 完成页面
  if (allDone) {
    return (
      <Card className="border-2 border-green-200">
        <CardContent className="py-8 text-center space-y-4">
          <div className="text-5xl">🎉</div>
          <div>
            <p className="text-lg font-semibold">所有环境检查已通过！</p>
            <p className="text-sm text-muted-foreground mt-1">
              所有依赖和配置已就绪，现在可以一键发布内容了
            </p>
          </div>
          <div className="space-y-1.5 text-left max-w-sm mx-auto">
            {steps.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                <span>{STEP_ICONS[s.name]} {s.label}</span>
                <span className="text-xs ml-auto opacity-60">{s.detail}</span>
              </div>
            ))}
          </div>
          <Button size="lg" className="gap-2" onClick={onComplete}>
            <CheckCircle2 className="h-4 w-4" />
            完成配置，开始使用
          </Button>
          <p className="text-xs text-muted-foreground">
            配置完成后，新建内容和发布功能将自动开启
          </p>
        </CardContent>
      </Card>
    );
  }

  // 有未通过步骤
  return (
    <div className="space-y-4">
      {/* 进度条 */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>环境配置进度 {passedCount}/{totalCount}</span>
          <span>{Math.round((passedCount / Math.max(totalCount, 1)) * 100)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 rounded-full"
            style={{ width: `${(passedCount / Math.max(totalCount, 1)) * 100}%` }}
          />
        </div>
        <div className="flex gap-1.5 justify-center">
          {steps.map((s) => (
            <div
              key={s.name}
              className={`w-6 h-1.5 rounded-full transition-colors ${
                s.ok ? "bg-green-500" : s === currentStep ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      </div>

      {/* 当前步骤卡片 */}
      {currentStep && (
        <Card className="border-2 border-primary/20">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-sm px-3 py-1">
                步骤 {currentStep.step}/{totalCount}
              </Badge>
              <h2 className="font-semibold">
                {STEP_ICONS[currentStep.name]} {currentStep.label}
              </h2>
              {!currentStep.required && (
                <Badge variant="secondary" className="text-xs">可选</Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <span className="text-sm">{currentStep.detail}</span>
            </div>

            {currentStep.hint && (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 whitespace-pre-line">
                {currentStep.hint}
              </div>
            )}

            {fixResult && fixResult.name === currentStep.name && (
              <div className={`text-sm p-3 rounded-lg ${fixResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {fixResult.ok ? "✅ " : "❌ "}{fixResult.msg}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {currentStep.action && (
                currentStep.action.startsWith("http") ? (
                  <Button variant="default" size="sm" className="gap-1.5" onClick={() => window.open(currentStep.action, "_blank")}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    {currentStep.actionLabel || "前往"}
                  </Button>
                ) : currentStep.action.startsWith("/") ? (
                  <Button variant="default" size="sm" className="gap-1.5" onClick={() => window.location.href = currentStep.action!}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    {currentStep.actionLabel || "前往"}
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5"
                    disabled={fixing === currentStep.name}
                    onClick={() => onFix(currentStep)}
                  >
                    {fixing === currentStep.name ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" />执行中...</>
                    ) : (
                      <><RotateCw className="h-3.5 w-3.5" />{currentStep.actionLabel || "一键修复"}</>
                    )}
                  </Button>
                )
              )}

              <Button variant="outline" size="sm" className="gap-1.5" onClick={onRunChecks}>
                <RotateCw className="h-3.5 w-3.5" />重新检测
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 已完成步骤摘要 */}
      {passedCount > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground font-medium">已完成</p>
          {steps.filter((s) => s.ok).map((s) => (
            <div key={s.name} className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
              <span>{STEP_ICONS[s.name]} {s.label}</span>
              <span className="text-xs ml-auto opacity-60">{s.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
