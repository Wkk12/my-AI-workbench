import { NextRequest, NextResponse } from "next/server";
import { signToken, setAuthCookie, validatePassword } from "@/lib/auth";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 分钟
const attempts = new Map<string, { count: number; lockUntil: number }>();

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const record = attempts.get(ip);

  // 锁定检查
  if (record && record.lockUntil > Date.now()) {
    const remaining = Math.ceil((record.lockUntil - Date.now()) / 60000);
    return NextResponse.json(
      { error: `登录尝试次数过多，请 ${remaining} 分钟后重试` },
      { status: 429 }
    );
  }

  try {
    const { password } = await request.json();
    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "请输入密码" }, { status: 400 });
    }

    if (validatePassword(password)) {
      // 登录成功，清除尝试记录
      attempts.delete(ip);

      const token = await signToken("admin");
      await setAuthCookie(token);

      return NextResponse.json({ success: true, redirect: "/" });
    }

    // 登录失败，记录尝试
    const now = Date.now();
    const current = record || { count: 0, lockUntil: 0 };
    const count = current.lockUntil > now ? MAX_ATTEMPTS : current.count + 1;
    const lockUntil = count >= MAX_ATTEMPTS ? now + LOCKOUT_MS : 0;

    attempts.set(ip, { count, lockUntil });

    return NextResponse.json(
      { error: `密码错误${count >= 2 ? ` (${count}/${MAX_ATTEMPTS})` : ""}` },
      { status: 401 }
    );
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
}

// 定期清理锁定记录（每 30 分钟）
setInterval(() => {
  const now = Date.now();
  for (const [ip, r] of attempts) {
    if (r.lockUntil < now && r.count > 0) {
      attempts.delete(ip);
    }
  }
}, 30 * 60 * 1000);
