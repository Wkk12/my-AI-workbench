import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { getReportMeta, getReportContent } from "@/lib/data/daily-reports";
import type { DailyReportMeta } from "@/lib/types";

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  const { dateType, date, fromDate, toDate, localRoot, branch, author, source } = await request.json();

  const scriptPath = path.resolve(
    process.cwd(),
    "scripts",
    "daily-report",
    "gitlab_daily_report.py"
  );

  // 确定输出文件名和显示标签
  const isRange = dateType === "range" && fromDate && toDate;
  const reportId = isRange ? `${fromDate}_${toDate}` : date;
  const displayLabel = isRange ? `${fromDate} ~ ${toDate}` : date;

  // 确保输出目录存在
  const outputDir = path.resolve(
    process.cwd(),
    "data",
    "daily-reports",
    "reports"
  );
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `daily_report_${reportId}.md`);

  // 检查 Python 脚本是否存在
  if (!fs.existsSync(scriptPath)) {
    // 如果没有 Python 脚本，生成示例日报
    const exampleContent = `# 📋 ${displayLabel} 工作日报

> 生成时间：${new Date().toLocaleString("zh-CN")}

---

## 暂无提交记录

${isRange ? "该时间段内" : "今天"}没有新的 Git 提交记录，去写点代码吧！💪

---

*由 喵站工作台 自动生成 🐱*
`;
    fs.writeFileSync(outputPath, exampleContent, "utf-8");

    const meta: DailyReportMeta = {
      id: reportId,
      date: displayLabel,
      projectCount: 0,
      commitCount: 0,
      createdAt: new Date().toISOString(),
      source: source || "local",
    };

    return NextResponse.json({
      success: true,
      content: exampleContent,
      meta,
      note: "Python 脚本未找到，生成了示例日报。请配置 scripts/daily-report/gitlab_daily_report.py",
    });
  }

  try {
    const args = [scriptPath];

    if (isRange) {
      args.push("--from-date", fromDate, "--to-date", toDate);
    } else {
      args.push("--date", date);
    }
    args.push("--output", outputPath);

    if (source === "local" || !source) {
      if (localRoot) args.push("--local-root", localRoot);
      if (branch) args.push("--branch", branch);
      if (author) args.push("--author", author);
    } else {
      // GitLab API 模式
    }

    const { stdout, stderr } = await execFileAsync("python", args, {
      timeout: 60000,
    });

    // 读取生成的文件
    let content = "";
    if (fs.existsSync(outputPath)) {
      content = fs.readFileSync(outputPath, "utf-8");
    }

    // 解析内容获取项目数和提交数
    const projectMatches = content.match(/^##\s/gm);
    const commitMatches = content.match(/^\d+\.\s/gm);
    const projectCount = projectMatches ? projectMatches.length : 0;
    const commitCount = commitMatches ? commitMatches.length : 0;

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
      content,
      meta,
      stdout,
      stderr: stderr || undefined,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 }
    );
  }
}
