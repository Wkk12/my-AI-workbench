import { NextResponse } from "next/server";

export async function POST() {
  // 通知已由客户端 Service Worker 直接发送（自动适配 Mac/Windows）
  // 此接口仅用于服务端验证通道是否畅通
  return NextResponse.json({ 
    success: true,
    platform: process.platform,
    msg: "通知已通过浏览器原生通道发送"
  });
}
