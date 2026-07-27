// design-standard: not-a-list-page — modal review overlay (logistic-partner
// message cards), launched from the Orders bulk bar's Logistics ⋮; the page
// shell stays underneath. Mirror of ChaseSupplierReview, grouped by company.
import { useMemo, useState } from "react";
import { Copy, ExternalLink, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { fmtDateShort } from "@/lib/fmt-date";
import type { DeliveryPartnerRow } from "@/lib/queries";
import {
  buildPartnerGroupMessage,
  type PartnerGroupRow,
} from "@/lib/wa-templates";

/** Per-order input for the partner chase — the caller maps its list rows to
 *  this (mirrors ChaseSupplierReview's ChaseOrder). Partners speak the ORIGINAL
 *  CR/TCF ref, never the SO. `partnerId` is the resolved delivery partner
 *  (delivery_partner_id ?? ops_assigned_logistic); null = not assigned yet. */
export interface PartnerChaseOrder {
  id: string;
  partnerId: string | null;
  refNo: string | null;
  customer: string | null;
  region: string | null;
  deliveryDate: string | null;
  deliveryTbd: boolean;
  lines: { sku: string; qty: number }[];
}

/**
 * Confirm-delivery-date review (Remind / Call over the selection):
 * ONE card per delivery partner — the message lists every selected order's
 * CR/TCF ref + customer (region) + items + deadline. Copy grabs the text; Open
 * group opens the partner's WhatsApp group. GROUP invite links
 * (chat.whatsapp.com/…) don't accept a ?text= prefill, so Open just opens the
 * group and the operator pastes the copied message. Open to ALL operation.
 */
/** The two message TONES, in the canonical words (COPY-STANDARD): `Remind` is
 *  the pre-deadline follow-up, `Call` the firm one. "Chase" is banned. */
const TONE_LABEL: Record<"remind" | "chase", string> = {
  remind: "Remind",
  chase: "Call",
};

export default function ChasePartnerReview({
  orders,
  partners,
  onClose,
  initialMode = "remind",
}: {
  orders: PartnerChaseOrder[];
  partners: DeliveryPartnerRow[];
  onClose: () => void;
  /** Which tone the review opens on: the LOGISTIC section's "Remind" opens on
   *  remind, "Call" opens on the firmer tone. */
  initialMode?: "remind" | "chase";
}) {
  const [mode, setMode] = useState<"remind" | "chase">(initialMode);

  const partnerById = useMemo(
    () => new Map(partners.map((p) => [p.id, p])),
    [partners],
  );

  // Group the selection by partner; orders with no partner are counted as
  // unassigned (no call to make — they need Assign logistics first).
  const { cards, unassigned } = useMemo(() => {
    const byPartner = new Map<string, PartnerChaseOrder[]>();
    let noPartner = 0;
    for (const o of orders) {
      if (!o.partnerId) {
        noPartner += 1;
        continue;
      }
      const arr = byPartner.get(o.partnerId) ?? [];
      arr.push(o);
      byPartner.set(o.partnerId, arr);
    }
    const list = [...byPartner.entries()]
      .map(([partnerId, ords]) => ({ partnerId, ords }))
      .sort((a, b) => {
        const an = partnerById.get(a.partnerId)?.name ?? "";
        const bn = partnerById.get(b.partnerId)?.name ?? "";
        return an.localeCompare(bn);
      });
    return { cards: list, unassigned: noPartner };
  }, [orders, partnerById]);

  async function copyMsg(msg: string, partnerName: string) {
    try {
      await navigator.clipboard.writeText(msg);
      toast.success(`Message copied — ${partnerName}`);
    } catch {
      toast.error("Couldn't copy — select the text and copy manually");
    }
  }

  const totalUnits = orders.reduce(
    (s, o) => s + o.lines.reduce((u, l) => u + l.qty, 0),
    0,
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center overflow-y-auto py-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="chase-partner-review"
    >
      <div className="w-[780px] max-w-[94vw] bg-white rounded-xl border border-base-200 shadow-xl mb-8">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 h-12 border-b border-base-200">
          <MessageCircle size={16} className="text-base-500" strokeWidth={2} />
          <span className="text-[13px] font-semibold">
            Confirm delivery date — one message per logistics company
          </span>
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
              ? "Gentle — before the delivery deadline."
              : "Firmer — the deadline is close or already passed."}
          </span>
        </div>

        {unassigned > 0 && (
          <div className="px-5 py-2 text-[12px] text-base-500 border-b border-base-100">
            {unassigned} order{unassigned === 1 ? "" : "s"} have no logistics company
            yet — assign one first, then call.
          </div>
        )}

        {cards.length === 0 && (
          <div className="px-5 py-8 text-[13px] text-base-500">
            No calls to make — no order in the selection has a logistics company.
          </div>
        )}

        {/* Partner cards */}
        <div className="p-4 space-y-3">
          {cards.map((card) => {
            const partner = partnerById.get(card.partnerId);
            if (!partner) return null;
            const rows: PartnerGroupRow[] = card.ords.map((o) => ({
              ref: o.refNo,
              customer: o.customer,
              region: o.region,
              deadline: o.deliveryTbd || !o.deliveryDate
                ? "TBD"
                : fmtDateShort(o.deliveryDate),
              overdue: isOverdue(o),
              items: o.lines,
            }));
            const units = card.ords.reduce(
              (t, o) => t + o.lines.reduce((u, l) => u + l.qty, 0),
              0,
            );
            const msg = buildPartnerGroupMessage(mode, partner.name, rows);
            const groupUrl = partner.whatsapp_group_url ?? null;
            return (
              <div
                key={card.partnerId}
                className="border border-base-200 rounded-xl overflow-hidden"
                data-testid={`chase-partner-card-${partner.name}`}
              >
                <div className="flex items-center gap-2 px-4 h-10 bg-base-50 border-b border-base-100">
                  <span className="text-[13px] font-semibold">{partner.name}</span>
                  <span className="text-[12px] text-base-500 tabular-nums">
                    {card.ords.length} order{card.ords.length === 1 ? "" : "s"} · {units} unit
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
                      onClick={() => void copyMsg(msg, partner.name)}
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
                          await copyMsg(msg, partner.name);
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
            Copy the message, then open the company&rsquo;s WhatsApp group and paste.
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

/** A delivery is overdue when its (non-TBD) deadline is before today. */
function isOverdue(o: PartnerChaseOrder): boolean {
  if (o.deliveryTbd || !o.deliveryDate) return false;
  const d = new Date(`${o.deliveryDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}
