import {
  useFinanceArAging,
  useFinanceDashboardSummary,
  type FinanceArAgingBucket,
} from "@/lib/queries";
import { rm, rmCompact } from "@/lib/format-currency";
import { FinanceKpi } from "@/components/FinanceKpi";

const BUCKET_KEYS = ["0-30", "31-60", "61-90", "90+"] as const;

/**
 * Finance Dashboard — Phase 5 Chunk A foundation page.
 *
 * Wires `useFinanceDashboardSummary` + `useFinanceArAging` (queries.ts)
 * which call:
 *   GET /api/finance/reports/dashboard-summary  -> finance_dashboard_summary RPC
 *   GET /api/finance/reports/ar-aging           -> finance_ar_aging RPC
 *
 * Visual reference: `reference/proto/finance-dashboard.jsx:1-208`. This
 * V1 page renders the 4 top KPIs + AR Aging card + a CashflowCard stub
 * (Chunk B adds the per-week series RPC). Activity feed and "Ready to
 * pay" payables list are stubbed — both need additional list RPCs which
 * land alongside the AP page later in Chunk A.
 *
 * Numbers come from real Postgres RPCs; this page is the first end-to-end
 * Phase 5 demo surface — finance / principal can hit it via the staging
 * env to verify the migration 0061+0062 + Hono routes are alive.
 */
export default function FinanceDashboard() {
  const summary = useFinanceDashboardSummary();
  const aging   = useFinanceArAging();

  const isLoading = summary.isLoading || aging.isLoading;
  const ar           = summary.data?.ar          ?? { outstanding: 0, count: 0, overdueAmt: 0, overdueCount: 0 };
  const ap           = summary.data?.ap          ?? { dueAmt: 0, count: 0 };
  const cashflow     = summary.data?.cashflow12w ?? { inflow: 0, outflow: 0, net: 0 };
  const buckets      = summary.data?.agingBuckets ?? aging.data?.buckets ?? defaultBuckets();
  const totalAr      = ar.outstanding;

  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <header className="flex items-end justify-between gap-4 flex-wrap mb-7">
        <div>
          <div className="text-label uppercase tracking-[0.12em] text-muted-foreground">
            Finance · Overview
          </div>
          <h1 className="font-display text-page mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
            Dashboard
          </h1>
          <div className="text-body text-muted-foreground">
            Cash position, receivables, payables · live from Supabase
          </div>
        </div>
        <button
          type="button"
          className="px-3.5 py-1.5 text-meta font-medium border border-border rounded-md text-muted-foreground"
          disabled
          title="Export · coming in Chunk B"
        >
          Export month-end pack
        </button>
      </header>

      {isLoading ? (
        <KpiSkeletonRow />
      ) : (
        <div className="grid grid-cols-4 gap-3.5 mb-5">
          <FinanceKpi
            label="A/R Outstanding"
            value={rmCompact(ar.outstanding)}
            hint={`${ar.count} open invoice${ar.count === 1 ? "" : "s"}`}
            tone="warn"
            accent
          />
          <FinanceKpi
            label="Overdue (>30d)"
            value={rmCompact(ar.overdueAmt)}
            hint={`${ar.overdueCount} invoice${ar.overdueCount === 1 ? "" : "s"}`}
            tone={ar.overdueAmt > 0 ? "danger" : "ok"}
          />
          <FinanceKpi
            label="A/P Due"
            value={rmCompact(ap.dueAmt)}
            hint={`${ap.count} ready to pay`}
          />
          <FinanceKpi
            label="Net cash · 12 wks"
            value={rmCompact(cashflow.net)}
            hint={`In ${rmCompact(cashflow.inflow)} · Out ${rmCompact(cashflow.outflow)}`}
            tone={cashflow.net >= 0 ? "ok" : "danger"}
          />
        </div>
      )}

      <div className="grid gap-3.5 mb-5" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
        <CashflowStubCard inflow={cashflow.inflow} outflow={cashflow.outflow} />
        <AgingCard buckets={buckets} totalAr={totalAr} />
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <ActivityStubCard />
        <PayablesStubCard apCount={ap.count} apAmt={ap.dueAmt} />
      </div>

      {summary.error && (
        <div className="mt-5 p-3 text-meta rounded-md bg-destructive/5 text-destructive border border-destructive/30">
          Failed to load dashboard summary: {String(summary.error)}
        </div>
      )}
    </div>
  );
}

