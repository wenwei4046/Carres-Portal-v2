import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  deliveryOrderStatusOf,
  type DeliveryHandoverKind,
  type DeliveryOrderStatusKind,
  type OrderActionTone,
} from "@carres/shared";
import StatusPill from "@/components/kit/StatusPill";
import { fmtDate } from "@/lib/fmt-date";
import type {
  DeliveryOrderAttemptRow,
  DeliveryOrdersRegisterPayload,
} from "@/lib/queries";

const STATUS_TONE: Record<DeliveryOrderStatusKind, OrderActionTone> = {
  created: "neutral",
  out_for_delivery: "info",
  delivered: "success",
  exception: "warning",
  cancelled: "neutral",
};

/**
 * The Sales Order's complete, read-only relationship to Delivery documents.
 * Delivery owns every row and every write; this block only lets Sales find
 * the documents this order produced. `orders.do_number` is never consulted.
 */
export default function SalesOrderDeliveryOrdersBlock({
  payload,
}: {
  payload: DeliveryOrdersRegisterPayload;
}) {
  const rows = useMemo(() => {
    const attemptsByDo = new Map<string, DeliveryOrderAttemptRow[]>();
    for (const attempt of payload.attempts) {
      if (!attempt.do_number) continue;
      const attempts = attemptsByDo.get(attempt.do_number) ?? [];
      attempts.push(attempt);
      attemptsByDo.set(attempt.do_number, attempts);
    }
    const handoversByDo = new Map<string, DeliveryHandoverKind[]>();
    for (const handover of payload.handoverEvents) {
      const handovers = handoversByDo.get(handover.delivery_order_id) ?? [];
      handovers.push(handover.kind);
      handoversByDo.set(handover.delivery_order_id, handovers);
    }

    return [...payload.deliveryOrders]
      .sort((a, b) => b.issued_at.localeCompare(a.issued_at))
      .map((deliveryOrder) => ({
        deliveryOrder,
        status: deliveryOrderStatusOf({
          voidedAt: deliveryOrder.voided_at,
          voidReason: deliveryOrder.void_reason,
          attempts: (attemptsByDo.get(deliveryOrder.do_number) ?? []).map((attempt) => ({
            result: attempt.result,
            reasonKey: attempt.reason_key,
            recordedAt: attempt.recorded_at,
          })),
          handoverEvents: (handoversByDo.get(deliveryOrder.id) ?? []).map((kind) => ({ kind })),
        }),
      }));
  }, [payload]);

  if (rows.length === 0) {
    return (
      <div className="rounded-control bg-kit-slate-3 px-3 py-2">
        <p className="text-body font-semibold text-base-900">No delivery order yet</p>
        <p className="mt-0.5 text-label text-base-600">
          The system creates one when the delivery requirements are met.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-kit-slate-5" data-testid="sales-order-delivery-orders">
      {rows.map(({ deliveryOrder, status }) => (
        <div key={deliveryOrder.id} className="grid gap-1 py-2 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <Link
              to={`/operation/delivery-orders/${encodeURIComponent(deliveryOrder.do_number)}`}
              className="font-mono text-body font-semibold text-kit-blue-11 underline-offset-2 hover:underline"
            >
              {deliveryOrder.do_number}
            </Link>
            <p className="mt-0.5 truncate text-label text-base-600">
              Created {fmtDate(deliveryOrder.issued_at)}
              {deliveryOrder.delivery_date ? ` · Delivery ${fmtDate(deliveryOrder.delivery_date)}` : ""}
              {deliveryOrder.time_slot ? ` · ${deliveryOrder.time_slot}` : ""}
            </p>
          </div>
          <div className="flex min-w-0 items-start gap-2 sm:justify-end">
            <StatusPill tone={STATUS_TONE[status.kind]}>{status.label}</StatusPill>
            {status.reasonLabel ? (
              <span className="max-w-52 truncate text-label text-base-600" title={status.reasonLabel}>
                {status.reasonLabel}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
