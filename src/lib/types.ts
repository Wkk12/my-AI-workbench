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

export interface MonitorPlatform {
  platform: string;
  label: string;
  icon: string;
  lastCount: number;
  lastTotal: number;
  lastCheck: string | null;
  hasNew: boolean;
  supported: boolean;
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
  ipId?: string;        // 关联的 IP
  ipName?: string;      // IP 名称（冗余，方便显示）
  imageCount?: number;  // 生成图片张数（1-9）
  createdAt: string;
  updatedAt: string;
}

export interface ContentIndex {
  contents: ContentItem[];
}

// --- IP 管理 ---

export interface IPItem {
  id: string;
  name: string;           // IP 名称
  description?: string;   // IP 人设描述
  imagePath: string;      // 参考图路径 data/ips/images/{id}.png
  stylePrompt?: string;   // 风格提示词
  createdAt: string;
  updatedAt: string;
}

export interface IPIndex {
  ips: IPItem[];
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
  qwapiKey: string;
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
  setupCompleted?: boolean;
}

// --- 我的钱包（订阅管理）---

export type SubCategory =
  | "video"      // 视频会员
  | "music"      // 音乐/音频
  | "vpn"        // VPN/梯子
  | "cloud"      // 云存储/iCloud
  | "insurance"  // 保险
  | "shopping"   // 购物会员（京东/淘宝等）
  | "software"   // 软件订阅
  | "other";     // 其他

export type SubCycle = "month" | "quarter" | "year" | "once";

export interface Subscription {
  id: string;
  name: string;           // 订阅名称
  category: SubCategory;  // 分类
  cycle: SubCycle;        // 周期
  amount: number;         // 金额
  startDate: string;      // 开始日期 YYYY-MM-DD
  expireDate: string;     // 到期日
  autoRenew: boolean;     // 是否自动续费
  provider: string;       // 平台/服务商
  notes: string;          // 备注
  history: SubHistory[];  // 续费记录
  createdAt: string;
  updatedAt: string;
}

export interface SubHistory {
  action: string;         // "开通" | "续费" | "升级" | "取消"
  plan?: string;
  amount: number;
  date: string;
  expireDate: string;
}

export interface SubIndex {
  subscriptions: Subscription[];
}

// --- AI Chat ---

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string; // ISO
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionMeta {
  id: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionIndex {
  sessions: ChatSessionMeta[];
}

// --- AI Memory ---

export interface UserProfile {
  identity: UserIdentity;
  personality: UserPersonality;
  expertise: UserExpertise;
  usage: UserUsage;
  context: UserContext;
  lastUpdated: string;
  totalConversations: number;
}

export interface UserIdentity {
  name: string;
  preferredName: string;
  role: string;
  occupation: string;
}

export interface UserPersonality {
  traits: string[];
  communicationStyle: string;
  preferences: string[];
}

export interface UserExpertise {
  domains: string[];
  techStack: string[];
  level: string;
}

export interface UserUsage {
  favoriteFeatures: FeatureUsage[];
  commonTopics: TopicFrequency[];
  frequentQuestions: string[];
}

export interface FeatureUsage {
  feature: string;
  useCount: number;
  lastUsed: string;
}

export interface TopicFrequency {
  topic: string;
  mentionCount: number;
  lastMentioned: string;
}

export interface UserContext {
  currentProjects: string[];
  goals: string[];
  notes: string[];
}

// --- 定时任务调度器 ---

export type SchedulerActionType =
  | "publish_xhs"        // 发布小红书
  | "publish_douyin"     // 发布抖音
  | "generate_report"    // 生成日报
  | "ai_morning"         // AI 早安问候（天气+穿搭）
  | "custom";            // 自定义

export interface ScheduledTask {
  id: string;
  name: string;                      // 任务名称
  enabled: boolean;                  // 是否启用
  actionType: SchedulerActionType;   // 动作类型
  schedule: string;                  // cron 时间 HH:mm
  daysOfWeek: number[];              // 执行日 0=周日 1-6，空=每天
  config: Record<string, string>;    // 动作配置（平台/主题等）
  lastRun?: string;                  // 上次执行时间
  lastResult?: string;               // 上次执行结果
  createdAt: string;
  updatedAt: string;
}

export interface SchedulerIndex {
  tasks: ScheduledTask[];
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
