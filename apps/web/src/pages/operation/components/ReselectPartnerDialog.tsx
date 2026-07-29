import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useDeliveryPartners,
  useReselectPartner,
  type operationOrderListRow,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";

/**
 * ReselectPartnerDialog — Migration 0147 (item h, 2026-05-23).
 *
 * Opens when an order's `partner_rejected_at` is set. Shows:
 *   - The LP that rejected + their reason (from partner_rejected_reason)
 *   - A picker for a different LP (excludes the one that just rejected)
 *   - Submit → operation_reselect_partner RPC → fresh request_for_delivery_at
 *
 * On success the order goes back into the new LP's "Incoming" queue.
 */
const LP_DISPLAY: Record<string, string> = {
  nets:  "NETS",
  tsdd:  "TSDD",
  al:    "AL",
  houzs: "HOUZS",
};
const LP_ORDER: Record<string, number> = { nets: 0, tsdd: 1, al: 2, houzs: 3 };

interface Props {
  order: operationOrderListRow;
  onClose: () => void;
}

interface ApiErrorBody {
  code?: string;
  message?: string;
}

function readErrorBody(err: ApiError): ApiErrorBody {
  return (err.body ?? {}) as ApiErrorBody;
}

export default function ReselectPartnerDialog({ order, onClose }: Props) {
  const partnersQ = useDeliveryPartners();
  const allPartners = partnersQ.data?.partners ?? [];

  // Filter to logistic partners + EXCLUDE the one that just rejected so the
  // operator can't pick them again (RPC also guards with 22023 same_partner
  // but UI removes the option for clarity).
  const candidatePartners = useMemo(() => {
    return allPartners
      .filter((p) =>
        Object.keys(LP_DISPLAY).some((slug) => p.name.toLowerCase().startsWith(slug)),
      )
      .filter((p) => p.id !== order.delivery_partner_id)
      .map((p) => {
        const slug = Object.keys(LP_DISPLAY).find((s) => p.name.toLowerCase().startsWith(s)) ?? "";
        return {
          id: p.id,
          name: LP_DISPLAY[slug] ?? p.name,
          _order: LP_ORDER[slug] ?? 99,
        };
      })
      .sort((a, b) => a._order - b._order);
  }, [allPartners, order.delivery_partner_id]);

  const [partnerId, setPartnerId] = useState<string>("");
  useEffect(() => {
    if (!partnerId && candidatePartners.length > 0) {
      setPartnerId(candidatePartners[0].id);
    }
  }, [partnerId, candidatePartners]);

  const reselect = useReselectPartner(order.id);
  const rejectedByName =
    order.delivery_partners?.name ??
    (order.delivery_partner_id
      ? `LP-${order.delivery_partner_id.slice(0, 8)}`
      : "previous LP");
  const rejectedAt = order.partner_rejected_at
    ? fmtDate(order.partner_rejected_at)
    : null;

  async function submit() {
    if (!partnerId || reselect.isPending) return;
    try {
      await reselect.mutateAsync({ partnerId });
      const lpName = candidatePartners.find((p) => p.id === partnerId)?.name ?? "LP";
      toast.success(`#${order.so} reselected · ${lpName} notified`);
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const body = readErrorBody(e);
        if (body.code === "same_partner") {
          toast.error("Same LP as before — pick a different one");
        } else if (body.code === "not_rejected") {
          toast.error("Order is no longer in rejected state — refresh");
        } else if (body.code === "partner_not_found") {
          toast.error("That delivery partner no longer exists");
        } else {
          toast.error(e.message || "Reselect failed");
        }
      } else {
        toast.error(e instanceof Error ? e.message : "Reselect failed");
      }
    }
  }

  return (
    <Modal title={`Reselect LP · #${order.so}`} onClose={onClose}>
      <div
        data-testid="reselect-rejected-context"
        className="text-meta px-3 py-2.5 rounded-[4px] mb-3.5 font-body text-destructive border border-destructive/30 bg-destructive/5"
      >
        <div>
          <strong>{rejectedByName}</strong> rejected this delivery
          {rejectedAt ? ` on ${rejectedAt}` : ""}.
        </div>
        {order.partner_rejected_reason && (
          <div className="mt-1 italic text-base-700">
            &ldquo;{order.partner_rejected_reason}&rdquo;
          </div>
        )}
      </div>

      <div className="label mb-1.5">Pick a different delivery partner *</div>
      {partnersQ.isLoading ? (
        <div className="text-meta text-base-500 mb-3.5">
          Loading partners…
        </div>
      ) : candidatePartners.length === 0 ? (
        <div className="text-meta text-warning mb-3.5">
          No other logistic partners available.
        </div>
      ) : (
        <select
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
          aria-label="Delivery partner"
          className={`${INPUT_CLS} mb-3.5`}
        >
          {candidatePartners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary="Reselect LP"
        primaryDisabled={!partnerId || candidatePartners.length === 0 || reselect.isPending}
        primaryPending={reselect.isPending}
      />
    </Modal>
  );
}
