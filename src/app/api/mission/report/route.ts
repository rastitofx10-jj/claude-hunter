import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { distillFieldReport, MissionError } from "@/lib/mission-compiler";
import { isTimeoutError, isPrismaNotFound } from "@/lib/ai-json";

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

/** סטטוס רק קדימה — דיווח שדה לא מדרג משימה שהגיעה כבר ל-done אחורה */
const STATUS_RANK: Record<string, number> = { compiled: 0, in_progress: 1, partial: 2, done: 3, failed: 1 };

/**
 * דיווח שדה — הלולאה המאבולוציונית:
 * דיווח ← זיקוק AI ללקחים ← לידת DNA חדש בספרייה (sourceRepo: field:mission-<id>)
 * כך כל משימה שמבוצעת מחכימה את הספרייה למשימות הבאות.
 * הדיווח עצמו תמיד נשמר — גם כשזיקוק ה-AI נכשל (fallback מקומי),
 * וגם כששמירת DNA נכשלת (הדיווח קודם ל-DNA — סדר שמירה שלא מאבד נתונים).
 */
export async function POST(req: NextRequest) {
  let missionId = 0;
  let outcome = "";
  let notes = "";
  try {
    const body = (await req.json()) as { missionId?: unknown; outcome?: unknown; notes?: unknown };
    // (בעבר: Number(null) === 0 עבר את הבדיקה ונחתך ל-404; כעת בדיקת טיפוס מפורשת → 400)
    missionId = typeof body.missionId === "number" ? body.missionId : Number.NaN;
    outcome = typeof body.outcome === "string" ? body.outcome.trim() : "";
    notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) : "";
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }
  if (!Number.isInteger(missionId) || missionId <= 0 || !["success", "partial", "failed"].includes(outcome)) {
    return NextResponse.json({ error: "נדרש מזהה משימה ותוצאה (success | partial | failed)" }, { status: 400 });
  }

  try {
    const mission = await db.mission.findUnique({ where: { id: missionId } });
    if (!mission) return NextResponse.json({ error: "המשימה לא נמצאה" }, { status: 404 });

    let phaseTitles: string[] = [];
    try {
      const planRaw: unknown = JSON.parse(mission.plan);
      const plan = planRaw && typeof planRaw === "object" ? (planRaw as { phases?: unknown }) : {};
      phaseTitles = Array.isArray(plan.phases)
        ? plan.phases
            .filter((p): p is { title?: unknown } => typeof p === "object" && p !== null)
            .map((p) => (typeof p.title === "string" ? p.title : ""))
            .filter(Boolean)
        : [];
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

    // ---- סדר שמירה מתוקן: קודם הדיווח (הנתון היקר), רק אחר כך DNA חדש ----
    // (בעבר: upsert DNA לפני mission.update — כשל upsert/P2002 זרק 500 והשליך
    // את כל תוצאות הזיקוק שכבר הושגו)

    // סטטוס רק קדימה — דיווח failed על משימה במצב done לא מדרג אותה אחורה
    const nextStatus = OUTCOME_STATUS[outcome] ?? mission.status;
    const finalStatus =
      (STATUS_RANK[nextStatus] ?? 0) >= (STATUS_RANK[mission.status] ?? 0) ? nextStatus : mission.status;

    // היסטוריית דיווחים — דיווח חוזר מוסיף רשומה במקום לדרוס את הקודם
    // (בעבר: report חדש דרס לחלוטין את הישן — לקחים נאבדו)
    let reportHistory: Array<Record<string, unknown>> = [];
    try {
      const prev: unknown = mission.report ? JSON.parse(mission.report) : null;
      if (Array.isArray(prev)) {
        reportHistory = prev.filter(
          (x): x is Record<string, unknown> => typeof x === "object" && x !== null
        );
      } else if (prev && typeof prev === "object") {
        // מעבר מפורמט-אובייקט יחיד להיסטוריה — הישן הופך לרשומה הראשונה
        reportHistory = [prev as Record<string, unknown>];
      }
    } catch {
      reportHistory = [];
    }

    // לידת DNA מהשדה — הלקח הופך יכולת ניידת בספרייה (רק מזיקוק אמיתי).
    // DNA אחד למשימה בלבד: נתיב קבוע `field/lesson/SKILL.md` מונע התפצלות
    // ארטיפקטים כשה-AI נותן שמות שונים לאותו לקח בדיווחים חוזרים
    // (בעבר: השם מה-AI בנתיב → דיווחים חוזרים יצרו מספר DNA לאותה משימה).
    let bornDnaId: number | null = null;
    if (distilled.newDna) {
      const desc = distilled.newDna.description;
      const content = distilled.newDna.content;
      try {
        const created = await db.dnaArtifact.upsert({
          where: {
            sourceRepo_path: {
              sourceRepo: `field:mission-${missionId}`,
              path: "field/lesson/SKILL.md",
            },
          },
          update: {
            description: desc,
            content,
            size: content.length,
          },
          create: {
            sourceRepo: `field:mission-${missionId}`,
            path: "field/lesson/SKILL.md",
            kind: "skill",
            name: distilled.newDna.name || "field-lesson",
            description: desc,
            content,
            size: content.length,
          },
        });
        bornDnaId = created.id;
      } catch (dnaErr) {
        // כשל שמירת DNA לא מאבד את הדיווח — רק מדלג על הלידה
        console.error("[mission/report] DNA birth failed (report still saved):", dnaErr);
      }
    }

    const newReport = {
      outcome,
      notes: notes || null,
      verdict: distilled.verdict,
      lessons: distilled.lessons,
      bornDnaId,
      distillMethod,
      reportedAt: new Date().toISOString(),
    };
    const finalReportJson = JSON.stringify([...reportHistory, newReport].slice(-20));

    await db.mission.update({
      where: { id: missionId },
      data: { status: finalStatus, report: finalReportJson },
    });

    return NextResponse.json({
      ok: true,
      distillMethod,
      verdict: distilled.verdict,
      lessons: distilled.lessons,
      bornDna: distilled.newDna ? { id: bornDnaId, name: distilled.newDna.name, description: distilled.newDna.description } : null,
    });
  } catch (e) {
    if (isPrismaNotFound(e)) {
      return NextResponse.json({ error: "המשימה לא נמצאה" }, { status: 404 });
    }
    // (בעבר: e.message גולמי דלף ללקוח; כעת לוג מלא בשרת + הודעה גנרית)
    console.error("[mission/report]", e);
    return NextResponse.json({ error: "זיקוק הדיווח נכשל" }, { status: 500 });
  }
}
