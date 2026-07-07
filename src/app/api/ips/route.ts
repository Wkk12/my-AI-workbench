import { NextRequest, NextResponse } from "next/server";
import { getAllIPs, saveIP } from "@/lib/data/ips";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { getSettings } from "@/lib/data/settings";

/**
 * IP 管理 API
 * GET  /api/ips        → 获取所有 IP
 * POST /api/ips        → 创建 IP（multipart/form-data）
 */

const IMAGES_DIR = path.join(process.cwd(), "data", "ips", "images");

function ensureImagesDir() {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
}

export async function GET() {
  const ips = getAllIPs();
  return NextResponse.json({ ips });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const name = formData.get("name") as string;
    const description = formData.get("description") as string || "";
    const stylePrompt = formData.get("stylePrompt") as string || "";
    const imageFile = formData.get("image") as File | null;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "IP 名称不能为空" }, { status: 400 });
    }

    const id = uuidv4();
    const ext = imageFile
      ? (imageFile.name.split(".").pop() || "png")
      : "png";
    const imageName = `${id}.${ext}`;

    ensureImagesDir();

    let imagePath = "";
    if (imageFile && imageFile.size > 0) {
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      imagePath = path.join(IMAGES_DIR, imageName);
      fs.writeFileSync(imagePath, buffer);
    }

    const now = new Date().toISOString();
    const ip = {
      id,
      name: name.trim(),
      description: description.trim(),
      imagePath: imagePath ? `/data/ips/images/${imageName}` : "",
      stylePrompt: stylePrompt.trim(),
      createdAt: now,
      updatedAt: now,
    };

    saveIP(ip);

    return NextResponse.json({ success: true, ip });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
