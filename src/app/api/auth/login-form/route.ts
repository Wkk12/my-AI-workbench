import { NextRequest, NextResponse } from "next/server";
import { signToken, validatePassword } from "@/lib/auth";

const COOKIE_NAME = "wb_token";
const MAX_AGE = 7 * 24 * 60 * 60;

export async function POST(request: NextRequest) {
  const body = await request.formData();
  const password = body.get("password") as string;

  if (!password || !validatePassword(password)) {
    return NextResponse.redirect(new URL("/login?error=1", request.url));
  }

  const token = await signToken("admin");
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
  return response;
}
