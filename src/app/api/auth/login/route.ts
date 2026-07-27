import { NextRequest, NextResponse } from "next/server";
import { signToken, setAuthCookie, validatePassword } from "@/lib/auth";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; lockUntil: number }>();

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const record = attempts.get(ip);

  if (record && record.lockUntil > Date.now()) {
    const remaining = Math.ceil((record.lockUntil - Date.now()) / 60000);
    return NextResponse.json(
      { error: `登录尝试次数过多，请 ${remaining} 分钟后重试` },
      { status: 429 }
    );
  }

  try {
    let password: string;
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/x-www-form-urlencoded")) {
      const fd = await request.formData();
      password = (fd.get("password") as string) || "";
    } else {
      const body = await request.json();
      password = body.password || "";
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "请输入密码" }, { status: 400 });
    }

    if (validatePassword(password)) {
      attempts.delete(ip);
      const token = await signToken("admin");

      // 浏览器表单提交 → 302 跳转
      if (ct.includes("application/x-www-form-urlencoded")) {
        const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "39.96.82.43";
        const proto = request.headers.get("x-forwarded-proto") || "http";
        const res = NextResponse.redirect(new URL(proto + "://" + host + "/"));
        res.cookies.set("wb_token", token, {
          httpOnly: true, secure: false, sameSite: "lax", path: "/",
          maxAge: 7 * 24 * 60 * 60,
        });
        return res;
      }

      // JS fetch → 返回 JSON
      await setAuthCookie(token);
      return NextResponse.json({ success: true, redirect: "/" });
    }

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

setInterval(() => {
  const now = Date.now();
  for (const [ip, r] of attempts) {
    if (r.lockUntil < now && r.count > 0) attempts.delete(ip);
  }
}, 30 * 60 * 1000);
