import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/data/settings";
import { getAllIPs } from "@/lib/data/ips";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * AI 批量图片生成
 * POST /api/ai/images  { prompt, ipId?, count?, size? }
 *
 * 使用 qweapi gpt-image-2，循环生成多张
 * 风格统一：同一 prompt + 固定 seed（如果 API 支持）
 */

const BASE_URL = "https://qweapi.com/v1";

function getApiKey(): string {
  if (process.env.QWAPI_API_KEY) return process.env.QWAPI_API_KEY;
  const key = getSettings().claude?.qwapiKey;
  if (key) return key;
  throw new Error("未配置 QWAPI_API_KEY");
}

async function generateOneImage(
  prompt: string,
  apiKey: string,
  size: string
): Promise<string> {
  const resp = await fetch(`${BASE_URL}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt,
      n: 1,
      size,
      response_format: "b64_json",
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`生图 API ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  if (!data.data?.[0]?.b64_json) {
    throw new Error("API 返回格式异常");
  }

  return data.data[0].b64_json;
}

function buildStylePrompt(
  basePrompt: string,
  ipId: string | undefined,
  index: number,
  total: number
): string {
  let prompt = basePrompt;

  // 融入 IP 风格描述
  if (ipId) {
    const ip = getAllIPs().find((i) => i.id === ipId);
    if (ip?.stylePrompt) {
      prompt = `${prompt}. Style reference: ${ip.stylePrompt}`;
    }
    if (ip?.description) {
      prompt = `Character/persona: ${ip.name} - ${ip.description}. ${prompt}`;
    }
  }

  // 多张时加微调后缀，确保不是完全相同的图
  if (total > 1) {
    prompt = `${prompt}, variation ${index + 1} of ${total}`;
  }

  return prompt.slice(0, 1000); // 安全截断
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, ipId, count, size } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "缺少 prompt 参数" },
        { status: 400 }
      );
    }

    const imageCount = Math.min(Math.max(count || 1, 1), 9);
    const imageSize = size || "1024x1536";

    const apiKey = getApiKey();
    const images: string[] = [];

    for (let i = 0; i < imageCount; i++) {
      const fullPrompt = buildStylePrompt(prompt, ipId, i, imageCount);
      const b64 = await generateOneImage(fullPrompt, apiKey, imageSize);

      // 保存到 data/images/
      const dir = path.join(process.cwd(), "data", "images");
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const fileName = `ai_gen_${Date.now()}_${i}.png`;
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, Buffer.from(b64, "base64"));

      images.push(`/data/images/${fileName}`);
    }

    return NextResponse.json({ success: true, images });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
