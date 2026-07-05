"use client";

import { useState, useRef, useEffect } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<number | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 检查 AI 后端是否可用
  useEffect(() => {
    fetch("/api/claude")
      .then((r) => r.json())
      .then((data) => {
        setHasApiKey(data.available);
      })
      .catch(() => setHasApiKey(false));
  }, []);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || loading) return;

    const userMsg: Message = { role: "user", content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setActiveAction(null);
    setLoading(true);

    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessages([
          ...newMessages,
          { role: "assistant", content: data.content },
        ]);
      } else {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: `❌ 出错了：${data.error || "未知错误"}`,
          },
        ]);
      }
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: `❌ 网络错误：${String(err)}`,
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
              <a
                href="/settings"
                className="underline font-medium"
              >
                系统设置
              </a>{" "}
              填写 API Key 以启用 AI 功能。
            </p>
          </CardContent>
        </Card>
      )}

      {/* 快捷操作 */}
      {messages.length === 0 && (
        <div className="grid gap-2 md:grid-cols-4">
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

      {/* 对话区 */}
      <Card className="flex-1 flex flex-col min-h-0">
        <CardContent className="flex-1 flex flex-col p-4 min-h-0">
          {/* 消息列表 */}
          {messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Bot className="h-16 w-16 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Claude 已就绪，选一个快捷操作或直接输入</p>
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
                    {/* 头像 */}
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

                    {/* 气泡 */}
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

                {/* 加载动画 */}
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

          {/* 输入区 */}
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
                    onClick={() => {
                      setMessages([]);
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
  );
}
