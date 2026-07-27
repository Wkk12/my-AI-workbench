import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const URL_FILE = join(process.cwd(), "data", "tunnel-url.txt");

export async function GET() {
  try {
    if (!existsSync(URL_FILE)) {
      return NextResponse.json({ url: null });
    }
    const url = readFileSync(URL_FILE, "utf-8").trim();
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ url: null });
  }
}
