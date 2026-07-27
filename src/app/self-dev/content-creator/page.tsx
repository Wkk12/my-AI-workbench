"use client";

import { useState, useEffect, useCallback, memo } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { useBackgroundTasks } from "@/lib/background-tasks";
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
  XCircle,
  AlertTriangle,
  ExternalLink,
  RotateCw,
  Image as ImageIcon,
  Upload,
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

interface CheckStep {
  step: number;
  name: string;
  label: string;
  ok: boolean;
  detail: string;
  hint?: string;
  action?: string;
  actionLabel?: string;
  required: boolean;
}

const IMAGE_STYLES = [
  { value: "", label: "不指定" },
  { value: "写实照片风格，自然光影，真实质感", label: "写实/照片" },
  { value: "二次元动漫风格，日系赛璐璐，明亮色彩", label: "二次元" },
  { value: "水彩手绘风格，柔和渐变，艺术感", label: "水彩" },
  { value: "古典油画风格，厚重笔触，暖色调", label: "油画" },
  { value: "Q版卡通风格，大头可爱，圆润线条", label: "卡通/Q版" },
  { value: "扁平插画风格，色块拼接，现代设计感", label: "扁平插画" },
  { value: "赛博朋克风格，霓虹灯光，暗色调", label: "赛博朋克" },
  { value: "3D渲染风格，Cinema 4D质感，柔和光照", label: "3D渲染" },
  { value: "极简图形风格，留白构图，干净背景", label: "极简" },
  { value: "中国风水墨风格，墨韵晕染，禅意", label: "水墨国风" },
  { value: "吉卜力风格，温暖治愈，柔和光线", label: "吉卜力" },
  { value: "像素艺术风格，复古游戏感，马赛克", label: "像素艺术" },
  { value: "剪纸风格，纸艺层次感，手工质感", label: "剪纸" },
];

// ─── IP 管理内联（独立组件，避免重渲染导致闪烁） ───
interface IpsFormState { name: string; description: string; stylePrompt: string; imageFile: File | null; imagePreview: string; }

