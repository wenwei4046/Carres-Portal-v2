// design-standard: not-a-list-page — modal review overlay (supplier follow-up
// cards), launched from the Orders bulk bar; the page shell stays underneath.
import { useMemo, useState } from "react";
import { Copy, ExternalLink, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { useCatalog, useOperationSuppliers } from "@/lib/queries";
import {
  buildSupplierGroupMessage,
  type SupplierGroupRow,
} from "@/lib/wa-templates";
import { buildChaseSupplierPlan, type ChaseOrder } from "./chase-supplier-plan";

/**
 * Confirm-ready-date review (Remind / Call over the selection):
 * ONE card per supplier — the message lists every selected order's CR/TCF ref
 * (suppliers never speak the SO number) + items. Copy grabs the text; Open group
 * opens the supplier's WhatsApp group. GROUP invite links (chat.whatsapp.com/…)
 * don't accept a ?text= prefill, so Open just opens the group and the operator
 * pastes the copied message. Open to ALL operation (no PO-duty gate).
 */

/** The two message TONES, in the canonical words (COPY-STANDARD): `Remind` is
 *  the pre-deadline follow-up, `Call` the firm one. "Chase" is banned. */
const TONE_LABEL: Record<"remind" | "chase", string> = {
  remind: "Remind",
  chase: "Call",
};

export default function ChaseSupplierReview({
  orders,
  onClose,
  initialMode = "remind",
  supplierScope = null,
}: {
  orders: ChaseOrder[];
  onClose: () => void;
  /** Which tone the review opens on (Jess 2026-07-19): the SUPPLIER-section
   *  "Remind" button opens on remind, "Call" opens on the firmer tone. */
  initialMode?: "remind" | "chase";
  /** When the SUPPLIER facet is filtered to one supplier (Jess 2026-07-19 bug:
   *  "select Nice Future — why still show Ohana?"), scope the review to THAT
   *  supplier — a multi-supplier order otherwise spawns a card per supplier line.
   *  null = no filter (the bulk-bar Supplier ⋮ → every supplier). */
  supplierScope?: string | null;
}) {
  const suppliersQ = useOperationSuppliers();
  const catalogQ = useCatalog();
  const [mode, setMode] = useState<"remind" | "chase">(initialMode);

  const suppliers = useMemo(() => suppliersQ.data?.suppliers ?? [], [suppliersQ.data]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  // Catalog SKU meta — supplier + category for catalog-matched lines. AutoCount
  // free-text SKUs miss here and resolve via category keyword instead.
  const skuMeta = useMemo(() => {
    const modelCat = new Map(
      (catalogQ.data?.models ?? []).map((m) => [m.id, m.category as string]),
    );
    const m = new Map<string, { supplierId: string | null; category: string | null }>();
    for (const s of catalogQ.data?.skus ?? []) {
      m.set(s.sku, {
        supplierId: s.supplierId ?? null,
        category: modelCat.get(s.modelId) ?? null,
      });
    }
    return m;
  }, [catalogQ.data]);

  const plan = useMemo(() => {
    const p = buildChaseSupplierPlan(orders, skuMeta, suppliers);
    // Scope to the filtered supplier so a multi-supplier order doesn't leak a
    // card for the OTHER supplier's lines (Jess 2026-07-19 bug fix).
    if (!supplierScope) return p;
    return { ...p, cards: p.cards.filter((c) => c.supplierId === supplierScope) };
  }, [orders, skuMeta, suppliers, supplierScope]);

  async function copyMsg(msg: string, supplierName: string) {
    try {
      await navigator.clipboard.writeText(msg);
      toast.success(`Message copied — ${supplierName}`);
    } catch {
      toast.error("Couldn't copy — select the text and copy manually");
    }
  }

  const totalUnits = plan.cards.reduce(
    (s, c) => s + c.rows.reduce((t, r) => t + r.items.reduce((u, i) => u + i.qty, 0), 0),
    0,
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center overflow-y-auto py-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="chase-supplier-review"
    >
      <div className="w-[780px] max-w-[94vw] bg-white rounded-xl border border-base-200 shadow-xl mb-8">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 h-12 border-b border-base-200">
          <MessageCircle size={16} className="text-base-500" strokeWidth={2} />
          <span className="text-[13px] font-semibold">Confirm ready date — one message per supplier</span>
          <span className="text-[12px] text-base-500 tabular-nums">
            {orders.length} order{orders.length === 1 ? "" : "s"} · {totalUnits} unit
            {totalUnits === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto p-1 rounded text-base-500 hover:text-base-900 hover:bg-base-100"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Remind / Call toggle — the two message TONES */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-base-100">
          <div className="inline-flex rounded-lg border border-base-200 p-0.5 bg-base-50">
            {(["remind", "chase"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`text-[12px] font-medium px-3 py-1 rounded-md ${
                  mode === m ? "bg-white text-base-900 shadow-sm" : "text-base-500 hover:text-base-900"
                }`}
              >
                {TONE_LABEL[m]}
              </button>
            ))}
          </div>
          <span className="text-[12px] text-base-500">
            {mode === "remind"
              ? "Gentle — before the deadline."
              : "Firmer — the stock is already late."}
          </span>
        </div>

        {plan.unresolved > 0 && (
          <div className="px-5 py-2 text-[12px] text-base-500 border-b border-base-100">
            {plan.unresolved} line{plan.unresolved === 1 ? "" : "s"} couldn&rsquo;t be matched to a
            supplier — skipped.
          </div>
        )}

        {plan.cards.length === 0 && (
          <div className="px-5 py-8 text-[13px] text-base-500">
            No calls to make — no core supplier line in the selection.
          </div>
        )}

        {/* Supplier cards */}
        <div className="p-4 space-y-3">
          {plan.cards.map((card) => {
            const supplier = supplierById.get(card.supplierId);
            if (!supplier) return null;
            const rows: SupplierGroupRow[] = card.rows.map((r) => ({
              ref: r.ref,
              po: r.po,
              items: r.items,
            }));
            const units = card.rows.reduce(
              (t, r) => t + r.items.reduce((u, i) => u + i.qty, 0),
              0,
            );
            // Mattress suppliers speak the CR/TCF ref only; sofa/bedframe
            // suppliers key off the PO too (Jess 2026-07-19).
            const includePo = !(supplier.cat_covered ?? []).some((c) =>
              c.toLowerCase().includes("mattress"),
            );
            const msg = buildSupplierGroupMessage(mode, supplier.name, rows, includePo);
            const groupUrl = supplier.whatsapp_group_url;
            return (
              <div
                key={card.supplierId}
                className="border border-base-200 rounded-xl overflow-hidden"
                data-testid={`chase-card-${supplier.name}`}
              >
                <div className="flex items-center gap-2 px-4 h-10 bg-base-50 border-b border-base-100">
                  <span className="text-[13px] font-semibold">{supplier.name}</span>
                  <span className="text-[12px] text-base-500 tabular-nums">
                    {card.rows.length} ref{card.rows.length === 1 ? "" : "s"} · {units} unit
                    {units === 1 ? "" : "s"}
                  </span>
                  <span
                    className={`text-[11px] ${groupUrl ? "text-base-400" : "text-base-400 italic"}`}
                  >
                    {groupUrl ? "group linked" : "group not set"}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-ghost text-[12px] py-1 px-2 inline-flex items-center gap-1"
                      onClick={() => void copyMsg(msg, supplier.name)}
                    >
                      <Copy size={13} strokeWidth={2} /> Copy
                    </button>
                    {groupUrl && (
                      <button
                        type="button"
                        className="btn-primary text-[12px] py-1 px-3 inline-flex items-center gap-1"
                        // GROUP invite links can't carry a pre-typed message
                        // (WhatsApp limit) — so one click COPIES the message,
                        // then opens the group; the operator just pastes.
                        onClick={async () => {
                          await copyMsg(msg, supplier.name);
                          window.open(groupUrl, "_blank", "noopener,noreferrer");
                        }}
                      >
                        Open group <ExternalLink size={13} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="px-4 py-3 text-[13px] text-base-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {msg}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-base-200">
          <span className="text-[12px] text-base-500">
            Copy the message, then open the supplier&rsquo;s WhatsApp group and paste.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto btn-secondary text-[12px] py-1.5 px-3"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
