import { NextRequest, NextResponse } from "next/server";
import { runNextAutopilotPhase, AutopilotError } from "@/lib/autopilot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_PHASES_PER_RUN = 4;

/**
 * ריצה מלאה (תאימות לאחור): מריצה שלב-אחר-שלב דרך אותו מנוע בדיוק
 * (runNextAutopilotPhase) עם חסם שלבים לריצה בודדת.
 * ההעדפה בממשק היא ריצת-צעד של הלקוח — כאן נשארת ריצה רציפה לשימוש ידני/אוטומציה.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) {
    return NextResponse.json({ error: "מזהה לא תקין" }, { status: 400 });
  }

  try {
    const steps: NonNullable<Awaited<ReturnType<typeof runNextAutopilotPhase>>["executed"]>[] = [];
    const failures: { phaseIndex: number; error: string }[] = [];
    let totalPhases = 0;
    let firstRun = true;

    // לולאה על אותו מנוע צעד-צעד — עד שאין עוד שלבים
    for (;;) {
      if (steps.length + failures.length >= MAX_PHASES_PER_RUN) break;
      const r = await runNextAutopilotPhase(numId);
      totalPhases = r.totalPhases;
      if (firstRun && r.done && r.executed === null && r.failure === null) {
        // המשימה כבר בוצעה במלואה — לא שגיאה, פשוט אין מה להריץ
        return NextResponse.json({
          ok: true,
          steps: r.state.steps,
          failures: r.state.failures,
          totalPhases,
          remaining: 0,
          alreadyComplete: true,
        });
      }
      firstRun = false;
      if (r.executed) steps.push(r.executed);
      if (r.failure) failures.push(r.failure);
      if (r.allDone || r.done) break;
      if (!r.executed && !r.failure) break; // תקיעה — לא להיתקע בלולאה
    }

    if (steps.length === 0) {
      const detail = failures.map((f) => `שלב ${f.phaseIndex + 1}: ${f.error}`).join(" · ");
      return NextResponse.json(
        { error: `כל השלבים נכשלו${detail ? `: ${detail}` : ""}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      steps,
      failures,
      totalPhases,
      remaining: Math.max(0, totalPhases - (steps.length + failures.length)),
    });
  } catch (e) {
    if (e instanceof AutopilotError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "הריצה האוטונומית נכשלה";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
