import { NextRequest, NextResponse } from "next/server";
import { signToken, validatePassword } from "@/lib/auth";

const COOKIE_NAME = "wb_token";
const MAX_AGE = 7 * 24 * 60 * 60;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = formData.get("password") as string;

  if (!password || !validatePassword(password)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "1");
    return NextResponse.redirect(url);
  }

  const token = await signToken("admin");
  const url = new URL("/", request.url);
  const response = NextResponse.redirect(url);
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return response;
}
