"use client";

import { useState } from "react";
import { Search, Loader2, ChefHat, SlidersHorizontal, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { RECIPES } from "@/lib/hunter-recipes";
import { qualifyingModelOptions, THRESHOLD_RULE_TEXT } from "@/lib/claude-models";
import type { SearchBody } from "@/lib/hunter-types";

const TOPIC_CHIPS = ["claude-code", "claude-ai", "claude", "anthropic", "mcp", "mcp-server", "ai-agents", "llm", "rag"];
// ⛔ מופק אוטומטית מהרישום המחמיר — רק מודלים מזכים (5.5+). 4.x לא קיים כאן בכלל.
// שימו לב: Radix Select אינו מקבל value="" — משתמשים ב-sentinel "none"/"all" וממפים חזרה.
export const MODEL_OPTIONS = [
  { value: "none", label: "ללא סינון מודל" },
  ...qualifyingModelOptions(),
];
const LANGUAGE_OPTIONS = [
  { value: "all", label: "הכל" },
  ...["TypeScript", "JavaScript", "Python", "Rust", "Go", "Java", "C#", "Ruby", "PHP", "Swift", "Kotlin", "C++", "Shell", "MDX"].map((l) => ({ value: l, label: l })),
];

const DEFAULTS: SearchBody = {
  mode: "repos",
  query: "",
  topics: [],
  language: "",
  minStars: 0,
  pushedWithinDays: 0,
  model: "",
  hasClaudeMd: false,
  ownerType: "any",
  sort: "best",
  perPage: 24,
};

export function SearchPanel({
  value,
  onChange,
  onSearch,
  loading,
}: {
  value: SearchBody;
  onChange: (b: SearchBody) => void;
  onSearch: () => void;
  loading: boolean;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const set = (patch: Partial<SearchBody>) => onChange({ ...value, ...patch });
  const toggleTopic = (t: string) => {
    const topics = value.topics?.includes(t) ? value.topics.filter((x) => x !== t) : [...(value.topics ?? []), t];
    set({ topics });
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      {/* row 1: mode + recipes */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="מצב חיפוש">
          {(["repos", "code"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={value.mode === m}
              onClick={() => set({ mode: m })}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                value.mode === m ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "repos" ? "🗂️ מאגרים" : "📄 קוד (מודלים)"}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-1.5">
              <ChefHat className="h-4 w-4" /> מתכונים מוכנים
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80">
            <DropdownMenuLabel>חיפושים מוכנים מראש</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {RECIPES.map((r) => (
              <DropdownMenuItem
                key={r.id}
                onClick={() => {
                  if (r.analyze) {
                    window.dispatchEvent(new CustomEvent("hunter-analyze", { detail: r.analyze }));
                  } else {
                    onChange({ ...DEFAULTS, ...r.body, page: 1 });
                  }
                }}
                className="flex-col items-start gap-0.5 py-2.5"
              >
                <span className="text-sm font-medium">
                  {r.emoji} {r.title}
                </span>
                <span className="text-xs text-muted-foreground">{r.desc}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <SlidersHorizontal className="h-4 w-4" /> מסננים
            </Button>
          </CollapsibleTrigger>
        </Collapsible>

        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => onChange({ ...DEFAULTS, page: 1 })}
        >
          <RotateCcw className="h-4 w-4" /> אפס
        </Button>
      </div>

      {/* row 2: query */}
      <div className="flex gap-2">
        <Input
          placeholder={value.mode === "repos" ? 'לדוגמה: "claude code agent" או השאר ריק לשימוש במסננים' : 'טקסט חופשי בקוד, לדוגמה: "max_tokens" anthropic'}
          value={value.query ?? ""}
          onChange={(e) => set({ query: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          dir="ltr"
          className="font-mono text-sm"
          aria-label="שאילתת חיפוש"
        />
        <Button onClick={onSearch} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? "מחפש…" : "חפש"}
        </Button>
      </div>

      {/* topic chips */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="נושאים">
        {TOPIC_CHIPS.map((t) => {
          const active = value.topics?.includes(t);
          return (
            <button
              key={t}
              onClick={() => toggleTopic(t)}
              aria-pressed={active}
              dir="ltr"
              className={`rounded-full border px-2.5 py-1 font-mono text-xs transition-colors ${
                active
                  ? "border-orange-500 bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200"
                  : "bg-background text-muted-foreground hover:border-orange-300"
              }`}
            >
              #{t}
            </button>
          );
        })}
      </div>

      {/* filters */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleContent className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1">
              <Label className="flex items-center gap-1 text-xs">
                מודל פרימיום
                <span title={THRESHOLD_RULE_TEXT} className="cursor-help text-[10px] text-orange-600">🔒 5.5+</span>
              </Label>
              <Select
                value={value.model || "none"}
                onValueChange={(v) => set({ model: v === "none" ? "" : v })}
              >
                <SelectTrigger size="sm" dir="ltr" aria-label="מודל">
                  <SelectValue placeholder="מודל" />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">שפה</Label>
              <Select
                value={value.language || "all"}
                onValueChange={(v) => set({ language: v === "all" ? "" : v })}
              >
                <SelectTrigger size="sm" dir="ltr" aria-label="שפה">
                  <SelectValue placeholder="הכל" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">כוכבים מינימום</Label>
              <Input
                type="number"
                min={0}
                dir="ltr"
                value={value.minStars ?? 0}
                onChange={(e) => set({ minStars: Number(e.target.value) || 0 })}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">עודכן לאחרונה</Label>
              <Select
                value={String(value.pushedWithinDays ?? 0)}
                onValueChange={(v) => set({ pushedWithinDays: Number(v) })}
              >
                <SelectTrigger size="sm" aria-label="עדכון אחרון">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">הכל</SelectItem>
                  <SelectItem value="7">שבוע</SelectItem>
                  <SelectItem value="30">חודש</SelectItem>
                  <SelectItem value="90">3 חודשים</SelectItem>
                  <SelectItem value="365">שנה</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">סוג בעלים</Label>
              <Select value={value.ownerType ?? "any"} onValueChange={(v) => set({ ownerType: v as SearchBody["ownerType"] })}>
                <SelectTrigger size="sm" aria-label="סוג בעלים">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">הכל</SelectItem>
                  <SelectItem value="user">👤 אנשים פרטיים</SelectItem>
                  <SelectItem value="org">🏢 ארגונים</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">מיון</Label>
              <Select value={value.sort ?? "best"} onValueChange={(v) => set({ sort: v as SearchBody["sort"] })}>
                <SelectTrigger size="sm" aria-label="מיון">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="best">רלוונטיות/מדד</SelectItem>
                  <SelectItem value="stars">⭐ כוכבים</SelectItem>
                  <SelectItem value="forks">⑂ forks</SelectItem>
                  <SelectItem value="updated">🕒 עדכון</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch id="claude-md" checked={!!value.hasClaudeMd} onCheckedChange={(v) => set({ hasClaudeMd: v })} />
              <Label htmlFor="claude-md" className="text-sm">
                חיפוש קוד: חייב CLAUDE.md <span className="text-xs text-muted-foreground">(סימן לפיתוח עם Claude Code)</span>
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">תוצאות בעמוד</Label>
              <Select value={String(value.perPage ?? 24)} onValueChange={(v) => set({ perPage: Number(v) })}>
                <SelectTrigger size="sm" className="w-20" aria-label="תוצאות בעמוד">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12">12</SelectItem>
                  <SelectItem value="24">24</SelectItem>
                  <SelectItem value="48">48</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export { DEFAULTS as SEARCH_DEFAULTS };
