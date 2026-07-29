import { useMemo, useState } from "react";
import { useSalesAnalytics } from "@/lib/queries";
import { rm } from "@/lib/format-currency";
import {
  MIN_SAMPLE,
  ageDistribution,
  buyerDemographics,
  genderDistribution,
  monthlyRevenue,
  productRollup,
  raceDistribution,
  spendBySegment,
  summarizeOverview,
  type Distribution,
} from "@/lib/sales-analysis";

/**
 * MAINTAIN → Sales analysis (POS-parity with the 2990s SalesAnalysis page).
 * Period select + three tabs:
 *   Overview      — KPI cards (Orders / Revenue / AOV / Avg delivery / Gross
 *                   margin) + monthly revenue bars
 *   Customer data — race / gender / age-band distributions (0200
 *                   demographics) + spend by segment, with coverage +
 *                   thin-sample warnings
 *   Products      — per-model units / revenue / margin + buyer demographics
 *                   per category
 * All aggregation is pure client-side (lib/sales-analysis) over the
 * /api/analytics/sales flattened feed.
 */

const PERIODS = [
  { months: 3, label: "Last 3 months" },
  { months: 6, label: "Last 6 months" },
  { months: 12, label: "Last 12 months" },
  { months: 24, label: "Last 24 months" },
] as const;

type Tab = "overview" | "customers" | "products";

