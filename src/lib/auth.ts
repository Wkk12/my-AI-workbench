import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.ADMIN_PASSWORD || "change-me-please"
);

const COOKIE_NAME = "wb_token";
const MAX_AGE = 7 * 24 * 60 * 60; // 7 天

export interface TokenPayload {
  sub: string; // username
  iat: number;
}

/** 签发 JWT */
export async function signToken(username: string): Promise<string> {
  return new SignJWT({ sub: username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(SECRET);
}

/** 验证 JWT */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

/** 设置登录 cookie */
export async function setAuthCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    // 不设 secure——同时支持 HTTP（阿里云反代）和 HTTPS（Cloudflare Tunnel）
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** 清除登录 cookie */
export async function clearAuthCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/** 从请求中获取已验证的 token */
export async function getAuthFromCookie(): Promise<TokenPayload | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
  } catch {
    return null;
  }
}

/** 验证密码 */
export function validatePassword(password: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  return password === adminPassword;
}
