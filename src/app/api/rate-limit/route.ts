import { NextRequest, NextResponse } from "next/server";
import { GhError, ghFetch } from "@/lib/github";
import { captureTokenFrom, resolveToken } from "@/lib/server-token";
import type { RateInfo, RateWindow } from "@/lib/hunter-types";

export const dynamic = "force-dynamic";

interface RateLimitResp {
  resources: {
    core?: RateWindow;
    search?: RateWindow;
    code_search?: RateWindow;
  };
}

export async function GET(req: NextRequest) {
  const token = await resolveToken(req);
  try {
    const data = await ghFetch<RateLimitResp>("/rate_limit", token);
    // הטוקן מהכותרת עבר אימות מול GitHub — נשמר לשימוש השרת
    await captureTokenFrom(req);
    const info: RateInfo = {
      hasToken: !!token,
      core: data.resources?.core,
      search: data.resources?.search,
      codeSearch: data.resources?.code_search,
    };
    return NextResponse.json(info);
  } catch (e) {
    const msg = e instanceof GhError ? e.message : "בדיקת המכסה נכשלה";
    const status = e instanceof GhError ? e.status : 500;
    return NextResponse.json({ hasToken: !!token, error: msg } satisfies RateInfo, { status });
  }
}
