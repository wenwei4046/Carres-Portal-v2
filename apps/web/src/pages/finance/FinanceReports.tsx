import { useState } from "react";
import { toast } from "sonner";
import {
  useFinanceMonthlyPl,
  useFinanceTopSkus,
  type FinanceMonthlyPlRow,
  type FinanceTopSkuRow,
} from "@/lib/queries";
import { rm, rmCompact } from "@/lib/format-currency";

type PeriodChoice = "6m" | "ytd" | "12m";

const PERIOD_LABEL: Record<PeriodChoice, string> = {
  "6m":  "Last 6 months",
  "ytd": "YTD 2026",
  "12m": "Last 12 months",
};

const PERIOD_MONTHS: Record<PeriodChoice, number> = {
  "6m":  6,
  "ytd": ytdMonths(),
  "12m": 12,
};

function ytdMonths(): number {
  // Year-to-date = month index of current date + 1 (Jan=1, ..., Dec=12).
  // Fallback to 6 if running without browser-host date semantics.
  const m = new Date().getMonth() + 1;
  return Math.max(1, Math.min(12, m));
}

/**
 * Finance Reports page — Phase 5 Chunk B.
 *
 * Visual reference: `reference/proto/finance-reports.jsx:1-143`. Wires:
 *   - useFinanceMonthlyPl: GET /reports/monthly-pl?months=N
 *     → finance_monthly_pl RPC (V1 placeholder cogs=55%/opex=42k, see
 *       migration 0064 docstring for the planned real-source switch)
 *   - useFinanceTopSkus: GET /reports/top-skus?limit=8
 *     → finance_top_skus RPC
 *
 * Layout per proto:
 *   - Period dropdown + Export PDF button (PDF stubs to Chunk C — Q7=A
 *     locks server-side render via @react-pdf/renderer)
 *   - 4 KPIs from latest month (Revenue with MoM% / COGS / Net profit /
 *     Opex)
 *   - P&L 6-col table (Month / Revenue / COGS / Gross profit / Opex / Net)
 *   - Revenue trend SVG polyline + dots
 *   - Top SKUs horizontal bar list
 */
