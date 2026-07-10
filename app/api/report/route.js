import { NextResponse } from "next/server";
import { getLatest } from "../../../lib/core.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await getLatest();
  if (!report) return NextResponse.json({ error: "no report yet — run the weekly job" }, { status: 404 });
  return NextResponse.json(report);
}
