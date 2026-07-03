// ============================================================
// my-AI-workbench 全局类型定义
// ============================================================

// --- 日报 ---

export interface DailyReportMeta {
  id: string; // YYYY-MM-DD 格式
  date: string; // "2026-07-03"
  projectCount: number;
  commitCount: number;
  createdAt: string; // ISO datetime
  source: "local" | "gitlab";
  summary?: string; // AI 生成的摘要
}

export interface DailyReportIndex {
  reports: DailyReportMeta[];
}

// --- 内容创作 ---

export type Platform = "xiaohongshu" | "douyin" | "both";
export type ContentStatus = "draft" | "scheduled" | "published" | "failed";

export interface ContentStats {
  likes?: number;
  comments?: number;
  shares?: number;
}

export interface ContentItem {
  id: string; // uuid
  title: string;
  description: string;
  platform: Platform;
  status: ContentStatus;
  scheduledAt?: string; // ISO datetime
  publishedAt?: string;
  tags: string[];
  mediaPaths: string[];
  aiGenerated: boolean;
  stats?: ContentStats;
  createdAt: string;
  updatedAt: string;
}

export interface ContentIndex {
  contents: ContentItem[];
}

// --- 一人公司项目 ---

export type ProjectStatus =
  | "idea"
  | "developing"
  | "launched"
  | "maintaining"
  | "archived";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  dueDate?: string;
}

export interface Milestone {
  id: string;
  title: string;
  date: string;
  completed: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  icon?: string; // emoji
  status: ProjectStatus;
  techStack: string[];
  tasks: Task[];
  milestones: Milestone[];
  revenue?: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectIndex {
  projects: Project[];
}

// --- 创意灵感 ---

export type IdeaCategory = "project" | "content" | "tool" | "learning" | "other";
export type IdeaStatus = "new" | "exploring" | "in_progress" | "done" | "abandoned";

export interface Idea {
  id: string;
  content: string; // Markdown
  category: IdeaCategory;
  source?: string;
  tags: string[];
  status: IdeaStatus;
  linkedProjectId?: string;
  aiExpanded?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaIndex {
  ideas: Idea[];
}

// --- 系统设置 ---

export type ThemeMode = "light" | "dark" | "cream";

export interface GitLabSettings {
  token: string;
  url: string;
  localRoot: string;
  defaultBranch: string;
  defaultAuthor: string;
}

export interface ClaudeSettings {
  apiKey: string;
  model: string;
}

export interface PlatformSettings {
  xiaohongshu?: Record<string, string>;
  douyin?: Record<string, string>;
}

export interface Settings {
  theme: ThemeMode;
  language: "zh-CN" | "en";
  gitlab: GitLabSettings;
  claude: ClaudeSettings;
  platforms: PlatformSettings;
}

// --- AI ---

export interface AIInsightRequest {
  type: "polish_report" | "weekly_summary" | "brainstorm" | "copywriting" | "chat";
  content: string;
  context?: Record<string, unknown>;
}

export interface AIInsightResponse {
  success: boolean;
  content?: string;
  error?: string;
}
