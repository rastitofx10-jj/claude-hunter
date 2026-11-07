"use client";

import { useState } from "react";
import { KeyRound, ExternalLink, CheckCircle2, XCircle, Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHunterStore } from "@/lib/hunter-store";
import { apiFetch } from "@/lib/api-client";
import type { RateInfo } from "@/lib/hunter-types";

export function TokenDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { token, setToken } = useHunterStore();
  const [draft, setDraft] = useState("");
  const [test, setTest] = useState<{ loading: boolean; ok?: boolean; info?: RateInfo }>({ loading: false });

  const runTest = async (t: string) => {
    setTest({ loading: true });
    try {
      const info = await apiFetch<RateInfo>("/api/rate-limit", t);
      setTest({ loading: false, ok: !info.error, info });
    } catch (e) {
      setTest({ loading: false, ok: false, info: { hasToken: false, error: e instanceof Error ? e.message : "שגיאה" } });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-1.5">
            <KeyRound className="h-4 w-4" />
            טוקן GitHub
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>טוקן GitHub — נדרש לעוצמה מלאה</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm leading-relaxed">
              <p>
                ללא טוקן: 60 בקשות/שעה בלבד, ו<b>חיפוש קוד לא זמין בכלל</b>. עם טוקן (חינם): 5,000 בקשות/שעה + חיפוש קוד + ניתוח מעמיק.
              </p>
              <a
                href="https://github.com/settings/tokens?type=beta"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-orange-600 hover:underline"
              >
                יצירת טוקן ב-GitHub (30 שניות) <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <p className="text-xs text-muted-foreground">
                אין צורך בהרשאות מיוחדות למאגרים ציבוריים. הטוקן נשמר בדפדפן שלך ובשרת המקומי, ומועבר רק ל-GitHub.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2" dir="ltr">
            <Input
              placeholder="github_pat_... / ghp_..."
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setToken(draft.trim());
                if (draft.trim()) void runTest(draft.trim());
              }}
              disabled={test.loading || !draft.trim()}
              className="gap-1.5"
            >
              {test.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              שמור ובדוק
            </Button>
            {token && (
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                onClick={() => {
                  setToken("");
                  setDraft("");
                  setTest({ loading: false });
                }}
              >
                <Trash2 className="h-4 w-4" /> נקה טוקן שמור
              </Button>
            )}
            {token && !draft && (
              <Button size="sm" variant="secondary" onClick={() => void runTest(token)} disabled={test.loading}>
                בדוק טוקן שמור
              </Button>
            )}
          </div>

          {test.info && !test.loading && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                test.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {test.ok ? (
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="h-4 w-4" /> הטוקן תקין!
                  </p>
                  {test.info.core && (
                    <p dir="ltr" className="font-mono text-xs">
                      core: {test.info.core.remaining}/{test.info.core.limit} · search: {test.info.search?.remaining}/
                      {test.info.search?.limit} · code: {test.info.codeSearch?.remaining}/{test.info.codeSearch?.limit}
                    </p>
                  )}
                </div>
              ) : (
                <p className="flex items-center gap-1.5">
                  <XCircle className="h-4 w-4" /> {test.info.error ?? "הטוקן נדחה"}
                </p>
              )}
            </div>
          )}

          {token && (
            <p className="text-xs text-muted-foreground">
              טוקן פעיל שמור בדפדפן: <span dir="ltr" className="font-mono">{token.slice(0, 8)}…</span>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
