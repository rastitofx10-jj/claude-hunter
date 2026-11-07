import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rankDnaForGoal, compileMission, buildMissionBundle } from "@/lib/mission-compiler";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_GOAL = 2000;
const MAX_CONTEXT = 2000;

/** רשימת משימות + סטטיסטיקת לולאה */
export async function GET() {
  try {
    const missions = await db.mission.findMany({ orderBy: { id: "desc" }, take: 50 });
    const [totalDna, fieldDna] = await Promise.all([
      db.dnaArtifact.count(),
      db.dnaArtifact.count({ where: { sourceRepo: { startsWith: "field:" } } }),
    ]);
    const items = missions.map((m) => {
      let oneLiner = "";
      let phaseCount = 0;
      let promptCount = 0;
      try {
        const plan = JSON.parse(m.plan) as { oneLiner?: string; phases?: unknown[] };
        oneLiner = plan.oneLiner ?? "";
        phaseCount = Array.isArray(plan.phases) ? plan.phases.length : 0;
        const seq = m.promptSequence ? (JSON.parse(m.promptSequence) as unknown[]) : [];
        promptCount = Array.isArray(seq) ? seq.length : 0;
      } catch {
        // plan corruption tolerated in list view
      }
      return {
        id: m.id,
        missionName: m.missionName,
        goal: m.goal,
        status: m.status,
        oneLiner,
        phaseCount,
        promptCount,
        hasReport: !!m.report,
        createdAt: m.createdAt,
      };
    });
    return NextResponse.json({ items, stats: { totalDna, fieldDna } });
  } catch {
    return NextResponse.json({ error: "טעינת המשימות נכשלה" }, { status: 500 });
  }
}

/** הידור משימה חדשה: מטרה ← אחזור DNA ← תוכנית קרב */
export async function POST(req: NextRequest) {
  let goal = "";
  let context = "";
  try {
    const body = (await req.json()) as { goal?: string; context?: string };
    goal = (body.goal ?? "").trim();
    context = (body.context ?? "").trim();
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }
  if (goal.length < 8) {
    return NextResponse.json({ error: "תאר את המטרה במשפט אחד לפחות (8+ תווים)" }, { status: 400 });
  }
  if (goal.length > MAX_GOAL) goal = goal.slice(0, MAX_GOAL);
  if (context.length > MAX_CONTEXT) context = context.slice(0, MAX_CONTEXT);

  try {
    const allDna = await db.dnaArtifact.findMany({
      select: { id: true, sourceRepo: true, path: true, kind: true, name: true, description: true, content: true },
    });
    if (allDna.length === 0) {
      return NextResponse.json(
        { error: "הספרייה ריקה — כרה קודם DNA מריפו אליטה בלשונית Genesis" },
        { status: 400 }
      );
    }

    const selected = rankDnaForGoal(goal, allDna, 8);
    const compiled = await compileMission(goal, context, selected);

    const saved = await db.mission.create({
      data: {
        goal,
        context: context || null,
        missionName: compiled.missionName,
        status: "compiled",
        plan: JSON.stringify({ oneLiner: compiled.oneLiner, phases: compiled.phases }),
        dnaRefs: JSON.stringify(
          compiled.selectedDna.map((d) => ({ id: d.id, path: d.path, name: d.name, kind: d.kind, sourceRepo: d.sourceRepo }))
        ),
        promptSequence: JSON.stringify(compiled.promptSequence),
        skillMd: compiled.skillMd,
        risks: JSON.stringify(compiled.risks),
        successCriteria: JSON.stringify(compiled.successCriteria),
      },
    });

    return NextResponse.json({
      id: saved.id,
      goal,
      context: context || null,
      status: saved.status,
      report: null,
      autopilot: null,
      autopilotAt: null,
      createdAt: saved.createdAt.toISOString(),
      ...compiled,
      bundle: buildMissionBundle(compiled, goal),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "הידור המשימה נכשל";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
