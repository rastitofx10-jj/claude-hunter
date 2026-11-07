// ============================================================
// מערכת סף המודלים המחמירה — Claude Hunter
//
// חוק ברזל (דרישת משתמש, לא ניתן לשינוי מה-UI):
//   ✔ רק מודלים בגרסה 5.5 ומעלה נחשבים "פרימיום מזכה" — Opus 5.5, Fable, Opus 6+...
//   ⛔ משפחת 4.x וכל גרסה מתחת ל-5.5 חסומה לחלוטין:
//      משקל 0, לא נכללת בציון, לא מוצעת במסננים, ונחסמת גם בצד השרת.
// ============================================================

export const MIN_QUALIFYING_VERSION = 5.5;
export const THRESHOLD_LABEL = "5.5+";
export const THRESHOLD_RULE_TEXT =
  "סף המודלים נעול: רק 5.5 ומעלה (Opus 5.5, Fable, Opus 6+) — משפחת 4.x חסומה לחלוטין";

export type ModelFamily = "opus" | "sonnet" | "haiku" | "fable" | "generic";

export interface ClaudeModelDef {
  id: string; // canonical id, למשל claude-opus-5-5
  label: string; // Opus 5.5
  family: ModelFamily;
  version: number; // 5.5
  weight: number; // תרומה לציון המודל (תקרה 45)
  searchStrings: string[]; // מחרוזות מדויקות לחיפוש קוד ב-GitHub
}

export interface BlockedModelHit {
  id: string;
  label: string;
  version: number;
  reason: string;
}

export interface ModelDetection {
  qualifying: ClaudeModelDef[];
  blocked: BlockedModelHit[];
  /** true אם זוהו רק מודלים חסומים (4.x ומטה) ואף מודל מזכה */
  blockedOnly: boolean;
}

const FAMILY_LABEL: Record<ModelFamily, string> = {
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
  fable: "Fable",
  generic: "Claude",
};

/**
 * רישום המודלים המזכים הידועים — כולם ≥ 5.5.
 * Fable הוא דגל הפרימיום הגבוה ביותר (משקל מלא 45).
 */
export const QUALIFYING_MODELS: ClaudeModelDef[] = [
  {
    id: "claude-fable",
    label: "Fable",
    family: "fable",
    version: 5.5,
    weight: 45,
    searchStrings: ["claude-fable", "claude fable", "fable model"],
  },
  {
    id: "claude-opus-5-5",
    label: "Opus 5.5",
    family: "opus",
    version: 5.5,
    weight: 42,
    searchStrings: ["claude-opus-5-5", "claude-opus-5.5", "opus 5.5"],
  },
  {
    id: "claude-opus-5-6",
    label: "Opus 5.6",
    family: "opus",
    version: 5.6,
    weight: 42,
    searchStrings: ["claude-opus-5-6", "claude-opus-5.6"],
  },
  {
    id: "claude-opus-6",
    label: "Opus 6",
    family: "opus",
    version: 6,
    weight: 44,
    searchStrings: ["claude-opus-6", "claude-opus-6-0", "opus 6"],
  },
  {
    id: "claude-opus-6-5",
    label: "Opus 6.5",
    family: "opus",
    version: 6.5,
    weight: 45,
    searchStrings: ["claude-opus-6-5", "claude-opus-6.5"],
  },
  {
    id: "claude-opus-7",
    label: "Opus 7",
    family: "opus",
    version: 7,
    weight: 45,
    searchStrings: ["claude-opus-7", "opus 7"],
  },
];

/** תיוג מודלים חסומים ידועים (רק להצגה — משקלם תמיד 0) */
const KNOWN_BLOCKED_LABELS: Record<string, string> = {
  "claude-opus-4-5": "Opus 4.5",
  "claude-opus-4-1": "Opus 4.1",
  "claude-opus-4": "Opus 4",
  "claude-sonnet-4-5": "Sonnet 4.5",
  "claude-sonnet-4": "Sonnet 4",
  "claude-3-7-sonnet": "Sonnet 3.7",
  "claude-3-5-sonnet": "Sonnet 3.5",
  "claude-haiku-4-5": "Haiku 4.5",
  "claude-haiku": "Haiku",
};

/**
 * סיווג לפי גרסה: מתחת ל-5.5 → חסום (משקל 0).
 * מעל הסף → משקל לפי משפחה וגרסה (תקרה 45).
 */
export function classifyVersion(
  v: number,
  family: ModelFamily
): { qualifying: boolean; weight: number } {
  if (!Number.isFinite(v) || v < MIN_QUALIFYING_VERSION) {
    return { qualifying: false, weight: 0 };
  }
  let base: number;
  if (family === "fable") base = 45;
  else if (v >= 6.5) base = 45;
  else if (v >= 6) base = 44;
  else base = 42; // 5.5–5.9
  if (family === "sonnet") base = Math.min(base, 32);
  if (family === "haiku") base = Math.min(base, 24);
  if (family === "generic") base = Math.min(base, 42);
  return { qualifying: true, weight: base };
}

function fmtVersion(maj: number, min: number | null): number {
  return min == null ? maj : Number(`${maj}.${min}`);
}

function buildId(family: ModelFamily, maj: number, min: number | null): string {
  if (family === "fable") return "claude-fable";
  if (family === "generic") return min == null ? `claude-${maj}` : `claude-${maj}-${min}`;
  return min == null ? `claude-${family}-${maj}` : `claude-${family}-${maj}-${min}`;
}

function buildLabel(family: ModelFamily, maj: number, min: number | null): string {
  const fam = FAMILY_LABEL[family];
  return min == null ? `${fam} ${maj}` : `${fam} ${maj}.${min}`;
}

