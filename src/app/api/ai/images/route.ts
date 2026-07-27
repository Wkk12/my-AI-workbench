import { NextRequest, NextResponse } from "next/server";
import { getAllIPs } from "@/lib/data/ips";
import fs from "fs";
import path from "path";
const JOB_DIR = path.join(process.cwd(), "data", "image-jobs");

// ── POST: 创建任务并启动后台 Worker ──
export async function POST(request: NextRequest) {
  try {
    const { prompt, ipId, count, size, quality, perImagePrompts } = await request.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "缺少 prompt 参数" }, { status: 400 });
    }

    const imageCount = Math.min(Math.max(count || 1, 1), 9);
    // Quality → size mapping (size param takes precedence)
    const qualityMap: Record<string, string> = { high: "1024x1536", medium: "768x1152", low: "512x768" };
    const imageSize = size || qualityMap[quality] || "768x1152";

    // 准备 prompt 列表
    const ips = ipId ? await getAllIPs() : [];
    const ip = ipId ? ips.find((i) => i.id === ipId) : undefined;

    const tasks: string[] = Array.from({ length: imageCount }, (_, i) => {
      // 如果有每张图的独立 prompt，直接使用
      if (perImagePrompts?.[i]) return perImagePrompts[i].slice(0, 1000);
      let p = prompt;
      if (ip?.stylePrompt) p = `${p}. Style: ${ip.stylePrompt}`;
      if (ip?.description) p = `Character: ${ip.name} - ${ip.description}. ${p}`;
      if (imageCount > 1) p = `${p}, variation ${i + 1}`;
      return p.slice(0, 1000);
    });

    const jobId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 写 job 文件
    if (!fs.existsSync(JOB_DIR)) fs.mkdirSync(JOB_DIR, { recursive: true });
    const job = {
      id: jobId,
      status: "processing",
      images: [] as string[],
      errors: [] as string[],
      total: imageCount,
      done: 0,
      tasks,
      size: imageSize,
      ipId: ipId || null,
      createdAt: Date.now(),
    };
    fs.writeFileSync(path.join(JOB_DIR, `${jobId}.json`), JSON.stringify(job));

    // 启动后台 Worker（spawn detached 模式）
    // 启动后台 Worker（exec 字符串不触发 Turbopack 静态分析）
    const cmd = "node " + path.join(process.cwd(), "scripts", "gen-images-worker.js") + " " + jobId;
    const { exec } = await import("child_process");
    exec(cmd, { cwd: process.cwd() }, (err, stdout, stderr) => {
      if (err) console.error(`Worker ${jobId} failed:`, err.message);
      if (stderr) console.error(`Worker ${jobId} err:`, stderr.toString().slice(0, 500));
      if (stdout) console.log(`Worker ${jobId}:`, stdout.slice(0, 500));
    });

    return NextResponse.json({ success: true, jobId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── GET: 查询任务状态 ──
export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "缺少 jobId" }, { status: 400 });

  const jobFile = path.join(JOB_DIR, `${jobId}.json`);
  if (!fs.existsSync(jobFile)) {
    return NextResponse.json({ error: "任务不存在或已过期" }, { status: 404 });
  }

  const job = JSON.parse(fs.readFileSync(jobFile, "utf-8"));

  return NextResponse.json({
    status: job.status,
    images: job.status === "done" ? job.images : undefined,
    done: job.done,
    total: job.total,
    errors: job.errors.length > 0 ? job.errors : undefined,
  });
}
