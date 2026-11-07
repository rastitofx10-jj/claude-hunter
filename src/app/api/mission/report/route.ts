import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { distillFieldReport, MissionError } from "@/lib/mission-compiler";
import { isTimeoutError } from "@/lib/ai-json";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const OUTCOME_STATUS: Record<string, string> = {
  success: "done",
  partial: "partial",
  failed: "failed",
};

/**
 * מזקק מקומי (בלי AI) — רשת ביטחון קריטית:
 * הדיווח מהשדה הוא נתון יקר שנאסף מהעבודה האמיתית. בעבר, כשיחת ה-AI נפלה
 * (timeout/רשת) — כל הדיווח הושלך עם 500. עכשיו הלולאה תמיד נשמרת,
 * עם לקחים היוריסטיים עד שזיקוק AI יוכל לרוץ שוב.
 */
function localDistill(input: { outcome: string; notes: string }) {
  const outcomeHeb =
    input.outcome === "success" ? "הצלחה מלאה" : input.outcome === "partial" ? "הצלחה חלקית" : "כישלון";
  const lessons: string[] = [];
  // פיצול הערות למשפטים — כל משפט מועמד ללקח
  for (const s of input.notes.split(/[\n.!?]+|\.\s/)) {
    const t = s.trim();
    if (t.length >= 12) lessons.push(t);
    if (lessons.length >= 5) break;
  }
  if (lessons.length === 0) {
    lessons.push(
      input.outcome === "failed"
        ? "כישלון הוא נתון: לתעד איפה בדיוק נתקע ולחלק את השלב הנכשל לצעדים קטנים יותר בפעם הבאה"
        : "לתעד אילו שלבים עברו אימות בקלות — הם המועמדים לשימוש חוזר כ-DNA במשימות הבאות"
    );
  }
  return {
    verdict: `דיווח שדה (${outcomeHeb}) נשמר — זיקוק AI לא זמין כרגע, הלקחים חולצו מקומית מההערות`,
    lessons,
    newDna: null,
  };
}

/**
 * דיווח שדה — הלולאה המאבולוציונית:
 * דיווח ← זיקוק AI ללקחים ← לידת DNA חדש בספרייה (sourceRepo: field:mission-<id>)
 * כך כל משימה שמבוצעת מחכימה את הספרייה למשימות הבאות.
 * הדיווח עצמו תמיד נשמר — גם כשזיקוק ה-AI נכשל (fallback מקומי).
 */
export async function POST(req: NextRequest) {
  let missionId = 0;
  let outcome = "";
  let notes = "";
  try {
    const body = (await req.json()) as { missionId?: number; outcome?: string; notes?: string };
    missionId = Number(body.missionId);
    outcome = (body.outcome ?? "").trim();
    notes = (body.notes ?? "").trim().slice(0, 4000);
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }
  if (!Number.isInteger(missionId) || !["success", "partial", "failed"].includes(outcome)) {
    return NextResponse.json({ error: "נדרש מזהה משימה ותוצאה (success | partial | failed)" }, { status: 400 });
  }

  try {
    const mission = await db.mission.findUnique({ where: { id: missionId } });
    if (!mission) return NextResponse.json({ error: "המשימה לא נמצאה" }, { status: 404 });

    let phaseTitles: string[] = [];
    try {
      const plan = JSON.parse(mission.plan) as { phases?: { title: string }[] };
      phaseTitles = (plan.phases ?? []).map((p) => p.title).filter(Boolean);
    } catch {
      phaseTitles = [];
    }

    // זיקוק AI עם נפילה מבוקרת למקומי — הדיווח לא נזרק לעולם
    let distilled: Awaited<ReturnType<typeof distillFieldReport>>;
    let distillMethod: "ai" | "local" = "ai";
    try {
      distilled = await distillFieldReport({
        goal: mission.goal,
        phaseTitles,
        outcome,
        notes,
      });
    } catch (distillErr) {
      // timeout לא מנוסה שוב בפנים; כאן זה כבר סופי — שומרים מקומית
      if (!(distillErr instanceof MissionError) && !isTimeoutError(distillErr) && distillErr instanceof Error) {
        // שגיאה לא צפויה — לוג לשרת, אבל עדיין שומרים את הדיווח
        console.error("[mission/report] distill failed unexpectedly:", distillErr.message);
      }
      distilled = localDistill({ outcome, notes });
      distillMethod = "local";
    }

    // לידת DNA מהשדה — הלקח הופך יכולת ניידת בספרייה (רק מזיקוק אמיתי)
    let bornDnaId: number | null = null;
    if (distilled.newDna) {
      const safeName = distilled.newDna.name
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "field-lesson";
      const created = await db.dnaArtifact.upsert({
        where: { sourceRepo_path: { sourceRepo: `field:mission-${missionId}`, path: `field/${safeName}/SKILL.md` } },
        update: {
          name: safeName,
          description: distilled.newDna.description,
          content: distilled.newDna.content,
          size: distilled.newDna.content.length,
        },
        create: {
          sourceRepo: `field:mission-${missionId}`,
          path: `field/${safeName}/SKILL.md`,
          kind: "skill",
          name: safeName,
          description: distilled.newDna.description,
          content: distilled.newDna.content,
          size: distilled.newDna.content.length,
        },
      });
      bornDnaId = created.id;
    }

    const reportJson = JSON.stringify({
      outcome,
      notes: notes || null,
      verdict: distilled.verdict,
      lessons: distilled.lessons,
      bornDnaId,
      distillMethod,
      reportedAt: new Date().toISOString(),
    });

    await db.mission.update({
      where: { id: missionId },
      data: { status: OUTCOME_STATUS[outcome] ?? mission.status, report: reportJson },
    });

    return NextResponse.json({
      ok: true,
      distillMethod,
      verdict: distilled.verdict,
      lessons: distilled.lessons,
      bornDna: distilled.newDna ? { id: bornDnaId, name: distilled.newDna.name, description: distilled.newDna.description } : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "זיקוק הדיווח נכשל";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
