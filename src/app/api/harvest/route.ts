import { NextRequest, NextResponse } from "next/server";
import { harvest } from "@/lib/harvester";
import { captureTokenFrom, resolveToken } from "@/lib/server-token";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** קציר אוטונומי: גילוי מאגרי אליטה 5.5+ ← כריית DNA ← הספרייה מתפוצצת */
export async function POST(req: NextRequest) {
  let maxRepos = 6;
  try {
    const body = (await req.json()) as { maxRepos?: number };
    if (typeof body.maxRepos === "number") {
      maxRepos = Math.max(1, Math.min(10, Math.floor(body.maxRepos)));
    }
  } catch {
    // גוף ריק מותר — ברירת מחדל 6
  }

  try {
    const token = await resolveToken(req);
    const result = await harvest(token, maxRepos);
    await captureTokenFrom(req);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "הקציר האוטונומי נכשל";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
