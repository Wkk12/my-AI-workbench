import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/data/settings";
import { getAllIPs } from "@/lib/data/ips";

/**
 * AI 图片提示词优化 — 根据内容和张数生成每张图的独立 prompt
 * POST /api/ai/generate-image-prompt  { content, ipId?, count? }
 * Returns: { prompts: string[] }
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
      models: ["deepseek-chat"],
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
    throw new Error("未配置任何 AI API Key");
  }
  return providers;
}

async function callLLM(systemPrompt: string, userMessage: string): Promise<string> {
  const providers = await getProviders();
  let lastErr: unknown = null;
  for (const provider of providers) {
    for (const model of provider.models) {
      try {
        const resp = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            temperature: 0.8,
            max_tokens: 1000,
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (!resp.ok) {
          const errBody = await resp.text();
          if (resp.status === 404 || resp.status === 401 || errBody.includes("model")) {
            lastErr = new Error(`[${provider.name}] ${model}: ${resp.status}`);
            continue;
          }
          throw new Error(`[${provider.name}] ${resp.status}: ${errBody.slice(0, 200)}`);
        }
        const data = await resp.json();
        return data.choices[0].message.content.trim();
      } catch (e: unknown) {
        if (e instanceof Error && e.message.startsWith("[")) throw e;
        lastErr = e;
        continue;
      }
    }
  }
  throw new Error(`所有模型 fallback 失败: ${lastErr instanceof Error ? lastErr.message : "unknown"}`);
}

export async function POST(request: NextRequest) {
  try {
    const { content, ipId, count, style } = await request.json();
    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "缺少 content 参数" }, { status: 400 });
    }

    const imageCount = Math.min(Math.max(count || 1, 1), 9);

    // 融入 IP 人设
    let styleContext = "";
    if (style) styleContext = `画面风格：${style}。`;
    let ipContext = "";
    if (ipId) {
      try {
        const ips = await getAllIPs();
        const ip = ips.find((i) => i.id === ipId);
        if (ip) {
          ipContext = `角色：${ip.name}。${ip.description || ""}。风格：${ip.stylePrompt || "高品质摄影"}。`;
        }
      } catch {}
    }

    if (imageCount === 1) {
      const userMsg = `根据以下内容生成优化后的中文图片 prompt，竖版3:4比例，适合手机封面：
内容：${content.slice(0, 500)}
${styleContext}${ipContext}
只输出 prompt，不要解释。200字符以内。`;

      const prompt = await callLLM(
        "你是专业的 AI 图片提示词优化专家。用中文输出优化后的图片提示词，包含画面构图、动作、光线、色彩、氛围。描述需专业细致，后续可翻译成英文。只输出提示词。",
        userMsg
      );
      return NextResponse.json({ prompts: [prompt] });
    }

    const userMsg = `根据以下内容，为 ${imageCount} 张系列图片生成各自的中文提示词。

内容：${content.slice(0, 500)}
${styleContext}${ipContext}

要求：
1. 【角色和风格必须一致】不能换人物、不能换风格，只能换姿态/场景/构图
2. 每张图描述不同但相关联的画面（如：第一张正面全身、第二张侧面特写、第三张互动场景…）
3. 竖版3:4比例，适合手机封面
4. 每段 80-150 字中文，描述需专业、可用于 AI 生图

输出格式（用 --- 分隔每张图的 prompt）：
Prompt 1: xxx
---
Prompt 2: xxx
---
Prompt 3: xxx`;

    const raw = await callLLM(
      "你是专业 AI 图片提示词专家。用户需要生成多张系列图片的提示词。角色和风格必须保持一致（不能换人物、换画风），只改变姿态/场景/构图。用中文输出，每段用 --- 分隔。只输出提示词，不要解释。",
      userMsg
    );

    const prompts = raw
      .split(/\n?---\n?/)
      .map((s: string) => s.replace(/^Prompt\s*\d+:\s*/i, "").trim())
      .filter((s: string) => s.length > 10);

    while (prompts.length < imageCount && prompts.length > 0) {
      const last = prompts[prompts.length - 1];
      prompts.push(last + `, alternate angle`);
    }

    return NextResponse.json({ prompts: prompts.slice(0, imageCount) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
