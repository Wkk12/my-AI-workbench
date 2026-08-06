import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import fs from "fs";
import { getSettings } from "@/lib/data/settings";

const execAsync = promisify(exec);

// ============================================================
// 发布环境 7 步检查（异步版 — 不阻塞事件循环）
// GET /api/publish/check → { steps[], allOk, platform }
// ============================================================

export interface CheckStep {
  step: number;
  name: string;
  label: string;
  ok: boolean;
  detail: string;
  hint?: string;
  action?: string;
  actionLabel?: string;
  required: boolean;
}

function shellEnv() {
  const home = os.homedir();
  const sep = process.platform === "win32" ? ";" : ":";
  const localBin = process.platform === "win32"
    ? `${home}\\.local\\bin`
    : `${home}/.local/bin`;
  return {
    ...process.env,
    PATH: `${localBin}${sep}${process.env.PATH || ""}`,
    HOME: home,
  };
}

function baBin() {
  const home = os.homedir();
  const ext = process.platform === "win32" ? ".exe" : "";
  return process.platform === "win32"
    ? `${home}\\.local\\bin\\browser-act${ext}`
    : `${home}/.local/bin/browser-act`;
}

function isWin() { return process.platform === "win32"; }
function isMac() { return process.platform === "darwin"; }

/** 安全异步执行命令，超时默认 3s */
async function safeExec(cmd: string, timeout = 3000): Promise<string | null> {
  try {
    const { stdout } = await execAsync(cmd, { encoding: "utf-8", env: shellEnv(), timeout });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function GET() {
  const steps: CheckStep[] = [];
  const settings = await getSettings();
  const home = os.homedir();

  // 并行检查所有 CLI 版本
  const [nodeVer, pyVer, uvVer] = await Promise.all([
    safeExec("node --version"),
    safeExec("python3 --version"),
    safeExec(`${home}/.local/bin/uv --version`),
  ]);

  // ===== 步骤 1: Node.js =====
  if (nodeVer) {
    const major = parseInt(nodeVer.replace(/^v/, "").split(".")[0], 10);
    steps.push({
      step: 1, name: "node", label: "Node.js 运行时",
      ok: major >= 20, required: true,
      detail: major >= 20 ? nodeVer : `${nodeVer}（需要 >= 20）`,
      hint: "请到 https://nodejs.org 下载安装 Node.js 22 LTS 版本",
      action: "https://nodejs.org", actionLabel: "前往下载",
    });
  } else {
    steps.push({
      step: 1, name: "node", label: "Node.js 运行时",
      ok: false, required: true,
      detail: "未安装",
      hint: "请到 https://nodejs.org 下载安装 Node.js 22 LTS 版本",
      action: "https://nodejs.org", actionLabel: "前往下载",
    });
  }

  // ===== 步骤 2: Python 3 =====
  const hasPython = !!pyVer;
  steps.push({
    step: 2, name: "python", label: "Python 3",
    ok: hasPython, required: true,
    detail: hasPython ? pyVer : "未安装 Python 3.12+",
    hint: !hasPython ? "请到 https://www.python.org/downloads/ 下载安装 Python 3.12+" : undefined,
    action: !hasPython ? "https://www.python.org/downloads/" : undefined,
    actionLabel: !hasPython ? "前往下载" : undefined,
  });

  // ===== uv =====
  steps.push({
    step: 2, name: "uv", label: "uv 包管理器",
    ok: !!uvVer, required: true,
    detail: uvVer || (hasPython ? "uv 未安装" : "请先安装 Python 3"),
    hint: !uvVer && hasPython
      ? (isWin() ? "PowerShell: irm https://astral.sh/uv/install.ps1 | iex"
                 : "终端: curl -LsSf https://astral.sh/uv/install.sh | sh")
      : undefined,
  });

  // ===== 步骤 3: browser-act =====
  const baPath = baBin();
  const baVer = await safeExec(`"${baPath}" --version`, 5000);
  const hasBrowserAct = !!baVer;
  steps.push({
    step: 3, name: "browser-act", label: "browser-act 浏览器自动化",
    ok: hasBrowserAct, required: true,
    detail: hasBrowserAct ? `已安装: ${baVer}` : "未安装浏览器自动化工具",
    hint: !hasBrowserAct ? "需要 Python 3.12+ 和 uv。将自动通过 uv 安装" : undefined,
    action: !hasBrowserAct ? "uv tool install browser-act-cli --python 3.12" : undefined,
    actionLabel: !hasBrowserAct ? "一键安装" : undefined,
  });

  // ===== 步骤 4: Google Chrome =====
  let hasChrome = false;
  if (isMac()) {
    hasChrome = fs.existsSync("/Applications/Google Chrome.app");
  } else if (isWin()) {
    const chromePaths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      `${home}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
    ];
    hasChrome = chromePaths.some((p) => fs.existsSync(p));
  } else {
    hasChrome = !!(await safeExec("command -v google-chrome || command -v chromium"));
  }
  steps.push({
    step: 4, name: "chrome", label: "Google Chrome 浏览器",
    ok: hasChrome, required: true,
    detail: hasChrome ? "已安装" : "未检测到 Chrome",
    hint: !hasChrome ? "请安装 Google Chrome 浏览器: https://www.google.com/chrome/" : undefined,
    action: !hasChrome ? "https://www.google.com/chrome/" : undefined,
    actionLabel: !hasChrome ? "前往下载" : undefined,
  });

  // ===== 步骤 5: Chrome 浏览器配置 =====
  if (hasBrowserAct && hasChrome) {
    const list = await safeExec(`"${baPath}" browser list`, 5000);
    if (list) {
      const hasConfig = list.includes("workbench") || list.includes("chrome_local");
      steps.push({
        step: 5, name: "browser-id", label: "Chrome 浏览器配置",
        ok: hasConfig, required: true,
        detail: hasConfig ? "workbench 已配置" : "未配置浏览器实例",
        hint: !hasConfig ? "将创建一个名为 workbench 的 Chrome 浏览器实例" : undefined,
        action: !hasConfig ? "browser-act browser create chrome --name workbench" : undefined,
        actionLabel: !hasConfig ? "一键创建" : undefined,
      });
    } else {
      steps.push({
        step: 5, name: "browser-id", label: "Chrome 浏览器配置",
        ok: true, required: true,
        detail: "首次发布时将自动配置",
      });
    }
  } else {
    steps.push({
      step: 5, name: "browser-id", label: "Chrome 浏览器配置",
      ok: false, required: true,
      detail: "请先安装 browser-act 和 Chrome",
    });
  }

  // ===== 步骤 6: QWAPI Key =====
  const hasKey = !!(process.env.QWAPI_API_KEY || settings.claude?.qwapiKey);
  steps.push({
    step: 6, name: "qwapi-key", label: "AI 接口 Key (QWAPI)",
    ok: hasKey, required: true,
    detail: hasKey ? "已配置" : "未配置",
    hint: !hasKey ? "请到 https://qweapi.com 注册获取 Key，然后在设置页面填入" : undefined,
    action: !hasKey ? "/self-dev/settings" : undefined,
    actionLabel: !hasKey ? "去设置" : undefined,
  });

  // ===== 步骤 7: 平台登录 =====
  steps.push({
    step: 7, name: "login", label: "平台登录",
    ok: true, required: false,
    detail: "请确保 Chrome 已登录各创作者平台",
    hint: "• 小红书创作者: https://creator.xiaohongshu.com\n• 抖音创作者: https://creator.douyin.com",
    action: "https://creator.xiaohongshu.com",
    actionLabel: "打开小红书",
  });

  const allOk = steps.every((s) => s.ok || !s.required);

  return NextResponse.json({
    ready: allOk,
    steps,
    currentStep: steps.findIndex((s) => !s.ok) + 1 || steps.length,
    passed: steps.filter((s) => s.ok).length,
    total: steps.length,
    platform: process.platform,
  });
}
