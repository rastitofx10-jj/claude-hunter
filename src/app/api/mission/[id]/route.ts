import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildMissionBundle, type CompiledMission } from "@/lib/mission-compiler";
import { safeJsonParse } from "@/lib/ai-json";
import { parseAutopilotState } from "@/lib/autopilot";

export const dynamic = "force-dynamic";

/**
 * parsing סלחני לכל שדה בנפרד — משימה עם שדה JSON פגום אחד עדיין נטענת מלאה
 * (בעבר: JSON.parse אחד נכשל = 500 על כל כרטיס המשימה, לצמיתות).
 */
function parseMission(m: {
  id: number;
  goal: string;
  context: string | null;
  status: string;
  missionName: string;
  plan: string;
  dnaRefs: string | null;
  promptSequence: string | null;
  skillMd: string | null;
  risks: string | null;
  successCriteria: string | null;
  report: string | null;
  autopilot: string | null;
  autopilotAt: Date | null;
  createdAt: Date;
}) {
  const plan = safeJsonParse<{ oneLiner?: string; phases?: CompiledMission["phases"] }>(m.plan, {});
  const selectedDna = safeJsonParse<CompiledMission["selectedDna"]>(m.dnaRefs, []);
  const promptSequence = safeJsonParse<CompiledMission["promptSequence"]>(m.promptSequence, []);
  const risks = safeJsonParse<string[]>(m.risks, []);
  const successCriteria = safeJsonParse<string[]>(m.successCriteria, []);
  const report = safeJsonParse<Record<string, unknown> | null>(m.report, null);
  const autopilot = m.autopilot ? parseAutopilotState(m.autopilot) : null;

  const compiled: CompiledMission = {
    missionName: m.missionName,
    oneLiner: plan.oneLiner ?? "",
    phases: plan.phases ?? [],
    promptSequence,
    skillMd: m.skillMd ?? "",
    risks,
    successCriteria,
    selectedDna,
    compiledAt: m.createdAt.toISOString(),
  };

  return {
    id: m.id,
    goal: m.goal,
    context: m.context,
    status: m.status,
    report,
    autopilot,
    autopilotAt: m.autopilotAt ? m.autopilotAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
    // פלט שטוח — אותה צורה בדיוק כמו תשובת ה-POST, כדי שה-UI יציג בשני המקרים באותה קומפוננטה
    ...compiled,
    bundle: buildMissionBundle(compiled, m.goal),
  };
}

/** פרטי משימה מלאים */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) {
    return NextResponse.json({ error: "מזהה לא תקין" }, { status: 400 });
  }
  try {
    const m = await db.mission.findUnique({ where: { id: numId } });
    if (!m) return NextResponse.json({ error: "המשימה לא נמצאה" }, { status: 404 });
    return NextResponse.json(parseMission(m));
  } catch {
    return NextResponse.json({ error: "טעינת המשימה נכשלה" }, { status: 500 });
  }
}

/** עדכון סטטוס ביצוע */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  const allowed = new Set(["compiled", "in_progress", "done", "partial", "failed"]);
  try {
    const body = (await req.json()) as { status?: string };
    const status = (body.status ?? "").trim();
    if (!Number.isInteger(numId) || !allowed.has(status)) {
      return NextResponse.json({ error: "סטטוס לא תקין" }, { status: 400 });
    }
    const exists = await db.mission.findUnique({ where: { id: numId }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "המשימה לא נמצאה" }, { status: 404 });
    const m = await db.mission.update({ where: { id: numId }, data: { status } });
    return NextResponse.json({ id: m.id, status: m.status });
  } catch {
    return NextResponse.json({ error: "עדכון הסטטוס נכשל" }, { status: 500 });
  }
}

/** מחיקת משימה */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) {
    return NextResponse.json({ error: "מזהה לא תקין" }, { status: 400 });
  }
  try {
    const exists = await db.mission.findUnique({ where: { id: numId }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "המשימה לא נמצאה" }, { status: 404 });
    await db.mission.delete({ where: { id: numId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "מחיקת המשימה נכשלה" }, { status: 500 });
  }
}
