# 🐱 喵站工作台 · my-AI-workbench

美少女珂的个人 AI 工作台 — 工作提效 & 一人公司自研

## ✨ 功能

### 🏢 工作台
- **日报生成** — 从 Git 提交记录一键生成工作日报（本地仓库 / GitLab API 双模式）
- **Git 看板** — 可视化 Git 活动（即将推出）
- **会议纪要** — AI 辅助会议记录（即将推出）
- **代码 Review** — AI 代码审查（即将推出）

### 💡 自研（一人公司）
- **内容创作** — 小红书/抖音内容管理，发布状态追踪
- **项目看板** — Kanban 视图 + 里程碑管理
- **创意实验室** — 灵感速记 + AI 头脑风暴

### 🤖 AI 洞察
- Claude 驱动的智能分析、文案润色

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS 4 |
| 组件库 | shadcn/ui |
| 语言 | TypeScript |
| AI | Anthropic Claude SDK |
| 存储 | JSON 文件（`data/` 目录） |
| 浏览器自动化 | browser-act CLI (Python/uv) |

## 🚀 快速开始

```bash
git clone https://github.com/Wkk12/my-AI-workbench.git
cd my-AI-workbench
bash scripts/setup.sh    # 一键安装所有依赖
npm run dev               # → http://localhost:3000
```

> setup.sh 自动处理：Node.js 检查 → npm install → Python/uv → browser-act → Chrome 浏览器配置 → 保存浏览器 ID

## 💻 换电脑 / 新环境部署

```bash
# 1. 克隆项目
git clone https://github.com/Wkk12/my-AI-workbench.git
cd my-AI-workbench

# 2. 一键安装环境
bash scripts/setup.sh

# 3. 配置 API Key
#    打开 http://localhost:3000 → 设置 → QWAPI_API_KEY
#    注册: https://qweapi.com

# 4. ⚠️ 登录各平台（仅首次需要）
#    在启动的 Chrome 中分别打开以下网站扫码/验证码登录：
#    - 小红书创作后台: https://creator.xiaohongshu.com
#    - 抖音创作后台: https://creator.douyin.com
#    （登录态会保存在 Chrome 中，后续自动复用）

# 5. 启动使用
npm run dev
```

> ⚠️ Chrome 登录态是浏览器本地存储，无法跨设备同步，换电脑必须重新登录一次。

## 📁 项目结构

```
my-AI-workbench/
├── src/
│   ├── app/              # 页面路由
│   │   ├── page.tsx      # 首页（仪表盘）
│   │   ├── work/         # 工作台子页面
│   │   ├── self-dev/     # 自研子页面
│   │   ├── insights/     # AI 洞察
│   │   ├── settings/     # 系统设置
│   │   └── api/          # REST API
│   ├── components/       # UI 组件 + 布局
│   └── lib/              # 数据类型 + 数据 CRUD
├── data/                 # 运行时数据（JSON + Markdown）
│   ├── daily-reports/    # 日报存储
│   ├── contents/         # 内容创作数据
│   ├── projects/         # 项目看板数据
│   ├── ideas/            # 灵感记录
│   └── settings.json     # 系统设置
├── scripts/              # 辅助脚本
│   └── daily-report/     # 日报生成 Python 脚本
└── dailyReport/          # 日报模板 & 示例
```

## 📝 日报生成

日报功能依赖 Python 脚本提取 Git 提交记录：

```bash
python scripts/daily-report/gitlab_daily_report.py \
  --date 2026-07-05 \
  --local-root /path/to/repos \
  --branch main \
  --author YourName
```

支持两种模式：
- **本地模式**：扫描本地 Git 仓库目录，提取指定日期/分支/作者的提交
- **GitLab API 模式**：通过 GitLab API 拉取所有项目提交记录

## 📌 当前状态

- ✅ 框架搭建完成（UI 布局 / 导航 / 数据层）
- ✅ 日报生成（Python 脚本已验证，待公司 Windows 环境实测）
- ⏳ Git 看板 / 会议纪要 / 代码 Review（待开发）
- ⏳ AI 助手接入 Claude
- ⏳ 内容创作 / 项目看板 / 创意实验室（前端骨架完成，数据流待完善）

---

*由 珂珂的虾 🦐 维护 · 奶油陪伴每一天 🐱*
