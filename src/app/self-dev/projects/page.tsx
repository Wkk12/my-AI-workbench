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
} from "@/components/ui/select";
import { Plus, Kanban, Edit, Trash2 } from "lucide-react";
import { PROJECT_STATUS_MAP } from "@/lib/constants";
import type { Project, ProjectStatus } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

const STATUS_LABELS: Record<string, string> = {
  idea: "💡 想法",
  developing: "🚧 开发中",
  launched: "🚀 已上线",
  maintaining: "🔧 维护中",
  archived: "📦 归档",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("idea");
  const [techStackStr, setTechStackStr] = useState("");
  const [notes, setNotes] = useState("");

  const fetchProjects = async () => {
    const res = await fetch("/api/project");
    const data = await res.json();
    setProjects(data.projects || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const resetForm = () => {
    setName("");
    setDescription("");
    setStatus("idea");
    setTechStackStr("");
    setNotes("");
    setEditingProject(null);
  };

  const handleSave = async () => {
    const now = new Date().toISOString();
    const project: Project = {
      id: editingProject?.id || uuidv4(),
      name,
      description,
      status,
      techStack: techStackStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      tasks: editingProject?.tasks || [],
      milestones: editingProject?.milestones || [],
      notes,
      createdAt: editingProject?.createdAt || now,
      updatedAt: now,
    };

    await fetch("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });

    resetForm();
    setDialogOpen(false);
    fetchProjects();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/project/${id}`, { method: "DELETE" });
    fetchProjects();
  };

  const statusConfig = (s: ProjectStatus) => {
    return (
      PROJECT_STATUS_MAP[s] || { label: s, color: "bg-gray-100 text-gray-800" }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="项目看板"
        description="管理你的一人公司项目，追踪进度"
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
                <Plus className="h-4 w-4" /> 新建项目
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingProject ? "编辑项目" : "新建项目"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>项目名称</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="项目名称"
                  />
                </div>
                <div className="space-y-2">
                  <Label>描述</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="项目描述..."
                    rows={2}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>状态</Label>
                    <Select
                      value={status}
                      onValueChange={(v) => setStatus(v as ProjectStatus)}
                    >
                      <SelectTrigger>
                        {STATUS_LABELS[status] || "选择状态"}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="idea">💡 想法</SelectItem>
                        <SelectItem value="developing">🚧 开发中</SelectItem>
                        <SelectItem value="launched">🚀 已上线</SelectItem>
                        <SelectItem value="maintaining">🔧 维护中</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>技术栈（逗号分隔）</Label>
                    <Input
                      value={techStackStr}
                      onChange={(e) => setTechStackStr(e.target.value)}
                      placeholder="Next.js, Tailwind, Python"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>备注</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="备注..."
                    rows={2}
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

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Kanban className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">还没有项目</p>
            <p className="text-xs mt-1">添加你的第一个 side project 吧～</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const s = statusConfig(p.status);
            return (
              <Card
                key={p.id}
                className="hover:shadow-md transition-shadow"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base truncate flex-1">
                      {p.icon} {p.name}
                    </CardTitle>
                    <Badge variant="outline" className={s.color}>
                      {s.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                    {p.description || "暂无描述"}
                  </p>
                  {p.techStack.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {p.techStack.map((tech) => (
                        <Badge key={tech} variant="secondary" className="text-xs">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {p.tasks.length} 个任务
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingProject(p);
                          setName(p.name);
                          setDescription(p.description);
                          setStatus(p.status);
                          setTechStackStr(p.techStack.join(", "));
                          setNotes(p.notes);
                          setDialogOpen(true);
                        }}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDelete(p.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
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
