import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * ספריית ה-DNA — מקובץ לפי ריפו.
 * ברירת מחדל קלה: בלי תוכן מלא (ראינו 692KB JSON לכל פתיחת לשונית) —
 * contentPreview לתצוגה + size למיון. תוכן מלא: ?full=1 או /api/dna-library/[id].
 */
const PREVIEW_CHARS = 400;

export async function GET(req: NextRequest) {
  const full = req.nextUrl.searchParams.get("full") === "1";
  try {
    const rows = await db.dnaArtifact.findMany({
      orderBy: [{ sourceRepo: "asc" }, { kind: "asc" }, { name: "asc" }],
      ...(full
        ? {}
        : { select: { id: true, sourceRepo: true, path: true, kind: true, name: true, description: true, rawUrl: true, size: true, content: true } }),
    });
    const items = full
      ? rows
      : rows.map((r) => ({
          ...r,
          content: null,
          contentPreview: (r.content ?? "").slice(0, PREVIEW_CHARS),
          hasContent: (r.content ?? "").length > 0,
        }));
    return NextResponse.json({ items, full });
  } catch {
    return NextResponse.json({ error: "טעינת ספריית ה-DNA נכשלה" }, { status: 500 });
  }
}

/** מחיקה: ?repo=owner/name לריפו בודד, או הכל בלי פרמטר */
export async function DELETE(req: NextRequest) {
  const repo = req.nextUrl.searchParams.get("repo");
  try {
    await db.dnaArtifact.deleteMany(repo ? { where: { sourceRepo: repo } } : undefined);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "המחיקה נכשלה" }, { status: 500 });
  }
}
