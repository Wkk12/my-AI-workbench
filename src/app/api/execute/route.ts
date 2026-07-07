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
      const gitDir = path.join(rootDir, entry.name, ".git");
      if (fs.existsSync(gitDir)) {
        repos.push(path.join(rootDir, entry.name));
      }
    }
  } catch { /* ignore */ }
  return repos;
}

/** 对单个仓库运行 git log */
async function getRepoCommits(
  repoPath: string,
  since: string,
  until: string,
  author: string
): Promise<{ repoName: string; commits: string[] }> {
  const repoName = path.basename(repoPath);
  const args = [
    "-C", repoPath,
    "log",
    `--since=${since}`,
    `--until=${until}`,
    `--author=${author}`,
    "--pretty=format:%s",
    "--no-merges",
  ];

  try {
    const { stdout } = await execFileAsync("git", args, { timeout: 30000 });
    const commits = stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return { repoName, commits };
  } catch {
    return { repoName, commits: [] };
  }
}

export async function POST(request: NextRequest) {
  const { dateType, date, fromDate, toDate, localRoot, branch, author, source } =
    await request.json();

  const isRange = dateType === "range" && fromDate && toDate;
  const reportId = isRange ? `${fromDate}_${toDate}` : date;
  const displayLabel = isRange ? `${fromDate} ~ ${toDate}` : date;

  // 计算 since/until
  const sinceDate = isRange ? fromDate : date;
  const untilDate = isRange ? toDate : date;
  const since = `${sinceDate}T00:00:00`;
  // until 需要是后一天
  const untilDt = new Date(untilDate);
  untilDt.setDate(untilDt.getDate() + 1);
  const until = untilDt.toISOString().split("T")[0] + "T00:00:00";

  const rootDir = localRoot || "F:\\RY";
  const gitAuthor = author || "Wkk12";

  // 查找仓库
  const repos = findGitRepos(rootDir);

  if (repos.length === 0) {
    // 没有找到仓库，生成空日报
    const emptyContent = `# 📋 ${displayLabel} 工作日报

> 生成时间：${new Date().toLocaleString("zh-CN")}

---

## 暂无提交记录

在 \`${rootDir}\` 下未找到 Git 仓库，或${isRange ? "该时间段内" : "今天"}没有提交记录。

---

*由 喵站工作台 自动生成 🐱*
`;
    const outputDir = path.resolve(process.cwd(), "data", "daily-reports", "reports");
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `daily_report_${reportId}.md`);
    fs.writeFileSync(outputPath, emptyContent, "utf-8");

    const meta: DailyReportMeta = {
      id: reportId,
      date: displayLabel,
      projectCount: 0,
      commitCount: 0,
      createdAt: new Date().toISOString(),
      source: source || "local",
    };

    return NextResponse.json({ success: true, content: emptyContent, meta });
  }

  // 并发查询所有仓库的提交
  const results = await Promise.all(
    repos.map((r) => getRepoCommits(r, since, until, gitAuthor))
  );

  // 过滤掉空提交的仓库
  const activeResults = results.filter((r) => r.commits.length > 0);

  // 构建 Markdown
  let markdown = `# 📋 ${displayLabel} 工作日报

> 生成时间：${new Date().toLocaleString("zh-CN")}
> 数据来源：本地仓库 (${rootDir})
> 作者：${gitAuthor}

---

`;

  if (activeResults.length === 0) {
    markdown += `## 暂无提交记录

${isRange ? "该时间段内" : "今天"}没有新的 Git 提交记录，去写点代码吧！💪

扫描了 ${repos.length} 个仓库。

---

*由 喵站工作台 自动生成 🐱*
`;
  } else {
    for (const { repoName, commits } of activeResults) {
      markdown += `## ${repoName}\n\n`;
      commits.forEach((c, i) => {
        markdown += `${i + 1}. ${c}\n`;
      });
      markdown += "\n";
    }

    markdown += `---\n\n`;
    markdown += `> 共 ${activeResults.length} 个项目，${activeResults.reduce((s, r) => s + r.commits.length, 0)} 次提交\n\n`;
    markdown += `*由 喵站工作台 自动生成 🐱*\n`;
  }

  // 保存到文件
  const outputDir = path.resolve(process.cwd(), "data", "daily-reports", "reports");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `daily_report_${reportId}.md`);
  fs.writeFileSync(outputPath, markdown, "utf-8");

  const projectCount = activeResults.length;
  const commitCount = activeResults.reduce((s, r) => s + r.commits.length, 0);

  const meta: DailyReportMeta = {
    id: reportId,
    date: displayLabel,
    projectCount,
    commitCount,
    createdAt: new Date().toISOString(),
    source: source || "local",
  };

  return NextResponse.json({
    success: true,
    content: markdown,
    meta,
  });
}
