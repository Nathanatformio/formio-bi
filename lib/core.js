/**
 * Form.io BI engine — consolidated core (no React deps).
 * Contains: formatters, date windows, Supermetrics data layer, metrics,
 * insights, snapshot store, and the weekly orchestrator.
 * PDF/email live in ./pdf.js so this stays free of heavy render deps.
 */
import { promises as fs } from "fs";
import path from "path";

/* ============================== FORMATTERS ============================== */
export const money = (x) => (x === null || x === undefined ? "—" : `$${Math.round(x).toLocaleString()}`);
export const pct = (x) => (x === null || x === undefined ? "—" : `${(x * 100).toFixed(1)}%`);
export const mult = (x) => (x === null || x === undefined ? "—" : `${x.toFixed(1)}x`);
export const delta = (x) => {
  if (x === null || x === undefined) return "—";
  const arrow = x > 0 ? "▲" : x < 0 ? "▼" : "▬";
  return `${arrow} ${Math.abs(x * 100).toFixed(1)}%`;
};
export const num = (x) => (x === null || x === undefined ? "—" : Math.round(x).toLocaleString());

/* ================================ DATES ================================= */
const toISO = (d) => d.toISOString().slice(0, 10);
export function mondayOf(d) {
  const date = new Date(d);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
export function reportingWindows(now = new Date()) {
  const thisMonday = mondayOf(now);
  const currStart = new Date(thisMonday); currStart.setUTCDate(currStart.getUTCDate() - 7);
  const currEnd = new Date(thisMonday); currEnd.setUTCDate(currEnd.getUTCDate() - 1);
  const prevStart = new Date(currStart); prevStart.setUTCDate(prevStart.getUTCDate() - 7);
  const prevEnd = new Date(currStart); prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  return {
    current: { startDate: toISO(currStart), endDate: toISO(currEnd) },
    previous: { startDate: toISO(prevStart), endDate: toISO(prevEnd) },
    weekOf: toISO(currStart),
  };
}

/* =========================== SUPERMETRICS ============================== */
const API_BASE = "https://api.supermetrics.com/enterprise/v2";
export const SOURCES = [
  { key: "google_ads", label: "Google Ads", dsId: "AW", supportsConversions: true,
    fields: ["date", "campaign", "cost", "impressions", "clicks", "conversions", "conversionvalue"] },
  { key: "linkedin_ads", label: "LinkedIn Ads", dsId: "LNA", supportsConversions: true,
    fields: ["date", "campaign_group", "cost", "impressions", "clicks", "conversions", "conversion_value"] },
  { key: "ga4", label: "Google Analytics 4", dsId: "GA4", supportsConversions: true, isAnalytics: true,
    fields: ["date", "sessionDefaultChannelGroup", "sessions", "conversions", "totalRevenue"] },
  { key: "microsoft_ads", label: "Microsoft Ads", dsId: "MSFT", supportsConversions: true,
    fields: ["date", "campaign", "spend", "impressions", "clicks", "conversions", "revenue"] },
  { key: "chatgpt_ads", label: "ChatGPT Ads", dsId: "CGA", supportsConversions: false,
    fields: ["date", "campaign", "spend", "impressions", "clicks"] },
];

function canonicalize(source, raw) {
  const n = (v) => (v === undefined || v === null || v === "" ? null : Number(v));
  const pick = (...keys) => { for (const k of keys) if (raw[k] !== undefined) return n(raw[k]); return null; };
  return {
    source: source.label,
    date: raw.date ?? raw.Date ?? null,
    spend: pick("cost", "spend", "Cost", "Spend"),
    impressions: pick("impressions", "Impressions"),
    clicks: pick("clicks", "Clicks", "sessions", "Sessions"),
    conversions: source.supportsConversions ? pick("conversions", "Conversions") : null,
    revenue: source.supportsConversions ? pick("conversionvalue", "conversion_value", "revenue", "totalRevenue") : null,
  };
}
function rowsToObjects(data) {
  if (!Array.isArray(data) || data.length === 0) return [];
  const [headers, ...rows] = data;
  return rows.map((row) => headers.reduce((o, h, i) => ((o[h] = row[i]), o), {}));
}
export async function fetchSource(source, { startDate, endDate, accounts }) {
  const apiKey = process.env.SUPERMETRICS_API_KEY;
  if (!apiKey) throw new Error("SUPERMETRICS_API_KEY is not set");
  const payload = { ds_id: source.dsId, ds_accounts: accounts?.[source.key] ?? undefined,
    start_date: startDate, end_date: endDate, fields: source.fields, max_rows: 1000 };
  try {
    const res = await fetch(`${API_BASE}/query/data/json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) { const b = await res.text(); return { source: source.label, error: `HTTP ${res.status}: ${b.slice(0,200)}` }; }
    const json = await res.json();
    const table = json?.data?.data ?? json?.data ?? json;
    return { source: source.label, supportsConversions: source.supportsConversions,
      rows: rowsToObjects(table).map((o) => canonicalize(source, o)) };
  } catch (err) {
    return { source: source.label, error: String(err?.message ?? err) };
  }
}
export async function fetchAllSources(range, accounts = {}) {
  return Promise.all(SOURCES.map((s) => fetchSource(s, { ...range, accounts })));
}

/* =============================== METRICS =============================== */
const sum = (rows, k) => rows.reduce((t, r) => t + (typeof r[k] === "number" ? r[k] : 0), 0);
const hasAny = (rows, k) => rows.some((r) => r[k] !== null && r[k] !== undefined);
const ratio = (nu, de) => (de ? nu / de : null);
const pctDelta = (c, p) => (p === null || p === 0 || c === null ? null : (c - p) / p);

function statBlock(result) {
  const rows = result.rows ?? [];
  const spend = hasAny(rows, "spend") ? sum(rows, "spend") : null;
  const impressions = sum(rows, "impressions");
  const clicks = sum(rows, "clicks");
  const conversions = result.supportsConversions && hasAny(rows, "conversions") ? sum(rows, "conversions") : null;
  const revenue = result.supportsConversions && hasAny(rows, "revenue") ? sum(rows, "revenue") : null;
  return {
    source: result.source, error: result.error ?? null,
    spend, impressions, clicks, conversions, revenue,
    ctr: ratio(clicks, impressions),
    cpc: spend !== null ? ratio(spend, clicks) : null,
    cpa: spend !== null && conversions !== null ? ratio(spend, conversions) : null,
    roas: spend !== null && revenue !== null ? ratio(revenue, spend) : null,
  };
}
export function buildMetrics(currentResults, previousResults) {
  const currByChannel = {}, prevByChannel = {};
  for (const r of currentResults) currByChannel[r.source] = statBlock(r);
  for (const r of previousResults) prevByChannel[r.source] = statBlock(r);

  const spendByChannel = {}; let spendTotal = 0, prevSpendTotal = 0;
  for (const [ch, s] of Object.entries(currByChannel)) {
    if (s.spend !== null) {
      spendByChannel[ch] = { spend: s.spend, wowDelta: pctDelta(s.spend, prevByChannel[ch]?.spend ?? null), share: null };
      spendTotal += s.spend;
    }
  }
  for (const s of Object.values(prevByChannel)) if (s.spend !== null) prevSpendTotal += s.spend;
  for (const ch of Object.keys(spendByChannel)) spendByChannel[ch].share = ratio(spendByChannel[ch].spend, spendTotal);

  const spending = Object.values(currByChannel).filter((s) => s.spend !== null);
  const bClicks = spending.reduce((t, s) => t + (s.clicks || 0), 0);
  const bImpr = spending.reduce((t, s) => t + (s.impressions || 0), 0);
  const bConv = spending.filter((s) => s.conversions !== null).reduce((t, s) => t + s.conversions, 0);
  const bRev = spending.filter((s) => s.revenue !== null).reduce((t, s) => t + s.revenue, 0);

  return {
    spend: { total: spendTotal, wowDelta: pctDelta(spendTotal, prevSpendTotal), byChannel: spendByChannel },
    performance: {
      byChannel: currByChannel, previousByChannel: prevByChannel,
      blended: {
        spend: spendTotal, ctr: ratio(bClicks, bImpr), cpc: ratio(spendTotal, bClicks),
        cpa: bConv ? ratio(spendTotal, bConv) : null, roas: bRev ? ratio(bRev, spendTotal) : null,
        spendWowDelta: pctDelta(spendTotal, prevSpendTotal),
      },
    },
    dataQuality: {
      chatgptAdsConversions: false,
      errors: currentResults.filter((r) => r.error).map((r) => ({ source: r.source, error: r.error })),
    },
  };
}

/* =============================== INSIGHTS ============================== */
const iPct = (x) => (x === null || x === undefined ? "n/a" : `${(x * 100).toFixed(1)}%`);
const iMoney = (x) => (x === null || x === undefined ? "n/a" : `$${Math.round(x).toLocaleString()}`);

function ruleRecommendations(metrics) {
  const recs = [];
  const { byChannel, blended } = metrics.performance;
  for (const [channel, s] of Object.entries(byChannel)) {
    if (s.error) {
      recs.push({ priority: "high", channel, action: `Fix the ${channel} data connection`,
        why: `This week's pull failed (${s.error}). The report is blind on this channel until it's restored.` });
      continue;
    }
    if (s.spend === null) continue;
    const prev = metrics.performance.previousByChannel[channel];
    if (s.cpa !== null && blended.cpa !== null && s.cpa > blended.cpa * 1.3) {
      recs.push({ priority: "high", channel, action: `Tighten targeting or pause weak campaigns in ${channel}`,
        why: `CPA is ${iMoney(s.cpa)}, ~${Math.round((s.cpa / blended.cpa - 1) * 100)}% above the blended ${iMoney(blended.cpa)}. Spend here is buying conversions less efficiently than the portfolio average.` });
    }
    if (s.roas !== null && s.roas > 3) {
      recs.push({ priority: "medium", channel, action: `Increase budget on ${channel}`,
        why: `ROAS is ${s.roas.toFixed(1)}x, well above break-even. There is likely unmet demand to capture with more spend.` });
    }
    if (s.ctr !== null && s.ctr < 0.005 && s.impressions > 1000) {
      recs.push({ priority: "medium", channel, action: `Refresh ad creative on ${channel}`,
        why: `CTR is ${iPct(s.ctr)} on ${s.impressions.toLocaleString()} impressions — below a healthy ~0.5% floor, suggesting creative fatigue or weak message-match.` });
    }
    const spendDelta = prev?.spend ? (s.spend - prev.spend) / prev.spend : null;
    if (spendDelta !== null && Math.abs(spendDelta) > 0.25) {
      recs.push({ priority: "low", channel, action: `Confirm the ${spendDelta > 0 ? "increase" : "drop"} in ${channel} spend was intentional`,
        why: `Spend moved ${iPct(Math.abs(spendDelta))} week-over-week (${iMoney(prev.spend)} → ${iMoney(s.spend)}). Verify it reflects a planned change, not a bid or budget glitch.` });
    }
  }
  if (byChannel["ChatGPT Ads"] && byChannel["ChatGPT Ads"].spend !== null) {
    recs.push({ priority: "low", channel: "ChatGPT Ads", action: "Judge ChatGPT Ads on engagement, not ROAS, for now",
      why: "OpenAI's API does not yet return conversions, so CPA/ROAS are unavailable. Evaluate this channel on CTR/CPC and downstream GA4 signals until conversion data ships." });
  }
  const order = { high: 0, medium: 1, low: 2 };
  return recs.sort((a, b) => order[a.priority] - order[b.priority]);
}
function ruleNarrative(metrics) {
  const { spend, performance } = metrics;
  const dir = spend.wowDelta === null ? "held roughly flat"
    : spend.wowDelta > 0 ? `rose ${iPct(spend.wowDelta)}` : `fell ${iPct(Math.abs(spend.wowDelta))}`;
  const top = Object.entries(spend.byChannel).sort((a, b) => b[1].spend - a[1].spend)[0];
  const roas = performance.blended.roas;
  return [
    `Total spend ${dir} week-over-week to ${iMoney(spend.total)}.`,
    top ? `${top[0]} was the largest channel at ${iMoney(top[1].spend)} (${iPct(top[1].share)} of spend).` : "",
    roas !== null ? `Blended ROAS was ${roas.toFixed(1)}x on measurable channels.` : "Blended ROAS is unavailable this week (no revenue data on spending channels).",
    "See recommendations for where to shift budget next week.",
  ].filter(Boolean).join(" ");
}
async function llmEnrich(metrics, recs) {
  const provider = process.env.LLM_PROVIDER;
  const facts = JSON.stringify({ spend: metrics.spend, blended: metrics.performance.blended, dataQuality: metrics.dataQuality, recommendations: recs }, null, 2);
  const system = "You are a paid-media analyst for Form.io, a developer-tools company. Write for a MIXED audience: lead with a 2-3 sentence executive summary (plain language, no jargon), then a short tactical paragraph for the growth team. Use ONLY the numbers in the provided JSON — never invent figures. Explicitly note that ChatGPT Ads has no conversion data yet if it appears. Return plain prose, no markdown headers.";
  const user = `Here is this week's metrics and rule-derived recommendations as JSON:\n\n${facts}\n\nWrite the weekly narrative.`;
  try {
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: process.env.LLM_MODEL || "gpt-4o", messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.3 }),
        signal: AbortSignal.timeout(45000),
      });
      const json = await res.json();
      return json?.choices?.[0]?.message?.content?.trim() || null;
    }
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: process.env.LLM_MODEL || "claude-sonnet-5", max_tokens: 800, system, messages: [{ role: "user", content: user }] }),
        signal: AbortSignal.timeout(45000),
      });
      const json = await res.json();
      return json?.content?.[0]?.text?.trim() || null;
    }
  } catch { return null; }
  return null;
}
export async function buildInsights(metrics) {
  const recommendations = ruleRecommendations(metrics);
  const narrative = (await llmEnrich(metrics, recommendations)) || ruleNarrative(metrics);
  return { recommendations, narrative };
}

