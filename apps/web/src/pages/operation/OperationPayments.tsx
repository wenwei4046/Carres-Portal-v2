import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Lock,
  MessageCircle,
  Phone,
  X,
} from "lucide-react";
import {
  PAYMENT_STATUSES,
  computeStorageFee,
  summarizePayments,
  type PaymentKind,
  type UpdateOpsOrderControlInput,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { cjkClassName } from "@/lib/cjk";
import { fmtDate } from "@/lib/fmt-date";
import { areaForAddress, detectState } from "@/lib/region";
import {
  buildCustomerChase,
  buildCustomerReminder,
  rmAmount,
  salutationOf,
} from "@/lib/wa-templates";
import ListPageShell, { type ActiveChip } from "@/components/ListPageShell";

/**
 * OperationPayments — the Master Sheet "Balance" tab, rebuilt 2026-07-19 (Jess)
 * as the LOOSE, stock-aware Collections Desk (§A0 golden reference).
 *
 * The critical business rule baked in: **you chase the customer's money only
 * once you can answer "when's my delivery?"** — so every row carries the STOCK
 * & delivery signal (goods in / waiting ETA / supplier late) beside the money.
 * The money worklist QUEUES are stock-aware: "Ready to chase" = owing AND goods
 * in (safe to call); "Waiting stock" = owing but goods not in yet (hold the
 * call). Chasing opens a WhatsApp popover with a pre-call brief (stock + the
 * delivery window + "logistics contacts 1-3 days before") — the operator's
 * verbal script — while the WhatsApp text stays date-free per the locked
 * wa-templates rule.
 *
 * Loose layout: full-width white table, 52px rows, generous padding, no
 * truncation of the customer, two-line cells. Facets are multi-select Sets with
 * ✕-able chips. Dates via fmtDate() → "19 Jul 26, Sun" everywhere.
 *
 * Data/edit logic (owing + storage-fee compute, EditableNumber, status, sparse
 * upsert PUT /operation/orders/:id/control) is unchanged; stock (line_etas +
 * line_stock_status) + customer_phone were added to the GET select.
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
  line_etas: Record<string, string> | null;
  line_stock_status: Record<string, string> | null;
}
interface RawLedgerEntry {
  amount: number | string;
  kind: PaymentKind;
}
interface RawLine {
  sku: string;
  qty: number;
}
interface RawPaymentRow {
  id: string;
  so: number;
  status: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  delivery_date: string | null;
  delivery_date_tbd: boolean | null;
  delivered_at: string | null;
  source_ref: string[] | null;
  order_lines: RawLine[] | null;
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

/** Phone → wa.me base link (MY-aware). Local copy of OrderDetailDrawer.waLink so
 *  this page doesn't pull in the 6k-line drawer. */
function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const first = phone.split(/[|,/]/)[0] ?? "";
  let d = first.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("60")) {
    /* already international */
  } else if (d.startsWith("0")) {
    d = `60${d.slice(1)}`;
  } else {
    d = `60${d}`;
  }
  return `https://wa.me/${d}`;
}

// ── Stock & delivery ─────────────────────────────────────────────────────────
type StockState = "ready" | "waiting" | "no_eta" | "late" | "none";
interface StockInfo {
  state: StockState;
  etaIso: string | null;
}
/** Per-order stock signal from the imported per-line data (line_etas +
 *  line_stock_status; migration 0170). Mirrors OperationOrdersControl.stockEtaOf
 *  but self-contained: ready = every line in · waiting = future ETA · late =
 *  ETA passed, goods still out · no_eta = waiting, no ETA · none = untracked. */
