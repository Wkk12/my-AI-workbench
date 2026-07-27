import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import type { DailyReportMeta } from "@/lib/types";

const execFileAsync = promisify(execFile);

/** 扫描目录下的所有 git 仓库 */
function findGitRepos(rootDir: string): string[] {
  const repos: string[] = [];
  try {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const gitDir = path.join(rootDir, entry.name, ".git");
      if (fs.existsSync(gitDir)) {
        repos.push(path.join(rootDir, entry.name));
      }
    }
  } catch { /* ignore */ }
  return repos;
}

/** 单个 commit 结构 */
interface CommitEntry {
  title: string;
  body: string;
}

/** 对单个本地仓库运行 git log */
async function getRepoCommits(
  repoPath: string,
  since: string,
  until: string,
  author: string
): Promise<{ repoName: string; commits: CommitEntry[] }> {
  const repoName = path.basename(repoPath);
  const args = [
    "-C", repoPath,
    "log",
    `--since=${since}`,
    `--until=${until}`,
    `--author=${author}`,
    "--pretty=format:%s%x1f%b%x1e",
    "--no-merges",
  ];

  try {
    const { stdout } = await execFileAsync("git", args, { timeout: 30000 });
    const commits: CommitEntry[] = [];
    const records = stdout.split("\x1e").filter(Boolean);
    for (const record of records) {
      const sepIdx = record.indexOf("\x1f");
      if (sepIdx === -1) {
        commits.push({ title: record.trim(), body: "" });
      } else {
        commits.push({
          title: record.substring(0, sepIdx).trim(),
          body: record.substring(sepIdx + 1).trim(),
        });
      }
    }
    return { repoName, commits };
  } catch {
    return { repoName, commits: [] };
  }
}

// ── GitHub API ──

/** 从 GitHub API 拉取提交记录 */
async function getGitHubCommits(
  owner: string,
  repo: string,
  since: string,
  until: string,
  author: string,
  token: string,
  branch: string
): Promise<{ repoName: string; commits: CommitEntry[] }> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "my-AI-workbench",
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  const sha = branch || "main";
  const sinceISO = new Date(since).toISOString();
  const untilISO = new Date(until).toISOString();

  const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${sha}&since=${sinceISO}&until=${untilISO}&per_page=100`;

  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      return { repoName: repo, commits: [] };
    }
    const data = await resp.json();
    const commits: CommitEntry[] = [];
    for (const c of data) {
      const lines = (c.commit?.message || "").split("\n");
      const title = lines[0]?.trim() || "";
      const body = lines.slice(1).join("\n").trim();
      const commitAuthor = c.commit?.author?.name || c.author?.login || "";
      if (title) {
        if (author && !commitAuthor.toLowerCase().includes(author.toLowerCase())) {
          continue;
        }
        commits.push({ title, body });
      }
    }
    return { repoName: repo, commits };
  } catch {
    return { repoName: repo, commits: [] };
  }
}

/** 获取用户的 GitHub 仓库列表 */
async function getGitHubRepos(owner: string, token: string): Promise<string[]> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "my-AI-workbench",
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  const repos: string[] = [];
  let page = 1;
  while (true) {
    const url = `https://api.github.com/users/${owner}/repos?per_page=100&page=${page}&sort=updated`;
    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) break;
      const data = await resp.json();
      if (!Array.isArray(data) || data.length === 0) break;
      for (const r of data) {
        if (!r.fork) repos.push(r.name);
      }
      page++;
    } catch {
      break;
    }
  }
  return repos;
}

// ── 日报生成 ──

type SourceType = "local" | "gitlab" | "github";

