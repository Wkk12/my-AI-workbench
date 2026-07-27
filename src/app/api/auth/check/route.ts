import { NextResponse } from "next/server";
import { getAuthFromCookie } from "@/lib/auth";

export async function GET() {
  const payload = await getAuthFromCookie();
  if (!payload) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, user: payload.sub });
}
