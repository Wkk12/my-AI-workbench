import { NextResponse } from "next/server";
import { execSync } from "child_process";
import os from "os";
import { getSettings } from "@/lib/data/settings";

interface CheckItem {
  name: string;
  label: string;
  ok: boolean;
  detail: string;
  action?: string;
  actionLabel?: string;
}

function shellEnv() {
  const home = os.homedir();
  // Windows PATH 用 ; 分隔，Linux/Mac 用 :
  const sep = process.platform === "win32" ? ";" : ":";
  return {
    ...process.env,
    PATH: `${home}/.local/bin${sep}${process.env.PATH || ""}`,
    HOME: home,
  };
}

function browserActBin(): string {
  return `${os.homedir()}/.local/bin/browser-act`;
}

export async function GET() {
  const checks: CheckItem[] = [];
  const settings = getSettings();
  const env = shellEnv();

  // 1. browser-act 是否安装
  const baBin = browserActBin();
  try {
    const output = execSync(`"${baBin}" --version`, {
      encoding: "utf-8", env, timeout: 10000, shell: "bash",
    }).trim();
    checks.push({ name: "browser-act", label: "browser-act 工具", ok: true, detail: output });
  } catch {
    checks.push({
      name: "browser-act",
      label: "browser-act 工具",
      ok: false,
      detail: "未安装浏览器自动化工具",
      action: "cd \"f:/项目/AI-工具/my-AI-workbench\" && bash scripts/setup.sh",
      actionLabel: "一键安装",
    });
  }

  // 2. Chrome 浏览器配置
  if (checks[0]?.ok) {
    try {
      const list = execSync(`"${baBin}" browser list`, {
        encoding: "utf-8", env, timeout: 10000, shell: "bash",
      }).trim();

      const hasWorkbench = list.includes("workbench");
      const hasLocal = list.includes("chrome_local");

      if (hasWorkbench || hasLocal) {
        checks.push({
          name: "chrome",
          label: "Chrome 浏览器",
          ok: true,
          detail: hasWorkbench ? "workbench 已配置" : "chrome_local 已配置",
        });
      } else {
        checks.push({
          name: "chrome",
          label: "Chrome 浏览器",
          ok: false,
          detail: "未创建浏览器配置，发布需要 Chrome 自动化",
          action: "browser-act browser create --type chrome-direct --name workbench --desc \"meow-workbench\"",
          actionLabel: "创建配置",
        });
      }
    } catch {
      checks.push({
        name: "chrome",
        label: "Chrome 浏览器",
        ok: false,
        detail: "无法检测浏览器配置，请运行: browser-act browser create",
        action: "browser-act browser create --type chrome-direct --name workbench --desc \"meow-workbench\"",
        actionLabel: "创建配置",
      });
    }
  } else {
    checks.push({ name: "chrome", label: "Chrome 浏览器", ok: false, detail: "需要先安装 browser-act" });
  }

  // 3. QWAPI API Key
  const hasKey = !!(process.env.QWAPI_API_KEY || settings.claude?.qwapiKey);
  checks.push({
    name: "qweapi",
    label: "QWAPI Key",
    ok: hasKey,
    detail: hasKey ? "已配置" : "未配置 AI 接口 Key",
    action: hasKey ? undefined : "/settings",
    actionLabel: hasKey ? undefined : "去设置",
  });

  // 4. Chrome 是否已登录（仅提示）
  checks.push({
    name: "login",
    label: "平台登录",
    ok: true, // 无法自动检测，始终提示
    detail: "请确保 Chrome 已登录 creator.xiaohongshu.com 或 creator.douyin.com",
    action: "https://creator.xiaohongshu.com",
    actionLabel: "打开小红书",
  });

  const allOk = checks.slice(0, 3).every((c) => c.ok);

  return NextResponse.json({
    ready: allOk,
    checks,
    passed: checks.filter((c) => c.ok).length,
    total: checks.length,
  });
}
