import { useMemo, useState } from "react";
import {
  useFinanceApAging,
  type FinanceApAgingRow,
  type FinanceApPayStatusUi,
} from "@/lib/queries";
import { rm, rmCompact } from "@/lib/format-currency";
import APDrawer from "./APDrawer";

type ApTab = FinanceApPayStatusUi;

const TAB_ORDER: ApTab[] = ["matched", "scheduled", "paid", "in_transit", "in_production"];

const TAB_LABEL: Record<ApTab, string> = {
  matched:       "Ready to pay",
  scheduled:     "Scheduled",
  paid:          "Paid",
  in_transit:    "In transit",
  in_production: "In production",
};

/**
 * Finance AP (Payables) page — Phase 5 Chunk A.
 *
 * Visual reference: `reference/proto/finance-ap.jsx`. Renders a tab-filtered
 * table of supplier POs sourced from `finance_ap_aging` RPC (single
 * round-trip; rows + byPayStatus buckets in one payload — same Q6=A pattern
 * as AR aging).
 *
 * Tabs map directly to the derived `pay_status_ui` 5-value bucket
 * (matched / scheduled / paid / in_transit / in_production). The DB column
 * pay_status is only 3 values; the RPC derives the 5-bucket UI state from
 * po.status + sup_status + pay_status (see migration 0063 docstring).
 *
 * Row click opens the APDrawer (3-way match card + Schedule / Mark paid
 * actions on matched rows; Release payment on scheduled rows).
 */
export default function FinanceAP() {
  const aging = useFinanceApAging();
  const rows  = aging.data?.rows ?? [];
  const buckets = aging.data?.byPayStatus;

  const [tab,    setTab]    = useState<ApTab>("matched");
  const [drawer, setDrawer] = useState<FinanceApAgingRow | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => r.pay_status_ui === tab);
  }, [rows, tab]);

  const totalReady = buckets?.matched.amount ?? 0;
  const totalPaid  = buckets?.paid.amount    ?? 0;
  const totalAll   = useMemo(
    () => rows.reduce((s, r) => s + r.total, 0),
    [rows],
  );

  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <header className="flex items-end justify-between gap-4 flex-wrap mb-7">
        <div>
          <div className="text-label uppercase tracking-[0.12em] text-muted-foreground">
            Finance · Payables
          </div>
          <h1 className="font-display text-page mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
            A/P · Payables
          </h1>
          <div className="text-body text-muted-foreground">
            Supplier POs · NET 30 from issue date · three-way match required to pay
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3.5 mb-6">
        <Kpi label="Ready to pay" value={rmCompact(totalReady)} hint={`${buckets?.matched.count ?? 0} matched POs`} tone="warn" accent />
        <Kpi label="Paid this month" value={rmCompact(totalPaid)} hint={`${buckets?.paid.count ?? 0} settlements`} tone="ok" />
        <Kpi label="Total exposure" value={rmCompact(totalAll)} hint={`${rows.length} active POs`} />
      </div>

      <div className="flex gap-1 mb-3.5 border-b border-border">
        {TAB_ORDER.map((t) => {
          const count = buckets?.[t].count ?? 0;
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3.5 py-2 text-meta font-semibold transition-colors -mb-px border-b-2 ${
                active
                  ? "text-foreground border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              }`}
            >
              {TAB_LABEL[t]}{" "}
              <span className="font-mono text-label text-muted-foreground ml-1">· {count}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-card rounded-md border border-border overflow-auto">
        <div
          className="grid items-center px-4 py-2.5 bg-muted/40 border-b border-border text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground"
          style={{ gridTemplateColumns: "110px 1.4fr 1.2fr 70px 130px 100px 90px", minWidth: 920 }}
        >
          <span>PO</span>
          <span>Supplier</span>
          <span>SKU</span>
          <span className="text-right">Qty</span>
          <span>Match</span>
          <span className="text-right">Total</span>
          <span className="text-right">Action</span>
        </div>

        {aging.isLoading ? (
          <div className="p-12 text-center text-meta text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-meta text-muted-foreground">No POs in this state.</div>
        ) : (
          filtered.map((r) => <ApTableRow key={r.po_id} row={r} onView={() => setDrawer(r)} />)
        )}
      </div>

      {aging.error && (
        <div className="mt-5 p-3 text-meta rounded-md bg-destructive/5 text-destructive border border-destructive/30">
          Failed to load payables: {String(aging.error)}
        </div>
      )}

      {drawer && <APDrawer row={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}

function ApTableRow({ row, onView }: { row: FinanceApAgingRow; onView: () => void }) {
  const skuLabel =
    row.lines.length > 1
      ? `${row.lines.length} lines · ${row.qty} units total`
      : row.lines[0]?.sku_name ?? "—";

  // 3-way match: PO is always green (it exists). DO is green when has_do
  // (po_receipts row exists). INV is green once pay_status_ui has progressed
  // past matched (scheduled / paid imply finance has accepted the supplier
  // invoice).
  const doOk  = row.has_do || row.pay_status_ui !== "in_production"
                            && row.pay_status_ui !== "in_transit";
  const invOk = row.pay_status_ui === "matched"
              || row.pay_status_ui === "scheduled"
              || row.pay_status_ui === "paid";

  return (
    <div
      className="grid items-center px-4 py-3 border-b border-border text-meta"
      style={{ gridTemplateColumns: "110px 1.4fr 1.2fr 70px 130px 100px 90px", minWidth: 920 }}
    >
      <span className="font-mono font-semibold">{row.po_id}</span>
      <span>{row.supplier_name ?? "—"}</span>
      <span className="text-muted-foreground text-label">{skuLabel}</span>
      <span className="font-mono text-right">{row.qty}</span>
      <span className="flex gap-1 text-label">
        <MatchPill ok>PO</MatchPill>
        <MatchPill ok={doOk}>DO</MatchPill>
        <MatchPill ok={invOk}>INV</MatchPill>
      </span>
      <span className="font-mono text-right font-semibold">{rm(row.total)}</span>
      <span className="text-right">
        <button
          type="button"
          onClick={onView}
          className="text-label px-2.5 py-1 rounded border border-border bg-background hover:bg-muted/40"
        >
          View
        </button>
      </span>
    </div>
  );
}

function MatchPill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded font-semibold text-label ${
        ok
          ? "bg-success/15 text-success"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {children}
    </span>
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
