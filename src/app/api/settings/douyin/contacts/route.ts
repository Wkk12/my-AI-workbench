import { NextRequest, NextResponse } from "next/server";
import { getAllContacts, saveContacts } from "@/lib/data/spark";
import { exec } from "child_process";
import { promisify } from "util";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const execAsync = promisify(exec);

/** GET /api/settings/douyin/contacts — 获取所有联系人 */
export async function GET() {
  const contacts = await getAllContacts();
  return NextResponse.json({ contacts });
}

/** POST /api/settings/douyin/contacts — 批量保存联系人 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const contacts = body.contacts;
  if (!Array.isArray(contacts)) {
    return NextResponse.json({ error: "contacts 必须是数组" }, { status: 400 });
  }
  await saveContacts(contacts);
  return NextResponse.json({ success: true, count: contacts.length });
}

/** PATCH /api/settings/douyin/contacts — 更新单个联系人 */
export async function PATCH(req: NextRequest) {
  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  // 使用动态导入避免循环依赖
  const { updateContact } = await import("@/lib/data/spark");
  await updateContact(id, data);
  return NextResponse.json({ success: true });
}

/** DELETE /api/settings/douyin/contacts — 删除联系人 */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const { deleteContact } = await import("@/lib/data/spark");
  await deleteContact(id);
  return NextResponse.json({ success: true });
}

/** PUT /api/settings/douyin/contacts — 同步联系人（从抖音获取） */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const keepSelected = body.keepSelected;

  // 检查 browser-act 是否可用
  const nodePath = process.platform === "win32"
    ? "C:\\Program Files\\nodejs\\node.exe"
    : "node";
  const scriptPath = join(process.cwd(), "scripts", "sync-douyin-contacts.cjs");

  if (!existsSync(scriptPath)) {
    return NextResponse.json(
      { error: "同步脚本不存在，请确保项目代码完整" },
      { status: 500 }
    );
  }

  try {
    // 异步执行同步脚本（不阻塞事件循环）
    const { stdout } = await execAsync(`"${nodePath}" "${scriptPath}"`, {
      cwd: process.cwd(),
      encoding: "utf-8",
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    console.log("Sync output:", stdout);

    // 读取同步结果
    const syncFile = join(process.cwd(), "data", "douyin-contacts.json");
    if (!existsSync(syncFile)) {
      return NextResponse.json(
        { error: "同步未生成结果文件。请确认 browser-act 已安装且 dy_monitor 会话已登录抖音" },
        { status: 500 }
      );
    }

    const syncData = JSON.parse(readFileSync(syncFile, "utf-8"));

    if (!syncData.contacts || syncData.contacts.length === 0) {
      return NextResponse.json({ error: "未发现联系人，请确认抖音已登录并有私信记录" }, { status: 500 });
    }

    // 如果保留勾选状态，先获取当前的联系人状态
    let selectedNames: string[] = [];
    if (keepSelected) {
      const existing = await getAllContacts();
      selectedNames = existing.filter(c => c.selected).map(c => c.name);
    }

    // 构造联系人列表
    const contacts = syncData.contacts.map((c: { name: string }, i: number) => ({
      name: c.name,
      douyinId: "",
      avatar: "",
      selected: keepSelected ? selectedNames.includes(c.name) : false,
      sortOrder: i,
    }));

    await saveContacts(contacts);

    return NextResponse.json({
      success: true,
      count: contacts.length,
      syncedAt: syncData.syncedAt,
    });
  } catch (e: any) {
    const errMsg = e.stderr || e.message || String(e);
    console.error("Sync failed:", errMsg);
    
    // 友好的错误提示
    const friendlyMsg = errMsg.includes("browser-act")
      ? "同步失败：browser-act 未安装或 dy_monitor 会话不可用。请在本地 Mac 上运行同步。"
      : `同步失败: ${errMsg.slice(0, 200)}`;
    
    return NextResponse.json({ error: friendlyMsg }, { status: 500 });
  }
}
