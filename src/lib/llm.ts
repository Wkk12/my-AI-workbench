// ============================================================
// Shared LLM calling utilities
// Used by /api/claude and /api/ai/memory routes
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { getSettings } from "./data/settings";
import fs from "fs";
import path from "path";
import os from "os";

export function getQwapiKey(): string {
  if (process.env.QWAPI_API_KEY) return process.env.QWAPI_API_KEY;
  try {
    const p = path.join(os.homedir(), ".hermes", ".env");
    if (fs.existsSync(p)) {
      const m = fs.readFileSync(p, "utf-8").match(/QWAPI_API_KEY=(.+)/);
      if (m?.[1]) return m[1].trim();
    }
  } catch {}
  return "";
}

export async function callClaudeNative(
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

export async function callOpenAICompat(
  apiKey: string,
  model: string,
  system: string,
  messages: { role: string; content: string }[],
  options?: { temperature?: number; maxTokens?: number; timeout?: number }
) {
  const openaiMessages = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

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
          temperature: options?.temperature ?? 0.8,
          max_tokens: options?.maxTokens ?? 4096,
        }),
        signal: AbortSignal.timeout(options?.timeout ?? 60000),
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

/** 调用 AI（自动选择 Claude > QWAPI），用于通用场景 */
export async function callAI(
  system: string,
  messages: { role: string; content: string }[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<{ content: string; model: string; backend: string }> {
  const settings = await getSettings();
  const claudeKey = settings.claude?.apiKey || "";

  if (claudeKey) {
    try {
      return await callClaudeNative(
        claudeKey,
        settings.claude?.model || "claude-sonnet-4-20250514",
        system,
        messages
      );
    } catch (e) {
      console.warn("Claude native failed, falling back:", e);
    }
  }

  const qwKey = getQwapiKey();
  if (qwKey) {
    return callOpenAICompat(qwKey, "deepseek-v3.2", system, messages, options);
  }

  throw new Error("未配置 AI API Key");
}
