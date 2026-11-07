// ============================================================
// מנוע הטייס האוטומטי — ביצוע שלב-אחר-שלב עם שמירה מצטברת.
// למה צעד-צעד ולא בקשה אחת גדולה? ראיות:
// 1. בקשה מלאה = עד 4×110 שניות עיוורות; הלקוח/שער עלולים לנתק — והתוצר אובד.
// 2. שמירה אחרי כל שלב = ריסטרט דפדפן לא מפיל את הריצה; ממשיכים מהשלב הבא.
// 3. הלקוח רואה התקדמות אמיתית פר-שלב במקום spinner של 3 דקות.
// מקור לוגיקה יחיד — משמש גם את endpoint הצעד וגם את הריצה המלאה ההיסטורית.
// פועל בצד שרת בלבד.
// ============================================================

import { db } from "@/lib/db";
import { safeJsonParse } from "./ai-json";
import { executePhase, extractHandoff, type AutopilotStep, type MissionPhase } from "./mission-compiler";

export interface AutopilotFailure {
  phaseIndex: number;
  error: string;
}

export interface AutopilotState {
  steps: AutopilotStep[];
  failures: AutopilotFailure[];
}

export interface NextPhaseResult {
  done: boolean; // כל השלבים בוצעו (או נכשלו)
  allDone: boolean; // אין עוד שלב ממתין
  executed: AutopilotStep | null;
  failure: AutopilotFailure | null;
  stepsDone: number;
  totalPhases: number;
  state: AutopilotState;
}

/** טעינת מצב טייס סלחנית — תומך גם בפורמט ההיסטורי (failures כמחרוזות) */
export function parseAutopilotState(raw: string | null): AutopilotState {
  const parsed = safeJsonParse<{ steps?: AutopilotStep[]; failures?: (AutopilotFailure | string)[] }>(raw, {});
  const steps = Array.isArray(parsed.steps) ? parsed.steps.filter((s) => s && typeof s.phaseIndex === "number") : [];
  const failures = (Array.isArray(parsed.failures) ? parsed.failures : [])
    .map((f) => {
      if (typeof f === "string") {
        // פורמט היסטורי: "שלב 2 (כותרת): הודעה"
        const m = f.match(/שלב (\d+)/);
        return { phaseIndex: m ? Number(m[1]) - 1 : -1, error: f };
      }
      return f && typeof f.phaseIndex === "number" ? { phaseIndex: f.phaseIndex, error: String(f.error ?? "שגיאה") } : null;
    })
    .filter((f): f is AutopilotFailure => !!f);
  return { steps, failures };
}

export class AutopilotError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "AutopilotError";
    this.status = status;
  }
}

/**
 * הרצת השלב הבא שטרם בוצע במשימה + שמירה מיידית של התוצאה.
 * מחזיר מה בוצע (או איזה שלב נכשל), ואת המצב המלא אחרי השלב.
 */
export async function runNextAutopilotPhase(missionId: number): Promise<NextPhaseResult> {
  const mission = await db.mission.findUnique({ where: { id: missionId } });
  if (!mission) throw new AutopilotError("המשימה לא נמצאה", 404);

  const plan = safeJsonParse<{ phases?: MissionPhase[] }>(mission.plan, {});
  const phases = (plan.phases ?? []).filter((p) => p && typeof p.title === "string");
  if (phases.length === 0) throw new AutopilotError("למשימה אין שלבים לביצוע", 400);

  const state = parseAutopilotState(mission.autopilot);
  const executedIdx = new Set(state.steps.map((s) => s.phaseIndex));
  const failedIdx = new Set(state.failures.map((f) => f.phaseIndex));
  const nextIdx = phases.findIndex((_, i) => !executedIdx.has(i) && !failedIdx.has(i));

  if (nextIdx === -1) {
    // הכל בוצע — נוודא שהסטטוס משקף (נשאר in_progress עד דיווח שדה)
    return {
      done: true,
      allDone: true,
      executed: null,
      failure: null,
      stepsDone: state.steps.length,
      totalPhases: phases.length,
      state,
    };
  }

  // ה-DNA שנבחר בהידור — תוכן מלא לביצוע
  const dnaRefs = safeJsonParse<{ id: number }[]>(mission.dnaRefs, []);
  const ids = dnaRefs.map((d) => d.id).filter((n) => Number.isInteger(n));
  const dnaRows = ids.length
    ? await db.dnaArtifact.findMany({
        where: { id: { in: ids } },
        select: { id: true, sourceRepo: true, path: true, kind: true, name: true, description: true, content: true },
      })
    : [];

  // שרשור Handoffs מהשלבים שכבר בוצעו — בסדר שלב אמיתי
  const priorOutputs = state.steps
    .slice()
    .sort((a, b) => a.phaseIndex - b.phaseIndex)
    .map((s) => ({ title: s.title, handoff: extractHandoff(s.deliverable) }));

  if (mission.status === "compiled") {
    await db.mission.update({ where: { id: missionId }, data: { status: "in_progress" } });
  }

  const phase = phases[nextIdx];
  let executed: AutopilotStep | null = null;
  let failResult: AutopilotFailure | null = null;

  try {
    const deliverable = await executePhase({
      goal: mission.goal,
      phase,
      phaseIndex: nextIdx,
      priorOutputs,
      dna: dnaRows,
    });
    executed = { phaseIndex: nextIdx, title: phase.title, deliverable, executedAt: new Date().toISOString() };
  } catch (e) {
    failResult = { phaseIndex: nextIdx, error: e instanceof Error ? e.message : "שגיאה לא ידועה" };
  }

  const newState: AutopilotState = {
    steps: executed ? [...state.steps, executed] : state.steps,
    failures: failResult ? [...state.failures, failResult] : state.failures,
  };

  // האם אחרי השלב הזה אין יותר שלבים ממתינים?
  const nowExecuted = new Set(newState.steps.map((s) => s.phaseIndex));
  const nowFailed = new Set(newState.failures.map((f) => f.phaseIndex));
  const allDone = phases.every((_, i) => nowExecuted.has(i) || nowFailed.has(i));

  // סטטוס: כשלים מלאים = failed; אחרת נשאר in_progress עד דיווח השדה
  const status =
    allDone && newState.steps.length === 0 && newState.failures.length > 0 ? "failed" : "in_progress";

  await db.mission.update({
    where: { id: missionId },
    data: { autopilot: JSON.stringify(newState), autopilotAt: new Date(), status },
  });

  return {
    done: false,
    allDone,
    executed,
    failure: failResult,
    stepsDone: newState.steps.length,
    totalPhases: phases.length,
    state: newState,
  };
}