function stockOf(ctrl: RawCtrl | null): StockInfo {
  const etas = ctrl?.line_etas ?? null;
  const status = ctrl?.line_stock_status ?? null;
  if ((!etas || Object.keys(etas).length === 0) && (!status || Object.keys(status).length === 0))
    return { state: "none", etaIso: null };

  const waitingKeys =
    status && Object.keys(status).length > 0
      ? Object.entries(status)
          .filter(([, v]) => String(v).toLowerCase() !== "ready")
          .map(([k]) => k)
      : Object.keys(etas ?? {});
  if (waitingKeys.length === 0) return { state: "ready", etaIso: null };

  let etaIso: string | null = null;
  if (etas) {
    const pool = waitingKeys.map((k) => etas[k]).filter(Boolean);
    for (const d of pool.length ? pool : Object.values(etas)) if (!etaIso || d > etaIso) etaIso = d;
  }
  if (!etaIso) return { state: "no_eta", etaIso: null };
  if (etaIso < todayIso()) return { state: "late", etaIso };
  return { state: "waiting", etaIso };
}

// ── Facet buckets ────────────────────────────────────────────────────────────
const KV_LABEL = "Klang Valley";
const OTHERS_LABEL = "Others";
function regionBucket(address: string | null): string {
  if (areaForAddress(address) === "KV") return KV_LABEL;
  return detectState(address) ?? OTHERS_LABEL;
}

const UNSET_LABEL = "Unset";
function payBucket(s: string | null): string {
  const v = (s ?? "").trim();
  if (v === "") return UNSET_LABEL;
  if (/^follow up/i.test(v)) return "Follow Up";
  return v;
}
const PAY_ORDER = [UNSET_LABEL, "Paid", "Follow Up", "Partial", "Unpaid"];

/** Payment-status → pill colour. */
function statusPill(s: string | null): string {
  switch ((s ?? "").toLowerCase()) {
    case "paid":
      return "pill-confirmed";
    case "partial":
    case "follow up":
      return "pill-warning";
    case "unpaid":
      return "pill-overdue";
    default:
      return "pill-neutral";
  }
}

