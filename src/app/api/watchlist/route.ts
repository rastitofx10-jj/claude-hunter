import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface WatchBody {
  fullName: string;
  owner: string;
  name: string;
  url: string;
  description?: string | null;
  stars?: number;
  score?: number;
  models?: string | null;
  evidence?: string | null;
  notes?: string | null;
}

export async function GET() {
  try {
    const items = await db.savedRepo.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ items });
  } catch (e) {
    console.error("watchlist GET failed", e);
    return NextResponse.json({ error: "טעינת הרשימה נכשלה" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as WatchBody;
    if (!b.fullName || !b.owner || !b.name || !b.url) {
      return NextResponse.json({ error: "חסרים שדות חובה (fullName/owner/name/url)" }, { status: 400 });
    }
    const item = await db.savedRepo.upsert({
      where: { fullName: b.fullName },
      update: {
        stars: b.stars ?? 0,
        score: b.score ?? 0,
        description: b.description ?? null,
        models: b.models ?? null,
        evidence: b.evidence ?? null,
      },
      create: {
        fullName: b.fullName,
        owner: b.owner,
        name: b.name,
        url: b.url,
        description: b.description ?? null,
        stars: b.stars ?? 0,
        score: b.score ?? 0,
        models: b.models ?? null,
        evidence: b.evidence ?? null,
        notes: b.notes ?? null,
      },
    });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("watchlist POST failed", e);
    return NextResponse.json({ error: "השמירה נכשלה" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "נדרש id תקין" }, { status: 400 });
    }
    await db.savedRepo.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "המחיקה נכשלה (יתכן שהפריט לא קיים)" }, { status: 400 });
  }
}