/**
 * זיהוי מודלים בטקסט חופשי (README, תיאור, CLAUDE.md, settings).
 * מחזיר הפרדה מלאה: מזכים (≥5.5) מול חסומים (<5.5, כולל כל משפחת 4.x).
 */
export function detectClaudeModels(text: string): ModelDetection {
  const qualifying = new Map<string, ClaudeModelDef>();
  const blocked = new Map<string, BlockedModelHit>();
  if (!text) return { qualifying: [], blocked: [], blockedOnly: false };
  const lower = text.toLowerCase();

  const addQual = (id: string, family: ModelFamily, v: number) => {
    const reg = QUALIFYING_MODELS.find((m) => m.id === id);
    if (reg) {
      qualifying.set(reg.id, reg);
      return;
    }
    const { qualifying: ok, weight } = classifyVersion(v, family);
    if (!ok) return;
    qualifying.set(id, {
      id,
      label: buildLabel(family, Math.floor(v), v % 1 ? Number(String(v).split(".")[1]) : null),
      family,
      version: v,
      weight,
      searchStrings: [id],
    });
  };
  const addBlocked = (id: string, family: ModelFamily, v: number) => {
    const label = KNOWN_BLOCKED_LABELS[id] ?? buildLabel(family, Math.floor(v), v % 1 ? Number(String(v).split(".")[1]) : null);
    blocked.set(id, { id, label, version: v, reason: `גרסה ${v} מתחת לסף 5.5 — משפחת ${label.replace(/\s.*/, "")} חסומה` });
  };

  const handle = (family: ModelFamily, maj: number, min: number | null) => {
    const v = fmtVersion(maj, min);
    const id = buildId(family, maj, min);
    const { qualifying: ok } = classifyVersion(v, family);
    if (ok) addQual(id, family, v);
    else addBlocked(id, family, v);
  };

  // claude-opus-4-5 / claude_opus_5_5 / claude opus 4.5 / claude-opus-4-5-20251101
  const re1 = /claude[-_ ]?(opus|sonnet|haiku|fable)[-_ ]?(\d{1,2})(?:[-_. ](\d{1,2}))?/gi;
  // claude-3-5-sonnet / claude-3-7-sonnet-20250219 / claude-5-5
  const re2 = /claude[-_ ](\d{1,2})[-_. ](\d{1,2})(?:[-_ ]?(opus|sonnet|haiku|fable))?/gi;
  // opus 5.5 / opus-5.5 / sonnet-4-5 (גם ללא קידומת claude)
  const re3 = /\b(opus|sonnet|haiku)[-_ ]?(\d{1,2})(?:[-_. ](\d{1,2}))?(?!\d)/gi;

  let m: RegExpExecArray | null;
  while ((m = re1.exec(lower))) handle(m[1] as ModelFamily, Number(m[2]), m[3] != null ? Number(m[3]) : null);
  while ((m = re2.exec(lower))) {
    const fam = (m[3] as ModelFamily | undefined) ?? "generic";
    handle(fam, Number(m[1]), Number(m[2]));
  }
  while ((m = re3.exec(lower))) handle(m[1] as ModelFamily, Number(m[2]), m[3] != null ? Number(m[3]) : null);

  // fable עומד לבדו — מזכה רק כשיש הקשר Claude/Anthropic באותו טקסט (מניעת פוזיבים)
  if (/\bfable\b/.test(lower) && /(claude|anthropic)/.test(lower)) {
    addQual("claude-fable", "fable", 5.5);
  }

  // דה-דופליקציה: הסר מזכים שהם קידומת של מזכה ארוך יותר מאותה משפחה
  const qList0 = Array.from(qualifying.values()).filter(
    (a) => !Array.from(qualifying.values()).some((b) => b !== a && b.id.startsWith(`${a.id}-`))
  );
  // חיזוק: הסר מזכה גנרי (למשל claude-5-5) אם קיים מזכה משפחתי עם אותה גרסה — מניעת כפילות
  const qList = qList0.filter(
    (a) => !(a.family === "generic" && qList0.some((b) => b.family !== "generic" && b.version === a.version))
  );
  const bList = Array.from(blocked.values()).filter(
    (a) => !qList.some((q) => q.id.startsWith(a.id)) && !Array.from(blocked.values()).some((b) => b !== a && b.id.startsWith(`${a.id}-`))
  );

  return {
    qualifying: qList.sort((a, b) => b.weight - a.weight),
    blocked: bList.sort((a, b) => b.version - a.version),
    blockedOnly: qList.length === 0 && bList.length > 0,
  };
}

/**
 * בדיקה מחמירה למחרוזת "מודל" שמגיעה מהמסננים.
 * מחזיר true אם המחרוזת מתארת מודל מתחת לסף (4.x ומטה) — נחסמת בשרת.
 * אם המחרוזת מזוהה גם עם מודל מזכה (5.5+) — היא מותרת.
 */
export function isBlockedModelString(s: string): boolean {
  if (!s) return false;
  const det = detectClaudeModels(s);
  return det.blocked.length > 0 && det.qualifying.length === 0;
}

/** אפשרויות מסנן ל-UI — מופקות אוטומטית מהרישום, כך ש-4.x לא יכולה לדלוף */
export function qualifyingModelOptions(): { value: string; label: string }[] {
  return QUALIFYING_MODELS.map((m) => ({
    value: m.id,
    label: m.family === "fable" ? `✨ ${m.label} (5.5+)` : `${m.label} (5.5+)`,
  }));
}
