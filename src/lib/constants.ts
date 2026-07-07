// ============================================================
// my-AI-workbench 常量定义
// ============================================================

import {
  LayoutDashboard,
  Briefcase,
  FileText,
  GitGraph,
  Users,
  Code2,
  Lightbulb,
  PencilRuler,
  Kanban,
  FlaskConical,
  Clock,
  Bot,
  Settings,
  Wrench,
  Wallet,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

// --- 导航结构 ---

export interface NavSubItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string; // 可选徽章（如 "NEW"）
}

export interface NavGroup {
  title: string;
  icon: LucideIcon;
  items: NavSubItem[];
}

export const NAV_ITEMS: NavGroup[] = [
  {
    title: "工作",
    icon: Briefcase,
    items: [
      { title: "工作概览", href: "/work", icon: LayoutDashboard },
      { title: "日报生成", href: "/work/daily-report", icon: FileText },
      { title: "Git 看板", href: "/work/git-dashboard", icon: GitGraph, badge: "即将推出" },
      { title: "会议纪要", href: "/work/meeting-notes", icon: Users, badge: "即将推出" },
      { title: "代码 Review", href: "/work/code-review", icon: Code2, badge: "即将推出" },
    ],
  },
  {
    title: "自研",
    icon: Lightbulb,
    items: [
      { title: "自研概览", href: "/self-dev", icon: LayoutDashboard },
      { title: "内容创作", href: "/self-dev/content-creator", icon: PencilRuler },
      { title: "IP 管理", href: "/self-dev/ips", icon: Sparkles },
      { title: "项目看板", href: "/self-dev/projects", icon: Kanban },
      { title: "创意实验室", href: "/self-dev/idea-lab", icon: FlaskConical },
      { title: "定时任务", href: "/self-dev/scheduler", icon: Clock },
    ],
  },
  {
    title: "AI 洞察",
    icon: Bot,
    items: [
      { title: "AI 分析", href: "/insights", icon: Bot },
      // { title: "AI 对话", href: "/insights/chat", icon: MessageCircle },
    ],
  },
  {
    title: "生活",
    icon: Wallet,
    items: [
      { title: "我的钱包", href: "/wallet", icon: Wallet },
    ],
  },
  {
    title: "设置",
    icon: Settings,
    items: [
      { title: "系统设置", href: "/settings", icon: Wrench },
    ],
  },
];

// --- 默认设置 ---

export const DEFAULT_SETTINGS = {
  theme: "cream" as const,
  language: "zh-CN" as const,
  gitlab: {
    token: "",
    url: "https://gitlab.com",
    localRoot: "F:\\RY",
    defaultBranch: "dev_wkk",
    defaultAuthor: "Wkk12",
  },
  claude: {
    apiKey: "",
    model: "claude-sonnet-4-20250514",
    qwapiKey: "",
  },
  platforms: {},
  setupCompleted: false,
};

// --- 项目状态映射 ---

export const PROJECT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  idea: { label: "💡 想法", color: "bg-amber-100 text-amber-800" },
  developing: { label: "🚧 开发中", color: "bg-blue-100 text-blue-800" },
  launched: { label: "🚀 已上线", color: "bg-green-100 text-green-800" },
  maintaining: { label: "🔧 维护中", color: "bg-purple-100 text-purple-800" },
  archived: { label: "📦 归档", color: "bg-gray-100 text-gray-800" },
};

// --- 内容状态映射 ---

export const CONTENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "bg-gray-100 text-gray-700" },
  scheduled: { label: "已排期", color: "bg-blue-100 text-blue-700" },
  published: { label: "已发布", color: "bg-green-100 text-green-700" },
  failed: { label: "发布失败", color: "bg-red-100 text-red-700" },
};

// --- 问候语 ---

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了，早点休息 🌙";
  if (hour < 9) return "早上好，新的一天 ☀️";
  if (hour < 12) return "上午好，效率满满 💪";
  if (hour < 14) return "中午好，记得吃饭 🍱";
  if (hour < 18) return "下午好，继续加油 ✨";
  if (hour < 21) return "晚上好，放松一下 🌆";
  return "夜深了，早点休息 🌙";
}

// --- 猫猫语录 ---

export const CAT_QUOTES = [
  "今天也要加油喵~ 🐱",
  "奶油在看着你呢～",
  "摸摸奶油，代码没bug！",
  "奶油说：休息一下，撸个猫吧～",
  "喵呜～工作报告写完了吗？",
  "奶油陪你一起搬砖 💕",
];
