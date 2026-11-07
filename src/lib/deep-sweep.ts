// ============================================================
// מנוע סריקת עומק — Claude Hunter
// סבב מודיעין מקצועי מלא: ארסנל שאילתות רחב (קוד + מאגרים)
// ← העשרת מטא-דאטה ← דירוג מבוסס ראיות ← כריית DNA.
// זה הצעד מ"שתי שאילתות קבועות" לארסנל אמיתי שמתעדכן מרישום המודלים.
// פועל בצד שרת בלבד.
// ============================================================

import { ghFetch, GhError, computeListScore, tierOf, type TierKey } from "./github";
import { QUALIFYING_MODELS, detectClaudeModels } from "./claude-models";
import { harvestRepo } from "./harvester";
import { db } from "./db";

// ---------- ארסנל השאילתות ----------

export interface SweepQuery {
  q: string;
  kind: "code" | "repo";
  /** מאיפה השאילתה: registry (מודל רשום) | capability | topic | market */
  origin: string;
}

/** בונה את ארסנל השאילתות המלא מתוך רישום המודלים — תמיד מסונכרן עם הסף */
export function buildQueryArsenal(): SweepQuery[] {
  const queries: SweepQuery[] = [];

  // 1. כל מחרוזת חיפוש של כל מודל מזכה — חיפוש קוד ישיר (הראיה הקשה)
  for (const m of QUALIFYING_MODELS) {
    for (const s of m.searchStrings) {
      queries.push({ q: s, kind: "code", origin: `registry:${m.id}` });
    }
  }

  // 2. שאילתות יכולת — קבצי יכולת Claude עם מחרוזות פרימיום
  queries.push(
    { q: "SKILL.md claude", kind: "code", origin: "capability" },
    { q: "claude-code commands", kind: "code", origin: "capability" },
    { q: "claude agents orchestration", kind: "code", origin: "capability" },
    { q: "anthropic max tokens opus", kind: "code", origin: "capability" },
  );

  // 3. חיפושי מאגרים — השוק הרחב של פרויקטי Claude פעילים
  const monthAgo = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  queries.push(
    { q: `claude opus 5.5 stars:>5 pushed:>${monthAgo}`, kind: "repo", origin: "market" },
    { q: `claude fable stars:>3 pushed:>${monthAgo}`, kind: "repo", origin: "market" },
    { q: `claude code agent stars:>100 pushed:>${monthAgo}`, kind: "repo", origin: "market" },
    { q: `topic:claude-code stars:>30`, kind: "repo", origin: "topic" },
    { q: `topic:claude-agents stars:>10`, kind: "repo", origin: "topic" },
    { q: `topic:mcp topic:claude stars:>10`, kind: "repo", origin: "topic" },
    { q: `anthropic premium api integration stars:>20 pushed:>${monthAgo}`, kind: "repo", origin: "market" },
  );

  return queries;
}

// ---------- גילוי מועמדים ----------

export interface CodeHit {
  path: string;
  repo: string;
  capability: boolean;
}

export interface RepoHit {
  fullName: string;
  description: string | null;
  stars: number;
  pushedAt: string | null;
  topics: string[];
}

export interface Candidate {
  fullName: string;
  stars: number;
  description: string | null;
  pushedAt: string | null;
  topics: string[];
  /** מחרוזות מודל מזכה שנמצאו במקורות שונים */
  modelStrings: string[];
  /** כמה קבצי יכולת נתגלו (SKILL.md, .claude/ וכו') */
  capabilityHits: number;
  /** דיוק ראיית המודל: hard (מחרוזת מודל בקוד) | soft (אזכור claude בתיאור) | none */
  evidence: "hard" | "soft" | "none";
  alreadyMined: boolean;
  score: number;
  /** מקורות הגילוי */
  via: string[];
}

interface GhCodeItem {
  path: string;
  repository?: {
    full_name: string;
    stargazers_count?: number;
    pushed_at?: string;
    description?: string | null;
  };
}

interface GhRepoItem {
  full_name: string;
  description?: string | null;
  stargazers_count?: number;
  pushed_at?: string;
  topics?: string[];
}

interface GhSearchResp<T> {
  total_count: number;
  items: T[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * קריאת חיפוש עם התאוששות ממכסה: GitHub מתיר 30 חיפושים/דקה.
 * 403/429 מכסה ← המתנה אקספוננציאלית (8s/16s/32s) וניסיון חוזר — במקום לאבד את השאילתה.
 */
async function searchWithBackoff<T>(path: string, token: string | null): Promise<T> {
  const delays = [8_000, 16_000, 32_000];
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await ghFetch<T>(path, token);
    } catch (e) {
      lastErr = e;
      const isRateLimit = e instanceof GhError && (e.status === 403 || e.status === 429);
      if (!isRateLimit || attempt === delays.length) throw e;
      await sleep(delays[attempt]);
    }
  }
  throw lastErr;
}

