// ============================================================
// עזרי JSON-מ-AI משותפים — מקור האמת היחיד לחילוץ, תיקון ונרמול
// של תשובות LLM. כל המודולים (genesis, mission-compiler, ai-intel)
// מחויבים לכאן — אסור לשכפל את ההיגיון הזה שוב.
// ============================================================

export class AiJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiJsonError";
  }
}

export type ErrorFactory = new (message: string) => Error;

const TIMEOUT_FLAG = "__ai_timeout__";

/** האם השגיאה נגרמה מפסק זמן — עליה לא מנסים שוב (אותה תוצאה, בזבוז דקות) */
export function isTimeoutError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as Record<string, unknown>)[TIMEOUT_FLAG] === true;
}

export function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
  Err: ErrorFactory = AiJsonError
): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => {
      const t = setTimeout(() => {
        const err = new Err(`פסק זמן ${label}`) as Error & Record<string, unknown>;
        err[TIMEOUT_FLAG] = true;
        rej(err);
      }, ms);
      // מנע דליפת timer — שחרור כשההבטחה הראשית מתיישבת
      p.finally(() => clearTimeout(t)).catch(() => undefined);
    }),
  ]);
}

export function stripFences(raw: string): string {
  return raw.replace(/```(?:json|markdown)?/gi, "").trim();
}

export function repairTrailingCommas(s: string): string {
  return s.replace(/,\s*([}\]])/g, "$1");
}

export function escapeInnerQuotes(s: string): string {
  let out = "";
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && s[i - 1] !== "\\") {
      if (!inStr) {
        inStr = true;
        out += c;
        continue;
      }
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      const nxt = s[j];
      if (nxt === undefined || nxt === "," || nxt === "}" || nxt === "]" || nxt === ":") {
        inStr = false;
        out += c;
      } else {
        out += '\\"';
      }
    } else if (inStr && c === "\\") {
      out += c + (s[i + 1] ?? "");
      i++;
    } else {
      out += c;
    }
  }
  return out;
}

export function extractJson(raw: string, Err: ErrorFactory = AiJsonError): Record<string, unknown> {
  const cleaned = stripFences(raw);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Err("ה-AI לא החזיר JSON — נסה שוב");
  }
  const slice = cleaned.slice(start, end + 1);
  for (const cand of [
    slice,
    repairTrailingCommas(slice),
    escapeInnerQuotes(slice),
    repairTrailingCommas(escapeInnerQuotes(slice)),
  ]) {
    try {
      return JSON.parse(cand) as Record<string, unknown>;
    } catch {
      // next repair level
    }
  }
  throw new Err("ה-AI החזיר JSON שבור — נסה שוב");
}

export function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

export function strArr(v: unknown, max = 8): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

/**
 * JSON.parse סלחני לנתונים שמורים ב-DB — שדה פגום אחד לא יפיל את כל הבקשה.
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** זיהוי שגיאת Prisma "רשומה לא נמצאה" (P2025) — להבדלת 404 מ-500 אמיתי */
export function isPrismaNotFound(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: unknown }).code === "P2025"
  );
}
