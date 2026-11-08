import { NextRequest, NextResponse } from "next/server";
import { generateRepoIntel, IntelError } from "@/lib/ai-intel";
import type { AnalyzeResponse } from "@/lib/hunter-types";

export const dynamic = "force-dynamic";

// POST /api/intel — דוח מודיעין AI עבור תוצאת ניתוח שכבר בוצעה
export async function POST(req: NextRequest) {
  let body: AnalyzeResponse;
  try {
    body = (await req.json()) as AnalyzeResponse;
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }

  if (!body?.repo?.fullName || typeof body?.score?.total !== "number") {
    return NextResponse.json(
      { error: "נדרשת תוצאת ניתוח תקינה — נתח את המאגר קודם ואז הפעל את דוח המודיעין" },
      { status: 400 }
    );
  }

  try {
    const intel = await generateRepoIntel(body);
    return NextResponse.json(intel);
  } catch (e) {
    if (e instanceof IntelError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    console.error("intel failed", e);
    return NextResponse.json({ error: "יצירת דוח המודיעין נכשלה. נסה שוב." }, { status: 500 });
  }
}
