import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateChimera } from "@/lib/genesis";
import type { MinedArtifact } from "@/lib/dna-miner";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** יצירת כימרה: מיזוג AI של DNA מכמה ריפואי אליטה + פקודות עבודה */
export async function POST(req: NextRequest) {
  let repos: string[] = [];
  let productContext = "";
  try {
    const body = (await req.json()) as { repos?: string[]; productContext?: string };
    repos = (body.repos ?? []).map((r) => r.trim()).filter(Boolean).slice(0, 5);
    productContext = (body.productContext ?? "").trim();
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }
  if (repos.length === 0) {
    return NextResponse.json({ error: "בחר לפחות ריפו אחד מהספרייה" }, { status: 400 });
  }

  try {
    const sources: { repo: string; artifacts: MinedArtifact[] }[] = [];
    for (const repo of repos) {
      const rows = await db.dnaArtifact.findMany({ where: { sourceRepo: repo } });
      if (rows.length === 0) continue;
      sources.push({
        repo,
        artifacts: rows.map((r) => ({
          path: r.path,
          kind: r.kind as MinedArtifact["kind"],
          name: r.name,
          description: r.description,
          content: r.content,
          rawUrl: r.rawUrl,
          size: r.size,
          truncated: false,
        })),
      });
    }
    if (sources.length === 0) {
      return NextResponse.json(
        { error: "אין DNA שמור לריפואים שנבחרו — כרה קודם לפחות ריפו אחד" },
        { status: 400 }
      );
    }

    const chimera = await generateChimera(
      sources,
      productContext ||
        "Claude Hunter — מערכת מודיעין תחרותי לגילוי וניתוח פרויקטי Claude פרימיום ב-GitHub, עם שכבת AI לסינתזה. Next.js 16, TypeScript, Prisma, Tailwind."
    );

    const saved = await db.chimera.create({
      data: {
        name: chimera.chimeraName,
        sources: chimera.sources.join(","),
        skillMd: chimera.skillMd,
        principles: JSON.stringify(chimera.principles),
        workOrders: JSON.stringify(chimera.workOrders),
        breakthrough: chimera.breakthrough,
      },
    });

    return NextResponse.json({ id: saved.id, ...chimera });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "יצירת הכימרה נכשלה";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