// ---------- KPI tile ----------
function KpiSkeletonRow() {
  return (
    <div className="grid grid-cols-4 gap-3.5 mb-5">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bg-card rounded-md border border-border px-5 py-[18px] h-[88px]">
          <div className="h-2.5 w-20 bg-muted rounded animate-pulse" />
          <div className="h-7 w-28 bg-muted rounded animate-pulse mt-2.5" />
          <div className="h-2.5 w-16 bg-muted rounded animate-pulse mt-2.5" />
        </div>
      ))}
    </div>
  );
}

// ---------- Aging card (right of 2-col row) ----------
function AgingCard({
  buckets,
  totalAr,
}: {
  buckets: Record<string, FinanceArAgingBucket>;
  totalAr: number;
}) {
  const tones: Record<string, string> = {
    "0-30":  "bg-success",
    "31-60": "bg-primary",
    "61-90": "bg-amber-500",
    "90+":   "bg-destructive",
  };

  return (
    <div className="bg-card rounded-md border border-border px-5 py-[18px]">
      <div className="text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground">
        A/R Aging
      </div>
      <div className="text-body font-semibold mt-0.5 mb-3.5">Outstanding by age</div>
      <div className="flex flex-col gap-3">
        {BUCKET_KEYS.map((b) => {
          const row = buckets[b] ?? { amount: 0, count: 0 };
          const pct = totalAr > 0 ? (row.amount / totalAr) * 100 : 0;
          return (
            <div key={b}>
              <div className="flex justify-between text-label mb-1">
                <span className="text-foreground font-semibold">{b} days</span>
                <span className="font-mono">
                  {rm(row.amount)} · {row.count}
                </span>
              </div>
              <div className="h-1.5 rounded bg-muted overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-300 ${tones[b] ?? "bg-foreground"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Cashflow placeholder (Chunk B will swap to per-week sparkline) ----------
function CashflowStubCard({ inflow, outflow }: { inflow: number; outflow: number }) {
  return (
    <div className="bg-card rounded-md border border-border px-5 py-[18px]">
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <div className="text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground">
            Cashflow
          </div>
          <div className="text-body font-semibold mt-0.5">Last 12 weeks</div>
        </div>
        <div className="flex gap-3.5 text-label text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-success rounded-sm" />
            Inflow
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-primary rounded-sm" />
            Outflow
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground">
            Inflow total
          </div>
          <div className="font-display text-title text-success mt-0.5 tabular-nums">
            {rmCompact(inflow)}
          </div>
        </div>
        <div>
          <div className="text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground">
            Outflow total
          </div>
          <div className="font-display text-title text-primary mt-0.5 tabular-nums">
            {rmCompact(outflow)}
          </div>
        </div>
      </div>
      <div className="mt-3.5 text-label text-muted-foreground italic">
        Per-week sparkline lands in Chunk B (cashflow_series RPC).
      </div>
    </div>
  );
}

// ---------- Activity stub (Chunk A AR/AP routes will feed real data) ----------
function ActivityStubCard() {
  return (
    <div className="bg-card rounded-md border border-border p-5">
      <div className="text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground">
        Activity
      </div>
      <div className="text-body font-semibold mt-0.5">Recent transactions</div>
      <div className="mt-5 text-meta text-muted-foreground italic">
        Live activity feed lands alongside the AR + AP pages.
      </div>
    </div>
  );
}

// ---------- Payables stub ----------
function PayablesStubCard({ apCount, apAmt }: { apCount: number; apAmt: number }) {
  return (
    <div className="bg-card rounded-md border border-border p-5">
      <div className="text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground">
        Payables
      </div>
      <div className="text-body font-semibold mt-0.5">Ready to pay</div>
      <div className="mt-3 font-display text-title tabular-nums text-foreground">
        {rmCompact(apAmt)}
      </div>
      <div className="text-label text-muted-foreground mt-1">
        {apCount} matched PO{apCount === 1 ? "" : "s"} · detail list lands with AP page
      </div>
    </div>
  );
}

function defaultBuckets(): Record<string, FinanceArAgingBucket> {
  return {
    "0-30":  { amount: 0, count: 0 },
    "31-60": { amount: 0, count: 0 },
    "61-90": { amount: 0, count: 0 },
    "90+":   { amount: 0, count: 0 },
  };
}
