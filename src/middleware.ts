import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.ADMIN_PASSWORD || "change-me-please"
);

const COOKIE_NAME = "wb_token";

/** 无需认证的路径前缀 */
const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/images/",
  "/api/ips/image/",
  "/api/tunnel",
  "/api/notify-test",
  "/login",
  "/_next/",
  "/favicon.ico",
];

/** 公开的静态资源扩展名 */
const PUBLIC_EXTS = [
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
  ".css", ".js", ".woff", ".woff2", ".ttf",
];

function isPublicPath(pathname: string): boolean {
  // 精确匹配 /login
  if (pathname === "/login") return true;

  // 检查公开前缀
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }

  // 检查静态资源扩展名
  for (const ext of PUBLIC_EXTS) {
    if (pathname.endsWith(ext)) return true;
  }

  return false;
}

/** 速率限制：简易令牌桶（内存） */
const RATE_LIMIT = new Map<string, { tokens: number; lastRefill: number }>();
const RATE_MAX = 120;    // 每分钟最多请求数（双平台轮询需要更多）
const RATE_WINDOW = 60000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = RATE_LIMIT.get(ip);

  if (!bucket) {
    RATE_LIMIT.set(ip, { tokens: RATE_MAX - 1, lastRefill: now });
    return true;
  }

  const elapsed = now - bucket.lastRefill;
  const refill = Math.floor(elapsed / (RATE_WINDOW / RATE_MAX));
  bucket.tokens = Math.min(RATE_MAX, bucket.tokens + refill);
  bucket.lastRefill = now;

  if (bucket.tokens <= 0) return false;

  bucket.tokens--;
  return true;
}

// 定期清理
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW * 2;
  for (const [ip, b] of RATE_LIMIT) {
    if (b.lastRefill < cutoff) RATE_LIMIT.delete(ip);
  }
}, RATE_WINDOW * 2);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // 对所有 HTML 页面添加防缓存头（微信 WebView 会激进缓存）
  if (!pathname.startsWith("/api/") && !pathname.startsWith("/_next/")) {
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }

  // 公开路径放行
  if (isPublicPath(pathname)) {
    return response;
  }

  // 内部心跳（localhost）放行所有调度器内部 API
  const host = request.headers.get("host") || "";
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("::1")) {
    if (
      pathname === "/api/scheduler/run" ||
      pathname.startsWith("/api/publish") ||
      pathname.startsWith("/api/settings/") ||
      pathname.startsWith("/api/execute") ||
      pathname.startsWith("/api/daily-report") ||
      pathname.startsWith("/api/ai/") ||
      pathname.startsWith("/api/scheduler")
    ) {
      return response;
    }
  }

  // 速率限制（仅 API 路由）
  if (pathname.startsWith("/api/")) {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "请求过于频繁，请稍后再试" },
        { status: 429 }
      );
    }
  }

  // 验证登录态
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    // API 请求返回 JSON，页面请求重定向到登录页
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    await jwtVerify(token, SECRET);

    // 添加安全头
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:; font-src 'self'"
    );

    return response;
  } catch {
    // token 无效/过期
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "登录已过期" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    const resp = NextResponse.redirect(loginUrl);
    resp.cookies.delete(COOKIE_NAME);
    return resp;
  }
}

export const config = {
  matcher: [
    // 匹配所有路径，除了静态资源和 Next.js 内部路径
    "/((?!_next/static|_next/image|favicon.ico|data/images).*)",
  ],
};
