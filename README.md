# 🎯 Claude Hunter

מערכת מודיעין תחרותי לאיתור, ניתוח וצייד פרויקטים שנבנו עם מודלי Claude **פרימיום (5.5+)** ב-GitHub — עם מנוע DNA חי שמכרה יכולות אמיתיות מהאליטה העולמית ומשתפר מכל משימה שמבוצעת.

> **חוק ברזל:** סף המודלים נעול בקוד — רק 5.5 ומעלה (Opus 5.5, Fable, Opus 6+). משפחת 4.x וכל מה שמתחת לסף חסומים בשרת, במסננים ובציון. לא ניתן לשינוי מה-UI.

---

## מה יש בפנים

| מודול | מה זה עושה |
|---|---|
| **חיפוש** | חיפוש repos + code ב-GitHub עם ניקוד Claude-Investment (0-100, טירות אליטה→נבט), זיהוי מודלים מהטקסט/נתיבים, וחסימת שרת למסנני 4.x |
| **ניתוח עומק** | ניתוח ריפו בודד: עץ קבצים, קבצי `.claude/`, README, contributors, שפות, אזכורי מחירים/טוקנים → ציון השקעה מנומק |
| **סריקת עומק (Deep Sweep)** | ארסנל שאילתות אוטומטי מרישום המודלים (קוד + repos + topics + market), העשרה, כרייה, ו-8 פרומפטים של להקת מודיעין (טריאז׳ה → פרופילים → דפוסים → תוכנית תקיפה → אבולוציית שאילתות → תדריך) |
| **ביקורת אדברסרית** | המערכת בודקת את עצמה: אימות חי של ראיות elite מול המאגרים עצמם (code search + grep גולמי לקרקע-אמת), ופרומפט anti-slop שמחייב ציטוט מדויק |
| **Genesis** | כריית DNA: SKILL.md, פקודות, סוכנים ו-CLAUDE.md מריפואי אליטה → ספריית יכולות ניידת; מיזוג כימרה (best-of-breed) + פקודות עבודה מוכנות |
| **Mission Control** | מטרה בשפה טבעית → תוכנית קרב + רצף פרומפטים + SKILL.md, עם בחירת DNA אוטומטית; טייס אוטומטי שלב-אחר-שלב (resumable, נעול מפני תחרות); דיווח שדה → זיקוק AI → **לידת DNA חדש** שנבחר כבר במשימה הבאה |

## לולאת האבולוציה

```
דיווח שדה ──► זיקוק AI ללקחים ──► DNA חדש נולד (field:mission-N)
     ▲                                      │
     │                                      ▼
משימה נשלחת לשדה ◄── הידור: דירוג DNA אוטומטי ◄── הספרייה חכמה יותר
```

כל משימה שמבוצעת מזינה את הספרייה — זיכרון מצטבר שאף סשן Claude רגיל אין לו.

## סטאק

- **Next.js 16** (App Router) + TypeScript 5
- **Prisma + SQLite** — Mission, DnaArtifact, SweepRun, Chimera, SavedRepo, SearchHistory
- **Tailwind CSS 4 + shadcn/ui** — RTL מלא, כהה/בהיר
- **z-ai-web-dev-sdk** — שכבת LLM בצד שרת בלבד (מנוע JSON עם שרשרת תיקון 4-שלבית + timeout ללא retry)
- **GitHub REST** — קצב מבוקש למכסות, backoff אקספוננציאלי, העשרה במקביל מרוסן

## הרצה

```bash
bun install
# משתני סביבה: DATABASE_URL (SQLite) ב-.env
bunx prisma db push
bun run dev
```

פתח את האפליקציה, הדבק Personal Access Token של GitHub בכרטיס בראש העמוד — הוא נשמר בשרת (מוצפן ב-DB, מוצג ממוסכם בלבד) ואז כל היכולות נפתחות: חיפוש מורחב, כרייה, סריקות עומק.

## מפת API

| נתיב | פעולה |
|---|---|
| `POST /api/search` | חיפוש repos/code עם מסננים + חסימת 4.x בשרת |
| `GET /api/analyze?owner&repo` | ניתוח עומק מלא של ריפו |
| `GET/POST /api/sweep` · `GET/DELETE /api/sweep/[id]` · `POST /api/sweep/[id]/audit` | סריקות עומק + ביקורת אדברסרית |
| `GET /api/dna-library` (`?full=1`, `?repo=`) · `GET /api/dna-library/[id]` | ספריית ה-DNA (מצב קל = substr ב-SQL) |
| `POST /api/genesis/mine` · `POST /api/genesis/synthesize` · `GET /api/genesis/chimeras` | כרייה, כימרה, היסטוריה |
| `GET/POST /api/mission` · `GET/PATCH/DELETE /api/mission/[id]` · `POST /api/mission/[id]/autopilot[/step]` · `POST /api/mission/report` | Mission Control מלא |
| `GET/DELETE /api/settings/token` | ניהול טוקן (מוסכם) |
| `GET /api/export/pack` | קודקס ה-DNA — Markdown אחד להזרקה בכל פרויקט |

## ארכיטקטורת הגנה

- **חסימת סף בשרת** — `isBlockedModelString` זורק מסנן 4.x לפני שהוא מגיע ל-GitHub
- **ראיות מופרדות** — `contentEvidence` (מחרוזת מודל בתוך קובץ אמיתי = hard) מול `textEvidence` (אזכור בתיאור = soft שלא מקודם ל-elite)
- **נעילות תחרות** — autopilot נעול פר-משימה, פתיחת סריקה נעולה מפני POST כפול
- **ללא TOCTOU** — update/delete ישירים עם P2025 → 404
- **טוקן לעולם לא נכנס ל-git** — `db/` ו-`*.db` מנוטרלים ב-.gitignore

---

כלי הצידה הזה הוא הציוד — לא מחליט ההחלטה.
