import { db } from "@/lib/db";
import type { NextRequest } from "next/server";

// ============================================================
// ניהול טוקן GitHub בצד השרת
// עדיפות: כותרת הבקשה ← משתנה סביבה ← טוקן שנשמר בבסיס הנתונים
// כל בקשה שמגיעה עם טוקן תקין-מבנה נשמרת אוטומטית (upsert) כדי
// שהשרת יוכל להשתמש בו גם בקריאות עתידיות בלי הכותרת.
// ============================================================

const TOKEN_KEY = "github_pat";
/**
 * בדיקת תקינות גמישה: GitHub עצמו הוא מקור האמת (הלכידה קורית רק אחרי 200 מ-GitHub),
 * אז כל מחרוזת סבירה באורך הולם מתקבלת — בלי קפדנות על קידומות שעלולות להשתנות.
 */
export function looksLikeToken(t: string | null | undefined): t is string {
  if (!t) return false;
  const s = t.trim();
  if (s.length < 20 || s.length > 255) return false;
  if (/\s/.test(s)) return false;
  if (/^(null|undefined|test|token)$/i.test(s)) return false;
  return true;
}

/** הטוקן הפעיל לבקשה: כותרת ← env ← DB */
export async function resolveToken(req: NextRequest): Promise<string | null> {
  const header = req.headers.get("x-gh-token");
  if (header && header.trim()) return header.trim();
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const row = await db.setting.findUnique({ where: { key: TOKEN_KEY } });
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/** שמירת טוקן בבסיס הנתונים (רק אם המבנה תקין) */
export async function persistToken(token: string): Promise<boolean> {
  const t = token.trim();
  if (!looksLikeToken(t)) return false;
  try {
    await db.setting.upsert({
      where: { key: TOKEN_KEY },
      create: { key: TOKEN_KEY, value: t },
      update: { value: t },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * לכידה שקופה: אם הבקשה נשאה טוקן תקין-מבנה — שומר אותו לשימוש השרת.
 * נקרא רק אחרי הצלחת קריאת GitHub (כלומר הטוקן גם באמת עובד).
 */
export async function captureTokenFrom(req: NextRequest): Promise<void> {
  const header = req.headers.get("x-gh-token");
  if (header && looksLikeToken(header)) {
    const current = await resolveToken(req).catch(() => null);
    if (current !== header.trim()) await persistToken(header);
  }
}

/** מחיקת הטוקן השמור */
export async function clearStoredToken(): Promise<void> {
  try {
    await db.setting.deleteMany({ where: { key: TOKEN_KEY } });
  } catch {
    // ignore
  }
}

/** תצוגה ממוסכת ללא חשיפת הטוקן המלא */
export function maskToken(t: string | null | undefined): string | null {
  if (!t) return null;
  const s = t.trim();
  if (s.length <= 12) return "•".repeat(s.length);
  return `${s.slice(0, 7)}••••${s.slice(-4)}`;
}

export async function storedTokenInfo(): Promise<{
  exists: boolean;
  masked: string | null;
  updatedAt: Date | null;
}> {
  try {
    const row = await db.setting.findUnique({ where: { key: TOKEN_KEY } });
    return {
      exists: !!row,
      masked: row ? maskToken(row.value) : null,
      updatedAt: row?.updatedAt ?? null,
    };
  } catch {
    return { exists: false, masked: null, updatedAt: null };
  }
}
