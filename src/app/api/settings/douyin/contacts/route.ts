import { NextRequest, NextResponse } from "next/server";
import { getAllContacts, saveContacts, updateContact, deleteContact } from "@/lib/data/spark";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

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
  await updateContact(id, data);
  return NextResponse.json({ success: true });
}

/** DELETE /api/settings/douyin/contacts — 删除联系人 */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  await deleteContact(id);
  return NextResponse.json({ success: true });
}

/** PUT /api/settings/douyin/contacts — 同步联系人（从抖音获取并覆盖） */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const keepSelected = body.keepSelected; // 是否保留之前的勾选状态

  try {
    // 运行同步脚本
    const output = execSync("node scripts/sync-douyin-contacts.cjs", {
      cwd: join(process.cwd()),
      encoding: "utf-8",
      timeout: 120_000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    console.log("Sync output:", output);

    // 读取同步结果
    const syncFile = join(process.cwd(), "data", "douyin-contacts.json");
    const syncData = JSON.parse(readFileSync(syncFile, "utf-8"));

    if (!syncData.contacts || syncData.contacts.length === 0) {
      return NextResponse.json({ error: "未发现联系人" }, { status: 500 });
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
      output,
    });
  } catch (e: any) {
    console.error("Sync failed:", e);
    return NextResponse.json(
      { error: "同步失败: " + (e.message || String(e)).slice(0, 300) },
      { status: 500 }
    );
  }
}
