import { NextResponse } from "next/server";
import { runWeeklyReport } from "../../../../lib/core.js";
import { sendReportEmail } from "../../../../lib/pdf.js";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let accounts = {};
  try { accounts = JSON.parse(process.env.SM_ACCOUNTS || "{}"); } catch {}
  const report = await runWeeklyReport(new Date(), accounts);
  try { await sendReportEmail(report); } catch (e) { console.error("email digest failed:", e); }
  return NextResponse.json({
    ok: true, weekOf: report.weekOf, spendTotal: report.spend.total,
    recommendations: report.recommendations.length, errors: report.dataQuality.errors,
  });
}

export const GET = handle;
export const POST = handle;
