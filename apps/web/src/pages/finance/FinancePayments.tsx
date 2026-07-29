import { useMemo, useState } from "react";
import {
  useFinanceArAging,
  type FinanceArAgingRow,
} from "@/lib/queries";
import { rm, rmCompact } from "@/lib/format-currency";

type PaidBucket = "all" | "unpaid" | "deposit_low" | "deposit_ok" | "fully_paid";

interface PaymentRow extends FinanceArAgingRow {
  pct:    number;
  bucket: Exclude<PaidBucket, "all">;
}

/**
 * Finance Order Payments — Phase 5 Chunk A read-only view.
 *
 * Visual reference: `reference/proto/finance-payments.jsx:1-108`. Reuses
 * the same `finance_ar_aging` RPC payload as the AR page; the only
 * difference is the bucketing dimension (payment-progress %, not days
 * aging) and the page is strictly read-only — `Record receipt` lives on
 * the AR drawer, not here. So this page is the "money-side" of orders
 * with a progress bar per row, useful for finance to scan who's at 50%
 * (proceed-trigger threshold) vs fully paid vs unpaid.
 *
 * Buckets per proto:
 *   - unpaid:       0%
 *   - deposit_low:  >0% AND <50%
 *   - deposit_ok:   >=50% AND <100% (proto calls this "Partial paid")
 *   - fully_paid:   >=100%
 */
export default function FinancePayments() {
  const aging = useFinanceArAging();
  const rows  = aging.data?.rows ?? [];

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PaidBucket>("all");

  const enriched = useMemo<PaymentRow[]>(() => {
    return rows.map((r) => {
      const pct = r.total > 0 ? (r.paid / r.total) * 100 : 0;
      const bucket: PaymentRow["bucket"] =
        pct === 0       ? "unpaid"      :
        pct < 50        ? "deposit_low" :
        pct < 100       ? "deposit_ok"  :
                          "fully_paid";
      return { ...r, pct, bucket };
    });
  }, [rows]);

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (filter !== "all" && r.bucket !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        const c = (r.customer_name ?? "").toLowerCase();
        if (!c.includes(q) && !String(r.so).includes(q)) return false;
      }
      return true;
    });
  }, [enriched, search, filter]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        gross:   acc.gross   + r.total,
        paid:    acc.paid    + r.paid,
        balance: acc.balance + Math.max(0, r.total - r.paid),
      }),
      { gross: 0, paid: 0, balance: 0 },
    );
  }, [filtered]);

  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <header className="flex items-end justify-between gap-4 flex-wrap mb-7">
        <div>
          <div className="text-label uppercase tracking-[0.12em] text-muted-foreground">
            Finance · Order Payments
          </div>
          <h1 className="font-display text-page mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
            Order Payments
          </h1>
          <div className="text-body text-muted-foreground">
            Deposit and balance per customer order. Read-only — record receipts on the AR drawer.
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3.5 mb-5">
        <Kpi label="Gross order value" value={rmCompact(totals.gross)}   hint={`${filtered.length} orders in view`} />
        <Kpi label="Collected"          value={rmCompact(totals.paid)}    hint={totals.gross > 0 ? `${Math.round((totals.paid / totals.gross) * 100)}% of gross` : "—"} tone="ok" />
        <Kpi label="Balance to collect" value={rmCompact(totals.balance)} hint="Across non-cancelled orders" tone="warn" accent />
      </div>

      <div className="bg-card rounded-md border border-border p-3 mb-3.5 flex items-center gap-3 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer or SO number…"
          className="flex-1 min-w-[240px] px-2.5 py-1.5 border border-border rounded text-meta bg-background outline-none"
        />
        <div className="flex gap-px bg-muted rounded p-0.5">
          {[
            ["all",         "All"],
            ["unpaid",      "Unpaid"],
            ["deposit_low", "Deposit < 50%"],
            ["deposit_ok",  "Partial paid"],
            ["fully_paid",  "Fully paid"],
          ].map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k as PaidBucket)}
              className={`px-2.5 py-1 rounded text-label font-semibold transition-colors ${
                filter === k
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-md border border-border overflow-auto">
        <div
          className="grid items-center px-4 py-2.5 bg-muted/40 border-b border-border text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground"
          style={{ gridTemplateColumns: "90px 1.2fr 1.1fr 110px 100px 100px 130px", minWidth: 920 }}
        >
          <span>SO</span>
          <span>Customer</span>
          <span>Dealer</span>
          <span className="text-right">Total</span>
          <span className="text-right">Paid</span>
          <span className="text-right">Balance</span>
          <span>Progress</span>
        </div>

        {aging.isLoading ? (
          <div className="p-12 text-center text-meta text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-meta text-muted-foreground">Nothing matches.</div>
        ) : (
          filtered.map((r) => <PaymentTableRow key={r.order_id} row={r} />)
        )}
      </div>

      {aging.error && (
        <div className="mt-5 p-3 text-meta rounded-md bg-destructive/5 text-destructive border border-destructive/30">
          Failed to load payments view: {String(aging.error)}
        </div>
      )}
    </div>
  );
}

function PaymentTableRow({ row }: { row: PaymentRow }) {
  const balance = Math.max(0, row.total - row.paid);
  const barColor =
    row.pct < 50  ? "bg-primary" :
    row.pct < 100 ? "bg-blue-700" :
                    "bg-success";

  return (
    <div
      className="grid items-center px-4 py-3 border-b border-border text-meta"
      style={{ gridTemplateColumns: "90px 1.2fr 1.1fr 110px 100px 100px 130px", minWidth: 920 }}
    >
      <span className="font-mono font-semibold">SO-{row.so}</span>
      <span>{row.customer_name}</span>
      <span className="text-muted-foreground">{row.dealer_name ?? "—"}</span>
      <span className="font-mono text-right">{rm(row.total)}</span>
      <span className="font-mono text-right text-success">{rm(row.paid)}</span>
      <span className={`font-mono text-right font-semibold ${balance > 0 ? "text-primary" : "text-muted-foreground"}`}>
        {rm(balance)}
      </span>
      <span className="flex items-center gap-1.5">
        <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden">
          <div
            className={`h-full transition-[width] duration-300 ${barColor}`}
            style={{ width: `${Math.min(100, row.pct)}%` }}
          />
        </div>
        <span className="font-mono text-label text-muted-foreground text-right">
          {Math.round(row.pct)}%
        </span>
      </span>
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
      <div className={`text-label uppercase tracking-[0.06em] font-semibold ${accent ? "text-primary" : "text-muted-foreground"}`}>
        {label}
      </div>
      <div className={`font-display text-page mt-1.5 leading-none tabular-nums ${valueTone}`}>
        {value}
      </div>
      {hint && <div className="text-label text-muted-foreground mt-1.5">{hint}</div>}
    </div>
  );
}

