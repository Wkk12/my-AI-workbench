import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST() {
  try {
    // 1. Git pull
    const pull = await execAsync("cd C:\\my-AI-workbench && git pull", { timeout: 30000 });

    // 2. Build
    const build = await execAsync("cd C:\\my-AI-workbench && npm run build", { timeout: 180000, cwd: "C:\\my-AI-workbench" });

    // 3. 杀掉旧进程并重启（后台运行）
    exec("taskkill /f /im node.exe 2>nul & cd C:\\my-AI-workbench && npm run start", { cwd: "C:\\my-AI-workbench" });

    return NextResponse.json({ 
      ok: true, 
      pull: pull.stdout.slice(-200),
      build: build.stdout.slice(-500),
      msg: "服务将在几秒后重启"
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 500 });
  }
}