/* =============================== STORE ================================ */
const DIR = path.join(process.cwd(), "data", "snapshots");
export async function saveSnapshot(report) {
  if (process.env.KV_REST_API_URL) { const { kv } = await import("@vercel/kv"); await kv.set(`report:${report.weekOf}`, report); await kv.set("report:latest", report); await kv.sadd("report:weeks", report.weekOf); return; }
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, `${report.weekOf}.json`), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(DIR, "latest.json"), JSON.stringify(report, null, 2));
}
export async function getLatest() {
  if (process.env.KV_REST_API_URL) { const { kv } = await import("@vercel/kv"); return (await kv.get("report:latest")) ?? null; }
  try { return JSON.parse(await fs.readFile(path.join(DIR, "latest.json"), "utf8")); } catch { return null; }
}

/* ============================ ORCHESTRATOR ============================== */
export async function runWeeklyReport(now = new Date(), accounts = {}) {
  const windows = reportingWindows(now);
  const [currentResults, previousResults] = await Promise.all([
    fetchAllSources(windows.current, accounts),
    fetchAllSources(windows.previous, accounts),
  ]);
  const metrics = buildMetrics(currentResults, previousResults);
  const { recommendations, narrative } = await buildInsights(metrics);
  const report = {
    weekOf: windows.weekOf, window: windows.current, generatedAt: new Date().toISOString(),
    spend: metrics.spend, performance: metrics.performance,
    recommendations, narrative, dataQuality: metrics.dataQuality,
  };
  await saveSnapshot(report);
  return report;
}
