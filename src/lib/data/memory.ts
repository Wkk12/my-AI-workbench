// ============================================================
// AI Memory & Sessions CRUD（使用 Prisma + SQLite）
// ============================================================

import prisma from "@/lib/prisma";
import type { ChatSession, ChatSessionMeta, UserProfile } from "@/lib/types";
import { v4 as uuid } from "uuid";
import { readJSONSafe, writeJSON, readTextFile, writeTextFile } from "./base";

const USER_PROFILE_PATH = "ai/user-profile.json";
const MEMORY_RULES_PATH = "ai/memory-rules.md";

// --- Defaults ---

export const DEFAULT_USER_PROFILE: UserProfile = {
  identity: { name: "", preferredName: "", role: "", occupation: "" },
  personality: { traits: [], communicationStyle: "", preferences: [] },
  expertise: { domains: [], techStack: [], level: "" },
  usage: { favoriteFeatures: [], commonTopics: [], frequentQuestions: [] },
  context: { currentProjects: [], goals: [], notes: [] },
  lastUpdated: "",
  totalConversations: 0,
};

// --- Sessions ---

export async function getSessionList(): Promise<ChatSessionMeta[]> {
  const rows = await prisma.chatSession.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, messages: true, createdAt: true, updatedAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    messageCount: JSON.parse(r.messages || "[]").length,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function getSession(id: string): Promise<ChatSession | null> {
  const row = await prisma.chatSession.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    messages: JSON.parse(row.messages || "[]"),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createSession(title?: string): Promise<ChatSession> {
  const id = uuid();
  const now = new Date().toISOString();
  const session: ChatSession = {
    id,
    title: title || "新对话",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  await prisma.chatSession.create({
    data: {
      id,
      title: session.title,
      messages: "[]",
      createdAt: now,
      updatedAt: now,
    },
  });

  return session;
}

export async function updateSession(
  id: string,
  messages: ChatSession["messages"],
  title?: string
): Promise<ChatSession | null> {
  const row = await prisma.chatSession.findUnique({ where: { id } });
  if (!row) return null;

  const now = new Date().toISOString();
  let sessionTitle = title || row.title;
  if (sessionTitle === "新对话" || !sessionTitle) {
    const firstUserMsg = messages.find((m) => m.role === "user");
    if (firstUserMsg) {
      sessionTitle =
        firstUserMsg.content.slice(0, 30) +
        (firstUserMsg.content.length > 30 ? "..." : "");
    }
  }

  await prisma.chatSession.update({
    where: { id },
    data: {
      title: sessionTitle,
      messages: JSON.stringify(messages),
      updatedAt: now,
    },
  });

  return {
    id,
    title: sessionTitle,
    messages,
    createdAt: row.createdAt,
    updatedAt: now,
  };
}

export async function deleteSession(id: string): Promise<boolean> {
  const existing = await prisma.chatSession.findUnique({ where: { id } });
  if (!existing) return false;
  await prisma.chatSession.delete({ where: { id } });
  return true;
}

// --- User Profile ---

export function getUserProfile(): UserProfile {
  return readJSONSafe<UserProfile>(USER_PROFILE_PATH, DEFAULT_USER_PROFILE);
}

export function updateUserProfile(partial: Partial<UserProfile>): UserProfile {
  const current = getUserProfile();
  const now = new Date().toISOString();

  const merged: UserProfile = {
    identity: { ...current.identity, ...partial.identity },
    personality: {
      ...current.personality,
      ...partial.personality,
      traits: [
        ...new Set([
          ...current.personality.traits,
          ...(partial.personality?.traits || []),
        ]),
      ],
      preferences: [
        ...new Set([
          ...current.personality.preferences,
          ...(partial.personality?.preferences || []),
        ]),
      ],
    },
    expertise: {
      ...current.expertise,
      ...partial.expertise,
      domains: [
        ...new Set([
          ...current.expertise.domains,
          ...(partial.expertise?.domains || []),
        ]),
      ],
      techStack: [
        ...new Set([
          ...current.expertise.techStack,
          ...(partial.expertise?.techStack || []),
        ]),
      ],
    },
    usage: {
      ...current.usage,
      ...partial.usage,
      favoriteFeatures:
        partial.usage?.favoriteFeatures || current.usage.favoriteFeatures,
      commonTopics: partial.usage?.commonTopics || current.usage.commonTopics,
      frequentQuestions: [
        ...new Set([
          ...current.usage.frequentQuestions,
          ...(partial.usage?.frequentQuestions || []),
        ]),
      ],
    },
    context: {
      ...current.context,
      ...partial.context,
      currentProjects:
        partial.context?.currentProjects || current.context.currentProjects,
      goals: partial.context?.goals || current.context.goals,
      notes: [
        ...new Set([
          ...current.context.notes,
          ...(partial.context?.notes || []),
        ]),
      ],
    },
    lastUpdated: now,
    totalConversations:
      current.totalConversations + (partial.totalConversations || 0),
  };

  writeJSON(USER_PROFILE_PATH, merged);
  return merged;
}

// --- Memory Rules ---

export function getMemoryRules(): string {
  try {
    return readTextFile(MEMORY_RULES_PATH);
  } catch {
    return "";
  }
}

export function updateMemoryRules(content: string): void {
  writeTextFile(MEMORY_RULES_PATH, content);
}

// --- Memory Context Builder ---

export function buildProfileContext(profile: UserProfile): string {
  const parts: string[] = ["## 用户档案（长期记忆）"];
  const { identity, personality, expertise, usage, context } = profile;

  if (identity.name || identity.preferredName || identity.role || identity.occupation) {
    parts.push("\n### 基本信息");
    if (identity.preferredName) parts.push(`- 称呼：${identity.preferredName}`);
    if (identity.name) parts.push(`- 姓名：${identity.name}`);
    if (identity.role) parts.push(`- 角色：${identity.role}`);
    if (identity.occupation) parts.push(`- 职业：${identity.occupation}`);
  }

  if (personality.traits.length > 0 || personality.communicationStyle || personality.preferences.length > 0) {
    parts.push("\n### 性格与偏好");
    if (personality.traits.length > 0) parts.push(`- 特征：${personality.traits.join("、")}`);
    if (personality.communicationStyle) parts.push(`- 沟通风格：${personality.communicationStyle}`);
    if (personality.preferences.length > 0) parts.push(`- 偏好：${personality.preferences.join("、")}`);
  }

  if (expertise.domains.length > 0 || expertise.techStack.length > 0 || expertise.level) {
    parts.push("\n### 专业领域");
    if (expertise.domains.length > 0) parts.push(`- 领域：${expertise.domains.join("、")}`);
    if (expertise.techStack.length > 0) parts.push(`- 技术栈：${expertise.techStack.join("、")}`);
    if (expertise.level) parts.push(`- 水平：${expertise.level}`);
  }

  if (usage.favoriteFeatures.length > 0 || usage.commonTopics.length > 0 || usage.frequentQuestions.length > 0) {
    parts.push("\n### 使用习惯");
    if (usage.favoriteFeatures.length > 0) {
      const features = usage.favoriteFeatures
        .sort((a, b) => b.useCount - a.useCount)
        .map((f) => `${f.feature}(×${f.useCount})`)
        .join("、");
      parts.push(`- 常用功能：${features}`);
    }
    if (usage.commonTopics.length > 0) {
      const topics = usage.commonTopics
        .sort((a, b) => b.mentionCount - a.mentionCount)
        .map((t) => t.topic)
        .join("、");
      parts.push(`- 关注话题：${topics}`);
    }
    if (usage.frequentQuestions.length > 0) {
      parts.push(`- 常见问题：${usage.frequentQuestions.join("；")}`);
    }
  }

  if (context.currentProjects.length > 0 || context.goals.length > 0 || context.notes.length > 0) {
    parts.push("\n### 上下文");
    if (context.currentProjects.length > 0) parts.push(`- 当前项目：${context.currentProjects.join("、")}`);
    if (context.goals.length > 0) parts.push(`- 目标：${context.goals.join("、")}`);
    if (context.notes.length > 0) parts.push(`- 备注：${context.notes.join("；")}`);
  }

  if (parts.length === 1) return "";
  parts.push("\n请在对话中自然地运用这些信息。\n");
  return parts.join("\n");
}
