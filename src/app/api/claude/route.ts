import { NextRequest, NextResponse } from "next/server";
import { callClaudeNative, callOpenAICompat, getQwapiKey } from "@/lib/llm";
import { getSettings } from "@/lib/data/settings";
import { getUserProfile, buildProfileContext, getMemoryRules } from "@/lib/data/memory";

/**
 * AI 对话代理 — 自动选择后端：Anthropic > QWAPI (DeepSeek)
 * POST /api/claude  { messages, system?, sessionId? }
 */

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
    const { messages, system, sessionId } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "缺少 messages 参数" },
        { status: 400 }
      );
    }

    const defaultSystem =
      "你是喵站工作台的 AI 助手，帮助用户提升工作效率。用中文回复，风格活泼但专业。";
    let sysPrompt = system || defaultSystem;

    // 注入用户画像 + 记忆规则
    if (sessionId) {
      try {
        const profile = getUserProfile();
        const profileCtx = buildProfileContext(profile);
        if (profileCtx) {
          sysPrompt += "\n\n" + profileCtx;
        }
        const rules = getMemoryRules();
        if (rules) {
          sysPrompt +=
            "\n\n## 记忆规则\n" +
            rules +
            "\n\n请在对话中自然地记住用户提及的个人信息、偏好和习惯，但不要生硬地复述档案内容。";
        }
      } catch (e) {
        console.warn("Failed to inject memory context:", e);
      }
    }

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
