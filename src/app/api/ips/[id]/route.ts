import { NextRequest, NextResponse } from "next/server";
import { getIP, saveIP, deleteIP } from "@/lib/data/ips";
import fs from "fs";
import path from "path";

/**
 * IP 单个操作
 * GET    /api/ips/[id]  → 获取单个 IP
 * PUT    /api/ips/[id]  → 更新 IP
 * DELETE /api/ips/[id]  → 删除 IP + 清理图片
 */

const IMAGES_DIR = path.join(process.cwd(), "data", "ips", "images");

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = getIP(id);
  if (!ip) {
    return NextResponse.json({ error: "IP 不存在" }, { status: 404 });
  }
  return NextResponse.json({ ip });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = getIP(id);
  if (!existing) {
    return NextResponse.json({ error: "IP 不存在" }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const name = formData.get("name") as string;
    const description = formData.get("description") as string || "";
    const stylePrompt = formData.get("stylePrompt") as string || "";
    const imageFile = formData.get("image") as File | null;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "IP 名称不能为空" }, { status: 400 });
    }

    let imagePath = existing.imagePath;

    if (imageFile && imageFile.size > 0) {
      // 删除旧图
      if (existing.imagePath) {
        const oldPath = path.join(process.cwd(), existing.imagePath);
        try { fs.unlinkSync(oldPath); } catch { /* ignore */ }
      }

      if (!fs.existsSync(IMAGES_DIR)) {
        fs.mkdirSync(IMAGES_DIR, { recursive: true });
      }

      const ext = imageFile.name.split(".").pop() || "png";
      const imageName = `${id}.${ext}`;
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      const newPath = path.join(IMAGES_DIR, imageName);
      fs.writeFileSync(newPath, buffer);
      imagePath = `/data/ips/images/${imageName}`;
    }

    const updated = {
      ...existing,
      name: name.trim(),
      description: description.trim(),
      imagePath,
      stylePrompt: stylePrompt.trim(),
      updatedAt: new Date().toISOString(),
    };

    saveIP(updated);

    return NextResponse.json({ success: true, ip: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = getIP(id);
  if (!ip) {
    return NextResponse.json({ error: "IP 不存在" }, { status: 404 });
  }

  // 清理图片文件
  if (ip.imagePath) {
    const imgPath = path.join(process.cwd(), ip.imagePath);
    try { fs.unlinkSync(imgPath); } catch { /* ignore */ }
  }

  deleteIP(id);

  return NextResponse.json({ success: true });
}
