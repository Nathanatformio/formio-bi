/**
 * TEMPORARY diagnostic. Minimal query with fields as a COMMA-STRING (per docs)
 * and optional account, to isolate the UNKNOWN_FAILURE cause.
 * Usage: /api/sources?ds=AW&acct=1910468848
 * Safe to delete once SOURCES in lib/core.js is finalized.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const key = process.env.SUPERMETRICS_API_KEY;
  if (!key) return NextResponse.json({ error: "SUPERMETRICS_API_KEY not set" }, { status: 500 });
  const url = new URL(req.url);
  const ds = url.searchParams.get("ds") || "AW";
  const acct = url.searchParams.get("acct") || undefined;
  const base = "https://api.supermetrics.com/enterprise/v2";
  const payload = {
    ds_id: ds,
    ds_accounts: acct,
    start_date: "2026-06-22",
    end_date: "2026-06-28",
    fields: "date, clicks",
    max_rows: 5,
  };
  try {
    const res = await fetch(`${base}/query/data/json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 3000); }
    return NextResponse.json({ ds, acct: acct ?? null, status: res.status, body });
  } catch (e) {
    return NextResponse.json({ ds, error: String(e?.message ?? e) }, { status: 500 });
  }
}
