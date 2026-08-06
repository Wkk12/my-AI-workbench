"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import git from "isomorphic-git";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Play,
  Download,
  Trash2,
  Loader2,
  RefreshCw,
  FolderOpen,
  HardDrive,
  ChevronLeft,
  ChevronRight,
  SaveAll,
  AlertTriangle,
  GitFork,
  Check,
  X,
} from "lucide-react";
import { createHandleFS, findGitRepos } from "@/lib/handle-fs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { DailyReportMeta } from "@/lib/types";

/** 每日日报结构 */
interface DailyReportItem {
  id: string;
  date: string;
  content: string;
  meta: DailyReportMeta;
}

/** 判断浏览器是否支持 File System Access API */
const hasFileSystemAPI = typeof window !== "undefined" && "showDirectoryPicker" in window;

/** 单个 commit 结构 */
interface CommitEntry {
  title: string;
  body: string;
}

/** 对单个仓库读取 git log（浏览器端，使用 isomorphic-git） */
async function getRepoCommitsBrowser(
  repoHandle: FileSystemDirectoryHandle,
  since: Date,
  until: Date,
  author: string
): Promise<{ repoName: string; commits: CommitEntry[] }> {
  const name = repoHandle.name;
  try {
    const fs = createHandleFS(repoHandle);
    const commits = await git.log({
      fs,
      dir: "/",
      depth: 200,
      since: since,
    });

    // 过滤 merge 提交（有多个 parent）
    const nonMerge = commits.filter((c) => {
      const parents = c.commit.parent || [];
      const isMerge = parents.length > 1;
      if (isMerge) return false;
      // 也过滤以 "Merge" 开头的消息
      const msg = (c.commit.message || "").trim();
      if (/^Merge\b/i.test(msg)) return false;
      return true;
    });

    // 过滤 author
    const filtered = nonMerge.filter((c) => {
      const commitAuthor = c.commit.author.name;
      return (
        !author ||
        commitAuthor.toLowerCase().includes(author.toLowerCase())
      );
    });

    return {
      repoName: name,
      commits: filtered.map((c) => {
        const lines = c.commit.message.split("\n");
        const title = lines[0] || "";
        const body = lines.slice(1).join("\n").trim();
        return { title, body };
      }),
    };
  } catch (e) {
    console.error(`Failed to read git log for ${name}:`, e);
    return { repoName: name, commits: [] };
  }
}

