import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wallet, RefreshCw } from "lucide-react";
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

/**
 * OperationPayments — the Master Sheet "Balance" tab, live (Jess 2026-06-12).
 * One row per active order: balance owing (from AutoCount), the storage fee
 * accruing from the ETA (MS/BF RM150/month + SOF RM200/2 weeks, manually
 * overridable), and the payment-follow-up status. All three persist to the
 * existing ops_order_control overlay via PUT /operation/orders/:id/control.
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
      return "pill-warning";
    case "unpaid":
      return "pill-overdue";
    default:
      return "pill-neutral";
  }
}

interface Row {
  id: string;
  so: number;
  customer: string;
  ref: string[];
  eta: string | null;
  etaTbd: boolean;
  delivered: boolean;
  hasMsbf: boolean;
  hasSof: boolean;
  balance: number | null;
  paymentStatus: string | null;
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

export default function OperationPayments() {
  const qc = useQueryClient();
  const [view, setView] = useState<"owing" | "all">("owing");
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
      return {
        id: r.id,
        so: r.so,
        customer: r.customer_name,
        ref: (r.source_ref ?? []).filter(Boolean),
        eta: r.delivery_date,
        etaTbd: !!r.delivery_date_tbd,
        delivered: r.status === "delivered",
        hasMsbf,
        hasSof,
        balance,
        paymentStatus: ctrl?.payment_status ?? null,
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

  const visible = useMemo(() => {
    const r =
      view === "all"
        ? rows
        : rows.filter(
            (x) =>
              x.owing > 0 ||
              (x.paymentStatus != null && x.paymentStatus.toLowerCase() !== "paid"),
          );
    // Most owing first.
    return [...r].sort((a, b) => b.owing - a.owing);
  }, [rows, view]);

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
      count: visible.length,
    };
  }, [visible]);

  const save = (orderId: string, patch: UpdateOpsOrderControlInput) =>
    saveMut.mutate({ orderId, patch });

  if (isError) {
    return (
      <div className="px-9 py-8">
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
    <div className="px-9 py-8 pb-14">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-1.5 flex-wrap">
        <div className="flex items-center gap-2.5">
          <Wallet size={22} className="text-primary" strokeWidth={2} />
          <h1 className="t-h1 font-display">Payments</h1>
          <span className="text-[16px] font-medium text-base-400 tabular-nums">{totals.count}</span>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          title="Refresh"
          className="p-1.5 rounded text-base-500 hover:text-base-900 hover:bg-base-100 transition-colors"
        >
          <RefreshCw size={15} strokeWidth={2} />
        </button>
      </div>
      <p className="t-small text-base-500 mb-4">
        Outstanding balance + storage fees per order — the Master Sheet&rsquo;s Balance tab. Storage:
        mattress/bed frame {STORAGE_RATES.msbf.label} (24 working days free), sofa{" "}
        {STORAGE_RATES.sof.label} (14 working days free), from the original delivery date (editable).
      </p>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3 mb-5 max-w-[640px]">
        <SummaryCard label="Balance owing" value={rm(totals.balance)} tone="text-base-900" />
        <SummaryCard label="Storage fees" value={rm(totals.storage)} tone="text-warning" />
        <SummaryCard label="Total to collect" value={rm(totals.owing)} tone="text-primary" />
      </div>

      {/* View chips */}
      <div className="flex gap-1 p-1 bg-base-100 rounded mb-3.5 w-fit">
        {(["owing", "all"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`px-3 py-1.5 text-[12px] rounded capitalize ${
              view === v
                ? "bg-white text-base-900 font-semibold shadow-sm"
                : "text-base-600 font-medium hover:text-base-900"
            }`}
          >
            {v === "owing" ? "Owing / storage" : "All orders"}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-base-200 rounded overflow-auto">
        <table className="w-full border-collapse text-[13px]" style={{ minWidth: 920 }}>
          <thead>
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
                  {view === "owing" ? "Nothing outstanding. 🎉" : "No orders."}
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <PaymentRow key={r.id} r={r} onSave={save} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="bg-white border border-base-200 rounded px-4 py-3">
      <div className="t-micro text-base-500 mb-1">{label}</div>
      <div className={`text-[20px] font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function PaymentRow({ r, onSave }: { r: Row; onSave: (id: string, patch: UpdateOpsOrderControlInput) => void }) {
  const storageTitle = [
    r.hasMsbf ? `MS/BF ${rm(r.storage.msbf)}` : null,
    r.hasSof ? `SOF ${rm(r.storage.sof)}` : null,
    r.storage.days > 0 ? `${r.storage.days} days since ETA` : "not past ETA",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <tr className="border-t border-base-100 hover:bg-base-50 align-top">
      <td className="px-4 py-2.5 whitespace-nowrap">
        <div className="font-mono font-semibold text-base-900">SO-{r.so}</div>
        {r.ref.length > 0 && (
          <div className="font-mono text-[10.5px] text-base-500 mt-0.5">{r.ref.join(" + ")}</div>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span className={`${cjkClassName(r.customer)} font-medium text-base-900`}>
          {r.customer || "—"}
        </span>
        {r.delivered && <span className="ml-1.5 text-[10px] text-success">delivered</span>}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-[12px] text-base-700">
        {r.etaTbd ? <span className="pill pill-warning">TBD</span> : r.eta ? fmtDateShort(r.eta) : "—"}
      </td>
      {/* Storage fee — computed, with a manual override input */}
      <td className="px-4 py-2.5 whitespace-nowrap" title={storageTitle}>
        <EditableNumber
          value={r.storageOverride}
          placeholder={r.storage.total > 0 ? r.storage.total.toFixed(0) : "0"}
          onSave={(v) => onSave(r.id, { storage_fee_override: v })}
          prefix="RM"
          width={84}
        />
        {r.storageOverride == null && r.storage.total > 0 && (
          <div className="text-[10px] text-base-400 mt-0.5">auto {rm(r.storage.total)}</div>
        )}
        {r.storageOverride != null && (
          <div className="text-[10px] text-warning mt-0.5">manual (auto {rm(r.storage.total)})</div>
        )}
        {r.storageCollected && (
          <div className="text-[10px] text-success mt-0.5">✓ collected</div>
        )}
      </td>
      {/* Balance — RM owing, editable (from AutoCount import or keyed) */}
      <td className="px-4 py-2.5 whitespace-nowrap">
        <EditableNumber
          value={r.balance}
          placeholder="0"
          onSave={(v) => onSave(r.id, { balance: v })}
          prefix="RM"
          width={96}
        />
        {r.goodsPaid > 0 && (
          <div className="text-[10px] text-success mt-0.5">− {rm(r.goodsPaid)} paid</div>
        )}
        {r.dueDate && (
          <div className={`text-[10px] mt-0.5 ${r.overdue ? "text-destructive font-semibold" : "text-base-400"}`}>
            {r.overdue ? "overdue " : "due "}
            {fmtDateShort(r.dueDate)}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap font-semibold tabular-nums text-base-900">
        {rm(r.owing)}
      </td>
      {/* Payment status — dropdown */}
      <td className="px-4 py-2.5 whitespace-nowrap">
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
    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-base-500 text-left">
      {children}
    </th>
  );
}
