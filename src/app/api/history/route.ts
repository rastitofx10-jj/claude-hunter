import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await db.searchHistory.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return NextResponse.json({ items });
  } catch (e) {
    console.error("history GET failed", e);
    return NextResponse.json({ error: "טעינת ההיסטוריה נכשלה" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (id === "all") {
      await db.searchHistory.deleteMany({});
      return NextResponse.json({ ok: true });
    }
    const num = Number(id);
    if (!Number.isFinite(num) || num <= 0) {
      return NextResponse.json({ error: "נדרש id תקין או id=all" }, { status: 400 });
    }
    await db.searchHistory.delete({ where: { id: num } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "המחיקה נכשלה" }, { status: 400 });
  }
}
