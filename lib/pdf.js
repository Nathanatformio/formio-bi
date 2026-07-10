/**
 * PDF export (@react-pdf/renderer, no headless browser) + optional email digest.
 * Kept separate from core.js so the dashboard/data code stays render-dep-free.
 */
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { money, pct, mult, delta, num } from "./core.js";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: "#1a1a2e", fontFamily: "Helvetica" },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#0b5fff" },
  sub: { fontSize: 10, color: "#666", marginBottom: 14 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6, color: "#0b5fff" },
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  kpi: { flex: 1, border: "1 solid #e3e3ef", borderRadius: 4, padding: 8 },
  kpiLabel: { fontSize: 8, color: "#666" },
  kpiVal: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottom: "1 solid #eee", paddingVertical: 3 },
  cell: { flex: 1 },
  cellHead: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 8, color: "#666" },
  rec: { marginBottom: 8, paddingLeft: 6, borderLeft: "2 solid #0b5fff" },
  recAction: { fontFamily: "Helvetica-Bold" },
  recWhy: { color: "#444" },
  narrative: { lineHeight: 1.5 },
  note: { marginTop: 14, fontSize: 8, color: "#999" },
});

function ReportDoc({ report }) {
  const channels = Object.entries(report.performance.byChannel);
  const h = React.createElement;
  return h(Document, null,
    h(Page, { size: "A4", style: s.page },
      h(Text, { style: s.h1 }, "Form.io — Weekly Marketing Report"),
      h(Text, { style: s.sub }, `Week of ${report.weekOf}  ·  generated ${report.generatedAt.slice(0, 10)}`),
      h(Text, { style: s.h2 }, "Summary & Narrative"),
      h(Text, { style: s.narrative }, report.narrative),
      h(Text, { style: s.h2 }, "1. Spend"),
      h(View, { style: s.kpiRow },
        h(View, { style: s.kpi }, h(Text, { style: s.kpiLabel }, "Total spend"), h(Text, { style: s.kpiVal }, money(report.spend.total))),
        h(View, { style: s.kpi }, h(Text, { style: s.kpiLabel }, "WoW change"), h(Text, { style: s.kpiVal }, delta(report.spend.wowDelta))),
        h(View, { style: s.kpi }, h(Text, { style: s.kpiLabel }, "Blended ROAS"), h(Text, { style: s.kpiVal }, mult(report.performance.blended.roas)))),
      h(Text, { style: s.h2 }, "2. Performance by channel"),
      h(View, { style: s.row }, ["Channel", "Spend", "WoW", "Impr.", "CTR", "CPC", "CPA", "ROAS"].map((c, i) => h(Text, { key: i, style: s.cellHead }, c))),
      ...channels.map(([ch, m], i) => h(View, { key: i, style: s.row },
        h(Text, { style: s.cell }, ch),
        h(Text, { style: s.cell }, money(m.spend)),
        h(Text, { style: s.cell }, delta(report.spend.byChannel[ch]?.wowDelta)),
        h(Text, { style: s.cell }, num(m.impressions)),
        h(Text, { style: s.cell }, pct(m.ctr)),
        h(Text, { style: s.cell }, money(m.cpc)),
        h(Text, { style: s.cell }, money(m.cpa)),
        h(Text, { style: s.cell }, mult(m.roas)))),
      h(Text, { style: s.h2 }, "3. Recommendations & why"),
      ...report.recommendations.map((r, i) => h(View, { key: i, style: s.rec },
        h(Text, { style: s.recAction }, `[${r.priority.toUpperCase()}] ${r.channel}: ${r.action}`),
        h(Text, { style: s.recWhy }, r.why))),
      report.dataQuality.chatgptAdsConversions === false
        ? h(Text, { style: s.note }, "Note: ChatGPT Ads conversions/ROAS are not yet available from OpenAI's API; that channel is evaluated on spend and engagement only.")
        : null));
}

export function renderReportPdf(report) {
  return renderToBuffer(React.createElement(ReportDoc, { report }));
}

export async function sendReportEmail(report) {
  if (!process.env.RESEND_API_KEY) return { skipped: true };
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const pdf = await renderReportPdf(report);
  const topRecs = report.recommendations.slice(0, 3)
    .map((r) => `<li><b>[${r.priority}] ${r.channel}:</b> ${r.action}</li>`).join("");
  const html = `
    <h2>Form.io — Weekly Marketing Report</h2>
    <p><b>Week of ${report.weekOf}.</b> Spend ${money(report.spend.total)} (${delta(report.spend.wowDelta)} WoW).</p>
    <p>${report.narrative}</p>
    <h3>Top recommendations</h3><ul>${topRecs}</ul>
    <p>Full detail is attached, or view the live dashboard.</p>`;
  return resend.emails.send({
    from: process.env.REPORT_EMAIL_FROM || "reports@form.io",
    to: (process.env.REPORT_EMAIL_TO || "").split(",").map((x) => x.trim()).filter(Boolean),
    subject: `Form.io weekly report — ${report.weekOf}`,
    html,
    attachments: [{ filename: `formio-weekly-${report.weekOf}.pdf`, content: Buffer.from(pdf).toString("base64") }],
  });
}