/** Multi-select toggle helper (Jess 2026-07-19 — facets are Sets). */
function toggleInSet<T>(prev: Set<T>, v: T): Set<T> {
  const next = new Set(prev);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

// ── Queues (money worklist, stock-aware) ─────────────────────────────────────
const QUEUES = [
  {
    key: "ready",
    label: "Ready to chase",
    dot: "bg-success",
    desc: "Owing + goods in — safe to call (you can answer the delivery question)",
  },
  {
    key: "waiting",
    label: "Waiting stock",
    dot: "bg-warning",
    desc: "Owing but goods not in yet — hold the call, or chase supplier first",
  },
  {
    key: "late",
    label: "Stock late",
    dot: "bg-danger",
    desc: "Owing + supplier missed the ETA — chase the supplier, not the customer",
  },
  {
    key: "storage",
    label: "Storage running",
    dot: "bg-warning",
    desc: "A storage fee is accruing and uncollected — the collection lever",
  },
] as const;
type QueueKey = (typeof QUEUES)[number]["key"];

interface Row {
  id: string;
  so: number;
  customer: string;
  phone: string | null;
  region: string;
  ref: string[];
  lines: RawLine[];
  eta: string | null;
  etaTbd: boolean;
  delivered: boolean;
  hasMsbf: boolean;
  hasSof: boolean;
  stock: StockInfo;
  balance: number | null;
  paymentStatus: string | null;
  payBucket: string;
  storageFrom: string | null;
  storageOverride: number | null;
  storage: { msbf: number; sof: number; total: number; days: number };
  effectiveStorage: number;
  goodsPaid: number;
  storageCollected: boolean;
  goodsOwing: number;
  storageOwing: number;
  dueDate: string | null;
  overdue: boolean;
  owing: number;
  /** delivery held: goods in, not delivered, money owing → the 🔒 on Collect $. */
  held: boolean;
}

/** The "owing / storage" view predicate — anything still to chase. */
function isOwingRow(r: Row): boolean {
  return r.owing > 0 || (r.paymentStatus != null && r.paymentStatus.toLowerCase() !== "paid");
}

/** Does a row belong to a queue? (multi-match — an order can be in several.) */
function inQueue(r: Row, q: QueueKey): boolean {
  if (r.owing <= 0) return false;
  switch (q) {
    case "ready":
      return r.stock.state === "ready";
    case "waiting":
      return r.stock.state === "waiting" || r.stock.state === "no_eta";
    case "late":
      return r.stock.state === "late";
    case "storage":
      return r.storageOwing > 0;
  }
}

export default function OperationPayments() {
  const qc = useQueryClient();
  const [view, setView] = useState<"owing" | "all">("owing");
  const [facetOpen, setFacetOpen] = useState(true);
  const [queueFilter, setQueueFilter] = useState<Set<QueueKey>>(new Set());
  const [payFilter, setPayFilter] = useState<Set<string>>(new Set());
  const [regionFilter, setRegionFilter] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [chaseFor, setChaseFor] = useState<Row | null>(null);
  const today = todayIso();

  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery<{
    rows: RawPaymentRow[];
  }>({
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
      const ledger = (r.order_payments ?? []).map((p) => ({
        amount: Number(p.amount) || 0,
        kind: p.kind,
      }));
      const sum = summarizePayments(ledger, balance ?? 0);
      const goodsPaid = sum.byKind.payment + sum.byKind.deposit;
      const storageCollected = ctrl?.storage_collected_at != null;
      const goodsOwing = balance != null ? Math.max(0, balance - goodsPaid) : 0;
      const storageOwing = storageCollected ? 0 : Math.max(0, effectiveStorage - sum.storageCollected);
      const dueDate = ctrl?.balance_due_date ?? null;
      const overdue = !!dueDate && dueDate < today && goodsOwing > 0;
      const paymentStatus = ctrl?.payment_status ?? null;
      const stock = stockOf(ctrl);
      const delivered = r.status === "delivered";
      const owing = goodsOwing + storageOwing;
      const held = owing > 0 && stock.state === "ready" && !delivered;
      return {
        id: r.id,
        so: r.so,
        customer: r.customer_name,
        phone: r.customer_phone,
        region: regionBucket(r.customer_address ?? null),
        ref: (r.source_ref ?? []).filter(Boolean),
        lines,
        eta: r.delivery_date,
        etaTbd: !!r.delivery_date_tbd,
        delivered,
        hasMsbf,
        hasSof,
        stock,
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
        owing,
        held,
      };
    });
  }, [data, today]);

  const baseRows = useMemo(
    () => (view === "all" ? rows : rows.filter(isOwingRow)),
    [rows, view],
  );

  const visible = useMemo(() => {
    let r = baseRows;
    if (queueFilter.size > 0) r = r.filter((x) => [...queueFilter].some((q) => inQueue(x, q)));
    if (payFilter.size > 0) r = r.filter((x) => payFilter.has(x.payBucket));
    if (regionFilter.size > 0) r = r.filter((x) => regionFilter.has(x.region));
    // Most owing first.
    return [...r].sort((a, b) => b.owing - a.owing);
  }, [baseRows, queueFilter, payFilter, regionFilter]);

  const totals = useMemo(() => {
    let goodsOwing = 0;
    let storageOwing = 0;
    for (const r of visible) {
      goodsOwing += r.goodsOwing;
      storageOwing += r.storageOwing;
    }
    return { balance: goodsOwing, storage: storageOwing, owing: goodsOwing + storageOwing };
  }, [visible]);

  const queueCounts = useMemo(() => {
    const m = new Map<QueueKey, number>();
    for (const q of QUEUES) m.set(q.key, 0);
    for (const r of baseRows)
      for (const q of QUEUES) if (inQueue(r, q.key)) m.set(q.key, (m.get(q.key) ?? 0) + 1);
    return m;
  }, [baseRows]);

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

  // ── Active chips (each multi-select pick = one ✕-able chip) ─────────────────
  const activeChips: ActiveChip[] = [];
  for (const q of queueFilter) {
    const def = QUEUES.find((x) => x.key === q);
    activeChips.push({
      label: def?.label ?? q,
      onClear: () => setQueueFilter((prev) => toggleInSet(prev, q)),
    });
  }
  for (const p of payFilter)
    activeChips.push({ label: `Status: ${p}`, onClear: () => setPayFilter((prev) => toggleInSet(prev, p)) });
  for (const rg of regionFilter)
    activeChips.push({ label: rg, onClear: () => setRegionFilter((prev) => toggleInSet(prev, rg)) });
  const anyFilter = activeChips.length > 0;
  const resetFilters = () => {
    setQueueFilter(new Set());
    setPayFilter(new Set());
    setRegionFilter(new Set());
  };

  if (isError) {
    return (
      <div className="px-6 py-8">
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
          <div className="text-destructive font-semibold mb-2">Couldn&rsquo;t load payments</div>
          <div className="text-[12px] text-base-700 mb-3">
            {(error as Error | undefined)?.message ?? "Unknown error"}
          </div>
          <button type="button" onClick={() => void refetch()} className="btn-secondary text-[11px] py-1.5 px-3">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
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
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-base-400">
              Synced {dataUpdatedAt ? fmtDate(new Date(dataUpdatedAt).toISOString(), { time: true }) : "—"}
            </span>
            <button
              type="button"
              onClick={() => void refetch()}
              title="Refresh"
              aria-label="Refresh payments"
              className="p-1 rounded hover:text-base-900 hover:bg-base-100 transition-colors"
            >
              <RefreshCw size={14} strokeWidth={2} />
            </button>
          </div>
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
              <button type="button" onClick={resetFilters} className="hover:text-base-900 transition-colors">
                Reset filters
              </button>
            )}
          </>
        }
        facet={
          <>
            {/* Summary — the three heroes, 18px mono (§A0 money hero). */}
            <div className="bg-white border border-base-200 rounded-[12px] p-3">
              <div className="px-1 pb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-base-500">
                Summary
              </div>
              {[
                {
                  label: "Balance owing",
                  value: totals.balance,
                  cls: totals.balance > 0 ? "text-base-900" : "text-base-500",
                },
                {
                  label: "Storage fees",
                  value: totals.storage,
                  cls: totals.storage > 0 ? "text-warning" : "text-base-500",
                },
                {
                  label: "Total to collect",
                  value: totals.owing,
                  cls: totals.owing > 0 ? "text-danger" : "text-base-500",
                },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between px-1 py-1.5">
                  <span className="text-[13px] text-base-700">{s.label}</span>
                  <span className={`text-[18px] font-bold font-mono tabular-nums ${s.cls}`}>{rm(s.value)}</span>
                </div>
              ))}
            </div>

            <div className="bg-white border border-base-200 rounded-[12px] p-1.5">
              <FacetGroup
                title="QUEUES"
                collapsed={collapsed.has("QUEUES")}
                onToggle={() => toggleGroup("QUEUES")}
              >
                {QUEUES.map((q) => (
                  <FacetRow
                    key={q.key}
                    label={q.label}
                    dotClass={q.dot}
                    count={queueCounts.get(q.key) ?? 0}
                    active={queueFilter.has(q.key)}
                    title={q.desc}
                    onClick={() => setQueueFilter((prev) => toggleInSet(prev, q.key))}
                  />
                ))}
              </FacetGroup>

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
                    active={payFilter.has(e.key)}
                    onClick={() => setPayFilter((prev) => toggleInSet(prev, e.key))}
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
                    active={regionFilter.has(e.region)}
                    onClick={() => setRegionFilter((prev) => toggleInSet(prev, e.region))}
                  />
                ))}
              </FacetGroup>
            </div>
          </>
        }
      >
        {/* Listing — loose full-width white table, 52px rows, no truncation. */}
        <div className="flex-1 min-h-0 bg-white border border-base-200 rounded-t-lg rounded-b-none shadow-[0_1px_2px_rgba(34,31,32,0.04),0_4px_16px_rgba(34,31,32,0.05)] overflow-auto">
          <table className="w-full border-collapse text-[13px] table-fixed">
            <colgroup>
              <col style={{ width: "16%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "27%" }} />
              <col style={{ width: "22%" }} />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="bg-base-50 border-b border-base-200">
                <Th>Order · Status</Th>
                <Th>Customer</Th>
                <Th>Owing</Th>
                <Th>Stock &amp; delivery</Th>
                <Th>Manage</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-[12px] text-base-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-[12px] text-base-500">
                    {anyFilter
                      ? "No orders match these filters."
                      : view === "owing"
                        ? "Nothing outstanding. 🎉"
                        : "No orders."}
                  </td>
                </tr>
              )}
              {visible.map((r) => (
                <PaymentRow key={r.id} r={r} onSave={save} onChase={() => setChaseFor(r)} />
              ))}
            </tbody>
          </table>
        </div>
      </ListPageShell>

      {chaseFor && <ChasePopover r={chaseFor} onClose={() => setChaseFor(null)} onSave={save} />}
    </>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────