const IPsInlineSection = memo(function IPsInlineSection({
  ipsForm, setIpsForm,
  ipsEditingId, setIpsEditingId,
  ipsDialogOpen, setIpsDialogOpen,
  ipsSaving, setIpsSaving,
  ipList, fetchIPs,
}: {
  ipsForm: IpsFormState;
  setIpsForm: React.Dispatch<React.SetStateAction<IpsFormState>>;
  ipsEditingId: string | null;
  setIpsEditingId: React.Dispatch<React.SetStateAction<string | null>>;
  ipsDialogOpen: boolean;
  setIpsDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  ipsSaving: boolean;
  setIpsSaving: React.Dispatch<React.SetStateAction<boolean>>;
  ipList: IPItem[];
  fetchIPs: () => void;
}) {
  const handleIpsSubmit = async () => {
    if (!ipsForm.name.trim()) return;
    setIpsSaving(true);
    const fd = new FormData();
    fd.append("name", ipsForm.name);
    fd.append("description", ipsForm.description);
    fd.append("stylePrompt", ipsForm.stylePrompt);
    if (ipsForm.imageFile) fd.append("image", ipsForm.imageFile);

    const url = ipsEditingId ? `/api/ips/${ipsEditingId}` : "/api/ips";
    const method = ipsEditingId ? "PUT" : "POST";
    try {
      await fetch(url, { method, credentials: "include", body: fd });
      setIpsDialogOpen(false);
      setIpsEditingId(null);
      setIpsForm({ name: "", description: "", stylePrompt: "", imageFile: null, imagePreview: "" });
      fetchIPs();
    } catch {}
    setIpsSaving(false);
  };

  const handleIpsDelete = async (id: string) => {
    if (!confirm("确认删除该 IP？")) return;
    await fetch(`/api/ips/${id}`, { method: "DELETE", credentials: "include" });
    fetchIPs();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">管理 AI 生成中使用的 IP 角色</p>
        <Button size="sm" variant="outline" onClick={() => {
          setIpsEditingId(null);
          setIpsForm({ name: "", description: "", stylePrompt: "", imageFile: null, imagePreview: "" });
          setIpsDialogOpen(true);
        }}><Plus className="h-3 w-3 mr-1" />新建</Button>
      </div>
      {ipList.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">暂无 IP</p>
      ) : (
        <div className="grid gap-3">
          {ipList.map((ip) => (
            <Card key={ip.id} className="hover:shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  {ip.imagePath ? (
                    <img src={ip.imagePath} alt={ip.name} className="w-12 h-12 rounded-lg object-cover border" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-lg">
                      {ip.name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ip.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{ip.description || "无描述"}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                      setIpsEditingId(ip.id);
                      setIpsForm({ name: ip.name, description: ip.description || "", stylePrompt: ip.stylePrompt || "", imageFile: null, imagePreview: ip.imagePath || "" });
                      setIpsDialogOpen(true);
                    }}><Edit className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleIpsDelete(ip.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={ipsDialogOpen} onOpenChange={setIpsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{ipsEditingId ? "编辑 IP" : "新建 IP"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>名称</Label><Input value={ipsForm.name} onChange={e => setIpsForm(p => ({...p, name: e.target.value}))} /></div>
            <div><Label>描述</Label><Textarea value={ipsForm.description} onChange={e => setIpsForm(p => ({...p, description: e.target.value}))} rows={3} /></div>
            <div><Label>风格提示词</Label><Input value={ipsForm.stylePrompt} onChange={e => setIpsForm(p => ({...p, stylePrompt: e.target.value}))} placeholder="如：二次元、粉色系" /></div>
            <div>
              <Label>头像</Label>
              <div className="flex items-center gap-2 mt-1">
                {ipsForm.imagePreview && <img src={ipsForm.imagePreview} className="w-16 h-16 rounded-lg object-cover border" />}
                <label className="cursor-pointer"><Upload className="h-4 w-4" /><input type="file" accept="image/*" className="hidden" onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) setIpsForm(p => ({...p, imageFile: f, imagePreview: URL.createObjectURL(f)}));
                }} /></label>
              </div>
            </div>
            <Button className="w-full" onClick={handleIpsSubmit} disabled={ipsSaving}>
              {ipsSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              {ipsEditingId ? "保存" : "创建"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export default function ContentCreatorPage() {
  const [showCreator, setShowCreator] = useState(false);
  const [subPage, setSubPage] = useState<"creator" | "ips">("creator");
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingContent, setEditingContent] = useState<ContentItem | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [platform, setPlatform] = useState<Platform>("xiaohongshu");
  const [tags, setTags] = useState("");

  // AI 生成状态
  const [aiTopic, setAiTopic] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");

  // IP 和多图生成
  const [ipList, setIpList] = useState<IPItem[]>([]);
  const [selectedIPId, setSelectedIPId] = useState("");
  const [imageCount, setImageCount] = useState(1);
  const [imageQuality, setImageQuality] = useState<"high" | "medium" | "low">("medium");
  const [imageStyle, setImageStyle] = useState("");
  // IP 管理内联
  const [ipsDialogOpen, setIpsDialogOpen] = useState(false);
  const [ipsEditingId, setIpsEditingId] = useState<string | null>(null);
  const [ipsSaving, setIpsSaving] = useState(false);
  const [ipsForm, setIpsForm] = useState({ name: "", description: "", stylePrompt: "", imageFile: null as File | null, imagePreview: "" });
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageGenPrompt, setImageGenPrompt] = useState<string[]>([]);
  const [imagePromptGenerating, setImagePromptGenerating] = useState(false);

  // 监控状态
  const [monitorData, setMonitorData] = useState<MonitorPlatform[]>([]);
  const [monitorChecking, setMonitorChecking] = useState(false);

  // 发布状态
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishJobIds, setPublishJobIds] = useState<string[] | null>(null);
  const [publishLog, setPublishLog] = useState("");
  const [publishDone, setPublishDone] = useState(false);
  const [publishError, setPublishError] = useState(false);
  const [publishDismissed, setPublishDismissed] = useState(false);

  // 发布确认
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);

  // 全屏图片预览
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  // Setup 环境检测
  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(null);
  const [setupSteps, setSetupSteps] = useState<CheckStep[]>([]);
  const [setupFixing, setSetupFixing] = useState<string | null>(null);
  const [setupFixResult, setSetupFixResult] = useState<{ name: string; ok: boolean; msg: string } | null>(null);

  // 后台任务系统
  const { tasks, addTask, updateTask, removeTask } = useBackgroundTasks();

  const fetchContents = async () => {
    try {
      const res = await fetch("/api/content", { credentials: "include" });
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
      const res = await fetch("/api/monitor", { credentials: "include" });
      const data = await res.json();
      setMonitorData(data.platforms || []);
    } catch {
      /* 忽略 */
    }
  }, []);

  const triggerCheck = async () => {
    setMonitorChecking(true);
    try {
      await fetch("/api/monitor", { method: "POST", credentials: "include" });
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
      const res = await fetch("/api/ips", { credentials: "include" });
      const data = await res.json();
      setIpList(data.ips || []);
    } catch {
      /* ignore */
    }
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
      const res = await fetch("/api/setup", { credentials: "include" });
      const d = await res.json();
      setSetupCompleted(d.setupCompleted ?? false);
    } catch {
      setSetupCompleted(false);
    }
  };

  const runSetupChecks = async () => {
    try {
      const res = await fetch("/api/publish/check", { credentials: "include" });
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
        credentials: "include",
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
      credentials: "include",
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

  // 后台任务同步：将 context 中的任务结果同步到本地状态
  const activeGenTask = tasks.find((t) => t.type === "image_generation" && t.status !== "done");
  const completedGenTask = tasks.find((t) => t.type === "image_generation" && t.status === "done" && t.result?.images?.length);
  const failedGenTask = tasks.find((t) => t.type === "image_generation" && t.status === "error");
  
  useEffect(() => {
    if (completedGenTask && imageGenerating) {
      setGeneratedImages(completedGenTask.result.images || []);
      setImageGenerating(false);
      const errs = completedGenTask.result?.errors;
      if (errs?.length) {
        setAiError(`${completedGenTask.result.images?.length || 0}/${completedGenTask.progress?.total || "?"} 张成功: ${errs.join("; ")}`);
      } else {
        setAiError("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedGenTask?.id]);

  useEffect(() => {
    if (failedGenTask && imageGenerating) {
      setImageGenerating(false);
      setAiError(failedGenTask.message || "生成失败");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failedGenTask?.id]);

  useEffect(() => {
    if (activeGenTask && imageGenerating) {
      setAiError(activeGenTask.message || "正在生成...");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGenTask?.message]);

  // 轮询发布状态
  useEffect(() => {
    if (!publishJobIds || publishJobIds.length === 0) return;
    if (publishDone) return; // 已完成，防止 contents 变化重新触发轮询
    setPublishDone(false);
    setPublishError(false);
    setPublishDismissed(false);
    const timer = setInterval(async () => {
      try {
        let allDone = true;
        let combinedLog = "";
        let anyError = false;
        for (const jid of publishJobIds) {
          const res = await fetch(`/api/publish?jobId=${jid}`, { credentials: "include" });
          const data = await res.json();
          if (data.log) combinedLog += `\n--- ${jid.startsWith("xiaohongshu") ? "📕 小红书" : "🎵 抖音"} ---\n${data.log}`;
          if (!data.done) allDone = false;
          if (data.status === "error") anyError = true;
        }
        setPublishLog(combinedLog || "等待中...");
        if (allDone) {
          clearInterval(timer);
          setPublishDone(true);
          if (anyError) {
            setPublishError(true);
            // 更新内容状态为失败
            if (publishingId) {
              const content = contents.find((c) => c.id === publishingId);
              if (content) {
                await fetch("/api/content", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ...content,
                    status: "failed" as ContentStatus,
                    updatedAt: new Date().toISOString(),
                  }),
                });
              }
            }
          } else {
            // 发布成功
            if (publishingId) {
              const content = contents.find((c) => c.id === publishingId);
              if (content) {
                await fetch("/api/content", {
                  method: "POST",
                  credentials: "include",
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
          }
          fetchContents();
          // 完成后清除 jobIds，彻底防止重入
          setPublishJobIds(null);
        }
      } catch {
        // 忽略轮询错误
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [publishJobIds, publishingId]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPlatform("xiaohongshu");
    setTags("");
    setEditingContent(null);
    setAiError("");
    setSelectedIPId("");
    setImageCount(1);
    setGeneratedImages([]);
    setImagePrompt("");
    setImageGenPrompt([]);
    setImagePromptGenerating(false);
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
      mediaPaths: generatedImages.length > 0 ? generatedImages : editingContent?.mediaPaths || [],
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
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });

    // 如果是新建，标记为编辑模式以便后续保存更新同一条
    if (!editingContent) {
      setEditingContent(content);
    }
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
        credentials: "include",
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

  // AI 生成图片提示词（按张数生成每张图的独立 prompt）
  const handleGenerateImagePrompt = async () => {
    const contentText = description || title;
    if (!contentText) {
      setAiError("请先填写内容或生成文案，以便生成图片提示词");
      return;
    }
    setImagePromptGenerating(true);
    setAiError("");

    try {
      const res = await fetch("/api/ai/generate-image-prompt", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: contentText,
          ipId: selectedIPId || undefined,
          count: imageCount,
          style: imageStyle || undefined,
        }),
      });

      const data = await res.json();
      if (data.prompts?.length) {
        setImageGenPrompt(data.prompts);
        setImagePrompt(data.prompts.join(" | "));
        setImagePromptGenerating(false);
      } else {
        setAiError(data.error || "生成提示词失败");
        setImagePromptGenerating(false);
      }
    } catch (err) {
      setAiError(String(err));
      setImagePromptGenerating(false);
    }
  };

  // AI 批量生成图片（异步轮询）
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
      const perImagePrompts = imageGenPrompt.length >= imageCount ? imageGenPrompt : [];
      
      const postRes = await fetch("/api/ai/images", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          ipId: selectedIPId || undefined,
          count: imageCount,
          quality: imageQuality,
          perImagePrompts: perImagePrompts.length ? perImagePrompts : undefined,
        }),
      });
      const { jobId, error } = await postRes.json();
      if (error || !jobId) {
        setAiError(error || "提交任务失败");
        setImageGenerating(false);
        return;
      }

      // 注册后台任务（自动轮询，切换页面不丢失）
      addTask({
        type: "image_generation",
        title: title || "AI 生图",
        jobId,
        pollUrl: `/api/ai/images?jobId=${jobId}`,
        pollIntervalMs: 3000,
        onRetry: handleGenerateImages,
      });
    } catch (err) {
      setAiError(String(err));
      setImageGenerating(false);
    }
  };

  const handleEdit = (item: ContentItem) => {
    setEditingContent(item);
    setTitle(item.title);
    setDescription(item.description);
    setPlatform(item.platform);
    setTags(item.tags.join(", "));
    setSelectedIPId(item.ipId || "");
    setImageCount(item.imageCount || 1);
    setGeneratedImages(item.mediaPaths || []);
    setImageGenPrompt([]);
    setAiError("");
    setShowCreator(true);
  };

  const handleNewContent = () => {
    resetForm();
    setShowCreator(true);
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/content/${id}`, { method: "DELETE", credentials: "include" });
    fetchContents();
  };

  // 从列表直接发布
  const handlePublish = async (item: ContentItem) => {
    doPublish(item);
  };

  // 重试发布
  const handleRetryPublish = () => {
    if (!publishingId) return;
    const item = contents.find((c) => c.id === publishingId);
    if (item) {
      setPublishDone(false);
      setPublishError(false);
      setPublishDismissed(false);
      doPublish(item);
    }
  };

  const doPublish = async (item: ContentItem) => {
    setPublishingId(item.id);
    setPublishJobIds(null);
    setPublishDone(false);
    setPublishError(false);
    setPublishDismissed(false);
    setPublishLog("正在启动发布任务...");

    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        credentials: "include",
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
        if (data.jobs) {
          const ids = data.jobs.map((j: { jobId: string }) => j.jobId);
          setPublishJobIds(ids);
          setPublishLog(`双平台发布已启动: ${data.jobs.map((j: { platform: string }) => j.platform === "xiaohongshu" ? "📕小红书" : "🎵抖音").join(" + ")}`);
          // 注册后台任务（切换页面不中断）
          data.jobs.forEach((j: { platform: string; jobId: string }) => {
            addTask({
              type: "publish",
              title: `${j.platform === "xiaohongshu" ? "📕小红书" : "🎵抖音"} ${item.title}`,
              jobId: j.jobId,
              pollUrl: `/api/publish?jobId=${j.jobId}`,
              pollIntervalMs: 2000,
            });
          });
        } else {
          setPublishJobIds([data.jobId]);
          setPublishLog(`发布任务已启动: ${data.script}`);
          addTask({
            type: "publish",
            title: item.title || data.script || "发布",
            jobId: data.jobId,
            pollUrl: `/api/publish?jobId=${data.jobId}`,
            pollIntervalMs: 2000,
          });
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

  // 从创作页点击发布 → 显示确认弹窗
  const handlePublishFromCreator = () => {
    if (!title.trim()) return;
    setConfirmPublishOpen(true);
  };

  // 确认发布
  const handleConfirmPublish = async () => {
    setConfirmPublishOpen(false);

    // 先保存当前内容
    await handleSave();

    // 构建发布用的 ContentItem
    const selectedIP = ipList.find((ip) => ip.id === selectedIPId);
    const now = new Date().toISOString();
    const item: ContentItem = {
      id: editingContent?.id || uuidv4(),
      title,
      description,
      platform,
      status: editingContent?.status || "draft",
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      mediaPaths: generatedImages,
      aiGenerated: editingContent?.aiGenerated || false,
      ipId: selectedIPId || undefined,
      ipName: selectedIP?.name,
      imageCount,
      createdAt: editingContent?.createdAt || now,
      updatedAt: now,
    };

    setShowCreator(false);
    resetForm();

    // 发布
    doPublish(item);
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

  // ─── 等待环境检测 ───
  if (setupCompleted === null) {
    return (
      <div className="text-center py-16">
        <Loader2 className="h-10 w-10 animate-spin mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">检查环境配置...</p>
      </div>
    );
  }

  // ─── 环境未配置 → SetupWizard ───
  if (setupCompleted === false) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="内容创作"
          description="AI 辅助创作 + 一键发布小红书/抖音"
        />
        <SetupWizard
          steps={setupSteps}
          fixing={setupFixing}
          fixResult={setupFixResult}
          onRunChecks={runSetupChecks}
          onFix={handleSetupFix}
          onComplete={handleSetupComplete}
        />
      </div>
    );
  }

  // ─── 创作子页面 ───



  if (showCreator) {
    const selectedIP = ipList.find((ip) => ip.id === selectedIPId);
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    return (
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-background shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => {
              setShowCreator(false);
              resetForm();
            }}
          >
            ← 返回列表
          </Button>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <Button
              variant={subPage === "creator" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSubPage("creator")}
            >
              🎨 创作
            </Button>
            <Button
              variant={subPage === "ips" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setSubPage("ips"); }}
            >
              👤 IP 管理
            </Button>
          </div>
          <div className="w-20" />
        </div>

        {subPage === "ips" ? (
          <div className="flex-1 overflow-y-auto p-6">
            <IPsInlineSection
              ipsForm={ipsForm} setIpsForm={setIpsForm}
              ipsEditingId={ipsEditingId} setIpsEditingId={setIpsEditingId}
              ipsDialogOpen={ipsDialogOpen} setIpsDialogOpen={setIpsDialogOpen}
              ipsSaving={ipsSaving} setIpsSaving={setIpsSaving}
              ipList={ipList} fetchIPs={fetchIPs}
            />
          </div>
        ) : (
        <>
        {/* 双栏布局 */}
        <div className="flex-1 flex overflow-hidden">
          {/* ── 左侧预览面板 ── */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-muted/20">
            {/* 标题预览 */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                标题预览
              </Label>
              <h3 className="text-2xl font-bold mt-1">
                {title || "未填写标题"}
              </h3>
            </div>

            {/* 内容预览 */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                内容预览
              </Label>
              <div className="mt-1 p-4 rounded-lg bg-card border min-h-[120px] whitespace-pre-wrap text-sm leading-relaxed">
                {description || "暂无内容"}
              </div>
            </div>

            {/* 标签预览 */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                标签
              </Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {tagList.length > 0 ? (
                  tagList.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">暂无标签</span>
                )}
              </div>
            </div>

            {/* IP 信息 */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                IP 信息
              </Label>
              {selectedIP ? (
                <div className="mt-1 p-3 rounded-lg bg-card border space-y-1">
                  <p className="text-sm font-medium">
                    ✨ {selectedIP.name}
                  </p>
                  {selectedIP.stylePrompt && (
                    <p className="text-xs text-muted-foreground">
                      风格: {selectedIP.stylePrompt}
                    </p>
                  )}
                  {selectedIP.description && (
                    <p className="text-xs text-muted-foreground">
                      {selectedIP.description}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">未选择 IP</p>
              )}
            </div>

            {/* 图片预览 */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                图片预览
              </Label>
              {!imageGenerating && generatedImages.length > 0 && (
                <p className="text-xs text-green-600 mt-1 mb-2 font-medium">
                  ✅ 生成完成
                </p>
              )}
              {generatedImages.length > 0 ? (
                <div className="flex gap-2 flex-wrap mt-1">
                  {generatedImages.map((img, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={img}
                        alt={`图 ${i + 1}`}
                        className="h-24 w-20 object-cover rounded-lg border cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                        onClick={() => setFullscreenImage(img)}
                      />
                      <button
                        className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setGeneratedImages((prev) =>
                            prev.filter((_, j) => j !== i)
                          );
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  {imageGenerating ? "生成中..." : "暂无图片"}
                </p>
              )}
            </div>

            {/* 平台信息 */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                目标平台
              </Label>
              <div className="mt-1">{platformBadge(platform)}</div>
            </div>
          </div>

          {/* ── 右侧控制面板 ── */}
          <div className="w-96 shrink-0 border-l bg-background overflow-y-auto p-4 space-y-4">
            {/* IP 人设选择器 */}
            <div className="space-y-2">
              <Label className="text-xs">IP 人设</Label>
              <select
                value={selectedIPId}
                onChange={(e) => setSelectedIPId(e.target.value)}
                className="h-9 text-sm w-full rounded-md border bg-background px-3"
              >
                <option value="">不使用 IP</option>
                {ipList.map((ip) => (
                  <option key={ip.id} value={ip.id}>
                    {ip.name}
                  </option>
                ))}
              </select>
            </div>

            {/* AI 文案生成 */}
            <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-100 dark:from-purple-950 dark:to-pink-950 dark:border-purple-900">
              <CardContent className="p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                  AI 文案生成
                </p>
                <div className="flex gap-2">
                  <Input
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    placeholder="输入主题，如「新手养猫必看」"
                    className="h-8 text-sm flex-1"
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleAiGenerate()
                    }
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
              </CardContent>
            </Card>

            {/* AI 图片生成（含提示词） */}
            <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-100 dark:from-blue-950 dark:to-cyan-950 dark:border-blue-900">
              <CardContent className="p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-1">
                  <ImageIcon className="h-3.5 w-3.5 text-blue-500" />
                  AI 图片生成
                </p>
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0">张数</Label>
                  <select
                    value={imageCount}
                    onChange={(e) => setImageCount(Number(e.target.value))}
                    className="h-8 text-sm w-20 rounded-md border bg-background px-2"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <option key={n} value={n}>
                        {n} 张
                      </option>
                    ))}
                  </select>
                  <select
                    value={imageQuality}
                    onChange={(e) => setImageQuality(e.target.value as "high" | "medium" | "low")}
                    className="h-8 rounded border bg-background px-2 text-xs"
                    title="图片质量"
                  >
                    <option value="high">高清</option>
                    <option value="medium">标准</option>
                    <option value="low">低清</option>
                  </select>
                  <select
                    value={imageStyle}
                    onChange={(e) => setImageStyle(e.target.value)}
                    className="h-8 rounded border bg-background px-2 text-xs max-w-[110px]"
                    title="画面风格"
                  >
                    {IMAGE_STYLES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    className="h-8 gap-1"
                    variant="outline"
                    onClick={handleGenerateImagePrompt}
                    disabled={imagePromptGenerating || (!description && !title)}
                  >
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    {imagePromptGenerating ? "正在生成提示词..." : imageGenPrompt.length > 0 ? "已生成" : "生成提示词"}
                  </Button>
                </div>

                <Button
                  size="sm"
                  className="h-8 gap-1 w-full"
                  onClick={handleGenerateImages}
                  disabled={imageGenerating || imagePromptGenerating || imageGenPrompt.length === 0}
                >
                  {imageGenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ImageIcon className="h-3 w-3" />
                  )}
                  {imageGenerating ? "生成中..." : imageGenPrompt.length === 0 ? "请先生成提示词" : `生成 ${imageCount} 张图片`}
                </Button>

                {/* 生图进度条 */}
                {imageGenerating && activeGenTask?.progress && activeGenTask.progress.total > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">生成进度</span>
                      <span className="text-[10px] font-mono tabular-nums text-primary">
                        {activeGenTask.progress.done}/{activeGenTask.progress.total}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${Math.round((activeGenTask.progress.done / activeGenTask.progress.total) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {imageGenPrompt.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[10px] text-muted-foreground">
                      每张图的 prompt（可编辑，角色/风格保持一致）：
                    </p>
                    {imageGenPrompt.slice(0, imageCount).map((p, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-[10px] text-muted-foreground shrink-0 pt-1.5">图{i + 1}</span>
                        <Textarea
                          value={p}
                          onChange={(e) => {
                            const next = [...imageGenPrompt];
                            next[i] = e.target.value;
                            setImageGenPrompt(next);
                            setImagePrompt(next.join(" | "));
                          }}
                          rows={2}
                          className="text-[11px] resize-none flex-1"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {aiError && (
                  <p className="text-xs text-destructive">{aiError}</p>
                )}
              </CardContent>
            </Card>

            {/* 标题 */}
            <div className="space-y-2">
              <Label>标题</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="内容标题"
              />
            </div>

            {/* 内容 */}
            <div className="space-y-2">
              <Label>描述/文案</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="内容描述或文案..."
                rows={6}
              />
            </div>

            {/* 标签 */}
            <div className="space-y-2">
              <Label>标签（逗号分隔）</Label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="穿搭, 护肤, 生活"
              />
            </div>

            {/* 目标平台 */}
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

            {/* 操作按钮 */}
            <div className="space-y-2 pt-2">
              <Button onClick={handleSave} className="w-full" variant="outline">
                保存草稿
              </Button>
              <Button
                onClick={handlePublishFromCreator}
                className="w-full gap-1"
                disabled={!title.trim()}
              >
                <Send className="h-4 w-4" /> 发布
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setShowCreator(false);
                  resetForm();
                }}
              >
                ← 返回列表
              </Button>
            </div>
          </div>
        </div>

        {/* 全屏图片预览 */}
        {fullscreenImage && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
            onClick={() => setFullscreenImage(null)}
          >
            <img
              src={fullscreenImage}
              alt="预览"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            />
            <button
              className="absolute top-4 right-4 text-white bg-black/40 hover:bg-black/60 rounded-full p-2 transition-colors"
              onClick={() => setFullscreenImage(null)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* 发布确认弹窗 */}
        <Dialog
          open={confirmPublishOpen}
          onOpenChange={(open) => {
            if (!open) setConfirmPublishOpen(false);
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                确认发布
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <p className="text-sm">
                确认发布到 {platform === "both" ? "小红书和抖音" : PLATFORM_LABELS[platform]}？
              </p>
              <p className="text-sm font-semibold">
                标题：{title || "(无标题)"}
              </p>
              {platform === "both" && (
                <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded text-center">
                  📱 将同时发布到小红书和抖音
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirmPublishOpen(false)}
                >
                  取消
                </Button>
                <Button
                  className="flex-1 gap-1"
                  onClick={handleConfirmPublish}
                >
                  <Send className="h-4 w-4" /> 确认发布
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
          </>
        )}
      </div>
    );
  }



  // ─── 内容列表页 ───
  return (
    <div className="space-y-6">
      <PageHeader
        title="内容创作"
        description="AI 辅助创作 + 一键发布小红书/抖音"
        action={
          <Button className="gap-1" onClick={handleNewContent}>
            <Plus className="h-4 w-4" /> 新建内容
          </Button>
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
            {monitorData.map((p) => (
              <div
                key={p.platform}
                className={`rounded-lg border p-3 text-center ${
                  p.supported
                    ? "bg-white dark:bg-gray-900"
                    : "bg-gray-50 dark:bg-gray-800 opacity-60"
                }`}
              >
                <div className="text-lg mb-1">{p.icon}</div>
                <div className="text-xs font-medium mb-2">{p.label}</div>
                {p.supported ? (
                  <>
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          p.lastCount > 0 ? "bg-orange-500" : "bg-green-500"
                        }`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {p.lastCount > 0
                          ? `${p.lastCount} 条未读`
                          : "无未读"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      总消息: {p.lastTotal}
                    </div>
                    {p.lastCheck && (
                      <div className="text-xs text-muted-foreground mt-1">
                        检测:{" "}
                        {new Date(p.lastCheck).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">暂未支持</div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 发布任务日志 */}
      {publishingId && !publishDismissed && (
        <Card className={`border-2 ${
          publishDone
            ? publishError
              ? "border-red-200 bg-red-50/30"
              : "border-green-200 bg-green-50/30"
            : "bg-muted/50 border-dashed"
        }`}>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              {!publishDone ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : publishError ? (
                <XCircle className="h-5 w-5 text-red-500" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
              <span className="text-sm font-semibold">
                {!publishDone
                  ? (publishJobIds && publishJobIds.length > 0 ? "发布中..." : "准备发布...")
                  : publishError
                    ? "发布失败"
                    : "发布完成"}
              </span>
              <div className="ml-auto flex gap-1">
                {publishDone && publishError && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={handleRetryPublish}
                  >
                    <RotateCw className="h-3 w-3" /> 重试
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => {
                    setPublishDismissed(true);
                    setPublishJobIds(null);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {publishDone && (
              <p className="text-xs mb-2">
                {publishError
                  ? "⚠️ 请查看下方日志了解失败原因，可点击「重试」按钮从当前进度继续执行"
                  : "✅ 内容已成功发布！"}
              </p>
            )}
            {publishLog.includes("[NEED_LOGIN]") && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-sm space-y-1.5 mb-2">
                <p className="font-medium text-amber-800">
                  🔐 请在浏览器中手动登录
                </p>
                <p className="text-xs text-amber-600">
                  登录后脚本会自动检测并继续发布，无需额外操作
                </p>
              </div>
            )}
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto font-mono bg-background/50 rounded p-2">
              {publishLog || "等待日志..."}
            </pre>
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}

// ── SetupWizard 内嵌组件 ──

const STEP_ICONS: Record<string, string> = {
  node: "📦",
  python: "🐍",
  uv: "📥",
  "browser-act": "🌐",
  chrome: "🌐",
  "browser-id": "🔧",
  "qwapi-key": "🔑",
  login: "🔐",
};

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
              <div
                key={s.name}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                <span>
                  {STEP_ICONS[s.name]} {s.label}
                </span>
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
          <span>
            环境配置进度 {passedCount}/{totalCount}
          </span>
          <span>
            {Math.round((passedCount / Math.max(totalCount, 1)) * 100)}%
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 rounded-full"
            style={{
              width: `${(passedCount / Math.max(totalCount, 1)) * 100}%`,
            }}
          />
        </div>
        <div className="flex gap-1.5 justify-center">
          {steps.map((s) => (
            <div
              key={s.name}
              className={`w-6 h-1.5 rounded-full transition-colors ${
                s.ok
                  ? "bg-green-500"
                  : s === currentStep
                    ? "bg-primary"
                    : "bg-muted-foreground/30"
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
                <Badge variant="secondary" className="text-xs">
                  可选
                </Badge>
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
              <div
                className={`text-sm p-3 rounded-lg ${
                  fixResult.ok
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {fixResult.ok ? "✅ " : "❌ "}
                {fixResult.msg}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {currentStep.action &&
                (currentStep.action.startsWith("http") ? (
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      window.open(currentStep.action, "_blank")
                    }
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {currentStep.actionLabel || "前往"}
                  </Button>
                ) : currentStep.action.startsWith("/") ? (
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      (window.location.href = currentStep.action!)
                    }
                  >
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
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        执行中...
                      </>
                    ) : (
                      <>
                        <RotateCw className="h-3.5 w-3.5" />
                        {currentStep.actionLabel || "一键修复"}
                      </>
                    )}
                  </Button>
                ))}

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={onRunChecks}
              >
                <RotateCw className="h-3.5 w-3.5" />
                重新检测
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 已完成步骤摘要 */}
      {passedCount > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground font-medium">已完成</p>
          {steps
            .filter((s) => s.ok)
            .map((s) => (
              <div
                key={s.name}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                <span>
                  {STEP_ICONS[s.name]} {s.label}
                </span>
                <span className="text-xs ml-auto opacity-60">{s.detail}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
