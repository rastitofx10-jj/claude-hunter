"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History as HistoryIcon, Loader2, Play, Trash2, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-client";
import { useHunterStore } from "@/lib/hunter-store";
import type { HistoryItem, SearchBody } from "@/lib/hunter-types";

export function HistoryPanel({
  onReRun,
}: {
  onReRun: (body: SearchBody) => void;
}) {
  const token = useHunterStore((s) => s.token);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["history"],
    queryFn: () => apiFetch<{ items: HistoryItem[] }>("/api/history", token),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/history?id=${id}`, token, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["history"] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> טוען היסטוריה…
      </div>
    );
  }

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center text-muted-foreground">
        <HistoryIcon className="h-10 w-10 opacity-40" />
        <p className="font-medium">אין היסטוריה עדיין</p>
        <p className="text-sm">כל חיפוש שתריץ יישמר כאן אוטומטית — אפשר להריץ מחדש בלחיצה</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" aria-label="היסטוריית חיפושים">
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-muted-foreground"
          onClick={() => del.mutate("all")}
        >
          <Trash className="h-3.5 w-3.5" /> נקה הכל
        </Button>
      </div>
      {items.map((h) => {
        let body: SearchBody | null = null;
        try {
          if (h.filters) body = JSON.parse(h.filters) as SearchBody;
        } catch {
          body = null;
        }
        return (
          <div key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 transition-shadow hover:shadow-sm">
            <Badge variant="outline" className="text-[10px]">
              {h.mode === "code" ? "📄 קוד" : "🗂️ מאגרים"}
            </Badge>
            <code dir="ltr" className="max-w-full flex-1 truncate font-mono text-xs">
              {h.query}
            </code>
            <Badge variant="secondary" className="text-[10px]">{h.resultCount} תוצאות</Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(h.createdAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={() =>
                  onReRun({
                    ...(body ?? { query: h.query }),
                    mode: h.mode === "code" ? "code" : "repos",
                    page: 1,
                  })
                }
              >
                <Play className="h-3 w-3" /> הרץ מחדש
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-red-500"
                aria-label="מחק רשומה"
                onClick={() => del.mutate(String(h.id))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
