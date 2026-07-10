/**
 * TEMPORARY diagnostic route. Lists the account's available Supermetrics data
 * sources (id + name) so we can map the correct ds_id for each connector.
 * Also surfaces the auth status — a 200 confirms SUPERMETRICS_API_KEY works.
 * Safe to delete once SOURCES in lib/core.js is finalized.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.SUPERMETRICS_API_KEY;
  if (!key) return NextResponse.json({ error: "SUPERMETRICS_API_KEY not set" }, { status: 500 });
  const base = "https://api.supermetrics.com/enterprise/v2";
  try {
    const res = await fetch(`${base}/datasource/search?filter%5Bproduct%5D=API`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 2000); }
    return NextResponse.json({ authStatus: res.status, body });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
