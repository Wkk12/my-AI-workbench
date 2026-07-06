"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  Send,
  Loader2,
  Sparkles,
  FileText,
  Calendar,
  Lightbulb,
  User,
  Zap,
  Trash2,
  Plus,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
  Brain,
} from "lucide-react";
import type { ChatMessage, ChatSessionMeta } from "@/lib/types";

const QUICK_ACTIONS = [
  {
    icon: FileText,
    label: "润色日报",
    prompt: "请帮我润色今天的工作日报，让表达更专业、更有条理。日报原文如下：\n\n",
    placeholder: "粘贴你的日报原文...",
  },
  {
    icon: Calendar,
    label: "周报总结",
    prompt: "请根据我本周的工作内容，生成一份结构清晰的周报总结。\n\n",
    placeholder: "列出本周完成的主要工作...",
  },
  {
    icon: Lightbulb,
    label: "头脑风暴",
    prompt: "请帮我针对以下想法进行头脑风暴，提供更多创意角度和可行方案：\n\n",
    placeholder: "描述你的想法...",
  },
  {
    icon: Sparkles,
    label: "文案优化",
    prompt: "请帮我优化以下文案，让它更吸引人、更有传播力：\n\n",
    placeholder: "粘贴需要优化的文案...",
  },
];

export default function InsightsPage() {
  // Session state
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<number | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Memory state
  const [memoryEnabled, setMemoryEnabled] = useState(false);

  // Check AI backend availability
  useEffect(() => {
    fetch("/api/claude")
      .then((r) => r.json())
      .then((data) => {
        setHasApiKey(data.available);
      })
      .catch(() => setHasApiKey(false));
  }, []);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadSessions = async () => {
    try {
      const res = await fetch("/api/ai/sessions");
      const data = await res.json();
      setSessions(data.sessions || []);

      // Auto-load most recent session
      if (data.sessions?.length > 0 && !activeSessionId) {
        loadSession(data.sessions[0].id);
      }
    } catch {
      // Silently fail - sessions will be empty
    }
  };

  const loadSession = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/sessions/${id}`);
      const data = await res.json();
      if (data.session) {
        setMessages(data.session.messages || []);
        setActiveSessionId(id);
      }
    } catch {
      // Silently fail
    }
  };

  const createNewSession = async () => {
    try {
      const res = await fetch("/api/ai/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.session) {
        setActiveSessionId(data.session.id);
        setMessages([]);
        setActiveAction(null);
        setSessions((prev) => [data.session, ...prev]);
      }
    } catch {
      // Silently fail
    }
  };

  const deleteCurrentSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确定要删除这个对话吗？")) return;

    try {
      await fetch(`/api/ai/sessions/${id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch {
      // Silently fail
    }
  };

  // Trigger memory extraction (fire and forget)
  const triggerMemoryExtraction = useCallback(
    async (msgs: ChatMessage[], sid: string) => {
      try {
        const res = await fetch("/api/ai/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "extract",
            sessionId: sid,
            messages: msgs,
          }),
        });
        const data = await res.json();
        if (data.success && data.profile) {
          setMemoryEnabled(true);
        }
      } catch {
        // Fire and forget
      }
    },
    []
  );

  const sendMessage = async (content: string) => {
    if (!content.trim() || loading) return;

    const now = new Date().toISOString();
    const userMsg: ChatMessage = { role: "user", content, timestamp: now };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setActiveAction(null);
    setLoading(true);

    let sessionId = activeSessionId;

    // Auto-create session if none exists
    if (!sessionId) {
      try {
        const res = await fetch("/api/ai/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (data.session) {
          sessionId = data.session.id;
          setActiveSessionId(sessionId);
          setSessions((prev) => [data.session, ...prev]);
        }
      } catch {
        // Continue without session
      }
    }

    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          sessionId: sessionId,
        }),
      });

      const data = await res.json();

      if (data.success) {
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: data.content,
          timestamp: new Date().toISOString(),
        };
        const finalMessages = [...newMessages, assistantMsg];
        setMessages(finalMessages);

        // Persist to server
        if (sessionId) {
          fetch(`/api/ai/sessions/${sessionId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: finalMessages }),
          })
            .then(() => loadSessions()) // Refresh session list for title updates
            .catch(() => {});

          // Memory extraction every 5 exchanges (10 messages = 5 pairs)
          if (finalMessages.length >= 10 && finalMessages.length % 10 === 0) {
            triggerMemoryExtraction(finalMessages, sessionId);
          }
        }
      } else {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: `❌ 出错了：${data.error || "未知错误"}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: `❌ 网络错误：${String(err)}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAction = (index: number) => {
    setActiveAction(index);
    const action = QUICK_ACTIONS[index];
    setInput(`${action.prompt}${action.placeholder}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Session title display helper
  const getSessionTitle = (meta: ChatSessionMeta) => {
    return meta.title || "新对话";
  };

  const getRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}天前`;
    return new Date(dateStr).toLocaleDateString("zh-CN");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4">
      <PageHeader
        title="🤖 AI 洞察"
        description="Claude 驱动的智能助手 — 润色、总结、头脑风暴"
      />

      {/* API Key 未配置 */}
      {hasApiKey === false && (
        <Card className="bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800">
          <CardContent className="py-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-600" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              尚未配置 Claude API Key。请前往{" "}
              <a href="/settings" className="underline font-medium">
                系统设置
              </a>{" "}
              填写 API Key 以启用 AI 功能。
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-1 gap-4 min-h-0">
        {/* Session Sidebar */}
        <div
          className={`flex flex-col transition-all duration-200 ${
            sidebarOpen ? "w-64" : "w-0 overflow-hidden"
          }`}
        >
          <Card className="flex-1 flex flex-col min-h-0">
            <CardContent className="flex-1 flex flex-col p-3 min-h-0">
              <Button
                variant="outline"
                className="w-full justify-start gap-2 mb-2 shrink-0"
                onClick={createNewSession}
                disabled={!hasApiKey}
              >
                <Plus className="h-4 w-4" />
                新对话
              </Button>

              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-1">
                  {sessions.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      暂无对话记录
                    </p>
                  ) : (
                    sessions.map((s) => (
                      <div
                        key={s.id}
                        className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${
                          activeSessionId === s.id
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => loadSession(s.id)}
                      >
                        <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1 truncate text-xs">
                          {getSessionTitle(s)}
                        </span>
                        <span className="text-[10px] opacity-50 shrink-0">
                          {getRelativeTime(s.updatedAt)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                          onClick={(e) => deleteCurrentSession(s.id, e)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>

              {/* Memory indicator */}
              {memoryEnabled && (
                <div className="pt-2 mt-2 border-t flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                  <Brain className="h-3 w-3 text-purple-500" />
                  <span>记忆已启用</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Sidebar toggle */}
          <div className="mb-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeft className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Quick Actions */}
          {messages.length === 0 && (
            <div className="grid gap-2 md:grid-cols-4 mb-4">
              {QUICK_ACTIONS.map((action, i) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={i}
                    variant={activeAction === i ? "default" : "outline"}
                    className="h-auto py-3 flex-col gap-1 justify-start"
                    onClick={() => handleQuickAction(i)}
                    disabled={!hasApiKey}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-sm">{action.label}</span>
                  </Button>
                );
              })}
            </div>
          )}

          {/* Chat Card */}
          <Card className="flex-1 flex flex-col min-h-0">
            <CardContent className="flex-1 flex flex-col p-4 min-h-0">
              {messages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Bot className="h-16 w-16 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">
                      Claude 已就绪，选一个快捷操作或直接输入
                    </p>
                    <p className="text-xs mt-1 opacity-50">
                      ⌘+Enter 发送
                    </p>
                  </div>
                </div>
              ) : (
                <ScrollArea className="flex-1 pr-4 min-h-0">
                  <div className="space-y-4 pb-2">
                    {messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex gap-3 ${
                          msg.role === "assistant"
                            ? "items-start"
                            : "items-start flex-row-reverse"
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm ${
                            msg.role === "assistant"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {msg.role === "assistant" ? (
                            <Bot className="h-4 w-4" />
                          ) : (
                            <User className="h-4 w-4" />
                          )}
                        </div>

                        <div
                          className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                            msg.role === "assistant"
                              ? "bg-muted text-foreground"
                              : "bg-primary text-primary-foreground"
                          }`}
                        >
                          <div className="whitespace-pre-wrap break-words">
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    ))}

                    {loading && (
                      <div className="flex gap-3 items-start">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                        <div className="bg-muted rounded-lg px-4 py-3">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
              )}

              {/* Input Area */}
              <div className="pt-3 border-t mt-3">
                <div className="flex gap-2">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      activeAction !== null
                        ? QUICK_ACTIONS[activeAction].placeholder
                        : "输入消息，⌘+Enter 发送..."
                    }
                    className="min-h-[52px] max-h-[120px] resize-none text-sm"
                    rows={2}
                    disabled={!hasApiKey || hasApiKey === null}
                  />
                  <div className="flex flex-col gap-1">
                    <Button
                      onClick={() => sendMessage(input)}
                      disabled={!input.trim() || loading || !hasApiKey}
                      size="icon"
                      className="h-[52px] w-[52px]"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                    {messages.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={async () => {
                          if (activeSessionId) {
                            try {
                              await fetch(
                                `/api/ai/sessions/${activeSessionId}`,
                                { method: "DELETE" }
                              );
                              setSessions((prev) =>
                                prev.filter((s) => s.id !== activeSessionId)
                              );
                            } catch {}
                          }
                          setMessages([]);
                          setActiveSessionId(null);
                          setActiveAction(null);
                        }}
                        title="清空对话"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
