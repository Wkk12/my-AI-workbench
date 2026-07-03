"use client";

import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Play,
  Download,
  Trash2,
  Loader2,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Eye,
} from "lucide-react";
import type { DailyReportMeta } from "@/lib/types";

export default function DailyReportPage() {
  const [reports, setReports] = useState<DailyReportMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // 生成参数
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [source, setSource] = useState<"local" | "gitlab">("local");
  const [localRoot, setLocalRoot] = useState("F:\\RY");
  const [branch, setBranch] = useState("dev_wkk");
  const [author, setAuthor] = useState("Wkk12");

  // 预览区
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<DailyReportMeta | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    const res = await fetch("/api/daily-report");
    const data = await res.json();
    setReports(data.reports || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReports();
    // 加载设置
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.gitlab) {
          if (data.gitlab.localRoot) setLocalRoot(data.gitlab.localRoot);
          if (data.gitlab.defaultBranch) setBranch(data.gitlab.defaultBranch);
          if (data.gitlab.defaultAuthor) setAuthor(data.gitlab.defaultAuthor);
        }
      })
      .catch(() => {});
  }, [fetchReports]);

  const handleGenerate = async () => {
    setGenerating(true);
    setPreviewContent(null);
    setPreviewMeta(null);

    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          localRoot,
          branch,
          author,
          source,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setPreviewContent(data.content);
        setPreviewMeta(data.meta);
      } else {
        setPreviewContent(`# 生成失败\n\n> ${data.error || "未知错误"}`);
      }
    } catch (err) {
      setPreviewContent(`# 生成失败\n\n> ${String(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!previewContent || !previewMeta) return;

    await fetch("/api/daily-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meta: previewMeta,
        content: previewContent,
      }),
    });

    fetchReports();
  };

  const handleView = async (reportId: string) => {
    setSelectedReportId(reportId);
    const res = await fetch(`/api/daily-report/${reportId}`);
    const data = await res.json();
    setPreviewContent(data.content);
    setPreviewMeta(data.meta);
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/daily-report/${id}`, { method: "DELETE" });
    if (selectedReportId === id) {
      setSelectedReportId(null);
      setPreviewContent(null);
      setPreviewMeta(null);
    }
    fetchReports();
  };

  const handleDownload = () => {
    if (!previewContent || !previewMeta) return;
    const blob = new Blob([previewContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily_report_${previewMeta.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="日报生成"
        description="一键从 Git 提交记录生成工作日报"
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* 左侧：日报列表 + 生成参数 */}
        <div className="lg:col-span-2 space-y-4">
          {/* 生成参数 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">⚙️ 生成参数</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>日期</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>数据来源</Label>
                <Tabs
                  value={source}
                  onValueChange={(v) => setSource(v as "local" | "gitlab")}
                >
                  <TabsList className="w-full">
                    <TabsTrigger value="local" className="flex-1">
                      💻 本地仓库
                    </TabsTrigger>
                    <TabsTrigger value="gitlab" className="flex-1">
                      🔗 GitLab API
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {source === "local" && (
                <>
                  <div className="space-y-2">
                    <Label>本地仓库根目录</Label>
                    <Input
                      value={localRoot}
                      onChange={(e) => setLocalRoot(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>分支</Label>
                      <Input
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>作者</Label>
                      <Input
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              <Button
                className="w-full gap-2"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在生成...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    生成日报
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* 日报列表 */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">📋 历史日报</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={fetchReports}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  加载中...
                </div>
              ) : reports.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">还没有日报</p>
                  <p className="text-xs mt-1">生成你的第一篇日报吧～</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {reports.map((r) => (
                    <div
                      key={r.id}
                      className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                        selectedReportId === r.id
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted"
                      }`}
                      onClick={() => handleView(r.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {r.date}
                        </span>
                        {r.commitCount > 0 ? (
                          <Badge variant="secondary" className="text-xs">
                            {r.commitCount} commits
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-xs text-muted-foreground"
                          >
                            空
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 opacity-50 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(r.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 右侧：预览区 */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {previewMeta
                ? `📄 ${previewMeta.date} 日报预览`
                : "📄 日报预览"}
            </CardTitle>
            {previewContent && (
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={handleDownload}
                >
                  <Download className="h-3.5 w-3.5" />
                  下载
                </Button>
                <Button
                  size="sm"
                  className="gap-1"
                  onClick={handleSave}
                  disabled={
                    !previewMeta ||
                    reports.some((r) => r.id === previewMeta?.id)
                  }
                >
                  保存
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {previewContent ? (
              <div className="markdown-preview prose prose-sm max-w-none min-h-[400px]">
                <ReactMarkdown>{previewContent}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground min-h-[400px] flex flex-col items-center justify-center">
                <FileText className="h-16 w-16 mb-3 opacity-20" />
                <p className="text-sm">选择参数后点击「生成日报」</p>
                <p className="text-xs mt-1">
                  或者从左侧选择一篇已生成的日报查看
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
