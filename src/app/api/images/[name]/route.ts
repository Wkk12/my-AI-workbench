import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * 动态图片服务 — 直接从磁盘读取，绕过 Next.js 静态缓存
 * GET /api/images/ai_gen_xxx.png
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  
  // 安全检查：只允许 alphanumeric, _, -, .
  if (!/^[\w.-]+$/.test(name)) {
    return NextResponse.json({ error: "非法文件名" }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "public", "data", "images", name);
  
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "图片不存在" }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
