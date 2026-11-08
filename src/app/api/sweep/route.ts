import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseSweepRow, startSweep } from "@/lib/sweep-runner";

export const dynamic = "force-dynamic";

/** רשימת הסריקות האחרונות */
export async function GET() {
  try {
    const rows = await db.sweepRun.findMany({ orderBy: { id: "desc" }, take: 20 });
    const items = rows.map((r) => {
      const parsed = parseSweepRow(r);
      return {
        id: parsed.id,
        status: parsed.status,
        phase: parsed.phase,
        progress: parsed.progress,
        stats: parsed.stats,
        error: parsed.error,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
      };
    });
    const active = items.find((i) => i.status === "running") ?? null;
    return NextResponse.json({ items, active });
  } catch {
    return NextResponse.json({ error: "טעינת הסריקות נכשלה" }, { status: 500 });
  }
}

/** שגור סריקת עומק חדשה — מחזיר מיד, הריצה ברקע */
export async function POST(req: NextRequest) {
  try {
    const { id } = await startSweep(req);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    const msg = e instanceof Error ? e.message : "שגירת הסריקה נכשלה";
    return NextResponse.json({ error: msg }, { status });
  }
}
