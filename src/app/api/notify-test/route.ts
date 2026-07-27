import { NextResponse } from "next/server";

export async function POST() {
  try {
    const fs = require("fs");
    const path = require("path");
    const { execSync } = require("child_process");
    const os = require("os");

    const title = "🧪 测试通知";
    const body = "工作台桌面通知正常！";

    if (process.platform === "darwin") {
      // macOS: osascript 直弹
      execSync(
        `osascript -e 'display alert "${body}" as critical message title "${title}" buttons {"知道了"} default button "知道了" giving up after 300'`,
        { timeout: 5000, stdio: "pipe" }
      );
      console.log("[notify-test] macOS 通知已弹");
    } else if (process.platform === "win32") {
      // Windows: 写文件让心跳代理弹（OpenClaw 有 GUI 权限）
      const home = os.homedir();
      const dir = path.join(home, ".openclaw", "workspace", "sweetkiki");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "mac_notify.txt"),
        JSON.stringify({ title, body, time: new Date().toISOString() }),
        "utf-8"
      );
      console.log("[notify-test] Windows 通知已写入文件");
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
