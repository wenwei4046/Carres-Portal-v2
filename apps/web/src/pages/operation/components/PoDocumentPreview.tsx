/**
 * PoDocumentPreview — the PDF-style PO document + WhatsApp message zone shown
 * in the right PREVIEW column of Purchase v2's Send stage master-detail.
 *
 * ASCII locked with Loo 2026-07-23. Three stacked blocks inside one white card:
 *   1. Late banner (only when overdue) + "earliest deadline in this PO"
 *   2. Meta rows (Supplier / Category / Stock to / Owner / Total)
 *   3. PDF-style PO document — Carres letterhead, Ref/Item/Qty/Amt table, Total
 *   4. WhatsApp message zone — editable textarea + [Edit] hint
 *   5. Footer — [Download PDF] ghost + [Send PO to Ohana] flame (ONE per page)
 *
 * Presentational: caller passes a resolved `SplitPlaceGroup` + supplier row +
 * "today" ISO + onSendPo callback. This component owns display only, never the
 * mutate. Send PO opens the shipped CreatePOModal (via the callback).
 *
 * UI-KIT: dates via `fmtDate()` (§A0 date law); flame button = one per page
 * (§A5); status pill = `.pill-*` (§A6); mono for SKU/PO-no/ref/currency;
 * radius 12 outer, 8 inner (§A6 radius ladder).
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Clock,
  Copy,
  Download,
  MoreVertical,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import type { ProductCategory } from "@carres/shared";
import Btn from "@/components/Btn";
import { fmtDate } from "@/lib/fmt-date";
import type { CreatePoPrefill } from "./CreatePOModal";

/** Minimal shape we need from a Send-stage place group. Kept local so the
 *  component can move house without pulling in the whole PurchasePlaceGroup
 *  type — the caller adapts. */
export interface PoPreviewGroup {
  supplierId: string;
  supplierName: string | null;
  categories: readonly ProductCategory[];
  totalUnits: number;
  orderCount: number;
  earliestOrderBy: string | null;
  urgency: "late" | "urgent" | "due" | "scheduled" | "covered" | "no_deadline";
  lines: ReadonlyArray<{
    sku: string;
    /** Human model name (`product_models.name`). May be null if unresolved. */
    modelName: string | null;
    need: number;
    cost: number | null;
    /** Advisory FREE (Klg) stock for this SKU — the "In stock" column. */
    ready: number;
    forOrders: ReadonlyArray<{
      so: number | null;
      customerName: string | null;
      deliveryDate?: string | null;
      /** Customer-facing REF (LEAD token of `orders.source_ref[]`, e.g.
       *  "CR-2025-0812"). Suppliers key off this. Null for native (POS) orders
       *  with no imported ref — the UI falls back to SO-N in that case. */
      ref?: string | null;
    }>;
  }>;
}

interface PoDocumentPreviewProps {
  group: PoPreviewGroup;
  /** ISO today; used to compute the "N days late" banner text. */
  today: string | null;
  /** ISO of the earliest customer deadline across the group's forOrders — the
   *  real pressure the operator communicates to the supplier. */
  earliestCustomerDeadline: string | null;
  /** Prepared-by name — the current operator (right-side header). */
  preparedByName: string | null;
  /** Duty holder for the badge shown next to Send PO. Null = duty layer dormant. */
  dutyHolderName: string | null;
  /** onSendPo opens the shipped CreatePOModal with the prefill. */
  onSendPo: (prefill: CreatePoPrefill) => void;
  /** Prefill builder — the caller owns the domain-specific mapping. */
  buildPrefill: () => CreatePoPrefill;
  /** WhatsApp draft — a default template composed by the caller. Editable in
   *  the textarea; the edited text is used on Send. */
  waTemplate: string;
}

