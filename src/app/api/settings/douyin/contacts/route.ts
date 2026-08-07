import { NextRequest, NextResponse } from "next/server";
import { getAllContacts, saveContacts } from "@/lib/data/spark";
import { readFileSync, existsSync } from "fs";
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

/** PUT /api/settings/douyin/contacts — 同步联系人（从本地同步文件读取） */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const keepSelected = body.keepSelected;

  const syncFile = join(process.cwd(), "data", "douyin-contacts.json");
  
  if (!existsSync(syncFile)) {
    return NextResponse.json(
      { error: "尚未同步联系人。请在本地 Mac 运行: node scripts/sync-douyin-contacts.cjs" },
      { status: 500 }
    );
  }

  try {
    const syncData = JSON.parse(readFileSync(syncFile, "utf-8"));

    if (!syncData.contacts || syncData.contacts.length === 0) {
      return NextResponse.json({ error: "同步文件中没有联系人数据" }, { status: 500 });
    }

    let selectedNames: string[] = [];
    if (keepSelected) {
      const existing = await getAllContacts();
      selectedNames = existing.filter(c => c.selected).map(c => c.name);
    }

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
    return NextResponse.json(
      { error: "同步失败: " + (e.message || String(e)).slice(0, 300) },
      { status: 500 }
    );
  }
}
