import { useMemo, useState } from "react";
import {
  useFinanceArAging,
  type FinanceArAgingRow,
} from "@/lib/queries";
import { rm, rmCompact } from "@/lib/format-currency";
import ARDrawer from "./ARDrawer";

type StatusFilter = "open" | "settled" | "all";
type AgingFilter  = "all" | "0-30" | "31-60" | "61-90" | "90+";

/**
 * Finance AR (Receivables) page — Phase 5 Chunk A.
 *
 * Visual reference: `reference/proto/finance-ar.jsx:1-109`. Renders a
 * filterable table of customer-order receivables sourced from the
 * `finance_ar_aging` RPC (single round-trip; rows + buckets in one
 * payload — Q6=A locked).
 *
 * Filters live in component state; the API itself returns all rows so
 * the user can re-filter without round-trips. Drawer opens on row View
 * click; ARDrawer wires the Record-receipt + Issue-invoice mutations
 * (A1 + A2 acceptance flows).
 */
export default function FinanceAR() {
  const aging = useFinanceArAging();
  const rows  = aging.data?.rows ?? [];

  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [agingFilter, setAgingFilter]   = useState<AgingFilter>("all");
  const [drawer, setDrawer]             = useState<FinanceArAgingRow | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter === "open"    && r.outstanding <= 0) return false;
      if (statusFilter === "settled" && r.outstanding > 0)  return false;
      if (agingFilter !== "all" && r.aging !== agingFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const c = (r.customer_name ?? "").toLowerCase();
        const d = (r.dealer_name   ?? "").toLowerCase();
        const i = r.invoice_no.toLowerCase();
        if (!c.includes(q) && !d.includes(q) && !i.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, agingFilter]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        gross:       acc.gross       + r.total,
        paid:        acc.paid        + r.paid,
        outstanding: acc.outstanding + r.outstanding,
      }),
      { gross: 0, paid: 0, outstanding: 0 },
    );
  }, [filtered]);

  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <header className="flex items-end justify-between gap-4 flex-wrap mb-7">
        <div>
          <div className="text-label uppercase tracking-[0.12em] text-muted-foreground">
            Finance · Receivables
          </div>
          <h1 className="font-display text-page mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
            A/R · Receivables
          </h1>
          <div className="text-body text-muted-foreground">
            Money customers owe Carres. Each row is one customer order.
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3.5 mb-5">
        <Kpi label="Gross billed"  value={rmCompact(totals.gross)}       hint={`${filtered.length} invoices`} />
        <Kpi label="Collected"     value={rmCompact(totals.paid)}        hint={totals.gross > 0 ? `${Math.round((totals.paid / totals.gross) * 100)}% of gross` : "—"} tone="ok" />
        <Kpi label="Outstanding"   value={rmCompact(totals.outstanding)} hint="What we still need to collect" tone="warn" accent />
      </div>

      <FilterBar
        search={search}        onSearch={setSearch}
        status={statusFilter}  onStatus={setStatusFilter}
        aging={agingFilter}    onAging={setAgingFilter}
      />

      <div className="bg-card rounded-md border border-border overflow-auto">
        <div
          className="grid items-center px-4 py-2.5 bg-muted/40 border-b border-border text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground"
          style={{ gridTemplateColumns: "120px 1.2fr 1fr 90px 110px 110px 110px 90px", minWidth: 980 }}
        >
          <span>Invoice</span>
          <span>Customer</span>
          <span>Dealer</span>
          <span>Aging</span>
          <span className="text-right">Total</span>
          <span className="text-right">Paid</span>
          <span className="text-right">Outstanding</span>
          <span className="text-right">Action</span>
        </div>

        {aging.isLoading ? (
          <div className="p-12 text-center text-meta text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-meta text-muted-foreground">
            Nothing matches those filters.
          </div>
        ) : (
          filtered.map((r) => (
            <ARRow key={r.order_id} row={r} onView={() => setDrawer(r)} />
          ))
        )}
      </div>

      {drawer && <ARDrawer row={drawer} onClose={() => setDrawer(null)} />}

      {aging.error && (
        <div className="mt-5 p-3 text-meta rounded-md bg-destructive/5 text-destructive border border-destructive/30">
          Failed to load receivables: {String(aging.error)}
        </div>
      )}
    </div>
  );
}

// ---------- Filter bar ----------
function FilterBar({
  search, onSearch,
  status, onStatus,
  aging,  onAging,
}: {
  search: string;       onSearch: (v: string) => void;
  status: StatusFilter; onStatus: (v: StatusFilter) => void;
  aging:  AgingFilter;  onAging:  (v: AgingFilter)  => void;
}) {
  return (
    <div className="bg-card rounded-md border border-border p-3 mb-3.5 flex items-center gap-3 flex-wrap">
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search customer, dealer, or INV-…"
        className="flex-1 min-w-[240px] px-2.5 py-1.5 border border-border rounded text-meta bg-background outline-none"
      />
      <Segmented
        options={[["open", "Open"], ["settled", "Settled"], ["all", "All"]]}
        value={status}
        onChange={(v) => onStatus(v as StatusFilter)}
      />
      <Segmented
        options={[["all", "All ages"], ["0-30", "0-30"], ["31-60", "31-60"], ["61-90", "61-90"], ["90+", "90+"]]}
        value={aging}
        onChange={(v) => onAging(v as AgingFilter)}
      />
    </div>
  );
}

function Segmented({
  options, value, onChange,
}: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-px bg-muted rounded p-0.5">
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`px-2.5 py-1 rounded text-label font-semibold transition-colors ${
            value === k
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

// ---------- Row ----------
function ARRow({ row, onView }: { row: FinanceArAgingRow; onView: () => void }) {
  return (
    <div
      className="grid items-center px-4 py-3 border-b border-border text-meta"
      style={{ gridTemplateColumns: "120px 1.2fr 1fr 90px 110px 110px 110px 90px", minWidth: 980 }}
    >
      <span className="font-mono font-semibold">{row.invoice_no}</span>
      <span>{row.customer_name}</span>
      <span className="text-muted-foreground">{row.dealer_name ?? "—"}</span>
      <span>
        <AgingPill bucket={row.aging} />
      </span>
      <span className="font-mono text-right">{rm(row.total)}</span>
      <span className="font-mono text-right text-muted-foreground">{rm(row.paid)}</span>
      <span className={`font-mono text-right font-semibold ${row.outstanding > 0 ? "text-primary" : "text-muted-foreground"}`}>
        {rm(row.outstanding)}
      </span>
      <span className="text-right">
        <button
          type="button"
          onClick={onView}
          className="px-2.5 py-1 text-label border border-border rounded hover:bg-accent/50"
        >
          View
        </button>
      </span>
    </div>
  );
}

function AgingPill({ bucket }: { bucket: FinanceArAgingRow["aging"] }) {
  const tone =
    bucket === "0-30"  ? "bg-success/10 text-success"        :
    bucket === "31-60" ? "bg-primary/10 text-primary"        :
                         "bg-destructive/10 text-destructive";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-label font-semibold ${tone}`}>
      <span className="w-1 h-1 rounded-full bg-current mr-1.5" />
      {bucket}d
    </span>
  );
}

// ---------- KPI ----------
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

