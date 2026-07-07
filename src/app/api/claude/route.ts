import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSettings } from "@/lib/data/settings";

/**
 * AI 对话代理 — 自动选择后端：Anthropic > QWAPI (DeepSeek)
 * POST /api/claude  { messages, system? }
 */

function getQwapiKey(): string {
  if (process.env.QWAPI_API_KEY) return process.env.QWAPI_API_KEY;
  return getSettings().claude?.qwapiKey || "";
}

async function callClaudeNative(
  apiKey: string,
  model: string,
  system: string,
  messages: { role: string; content: string }[]
) {
  const anthropic = new Anthropic({ apiKey });
  const clean = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const resp = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system,
    messages: clean,
  });

  const text = resp.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n");

  return { content: text, model: resp.model, backend: "anthropic" };
}

async function callOpenAICompat(
  apiKey: string,
  model: string,
  system: string,
  messages: { role: string; content: string }[]
) {
  const openaiMessages = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // Model fallback list for QWAPI
  const models = [model, "deepseek-v3.2", "deepseek-chat", "gpt-4o-mini"];
  let lastErr: Error | null = null;

  for (const m of models) {
    try {
      const resp = await fetch("https://qweapi.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: m,
          messages: openaiMessages,
          temperature: 0.8,
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!resp.ok) {
        const err = await resp.text();
        if (resp.status === 404 || err.includes("model")) {
          lastErr = new Error(`Model ${m} not found`);
          continue;
        }
        throw new Error(`API ${resp.status}: ${err.slice(0, 200)}`);
      }

      const data = await resp.json();
      return {
        content: data.choices[0].message.content,
        model: m,
        backend: "qweapi",
      };
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("API ")) throw e;
      lastErr = e instanceof Error ? e : new Error(String(e));
      continue;
    }
  }

  throw lastErr || new Error("All QWAPI models failed");
}

/** 健康检查：是否有可用 AI 后端 */
export async function GET() {
  const settings = getSettings();
  const hasClaude = !!settings.claude?.apiKey;
  const hasQwapi = !!getQwapiKey();
  return NextResponse.json({
    available: hasClaude || hasQwapi,
    backends: {
      claude: hasClaude,
      qwapi: hasQwapi,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, system } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "缺少 messages 参数" },
        { status: 400 }
      );
    }

    const defaultSystem =
      "你是喵站工作台的 AI 助手，帮助用户提升工作效率。用中文回复，风格活泼但专业。";
    const sysPrompt = system || defaultSystem;

    // 1. 尝试 Anthropic/Claude（如果配置了 Key）
    const settings = getSettings();
    const claudeKey = settings.claude?.apiKey || "";
    if (claudeKey) {
      try {
        const result = await callClaudeNative(
          claudeKey,
          settings.claude?.model || "claude-sonnet-4-20250514",
          sysPrompt,
          messages
        );
        return NextResponse.json({ success: true, ...result });
      } catch (e) {
        console.warn("Claude native failed, falling back:", e);
      }
    }

    // 2. Fallback: QWAPI (DeepSeek via qweapi.com)
    const qwKey = getQwapiKey();
    if (qwKey) {
      const result = await callOpenAICompat(
        qwKey,
        "deepseek-v3.2",
        sysPrompt,
        messages
      );
      return NextResponse.json({ success: true, ...result });
    }

    // 3. No backend available
    return NextResponse.json(
      {
        error:
          "未配置 AI API Key。请在系统设置中填写 Claude API Key，或设置 QWAPI_API_KEY 环境变量。",
      },
      { status: 401 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("AI Chat error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
