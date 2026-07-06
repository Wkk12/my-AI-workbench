import { NextRequest, NextResponse } from "next/server";
import {
  getUserProfile,
  updateUserProfile,
  getMemoryRules,
  updateMemoryRules,
  getSession,
} from "@/lib/data/memory";
import { callAI } from "@/lib/llm";
import type { UserProfile } from "@/lib/types";

/** 获取用户画像 + 记忆规则 */
export async function GET() {
  const profile = getUserProfile();
  const rules = getMemoryRules();
  return NextResponse.json({ profile, rules });
}

/** 更新记忆规则 or 触发记忆提取 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // 更新记忆规则文档
    if (action === "updateRules") {
      updateMemoryRules(body.rules || "");
      return NextResponse.json({ success: true });
    }

    // 触发记忆提取
    if (action === "extract") {
      const { sessionId, messages } = body;

      if (!messages || !Array.isArray(messages)) {
        return NextResponse.json(
          { error: "缺少 messages 参数" },
          { status: 400 }
        );
      }

      // 获取当前画像用于去重
      const currentProfile = getUserProfile();

      // 构建提取 prompt
      const existingFacts =
        currentProfile.identity.name ||
        currentProfile.identity.role ||
        currentProfile.personality.traits.length > 0
          ? `\n\n## 已知用户信息（避免重复提取）
${JSON.stringify(currentProfile, null, 2)}`
          : "";

      const extractionPrompt = `你是一个用户档案分析器。根据以下对话内容，提取关于用户的关键信息。

请分析用户每次回复，但只提取以下 5 个维度的信息：

1. **身份信息**：姓名、昵称、职位、职业
2. **性格特征**：沟通风格、偏好、工作习惯
3. **专业领域**：技术栈、擅长领域、技术水平
4. **使用习惯**：常用功能、高频话题、常见问题类型
5. **上下文信息**：当前项目、目标、备注

请严格只返回以下 JSON 格式，不要其他文字：
{
  "identity": {
    "name": "用户姓名（仅当明确提及时填写）",
    "preferredName": "用户偏好的称呼（仅当明确提及时填写）",
    "role": "用户角色（如：全栈开发者）（仅当明确提及时填写）",
    "occupation": "职业（仅当明确提及时填写）"
  },
  "personality": {
    "traits": ["特征1", "特征2"],
    "communicationStyle": "沟通风格描述",
    "preferences": ["偏好1", "偏好2"]
  },
  "expertise": {
    "domains": ["擅长领域1"],
    "techStack": ["技术1", "技术2"],
    "level": "技术水平"
  },
  "usage": {
    "favoriteFeatures": [{"feature": "功能名", "incrementUse": true/false}],
    "commonTopics": [{"topic": "话题名", "incrementMention": true/false}],
    "frequentQuestions": ["常见问题1"]
  },
  "context": {
    "currentProjects": ["项目名"],
    "goals": ["目标"],
    "notes": ["备注"]
  }
}

规则：
- 只提取明确提到或强烈暗示的信息，空字段留空字符串或空数组
- 不猜测、不编造
- 如果对话中没有值得记录的新信息，所有字段留空
- 不要记录密码、API Key 等敏感信息
- 对于 usage 中的 features/topics，如果对话中使用了某个功能或讨论了某个话题，在对应数组中添加，并将 incrementUse/incrementMention 设为 true${existingFacts}

对话内容：
---
${messages
  .map(
    (m: { role: string; content: string }) =>
      `[${m.role === "user" ? "用户" : "AI"}]: ${m.content}`
  )
  .join("\n\n")}
---`;

      try {
        const result = await callAI(
          "你是一个精准的用户信息分析器。只返回 JSON，不要解释。",
          [{ role: "user", content: extractionPrompt }],
          { temperature: 0.3, maxTokens: 2000 }
        );

        // 解析提取结果
        const jsonStr = result.content
          .replace(/```json\s*/g, "")
          .replace(/```\s*/g, "")
          .trim();

        let extracted: Partial<UserProfile>;
        try {
          extracted = JSON.parse(jsonStr);
        } catch {
          console.warn("Failed to parse memory extraction JSON:", jsonStr.slice(0, 200));
          return NextResponse.json({ success: false, error: "JSON parse failed" });
        }

        // 增量合并
        const updated = updateUserProfile(extracted);

        return NextResponse.json({
          success: true,
          extracted,
          profile: updated,
        });
      } catch (e) {
        console.warn("Memory extraction AI call failed:", e);
        return NextResponse.json({
          success: false,
          error: e instanceof Error ? e.message : "Extraction failed",
        });
      }
    }

    return NextResponse.json(
      { error: "Unknown action. Use: extract, updateRules" },
      { status: 400 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Memory API error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