function PaymentRow({
  r,
  onSave,
  onChase,
}: {
  r: Row;
  onSave: (id: string, patch: UpdateOpsOrderControlInput) => void;
  onChase: () => void;
}) {
  return (
    <tr className="border-t border-base-100 hover:bg-base-50 align-top">
      {/* Order · Status */}
      <td className="px-5 py-3">
        <div className="flex items-baseline gap-2" title={r.ref.length > 0 ? r.ref.join(" + ") : undefined}>
          <span className="font-mono font-semibold text-base-900 text-[13px]">SO-{r.so}</span>
          {r.ref.length > 0 && (
            <span className="font-mono text-[11px] text-base-400">
              {r.ref.length === 1 ? r.ref[0] : `${r.ref[0]} +${r.ref.length - 1}`}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className={`pill ${statusPill(r.paymentStatus)}`}>{r.paymentStatus ?? "— set —"}</span>
          <StatusSelect r={r} onSave={onSave} />
        </div>
      </td>

      {/* Customer + phone (no truncation) */}
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          <span className={`${cjkClassName(r.customer)} font-semibold text-base-900 text-[13.5px]`}>
            {r.customer || "—"}
          </span>
          {r.delivered && <span className="text-[10px] text-success">delivered</span>}
        </div>
        {r.phone ? (
          <a
            href={waLink(r.phone) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] text-info hover:underline font-mono"
            title="Open WhatsApp to the customer"
          >
            <Phone size={12} strokeWidth={2} aria-hidden="true" />
            {r.phone}
          </a>
        ) : (
          <span className="mt-1.5 block text-[11px] text-base-400">no phone</span>
        )}
      </td>

      {/* Owing hero + editable balance / storage */}
      <td className="px-5 py-3">
        <div
          className={`text-[19px] font-bold font-mono tabular-nums leading-none ${
            r.owing > 0 ? (r.storageOwing > 0 && r.goodsOwing === 0 ? "text-warning" : "text-danger") : "text-base-400"
          }`}
        >
          {rm(r.owing)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-base-500">
          <span className="inline-flex items-center gap-1">
            bal
            <EditableNumber value={r.balance} placeholder="0" onSave={(v) => onSave(r.id, { balance: v })} width={60} />
          </span>
          <span className="inline-flex items-center gap-1">
            storage
            <EditableNumber
              value={r.storageOverride}
              placeholder={r.storage.total > 0 ? r.storage.total.toFixed(0) : "0"}
              onSave={(v) => onSave(r.id, { storage_fee_override: v })}
              width={52}
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
          </span>
        </div>
      </td>

      {/* Stock & delivery */}
      <td className="px-5 py-3">
        <StockCell r={r} />
      </td>

      {/* Manage */}
      <td className="px-5 py-3">
        {r.owing > 0 ? (
          <button
            type="button"
            onClick={onChase}
            className="pill pill-collected inline-flex items-center gap-1.5 hover:brightness-95"
            title={r.held ? "Delivery held until paid — chase the customer" : "Outstanding balance — chase the customer"}
          >
            {r.held && <Lock size={11} strokeWidth={2.5} aria-hidden="true" />}
            Collect $
          </button>
        ) : (
          <span className="pill pill-neutral">Done</span>
        )}
      </td>
    </tr>
  );
}

/** Stock badge + delivery window (the "safe to chase / what to tell them" cell). */
function StockCell({ r }: { r: Row }) {
  const s = r.stock;
  const badge =
    s.state === "ready"
      ? { cls: "text-success", dot: "bg-success", text: "Stock in ✓" }
      : s.state === "waiting"
        ? { cls: "text-warning", dot: "bg-warning", text: `Waiting · ETA ${fmtDate(s.etaIso)}` }
        : s.state === "no_eta"
          ? { cls: "text-warning", dot: "bg-warning", text: "Waiting · no ETA" }
          : s.state === "late"
            ? { cls: "text-danger", dot: "bg-danger", text: `Stock late · ETA ${fmtDate(s.etaIso)}` }
            : { cls: "text-base-400", dot: "bg-base-300", text: "Stock — not tracked" };

  const windowNote =
    s.state === "late"
      ? "供应商迟 — 先催货,别催客户钱"
      : s.state === "waiting" || s.state === "no_eta"
        ? "货未到 — 报窗口给客户,别承诺死日期"
        : r.etaTbd
          ? "Delivery TBD"
          : r.eta
            ? `Deliver ~ ${fmtDate(r.eta)} · 物流送货前 1-3 天联系`
            : "No delivery date set";

  return (
    <div>
      <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${badge.cls}`}>
        <span className={`w-2 h-2 rounded-full ${badge.dot}`} aria-hidden="true" />
        {badge.text}
      </span>
      <div className="mt-1.5 text-[11.5px] text-base-500 leading-snug">{windowNote}</div>
    </div>
  );
}

/** Payment status dropdown — compact, sits next to the display pill. */
function StatusSelect({
  r,
  onSave,
}: {
  r: Row;
  onSave: (id: string, patch: UpdateOpsOrderControlInput) => void;
}) {
  return (
    <select
      value={r.paymentStatus ?? ""}
      onChange={(e) => onSave(r.id, { payment_status: e.target.value || null })}
      className="text-[11px] px-1.5 py-1 border border-base-200 rounded bg-white text-base-600"
      aria-label={`Payment status for SO-${r.so}`}
    >
      <option value="">— set —</option>
      {PAYMENT_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

// ─── Chase popover (WhatsApp + pre-call brief) ───────────────────────────────
function ChasePopover({
  r,
  onClose,
  onSave,
}: {
  r: Row;
  onClose: () => void;
  onSave: (id: string, patch: UpdateOpsOrderControlInput) => void;
}) {
  // Default tone: goods delivered/held or supplier late → firmer Chase; else a
  // gentle Reminder.
  const [tone, setTone] = useState<"reminder" | "chase">(r.delivered || r.held ? "chase" : "reminder");
  const salutation = salutationOf(null, r.customer);
  const outstanding = rmAmount(r.owing);
  const input = { salutation, ref: r.ref[0] ?? null, outstanding, lines: r.lines };
  const text = tone === "reminder" ? buildCustomerReminder(input) : buildCustomerChase(input);
  const wa = waLink(r.phone);

  const send = () => {
    if (wa) {
      window.open(`${wa}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      toast.success("Opening WhatsApp — hit send");
    } else {
      void navigator.clipboard?.writeText(text);
      toast.success("No number on file — message copied, paste into WhatsApp");
    }
    onSave(r.id, { last_chased_at: new Date().toISOString() });
  };
  const copy = () => {
    void navigator.clipboard?.writeText(text);
    toast.success("Message copied");
  };

  // Pre-call brief (the operator's verbal script — NOT the WhatsApp text).
  const stockLine =
    r.stock.state === "ready"
      ? "已到仓 ✓ 可安排送"
      : r.stock.state === "late"
        ? `供应商迟(ETA ${fmtDate(r.stock.etaIso)} 已过)— 先催货`
        : r.stock.state === "waiting" || r.stock.state === "no_eta"
          ? `未到 · ETA ${fmtDate(r.stock.etaIso)}`
          : "未追踪";
  const windowLine = r.etaTbd ? "待定" : r.eta ? `${fmtDate(r.eta)} 前后(报范围,别报死日期)` : "未定";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[480px] bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-base-100">
          <MessageCircle size={16} className="text-success" strokeWidth={2.5} />
          <span className="text-[13px] font-bold text-base-900">
            催收 · {r.customer} · {r.phone ?? "no phone"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex bg-base-100 rounded-full p-0.5">
              {(["reminder", "chase"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  className={`text-[11px] px-2.5 py-1 rounded-full font-semibold capitalize transition-colors ${
                    tone === t ? "bg-white text-base-900 shadow-sm" : "text-base-500"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="text-base-400 hover:text-base-700">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Pre-call brief */}
        <div className="mx-4 mt-3 rounded-xl border border-info/30 bg-info/5 px-3 py-2.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-info mb-1.5">
            📞 打电话前看这个 — 客户一定问「几时送」
          </div>
          <BriefRow k="货" v={stockLine} />
          <BriefRow k="交货窗口" v={windowLine} />
          <BriefRow k="物流" v="送货前 1-3 天直接联系客户约 slot" />
        </div>

        {/* WhatsApp text (date-free, per locked template) */}
        <div className="mx-4 my-3">
          <div className="text-[10px] text-base-400 italic mb-1.5">
            ↓ WhatsApp 讯息(照锁定规矩:不写交货日、不施压)
          </div>
          <pre className="whitespace-pre-wrap font-sans text-[12.5px] text-base-800 bg-success/5 border border-success/20 rounded-xl px-3 py-2.5 leading-relaxed">
            {text}
          </pre>
        </div>

        <div className="flex gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={send}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-success text-white rounded-lg py-2.5 text-[13px] font-bold hover:brightness-95"
          >
            <MessageCircle size={15} strokeWidth={2.5} /> Send on WhatsApp
          </button>
          <button
            type="button"
            onClick={copy}
            className="rounded-lg border border-base-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-base-700 hover:bg-base-50"
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}

function BriefRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 py-0.5 text-[12.5px] text-base-800">
      <span className="w-[64px] shrink-0 text-base-500 font-semibold">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );
}

/** Inline number cell — seeds from the server value, resyncs when it changes,
 *  saves on blur/Enter only when the value actually changed. Empty → null. */
function EditableNumber({
  value,
  placeholder,
  onSave,
  width,
}: {
  value: number | null;
  placeholder?: string;
  onSave: (v: number | null) => void;
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
    <span className="inline-flex items-center gap-1 rounded border border-base-200 px-1.5 py-0.5 bg-white focus-within:border-base-700">
      <span className="text-[10px] text-base-400">RM</span>
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
        style={{ width: width ?? 72 }}
      />
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-base-500 text-left">
      {children}
    </th>
  );
}

// ── Facet primitives (token-only replicas of the Orders facet look) ──────────
function FacetRow({
  label,
  count,
  active,
  onClick,
  title,
  dotClass,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  title?: string;
  dotClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`w-full flex items-center gap-2 rounded-full text-left px-2.5 py-1.5 transition-colors ${
        active ? "bg-signature-50" : "hover:bg-base-100"
      }`}
    >
      {dotClass && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} aria-hidden="true" />}
      <span className={`flex-1 min-w-0 truncate text-[13px] ${active ? "text-base-900 font-bold" : "text-base-700"}`}>
        {label}
      </span>
      <span className={`text-[13px] tabular-nums shrink-0 ${active ? "text-base-900 font-bold" : "text-base-500"}`}>
        {count}
      </span>
    </button>
  );
}

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
          <span className="tabular-nums shrink-0 text-[11px] font-semibold text-base-500">{total}</span>
        )}
      </button>
      {!collapsed && <div className="flex flex-col gap-0.5 mt-0.5">{children}</div>}
    </div>
  );
}

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
            <span className={`tabular-nums text-[12px] ${on ? "text-white/70" : "text-base-400"}`}>{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}
