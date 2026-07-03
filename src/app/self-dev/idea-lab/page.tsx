"use client";

import { useState, useEffect } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, FlaskConical, Edit, Trash2, Lightbulb } from "lucide-react";
import type { Idea, IdeaCategory, IdeaStatus } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

const CATEGORY_MAP: Record<string, string> = {
  project: "💡 项目",
  content: "📝 内容",
  tool: "🔧 工具",
  learning: "📚 学习",
  other: "📌 其他",
};

const STATUS_MAP: Record<string, string> = {
  new: "新想法",
  exploring: "调研中",
  in_progress: "进行中",
  done: "已完成",
  abandoned: "放弃",
};

export default function IdeaLabPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [content, setContent] = useState("");
  const [category, setCategory] = useState<IdeaCategory>("project");
  const [tags, setTags] = useState("");
  const [source, setSource] = useState("");

  const fetchIdeas = async () => {
    const res = await fetch("/api/idea");
    const data = await res.json();
    setIdeas(data.ideas || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchIdeas();
  }, []);

  const resetForm = () => {
    setContent("");
    setCategory("project");
    setTags("");
    setSource("");
  };

  const handleSave = async () => {
    const now = new Date().toISOString();
    const idea: Idea = {
      id: uuidv4(),
      content,
      category,
      source: source || undefined,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      status: "new",
      createdAt: now,
      updatedAt: now,
    };

    await fetch("/api/idea", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(idea),
    });

    resetForm();
    setDialogOpen(false);
    fetchIdeas();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/idea/${id}`, { method: "DELETE" });
    fetchIdeas();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="创意实验室"
        description="捕捉每一个灵感，用 AI 扩展你的想法"
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
                <Plus className="h-4 w-4" /> 记录灵感
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>💡 记录新灵感</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>灵感内容</Label>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="写下你的想法..."
                    rows={4}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>分类</Label>
                    <Select
                      value={category}
                      onValueChange={(v) => setCategory(v as IdeaCategory)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="project">💡 项目点子</SelectItem>
                        <SelectItem value="content">📝 内容创意</SelectItem>
                        <SelectItem value="tool">🔧 工具想法</SelectItem>
                        <SelectItem value="learning">📚 学习方向</SelectItem>
                        <SelectItem value="other">📌 其他</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>灵感来源</Label>
                    <Input
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      placeholder="刷小红书想到 / 读书..."
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>标签（逗号分隔）</Label>
                  <Input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="AI, 前端, 一人公司"
                  />
                </div>
                <Button onClick={handleSave} className="w-full">
                  保存灵感
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : ideas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FlaskConical className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">还没有灵感记录</p>
            <p className="text-xs mt-1">
              灵感转瞬即逝，快点记下来吧～
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ideas.map((idea) => (
            <Card
              key={idea.id}
              className="hover:shadow-md transition-shadow"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <Badge variant="outline">
                    {CATEGORY_MAP[idea.category] || idea.category}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleDelete(idea.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm line-clamp-4 mb-2">{idea.content}</p>
                {idea.source && (
                  <p className="text-xs text-muted-foreground mb-2">
                    来源：{idea.source}
                  </p>
                )}
                {idea.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {idea.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(idea.createdAt).toLocaleDateString("zh-CN")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
