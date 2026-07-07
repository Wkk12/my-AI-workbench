"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Loader2, Sparkles, Upload } from "lucide-react";
import type { IPItem } from "@/lib/types";

export default function IPsPage() {
  const [ips, setIps] = useState<IPItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [fName, setFName] = useState("");
  const [fDescription, setFDescription] = useState("");
  const [fStylePrompt, setFStylePrompt] = useState("");
  const [fImageFile, setFImageFile] = useState<File | null>(null);
  const [fImagePreview, setFImagePreview] = useState("");

  const fetchIPs = useCallback(async () => {
    try {
      const res = await fetch("/api/ips");
      const data = await res.json();
      setIps(data.ips || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchIPs(); }, [fetchIPs]);

  const resetForm = () => {
    setFName("");
    setFDescription("");
    setFStylePrompt("");
    setFImageFile(null);
    setFImagePreview("");
    setEditingId(null);
  };

  const handleEdit = (ip: IPItem) => {
    setEditingId(ip.id);
    setFName(ip.name);
    setFDescription(ip.description || "");
    setFStylePrompt(ip.stylePrompt || "");
    setFImageFile(null);
    setFImagePreview(ip.imagePath || "");
    setDialogOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFImageFile(file);
      setFImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!fName.trim()) return;
    setSaving(true);

    const formData = new FormData();
    formData.append("name", fName.trim());
    formData.append("description", fDescription.trim());
    formData.append("stylePrompt", fStylePrompt.trim());
    if (fImageFile) {
      formData.append("image", fImageFile);
    }

    const url = editingId ? `/api/ips/${editingId}` : "/api/ips";
    const method = editingId ? "PUT" : "POST";

    await fetch(url, { method, body: formData });

    setSaving(false);
    resetForm();
    setDialogOpen(false);
    fetchIPs();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个 IP 吗？相关图片也会被清理。")) return;
    await fetch(`/api/ips/${id}`, { method: "DELETE" });
    fetchIPs();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="IP 管理"
        description="管理你的人设 IP，统一内容创作风格"
        action={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger>
              <Button className="gap-1" onClick={() => { resetForm(); setDialogOpen(true); }}>
                <Plus className="h-4 w-4" /> 新建 IP
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? "编辑 IP" : "新建 IP"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>IP 名称</Label>
                  <Input
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    placeholder="如：美少女珂"
                  />
                </div>
                <div className="space-y-2">
                  <Label>人设描述</Label>
                  <Textarea
                    value={fDescription}
                    onChange={(e) => setFDescription(e.target.value)}
                    placeholder="如：95后时尚博主，甜美可爱风格..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>风格提示词（用于生图）</Label>
                  <Input
                    value={fStylePrompt}
                    onChange={(e) => setFStylePrompt(e.target.value)}
                    placeholder="如：kawaii style, soft pastel colors, clean aesthetic"
                  />
                </div>
                <div className="space-y-2">
                  <Label>参考图片</Label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer px-3 py-2 border rounded-lg hover:bg-muted transition-colors text-sm">
                      <Upload className="h-3.5 w-3.5" />
                      选择图片
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageChange}
                      />
                    </label>
                    {fImagePreview && (
                      <img
                        src={fImagePreview}
                        alt="预览"
                        className="h-16 w-12 object-cover rounded-lg border"
                      />
                    )}
                  </div>
                </div>
                <Button onClick={handleSave} className="w-full" disabled={saving || !fName.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  保存
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : ips.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">还没有 IP</p>
            <p className="text-xs mt-1">创建第一个人设 IP，统一内容创作风格吧～</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ips.map((ip) => (
            <Card key={ip.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {ip.imagePath && (
                      <img
                        src={ip.imagePath}
                        alt={ip.name}
                        className="h-14 w-10 object-cover rounded-lg border"
                      />
                    )}
                    <CardTitle className="text-base">{ip.name}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {ip.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                    {ip.description}
                  </p>
                )}
                {ip.stylePrompt && (
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 mb-3 line-clamp-2">
                    🎨 {ip.stylePrompt}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(ip.updatedAt).toLocaleDateString("zh-CN")}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(ip)}>
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(ip.id)}>
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