export default function FinanceReports() {
  const [period, setPeriod] = useState<PeriodChoice>("6m");
  const months = PERIOD_MONTHS[period];

  const pl      = useFinanceMonthlyPl(months);
  const topSkus = useFinanceTopSkus(8);

  const rows = pl.data?.rows ?? [];
  const skus = topSkus.data?.rows ?? [];

  const latest = rows[rows.length - 1];
  const prev   = rows[rows.length - 2];

  const revGrowth = (latest && prev && prev.revenue > 0)
    ? ((latest.revenue - prev.revenue) / prev.revenue) * 100
    : 0;
  const margin = (latest && latest.revenue > 0)
    ? (latest.net / latest.revenue) * 100
    : 0;

  function handleExport() {
    toast.info("PDF export lands in Chunk C (server-side @react-pdf/renderer per Q7=A).");
  }

  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <header className="flex items-end justify-between gap-4 flex-wrap mb-7">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Finance · Reports
          </div>
          <h1 className="font-display text-[32px] mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
            Reports
          </h1>
          <div className="text-[13px] text-muted-foreground">
            Monthly P&amp;L · revenue trend · top SKUs
          </div>
        </div>
        <div className="flex gap-2">
          <select
            aria-label="Period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodChoice)}
            className="px-2.5 py-1.5 border border-border rounded text-[12px] bg-background"
          >
            {(Object.keys(PERIOD_LABEL) as PeriodChoice[]).map((k) => (
              <option key={k} value={k}>{PERIOD_LABEL[k]}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleExport}
            className="px-3 py-2 rounded-md border border-border bg-background text-[12px] font-semibold"
          >
            Export PDF
          </button>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <Kpi
          label={`Revenue · ${latest?.m ?? "—"}`}
          value={rmCompact(latest?.revenue ?? 0)}
          hint={prev ? `${revGrowth >= 0 ? "+" : ""}${revGrowth.toFixed(1)}% MoM` : "—"}
          tone={revGrowth >= 0 ? "ok" : "warn"}
        />
        <Kpi
          label={`COGS · ${latest?.m ?? "—"}`}
          value={rmCompact(latest?.cogs ?? 0)}
          hint={latest && latest.revenue > 0 ? `${Math.round(latest.cogs / latest.revenue * 100)}% of rev` : "—"}
        />
        <Kpi
          label="Net profit"
          value={rmCompact(latest?.net ?? 0)}
          hint={`${margin.toFixed(1)}% margin`}
          tone="ok"
          accent
        />
        <Kpi
          label="Opex"
          value={rmCompact(latest?.opex ?? 0)}
          hint="Rent · payroll · ops"
        />
      </div>

      {/* P&L table */}
      <div className="bg-card rounded-md border border-border mb-6 overflow-auto">
        <div className="px-5 py-3.5 border-b border-border">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Profit &amp; Loss</div>
          <div className="text-[14px] font-semibold mt-0.5">{PERIOD_LABEL[period]}</div>
        </div>
        <div
          className="grid items-center px-5 py-2.5 bg-muted/40 border-b border-border text-[10px] uppercase tracking-[0.06em] font-bold text-muted-foreground"
          style={{ gridTemplateColumns: "120px repeat(5, 1fr)", minWidth: 720 }}
        >
          <span>Month</span>
          <span className="text-right">Revenue</span>
          <span className="text-right">COGS</span>
          <span className="text-right">Gross profit</span>
          <span className="text-right">Opex</span>
          <span className="text-right">Net</span>
        </div>
        {pl.isLoading ? (
          <div className="p-12 text-center text-[12.5px] text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-[12.5px] text-muted-foreground">No revenue in this period.</div>
        ) : (
          rows.map((m) => <PlTableRow key={m.m} m={m} />)
        )}
      </div>

      {/* Revenue trend + Top SKUs */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3.5">
        <div className="bg-card rounded-md border border-border px-5 py-4">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Revenue trend</div>
          <div className="text-[14px] font-semibold mt-0.5 mb-3">Monthly revenue</div>
          {rows.length > 0 ? (
            <RevenueTrend rows={rows} />
          ) : (
            <div className="p-8 text-center text-[12px] text-muted-foreground">No data</div>
          )}
        </div>

        <div className="bg-card rounded-md border border-border">
          <div className="px-5 py-3.5 border-b border-border">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Top SKUs</div>
            <div className="text-[14px] font-semibold mt-0.5">Revenue by SKU</div>
          </div>
          {topSkus.isLoading ? (
            <div className="p-8 text-center text-[12px] text-muted-foreground">Loading…</div>
          ) : skus.length === 0 ? (
            <div className="p-8 text-center text-[12px] text-muted-foreground">No SKU data.</div>
          ) : (
            skus.map((s) => <TopSkuRow key={s.sku} s={s} max={skus[0].revenue} />)
          )}
        </div>
      </div>

      {pl.error && (
        <div className="mt-5 p-3 text-[12px] rounded-md bg-destructive/5 text-destructive border border-destructive/30">
          Failed to load P&amp;L: {String(pl.error)}
        </div>
      )}
    </div>
  );
}

function PlTableRow({ m }: { m: FinanceMonthlyPlRow }) {
  const gp = m.revenue - m.cogs;
  return (
    <div
      className="grid items-center px-5 py-2.5 border-b border-border text-[12.5px] last:border-0"
      style={{ gridTemplateColumns: "120px repeat(5, 1fr)", minWidth: 720 }}
    >
      <span className="font-semibold">{m.m}</span>
      <span className="font-mono text-right">{rm(m.revenue)}</span>
      <span className="font-mono text-right text-muted-foreground">{rm(m.cogs)}</span>
      <span className="font-mono text-right text-success">{rm(gp)}</span>
      <span className="font-mono text-right text-muted-foreground">{rm(m.opex)}</span>
      <span className="font-mono text-right font-bold">{rm(m.net)}</span>
    </div>
  );
}

function RevenueTrend({ rows }: { rows: FinanceMonthlyPlRow[] }) {
  const W = 600, H = 180, pad = 32;
  const maxRev = Math.max(...rows.map((m) => m.revenue), 1);
  const points = rows.map((m, i) => {
    const x = pad + (rows.length === 1 ? 0 : (i / (rows.length - 1)) * (W - pad * 2));
    const y = H - pad - (m.revenue / maxRev) * (H - pad * 2);
    return { x, y, label: m.m };
  });
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[200px] block" role="img" aria-label="Monthly revenue trend">
      {[0, 0.25, 0.5, 0.75, 1].map((g, i) => {
        const y = H - pad - g * (H - pad * 2);
        return (
          <line
            key={i}
            x1={pad}
            x2={W - pad}
            y1={y}
            y2={y}
            stroke="currentColor"
            className="text-border"
          />
        );
      })}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        className="text-primary"
      />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3.5} fill="currentColor" className="text-primary" />
          <text
            x={p.x}
            y={H - 10}
            fontSize="9.5"
            textAnchor="middle"
            fill="currentColor"
            className="text-muted-foreground"
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function TopSkuRow({ s, max }: { s: FinanceTopSkuRow; max: number }) {
  const pct = max > 0 ? (s.revenue / max) * 100 : 0;
  return (
    <div className="px-5 py-2.5 border-b border-border last:border-0">
      <div className="flex items-baseline justify-between mb-1.5 text-[12px]">
        <span className="font-semibold truncate">{s.name}</span>
        <span className="font-mono text-[11.5px]">{rm(s.revenue)}</span>
      </div>
      <div className="h-1 rounded bg-muted overflow-hidden">
        <div
          className="h-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">{s.qty} units sold</div>
    </div>
  );
}

function Kpi({
  label, value, hint, tone, accent,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn" | "ok";
  accent?: boolean;
}) {
  const valueTone = tone === "warn" ? "text-primary" : tone === "ok" ? "text-success" : "text-foreground";
  return (
    <div className={`bg-card rounded-md border ${accent ? "border-primary" : "border-border"} px-5 py-[18px]`}>
      <div className={`text-[10px] uppercase tracking-[0.06em] font-semibold ${accent ? "text-primary" : "text-muted-foreground"}`}>
        {label}
      </div>
      <div className={`font-display text-[26px] mt-1.5 leading-none tabular-nums ${valueTone}`}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1.5">{hint}</div>}
    </div>
  );
}
