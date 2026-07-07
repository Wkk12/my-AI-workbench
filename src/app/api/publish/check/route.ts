import { NextResponse } from "next/server";
import { execSync } from "child_process";
import os from "os";
import fs from "fs";
import { getSettings } from "@/lib/data/settings";

// ============================================================
// 发布环境 7 步检查
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

export async function GET() {
  const steps: CheckStep[] = [];
  const settings = await getSettings();
  const env = shellEnv();
  const home = os.homedir();

  // ===== 步骤 1: Node.js =====
  try {
    const ver = execSync("node --version", { encoding: "utf-8", env, timeout: 10000 }).trim();
    const major = parseInt(ver.replace(/^v/, "").split(".")[0], 10);
    steps.push({
      step: 1, name: "node", label: "Node.js 运行时",
      ok: major >= 20, required: true,
      detail: major >= 20 ? ver : `${ver}（需要 >= 20）`,
      hint: "请到 https://nodejs.org 下载安装 Node.js 22 LTS 版本",
      action: "https://nodejs.org", actionLabel: "前往下载",
    });
  } catch {
    steps.push({
      step: 1, name: "node", label: "Node.js 运行时",
      ok: false, required: true,
      detail: "未安装",
      hint: "请到 https://nodejs.org 下载安装 Node.js 22 LTS 版本",
      action: "https://nodejs.org", actionLabel: "前往下载",
    });
  }

  // ===== 步骤 2: Python 3 + uv =====
  let hasPython = false;
  try {
    const pyVer = execSync("python3 --version", { encoding: "utf-8", env, timeout: 10000 }).trim();
    steps.push({
      step: 2, name: "python", label: "Python 3",
      ok: true, required: true,
      detail: pyVer,
    });
    hasPython = true;
  } catch {
    steps.push({
      step: 2, name: "python", label: "Python 3",
      ok: false, required: true,
      detail: "未安装 Python 3.12+",
      hint: "请到 https://www.python.org/downloads/ 下载安装 Python 3.12+",
      action: "https://www.python.org/downloads/", actionLabel: "前往下载",
    });
  }

  // ===== uv 包管理器（Python 安装才检测） =====
  let hasUv = false;
  if (hasPython) {
    try {
      const uvVer = execSync(`${home}/.local/bin/uv --version`, { encoding: "utf-8", env, timeout: 10000 }).trim();
      steps.push({
        step: 2, name: "uv", label: "uv 包管理器",
        ok: true, required: true,
        detail: uvVer,
      });
      hasUv = true;
    } catch {
      steps.push({
        step: 2, name: "uv", label: "uv 包管理器",
        ok: false, required: true,
        detail: "uv 未安装",
        hint: isWin()
          ? "打开 PowerShell 执行: powershell -c \"irm https://astral.sh/uv/install.ps1 | iex\""
          : "终端执行: curl -LsSf https://astral.sh/uv/install.sh | sh",
        action: isWin()
          ? "powershell -c \"irm https://astral.sh/uv/install.ps1 | iex\""
          : "curl -LsSf https://astral.sh/uv/install.sh | sh",
        actionLabel: "一键安装",
      });
    }
  } else {
    steps.push({
      step: 2, name: "uv", label: "uv 包管理器",
      ok: false, required: true,
      detail: "请先安装 Python 3",
      hint: "安装 Python 3 后会自动检测 uv",
    });
  }

  // ===== 步骤 3: browser-act =====
  const baPath = baBin();
  let hasBrowserAct = false;
  try {
    const baVer = execSync(`"${baPath}" --version`, {
      encoding: "utf-8", env, timeout: 15000,
    }).trim();
    steps.push({
      step: 3, name: "browser-act", label: "browser-act 浏览器自动化",
      ok: true, required: true,
      detail: `已安装: ${baVer}`,
    });
    hasBrowserAct = true;
  } catch {
    steps.push({
      step: 3, name: "browser-act", label: "browser-act 浏览器自动化",
      ok: false, required: true,
      detail: "未安装浏览器自动化工具",
      hint: "需要 Python 3.12+ 和 uv 已安装。将自动通过 uv 安装 browser-act-cli",
      action: "uv tool install browser-act-cli --python 3.12",
      actionLabel: "一键安装",
    });
  }

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
    try {
      execSync("command -v google-chrome || command -v chromium", { encoding: "utf-8", timeout: 5000 });
      hasChrome = true;
    } catch { hasChrome = false; }
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
    try {
      const list = execSync(`"${baPath}" browser list`, {
        encoding: "utf-8", env, timeout: 15000,
      }).trim();

      const hasWorkbench = list.includes("workbench");
      const hasLocal = list.includes("chrome_local");

      if (hasWorkbench || hasLocal) {
        steps.push({
          step: 5, name: "browser-id", label: "Chrome 浏览器配置",
          ok: true, required: true,
          detail: hasWorkbench ? "workbench 已配置" : "chrome_local 已配置",
        });
      } else {
        steps.push({
          step: 5, name: "browser-id", label: "Chrome 浏览器配置",
          ok: false, required: true,
          detail: "未配置浏览器实例",
          hint: "将创建一个名为 workbench 的 Chrome 浏览器实例，用于发布自动化",
          action: "browser-act browser create chrome --name workbench",
          actionLabel: "一键创建",
        });
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const isSkillErr = errMsg.includes("Skill");
      steps.push({
        step: 5, name: "browser-id", label: "Chrome 浏览器配置",
        ok: true, required: true, // 非阻塞——首次发布时自动创建
        detail: isSkillErr
          ? "browser-act 已安装，Chrome 将自动检测"
          : "首次发布时将自动配置",
      });
    }
  } else {
    steps.push({
      step: 5, name: "browser-id", label: "Chrome 浏览器配置",
      ok: false, required: true,
      detail: "请先安装 browser-act 和 Chrome",
      hint: "完成前面步骤后会自动检测",
    });
  }

  // ===== 步骤 6: QWAPI Key =====
  const hasKey = !!(process.env.QWAPI_API_KEY || settings.claude?.qwapiKey);
  steps.push({
    step: 6, name: "qwapi-key", label: "AI 接口 Key (QWAPI)",
    ok: hasKey, required: true,
    detail: hasKey ? "已配置" : "未配置",
    hint: !hasKey
      ? "请到 https://qweapi.com 注册获取 Key，然后在设置页面填入。注册即送免费额度。"
      : undefined,
    action: !hasKey ? "/self-dev/settings" : undefined,
    actionLabel: !hasKey ? "去设置" : undefined,
  });

  // ===== 步骤 7: 平台登录 =====
  steps.push({
    step: 7, name: "login", label: "平台登录",
    ok: true, required: false, // 无法自动检测，始终提示
    detail: "请确保 Chrome 已登录各创作者平台",
    hint: "在 Chrome 中打开以下平台并扫码登录，登录态会保存在 Chrome 中，后续无需重复登录。\n• 小红书创作者: https://creator.xiaohongshu.com\n• 抖音创作者: https://creator.douyin.com",
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
