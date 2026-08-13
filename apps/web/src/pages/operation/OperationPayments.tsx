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
  Receipt,
} from "lucide-react";
import {
  PAYMENT_KINDS,
  PAYMENT_METHODS,
  collectPillLabel,
  collectionClock,
  computeStorageFee,
  myHolidaySet,
  orderActionLine,
  orderActionQueue,
  orderMoney,
  summarizePayments,
  type OrderPaymentRow,
  type PaymentKind,
  type RecordPaymentInput,
  type UpdateOpsOrderControlInput,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { cjkClassName } from "@/lib/cjk";
import { rm } from "@/lib/format-currency";
import { fmtDate } from "@/lib/fmt-date";
import { orderStatusPill } from "@/lib/status-pill";
import { useOrderPayments, useRecordPayment } from "@/lib/queries";
import { renderReceiptPdf } from "@/lib/pdf/render";
import { useAuth } from "@/lib/auth";
import { areaForAddress, detectState } from "@/lib/region";
import DownloadInvoiceButton from "@/components/DownloadInvoiceButton";
import {
  buildCustomerChase,
  buildCustomerReminder,
  rmAmount,
  salutationOf,
} from "@/lib/wa-templates";
import ListPageShell, { type ActiveChip } from "@/components/ListPageShell";
import {
  MONEY_STATE_ORDER,
  moneyStateOf,
  type MoneyState,
} from "./payments-money-state";

/**
 * OperationPayments — the Master Sheet "Balance" tab, rebuilt 2026-07-19 (Jess)
 * as the LOOSE, stock-aware Collections Desk (§A0 golden reference).
 *
 * The critical business rule baked in: **you call for the customer's money
 * only once you can answer "when's my delivery?"** — so every row carries the
 * STOCK & delivery signal (goods in / waiting ETA / supplier late) beside the
 * money. The money worklist QUEUES are stock-aware: "Collect" = owing AND goods
 * in (safe to call); "Waiting stock" = owing but goods not in yet (hold the
 * call). Calling opens a WhatsApp popover with a pre-call brief (stock + the
 * delivery window + "logistics contacts 1-3 days before") — the operator's
 * verbal script — while the WhatsApp text stays date-free per the locked
 * wa-templates rule.
 *
 * **The word `Chase` left this page on 2026-08-05 (card C12).** COPY-STANDARD
 * bans it outright — it names a mood, not an outcome — and this page had never
 * been scanned once, because C1's guard lived inside the drawer's own test file
 * and guarded only the drawer. Fifteen banned strings were live here.
 *
 * The money queue is now `Collect`, READ from `orderActionQueue("collect")` so
 * this desk and the Orders ladder cannot spell one action two ways; the firm
 * message tone is `Call text`, the drawer's own live word for the same
 * template; and `last_chased_at` — a DB COLUMN, which keeps its name — is read
 * on screen as `Message copied`, the phrase ACTION-FLOW Law 8 permits and the
 * drawer's Calls panel has printed for that same column since C1.
 *
 * Loose layout: full-width white table, 52px rows, generous padding, no
 * truncation of the customer, two-line cells. Facets are multi-select Sets with
 * ✕-able chips. Dates via fmtDate() → "Sun, 19 Jul 26" everywhere.
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
  last_chased_at: string | null;
  /** CARD 4 — the customer's confirmed delivery day, the collection clock's
   *  preferred anchor. */
  confirmed_date: string | null;
}
interface RawLedgerEntry {
  amount: number | string;
  kind: PaymentKind;
  /** 0347 — a voided row is not money. Optional so a browser on this build
   *  against an older Worker degrades to the previous behaviour rather than
   *  crashing; the ledger holds zero rows, so there is nothing to degrade. */
  voided_at?: string | null;
}
interface RawLine {
  sku: string;
  qty: number;
  /** C5 — the priced value of the line; absent on AutoCount imports. */
  unit_price?: number | string | null;
}
interface RawAddon {
  qty: number;
  unit_price?: number | string | null;
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
  /** C5 — `orders.paid` + the add-on sum: the goods money the desk collects.
   *  Optional so a browser on this build against a pre-C5 Worker degrades to
   *  "value unknown" rather than crashing. */
  paid?: number | string | null;
  order_addons?: RawAddon[] | null;
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

// C11 — this file's own `rm` body is DELETED (2026-08-05). It was the FOURTH
// copy of the same six lines, and a fourth copy is how the fifth one came to
// round: the collections desk spelt money correctly here and then handed the
// finished string to a label that adds `RM` itself. One home now —
// `packages/shared/src/money-format.ts`, re-exported by `lib/format-currency`
// and imported at the head of this file.

/** Render + open a receipt PDF for one ledger entry (client-side, self-contained
 *  — needs only the ledger row + customer/SO, no order-total derivation). Mirrors
 *  OrderControlPanel.printReceipt. */
async function printReceipt(row: OrderPaymentRow, orderCode: string, customerName: string) {
  try {
    const blob = await renderReceiptPdf({
      receipt_no: row.receipt_no ?? row.id.slice(0, 8),
      issue_date: row.paid_on,
      order_code: orderCode,
      customer: { name: customerName },
      amount: Number(row.amount),
      method: row.method,
      kind: row.kind,
      reference: row.reference,
      note: row.note,
      currency: "MYR",
    });
    window.open(URL.createObjectURL(blob), "_blank");
  } catch (e) {
    toast.error(`Couldn't open receipt — ${(e as Error).message}`);
  }
}

/**
 * "Message copied today / 3d ago" — collections must show when a debtor was
 * last contacted, so nobody is called twice in one morning or left to go cold.
 *
 * **It says what the portal WATCHED — a message leaving on the clipboard.**
 * ACTION-FLOW Law 8: opening an external application does not prove the
 * external outcome occurred. It is the drawer's own wording for this same
 * `last_chased_at` column, live since C1: one column, one sentence, wherever
 * it is printed.
 */
function messageCopiedAgo(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Message copied today";
  if (days === 1) return "Message copied 1d ago";
  return `Message copied ${days}d ago`;
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

/* The money state is DERIVED, never keyed — `./payments-money-state`, which
   carries the ruling and the measurement that retired the hand-typed
   `payment_status` from this desk (CARD 4 closing slice, 0347). */
const PAY_ORDER = MONEY_STATE_ORDER;

// Payment-status → pill colour folds into the ONE shared orderStatusPill
// (lib/status-pill.ts) — no separate map (Jess 2026-07-20).

/** Multi-select toggle helper (Jess 2026-07-19 — facets are Sets). */
function toggleInSet<T>(prev: Set<T>, v: T): Set<T> {
  const next = new Set(prev);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

// ── Queues (money worklist, stock-aware) ─────────────────────────────────────
//
// C12: the first tile READS its word from `orderActionQueue("collect")` rather
// than spelling one. It is the same action the Orders ladder displays, and
// COPY-STANDARD rule 8 is "same word app-wide" — a second spelling here would
// be a queue and a row naming one act two ways, which is the whole failure the
// shared module exists to make impossible. The other three name STOCK STATES,
// not actions, so they have no entry in it and keep their own words.
const QUEUES = [
  {
    key: "ready",
    label: orderActionQueue("collect"),
    dot: "bg-success",
    desc: "Owing + goods in — safe to call (you can answer the delivery question)",
  },
  {
    key: "waiting",
    label: "Waiting stock",
    dot: "bg-warning",
    desc: "Owing but goods not in yet — call the supplier before the customer",
  },
  {
    key: "late",
    label: "Stock late",
    dot: "bg-danger",
    desc: "Owing + supplier missed the ETA — call the supplier, not the customer",
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
  /** delivery held: goods in, not delivered, money owing → the 🔒 on the money pill. */
  held: boolean;
  /** The DERIVED money state (`moneyStateOf`) — never a keyed column. */
  moneyState: MoneyState;
  /** CARD 4 — the collection clock: the final deadline (1 working day before
   *  the delivery) and where today stands against it. */
  collectDueIso: string | null;
  collectAttention: "none" | "t3" | "t2" | "t1" | "late";
  lastChasedAt: string | null;
}

/** The "owing / storage" view predicate — anything still to collect, and that
 *  is the ONE arithmetic's answer. It used to also admit any row whose keyed
 *  `payment_status` was not the word `Paid`, which put 87 never-keyed orders
 *  into a collections view on the strength of a blank column. */
function isOwingRow(r: Row): boolean {
  return r.owing > 0;
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
  const [collectFor, setCollectFor] = useState<Row | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
        voided_at: p.voided_at ?? null,
      }));
      const sum = summarizePayments(ledger, balance ?? 0);
      const storageCollected = ctrl?.storage_collected_at != null;
      // C5 (2026-07-27): GOODS money is the shared `orderMoney` — the priced
      // lines against `orders.paid`, falling back to the hand-keyed balance for
      // imported rows. The desk used to net `balance` against the
      // `order_payments` ledger; that ledger holds 0 rows and `balance` is NULL
      // on all 55 live control rows, so every row computed RM 0 owing and this
      // whole collections queue was empty while 18 orders owed RM 56,859.
      // The ledger is still read for STORAGE collections below — storage has
      // its own clock and its own flag, and `orders.paid` is goods money.
      const price = (x: { qty: number; unit_price?: number | string | null }) =>
        Number(x.unit_price ?? 0) * Number(x.qty ?? 0);
      const money = orderMoney({
        lineSum: lines.reduce((s, l) => s + price(l), 0),
        addonSum: (r.order_addons ?? []).reduce((s, a) => s + price(a), 0),
        paid: r.paid,
        controlBalance: ctrl?.balance ?? null,
      });
      const goodsPaid = money.paid;
      const goodsOwing = money.goodsOwing;
      const storageOwing = storageCollected ? 0 : Math.max(0, effectiveStorage - sum.storageCollected);
      const dueDate = ctrl?.balance_due_date ?? null;
      const overdue = !!dueDate && dueDate < today && goodsOwing > 0;
      // CARD 4 — the collection clock (T−3 · T−2 · T−1 final deadline on the
      // delivery working week + Malaysian holidays). Anchored on the CUSTOMER's
      // confirmed day, else the promised date; TBD stays silent. The T−1 exists
      // because logistics ask for the DO the evening before, and the DO door
      // refuses while money holds.
      const clock = collectionClock(
        {
          confirmedDateIso: ctrl?.confirmed_date ?? null,
          promisedDateIso: r.delivery_date_tbd ? null : r.delivery_date,
        },
        today,
        { holidays: myHolidaySet() },
      );
      const stock = stockOf(ctrl);
      const delivered = r.status === "delivered";
      const owing = goodsOwing + storageOwing;
      const moneyState = moneyStateOf({
        known: money.known,
        owing,
        paid: goodsPaid + sum.storageCollected,
        attention: clock.attention,
      });
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
        moneyState,
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
        collectDueIso: clock.dueIso,
        collectAttention: clock.attention,
        lastChasedAt: ctrl?.last_chased_at ?? null,
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
    if (payFilter.size > 0) r = r.filter((x) => payFilter.has(x.moneyState));
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
    for (const r of baseRows) m.set(r.moneyState, (m.get(r.moneyState) ?? 0) + 1);
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
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-body">
          <div className="text-destructive font-semibold mb-2">Couldn&rsquo;t load payments</div>
          <div className="text-meta text-base-700 mb-3">
            {(error as Error | undefined)?.message ?? "Unknown error"}
          </div>
          <button type="button" onClick={() => void refetch()} className="btn-secondary text-label py-1.5 px-3">
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
            <span className="text-meta text-base-400">
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
              { key: "owing", label: "To collect", count: owingCount },
              { key: "all", label: "All orders", count: rows.length },
            ]}
            active={view}
            onSelect={setView}
          />
        }
        toolbarRight={
          <span className="text-meta text-base-500 tabular-nums" title="Rows shown / in this view">
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
              <div className="px-1 pb-2 text-label font-semibold uppercase tracking-[0.04em] text-base-500">
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
                  <span className="text-body text-base-700">{s.label}</span>
                  <span className={`text-strong font-semibold font-mono tabular-nums ${s.cls}`}>{rm(s.value)}</span>
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
                title="MONEY"
                total={baseRows.length}
                collapsed={collapsed.has("MONEY")}
                onToggle={() => toggleGroup("MONEY")}
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
          <table className="w-full border-collapse text-body table-fixed">
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
                  <td colSpan={5} className="p-12 text-center text-meta text-base-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-meta text-base-500">
                    {anyFilter
                      ? "No orders match these filters."
                      : view === "owing"
                        ? "Nothing outstanding. 🎉"
                        : "No orders."}
                  </td>
                </tr>
              )}
              {visible.map((r) => (
                <PaymentRow
                  key={r.id}
                  r={r}
                  onSave={save}
                  onCollect={() => setCollectFor(r)}
                  expanded={expanded.has(r.id)}
                  onToggle={() => setExpanded((prev) => toggleInSet(prev, r.id))}
                />
              ))}
            </tbody>
          </table>
        </div>
      </ListPageShell>

      {collectFor && (
        <CollectPopover r={collectFor} onClose={() => setCollectFor(null)} onSave={save} />
      )}
    </>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────