function daysBetweenIso(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Category → short human label for the meta row. */
function catLabel(cats: readonly ProductCategory[]): string {
  if (cats.length === 0) return "—";
  if (cats.length === 1) return cats[0]!;
  return `${cats[0]} +${cats.length - 1}`;
}

export function PoDocumentPreview({
  group,
  today,
  earliestCustomerDeadline,
  preparedByName,
  dutyHolderName,
  onSendPo,
  buildPrefill,
  waTemplate,
}: PoDocumentPreviewProps) {
  const [waText, setWaText] = useState(waTemplate);
  const waRef = useRef<HTMLTextAreaElement | null>(null);

  // Rehydrate the textarea when the selected row changes (waTemplate identity
  // shifts). The template is the ground truth until the operator types.
  useEffect(() => {
    setWaText(waTemplate);
  }, [waTemplate]);

  const daysLate =
    group.urgency === "late" && group.earliestOrderBy && today
      ? daysBetweenIso(group.earliestOrderBy, today)
      : null;

  const supplierName = group.supplierName ?? "the factory";
  const stockToLabel = "Carres Klg"; // Jess 2026-07-23: warehouse ALWAYS Carres Klg
  const cats = catLabel(group.categories);
  const isLate = group.urgency === "late" && daysLate != null && daysLate > 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
      {/* 1. Compact single-row header — supplier + summary left, SEND BY right
             (Jess 2026-07-24 top-to-toe §2: was 3 stacked sections). Money
             REMOVED per Jess 2026-07-24 (no RM in operation preview — supplier
             already knows the price from their own quote). */}
      <div className="shrink-0 flex items-start justify-between gap-4 rounded-[8px] border border-base-200 bg-base-50 px-3 py-2.5 mb-3">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-base-900">
            Send PO to {supplierName} ({cats})
          </div>
          <div className="text-[12px] text-base-600 mt-0.5">
            {group.totalUnits} units · for {group.orderCount}{" "}
            {group.orderCount === 1 ? "SO" : "SOs"} · deliver to {stockToLabel}
            {preparedByName && <> · prepared by {preparedByName}</>}
          </div>
          {isLate && earliestCustomerDeadline && (
            <div className="text-[11px] text-base-500 mt-1">
              Earliest customer deadline in this PO:{" "}
              <span className="font-semibold text-base-800">
                {fmtDate(earliestCustomerDeadline)}
              </span>
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] uppercase tracking-[0.05em] text-base-500">
            Send by
          </div>
          <div className="text-[13px] font-semibold text-base-900 tabular-nums mt-0.5">
            {group.earliestOrderBy ? fmtDate(group.earliestOrderBy) : "—"}
          </div>
          {isLate && daysLate != null && daysLate > 0 && (
            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-danger">
              <AlertCircle size={12} strokeWidth={2} />
              {daysLate}d late
            </div>
          )}
        </div>
      </div>

      {/* 2. 7-column SKU table — SKU · Model · Size · Qty · In stock · Deadline
             · Order (Jess 2026-07-24 top-to-toe §1: recovered from git history
             0c5876b4~1, adapted). ORDER column shows the customer REF (CR/TCF
             LEAD token) that suppliers recognise; falls back to SO-N when the
             ref is null (e.g. native POS orders with no imported ref). */}
      <div className="shrink-0 rounded-[8px] border border-base-200 bg-white mb-3 overflow-hidden">
        <div
          className="grid gap-x-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.04em] text-base-500 border-b border-base-200 bg-base-50"
          style={{
            gridTemplateColumns: PREVIEW_TABLE_COLS,
          }}
        >
          <span>SKU</span>
          <span>Model</span>
          <span className="text-right">Size</span>
          <span className="text-right">Qty</span>
          <span className="text-right">In stock</span>
          <span>Deadline</span>
          <span>Order</span>
          <span />
        </div>
        {group.lines.map((l) => (
          <SkuRow key={l.sku} line={l} today={today} />
        ))}
      </div>

      {/* 4. Sales orders this PO covers — the evidence layer (Jess 2026-07-23:
             list every SO with customer + delivery deadline so the operator
             knows WHO the units are for, not just the qty). */}
      <SalesOrdersCovered lines={group.lines} />


      {/* 4. WhatsApp preview zone */}
      <div className="shrink-0 rounded-[8px] border border-base-200 bg-base-50 px-3 py-2 mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[11px] uppercase tracking-[0.05em] text-base-500">
            Message to {supplierName} · WhatsApp
          </div>
          <button
            type="button"
            onClick={() => {
              if (navigator.clipboard) void navigator.clipboard.writeText(waText);
            }}
            title="Copy message"
            className="p-1 rounded text-base-500 hover:text-base-900 hover:bg-hovertint"
          >
            <Copy size={14} strokeWidth={2} />
          </button>
        </div>
        <textarea
          ref={waRef}
          value={waText}
          onChange={(e) => setWaText(e.target.value)}
          rows={6}
          className="w-full resize-y text-[12.5px] font-mono text-base-900 bg-white border border-base-200 rounded-[6px] px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      {/* 5. Footer — ONE flame button (Send PO) per page (UI-KIT §A5) +
             Snooze PO (ghost, next-cycle defer with a date target — Jess
             2026-07-23). */}
      <div className="shrink-0 flex items-center justify-end gap-2 pt-1">
        {dutyHolderName && (
          <span
            className="text-[11px] text-base-500"
            title="PO duty this month — the one voice to suppliers"
          >
            {dutyHolderName} on PO duty
          </span>
        )}
        <SnoozeButton supplier={supplierName} />
        <Btn
          variant="box"
          size="md"
          icon={Download}
          onClick={() => {
            /* TODO wire real PDF export in P4 */
            if (typeof window !== "undefined") window.print();
          }}
        >
          Download PDF
        </Btn>
        <Btn
          variant="hero"
          size="md"
          icon={Send}
          onClick={() => onSendPo(buildPrefill())}
          title={`Open the PO form to raise this order to ${supplierName}.`}
        >
          Send PO to {supplierName}
        </Btn>
      </div>
    </div>
  );
}

