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
  SelectValue,
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
} from "lucide-react";
import { CONTENT_STATUS_MAP } from "@/lib/constants";
import type { ContentItem, Platform, ContentStatus } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

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
  const [aiPlatform, setAiPlatform] = useState<Platform>("xiaohongshu");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");

  // 发布状态
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishJobId, setPublishJobId] = useState<string | null>(null);
  const [publishLog, setPublishLog] = useState("");

  const fetchContents = async () => {
    const res = await fetch("/api/content");
    const data = await res.json();
    setContents(data.contents || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchContents();
  }, []);

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
  };

  const handleSave = async () => {
    const now = new Date().toISOString();
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
      mediaPaths: editingContent?.mediaPaths || [],
      aiGenerated: editingContent?.aiGenerated || false,
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
        body: JSON.stringify({ topic: aiTopic, platform: aiPlatform }),
      });

      const data = await res.json();
      if (data.success) {
        setTitle(data.title || "");
        setDescription(data.content || "");
        setTags((data.tags || []).join(", "));
        setPlatform(aiPlatform);
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

  const handleEdit = (item: ContentItem) => {
    setEditingContent(item);
    setTitle(item.title);
    setDescription(item.description);
    setPlatform(item.platform);
    setStatus(item.status);
    setTags(item.tags.join(", "));
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/content/${id}`, { method: "DELETE" });
    fetchContents();
  };

  // 一键发布
  const handlePublish = async (item: ContentItem) => {
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
        }),
      });

      const data = await res.json();
      if (data.success) {
        setPublishJobId(data.jobId);
        setPublishLog(`发布任务已启动: ${data.script}`);
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
                  <CardContent className="p-4">
                    <p className="text-sm font-medium mb-2 flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                      AI 生成文案
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={aiTopic}
                        onChange={(e) => setAiTopic(e.target.value)}
                        placeholder="输入主题，如「新手养猫必看」"
                        className="h-8 text-sm"
                        onKeyDown={(e) => e.key === "Enter" && handleAiGenerate()}
                      />
                      <Select
                        value={aiPlatform}
                        onValueChange={(v) => setAiPlatform(v as Platform)}
                      >
                        <SelectTrigger className="h-8 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="xiaohongshu">📕 小红书</SelectItem>
                          <SelectItem value="douyin">🎵 抖音</SelectItem>
                        </SelectContent>
                      </Select>
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
                    {aiError && (
                      <p className="text-xs text-red-500 mt-2">{aiError}</p>
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
                        <SelectValue />
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
                        <SelectValue />
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
        }
      />

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
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
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
    </div>
  );
}