function PaymentRow({
  r,
  onSave,
  onCollect,
  expanded,
  onToggle,
}: {
  r: Row;
  onSave: (id: string, patch: UpdateOpsOrderControlInput) => void;
  onCollect: () => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
    <tr className={`border-t border-base-100 hover:bg-base-50 align-top ${expanded ? "bg-base-50" : ""}`}>
      {/* Order · Status */}
      <td className="px-5 py-3">
        <div className="flex items-baseline gap-2" title={r.ref.length > 0 ? r.ref.join(" + ") : undefined}>
          <span className="font-mono font-semibold text-base-900 text-body">SO-{r.so}</span>
          {r.ref.length > 0 && (
            <span className="font-mono text-label text-base-400">
              {r.ref.length === 1 ? r.ref[0] : `${r.ref[0]} +${r.ref.length - 1}`}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {/* DERIVED (0347) — the one arithmetic + CARD 4's clock decide this
              word. There is no dropdown any more: a money state nobody can
              type is a money state that cannot contradict the figure. */}
          <span className={`pill ${orderStatusPill(r.moneyState)}`}>{r.moneyState}</span>
        </div>
      </td>

      {/* Customer + phone (no truncation) */}
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          <span className={`${cjkClassName(r.customer)} font-semibold text-base-900 text-body`}>
            {r.customer || "—"}
          </span>
          {r.delivered && <span className="text-label text-success">delivered</span>}
        </div>
        {r.phone ? (
          <a
            href={waLink(r.phone) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1.5 text-label text-info hover:underline font-mono"
            title="Open WhatsApp to the customer"
          >
            <Phone size={12} strokeWidth={2} aria-hidden="true" />
            {r.phone}
          </a>
        ) : (
          <span className="mt-1.5 block text-label text-base-400">no phone</span>
        )}
      </td>

      {/* Owing hero + editable balance / storage */}
      <td className="px-5 py-3">
        <div
          className={`text-title font-semibold font-mono tabular-nums leading-none ${
            r.owing > 0 ? (r.storageOwing > 0 && r.goodsOwing === 0 ? "text-warning" : "text-danger") : "text-base-400"
          }`}
        >
          {rm(r.owing)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-base-500">
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
              <span className="text-label text-warning" title={`manual — auto ${rm(r.storage.total)}`}>
                M
              </span>
            )}
            {r.storageCollected && (
              <span className="text-label text-success" title="storage collected">
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
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            {r.owing > 0 ? (
              <>
                <button
                  type="button"
                  onClick={onCollect}
                  className="pill pill-collected inline-flex items-center gap-1.5 hover:brightness-95"
                  title={
                    r.held
                      ? orderActionLine("collect", {
                          amount: r.owing,
                          customer: r.customer,
                        }) + " — delivery is held until it is paid"
                      : orderActionLine("collect", {
                          amount: r.owing,
                          customer: r.customer,
                        })
                  }
                >
                  {r.held && <Lock size={11} strokeWidth={2.5} aria-hidden="true" />}
                  {/* C11 — the RAW number. Passing `rm(r.owing)` here is what put
                      `Collect RM RM 11,246.00` on every row of this desk: the
                      words module owns the `RM`, and it now owns the digits too,
                      so there is nothing left for a caller to double up. */}
                  {collectPillLabel(r.owing)}
                </button>
                <div
                  className="mt-1.5 text-label text-base-400"
                  title={r.lastChasedAt ? `Last message copied ${fmtDate(r.lastChasedAt, { time: true })}` : undefined}
                >
                  {messageCopiedAgo(r.lastChasedAt) ?? "No message copied yet"}
                  {r.dueDate && (
                    <span className={r.overdue ? "text-danger font-semibold" : "text-base-500"}>
                      {" · "}
                      {r.overdue ? "overdue" : "promised"} {fmtDate(r.dueDate)}
                    </span>
                  )}
                  {/* CARD 4 — the balance deadline: 1 working day before the
                      delivery, because logistics ask for the DO the evening
                      before and the DO door refuses while money holds. */}
                  {r.collectDueIso && (
                    <span
                      className={
                        r.collectAttention === "late"
                          ? "text-danger font-semibold"
                          : r.collectAttention === "t1"
                            ? "text-danger"
                            : r.collectAttention === "t2" || r.collectAttention === "t3"
                              ? "text-warning"
                              : "text-base-500"
                      }
                    >
                      {" · "}balance due {fmtDate(r.collectDueIso)}
                      {r.collectAttention === "late" ? " — passed" : ""}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <span className="pill pill-neutral">Done</span>
            )}
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse" : "Record payment / history"}
            title={expanded ? "Collapse" : "Record payment · history · promise-to-pay"}
            className="shrink-0 p-1 rounded text-base-400 hover:text-base-900 hover:bg-base-100"
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>
      </td>
    </tr>
    {expanded && (
      <tr className="bg-base-50/60">
        <td colSpan={5} className="px-5 pb-4 pt-0 border-t border-base-100">
          <OrderMoneyDetail r={r} onSave={onSave} />
        </td>
      </tr>
    )}
    </>
  );
}

/** Row-expand detail: record a payment (closes the money loop → mints a receipt
 *  no) · the payment history · promise-to-pay (reuses balance_due_date, no
 *  migration). Mounted only when a row is expanded, so the hooks below run in a
 *  stable order per orderId. */
function OrderMoneyDetail({
  r,
  onSave,
}: {
  r: Row;
  onSave: (id: string, patch: UpdateOpsOrderControlInput) => void;
}) {
  const { data: ledgerData, isLoading } = useOrderPayments(r.id);
  const ledger: OrderPaymentRow[] = ledgerData?.payments ?? [];
  const role = useAuth((s) => s.role);

  const record = useRecordPayment(r.id, {
    onSuccess: (res) => {
      const no = res.payment.receipt_no;
      toast.success(no ? `Payment recorded · receipt ${no}` : "Payment recorded");
    },
    onError: (e) => toast.error(`Record failed — ${(e as Error).message}`),
  });

  const [amount, setAmount] = useState(r.owing > 0 ? String(r.owing.toFixed(2)) : "");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>("cash");
  const [kind, setKind] = useState<PaymentKind>("payment");
  const [reference, setReference] = useState("");

  const submit = () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter an amount greater than 0");
      return;
    }
    const input: RecordPaymentInput = {
      amount: amt,
      paidOn,
      method,
      kind,
      reference: reference.trim() || null,
      note: null,
    };
    record.mutate(input, {
      onSuccess: () => {
        setAmount("");
        setReference("");
      },
    });
  };

  const inputCls =
    "text-meta px-2 py-1.5 border border-base-200 rounded bg-white outline-none focus:border-base-700";

  return (
    <div className="grid grid-cols-[1.1fr_1fr_0.9fr] gap-6 pt-3">
      {/* Record payment — closes the loop, mints a receipt no */}
      <div>
        <h4 className="text-label font-semibold uppercase tracking-[0.04em] text-base-500 mb-2">
          Record payment
        </h4>
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-label text-base-400 uppercase tracking-wide">
            Amount
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className={`${inputCls} w-[110px] tabular-nums`}
              aria-label="Payment amount"
            />
          </label>
          <label className="flex flex-col gap-1 text-label text-base-400 uppercase tracking-wide">
            Paid on
            <input
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              className={`${inputCls} w-[140px]`}
              aria-label="Paid on"
            />
          </label>
          <label className="flex flex-col gap-1 text-label text-base-400 uppercase tracking-wide">
            Method
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as (typeof PAYMENT_METHODS)[number])}
              className={`${inputCls} capitalize`}
              aria-label="Payment method"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-label text-base-400 uppercase tracking-wide">
            For
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as PaymentKind)}
              className={`${inputCls} capitalize`}
              aria-label="Payment kind"
            >
              {PAYMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-label text-base-400 uppercase tracking-wide">
            Reference
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="txn / slip no"
              className={`${inputCls} w-[130px]`}
              aria-label="Payment reference"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={submit}
              disabled={record.isPending}
              className="pill pill-collected inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Receipt size={12} strokeWidth={2.5} aria-hidden="true" />
              {record.isPending ? "Recording…" : "Record + receipt"}
            </button>
          </div>
        </div>
        <div className="mt-2 text-label text-base-400">
          A receipt number is minted automatically (R{r.so}-n) — print it from the history at right.
        </div>
        {role && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-label font-semibold uppercase tracking-[0.04em] text-base-500">Documents</span>
            <DownloadInvoiceButton
              orderId={r.id}
              so={r.so}
              role={role as "operation" | "principal"}
              variant="secondary"
              className="text-label py-1 px-2.5"
            />
          </div>
        )}
      </div>

      {/* Payment history */}
      <div>
        <h4 className="text-label font-semibold uppercase tracking-[0.04em] text-base-500 mb-2">
          Payment history
        </h4>
        {isLoading ? (
          <div className="text-meta text-base-400">Loading…</div>
        ) : ledger.length === 0 ? (
          <div className="text-meta text-base-400">No payments recorded yet.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {ledger.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 text-meta border-b border-base-100 pb-1"
              >
                <span className="text-base-600 min-w-0 truncate">
                  <span className="capitalize font-medium text-base-800">{p.kind}</span> ·{" "}
                  {fmtDate(p.paid_on)} · <span className="capitalize">{p.method}</span>
                  {p.receipt_no && <span className="ml-1 text-base-400 font-mono">{p.receipt_no}</span>}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-mono tabular-nums font-semibold text-success">
                    + {rm(Number(p.amount) || 0)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void printReceipt(p, `SO-${r.so}`, r.customer)}
                    title="Open receipt PDF"
                    aria-label="Open receipt PDF"
                    className="p-1 rounded text-base-400 hover:text-base-900 hover:bg-base-100"
                  >
                    <Receipt size={13} strokeWidth={2} aria-hidden="true" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Promise-to-pay (reuses balance_due_date) */}
      <div>
        <h4 className="text-label font-semibold uppercase tracking-[0.04em] text-base-500 mb-2">
          Promise to pay
        </h4>
        <label className="flex flex-col gap-1 text-label text-base-400 uppercase tracking-wide">
          Committed date
          <input
            type="date"
            defaultValue={r.dueDate ?? ""}
            onChange={(e) => onSave(r.id, { balance_due_date: e.target.value || null })}
            className={`${inputCls} w-[150px]`}
            aria-label="Promise-to-pay date"
          />
        </label>
        <div className="mt-2 text-label text-base-400 leading-snug">
          {r.dueDate
            ? r.overdue
              ? `Overdue since ${fmtDate(r.dueDate)} — call now.`
              : `Snoozed until ${fmtDate(r.dueDate)}.`
            : "Set the date the customer promised to pay — it sinks off the Collect queue until then."}
        </div>
      </div>
    </div>
  );
}

/** Stock badge + delivery window (the "safe to call / what to tell them" cell). */
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
      ? "Supplier late — call the supplier first, not the customer"
      : s.state === "waiting" || s.state === "no_eta"
        ? "Goods not in — quote a window, don't promise a fixed date"
        : r.etaTbd
          ? "Delivery TBD"
          : r.eta
            ? `Deliver ~ ${fmtDate(r.eta)} · logistics calls 1–3 days before`
            : "No delivery date set";

  return (
    <div>
      <span className={`inline-flex items-center gap-1.5 text-body font-semibold ${badge.cls}`}>
        <span className={`w-2 h-2 rounded-full ${badge.dot}`} aria-hidden="true" />
        {badge.text}
      </span>
      <div className="mt-1.5 text-label text-base-500 leading-snug">{windowNote}</div>
    </div>
  );
}

/* The payment-status dropdown was RETIRED here (0347). The money state is
   derived by `moneyStateOf` from the one arithmetic and CARD 4's collection
   clock; `ops_order_control.payment_status` keeps its column and its one live
   row, and loses its authority over this desk. */

/**
 * The two message tones, as the operator reads them.
 *
 * **The KEY stays `chase` and the LABEL does not**, and the split is the point:
 * `"chase"` is the `wa-templates` contract shared with the drawer, and
 * COPY-STANDARD exempts an internal key by name — but this toggle used to
 * RENDER that key under a `capitalize` class, so the banned word reached the
 * screen as `Chase` through a door no source scan can see. A lone lowercase
 * token is exactly what every banned-word scanner in this repo skips as
 * internal. Fixed here by giving the button a real label; reported as a finding,
 * because the scanner still cannot see the next one.
 *
 * The words are the drawer's own, live since C1, for these same two templates:
 * the firm tone is a `Call` (COPY-STANDARD's verb table), never a mood.
 */
const TONE_LABEL: Record<"reminder" | "chase", string> = {
  reminder: "Reminder",
  chase: "Call text",
};

// ─── Collect popover (WhatsApp + pre-call brief) ─────────────────────────────
function CollectPopover({
  r,
  onClose,
  onSave,
}: {
  r: Row;
  onClose: () => void;
  onSave: (id: string, patch: UpdateOpsOrderControlInput) => void;
}) {
  // Default tone: goods delivered/held or supplier late → the firmer Call
  // text; else a gentle Reminder. The two KEYS are the wa-templates contract
  // and are internal; the two LABELS are TONE_LABEL above.
  const [tone, setTone] = useState<"reminder" | "chase">(r.delivered || r.held ? "chase" : "reminder");
  const salutation = salutationOf(null, r.customer);
  const outstanding = rmAmount(r.owing);
  const input = { salutation, ref: r.ref[0] ?? null, outstanding, lines: r.lines };
  const text = tone === "reminder" ? buildCustomerReminder(input) : buildCustomerChase(input);
  const wa = waLink(r.phone);

  const send = () => {
    // C12 · Loo's ruling, 2026-08-05. The clipboard write happens on BOTH
    // branches now, and it is not a convenience — it is what makes the word on
    // screen TRUE. This one stamp feeds `Message copied {date}` here and in the
    // drawer, and until today the WhatsApp branch copied nothing, so that
    // sentence named an act nobody had performed. ACTION-FLOW Law 8 says the
    // portal records only what it observed; the choice was to blur the wording
    // or to make the observation match it, and Loo took the second.
    // (It earns its keep besides: a `wa.me` prefill that is dropped or
    // truncated now leaves the operator the full text on the clipboard.)
    void navigator.clipboard?.writeText(text);
    if (wa) {
      window.open(`${wa}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      toast.success("Opening WhatsApp — hit send");
    } else {
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
      ? "In stock ✓ ready to deliver"
      : r.stock.state === "late"
        ? `Supplier late (ETA ${fmtDate(r.stock.etaIso)} passed) — call the supplier first`
        : r.stock.state === "waiting" || r.stock.state === "no_eta"
          ? `Not in yet · ETA ${fmtDate(r.stock.etaIso)}`
          : "Not tracked";
  const windowLine = r.etaTbd
    ? "TBD"
    : r.eta
      ? `around ${fmtDate(r.eta)} — give a window, not a fixed date`
      : "Not set";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-[480px] bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-base-100">
          <MessageCircle size={16} className="text-success" strokeWidth={2.5} />
          <span className="text-body font-semibold text-base-900">
            {orderActionQueue("collect")} · {r.customer} · {r.phone ?? "no phone"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex bg-base-100 rounded-full p-0.5">
              {(["reminder", "chase"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  className={`text-label px-2.5 py-1 rounded-full font-semibold transition-colors ${
                    tone === t ? "bg-white text-base-900 shadow-sm" : "text-base-500"
                  }`}
                >
                  {TONE_LABEL[t]}
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
          <div className="text-label font-semibold uppercase tracking-[0.04em] text-info mb-1.5">
            Before you call — they'll ask about delivery
          </div>
          <BriefRow k="Stock" v={stockLine} />
          <BriefRow k="Delivery" v={windowLine} />
          <BriefRow k="Logistics" v="Logistics calls the customer 1–3 days before delivery" />
        </div>

        {/* WhatsApp text (date-free, per locked template) */}
        <div className="mx-4 my-3">
          <div className="text-label text-base-400 italic mb-1.5">
            ↓ WhatsApp message (date-free, per the locked rule)
          </div>
          <pre className="whitespace-pre-wrap font-sans text-meta text-base-800 bg-success/5 border border-success/20 rounded-xl px-3 py-2.5 leading-relaxed">
            {text}
          </pre>
        </div>

        <div className="flex gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={send}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-success text-white rounded-lg py-2.5 text-body font-semibold hover:brightness-95"
          >
            <MessageCircle size={15} strokeWidth={2.5} /> Send on WhatsApp
          </button>
          <button
            type="button"
            onClick={copy}
            className="rounded-lg border border-base-200 bg-white px-4 py-2.5 text-body font-semibold text-base-700 hover:bg-base-50"
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
    <div className="flex gap-2 py-0.5 text-meta text-base-800">
      <span className="w-[72px] shrink-0 text-base-500 font-semibold">{k}</span>
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
      <span className="text-label text-base-400">RM</span>
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
        className="text-meta tabular-nums bg-transparent outline-none"
        style={{ width: width ?? 72 }}
      />
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-label font-semibold uppercase tracking-[0.05em] text-base-500 text-left">
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
      <span className={`flex-1 min-w-0 truncate text-body ${active ? "text-base-900 font-semibold" : "text-base-700"}`}>
        {label}
      </span>
      <span className={`text-body tabular-nums shrink-0 ${active ? "text-base-900 font-semibold" : "text-base-500"}`}>
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
        <span className="uppercase flex-1 text-left text-label font-semibold tracking-[0.04em] text-base-900">
          {title}
        </span>
        {total !== undefined && (
          <span className="tabular-nums shrink-0 text-label font-semibold text-base-500">{total}</span>
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
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full transition-colors text-body border ${
              on
                ? "bg-base-900 text-white font-semibold border-base-900"
                : "bg-white text-base-600 font-medium border-base-200"
            }`}
          >
            {t.label}
            <span className={`tabular-nums text-meta ${on ? "text-white/70" : "text-base-400"}`}>{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}
