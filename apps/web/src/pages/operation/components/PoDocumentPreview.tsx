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

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Copy, Download, Send } from "lucide-react";
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
    need: number;
    cost: number | null;
    forOrders: ReadonlyArray<{
      so: number | null;
      customerName: string | null;
      deliveryDate?: string | null;
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

function totalRm(lines: PoPreviewGroup["lines"]): number {
  return lines.reduce((s, l) => s + (l.cost != null ? l.cost * l.need : 0), 0);
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

  const rm = useMemo(() => totalRm(group.lines), [group.lines]);
  const daysLate =
    group.urgency === "late" && group.earliestOrderBy && today
      ? daysBetweenIso(group.earliestOrderBy, today)
      : null;

  const supplierName = group.supplierName ?? "the factory";
  const stockToLabel = "Balakong · AL pickup"; // TODO: wire real route on next iteration
  const cats = catLabel(group.categories);
  const isLate = group.urgency === "late" && daysLate != null && daysLate > 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
      {/* 1. Late banner + earliest customer deadline strip */}
      {isLate && (
        <div className="shrink-0 flex items-start gap-2 rounded-[8px] border border-danger bg-error-soft px-3 py-2 mb-3 text-[12px]">
          <AlertCircle size={16} className="text-danger shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="font-semibold text-danger">
              {daysLate} {daysLate === 1 ? "day" : "days"} late — should have sent earlier.
            </div>
            {earliestCustomerDeadline && (
              <div className="text-base-600">
                Earliest customer deadline in this PO:{" "}
                <span className="font-semibold text-base-900">
                  {fmtDate(earliestCustomerDeadline)}
                </span>
                {group.orderCount > 1 && (
                  <> · covers {group.orderCount} sales orders</>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Meta rows — key facts before the doc renders */}
      <div className="shrink-0 rounded-[8px] border border-base-200 bg-base-50 px-3 py-2 mb-3 grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 text-[12px]">
        <span className="text-base-500">Supplier</span>
        <span className="font-semibold text-base-900">{supplierName}</span>
        <span className="text-base-500">Category</span>
        <span className="text-base-800">{cats}</span>
        <span className="text-base-500">Stock to</span>
        <span className="text-base-800">{stockToLabel}</span>
        {preparedByName && (
          <>
            <span className="text-base-500">Prepared by</span>
            <span className="text-base-800">{preparedByName}</span>
          </>
        )}
        {rm > 0 && (
          <>
            <span className="text-base-500">Total</span>
            <span className="font-mono font-semibold tabular-nums text-base-900">
              RM {rm.toLocaleString("en-MY", { maximumFractionDigits: 0 })}
            </span>
          </>
        )}
      </div>

      {/* 3. PDF-style PO document */}
      <div className="shrink-0 rounded-[8px] border border-base-200 bg-white shadow-sm px-4 py-4 mb-3">
        <div className="flex items-start justify-between mb-3 pb-3 border-b border-base-200">
          <div>
            <div className="text-[15px] font-bold tracking-wide text-base-900">
              CARRES SDN BHD
            </div>
            <div className="text-[11px] text-base-500">Purchase Order · draft</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.06em] text-base-500">
              Date
            </div>
            <div className="text-[12px] font-mono tabular-nums text-base-900">
              {today ? fmtDate(today) : "—"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-3 text-[12px]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.06em] text-base-500 mb-0.5">
              Vendor
            </div>
            <div className="font-semibold text-base-900">{supplierName}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.06em] text-base-500 mb-0.5">
              Ship to
            </div>
            <div className="text-base-800">{stockToLabel}</div>
          </div>
        </div>

        {/* Line-item table */}
        <div className="border-t border-b border-base-200 py-2">
          <div className="grid grid-cols-[1fr_60px_80px] gap-2 text-[10px] uppercase tracking-[0.06em] text-base-500 mb-1">
            <span>SKU · Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Amount</span>
          </div>
          {group.lines.map((l) => (
            <div
              key={l.sku}
              className="grid grid-cols-[1fr_60px_80px] gap-2 py-0.5 text-[12px]"
            >
              <span className="font-mono tabular-nums text-base-800 truncate">
                {l.sku}
              </span>
              <span className="text-right tabular-nums text-base-800">{l.need}</span>
              <span className="text-right font-mono tabular-nums text-base-800">
                {l.cost != null
                  ? `${(l.cost * l.need).toLocaleString("en-MY", {
                      maximumFractionDigits: 0,
                    })}`
                  : "—"}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 text-[13px]">
          <span className="text-base-500">Total</span>
          <span className="font-mono font-bold tabular-nums text-base-900">
            {rm > 0
              ? `RM ${rm.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`
              : "—"}
          </span>
        </div>

        <div className="mt-3 pt-3 border-t border-base-200 text-[11px] text-base-500">
          Please confirm receive.{" "}
          {preparedByName && <>Prepared by {preparedByName} · Carres</>}
        </div>
      </div>

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

      {/* 5. Footer — ONE flame button (Send PO) per page (UI-KIT §A5) */}
      <div className="shrink-0 flex items-center justify-end gap-2 pt-1">
        {dutyHolderName && (
          <span
            className="text-[11px] text-base-500"
            title="PO duty this month — the one voice to suppliers"
          >
            {dutyHolderName} on PO duty
          </span>
        )}
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