export default function PrincipalSalesAnalysis() {
  const [months, setMonths] = useState<number>(12);
  const [tab, setTab] = useState<Tab>("overview");
  const analyticsQ = useSalesAnalytics(months);
  const now = useMemo(() => new Date(), []);

  const orders = analyticsQ.data?.orders ?? [];
  const lines = analyticsQ.data?.lines ?? [];

  const kpis = useMemo(() => summarizeOverview(orders), [orders]);
  const bars = useMemo(() => monthlyRevenue(orders), [orders]);
  const race = useMemo(() => raceDistribution(orders), [orders]);
  const gender = useMemo(() => genderDistribution(orders), [orders]);
  const age = useMemo(() => ageDistribution(orders, now), [orders, now]);
  const raceSpend = useMemo(() => spendBySegment(orders, "race"), [orders]);
  const products = useMemo(() => productRollup(lines), [lines]);
  const demographics = useMemo(() => buyerDemographics(lines, now), [lines, now]);

  const maxBar = Math.max(1, ...bars.map((b) => b.revenue));

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-label uppercase tracking-[0.05em] text-base-400">Maintain · Sales analysis</p>
          <h1 className="text-page mt-1">Sales analysis</h1>
        </div>
        <select
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          data-testid="sa-period"
          className="rounded-md border border-base-300 bg-white px-3 py-2 text-body"
        >
          {PERIODS.map((p) => (
            <option key={p.months} value={p.months}>
              {p.label}
            </option>
          ))}
        </select>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        {(
          [
            ["overview", "Overview"],
            ["customers", "Customer data"],
            ["products", "Products"],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            data-testid={`sa-tab-${key}`}
            className={[
              "px-4 py-1.5 rounded-full text-body font-semibold border transition-colors",
              tab === key
                ? "bg-base-900 text-white border-base-900"
                : "bg-white text-base-600 border-base-200 hover:border-base-400",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {analyticsQ.isLoading ? (
        <p className="text-body text-base-500 py-16 text-center">Loading analytics…</p>
      ) : analyticsQ.error ? (
        <p className="text-body text-destructive py-16 text-center">
          Couldn't load analytics: {(analyticsQ.error as Error).message}
        </p>
      ) : orders.length === 0 ? (
        <p className="text-body text-base-500 py-16 text-center">
          No orders in this period yet.
        </p>
      ) : tab === "overview" ? (
        <>
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="Orders" value={String(kpis.orders)} />
            <Kpi label="Revenue" value={rm(kpis.revenue)} />
            <Kpi label="Avg order value" value={rm(kpis.aov)} />
            <Kpi label="Avg delivery fee" value={rm(kpis.avgDeliveryFee)} />
            <Kpi
              label="Gross margin"
              value={kpis.grossMarginPct === null ? "—" : `${kpis.grossMarginPct.toFixed(1)}%`}
              hint={
                kpis.grossMarginPct === null
                  ? "No orders with full costing yet"
                  : `Based on ${kpis.cogsCompleteOrders} fully-costed order${kpis.cogsCompleteOrders === 1 ? "" : "s"}`
              }
            />
          </div>

          {/* Monthly revenue bars */}
          <section className="bg-card border border-base-200 rounded-lg shadow-sm p-6">
            <h2 className="text-strong mb-5">Monthly revenue</h2>
            <div className="flex items-end gap-3 h-44" data-testid="sa-monthly-bars">
              {bars.map((b) => (
                <div key={b.key} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                  <span className="text-meta font-mono text-base-500">{rm(b.revenue)}</span>
                  <div
                    className="w-full max-w-14 rounded-t-md bg-primary/80"
                    style={{ height: `${Math.max(4, (b.revenue / maxBar) * 130)}px` }}
                    title={`${b.label} · ${rm(b.revenue)} · ${b.orders} orders`}
                  />
                  <span className="text-meta text-base-400">{b.label}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : tab === "customers" ? (
        <>
          <CoverageNote known={race.known} total={race.total} />
          <div className="grid gap-4 lg:grid-cols-3">
            <DistributionCard title="Race" dist={race} />
            <DistributionCard title="Gender" dist={gender} />
            <DistributionCard title="Age band" dist={age} />
          </div>

          <section className="bg-card border border-base-200 rounded-lg shadow-sm p-6">
            <h2 className="text-strong mb-4">Spend by race</h2>
            {raceSpend.length === 0 ? (
              <Empty />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left">
                    <th className="text-label uppercase tracking-[0.05em] text-base-400 pb-2">Segment</th>
                    <th className="text-label uppercase tracking-[0.05em] text-base-400 pb-2 text-right">Orders</th>
                    <th className="text-label uppercase tracking-[0.05em] text-base-400 pb-2 text-right">Revenue</th>
                    <th className="text-label uppercase tracking-[0.05em] text-base-400 pb-2 text-right">Avg order</th>
                  </tr>
                </thead>
                <tbody>
                  {raceSpend.map((s) => (
                    <tr key={s.label} className="border-t border-base-100">
                      <td className="text-body py-2">{s.label}</td>
                      <td className="text-body py-2 text-right font-mono">{s.orders}</td>
                      <td className="text-body py-2 text-right font-mono">{rm(s.revenue)}</td>
                      <td className="text-body py-2 text-right font-mono">{rm(s.aov)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="bg-card border border-base-200 rounded-lg shadow-sm p-6">
            <h2 className="text-strong mb-4">By model</h2>
            <table className="w-full" data-testid="sa-products-table">
              <thead>
                <tr className="text-left">
                  <th className="text-label uppercase tracking-[0.05em] text-base-400 pb-2">Model</th>
                  <th className="text-label uppercase tracking-[0.05em] text-base-400 pb-2">Category</th>
                  <th className="text-label uppercase tracking-[0.05em] text-base-400 pb-2 text-right">Units</th>
                  <th className="text-label uppercase tracking-[0.05em] text-base-400 pb-2 text-right">Revenue</th>
                  <th className="text-label uppercase tracking-[0.05em] text-base-400 pb-2 text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.model} className="border-t border-base-100">
                    <td className="text-body py-2 font-semibold">{p.model}</td>
                    <td className="text-body py-2 text-base-500 capitalize">{p.category}</td>
                    <td className="text-body py-2 text-right font-mono">{p.units}</td>
                    <td className="text-body py-2 text-right font-mono">{rm(p.revenue)}</td>
                    <td className="text-body py-2 text-right font-mono">
                      {p.marginPct === null ? "—" : `${p.marginPct.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="bg-card border border-base-200 rounded-lg shadow-sm p-6">
            <h2 className="text-strong mb-1">Buyer demographics</h2>
            <p className="text-meta text-base-400 mb-4">
              Who buys each category — from orders carrying demographics.
            </p>
            <div className="flex flex-col gap-6">
              {demographics.map((d) => (
                <div key={d.category}>
                  <p className="text-body font-semibold capitalize mb-2">{d.category}</p>
                  <div className="grid gap-4 lg:grid-cols-3">
                    <MiniDistribution title="Race" dist={d.race} />
                    <MiniDistribution title="Gender" dist={d.gender} />
                    <MiniDistribution title="Age band" dist={d.age} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card border border-base-200 rounded-lg shadow-sm p-4">
      <p className="text-label uppercase tracking-[0.05em] text-base-400">{label}</p>
      <p className="text-strong font-mono mt-1">{value}</p>
      {hint && <p className="text-meta text-base-400 mt-1">{hint}</p>}
    </div>
  );
}

function CoverageNote({ known, total }: { known: number; total: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-meta text-base-500">
        {known} of {total} orders in this period carry customer demographics.
      </p>
      {known < MIN_SAMPLE && (
        <span className="pill pill-neutral text-label">
          Thin sample — read with care (min {MIN_SAMPLE})
        </span>
      )}
    </div>
  );
}

function DistributionCard({ title, dist }: { title: string; dist: Distribution }) {
  return (
    <section className="bg-card border border-base-200 rounded-lg shadow-sm p-5">
      <h3 className="text-strong mb-3">{title}</h3>
      {dist.rows.length === 0 ? <Empty /> : <Bars dist={dist} />}
    </section>
  );
}

function MiniDistribution({ title, dist }: { title: string; dist: Distribution }) {
  return (
    <div className="border border-base-100 rounded-lg p-3.5">
      <p className="text-label uppercase tracking-[0.05em] text-base-400 mb-2">{title}</p>
      {dist.rows.length === 0 ? <Empty /> : <Bars dist={dist} />}
    </div>
  );
}

function Bars({ dist }: { dist: Distribution }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {dist.rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2">
          <span className="text-meta w-16 shrink-0 truncate">{r.label}</span>
          <span className="flex-1 h-2 rounded-full bg-base-100 overflow-hidden">
            <span
              className="block h-full rounded-full bg-primary/70"
              style={{ width: `${Math.max(2, r.pct)}%` }}
            />
          </span>
          <span className="text-meta font-mono text-base-500 w-14 text-right">
            {r.pct.toFixed(0)}% · {r.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Empty() {
  return <p className="text-meta text-base-400 italic">No data yet</p>;
}
