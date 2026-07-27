"use client";

import { useState, useEffect } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Brain,
  Image as ImageIcon,
  Terminal,
  AlertCircle,
} from "lucide-react";
import type { PublishLogEntry, PublishStep, GroupedLogEntry } from "@/lib/publish-logger";

const PLATFORM_ICONS: Record<string, string> = {
  xiaohongshu: "📕",
  douyin: "🎵",
  both: "📕🎵",
};

const PLATFORM_LABELS: Record<string, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
  both: "双平台",
};

/** 脚本输出中的致命错误标记 — any match = 发布失败 */
const FATAL_PATTERN = /💥|❌|bail|脚本异常|发布失败|login_required|api_not_found|CDP.*失败|找不到|Cannot connect|process\.exit/i;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function StepIcon({ step }: { step: PublishStep }) {
  if (step.status === "error") return <XCircle className="h-4 w-4 text-red-500" />;
  if (step.status === "running") return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
  if (step.step.includes("prompt") || step.step.includes("生成")) return <Brain className="h-4 w-4 text-purple-500" />;
  if (step.step.includes("图片") || step.step.includes("封面")) return <ImageIcon className="h-4 w-4 text-pink-500" />;
  if (step.step.includes("脚本") || step.step.includes("执行")) return <Terminal className="h-4 w-4 text-amber-500" />;
  if (step.step.includes("发布")) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

export default function PublishLogsPage() {
  const [logs, setLogs] = useState<GroupedLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [childrenDetails, setChildrenDetails] = useState<Map<string, PublishLogEntry | null>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchLogs = async (p = 1) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/publish/logs?page=${p}&limit=${limit}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setPage(data.page || p);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchLogs(page); }, [page]);

  const goPage = (p: number) => {
    const max = Math.ceil(total / limit);
    if (p < 1 || p > max) return;
    setExpandedId(null);
    setChildrenDetails(new Map());
    fetchLogs(p);
  };

  const toggleExpand = async (entry: GroupedLogEntry) => {
    if (expandedId === entry.jobId) {
      setExpandedId(null);
      setChildrenDetails(new Map());
      return;
    }
    setExpandedId(entry.jobId);

    // If combined (dual-platform), fetch details for each child
    if (entry.platform === "both" && entry.children.length > 1) {
      const details = new Map<string, PublishLogEntry | null>();
      for (const child of entry.children) {
        try {
          const res = await fetch(`/api/publish/logs/${child.jobId}`);
          details.set(child.jobId, await res.json());
        } catch {
          details.set(child.jobId, null);
        }
      }
      setChildrenDetails(details);
    } else if (entry.children.length === 1) {
      // Single platform
      try {
        const res = await fetch(`/api/publish/logs/${entry.children[0].jobId}`);
        setChildrenDetails(new Map([[entry.children[0].jobId, await res.json()]]));
      } catch {
        setChildrenDetails(new Map([[entry.children[0].jobId, null]]));
      }
    }
  };

  const totalDuration = (entry: GroupedLogEntry): number | null => {
    if (!entry.endTime || !entry.startTime) return null;
    return entry.endTime - entry.startTime;
  };

  function renderSteps(title: string, detail: PublishLogEntry | null) {
    if (!detail) return null;
    return (
      <div className="space-y-2 mt-2">
        <p className="text-xs font-semibold text-muted-foreground">{title}</p>
        {detail.steps.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
            等待步骤记录...
          </p>
        ) : (
          detail.steps.map((step, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 p-2.5 rounded-lg text-sm ${
                step.status === "error"
                  ? "bg-red-50 border border-red-100"
                  : step.status === "running"
                  ? "bg-blue-50 border border-blue-100"
                  : "bg-muted/30"
              }`}
            >
              <StepIcon step={step} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-xs">{step.step}</span>
                  {step.model && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1">
                      {step.model}
                    </Badge>
                  )}
                  {step.durationMs && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatDuration(step.durationMs)}
                    </span>
                  )}
                  {step.status === "error" && (
                    <AlertCircle className="h-3 w-3 text-red-500" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap break-all">
                  {step.detail}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {new Date(step.timestamp).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
          ))
        )}
        {detail.result && (
          <div className="mt-2 p-2.5 rounded bg-gray-50 dark:bg-gray-900 border">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
              {detail.result.slice(-1500)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="发布日志"
        description="每次发布的详细执行记录"
        action={
          <Button variant="outline" size="sm" onClick={() => fetchLogs(page)} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
        }
      />

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-sm">加载中...</p>
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无发布记录</p>
            <p className="text-xs mt-1">去内容创作页面发布内容后，日志会出现在这里</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {logs.map((entry) => {
            const isExpanded = expandedId === entry.jobId;
            const isBatch = entry.platform === "both" && entry.children.length > 1;

            return (
              <Card
                key={entry.jobId}
                className={`hover:shadow-sm transition-shadow cursor-pointer ${
                  isExpanded ? "ring-2 ring-primary/30" : ""
                }`}
                onClick={() => toggleExpand(entry)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      <CardTitle className="text-sm truncate flex items-center gap-2">
                        <span>{PLATFORM_ICONS[entry.platform] || PLATFORM_ICONS[entry.children[0]?.platform] || "📄"}</span>
                        {entry.title}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isBatch ? (
                        entry.children.map((c) => (
                          <Badge key={c.jobId} variant="outline" className="text-xs">
                            {PLATFORM_LABELS[c.platform] || c.platform}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          {PLATFORM_LABELS[entry.platform] || entry.platform}
                        </Badge>
                      )}
                      {(() => {
                        // 三层检测: status/step/result 任一有错误即判定失败
                        const hasAnyError = entry.children.some(c =>
                          c.status === "error"
                          || (c.steps || []).some(s => s.status === "error")
                          || (c.result && FATAL_PATTERN.test(c.result))
                        );
                        const displayStatus = !hasAnyError && entry.status === "done" ? "done"
                          : hasAnyError ? "error"
                          : entry.status === "error" ? "error"
                          : "running";
                        if (displayStatus === "done") {
                          return (
                            <Badge className="text-xs bg-green-100 text-green-700">
                              <CheckCircle2 className="h-3 w-3 mr-1" />成功
                            </Badge>
                          );
                        } else if (displayStatus === "error") {
                          return (
                            <Badge className="text-xs bg-red-100 text-red-700">
                              <XCircle className="h-3 w-3 mr-1" />失败
                            </Badge>
                          );
                        } else {
                          return (
                            <Badge className="text-xs bg-blue-100 text-blue-700">
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />运行中
                            </Badge>
                          );
                        }
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(entry.startTime).toLocaleString("zh-CN")}
                    </span>
                    <span>{entry.stepCount} 个步骤</span>
                    {totalDuration(entry) != null && (
                      <span>耗时 {formatDuration(totalDuration(entry)!)}</span>
                    )}
                  </div>
                </CardHeader>

                {/* 展开详情 */}
                {isExpanded && (
                  <CardContent className="pt-0 border-t">
                    {isBatch ? (
                      <div className="space-y-4 mt-3">
                        {entry.children.map((child) => {
                          const childDetail = childrenDetails.get(child.jobId);
                          return (
                            <div key={child.jobId}>
                              {childDetail === undefined ? (
                                <p className="text-xs text-muted-foreground py-2">
                                  <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
                                  加载中...
                                </p>
                              ) : childDetail === null ? (
                                <p className="text-xs text-red-500 py-2">加载失败</p>
                              ) : (
                                (() => {
                                  const hasErrorStep = childDetail.steps.some(s => s.status === "error");
                                  const hasFatalInResult = childDetail.result && FATAL_PATTERN.test(childDetail.result);
                                  const childDisplayStatus = (childDetail.status === "done" && (hasErrorStep || hasFatalInResult)) ? "error" : childDetail.status;
                                  return renderSteps(
                                    `${PLATFORM_ICONS[child.platform] || ""} ${PLATFORM_LABELS[child.platform]} · ${
                                      childDisplayStatus === "done" ? "✅ 成功" : childDisplayStatus === "error" ? "❌ 失败" : "🔄 运行中"
                                    }`,
                                    childDetail
                                  );
                                })()
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : entry.children.length === 1 ? (
                      <div className="mt-3">
                        {(() => {
                          const childDetail = childrenDetails.get(entry.children[0].jobId);
                          if (childDetail === undefined) {
                            return (
                              <p className="text-xs text-muted-foreground py-3 text-center">
                                <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
                                加载中...
                              </p>
                            );
                          }
                          if (childDetail === null) {
                            return <p className="text-xs text-red-500 py-3 text-center">加载详情失败</p>;
                          }
                          return (
                            <div>
                              {FATAL_PATTERN.test(childDetail.result || '') && (
                                <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                                  ⚠️ 脚本输出包含错误信息，请查看下方执行输出
                                </div>
                              )}
                              {childDetail.steps.map((step, idx) => (
                                <div
                                  key={idx}
                                  className={`flex items-start gap-3 p-2.5 rounded-lg text-sm ${
                                    step.status === "error"
                                      ? "bg-red-50 border border-red-100"
                                      : step.status === "running"
                                      ? "bg-blue-50 border border-blue-100"
                                      : "bg-muted/30"
                                  }`}
                                >
                                  <StepIcon step={step} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-xs">{step.step}</span>
                                      {step.model && (
                                        <Badge variant="outline" className="text-[10px] h-4 px-1">
                                          {step.model}
                                        </Badge>
                                      )}
                                      {step.durationMs && (
                                        <span className="text-[10px] text-muted-foreground">
                                          {formatDuration(step.durationMs)}
                                        </span>
                                      )}
                                      {step.status === "error" && (
                                        <AlertCircle className="h-3 w-3 text-red-500" />
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap break-all">
                                      {step.detail}
                                    </p>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    {new Date(step.timestamp).toLocaleTimeString("zh-CN", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      second: "2-digit",
                                    })}
                                  </span>
                                </div>
                              ))}
                              {childDetail.result && (
                                <div className="mt-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border">
                                  <p className="text-xs font-medium mb-1">执行输出</p>
                                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                                    {childDetail.result}
                                  </pre>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ) : null}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {total > limit && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goPage(1)}
            disabled={page <= 1}
          >
            首页
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goPage(page - 1)}
            disabled={page <= 1}
          >
            上一页
          </Button>
          <span className="text-xs text-muted-foreground px-2">
            第 {page} / {Math.ceil(total / limit)} 页（共 {total} 条）
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goPage(page + 1)}
            disabled={page >= Math.ceil(total / limit)}
          >
            下一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goPage(Math.ceil(total / limit))}
            disabled={page >= Math.ceil(total / limit)}
          >
            末页
          </Button>
        </div>
      )}
    </div>
  );
}
