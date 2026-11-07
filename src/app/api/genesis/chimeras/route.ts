import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** היסטוריית כימרות שנוצרו */
export async function GET() {
  try {
    const rows = await db.chimera.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    return NextResponse.json({
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        sources: r.sources.split(",").filter(Boolean),
        skillMd: r.skillMd,
        principles: safeArr(r.principles),
        workOrders: safeArr(r.workOrders),
        breakthrough: r.breakthrough,
        createdAt: r.createdAt,
      })),
    });
  } catch {
    return NextResponse.json({ error: "טעינת הכימרות נכשלה" }, { status: 500 });
  }
}

function safeArr(s: string | null): unknown[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s) as unknown;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