function isCapabilityPath(path: string): boolean {
  const p = path.toLowerCase();
  return (
    p.includes("skill.md") ||
    p.includes(".claude/commands/") ||
    p.includes(".claude/agents/") ||
    p === "claude.md" ||
    p === "agents.md"
  );
}

/**
 * שלב א׳ — ירי כל השאילתות בקצב בטוח למכסת החיפוש (30/דקה),
 * עם דיווח התקדמות אחרי כל שאילתה.
 */
export interface QueryReport {
  q: string;
  kind: string;
  origin: string;
  count: number;
  error?: string;
}

export async function runQueryArsenal(
  token: string | null,
  queries: SweepQuery[],
  onProgress: (report: QueryReport, done: number, total: number) => Promise<void> | void
): Promise<{ reports: QueryReport[]; codeHits: CodeHit[]; repoHits: RepoHit[] }> {
  const reports: QueryReport[] = [];
  const codeHits: CodeHit[] = [];
  const repoHits: RepoHit[] = [];
  const seenCode = new Set<string>(); // repo:path dedup

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    let report: QueryReport = { q: query.q, kind: query.kind, origin: query.origin, count: 0 };
    try {
      if (query.kind === "code") {
        const resp = await searchWithBackoff<GhSearchResp<GhCodeItem>>(
          `/search/code?q=${encodeURIComponent(query.q)}&per_page=100&page=1`,
          token
        );
        report.count = resp.total_count ?? 0;
        for (const item of resp.items ?? []) {
          const r = item.repository;
          if (!r?.full_name) continue;
          const key = `${r.full_name}::${item.path}`;
          if (seenCode.has(key)) continue;
          seenCode.add(key);
          codeHits.push({ path: item.path, repo: r.full_name, capability: isCapabilityPath(item.path) });
        }
      } else {
        const resp = await searchWithBackoff<GhSearchResp<GhRepoItem>>(
          `/search/repositories?q=${encodeURIComponent(query.q)}&per_page=50&page=1`,
          token
        );
        report.count = resp.total_count ?? 0;
        for (const item of resp.items ?? []) {
          repoHits.push({
            fullName: item.full_name,
            description: item.description ?? null,
            stars: item.stargazers_count ?? 0,
            pushedAt: item.pushed_at ?? null,
            topics: item.topics ?? [],
          });
        }
      }
    } catch (e) {
      report = { ...report, count: 0, error: e instanceof Error ? e.message : "שגיאה" };
    }
    reports.push(report);
    await onProgress(report, i + 1, queries.length);
    // קצב בטוח למכסת החיפוש של GitHub (30 לדקה)
    if (i < queries.length - 1) await sleep(2100);
  }

  return { reports, codeHits, repoHits };
}

/** ציון ראיות למחרוזת מודל: משקל לפי הרישום */
function modelStringWeight(s: string): number {
  const lower = s.toLowerCase();
  for (const m of QUALIFYING_MODELS) {
    if (m.searchStrings.some((x) => x.toLowerCase() === lower)) return m.weight;
  }
  const det = detectClaudeModels(lower);
  if (det.qualifying.length > 0) return det.qualifying[0].weight;
  return 0;
}

/** שלב ב׳ — איחוד גילויים למועמדים מדורגים לפי ראיות */
export function consolidateCandidates(
  codeHits: CodeHit[],
  repoHits: RepoHit[]
): Candidate[] {
  const map = new Map<string, Candidate>();

  const ensure = (fullName: string): Candidate => {
    let c = map.get(fullName);
    if (!c) {
      c = {
        fullName,
        stars: 0,
        description: null,
        pushedAt: null,
        topics: [],
        modelStrings: [],
        capabilityHits: 0,
        evidence: "none",
        alreadyMined: false,
        score: 0,
        via: [],
      };
      map.set(fullName, c);
    }
    return c;
  };

  for (const hit of codeHits) {
    const c = ensure(hit.repo);
    if (hit.capability) c.capabilityHits++;
    const detected = detectClaudeModels(hit.path).qualifying;
    for (const d of detected) if (!c.modelStrings.includes(d.id)) c.modelStrings.push(d.id);
    if (!c.via.includes("code")) c.via.push("code");
  }

  for (const hit of repoHits) {
    const c = ensure(hit.fullName);
    c.stars = Math.max(c.stars, hit.stars);
    c.description = hit.description ?? c.description;
    c.pushedAt = hit.pushedAt ?? c.pushedAt;
    c.topics = Array.from(new Set([...c.topics, ...hit.topics]));
    if (!c.via.includes("repo")) c.via.push("repo");
    const hay = [hit.fullName, hit.description ?? "", hit.topics.join(" ")].join(" ");
    const detected = detectClaudeModels(hay).qualifying;
    for (const d of detected) if (!c.modelStrings.includes(d.id)) c.modelStrings.push(d.id);
  }

  const candidates = Array.from(map.values());
  for (const c of candidates) {
    const listScore = computeListScore({
      fullName: c.fullName,
      description: c.description,
      stars: c.stars,
      forks: 0,
      topics: c.topics,
      pushedAt: c.pushedAt ?? undefined,
    });
    const modelEvidence = c.modelStrings.reduce((s, id) => {
      const m = QUALIFYING_MODELS.find((x) => x.id === id);
      return s + (m ? m.weight / 10 : 12 / 10);
    }, 0);
    c.evidence = c.modelStrings.length > 0 ? "hard" : c.via.includes("code") ? "soft" : "none";
    c.score = Math.round(
      modelEvidence * 6 + c.capabilityHits * 4 + listScore.score + Math.log10(c.stars + 1) * 4
    );
  }

  // ראייה קשה קודמת תמיד, אחר כך ציון
  const evRank = { hard: 0, soft: 1, none: 2 } as const;
  candidates.sort((a, b) => evRank[a.evidence] - evRank[b.evidence] || b.score - a.score);
  return candidates;
}

