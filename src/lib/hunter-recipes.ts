import type { SearchBody } from "./hunter-types";

export interface Recipe {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  body: Partial<SearchBody>;
  analyze?: { owner: string; repo: string };
}

export const RECIPES: Recipe[] = [
  {
    id: "hot-claude-code",
    emoji: "🔥",
    title: "פרויקטי Claude Code חמים",
    desc: "מאגרים עם topic claude-code, מעודכנים ב-90 הימים האחרונים, ממוינים לפי כוכבים",
    body: { mode: "repos", query: "claude code", topics: ["claude-code"], minStars: 5, pushedWithinDays: 90, sort: "stars" },
  },
  {
    id: "opus55-code",
    emoji: "🧠",
    title: "קוד שמריץ Opus 5.5",
    desc: "חיפוש קוד על claude-opus-5-5 — הראיה הישירה לשימוש במודל דגל 5.5+ (הסף המחמיר)",
    body: { mode: "code", model: "claude-opus-5-5" },
  },
  {
    id: "opus6-code",
    emoji: "🚀",
    title: "קוד שמריץ Opus 6",
    desc: "חיפוש קוד על claude-opus-6 — פרויקטים על הדור החדש ביותר, מעל הסף",
    body: { mode: "code", model: "claude-opus-6" },
  },
  {
    id: "anthropic-key",
    emoji: "🔑",
    title: "מפתח Anthropic ב-.env.example",
    desc: "ראיה לחיבור API בתשלום של Anthropic",
    body: { mode: "code", query: "ANTHROPIC_API_KEY", hasClaudeMd: false },
  },
  {
    id: "claudemd",
    emoji: "📄",
    title: "מאגרים עם CLAUDE.md",
    desc: "חיפוש קוד לקובץ ההוראות של Claude Code — סימן לפיתוח סריאלי עם קלוד",
    body: { mode: "code", hasClaudeMd: true },
  },
  {
    id: "official-sdk",
    emoji: "🏗️",
    title: "SDK רשמי ב-package.json",
    desc: "@anthropic-ai/sdk בקבצי package.json — אפליקציות שנבנו על ה-API",
    body: { mode: "code", query: "\"@anthropic-ai/sdk\"", language: "JSON" },
  },
  {
    id: "mcp-claude",
    emoji: "🔌",
    title: "שרתי MCP עם Claude",
    desc: "topic mcp-server + אזכור claude, ממוין לפי כוכבים",
    body: { mode: "repos", topics: ["mcp-server"], query: "claude", minStars: 10, sort: "stars" },
  },
  {
    id: "fable",
    emoji: "✨",
    title: "מודלי Fable — פרימיום מקסימלי",
    desc: "חיפוש קוד למחרוזת claude-fable — המודל המוביל מעל סף 5.5",
    body: { mode: "code", model: "claude-fable" },
  },
  {
    id: "premium-settings",
    emoji: "⚙️",
    title: "הגדרות Claude Code עם Opus 5.5",
    desc: "קבצי settings של Claude Code שמוגדרים על מודלי דגל 5.5+",
    body: { mode: "code", query: "claude-opus-5-5", hasClaudeMd: false },
  },
  {
    id: "analyze-craft",
    emoji: "🎭",
    title: "ניתוח: storytold/craft-anything",
    desc: "ניתוח מעמיק של המאגר שהזכרת",
    body: {},
    analyze: { owner: "storytold", repo: "craft-anything" },
  },
  {
    id: "analyze-public-apis",
    emoji: "📚",
    title: "ניתוח: public-apis/public-apis",
    desc: "ניתוח מעמיק של רשימת ה-APIs הציבוריים הגדולה",
    body: {},
    analyze: { owner: "public-apis", repo: "public-apis" },
  },
];