export default function DailyReportPage() {
  const [reports, setReports] = useState<DailyReportMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // 生成参数
  const today = new Date().toISOString().split("T")[0];
  const [dateType, setDateType] = useState<"single" | "range">("single");
  const [date, setDate] = useState(today);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [rangeMode, setRangeMode] = useState<"summary" | "daily">("summary");
  const [source, setSource] = useState<"local" | "gitlab" | "github">("github");
  const [localRoot, setLocalRoot] = useState("");
  const [branch, setBranch] = useState("dev_wkk");
  const [author, setAuthor] = useState("");
  const [repoCount, setRepoCount] = useState(0);
  const [foundRepos, setFoundRepos] = useState<{ name: string }[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());

  // 浏览器端保存用户选择的目录句柄
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  // 预览区
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<DailyReportMeta | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // 每日日报模式：多日报预览
  const [dailyReports, setDailyReports] = useState<DailyReportItem[]>([]);
  const [currentDailyIndex, setCurrentDailyIndex] = useState(0);

  // GitHub 模式参数
  const [githubToken, setGithubToken] = useState("");
  const [githubOwner, setGithubOwner] = useState("Wkk12");
  const [githubRepos, setGithubRepos] = useState<string[]>([]);
  const [availableRepos, setAvailableRepos] = useState<string[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");

  // 覆盖确认弹窗
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [overwriteDays, setOverwriteDays] = useState<string[]>([]);

  const fetchReports = useCallback(async () => {
    const res = await fetch("/api/daily-report");
    const data = await res.json();
    setReports(data.reports || []);
    setLoading(false);
  }, []);

  // 保存默认值到设置
  const saveDefaults = useCallback(async (root: string, br: string, au: string) => {
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gitlab: { localRoot: root, defaultBranch: br, defaultAuthor: au },
        }),
      });
    } catch {}
  }, []);

  useEffect(() => {
    fetchReports();
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

  /** 选择本地目录（File System Access API） */
  const handlePickDirectory = async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      dirHandleRef.current = handle;
      setLocalRoot(handle.name);
      saveDefaults(handle.name, branch, author);
      const repos = await findGitRepos(handle);
      setRepoCount(repos.length);
      setFoundRepos(repos.map(r => ({ name: r.name })));
      setSelectedRepos(new Set(repos.map(r => r.name)));
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error("选择目录失败:", err);
    }
  };

  /** 浏览器端生成日报 */
  const handleGenerateLocal = async () => {
    const handle = dirHandleRef.current;
    if (!handle) {
      setPreviewContent("# 生成失败\n\n> 请先选择一个本地目录");
      return;
    }

    setGenerating(true);
    setPreviewContent(null);
    setPreviewMeta(null);

    try {
      const isRange = dateType === "range" && fromDate && toDate;
      const reportId = isRange ? `${fromDate}_${toDate}` : date;
      const displayLabel = isRange ? `${fromDate} ~ ${toDate}` : date;

      const sinceDate = isRange ? fromDate : date;
      const untilDate = isRange ? toDate : date;
      const since = new Date(`${sinceDate}T00:00:00`);
      const until = new Date(`${untilDate}T23:59:59`);

      // 扫描仓库（只保留用户勾选的）
      const allRepos = await findGitRepos(handle);
      const repos = selectedRepos.size > 0 
        ? allRepos.filter(r => selectedRepos.has(r.name))
        : allRepos;

      if (repos.length === 0) {
        const emptyContent = `# 📋 ${displayLabel} 工作日报

> 生成时间：${new Date().toLocaleString("zh-CN")}

---

## 暂无提交记录

在 \`${handle.name}\` 下未找到 Git 仓库。

---

*由 喵站工作台 自动生成 🐱*
`;
        setPreviewContent(emptyContent);
        setPreviewMeta({
          id: reportId,
          date: displayLabel,
          projectCount: 0,
          commitCount: 0,
          createdAt: new Date().toISOString(),
          source: "local",
        });
        setGenerating(false);
        return;
      }

      // 并发读取所有仓库的 git log
      const results = await Promise.all(
        repos.map((r) => getRepoCommitsBrowser(r.handle, since, until, author))
      );

      const activeResults = results.filter((r) => r.commits.length > 0);

      // 构建 Markdown
      let markdown = `# 📋 ${displayLabel} 工作日报

> 生成时间：${new Date().toLocaleString("zh-CN")}
> 数据来源：本地仓库 (${handle.name})
${author ? `> 作者：${author}` : ""}

---

`;

      if (activeResults.length === 0) {
        markdown += `## 暂无提交记录

${isRange ? "该时间段内" : "今天"}没有新的 Git 提交记录，去写点代码吧！💪

扫描了 ${repos.length} 个仓库。

---

*由 喵站工作台 自动生成 🐱*
`;
      } else {
        for (const { repoName, commits } of activeResults) {
          markdown += `## ${repoName}\n\n`;
          commits.forEach((c, i) => {
            markdown += `${i + 1}. ${c.title}\n`;
            if (c.body) {
              c.body.split("\n").forEach((line) => {
                markdown += `    ${line}\n`;
              });
            }
          });
          markdown += "\n";
        }

        markdown += `---\n\n`;
        markdown += `> 共 ${activeResults.length} 个项目，${activeResults.reduce((s, r) => s + r.commits.length, 0)} 次提交\n\n`;
        markdown += `*由 喵站工作台 自动生成 🐱*\n`;
      }

      const projectCount = activeResults.length;
      const commitCount = activeResults.reduce((s, r) => s + r.commits.length, 0);

      setPreviewContent(markdown);
      setPreviewMeta({
        id: reportId,
        date: displayLabel,
        projectCount,
        commitCount,
        createdAt: new Date().toISOString(),
        source: "local",
      });
    } catch (err) {
      setPreviewContent(`# 生成失败\n\n> ${String(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  /** 服务端生成日报（GitLab API 模式，或旧版本地路径） */
  /** 加载 GitHub 仓库列表 */
  const loadGitHubRepos = useCallback(async () => {
    if (!githubOwner) return;
    setLoadingRepos(true);
    try {
      const params = new URLSearchParams({ owner: githubOwner });
      if (githubToken) params.set("token", githubToken);
      const res = await fetch(`/api/execute?${params}`);
      const data = await res.json();
      setAvailableRepos(data.repos || []);
    } catch {
      setAvailableRepos([]);
    } finally {
      setLoadingRepos(false);
    }
  }, [githubOwner, githubToken]);

  /** 切换仓库选中 */
  const toggleRepo = (repo: string) => {
    setGithubRepos((prev) =>
      prev.includes(repo) ? prev.filter((r) => r !== repo) : [...prev, repo]
    );
  };

  /** 全选/取消全选 */
  const toggleAllRepos = () => {
    const filtered = repoSearch
      ? availableRepos.filter((r) => r.toLowerCase().includes(repoSearch.toLowerCase()))
      : availableRepos;
    const allSelected = filtered.every((r) => githubRepos.includes(r));
    if (allSelected) {
      setGithubRepos([]);
    } else {
      setGithubRepos([...new Set([...githubRepos, ...filtered])]);
    }
  };

  const handleGenerateServer = async (skipOverwriteCheck = false) => {
    // 每日日报模式：先检查已有日报是否冲突
    const isRange = dateType === "range" && fromDate && toDate;
    const isDailyMode = isRange && rangeMode === "daily";

    if (isDailyMode && !skipOverwriteCheck) {
      const dates: string[] = [];
      const start = new Date(fromDate);
      const end = new Date(toDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split("T")[0]);
      }

      const existingIds = new Set(reports.map((r) => r.id));
      const conflicts = dates.filter((d) => existingIds.has(d));

      if (conflicts.length > 0) {
        setOverwriteDays(conflicts);
        setShowOverwriteDialog(true);
        return;
      }
    }

    await doGenerateServer();
  };

  const doGenerateServer = async () => {
    setGenerating(true);
    setPreviewContent(null);
    setPreviewMeta(null);
    setDailyReports([]);
    setCurrentDailyIndex(0);

    try {
      const isRange = dateType === "range" && fromDate && toDate;

      const body: Record<string, unknown> = {
        dateType,
        date: dateType === "single" ? date : undefined,
        fromDate: dateType === "range" ? fromDate : undefined,
        toDate: dateType === "range" ? toDate : undefined,
        rangeMode: isRange ? rangeMode : undefined,
        localRoot,
        branch: source === "github" ? "main" : branch,
        author,
        source,
      };

      if (source === "github") {
        body.githubToken = githubToken;
        body.githubOwner = githubOwner;
        body.githubRepos = githubRepos;
      }

      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.success) {
        if (data.mode === "daily" && data.reports) {
          // 每日日报模式
          setDailyReports(data.reports);
          if (data.reports.length > 0) {
            setPreviewContent(data.reports[0].content);
            setPreviewMeta(data.reports[0].meta);
          }
        } else {
          // 单天/汇总模式
          setPreviewContent(data.content);
          setPreviewMeta(data.meta);
        }
      } else {
        setPreviewContent(`# 生成失败\n\n> ${data.error || "未知错误"}`);
      }
    } catch (err) {
      setPreviewContent(`# 生成失败\n\n> ${String(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = () => {
    // 保存默认值
    if (source === "github") {
      handleGenerateServer();
    } else if (source === "local" && dirHandleRef.current) {
      handleGenerateLocal();
    } else {
      if (localRoot) saveDefaults(localRoot, branch, author);
      handleGenerateServer();
    }
  };

  const handleSave = async () => {
    if (dailyReports.length > 0) {
      // 每日日报模式：保存全部
      for (const report of dailyReports) {
        await fetch("/api/daily-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            meta: report.meta,
            content: report.content,
          }),
        });
      }
    } else if (previewContent && previewMeta) {
      // 单天/汇总模式
      await fetch("/api/daily-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meta: previewMeta,
          content: previewContent,
        }),
      });
    } else {
      return;
    }

    fetchReports();
  };

  /** 切换每日日报预览 */
  const switchDailyReport = (index: number) => {
    if (index >= 0 && index < dailyReports.length) {
      setCurrentDailyIndex(index);
      setPreviewContent(dailyReports[index].content);
      setPreviewMeta(dailyReports[index].meta);
    }
  };

  /** 关闭覆盖弹窗并确认覆盖 */
  const confirmOverwrite = () => {
    setShowOverwriteDialog(false);
    doGenerateServer();
  };

  const handleView = async (reportId: string) => {
    setSelectedReportId(reportId);
    setDailyReports([]);
    setCurrentDailyIndex(0);
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
        description="从 Git 提交记录生成工作日报。本地模式在浏览器中读取，数据不上传服务器。"
      />

      <div className="grid gap-6 lg:grid-cols-5 h-[calc(100vh-180px)]">
        {/* 左侧：生成参数 */}
        <div className="lg:col-span-2 space-y-4 overflow-y-auto h-full pr-1">
          {/* 生成参数 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">⚙️ 生成参数</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>日期类型</Label>
                <Tabs
                  value={dateType}
                  onValueChange={(v) => setDateType(v as "single" | "range")}
                >
                  <TabsList className="w-full">
                    <TabsTrigger value="single" className="flex-1">
                      📅 单天
                    </TabsTrigger>
                    <TabsTrigger value="range" className="flex-1">
                      📆 范围
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {dateType === "single" ? (
                <div className="space-y-2">
                  <Label>日期</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>开始日期</Label>
                      <Input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>结束日期</Label>
                      <Input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>生成模式</Label>
                    <Tabs
                      value={rangeMode}
                      onValueChange={(v) => setRangeMode(v as "summary" | "daily")}
                    >
                      <TabsList className="w-full">
                        <TabsTrigger value="summary" className="flex-1">
                          📊 汇总日报
                        </TabsTrigger>
                        <TabsTrigger value="daily" className="flex-1">
                          📅 每天日报
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label>数据来源</Label>
                <Tabs
                  value={source}
                  onValueChange={(v) => setSource(v as "local" | "gitlab" | "github")}
                >
                  <TabsList className="w-full">
                    <TabsTrigger value="github" className="flex-1">
                      <GitFork className="h-3.5 w-3.5 mr-1" />
                      GitHub
                    </TabsTrigger>
                    <TabsTrigger value="local" className="flex-1">
                      <HardDrive className="h-3.5 w-3.5 mr-1" />
                      本地仓库
                    </TabsTrigger>
                    <TabsTrigger value="gitlab" className="flex-1">
                      🔗 GitLab
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {source === "github" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>GitHub 用户名</Label>
                      <Input
                        value={githubOwner}
                        onChange={(e) => setGithubOwner(e.target.value)}
                        placeholder="Wkk12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Token (私有仓库需要)</Label>
                      <Input
                        type="password"
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        placeholder="ghp_xxx"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>选择仓库</Label>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={loadGitHubRepos}
                          disabled={loadingRepos}
                        >
                          <RefreshCw className={cn("h-3 w-3 mr-1", loadingRepos && "animate-spin")} />
                          加载列表
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={toggleAllRepos}
                        >
                          {githubRepos.length > 0 ? "取消全选" : "全选"}
                        </Button>
                      </div>
                    </div>

                    {availableRepos.length > 0 && (
                      <>
                        <Input
                          className="h-8 text-xs"
                          placeholder="搜索仓库..."
                          value={repoSearch}
                          onChange={(e) => setRepoSearch(e.target.value)}
                        />
                        <ScrollArea className="h-32 border rounded-md">
                          <div className="p-1">
                            {availableRepos
                              .filter((r) =>
                                !repoSearch ||
                                r.toLowerCase().includes(repoSearch.toLowerCase())
                              )
                              .map((repo) => {
                                const selected = githubRepos.includes(repo);
                                return (
                                  <div
                                    key={repo}
                                    className={cn(
                                      "flex items-center justify-between px-2 py-1 text-xs cursor-pointer rounded hover:bg-accent",
                                      selected && "bg-accent/50"
                                    )}
                                    onClick={() => toggleRepo(repo)}
                                  >
                                    <span className="truncate">{repo}</span>
                                    {selected && (
                                      <Check className="h-3 w-3 shrink-0 text-primary" />
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        </ScrollArea>
                      </>
                    )}

                    {availableRepos.length === 0 && !loadingRepos && (
                      <p className="text-xs text-muted-foreground">
                        输入用户名后点击「加载列表」
                      </p>
                    )}
                  </div>

                  {githubRepos.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {githubRepos.map((r) => (
                        <Badge key={r} variant="secondary" className="text-xs gap-1">
                          {r}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() => toggleRepo(r)}
                          />
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>分支</Label>
                      <Input
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        placeholder="main"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>作者 (可选)</Label>
                      <Input
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        placeholder="留空=全部作者"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    💡 通过 GitHub API 直接拉取提交记录，无需本地仓库。未选仓库=全量扫描。
                  </p>
                </>
              )}

              {source === "local" && (
                <>
                  <div className="space-y-2">
                    <Label>本地仓库根目录</Label>
                    {hasFileSystemAPI ? (
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          className="w-full gap-2"
                          onClick={handlePickDirectory}
                        >
                          <FolderOpen className="h-4 w-4" />
                          {dirHandleRef.current
                            ? "重新选择目录"
                            : "选择本地目录"}
                        </Button>
                        {dirHandleRef.current && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Badge variant="secondary" className="gap-1">
                                <FolderOpen className="h-3 w-3" />
                                {localRoot}
                              </Badge>
                              <span>发现 {repoCount} 个仓库</span>
                              {foundRepos.length > 0 && (
                                <>
                                  <button
                                    type="button"
                                    className="text-xs text-primary hover:underline"
                                    onClick={() => setSelectedRepos(new Set(foundRepos.map(r => r.name)))}
                                  >全选</button>
                                  <button
                                    type="button"
                                    className="text-xs text-muted-foreground hover:underline"
                                    onClick={() => setSelectedRepos(new Set())}
                                  >取消</button>
                                </>
                              )}
                            </div>
                            {foundRepos.length > 0 && (
                              <ScrollArea className="h-32 border rounded-md">
                                <div className="p-2 space-y-1">
                                  {foundRepos.map((repo) => (
                                    <label
                                      key={repo.name}
                                      className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer rounded hover:bg-accent"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedRepos.has(repo.name)}
                                        onChange={() => {
                                          const next = new Set(selectedRepos);
                                          next.has(repo.name) ? next.delete(repo.name) : next.add(repo.name);
                                          setSelectedRepos(next);
                                        }}
                                        className="h-3.5 w-3.5"
                                      />
                                      <GitFork className="h-3 w-3 text-muted-foreground shrink-0" />
                                      <span className="truncate">{repo.name}</span>
                                    </label>
                                  ))}
                                </div>
                              </ScrollArea>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          选择包含 Git 仓库的文件夹，日报在浏览器本地生成，数据不上传
                        </p>
                      </div>
                    ) : (
                      <>
                        <Input
                          value={localRoot}
                          onChange={(e) => setLocalRoot(e.target.value)}
                          placeholder="例如: /Users/xxx/projects"
                        />
                        <p className="text-xs text-yellow-600">
                          ⚠️ 当前浏览器不支持 File System Access API，将使用服务端模式。
                          建议使用 Chrome 或 Edge 浏览器。
                        </p>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>分支（仅显示用）</Label>
                      <Input
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>作者（可选）</Label>
                      <Input
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        placeholder="留空=全部作者"
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
                    {source === "local" && dirHandleRef.current
                      ? "正在扫描本地仓库..."
                      : "正在生成..."}
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
        </div>

        {/* 右侧 */}
        <div className="lg:col-span-3 flex flex-col gap-4 h-full">
          {/* 历史日报 (上 1/3) */}
          <Card className="flex-[1] flex flex-col overflow-hidden min-h-0">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
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
            <CardContent className="flex-1 overflow-y-auto">
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

          {/* 日报预览 (下 2/3) */}
          <Card className="flex-[2] flex flex-col overflow-hidden min-h-0">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              {dailyReports.length > 1 && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={currentDailyIndex <= 0}
                  onClick={() => switchDailyReport(currentDailyIndex - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              <CardTitle className="text-base">
                {dailyReports.length > 1
                  ? `📄 ${dailyReports[currentDailyIndex]?.date} 日报预览 (${currentDailyIndex + 1}/${dailyReports.length})`
                  : previewMeta
                    ? `📄 ${previewMeta.date} 日报预览`
                    : "📄 日报预览"}
              </CardTitle>
              {dailyReports.length > 1 && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={currentDailyIndex >= dailyReports.length - 1}
                  onClick={() => switchDailyReport(currentDailyIndex + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
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
                    (dailyReports.length === 0 &&
                      reports.some((r) => r.id === previewMeta?.id))
                  }
                >
                  {dailyReports.length > 1 ? (
                    <>
                      <SaveAll className="h-3.5 w-3.5" />
                      保存全部 ({dailyReports.length})
                    </>
                  ) : (
                    "保存"
                  )}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {previewContent ? (
              <div className="markdown-preview prose prose-sm max-w-none">
                <ReactMarkdown>{previewContent}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground flex flex-col items-center justify-center">
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

      {/* 覆盖确认弹窗 */}
      {showOverwriteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4 shadow-xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                确认覆盖已有日报
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                以下日期的日报已经存在，生成将会覆盖：
              </p>
              <div className="flex flex-wrap gap-2">
                {overwriteDays.map((d) => (
                  <Badge key={d} variant="secondary" className="text-sm">
                    📅 {d}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowOverwriteDialog(false)}
                >
                  取消
                </Button>
                <Button size="sm" onClick={confirmOverwrite}>
                  确认覆盖并生成
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
