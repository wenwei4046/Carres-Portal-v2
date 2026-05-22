import { useState } from "react";
import { toast } from "sonner";
import {
  useLpAcceptOrder,
  usePartnerIncomingOrders,
  type PartnerIncomingOrder,
} from "@/lib/queries";
import { ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import LpRejectDialog from "./components/LpRejectDialog";

/**
 * Partner · Incoming — Migration 0147 (item h, 2026-05-23).
 *
 * Shows orders Operation has just picked this LP for at Accept Proceed time.
 * Each row offers two actions:
 *
 *   • Accept  → one-tap; lp_accept_order RPC stamps partner_accepted_at.
 *   • Reject  → opens LpRejectDialog; lp_reject_order RPC needs a reason.
 *
 * Polls every 15s so the LP doesn't need to refresh. After accept/reject the
 * order drops out of the list (mutation invalidates the incoming query).
 */
export default function PartnerIncoming() {
  const incomingQ = usePartnerIncomingOrders();
  const [rejectFor, setRejectFor] = useState<
    { orderId: string; so: number } | null
  >(null);

  const orders = incomingQ.data?.orders ?? [];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-base-500 mb-1">
          Partner
        </p>
        <h1 className="text-2xl font-semibold">Incoming</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Orders Operation has just assigned to you. Accept to confirm
          you&rsquo;ll handle the delivery, or reject with a reason and the
          order goes back to Operation to pick another LP.
        </p>
      </div>

      {incomingQ.isLoading ? (
        <div className="rounded border border-dashed border-base-200 bg-card py-16 text-center text-[12px] text-base-500">
          Loading…
        </div>
      ) : incomingQ.isError ? (
        <div className="rounded border border-destructive/30 bg-destructive/5 p-4 text-[12px] text-destructive">
          Couldn&rsquo;t load incoming orders.
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => void incomingQ.refetch()}
          >
            Retry
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded border border-dashed border-base-200 bg-card py-16 text-center">
          <div className="text-[12px] text-base-500 uppercase tracking-[0.14em] mb-2">
            Empty
          </div>
          <div className="text-[14px] text-base-700">
            No incoming orders right now.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((o) => (
            <IncomingRow
              key={o.id}
              order={o}
              onReject={() => setRejectFor({ orderId: o.id, so: o.so })}
            />
          ))}
        </div>
      )}

      {rejectFor && (
        <LpRejectDialog
          orderId={rejectFor.orderId}
          so={rejectFor.so}
          onClose={() => setRejectFor(null)}
        />
      )}
    </div>
  );
}

interface IncomingRowProps {
  order: PartnerIncomingOrder;
  onReject: () => void;
}

interface ApiErrorBody {
  code?: string;
  message?: string;
}
function readErrorBody(err: ApiError): ApiErrorBody {
  return (err.body ?? {}) as ApiErrorBody;
}

function IncomingRow({ order, onReject }: IncomingRowProps) {
  const accept = useLpAcceptOrder(order.id);

  async function handleAccept() {
    try {
      await accept.mutateAsync();
      toast.success(`#${order.so} accepted`);
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const body = readErrorBody(e);
        if (body.code === "already_accepted") {
          toast.error("Already accepted — refresh");
        } else if (body.code === "order_rejected") {
          toast.error("Order is rejected state — refresh");
        } else {
          toast.error(e.message || "Accept failed");
        }
      } else {
        toast.error(e instanceof Error ? e.message : "Accept failed");
      }
    }
  }

  const requestedAt = order.request_for_delivery_at
    ? fmtDate(order.request_for_delivery_at)
    : "—";
  const deliveryDate = order.delivery_date ? fmtDate(order.delivery_date) : "Date TBD";

  return (
    <div
      className="bg-card border border-border rounded-[4px] p-4 flex items-start gap-4"
      data-testid={`incoming-row-${order.so}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-mono text-[13px] font-semibold text-base-900">
            #{order.so}
          </span>
          <span className="text-[10px] text-base-500 font-mono">
            assigned {requestedAt}
          </span>
        </div>
        <div className="text-[14px] font-medium text-foreground">
          {order.customer_name}
        </div>
        {order.customer_phone && (
          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
            {order.customer_phone}
          </div>
        )}
        {order.customer_address && (
          <div className="text-[12px] text-muted-foreground mt-1 line-clamp-2">
            {order.customer_address}
          </div>
        )}
        <div className="text-[11px] text-base-700 mt-2">
          <span className="font-semibold uppercase tracking-[0.08em] text-base-500 mr-2">
            Delivery
          </span>
          {deliveryDate}
          {order.warehouses?.name && (
            <>
              <span className="mx-2 text-base-300">·</span>
              <span className="font-semibold uppercase tracking-[0.08em] text-base-500 mr-2">
                From
              </span>
              {order.warehouses.name}
            </>
          )}
        </div>
        {order.dealers?.name && (
          <div className="text-[11px] text-muted-foreground mt-1">
            Dealer: {order.dealers.name}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={handleAccept}
          disabled={accept.isPending}
          className="text-[12px] px-3 py-1.5 rounded bg-primary text-primary-foreground font-semibold disabled:opacity-40 min-w-[90px]"
          data-testid={`incoming-accept-${order.so}`}
        >
          {accept.isPending ? "Accepting…" : "Accept"}
        </button>
        <button
          type="button"
          onClick={onReject}
          className="text-[12px] px-3 py-1.5 rounded border border-destructive/40 text-destructive font-semibold hover:bg-destructive/5 min-w-[90px]"
          data-testid={`incoming-reject-${order.so}`}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