/** העשרה — מטא-דאטה אמיתית למועמדים המובילים */
export async function enrichCandidates(
  candidates: Candidate[],
  token: string | null,
  topN = 30
): Promise<number> {
  const targets = candidates.slice(0, topN);
  let enriched = 0;
  for (let i = 0; i < targets.length; i += 6) {
    const batch = targets.slice(i, i + 6);
    await Promise.allSettled(
      batch.map(async (c) => {
        try {
          const meta = await ghFetch<{
            stargazers_count: number;
            pushed_at: string;
            description: string | null;
            topics?: string[];
          }>(`/repos/${c.fullName}`, token);
          c.stars = meta.stargazers_count ?? c.stars;
          c.pushedAt = meta.pushed_at ?? c.pushedAt;
          c.description = meta.description ?? c.description;
          c.topics = Array.from(new Set([...c.topics, ...(meta.topics ?? [])]));
          enriched++;
        } catch {
          // מאגר שנמחק/פרטי — נשאר עם מה שיש
        }
      })
    );
    await sleep(400);
  }
  // דירוג מחדש אחרי העשרה
  const evRank = { hard: 0, soft: 1, none: 2 } as const;
  candidates.sort((a, b) => evRank[a.evidence] - evRank[b.evidence] || b.score - a.score);
  return enriched;
}

// ---------- כרייה ----------

export interface MinedRepoReport {
  repo: string;
  artifacts: number;
  newCount: number;
  updatedCount: number;
  kinds: string[];
  error?: string;
}

/** שלב ג׳ — כריית top-N מאגרים טריים לתוך הספרייה */
export async function mineTopCandidates(
  candidates: Candidate[],
  token: string | null,
  maxRepos = 8,
  onProgress?: (done: number, total: number, report: MinedRepoReport) => Promise<void> | void
): Promise<MinedRepoReport[]> {
  const minedNames = new Set(
    (
      await db.dnaArtifact.findMany({
        select: { sourceRepo: true },
        distinct: ["sourceRepo"],
      })
    ).map((x) => x.sourceRepo)
  );
  const fresh = candidates.filter((c) => !minedNames.has(c.fullName)).slice(0, maxRepos);
  const reports: MinedRepoReport[] = [];

  for (let i = 0; i < fresh.length; i += 2) {
    const batch = fresh.slice(i, i + 2);
    const results = await Promise.allSettled(batch.map((c) => harvestRepo(c.fullName, token)));
    results.forEach((r, j) => {
      const c = batch[j];
      if (r.status === "fulfilled") {
        const v = r.value;
        const rep: MinedRepoReport = {
          repo: v.repo,
          artifacts: v.artifacts,
          newCount: v.newCount,
          updatedCount: v.updatedCount,
          kinds: v.kinds,
        };
        reports.push(rep);
        void onProgress?.(reports.length, fresh.length, rep);
      } else {
        const rep: MinedRepoReport = {
          repo: c.fullName,
          artifacts: 0,
          newCount: 0,
          updatedCount: 0,
          kinds: [],
          error: r.reason instanceof Error ? r.reason.message : "כרייה נכשלה",
        };
        reports.push(rep);
        void onProgress?.(reports.length, fresh.length, rep);
      }
    });
  }
  return reports;
}

// ---------- דוח שטוח ללהקת הפרומפטים ----------

export interface CandidateFlat {
  fullName: string;
  stars: number;
  description: string | null;
  pushedAt: string | null;
  topics: string[];
  modelStrings: string[];
  capabilityHits: number;
  evidence: Candidate["evidence"];
  score: number;
  tier: TierKey;
  tierLabel: string;
}

export function flattenForSwarm(candidates: Candidate[]): CandidateFlat[] {
  return candidates.map((c) => {
    const t = tierOf(Math.min(100, c.score));
    return {
      fullName: c.fullName,
      stars: c.stars,
      description: c.description,
      pushedAt: c.pushedAt,
      topics: c.topics.slice(0, 8),
      modelStrings: c.modelStrings,
      capabilityHits: c.capabilityHits,
      evidence: c.evidence,
      score: c.score,
      tier: t.key,
      tierLabel: t.label,
    };
  });
}
