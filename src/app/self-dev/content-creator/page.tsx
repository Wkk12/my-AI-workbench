"use client";

import { useState, useEffect } from "react";
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
import { Plus, PencilRuler, Edit, Trash2, Eye } from "lucide-react";
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

  const fetchContents = async () => {
    const res = await fetch("/api/content");
    const data = await res.json();
    setContents(data.contents || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchContents();
  }, []);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPlatform("xiaohongshu");
    setStatus("draft");
    setTags("");
    setEditingContent(null);
  };

  const handleSave = async () => {
    const now = new Date().toISOString();
    const content: ContentItem = {
      id: editingContent?.id || uuidv4(),
      title,
      description,
      platform,
      status,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      mediaPaths: editingContent?.mediaPaths || [],
      aiGenerated: editingContent?.aiGenerated || false,
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

  const statusBadge = (s: ContentStatus) => {
    const config = CONTENT_STATUS_MAP[s] || { label: s, color: "bg-gray-100" };
    return (
      <Badge variant="outline" className={config.color}>
        {config.label}
      </Badge>
    );
  };

  const platformLabel = (p: Platform) => {
    return p === "xiaohongshu" ? "📕 小红书" : p === "douyin" ? "🎵 抖音" : "📱 双平台";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="内容创作"
        description="管理小红书/抖音内容，追踪发布状态"
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
                    rows={4}
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

      {/* 内容列表 */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : contents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <PencilRuler className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">还没有内容</p>
            <p className="text-xs mt-1">点击「新建内容」开始创作吧～</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contents.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base truncate flex-1">
                    {item.title}
                  </CardTitle>
                  {statusBadge(item.status)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {platformLabel(item.platform)}
                </p>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
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
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
                  </span>
                  <div className="flex gap-1">
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
