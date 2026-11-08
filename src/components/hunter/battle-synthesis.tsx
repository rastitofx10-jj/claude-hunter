"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Network, Loader2, Download, TriangleAlert, ChevronDown, ChevronUp,
  Layers, Rocket, Compass, Map as MapIcon, Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, downloadFile } from "@/lib/api-client";
import { useHunterStore } from "@/lib/hunter-store";
import type { BattleSynthesis, WatchItem } from "@/lib/hunter-types";

const EFFORT_STYLE: Record<string, string> = {
  "נמוך": "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  "בינוני": "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  "גבוה": "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
  "לא ידוע": "border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300",
};

export function synthesisToMarkdown(s: BattleSynthesis, count: number): string {
  const L: string[] = [];
  L.push(`# 🕸️ סינתזת קרב AI — ${count} מאגרי מעקב`);
  L.push(`_נוצר: ${new Date(s.generatedAt).toLocaleString("he-IL")}_`);
  L.push(`\n## תמונת מצב\n${s.execSummary}`);
  if (s.patterns.length)
    L.push(`\n## דפוסים חוצי-פרויקטים\n${s.patterns.map((p) => `### ${p.pattern}\n- ריפואים: ${p.repos.join(", ") || "—"}\n- משמעות: ${p.insight || "—"}`).join("\n")}`);
  if (s.stackConsensus.length) L.push(`\n## קונצנזוס טכנולוגי\n${s.stackConsensus.map((x) => `- ${x}`).join("\n")}`);
  if (s.topMoves.length)
    L.push(`\n## מהלכים מומלצים\n${s.topMoves.map((m) => `- **${m.move}** (מאמץ: ${m.effort})\n  - ${m.why || "—"}`).join("\n")}`);
  if (s.differentiators.length) L.push(`\n## הזדמנויות הבדלות\n${s.differentiators.map((x) => `- ${x}`).join("\n")}`);
  if (s.battlePlan.length) L.push(`\n## תוכנית קרב\n${s.battlePlan.map((x, i) => `${i + 1}. ${x}`).join("\n")}`);
  L.push(`\n---\n_נוצר על-ידי Claude Hunter · סף מודלים 5.5+_`);
  return L.join("\n");
}

export function BattleSynthesis({ items }: { items: WatchItem[] }) {
  const token = useHunterStore((s) => s.token);
  const [open, setOpen] = useState(true);

  const gen = useMutation({
    mutationFn: () =>
      apiFetch<BattleSynthesis>("/api/synthesis", token, {
        method: "POST",
        body: JSON.stringify({ items: items.slice(0, 20) }),
      }),
  });
  const s = gen.data;
  const enough = items.length >= 2;

  return (
    <div className="mb-4 space-y-3 rounded-xl border-2 border-violet-200 bg-gradient-to-b from-violet-50/70 to-transparent p-4 dark:border-violet-900 dark:from-violet-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Network className="h-4 w-4 text-violet-600" /> סינתזת קרב AI — מודיעין חוצת-ריפואים
          <span className="text-xs font-normal text-muted-foreground">({items.length} מאגרים)</span>
        </p>
        <div className="flex gap-1.5">
          {s && (
            <>
              <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} className="h-8 gap-1 text-xs">
                {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {open ? "כווץ" : "פתח"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadFile(`battle-plan-${Date.now()}.md`, synthesisToMarkdown(s, items.length), "text/markdown;charset=utf-8")}
                className="h-8 gap-1 text-xs"
              >
                <Download className="h-3.5 w-3.5" /> Markdown
              </Button>
            </>
          )}
          <Button
            size="sm"
            disabled={!enough || gen.isPending}
            title={enough ? undefined : "צריך לפחות 2 מאגרים שמורים"}
            onClick={() => {
              setOpen(true);
              gen.mutate();
            }}
            className="h-8 gap-1.5 bg-gradient-to-l from-violet-500 to-purple-600 text-xs text-white hover:from-violet-600 hover:to-purple-700"
          >
            {gen.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Network className="h-3.5 w-3.5" />}
            {gen.isPending ? "מצליב דפוסים…" : s ? "סנתז מחדש" : "הפעל סינתזה"}
          </Button>
        </div>
      </div>

      {!enough && (
        <p className="text-xs text-muted-foreground">
          ℹ️ הסינתזה מחברת את כל רשימת המעקב לתמונה אחת — שמור לפחות 2 מאגרים כדי להפעיל.
        </p>
      )}

      {gen.isPending && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-20 w-full" />
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> ה-AI מחפש דפוסים משותפים חוצה {items.length} מאגרים… (עד כדקה)
          </p>
        </div>
      )}

      {gen.isError && (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle className="text-sm">הסינתזה נכשלה</AlertTitle>
          <AlertDescription className="text-xs">
            {(gen.error as Error)?.message}
            <Button variant="outline" size="sm" onClick={() => gen.mutate()} className="mr-2 h-7 text-xs">
              נסה שוב
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {s && open && (
        <div className="space-y-3">
          <div className="rounded-xl border border-violet-300 bg-white/70 p-3 dark:border-violet-800 dark:bg-violet-950/30">
            <p className="flex items-start gap-2 text-sm leading-relaxed">
              <Compass className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
              {s.execSummary}
            </p>
          </div>

          {s.patterns.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Layers className="h-4 w-4 text-violet-600" /> דפוסים חוצי-פרויקטים</p>
              {s.patterns.map((p, i) => (
                <div key={i} className="rounded-lg border bg-background/60 p-2.5 text-sm">
                  <p className="font-semibold">{p.pattern}</p>
                  {p.repos.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1" dir="ltr">
                      {p.repos.map((r) => (
                        <Badge key={r} variant="secondary" dir="ltr" className="font-mono text-[10px]">{r}</Badge>
                      ))}
                    </div>
                  )}
                  {p.insight && <p className="mt-1 text-xs text-muted-foreground">💡 {p.insight}</p>}
                </div>
              ))}
            </div>
          )}

          {s.stackConsensus.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">🧱 קונצנזוס טכנולוגי</p>
              <div className="flex flex-wrap gap-1.5">
                {s.stackConsensus.map((x, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{x}</Badge>
                ))}
              </div>
            </div>
          )}

          {s.topMoves.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Rocket className="h-4 w-4 text-violet-600" /> מהלכים מומלצים למוצר שלנו</p>
              {s.topMoves.map((m, i) => (
                <div key={i} className="rounded-lg border bg-background/60 p-2.5 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{m.move}</p>
                    <Badge variant="outline" className={`shrink-0 text-[10px] ${EFFORT_STYLE[m.effort] ?? EFFORT_STYLE["לא ידוע"]}`}>
                      מאמץ: {m.effort}
                    </Badge>
                  </div>
                  {m.why && <p className="mt-0.5 text-xs text-muted-foreground">{m.why}</p>}
                </div>
              ))}
            </div>
          )}

          {s.differentiators.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Lightbulb className="h-4 w-4 text-amber-500" /> הזדמנויות הבדלות</p>
              <ul className="space-y-1">
                {s.differentiators.map((x, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {s.battlePlan.length > 0 && (
            <div className="rounded-xl border border-violet-300 bg-violet-50/60 p-3 dark:border-violet-800 dark:bg-violet-950/30">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-violet-800 dark:text-violet-200">
                <MapIcon className="h-4 w-4" /> תוכנית קרב
              </p>
              <ol className="mt-2 space-y-1.5">
                {s.battlePlan.map((x, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-violet-900 dark:text-violet-100">
                    <Badge className="mt-0.5 h-5 shrink-0 bg-violet-600 px-1.5 text-[10px] text-white hover:bg-violet-600">{i + 1}</Badge>
                    <span>{x}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
