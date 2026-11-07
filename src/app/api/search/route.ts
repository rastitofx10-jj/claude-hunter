import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GhError, ghFetch, computeListScore, isBlockedModelString, THRESHOLD_RULE_TEXT } from "@/lib/github";
import type { SearchBody, ScoredRepo, RepoCore, CodeMatch } from "@/lib/hunter-types";
import { captureTokenFrom, resolveToken } from "@/lib/server-token";

export const dynamic = "force-dynamic";

interface GhRepoItem {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  watchers_count?: number;
  open_issues_count?: number;
  language: string | null;
  topics?: string[];
  pushed_at: string;
  created_at: string;
  size: number;
  archived: boolean;
  license?: { spdx_id?: string } | null;
  owner: { login: string; type?: string; avatar_url?: string };
}

interface GhCodeItem {
  name: string;
  path: string;
  html_url: string;
  repository?: GhRepoItem;
}

interface GhSearchResp<T> {
  total_count: number;
  incomplete_results: boolean;
  items: T[];
}

function mapRepo(r: GhRepoItem): RepoCore {
  return {
    id: r.id,
    fullName: r.full_name,
    owner: r.owner ? { login: r.owner.login, type: r.owner.type, avatar_url: r.owner.avatar_url } : undefined,
    htmlUrl: r.html_url,
    description: r.description,
    stars: r.stargazers_count ?? 0,
    forks: r.forks_count ?? 0,
    watchers: r.watchers_count,
    openIssues: r.open_issues_count,
    language: r.language,
    topics: r.topics ?? [],
    pushedAt: r.pushed_at,
    createdAt: r.created_at,
    size: r.size,
    archived: r.archived,
    license: r.license?.spdx_id ?? null,
  };
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const token = await resolveToken(req);
  let body: SearchBody;
  try {
    body = (await req.json()) as SearchBody;
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו תקין" }, { status: 400 });
  }

  const mode = body.mode === "code" ? "code" : "repos";
  const perPage = Math.min(Math.max(body.perPage ?? 24, 6), 60);
  const page = Math.max(body.page ?? 1, 1);

  // ⛔ חסימת שרת מחמירה: מסנן מודל מתחת לסף (4.x ומטה) נדחה מיד
  if (body.model?.trim() && isBlockedModelString(body.model.trim())) {
    return NextResponse.json(
      { error: `⛔ מודל חסום: ${THRESHOLD_RULE_TEXT}` },
      { status: 400 }
    );
  }

  const parts: string[] = [];
  const q = (body.query ?? "").trim();
  if (q) parts.push(q);
  for (const t of body.topics ?? []) if (t.trim()) parts.push(`topic:${t.trim()}`);
  if (body.model?.trim()) parts.push(`"${body.model.trim()}"`);
  if (body.language?.trim()) parts.push(`language:${body.language.trim()}`);

  if (mode === "repos") {
    if (body.minStars && body.minStars > 0) parts.push(`stars:>=${body.minStars}`);
    if (body.pushedWithinDays && body.pushedWithinDays > 0) parts.push(`pushed:>=${daysAgoIso(body.pushedWithinDays)}`);
    parts.push("fork:false");
  } else {
    // code search needs at least one term, not only qualifiers
    const hasTerm = q || body.model?.trim();
    if (!hasTerm && (body.hasClaudeMd || (body.topics?.length ?? 0) > 0)) parts.push("claude");
    if (body.hasClaudeMd) parts.push("filename:CLAUDE.md");
    if (!q && !body.model?.trim() && !body.hasClaudeMd) {
      return NextResponse.json(
        { error: "בחיפוש קוד נדרש טקסט, מודל, או סימון CLAUDE.md" },
        { status: 400 }
      );
    }
  }

  const querySent = parts.join(" ").trim();
  if (!querySent) {
    return NextResponse.json({ error: "נדרש תנאי חיפוש אחד לפחות" }, { status: 400 });
  }

  const sortQ = mode === "repos" && body.sort && body.sort !== "best" ? `&sort=${body.sort}&order=desc` : "";

  try {
    if (mode === "repos") {
      const data = await ghFetch<GhSearchResp<GhRepoItem>>(
        `/search/repositories?q=${encodeURIComponent(querySent)}&per_page=${perPage}&page=${page}${sortQ}`,
        token
      );
      // הטוקן מהכותרת עבר אימות מול GitHub — נשמר לשימוש השרת
      await captureTokenFrom(req);
      // ⛔ חוק החסימה המלאה: מאגרים שמציגים *רק* מודלי 4.x ומטה — מוסתרים לחלוטין מהתוצאות
      let items: ScoredRepo[] = [];
      let blockedHidden = 0;
      for (const r of data.items) {
        const core = mapRepo(r);
        const s = computeListScore(core);
        if (s.blockedOnly) {
          blockedHidden++;
          continue;
        }
        items.push({ ...core, score: s.score, tier: s.tier, reasons: s.reasons });
      }
      if (body.ownerType && body.ownerType !== "any") {
        items = items.filter((i) => i.owner?.type === (body.ownerType === "user" ? "User" : "Organization"));
      }
      // save history (best effort)
      try {
        await db.searchHistory.create({
          data: {
            mode,
            query: querySent,
            filters: JSON.stringify(body),
            resultCount: items.length,
          },
        });
      } catch {
        // history is non critical
      }
      return NextResponse.json({
        mode,
        totalMatches: data.total_count,
        items,
        querySent,
        blockedHidden,
      });
    }

    // ---- code mode ----
    if (!token) {
      return NextResponse.json(
        { error: "חיפוש קוד ב-GitHub דורש Personal Access Token. הוסף אותו בהגדרות (חינם, 30 שניות)." },
        { status: 401 }
      );
    }
    const data = await ghFetch<GhSearchResp<GhCodeItem>>(
      `/search/code?q=${encodeURIComponent(querySent)}&per_page=100&page=1`,
      token
    );
    // הטוקן מהכותרת עבר אימות מול GitHub — נשמר לשימוש השרת
    await captureTokenFrom(req);

    const groups = new Map<string, { repo: RepoCore; matches: CodeMatch[] }>();
    for (const item of data.items ?? []) {
      const r = item.repository;
      if (!r?.full_name) continue;
      const g = groups.get(r.full_name);
      const match: CodeMatch = { path: item.path, htmlUrl: item.html_url };
      if (g) {
        g.matches.push(match);
      } else {
        groups.set(r.full_name, { repo: mapRepo(r), matches: [match] });
      }
    }

    // ⛔ חוק החסימה המלאה גם במצב קוד: מאגרים שמציגים רק 4.x — מוסתרים
    let blockedHidden = 0;
    let items: ScoredRepo[] = [];
    for (const { repo, matches } of groups.values()) {
      const s = computeListScore(repo);
      if (s.blockedOnly) {
        blockedHidden++;
        continue;
      }
      items.push({ ...repo, score: s.score, tier: s.tier, reasons: s.reasons, matches: matches.slice(0, 4), matchCount: matches.length });
    }

    if (body.ownerType && body.ownerType !== "any") {
      items = items.filter((i) => i.owner?.type === (body.ownerType === "user" ? "User" : "Organization"));
    }
    if (body.sort === "stars") items.sort((a, b) => b.stars - a.stars);
    else if (body.sort === "updated") items.sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));
    else if (body.sort === "forks") items.sort((a, b) => b.forks - a.forks);
    else if (body.sort === "best" || !body.sort) items.sort((a, b) => b.score - a.score);
    items = items.slice(0, 30);

    try {
      await db.searchHistory.create({
        data: {
          mode,
          query: querySent,
          filters: JSON.stringify(body),
          resultCount: items.length,
        },
      });
    } catch {
      // non critical
    }

    return NextResponse.json({
      mode,
      totalMatches: data.total_count,
      repoCount: groups.size,
      items,
      note: "חיפוש קוד מחזיר עד 100 קבצים לשאילתה; התוצאות מקובצות לפי מאגר ומדורגות לפי מדד ההשקעה",
      querySent,
      blockedHidden,
    });
  } catch (e) {
    if (e instanceof GhError) {
      return NextResponse.json({ error: e.message }, { status: e.status === 422 ? 400 : e.status });
    }
    console.error("search failed", e);
    return NextResponse.json({ error: "החיפוש נכשל. נסה שוב." }, { status: 500 });
  }
}