/** 生成单天日报的 Markdown 内容（本地模式） */
function buildReportMarkdownLocal(
  dateLabel: string,
  rootDir: string,
  author: string,
  repos: string[],
  results: { repoName: string; commits: CommitEntry[] }[]
): string {
  const activeResults = results.filter((r) => r.commits.length > 0);
  const isRange = dateLabel.includes("~");

  let markdown = `# 📋 ${dateLabel} 工作日报

> 生成时间：${new Date().toLocaleString("zh-CN")}
> 数据来源：本地仓库 (${rootDir})
> 作者：${author}

---

`;

  if (repos.length === 0) {
    markdown += `## 暂无提交记录

在 \`${rootDir}\` 下未找到 Git 仓库。

---

*由 喵站工作台 自动生成 🐱*
`;
  } else if (activeResults.length === 0) {
    markdown += `## 暂无提交记录

${isRange ? "该时间段内" : "当天"}没有新的 Git 提交记录，去写点代码吧！💪

扫描了 ${repos.length} 个仓库。

---

*由 喵站工作台 自动生成 🐱*
`;
  } else {
    for (const { repoName, commits } of activeResults) {
      markdown += `## ${repoName}\n\n`;
      commits.forEach((c, i) => {
        markdown += `${i + 1}. ${c.title}\n`;
        if (c.body) {
          c.body.split("\n").forEach((line) => {
            markdown += `    ${line}\n`;
          });
        }
      });
      markdown += "\n";
    }
    markdown += `---\n\n`;
    markdown += `> 共 ${activeResults.length} 个项目，${activeResults.reduce((s, r) => s + r.commits.length, 0)} 次提交\n\n`;
    markdown += `*由 喵站工作台 自动生成 🐱*\n`;
  }

  return markdown;
}

/** 生成单天日报的 Markdown 内容（GitHub 模式） */
function buildReportMarkdownGitHub(
  dateLabel: string,
  owner: string,
  author: string,
  results: { repoName: string; commits: CommitEntry[] }[]
): string {
  const activeResults = results.filter((r) => r.commits.length > 0);
  const isRange = dateLabel.includes("~");

  let markdown = `# 📋 ${dateLabel} 工作日报

> 生成时间：${new Date().toLocaleString("zh-CN")}
> 数据来源：GitHub (${owner})
${author ? `> 作者：${author}` : ""}

---

`;

  if (activeResults.length === 0) {
    markdown += `## 暂无提交记录

${isRange ? "该时间段内" : "当天"}没有新的 Git 提交记录，去写点代码吧！💪

扫描了 ${results.length} 个仓库。

---

*由 喵站工作台 自动生成 🐱*
`;
  } else {
    for (const { repoName, commits } of activeResults) {
      markdown += `## ${repoName}\n\n`;
      commits.forEach((c, i) => {
        markdown += `${i + 1}. ${c.title}\n`;
        if (c.body) {
          c.body.split("\n").forEach((line) => {
            markdown += `    ${line}\n`;
          });
        }
      });
      markdown += "\n";
    }
    markdown += `---\n\n`;
    markdown += `> 共 ${activeResults.length} 个项目，${activeResults.reduce((s, r) => s + r.commits.length, 0)} 次提交\n\n`;
    markdown += `*由 喵站工作台 自动生成 🐱*\n`;
  }

  return markdown;
}

