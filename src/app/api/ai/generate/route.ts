import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

/**
 * AI 内容生成 — 给定主题，返回标题/正文/标签
 * POST /api/ai/generate  { topic, platform }
 */

function getApiKey(): string {
  // 1. 直接环境变量
  if (process.env.QWAPI_API_KEY) return process.env.QWAPI_API_KEY;
  // 2. 从 ~/.hermes/.env 读取（social-publisher 安装脚本写入的）
  try {
    const hermPath = require("path").join(
      require("os").homedir(),
      ".hermes",
      ".env"
    );
    const hermContent = require("fs").readFileSync(hermPath, "utf-8");
    const match = hermContent.match(/QWAPI_API_KEY=(.+)/);
    if (match?.[1]) return match[1].trim();
  } catch { /* ignore */ }
  // 3. 从 zsh 环境获取
  try {
    const key = execSync(
      'zsh -l -c \'echo "$QWAPI_API_KEY"\'',
      { encoding: "utf8", timeout: 5000 }
    ).trim();
    if (key) return key;
  } catch { /* ignore */ }
  throw new Error("未找到 QWAPI_API_KEY。请运行: echo 'QWAPI_API_KEY=你的key' > ~/.hermes/.env");
}

const BASE_URL = "https://qweapi.com/v1";
const MODELS = ["deepseek-v3.2", "deepseek-chat", "gpt-4o-mini"];

async function callLLM(
  apiKey: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  let lastErr: Error | null = null;
  for (const model of MODELS) {
    try {
      const resp = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
        if (resp.status === 404 || errBody.includes("model")) {
          lastErr = new Error(`Model ${model} not found`);
          continue;
        }
        throw new Error(`LLM ${resp.status}: ${errBody.slice(0, 200)}`);
      }

      const data = await resp.json();
      return data.choices[0].message.content;
    } catch (e: unknown) {
      if (e instanceof Error && e.message.startsWith("LLM ")) throw e;
      lastErr = e instanceof Error ? e : new Error(String(e));
      continue;
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

export async function POST(request: NextRequest) {
  try {
    const { topic, platform } = await request.json();

    if (!topic || typeof topic !== "string") {
      return NextResponse.json(
        { error: "缺少 topic 参数" },
        { status: 400 }
      );
    }

    const p = platform === "douyin" ? "douyin" : "xiaohongshu";
    const prompt = PROMPTS[p];

    const apiKey = getApiKey();
    const raw = await callLLM(apiKey, prompt.system, prompt.template(topic));

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

    // 移除 tags 前的 # 号
    const cleanTags = (parsed.tags || "")
      .split(",")
      .map((t) => t.trim().replace(/^#+/, ""))
      .filter(Boolean);

    return NextResponse.json({
      success: true,
      title: parsed.title,
      content: parsed.content.replace(/\\n/g, "\n"),
      tags: cleanTags,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
