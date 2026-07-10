import { getLatest } from "../../../lib/core.js";
import { renderReportPdf } from "../../../lib/pdf.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await getLatest();
  if (!report) return new Response(JSON.stringify({ error: "no report yet" }), { status: 404, headers: { "Content-Type": "application/json" } });
  const pdf = await renderReportPdf(report);
  return new Response(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="formio-weekly-${report.weekOf}.pdf"`,
    },
  });
}
