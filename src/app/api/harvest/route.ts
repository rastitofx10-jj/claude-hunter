import { NextRequest, NextResponse } from "next/server";
import { harvest } from "@/lib/harvester";
import { captureTokenFrom, resolveToken } from "@/lib/server-token";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** נעילת קציר: קציר הוא צינור ארוך (עד 300 שניות) — שני POST מקביליים
 * היו מכפילים שריפת מכסה ומנים במקביל את אותם ריפו (בעבר: בלי שום נעילה) */
let harvestRunning = false;

/** קציר אוטונומי: גילוי מאגרי אליטה 5.5+ ← כריית DNA ← הספרייה מתפוצצת */
export async function POST(req: NextRequest) {
  if (harvestRunning) {
    return NextResponse.json({ error: "קציר כבר רץ כרגע — חכה לסיומו" }, { status: 409 });
  }
  harvestRunning = true;
  let maxRepos = 6;
  try {
    const body = (await req.json()) as { maxRepos?: unknown };
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
    // (בעבר: e.message גולמי דלף ללקוח)
    console.error("[harvest]", e);
    return NextResponse.json({ error: "הקציר האוטונומי נכשל — יתכן שמכסת GitHub/AI מוגבלת כרגע" }, { status: 500 });
  } finally {
    harvestRunning = false;
  }
}
