import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { maxLeadDaysFor } from "@carres/shared";
import { ApiError } from "@/lib/api";
import {
  useCatalog,
  useConfirmProceedRequest,
  useDeliveryPartners,
  type operationOrderDetailLine,
  type operationOrderDetailOrder,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";

/**
 * ConfirmProceedDialog — Operation Accept-Proceed entry point.
 *
 * Migration 0147 (item h, 2026-05-23) rewrote the dialog. Old role: pick a
 * source warehouse. New role: pick the customer-leg LP at this moment.
 *
 * v3 RPC `operation_confirm_proceed_request_v3` now requires
 * `p_delivery_partner_id`. It writes orders.delivery_partner_id +
 * orders.request_for_delivery_at, putting the order into the LP's "Incoming"
 * queue. The RPC ALSO auto-picks an `own` warehouse internally — covered
 * SKUs become reserved + the order flips to `ready_to_dispatch`; otherwise
 * the order goes to `in_production` and Operation issues POs
 * next. No warehouse choice from the dialog any more.
 *
 * Operation-side soft-lock (2026-05-22 Loo, commit 2d608c4) preserved: if
 * delivery date is more than category lead-time (mattress/bedframe 14, sofa
 * 21) out, the operator must explicitly ack to procure now. Procuring too
 * early ties up warehouse stock until the late delivery date.
 */
interface Props {
  order: operationOrderDetailOrder;
  lines: operationOrderDetailLine[];
  onClose: () => void;
}

interface ApiErrorBody {
  code?: string;
  hint?: string;
  message?: string;
}

function readErrorBody(err: ApiError): ApiErrorBody {
  return (err.body ?? {}) as ApiErrorBody;
}

// Logistic-partner display + ordering (same set/order as OperationInbox).
const LP_DISPLAY: Record<string, string> = {
  nets:  "NETS",
  tsdd:  "TSDD",
  al:    "AL",
  houzs: "HOUZS",
};
const LP_ORDER: Record<string, number> = { nets: 0, tsdd: 1, al: 2, houzs: 3 };

export default function ConfirmProceedDialog({
  order,
  lines,
  onClose,
}: Props) {
  const partnersQ = useDeliveryPartners();
  const allPartners = partnersQ.data?.partners ?? [];

  // Filter to the 4 logistic partners + canonicalise display labels. Mirrors
  // OperationInbox so the LP set is consistent across the two operator-facing
  // pickers.
  const logisticPartners = useMemo(() => {
    return allPartners
      .filter((p) =>
        Object.keys(LP_DISPLAY).some((slug) => p.name.toLowerCase().startsWith(slug)),
      )
      .map((p) => {
        const slug = Object.keys(LP_DISPLAY).find((s) => p.name.toLowerCase().startsWith(s)) ?? "";
        return {
          id: p.id,
          name: LP_DISPLAY[slug] ?? p.name,
          _order: LP_ORDER[slug] ?? 99,
        };
      })
      .sort((a, b) => a._order - b._order);
  }, [allPartners]);

  const [partnerId, setPartnerId] = useState<string>("");
  useEffect(() => {
    if (!partnerId && logisticPartners.length > 0) {
      setPartnerId(logisticPartners[0].id);
    }
  }, [partnerId, logisticPartners]);

  const confirm = useConfirmProceedRequest(order.id);

  // Lead-time soft-lock (2026-05-22 Loo). Mattress/bedframe production = 14
  // days, sofa = 21 (DELIVERY_LEAD_DAYS in shared). If the customer's
  // delivery date is more than that many days out, accepting now means
  // stock arrives at the warehouse and sits idle until delivery — tied-up
  // capital + storage cost. Force explicit ack.
  const catalogQ = useCatalog();
  const leadDays = useMemo(() => {
    if (!catalogQ.data || lines.length === 0) return 0;
    const cats = new Set<string>();
    for (const line of lines) {
      const sku = catalogQ.data.skus.find((s) => s.sku === line.sku);
      if (!sku) continue;
      const model = catalogQ.data.models.find((m) => m.id === sku.modelId);
      if (model) cats.add(model.category);
    }
    return maxLeadDaysFor([...cats], catalogQ.data.earliestSellDays ?? 0);
  }, [catalogQ.data, lines]);
  const leadGap = useMemo(() => {
    if (leadDays === 0 || !order.delivery_date || order.delivery_date_tbd) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(order.delivery_date);
    if (Number.isNaN(target.getTime())) return null;
    const msPerDay = 86_400_000;
    const days = Math.ceil((target.getTime() - today.getTime()) / msPerDay);
    if (days <= leadDays) return null;
    return { days, leadDays, excess: days - leadDays };
  }, [leadDays, order.delivery_date, order.delivery_date_tbd]);
  const [leadAcknowledged, setLeadAcknowledged] = useState(false);
  useEffect(() => {
    setLeadAcknowledged(false);
  }, [order.id, leadGap?.days, leadGap?.leadDays]);

  const valid =
    !!partnerId && !confirm.isPending && (leadGap === null || leadAcknowledged);

  async function submit() {
    if (!valid) return;
    try {
      await confirm.mutateAsync({ deliveryPartnerId: partnerId });
      const lpName = logisticPartners.find((p) => p.id === partnerId)?.name ?? "LP";
      toast.success(`#${order.so} accepted · ${lpName} notified`);
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const body = readErrorBody(e);
        if (body.code === "partner_required") {
          toast.error("Pick a delivery partner first");
        } else if (body.code === "partner_not_found") {
          toast.error("That delivery partner no longer exists — pick another");
        } else if (body.code === "wrong_stage") {
          toast.error("Order has already been triaged — refresh and retry");
        } else if (body.code === "insufficient_stock_for_reserve") {
          toast.error("Stock changed under us — re-check and retry");
        } else {
          toast.error(e.message || "Confirm proceed failed");
        }
      } else {
        toast.error(e instanceof Error ? e.message : "Confirm proceed failed");
      }
    }
  }

  return (
    <Modal title={`Confirm proceed · #${order.so}`} onClose={onClose}>
      <div className="text-meta text-base-600 mb-3.5 font-body">
        Pick the customer-leg delivery partner. They&rsquo;ll receive this
        order in their <strong>Incoming</strong> queue to accept or reject.
        The system auto-picks the source warehouse based on stock coverage —
        order goes to <strong>Ready to dispatch</strong> if covered, otherwise
        to <strong>In Production</strong> for PO issuance.
      </div>

      <div
        className="card mb-3.5 px-3.5 py-2.5"
        style={{ background: "var(--base-50)" }}
      >
        <div className="label mb-1.5">Order lines</div>
        <div className="font-mono text-label text-base-600">
          {lines.map((l) => `${l.sku} ×${l.qty}`).join(" · ") || "—"}
        </div>
      </div>

      <div className="label mb-1.5">Delivery partner *</div>
      {partnersQ.isLoading ? (
        <div className="text-meta text-base-500 mb-3.5">
          Loading partners…
        </div>
      ) : partnersQ.isError ? (
        <div className="text-meta text-destructive mb-3.5">
          Couldn&rsquo;t load partners — try again later.
        </div>
      ) : logisticPartners.length === 0 ? (
        <div className="text-meta text-warning mb-3.5">
          No logistic partners configured (NETS / TSDD / AL / HOUZS).
        </div>
      ) : (
        <select
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
          aria-label="Delivery partner"
          className={`${INPUT_CLS} mb-3.5`}
        >
          {logisticPartners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      {leadGap && (
        <div
          data-testid="confirm-proceed-lead-warning"
          className="text-meta px-3 py-2.5 rounded-[4px] mb-3.5 font-body text-destructive border border-destructive/30 bg-destructive/5"
        >
          <div>
            <strong>Procuring too early?</strong> — delivery is{" "}
            <strong>{leadGap.days} days</strong> from today, but production
            lead-time for this category is only{" "}
            <strong>{leadGap.leadDays} days</strong>. Proceeding now means
            stock arrives ~{leadGap.excess} day{leadGap.excess === 1 ? "" : "s"}{" "}
            early and sits idle in the warehouse.
          </div>
          <label className="inline-flex items-center gap-2 mt-2 cursor-pointer text-meta">
            <input
              type="checkbox"
              checked={leadAcknowledged}
              onChange={(e) => setLeadAcknowledged(e.target.checked)}
              className="w-4 h-4"
            />
            I&apos;m sure I want to procure now anyway
          </label>
        </div>
      )}

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary="Confirm proceed"
        primaryDisabled={!valid || logisticPartners.length === 0}
        primaryPending={confirm.isPending}
      />
    </Modal>
  );
}