/** 生成单份日报 */
async function generateReport(params: {
  reportId: string;
  displayLabel: string;
  sinceDate: string;
  untilDate: string;
  localRoot: string;
  author: string;
  source: SourceType;
  saveFile: boolean;
  githubToken?: string;
  githubOwner?: string;
  githubRepos?: string[];
  githubBranch?: string;
}): Promise<{ content: string; meta: DailyReportMeta }> {
  const { reportId, displayLabel, sinceDate, untilDate, localRoot, author, source, saveFile } = params;

  const since = `${sinceDate}T00:00:00`;
  const untilDt = new Date(untilDate);
  untilDt.setDate(untilDt.getDate() + 1);
  const until = untilDt.toISOString().split("T")[0] + "T00:00:00";

  let content: string;
  let projectCount = 0;
  let commitCount = 0;

  if (source === "github") {
    // ── GitHub API 模式 ──
    const token = params.githubToken || "";
    const owner = params.githubOwner || "Wkk12";
    const gBranch = params.githubBranch || "main";
    const repos = params.githubRepos && params.githubRepos.length > 0
      ? params.githubRepos
      : await getGitHubRepos(owner, token);

    const results = await Promise.all(
      repos.map((repo: string) =>
        getGitHubCommits(owner, repo, since, until, author, token, gBranch)
      )
    );

    const activeResults = results.filter((r) => r.commits.length > 0);
    projectCount = activeResults.length;
    commitCount = activeResults.reduce((s, r) => s + r.commits.length, 0);
    content = buildReportMarkdownGitHub(displayLabel, owner, author, results);
  } else {
    // ── 本地模式 ──
    const repos = findGitRepos(localRoot);

    if (repos.length === 0) {
      content = `# 📋 ${displayLabel} 工作日报

> 生成时间：${new Date().toLocaleString("zh-CN")}

---

## 暂无提交记录

在 \`${localRoot}\` 下未找到 Git 仓库。

> 💡 提示：可以切换到「GitHub」模式，直接从 GitHub 拉取提交记录。

---

*由 喵站工作台 自动生成 🐱*
`;
    } else {
      const results = await Promise.all(
        repos.map((r) => getRepoCommits(r, since, until, author))
      );
      const activeResults = results.filter((r) => r.commits.length > 0);
      projectCount = activeResults.length;
      commitCount = activeResults.reduce((s, r) => s + r.commits.length, 0);
      content = buildReportMarkdownLocal(displayLabel, localRoot, author, repos, results);
    }
  }

  if (saveFile) {
    const outputDir = path.resolve(process.cwd(), "data", "daily-reports", "reports");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, `daily_report_${reportId}.md`), content, "utf-8");
  }

  return {
    content,
    meta: {
      id: reportId,
      date: displayLabel,
      projectCount,
      commitCount,
      createdAt: new Date().toISOString(),
      source: (source || "local") as "local" | "gitlab",
    },
  };
}

/** 计算日期范围内的所有日期 */
function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(from);
  const end = new Date(to);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

export async function POST(request: NextRequest) {
  const {
    dateType, date, fromDate, toDate,
    localRoot, branch, author, source, rangeMode,
    githubToken, githubOwner, githubRepos,
  } = await request.json();

  const isRange = dateType === "range" && fromDate && toDate;
  const rootDir = localRoot || "F:\\RY";
  const gitAuthor = author || "";
  const srcType: SourceType = (source || "local") as SourceType;

  const genParams = {
    localRoot: rootDir,
    author: gitAuthor,
    source: srcType,
    saveFile: true,
    githubToken,
    githubOwner,
    githubRepos,
    githubBranch: branch || "main",
  };

  // 范围模式：按天拆分生成
  if (isRange && rangeMode === "daily") {
    const dates = getDatesInRange(fromDate, toDate);

    const reports = await Promise.all(
      dates.map((d) =>
        generateReport({
          reportId: d,
          displayLabel: d,
          sinceDate: d,
          untilDate: d,
          ...genParams,
        })
      )
    );

    return NextResponse.json({
      success: true,
      mode: "daily",
      reports: reports.map((r, i) => ({
        id: dates[i],
        date: dates[i],
        content: r.content,
        meta: r.meta,
      })),
    });
  }

  // 单天 / 汇总模式
  const sinceDate = isRange ? fromDate : date;
  const untilDate = isRange ? toDate : date;
  const reportId = isRange ? `${fromDate}_${toDate}` : date;
  const displayLabel = isRange ? `${fromDate} ~ ${toDate}` : date;

  const { content, meta } = await generateReport({
    reportId,
    displayLabel,
    sinceDate,
    untilDate,
    ...genParams,
  });

  return NextResponse.json({
    success: true,
    mode: "summary",
    content,
    meta,
  });
}

/** GET: 获取 GitHub 仓库列表（供前端使用） */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const token = searchParams.get("token");

  if (!owner) {
    return NextResponse.json({ repos: [] }, { status: 400 });
  }

  const repos = await getGitHubRepos(owner, token || "");
  return NextResponse.json({ repos });
}
