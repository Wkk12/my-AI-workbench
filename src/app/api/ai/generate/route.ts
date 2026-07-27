import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/data/settings";
import { getAllIPs } from "@/lib/data/ips";

/**
 * AI 内容生成 — 给定主题，返回标题/正文/标签 + 图片 prompt
 * POST /api/ai/generate  { topic, platform, ipId? }
 */

/** API provider 定义（按优先级排列） */
interface Provider {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
}

async function getProviders(): Promise<Provider[]> {
  const providers: Provider[] = [];
  const settings = await getSettings();

  // Provider 1: DeepSeek 官方 API（国内直连，优先）
  const dsKey = process.env.DEEPSEEK_API_KEY || "";
  if (dsKey) {
    providers.push({
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: dsKey,
      models: ["deepseek-chat", "deepseek-v3-0324"],
    });
  }

  // Provider 2: qweapi（聚合代理）
  const qwKey = process.env.QWAPI_API_KEY || settings.claude?.qwapiKey || "";
  if (qwKey) {
    providers.push({
      name: "QWAPI",
      baseUrl: "https://qweapi.com/v1",
      apiKey: qwKey,
      models: ["deepseek-v3.2", "deepseek-chat", "gpt-4o-mini"],
    });
  }

  if (providers.length === 0) {
    throw new Error("未配置任何 AI API Key。请在系统设置中配置 QWAPI Key。");
  }
  return providers;
}

async function callLLM(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const providers = await getProviders();
  let lastErr: Error | null = null;

  for (const provider of providers) {
    for (const model of provider.models) {
      try {
        const resp = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            temperature: 0.8,
            max_tokens: 2000,
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          if (resp.status === 404 || errBody.includes("model") || resp.status === 401) {
            lastErr = new Error(`[${provider.name}] ${model}: ${resp.status}`);
            continue;
          }
          throw new Error(`[${provider.name}] ${resp.status}: ${errBody.slice(0, 200)}`);
        }

        const data = await resp.json();
        return data.choices[0].message.content;
      } catch (e: unknown) {
        if (e instanceof Error && e.message.startsWith("[")) throw e;
        lastErr = e instanceof Error ? e : new Error(String(e));
        continue;
      }
    }
  }
  throw new Error(
    `所有模型 fallback 失败: ${lastErr?.message || "unknown"}`
  );
}

const PROMPTS: Record<string, { system: string; template: (topic: string) => string }> = {
  xiaohongshu: {
    system: "你是一个专业的小红书内容创作助手。只输出JSON格式，不要解释。",
    template: (topic: string) => `你是一个小红书爆款笔记写手。根据用户主题，生成小红书图文笔记的完整内容。

要求：
1. 标题：精炼吸睛，20字以内，带emoji
2. 正文：分段清晰(每段1-2句)，大量emoji，口语化，结尾带互动问题引导评论。正文总字数控制在200-300字。
3. 标签：3-5个，#号格式的话题标签

严格按以下JSON格式输出（只输出JSON，不要其他文字）：
{"title":"标题","content":"正文(用\\n分隔段落)","tags":"tag1,tag2,tag3"}

主题：${topic}`,
  },
  douyin: {
    system: "你是抖音内容创作助手。只输出JSON。",
    template: (topic: string) => `你是抖音爆款文案写手。根据主题生成抖音图文笔记内容。

要求：
1. 标题：55字以内，简洁有吸引力
2. 正文：短小精悍，每段1-2句，口语化，加适当emoji
3. 标签：3-5个话题标签

严格只输出JSON：
{"title":"标题","content":"正文(用\\n分隔)","tags":"tag1,tag2,tag3"}

主题：${topic}`,
  },
};

async function generateImagePrompt(
  content: string,
  platform: string,
  ipId?: string
): Promise<string> {
  const styleHint =
    platform === "xiaohongshu"
      ? "干净、小清新、适合小红书审美，温暖柔和色调"
      : "醒目、冲击力强、适合抖音封面风格";

  let ipHint = "";
  if (ipId) {
    const ips = await getAllIPs();
    const ip = ips.find((i) => i.id === ipId);
    if (ip?.stylePrompt) {
      ipHint = `。风格参考：${ip.stylePrompt}`;
    }
    if (ip?.description) {
      ipHint += `。角色：${ip.name}，${ip.description}`;
    }
  }

  const userMessage = `根据以下内容生成一个AI封面图英文prompt。要求：
- 风格：${styleHint}${ipHint}
- 画面：竖版3:4比例，适合手机封面
- 英文输出，不超过200字符

内容：${content.slice(0, 300)}`;

  try {
    return await callLLM(
      "你是AI图片提示词专家。只输出英文prompt，不要任何解释。",
      userMessage
    );
  } catch { return ""; }
}

export async function POST(request: NextRequest) {
  try {
    const { topic, platform, ipId } = await request.json();

    if (!topic || typeof topic !== "string") {
      return NextResponse.json(
        { error: "缺少 topic 参数" },
        { status: 400 }
      );
    }

    const p = platform === "douyin" ? "douyin" : "xiaohongshu";
    const prompt = PROMPTS[p];

    // 融入 IP 人设信息
    let ipContext = "";
    if (ipId) {
      const ips = await getAllIPs();
      const ip = ips.find((i) => i.id === ipId);
      if (ip) {
        ipContext = `\n\n【重要：你扮演的人设是"${ip.name}"】${ip.description || ""}。所有内容要符合这个角色的人设风格。`;
      }
    }

    const raw = await callLLM(
      prompt.system,
      prompt.template(topic) + ipContext
    );

    // 解析 JSON
    let parsed: { title: string; content: string; tags: string };
    try {
      const jsonStr = raw
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      parsed = JSON.parse(jsonStr);

      // 小红书标题截断
      if (
        p === "xiaohongshu" &&
        parsed.title &&
        parsed.title.length > 20
      ) {
        parsed.title = parsed.title.slice(0, 20);
      }
    } catch {
      // fallback 手动提取
      const titleM = raw.match(/"title"\s*:\s*"([^"]+)"/);
      const contentM = raw.match(/"content"\s*:\s*"([^"]+)"/);
      const tagsM = raw.match(/"tags"\s*:\s*"([^"]+)"/);
      if (!titleM || !contentM) {
        return NextResponse.json(
          { error: "AI 生成格式异常，请重试", raw: raw.slice(0, 200) },
          { status: 500 }
        );
      }
      parsed = {
        title: titleM[1],
        content: contentM[1].replace(/\\n/g, "\n"),
        tags: tagsM ? tagsM[1] : "",
      };
    }

    // 移除 tags 前的 # 号并确保逗号分隔
    let rawTags = parsed.tags || "";
    // 如果原始 tags 不含逗号但包含 # 或空格，拆分为多个 tag
    if (!rawTags.includes(",") && (rawTags.includes("#") || rawTags.includes(" "))) {
      rawTags = rawTags
        .replace(/[#＃]+/g, "#")          // 统一 # 号（全角→半角）
        .split(/[\s#]+/)                  // 按空格或 # 拆分
        .filter(Boolean)
        .map((t) => t.trim())
        .join(",");
    }
    const cleanTags = rawTags
      .split(",")
      .map((t) => t.trim().replace(/^#+/, ""))
      .filter(Boolean);

    return NextResponse.json({
      success: true,
      title: parsed.title,
      content: parsed.content.replace(/\\n/g, "\n"),
      tags: cleanTags,
      imagePrompt: await generateImagePrompt(parsed.content, p, ipId),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
