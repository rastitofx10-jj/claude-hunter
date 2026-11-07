import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** פירוט ארטיפקט בודד כולל התוכן המלא — נקרא רק בעת הצגה מורחבת (on demand) */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) {
    return NextResponse.json({ error: "מזהה לא תקין" }, { status: 400 });
  }
  try {
    const row = await db.dnaArtifact.findUnique({ where: { id: numId } });
    if (!row) return NextResponse.json({ error: "הארטיפקט לא נמצא" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "טעינת הארטיפקט נכשלה" }, { status: 500 });
  }
}
