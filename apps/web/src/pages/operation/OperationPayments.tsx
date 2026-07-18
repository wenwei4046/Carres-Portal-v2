import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, ChevronRight, ChevronDown } from "lucide-react";
import {
  PAYMENT_STATUSES,
  STORAGE_RATES,
  computeStorageFee,
  summarizePayments,
  type PaymentKind,
  type UpdateOpsOrderControlInput,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { cjkClassName } from "@/lib/cjk";
import { fmtDateShort } from "@/lib/fmt-date";
import { areaForAddress, detectState } from "@/lib/region";
import ListPageShell, { type ActiveChip } from "@/components/ListPageShell";

/**
 * OperationPayments — the Master Sheet "Balance" tab, live (Jess 2026-06-12).
 * One row per active order: balance owing (from AutoCount), the storage fee
 * accruing from the ETA (MS/BF RM150/month + SOF RM200/2 weeks, manually
 * overridable), and the payment-follow-up status. All three persist to the
 * existing ops_order_control overlay via PUT /operation/orders/:id/control.
 *
 * Migrated to the shared List archetype (Jess 2026-07-12): renders through
 * <ListPageShell> like Orders — no oversized title, the three KPIs demoted into
 * the facet-top "Summary" block, 40px rows, token-only colour. Facets: Payment
 * Status (dynamic — the real values, "Follow Up Balance" merged into Follow Up),
 * Region (from customer_address via @/lib/region), and Overdue. The data/edit
 * logic (owing + storage-fee compute, EditableNumber, status dropdown, sparse
 * upsert save) is UNCHANGED — this is a chrome migration, not a rewrite.
 */
const PAYMENTS_KEY = ["operation", "payments"] as const;

interface RawCtrl {
  balance: number | string | null;
  payment_status: string | null;
  storage_from: string | null;
  storage_fee_override: number | string | null;
  balance_due_date: string | null;
  storage_collected_at: string | null;
  storage_waiver_status: string | null;
  extension_original_date: string | null;
}
interface RawLedgerEntry {
  amount: number | string;
  kind: PaymentKind;
}
interface RawPaymentRow {
  id: string;
  so: number;
  status: string;
  customer_name: string;
  customer_address: string | null;
  delivery_date: string | null;
  delivery_date_tbd: boolean | null;
  delivered_at: string | null;
  source_ref: string[] | null;
  order_lines: { sku: string; qty: number }[] | null;
  order_payments: RawLedgerEntry[] | null;
  ops_order_control: RawCtrl[] | RawCtrl | null;
}

function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Item-category check for storage scope: mattress/bed frame → MS/BF rate, sofa
 *  → SOF rate. Mirrors OperationOrdersControl.lineCategory but grouped. */
function catOf(sku: string): "msbf" | "sof" | "other" {
  const s = sku.trim().toLowerCase();
  if (s.startsWith("mattress:") || s.startsWith("bedframe:") || /^ms\d/.test(s) || /^bf\d/.test(s))
    return "msbf";
  if (s.startsWith("sofa:") || /^(sof|sf)\d/.test(s)) return "sof";
  return "other";
}

function rm(n: number): string {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Payment-status → pill colour. */
function statusPill(s: string | null): string {
  switch ((s ?? "").toLowerCase()) {
    case "paid":
      return "pill-confirmed";
    case "partial":
    case "follow up":
    case "follow up balance":
      return "pill-warning";
    case "unpaid":
      return "pill-overdue";
    default:
      return "pill-neutral";
  }
}

// ── Facet buckets ────────────────────────────────────────────────────────────
const KV_LABEL = "Klang Valley";
const OTHERS_LABEL = "Others";
/** Region bucket for the state facet: Klang Valley (grouped) · each outstation
 *  state / Singapore · "Others" when the address is undetectable. Mirrors
 *  OperationOrdersControl.regionBucket. */
function regionBucket(address: string | null): string {
  if (areaForAddress(address) === "KV") return KV_LABEL;
  return detectState(address) ?? OTHERS_LABEL;
}

const UNSET_LABEL = "Unset";
/** Payment-status bucket for the facet — normalises the RAW column value:
 *  blank → "Unset" (the bulk of rows are unset), and the Master-sheet raw
 *  "Follow Up Balance" merges into "Follow Up" (the importer treats them as
 *  synonymous → one bucket). Any other stored value passes through verbatim. */
function payBucket(s: string | null): string {
  const v = (s ?? "").trim();
  if (v === "") return UNSET_LABEL;
  if (/^follow up/i.test(v)) return "Follow Up";
  return v;
}
/** Facet display order — real values first in a sensible collection order, then
 *  anything unexpected alphabetically. */
const PAY_ORDER = [UNSET_LABEL, "Paid", "Follow Up", "Partial", "Unpaid"];

interface Row {
  id: string;
  so: number;
  customer: string;
  region: string;
  ref: string[];
  eta: string | null;
  etaTbd: boolean;
  delivered: boolean;
  hasMsbf: boolean;
  hasSof: boolean;
  balance: number | null;
  paymentStatus: string | null;
  payBucket: string;
  storageFrom: string | null;
  storageOverride: number | null;
  /** computed (or overridden) storage fee + breakdown */
  storage: { msbf: number; sof: number; total: number; days: number };
  effectiveStorage: number;
  /** Ledger (0184): goods paid (payment+deposit) + storage collected. */
  goodsPaid: number;
  storageCollected: boolean;
  goodsOwing: number;
  storageOwing: number;
  dueDate: string | null;
  overdue: boolean;
  owing: number;
}

/** The "owing / storage" view predicate — anything still to chase. */
function isOwingRow(r: Row): boolean {
  return r.owing > 0 || (r.paymentStatus != null && r.paymentStatus.toLowerCase() !== "paid");
}

export default function OperationPayments() {
  const qc = useQueryClient();
  const [view, setView] = useState<"owing" | "all">("owing");
  const [facetOpen, setFacetOpen] = useState(true);
  const [payFilter, setPayFilter] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const today = todayIso();

  const { data, isLoading, isError, error, refetch } = useQuery<{ rows: RawPaymentRow[] }>({
    queryKey: PAYMENTS_KEY,
    queryFn: () => apiFetch("/api/operation/payments"),
  });

  const saveMut = useMutation({
    mutationFn: (a: { orderId: string; patch: UpdateOpsOrderControlInput }) =>
      apiFetch(`/api/operation/orders/${a.orderId}/control`, {
        method: "PUT",
        body: JSON.stringify(a.patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PAYMENTS_KEY }),
    onError: (e) => toast.error(`Save failed — ${(e as Error).message}`),
  });

  const rows = useMemo<Row[]>(() => {
    const raw = data?.rows ?? [];
    return raw.map((r) => {
      const ctrl: RawCtrl | null = Array.isArray(r.ops_order_control)
        ? r.ops_order_control[0] ?? null
        : r.ops_order_control;
      const lines = r.order_lines ?? [];
      const hasMsbf = lines.some((l) => catOf(l.sku) === "msbf");
      const hasSof = lines.some((l) => catOf(l.sku) === "sof");
      const storageFrom = ctrl?.storage_from ?? null;
      const storageOverride = num(ctrl?.storage_fee_override);
      // Storage free-window basis: a recorded extension's snapshotted original
      // delivery date (migration 0196), else the manual start, else the order
      // delivery date; freezes at delivery (delivered_at as the clock end).
      const start = ctrl?.extension_original_date ?? storageFrom ?? r.delivery_date;
      const asOf = r.delivered_at ? r.delivered_at.slice(0, 10) : today;
      const storage = computeStorageFee({ startDate: start, asOf, hasMsbf, hasSof });
      const effectiveStorage = storageOverride ?? storage.total;
      const balance = num(ctrl?.balance);
      // Net the payment ledger (0184): goods paid reduces the balance owing;
      // a stamped storage_collected_at means the storage fee is cleared.
      const ledger = (r.order_payments ?? []).map((p) => ({
        amount: Number(p.amount) || 0,
        kind: p.kind,
      }));
      const sum = summarizePayments(ledger, balance ?? 0);
      const goodsPaid = sum.byKind.payment + sum.byKind.deposit;
      const storageCollected = ctrl?.storage_collected_at != null;
      const goodsOwing = balance != null ? Math.max(0, balance - goodsPaid) : 0;
      const storageOwing = storageCollected
        ? 0
        : Math.max(0, effectiveStorage - sum.storageCollected);
      const dueDate = ctrl?.balance_due_date ?? null;
      const overdue = !!dueDate && dueDate < today && goodsOwing > 0;
      const paymentStatus = ctrl?.payment_status ?? null;
      return {
        id: r.id,
        so: r.so,
        customer: r.customer_name,
        region: regionBucket(r.customer_address ?? null),
        ref: (r.source_ref ?? []).filter(Boolean),
        eta: r.delivery_date,
        etaTbd: !!r.delivery_date_tbd,
        delivered: r.status === "delivered",
        hasMsbf,
        hasSof,
        balance,
        paymentStatus,
        payBucket: payBucket(paymentStatus),
        storageFrom,
        storageOverride,
        storage,
        effectiveStorage,
        goodsPaid,
        storageCollected,
        goodsOwing,
        storageOwing,
        dueDate,
        overdue,
        owing: goodsOwing + storageOwing,
      };
    });
  }, [data, today]);

  // View (owing / all) applied first — facet counts are computed from this base,
  // exactly like Orders derives its facet counts from the tab-filtered set.
  const baseRows = useMemo(
    () => (view === "all" ? rows : rows.filter(isOwingRow)),
    [rows, view],
  );

  const visible = useMemo(() => {
    let r = baseRows;
    if (payFilter) r = r.filter((x) => x.payBucket === payFilter);
    if (regionFilter) r = r.filter((x) => x.region === regionFilter);
    if (overdueOnly) r = r.filter((x) => x.overdue);
    // Most owing first.
    return [...r].sort((a, b) => b.owing - a.owing);
  }, [baseRows, payFilter, regionFilter, overdueOnly]);

  const totals = useMemo(() => {
    let goodsOwing = 0;
    let storageOwing = 0;
    for (const r of visible) {
      goodsOwing += r.goodsOwing;
      storageOwing += r.storageOwing;
    }
    return {
      balance: goodsOwing,
      storage: storageOwing,
      owing: goodsOwing + storageOwing,
    };
  }, [visible]);

  // ── Facet entries (counts from the view-filtered base) ─────────────────────
  const payEntries = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of baseRows) m.set(r.payBucket, (m.get(r.payBucket) ?? 0) + 1);
    const keys = [...m.keys()].sort((a, b) => {
      const ia = PAY_ORDER.indexOf(a);
      const ib = PAY_ORDER.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
    return keys.map((k) => ({ key: k, count: m.get(k) ?? 0 }));
  }, [baseRows]);

  const regionEntries = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of baseRows) m.set(r.region, (m.get(r.region) ?? 0) + 1);
    const keys = [...m.keys()].sort((a, b) => {
      if (a === KV_LABEL) return -1;
      if (b === KV_LABEL) return 1;
      if (a === OTHERS_LABEL) return 1;
      if (b === OTHERS_LABEL) return -1;
      return a.localeCompare(b);
    });
    return keys.map((k) => ({ region: k, count: m.get(k) ?? 0 }));
  }, [baseRows]);

  const overdueCount = useMemo(() => baseRows.filter((r) => r.overdue).length, [baseRows]);

  const owingCount = useMemo(() => rows.filter(isOwingRow).length, [rows]);

  const save = (orderId: string, patch: UpdateOpsOrderControlInput) =>
    saveMut.mutate({ orderId, patch });

  const toggleGroup = (t: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const activeChips: ActiveChip[] = [];
  if (payFilter) activeChips.push({ label: `Status: ${payFilter}`, onClear: () => setPayFilter(null) });
  if (regionFilter)
    activeChips.push({ label: `Region: ${regionFilter}`, onClear: () => setRegionFilter(null) });
  if (overdueOnly) activeChips.push({ label: "Overdue", onClear: () => setOverdueOnly(false) });
  const anyFilter = activeChips.length > 0;
  const resetFilters = () => {
    setPayFilter(null);
    setRegionFilter(null);
    setOverdueOnly(false);
  };

  if (isError) {
    return (
      <div className="px-6 py-8">
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
          <div className="text-destructive font-semibold mb-2">Couldn&rsquo;t load payments</div>
          <div className="text-[12px] text-base-700 mb-3">
            {(error as Error | undefined)?.message ?? "Unknown error"}
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="btn-secondary text-[11px] py-1.5 px-3"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ListPageShell
      testId="operation-payments"
      breadcrumb={
        <>
          <span>Operations</span>
          <ChevronRight size={12} className="text-base-300" />
          <span className="text-base-600">Payments</span>
        </>
      }
      meta={
        <button
          type="button"
          onClick={() => void refetch()}
          title="Refresh"
          aria-label="Refresh payments"
          className="p-1 rounded hover:text-base-900 hover:bg-base-100 transition-colors"
        >
          <RefreshCw size={14} strokeWidth={2} />
        </button>
      }
      title="Payments"
      facetOpen={facetOpen}
      onFacetToggle={() => setFacetOpen((v) => !v)}
      toolbar={
        <StatusTabs
          tabs={[
            { key: "owing", label: "Owing / storage", count: owingCount },
            { key: "all", label: "All orders", count: rows.length },
          ]}
          active={view}
          onSelect={setView}
        />
      }
      toolbarRight={
        <span className="text-[12px] text-base-500 tabular-nums" title="Rows shown / in this view">
          {visible.length} of {baseRows.length}
        </span>
      }
      activeChips={activeChips}
      footer={
        <>
          <span className="tabular-nums">
            {baseRows.length} {baseRows.length === 1 ? "order" : "orders"}
          </span>
          {anyFilter && (
            <button
              type="button"
              onClick={resetFilters}
              className="hover:text-base-900 transition-colors"
            >
              Reset filters
            </button>
          )}
        </>
      }
      facet={
        <>
          {/* Summary — the three demoted KPIs, facet-top like Orders. Token
              classes only (design-standard: no raw hex in new code). */}
          <div className="bg-white border border-base-200 rounded-[12px] p-2">
            <div className="px-1.5 pt-0.5 pb-1 text-[11px] font-bold uppercase tracking-[0.04em] text-base-500">
              Summary
            </div>
            {[
              {
                label: "Balance owing",
                value: rm(totals.balance),
                cls: totals.balance > 0 ? "text-base-900" : "text-base-600",
              },
              {
                label: "Storage fees",
                value: rm(totals.storage),
                cls: totals.storage > 0 ? "text-warning" : "text-base-600",
              },
              {
                label: "Total to collect",
                value: rm(totals.owing),
                cls: totals.owing > 0 ? "text-danger" : "text-base-600",
              },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between px-1.5 py-1">
                <span className="text-[13px] text-base-700">{s.label}</span>
                <span className={`text-[13px] font-bold tabular-nums ${s.cls}`}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Facet groups — clickable counts (Payment Status · Region · Overdue). */}
          <div className="bg-white border border-base-200 rounded-[12px] p-1.5">
            <FacetGroup
              title="PAYMENT STATUS"
              total={baseRows.length}
              collapsed={collapsed.has("PAYMENT STATUS")}
              onToggle={() => toggleGroup("PAYMENT STATUS")}
            >
              {payEntries.map((e) => (
                <FacetRow
                  key={e.key}
                  label={e.key}
                  count={e.count}
                  active={payFilter === e.key}
                  onClick={() => setPayFilter((v) => (v === e.key ? null : e.key))}
                />
              ))}
            </FacetGroup>

            <FacetGroup
              title="REGION"
              total={baseRows.length}
              collapsed={collapsed.has("REGION")}
              onToggle={() => toggleGroup("REGION")}
            >
              {regionEntries.map((e) => (
                <FacetRow
                  key={e.region}
                  label={e.region}
                  count={e.count}
                  active={regionFilter === e.region}
                  onClick={() => setRegionFilter((v) => (v === e.region ? null : e.region))}
                />
              ))}
            </FacetGroup>

            <FacetGroup
              title="FLAGS"
              collapsed={collapsed.has("FLAGS")}
              onToggle={() => toggleGroup("FLAGS")}
            >
              <FacetRow
                label="Overdue"
                count={overdueCount}
                active={overdueOnly}
                title="Balance past its recorded due date, still owing"
                onClick={() => setOverdueOnly((v) => !v)}
              />
            </FacetGroup>
          </div>
        </>
      }
    >
      {/* Listing — the only scroll area; white surface, 40px rows. */}
      <div className="flex-1 min-h-0 bg-white border border-[rgba(34,31,32,0.10)] rounded-t-lg rounded-b-none shadow-[0_1px_2px_rgba(34,31,32,0.04),0_4px_16px_rgba(34,31,32,0.05)] overflow-auto">
        <table className="w-full border-collapse text-[13px] table-fixed [&_td]:h-[40px] [&_td]:py-1 [&_td]:align-middle [&_td]:overflow-hidden">
          {/* Percentage colgroup (mirrors Orders) — table-fixed + w-full so the
              table is always exactly the container width and NEVER horizontally
              scrolls; long content ellipsis-truncates. */}
          <colgroup>
            <col style={{ width: "15%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="bg-base-50 border-b border-base-200">
              <Th>Order ID</Th>
              <Th>Customer</Th>
              <Th>ETA</Th>
              <Th>Storage fee</Th>
              <Th>Balance (RM)</Th>
              <Th>Total owing</Th>
              <Th>Payment status</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-12 text-center text-[12px] text-base-500">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && visible.length === 0 && (
              <tr>
                <td colSpan={7} className="p-12 text-center text-[12px] text-base-500">
                  {anyFilter
                    ? "No orders match these filters."
                    : view === "owing"
                      ? "Nothing outstanding. 🎉"
                      : "No orders."}
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <PaymentRow key={r.id} r={r} onSave={save} />
            ))}
          </tbody>
        </table>
      </div>
    </ListPageShell>
  );
}

function PaymentRow({
  r,
  onSave,
}: {
  r: Row;
  onSave: (id: string, patch: UpdateOpsOrderControlInput) => void;
}) {
  // Secondary storage detail (auto/manual/collected) folded into a tooltip so
  // the row stays a single 40px line.
  const storageTitle = [
    r.hasMsbf ? `MS/BF ${rm(r.storage.msbf)}` : null,
    r.hasSof ? `SOF ${rm(r.storage.sof)}` : null,
    r.storage.days > 0 ? `${r.storage.days} days since ETA` : "not past ETA",
    r.storageOverride != null ? `manual — auto ${rm(r.storage.total)}` : null,
    r.storageCollected ? "✓ collected" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // Balance secondary detail (paid / due) → tooltip.
  const balanceTitle = [
    r.goodsPaid > 0 ? `− ${rm(r.goodsPaid)} paid` : null,
    r.dueDate ? `${r.overdue ? "overdue" : "due"} ${fmtDateShort(r.dueDate)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <tr className="border-t border-base-100 hover:bg-base-50">
      <td
        className="px-3 whitespace-nowrap"
        title={r.ref.length > 0 ? r.ref.join(" + ") : undefined}
      >
        <span className="font-mono font-semibold text-base-900 text-[13px]">SO-{r.so}</span>
        {r.ref.length > 0 && (
          <span className="ml-1.5 font-mono text-[10.5px] text-base-400">
            {r.ref.length === 1 ? r.ref[0] : `${r.ref[0]} +${r.ref.length - 1}`}
          </span>
        )}
      </td>
      <td className="px-3 max-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`${cjkClassName(r.customer)} font-medium text-base-900 truncate`}>
            {r.customer || "—"}
          </span>
          {r.delivered && <span className="shrink-0 text-[10px] text-success">delivered</span>}
        </div>
      </td>
      <td className="px-3 whitespace-nowrap text-[12px] text-base-700">
        {r.etaTbd ? (
          <span className="pill pill-warning">TBD</span>
        ) : r.eta ? (
          fmtDateShort(r.eta)
        ) : (
          "—"
        )}
      </td>
      {/* Storage fee — computed, with a manual override input */}
      <td className="px-3 whitespace-nowrap" title={storageTitle}>
        <div className="flex items-center gap-1.5">
          <EditableNumber
            value={r.storageOverride}
            placeholder={r.storage.total > 0 ? r.storage.total.toFixed(0) : "0"}
            onSave={(v) => onSave(r.id, { storage_fee_override: v })}
            prefix="RM"
            width={64}
          />
          {r.storageOverride != null && (
            <span className="text-[10px] text-warning" title={`manual — auto ${rm(r.storage.total)}`}>
              M
            </span>
          )}
          {r.storageCollected && (
            <span className="text-[10px] text-success" title="storage collected">
              ✓
            </span>
          )}
        </div>
      </td>
      {/* Balance — RM owing, editable (from AutoCount import or keyed) */}
      <td className="px-3 whitespace-nowrap" title={balanceTitle || undefined}>
        <div className="flex items-center gap-1.5">
          <EditableNumber
            value={r.balance}
            placeholder="0"
            onSave={(v) => onSave(r.id, { balance: v })}
            prefix="RM"
            width={78}
          />
          {r.overdue && (
            <span className="text-[10px] text-destructive font-semibold">overdue</span>
          )}
          {!r.overdue && r.goodsPaid > 0 && (
            <span className="text-[10px] text-success" title={`− ${rm(r.goodsPaid)} paid`}>
              paid
            </span>
          )}
        </div>
      </td>
      <td className="px-3 whitespace-nowrap font-semibold tabular-nums text-base-900 text-[13px]">
        {rm(r.owing)}
      </td>
      {/* Payment status — dropdown */}
      <td className="px-3 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className={`pill ${statusPill(r.paymentStatus)}`}>{r.paymentStatus ?? "—"}</span>
          <select
            value={r.paymentStatus ?? ""}
            onChange={(e) => onSave(r.id, { payment_status: e.target.value || null })}
            className="text-[11px] px-1.5 py-1 border border-base-200 rounded bg-white"
            aria-label={`Payment status for SO-${r.so}`}
          >
            <option value="">— set —</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </td>
    </tr>
  );
}

/** Inline number cell — seeds from the server value, resyncs when it changes,
 *  saves on blur/Enter only when the value actually changed. Empty → null. */
function EditableNumber({
  value,
  placeholder,
  onSave,
  prefix,
  width,
}: {
  value: number | null;
  placeholder?: string;
  onSave: (v: number | null) => void;
  prefix?: string;
  width?: number;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    setText(value == null ? "" : String(value));
  }, [value]);

  function commit() {
    const trimmed = text.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && !Number.isFinite(next)) {
      setText(value == null ? "" : String(value));
      return;
    }
    if ((next ?? null) !== (value ?? null)) onSave(next);
  }

  return (
    <span className="inline-flex items-center gap-1 rounded border border-base-200 px-1.5 py-1 bg-white focus-within:border-base-700">
      {prefix && <span className="text-[10px] text-base-400">{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="text-[12px] tabular-nums bg-transparent outline-none"
        style={{ width: width ?? 80 }}
      />
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-base-500 text-left">
      {children}
    </th>
  );
}

// ── Facet primitives (token-only replicas of the Orders facet look) ──────────
/** One clickable facet row — label + count; active = flame-tint fill. Mirrors
 *  OperationOrdersControl.KanbanRow but with design-standard token classes
 *  (no raw hex) so it passes the ratchet lint. */
function FacetRow({
  label,
  count,
  active,
  onClick,
  title,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`w-full flex items-center gap-1.5 rounded-full text-left px-2.5 py-1.5 transition-colors ${
        active ? "bg-signature-50" : "hover:bg-base-100"
      }`}
    >
      <span
        className={`flex-1 min-w-0 truncate text-[13px] ${
          active ? "text-base-900 font-bold" : "text-base-700"
        }`}
      >
        {label}
      </span>
      <span
        className={`text-[13px] tabular-nums shrink-0 ${
          active ? "text-base-900 font-bold" : "text-base-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/** Facet GROUP — a light title bar with the group total + collapse toggle.
 *  Mirrors OperationOrdersControl.KanbanGroup with token classes. */
function FacetGroup({
  title,
  total,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  total?: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-1 rounded-md px-2 py-1.5 bg-base-100 hover:brightness-[0.97]"
      >
        {collapsed ? (
          <ChevronRight size={12} className="shrink-0 text-base-500" />
        ) : (
          <ChevronDown size={12} className="shrink-0 text-base-500" />
        )}
        <span className="uppercase flex-1 text-left text-[11px] font-bold tracking-[0.04em] text-base-900">
          {title}
        </span>
        {total !== undefined && (
          <span className="tabular-nums shrink-0 text-[11px] font-semibold text-base-500">
            {total}
          </span>
        )}
      </button>
      {!collapsed && <div className="flex flex-col gap-0.5 mt-0.5">{children}</div>}
    </div>
  );
}

/** Owing / All view tabs — the top toolbar, replacing the old inline chips.
 *  Mirrors OperationOrdersControl.StatusTabs (ink-fill active) with tokens. */
function StatusTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: { key: "owing" | "all"; label: string; count: number }[];
  active: "owing" | "all";
  onSelect: (k: "owing" | "all") => void;
}) {
  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {tabs.map((t) => {
        const on = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(t.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full transition-colors text-[13px] border ${
              on
                ? "bg-base-900 text-white font-semibold border-base-900"
                : "bg-white text-base-600 font-medium border-base-200"
            }`}
          >
            {t.label}
            <span
              className={`tabular-nums text-[12px] ${on ? "text-white/70" : "text-base-400"}`}
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
