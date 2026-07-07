import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import os from "os";

function shellEnv() {
  const home = os.homedir();
  const sep = process.platform === "win32" ? ";" : ":";
  return { ...process.env, PATH: `${home}/.local/bin${sep}${process.env.PATH || ""}`, HOME: home };
}

export async function POST(request: NextRequest) {
  try {
    const { name, action } = await request.json();
    if (!action) {
      return NextResponse.json({ ok: false, detail: "缺少修复命令" }, { status: 400 });
    }

    const allowedPrefixes = ["browser-act", "cd ", "bash ", "npm ", "npx "];
    if (!allowedPrefixes.some((p) => action.trim().startsWith(p))) {
      return NextResponse.json({ ok: false, detail: "不支持的命令" }, { status: 400 });
    }

    // 使用绝对路径
    const baBin = `${os.homedir()}/.local/bin/browser-act`;
    let cmd = action;
    if (action.startsWith("browser-act")) {
      cmd = `"${baBin}"${action.slice(11)}`;
    }

    const env = shellEnv();
    const output = execSync(cmd, {
      encoding: "utf-8", env, timeout: 60000, stdio: "pipe",
    }).trim();

    return NextResponse.json({
      ok: true,
      detail: output?.split("\n").pop() || "执行完成",
      output: output.slice(-1000),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const stderr = (error as { stderr?: string })?.stderr || "";
    return NextResponse.json({
      ok: false,
      detail: msg.slice(0, 300),
      output: stderr.slice(-500),
    });
  }
}
