// ============================================================
// AI Memory & Sessions CRUD
// ============================================================

import { readJSONSafe, writeJSON, readTextFile, writeTextFile, deleteFile } from "./base";
import type {
  ChatSession,
  ChatSessionMeta,
  ChatSessionIndex,
  UserProfile,
} from "@/lib/types";
import { v4 as uuid } from "uuid";

const SESSIONS_INDEX_PATH = "ai/sessions/index.json";
const SESSIONS_DIR = "ai/sessions";
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

function getSessionIndex(): ChatSessionIndex {
  return readJSONSafe<ChatSessionIndex>(SESSIONS_INDEX_PATH, { sessions: [] });
}

function saveSessionIndex(index: ChatSessionIndex): void {
  writeJSON(SESSIONS_INDEX_PATH, index);
}

/** 获取所有会话列表（按更新时间倒序） */
export function getSessionList(): ChatSessionMeta[] {
  const index = getSessionIndex();
  return index.sessions.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/** 获取单个会话完整数据 */
export function getSession(id: string): ChatSession | null {
  try {
    return readJSONSafe<ChatSession>(`${SESSIONS_DIR}/${id}.json`, null as unknown as ChatSession);
  } catch {
    return null;
  }
}

/** 创建新会话 */
export function createSession(title?: string): ChatSession {
  const id = uuid();
  const now = new Date().toISOString();
  const session: ChatSession = {
    id,
    title: title || "新对话",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  const index = getSessionIndex();
  index.sessions.push({
    id,
    title: session.title,
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  saveSessionIndex(index);
  writeJSON(`${SESSIONS_DIR}/${id}.json`, session);

  return session;
}

/** 更新会话消息（自动生成标题） */
export function updateSession(
  id: string,
  messages: ChatSession["messages"],
  title?: string
): ChatSession | null {
  const session = getSession(id);
  if (!session) return null;

  const now = new Date().toISOString();
  // Auto-generate title from first user message if not set manually
  let sessionTitle = title || session.title;
  if (sessionTitle === "新对话" || !sessionTitle) {
    const firstUserMsg = messages.find((m) => m.role === "user");
    if (firstUserMsg) {
      sessionTitle = firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? "..." : "");
    }
  }

  session.messages = messages;
  session.title = sessionTitle;
  session.updatedAt = now;

  // Update index
  const index = getSessionIndex();
  const meta = index.sessions.find((s) => s.id === id);
  if (meta) {
    meta.title = sessionTitle;
    meta.messageCount = messages.length;
    meta.updatedAt = now;
  }
  saveSessionIndex(index);
  writeJSON(`${SESSIONS_DIR}/${id}.json`, session);

  return session;
}

/** 删除会话 */
export function deleteSession(id: string): boolean {
  const index = getSessionIndex();
  const before = index.sessions.length;
  index.sessions = index.sessions.filter((s) => s.id !== id);
  if (index.sessions.length === before) return false;

  saveSessionIndex(index);

  try {
    deleteFile(`${SESSIONS_DIR}/${id}.json`);
  } catch {
    // File may not exist yet
  }
  return true;
}

// --- User Profile ---

/** 获取用户画像 */
export function getUserProfile(): UserProfile {
  return readJSONSafe<UserProfile>(USER_PROFILE_PATH, DEFAULT_USER_PROFILE);
}

/** 深度合并用户画像（增量更新） */
export function updateUserProfile(partial: Partial<UserProfile>): UserProfile {
  const current = getUserProfile();
  const now = new Date().toISOString();

  const merged: UserProfile = {
    identity: { ...current.identity, ...partial.identity },
    personality: {
      ...current.personality,
      ...partial.personality,
      traits: [...new Set([...current.personality.traits, ...(partial.personality?.traits || [])])],
      preferences: [...new Set([...current.personality.preferences, ...(partial.personality?.preferences || [])])],
    },
    expertise: {
      ...current.expertise,
      ...partial.expertise,
      domains: [...new Set([...current.expertise.domains, ...(partial.expertise?.domains || [])])],
      techStack: [...new Set([...current.expertise.techStack, ...(partial.expertise?.techStack || [])])],
    },
    usage: {
      ...current.usage,
      ...partial.usage,
      favoriteFeatures: partial.usage?.favoriteFeatures || current.usage.favoriteFeatures,
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
      currentProjects: partial.context?.currentProjects || current.context.currentProjects,
      goals: partial.context?.goals || current.context.goals,
      notes: [...new Set([...current.context.notes, ...(partial.context?.notes || [])])],
    },
    lastUpdated: now,
    totalConversations: current.totalConversations + (partial.totalConversations || 0),
  };

  writeJSON(USER_PROFILE_PATH, merged);
  return merged;
}

// --- Memory Rules ---

/** 获取记忆规则内容（Markdown） */
export function getMemoryRules(): string {
  try {
    return readTextFile(MEMORY_RULES_PATH);
  } catch {
    return "";
  }
}

/** 更新记忆规则 */
export function updateMemoryRules(content: string): void {
  writeTextFile(MEMORY_RULES_PATH, content);
}

// --- Memory Context Builder ---

/** 构建注入到 System Prompt 的用户画像摘要 */
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

  // If nothing meaningful was collected, return empty
  if (parts.length === 1) return "";

  parts.push("\n请在对话中自然地运用这些信息。\n");
  return parts.join("\n");
}
