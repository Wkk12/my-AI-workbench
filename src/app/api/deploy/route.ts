import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST() {
  try {
    // Git pull
    const pull = await execAsync("cd C:\\my-AI-workbench && git pull", { timeout: 30000, cwd: "C:\\my-AI-workbench" });
    
    // Build
    const build = await execAsync("cd C:\\my-AI-workbench && npm run build", { timeout: 180000, cwd: "C:\\my-AI-workbench" });
    
    return NextResponse.json({ 
      ok: true, 
      pull: pull.stdout.slice(-200),
      build: build.stdout.slice(-500)
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 500 });
  }
}