/** Grid template for the 7-col SKU table header + rows. Kept in one place so
 *  header + rows can't drift apart. Trailing 24px = the ⋮ action button
 *  column. */
const PREVIEW_TABLE_COLS =
  "minmax(90px, 1.1fr) minmax(80px, 1fr) 40px 40px 56px minmax(80px, 1fr) minmax(80px, 1.2fr) 24px";

/** Size aliases — SKU tail (`-Q`, `-K`, `-SS`, `-SK`, `-S`) mapped to
 *  displayable code + label. Duplicated locally from OperationPurchase.tsx to
 *  keep this component self-contained (small table; the alternative would be
 *  a shared util). */
const SIZE_ALIASES: Record<string, { code: string; label: string }> = {
  Q: { code: "Q", label: "Queen" },
  K: { code: "K", label: "King" },
  S: { code: "S", label: "Single" },
  SS: { code: "SS", label: "Super Single" },
  SK: { code: "SK", label: "Super King" },
};
function parseSizeCode(sku: string): string | null {
  const parts = sku.split("-");
  if (parts.length < 2) return null;
  const tail = parts[parts.length - 1]?.toUpperCase() ?? "";
  return SIZE_ALIASES[tail]?.code ?? null;
}

/** Short in-cell day label: "22 Jul" (UTC-consistent). */
function dayLabelShort(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
function dayName(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return DOW[d.getUTCDay()]!;
}

/** Earliest deliveryDate across a line's forOrders. Null-safe: an order with
 *  no deadline is skipped; empty result → null. */
function earliestLineDeadline(
  forOrders: PoPreviewGroup["lines"][number]["forOrders"],
): string | null {
  let best: string | null = null;
  for (const o of forOrders) {
    const d = o.deliveryDate ?? null;
    if (!d) continue;
    if (best == null || d < best) best = d;
  }
  return best;
}

/** ORDER column text — prefer the customer REF (CR/TCF LEAD token) since
 *  suppliers recognise the ref. Fall back to SO-N when ref is null (native
 *  POS orders with no imported ref). `+N` when the line serves multiple
 *  orders — shows the earliest-deadline one first. */
function orderColText(
  forOrders: PoPreviewGroup["lines"][number]["forOrders"],
): string {
  if (forOrders.length === 0) return "—";
  const sorted = [...forOrders].sort((a, b) => {
    const da = a.deliveryDate ?? "9999";
    const db = b.deliveryDate ?? "9999";
    return da.localeCompare(db);
  });
  const head = sorted[0]!;
  const label = head.ref ?? (head.so != null ? `SO-${head.so}` : "—");
  return sorted.length > 1 ? `${label} +${sorted.length - 1}` : label;
}

/** One row of the 7-col SKU table — SKU · Model · Size · Qty · In stock ·
 *  Deadline · Order · ⋮. Deadline is coloured red when it's already past
 *  today. The ⋮ menu keeps the shipped stub actions (Send separately / Push
 *  to next / Skip) — no behavioural change vs. the old flat LineRow. */
function SkuRow({
  line,
  today,
}: {
  line: PoPreviewGroup["lines"][number];
  today: string | null;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  const stub = (label: string) => () => {
    toast(`${label} — coming soon`);
    setOpen(false);
  };
  const sizeCode = parseSizeCode(line.sku);
  const deadline = earliestLineDeadline(line.forOrders);
  const isOverdue = !!(deadline && today && deadline < today);
  const orderText = orderColText(line.forOrders);
  return (
    <div
      className="grid gap-x-2 px-3 py-1.5 text-[12.5px] border-b border-base-50 last:border-b-0 items-center hover:bg-hovertint transition-colors"
      style={{ gridTemplateColumns: PREVIEW_TABLE_COLS }}
      ref={wrapRef}
    >
      <span className="font-mono font-semibold text-base-900 truncate" title={line.sku}>
        {line.sku}
      </span>
      <span className="text-base-700 truncate" title={line.modelName ?? undefined}>
        {line.modelName ?? "—"}
      </span>
      <span className="font-mono font-bold text-base-800 text-right">
        {sizeCode ?? "—"}
      </span>
      <span className="font-mono font-bold tabular-nums text-base-900 text-right">
        {line.need}
      </span>
      <span className="font-mono tabular-nums text-right text-base-500">
        {line.ready > 0 ? line.ready : "—"}
      </span>
      <span
        className={`tabular-nums ${
          isOverdue ? "text-danger font-semibold" : "text-base-700"
        }`}
      >
        {deadline ? `${dayName(deadline)} ${dayLabelShort(deadline)}` : "—"}
      </span>
      <span className="font-mono text-base-700 truncate" title={orderText}>
        {orderText}
      </span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="p-0.5 rounded text-base-400 hover:text-base-900 hover:bg-hovertint"
          title="Line actions"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <MoreVertical size={14} strokeWidth={2} />
        </button>
        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 w-[200px] rounded-[8px] border border-base-200 bg-white shadow-lg py-1 z-10"
          >
            <MenuItem
              label="Send separately"
              hint="Split into its own PO, sent today"
              onClick={stub("Send separately")}
            />
            <MenuItem
              label="Push to next cycle"
              hint="Hold for tomorrow's PO plan"
              onClick={stub("Push to next cycle")}
            />
            <MenuItem
              label="Skip"
              hint="Don't buy this line this cycle"
              onClick={stub("Skip")}
              danger
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  label,
  hint,
  onClick,
  danger,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full text-left px-3 py-2 hover:bg-hovertint transition-colors"
    >
      <div
        className={`text-[13px] font-medium ${
          danger ? "text-danger" : "text-base-900"
        }`}
      >
        {label}
      </div>
      <div className="text-[11px] text-base-500">{hint}</div>
    </button>
  );
}

/** Snooze the whole PO to a target date (next-cycle defer). Stub until the
 *  snooze route ships (Jess 2026-07-23). */
function SnoozeButton({ supplier }: { supplier: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  const stub = (until: string) => () => {
    toast(`Snooze ${supplier} PO until ${until} — coming soon`);
    setOpen(false);
  };
  return (
    <div className="relative" ref={wrapRef}>
      <Btn
        variant="box"
        size="md"
        icon={Clock}
        onClick={() => setOpen((v) => !v)}
      >
        Snooze
      </Btn>
      {open && (
        <div
          role="menu"
          className="absolute right-0 bottom-full mb-1 w-[180px] rounded-[8px] border border-base-200 bg-white shadow-lg py-1 z-10"
        >
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.05em] text-base-500">
            Snooze until
          </div>
          <MenuItem
            label="Next PO day"
            hint="Mon or Thu, whichever is next"
            onClick={stub("next PO day")}
          />
          <MenuItem
            label="Next week"
            hint="7 days from today"
            onClick={stub("next week")}
          />
          <MenuItem
            label="Pick a date…"
            hint="Choose any working day"
            onClick={stub("a chosen date")}
          />
        </div>
      )}
    </div>
  );
}

/** Aggregate the SOs across every line's `forOrders` and render one row per
 *  unique SO with REF + customer + delivery deadline. Feeds the operator the
 *  "who is this PO for" evidence at a glance (Jess 2026-07-23 v2 + 2026-07-24
 *  ref column). The REF column prefers the customer's CR/TCF ref (that's
 *  what suppliers recognise) and falls back to SO-N when a ref is null. */
function SalesOrdersCovered({ lines }: { lines: PoPreviewGroup["lines"] }) {
  const bySo = new Map<
    number,
    {
      customerName: string | null;
      deliveryDate: string | null;
      ref: string | null;
    }
  >();
  for (const l of lines) {
    for (const o of l.forOrders) {
      if (o.so == null) continue;
      const cur = bySo.get(o.so);
      if (!cur) {
        bySo.set(o.so, {
          customerName: o.customerName ?? null,
          deliveryDate: o.deliveryDate ?? null,
          ref: o.ref ?? null,
        });
      }
    }
  }
  if (bySo.size === 0) return null;
  const rows = [...bySo.entries()]
    .map(([so, v]) => ({ so, ...v }))
    .sort((a, b) => {
      // Earliest delivery date first; nulls to the tail.
      if (!a.deliveryDate && !b.deliveryDate) return a.so - b.so;
      if (!a.deliveryDate) return 1;
      if (!b.deliveryDate) return -1;
      return a.deliveryDate.localeCompare(b.deliveryDate);
    });
  return (
    <div className="shrink-0 rounded-[8px] border border-base-200 bg-white px-3 py-2 mb-3">
      <div className="text-[11px] uppercase tracking-[0.05em] text-base-500 mb-1">
        Sales orders this PO covers ({rows.length})
      </div>
      <div className="grid grid-cols-[110px_60px_1fr_auto] gap-x-3 gap-y-0.5 text-[12.5px]">
        {rows.map((r) => (
          <div key={r.so} className="contents">
            <span className="font-mono text-base-900 font-semibold truncate" title={r.ref ?? undefined}>
              {r.ref ?? `SO-${r.so}`}
            </span>
            <span className="font-mono tabular-nums text-base-500 text-[11px]">
              {r.ref ? `SO-${r.so}` : ""}
            </span>
            <span className="text-base-800 truncate">
              {r.customerName ?? "—"}
            </span>
            <span className="tabular-nums text-base-600">
              {r.deliveryDate ? fmtDate(r.deliveryDate) : "TBD"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
