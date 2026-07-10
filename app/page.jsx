import { getLatest, money, pct, mult, delta, num } from "../lib/core.js";

export const dynamic = "force-dynamic";

const BLUE = "#0b5fff";
const pri = { high: "#d64545", medium: "#e08a1e", low: "#5a6472" };

function Card({ children, style }) {
  return <div style={{ background: "#fff", border: "1px solid #e3e3ef", borderRadius: 10, padding: 20, ...style }}>{children}</div>;
}
function Kpi({ label, value, sub }) {
  return (
    <Card style={{ flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

export default async function Page() {
  const report = await getLatest();

  if (!report) {
    return (
      <main style={{ maxWidth: 900, margin: "60px auto", padding: 20 }}>
        <h1 style={{ color: BLUE }}>Form.io Weekly Report</h1>
        <Card>
          <p>No report has been generated yet.</p>
          <p style={{ color: "#666" }}>Trigger the first run: <code>POST /api/cron/weekly</code> (or wait for Monday 07:00 UTC), then reload.</p>
        </Card>
      </main>
    );
  }

  const channels = Object.entries(report.performance.byChannel);
  const spendChannels = Object.entries(report.spend.byChannel).sort((a, b) => b[1].spend - a[1].spend);
  const maxSpend = Math.max(...spendChannels.map(([, v]) => v.spend), 1);

  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 20px 64px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ color: BLUE, margin: "0 0 4px" }}>Form.io — Weekly Marketing Report</h1>
          <div style={{ color: "#666" }}>Week of {report.weekOf} · generated {report.generatedAt.slice(0, 10)}</div>
        </div>
        <a href="/api/export" style={{ background: BLUE, color: "#fff", padding: "10px 16px", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>Download PDF</a>
      </header>

      <section style={{ marginTop: 24 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Kpi label="Total spend" value={money(report.spend.total)} sub={`${delta(report.spend.wowDelta)} vs last week`} />
          <Kpi label="Blended ROAS" value={mult(report.performance.blended.roas)} sub="measurable channels" />
          <Kpi label="Blended CPA" value={money(report.performance.blended.cpa)} />
          <Kpi label="Blended CTR" value={pct(report.performance.blended.ctr)} />
        </div>
        <Card style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Narrative</h2>
          <p style={{ lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0 }}>{report.narrative}</p>
        </Card>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16 }}>1. Spend by channel</h2>
        <Card>
          {spendChannels.map(([ch, v]) => (
            <div key={ch} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span>{ch} <span style={{ color: "#999" }}>· {pct(v.share)}</span></span>
                <span>{money(v.spend)} <span style={{ color: v.wowDelta > 0 ? "#c23" : "#297", marginLeft: 6 }}>{delta(v.wowDelta)}</span></span>
              </div>
              <div style={{ background: "#eef0f7", borderRadius: 4, height: 10 }}>
                <div style={{ width: `${(v.spend / maxSpend) * 100}%`, background: BLUE, height: 10, borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </Card>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16 }}>Recommendations &amp; why</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {report.recommendations.map((r, i) => (
            <Card key={i} style={{ borderLeft: `4px solid ${pri[r.priority]}` }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ background: pri[r.priority], color: "#fff", fontSize: 11, padding: "2px 8px", borderRadius: 20, textTransform: "uppercase", fontWeight: 700 }}>{r.priority}</span>
                <strong>{r.channel}: {r.action}</strong>
              </div>
              <div style={{ color: "#444", marginTop: 6, lineHeight: 1.5 }}>{r.why}</div>
            </Card>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16 }}>2. Performance detail</h2>
        <Card style={{ overflowX: "auto", padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#666", background: "#fafbff" }}>
                {["Channel", "Spend", "WoW", "Impr.", "Clicks", "CTR", "CPC", "Conv.", "CPA", "ROAS"].map((h) => (
                  <th key={h} style={{ padding: "10px 12px", borderBottom: "1px solid #eee" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {channels.map(([ch, m]) => (
                <tr key={ch} style={{ borderBottom: "1px solid #f2f2f7" }}>
                  <td style={{ padding: "9px 12px", fontWeight: 600 }}>{ch}{m.error ? <span style={{ color: "#c23", fontSize: 11 }}> · error</span> : null}</td>
                  <td style={{ padding: "9px 12px" }}>{money(m.spend)}</td>
                  <td style={{ padding: "9px 12px" }}>{delta(report.spend.byChannel[ch]?.wowDelta)}</td>
                  <td style={{ padding: "9px 12px" }}>{num(m.impressions)}</td>
                  <td style={{ padding: "9px 12px" }}>{num(m.clicks)}</td>
                  <td style={{ padding: "9px 12px" }}>{pct(m.ctr)}</td>
                  <td style={{ padding: "9px 12px" }}>{money(m.cpc)}</td>
                  <td style={{ padding: "9px 12px" }}>{num(m.conversions)}</td>
                  <td style={{ padding: "9px 12px" }}>{money(m.cpa)}</td>
                  <td style={{ padding: "9px 12px" }}>{mult(m.roas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {report.dataQuality?.chatgptAdsConversions === false && (
          <p style={{ color: "#888", fontSize: 12, marginTop: 8 }}>ChatGPT Ads conversions/ROAS aren&apos;t available from OpenAI&apos;s API yet — that channel is judged on spend and engagement only.</p>
        )}
      </section>
    </main>
  );
}
