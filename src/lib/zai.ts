// ============================================================
// Singleton ל-SDK ה-AI — מקור יחיד לחיבור.
// בעבר: ZAI.create() נקרא בכל קריאת LLM (פעמיים בהידור משימה אחת!)
// — עלות אתחול מיותרת והזדמנות לדליפת חיבורים. עכשיו: מופע אחד
// מאוחסן בפרומיס, משותף לכל הבקשות בתהליך.
// צד שרת בלבד.
// ============================================================

import ZAI from "z-ai-web-dev-sdk";

let cached: Promise<Awaited<ReturnType<typeof ZAI.create>>> | null = null;

export function getZai(): Promise<Awaited<ReturnType<typeof ZAI.create>>> {
  if (!cached) {
    cached = ZAI.create().catch((e) => {
      // איפוס המטמון בכישלון — הקריאה הבאה תנסה ליצור מחדש
      cached = null;
      throw e;
    });
  }
  return cached;
}
