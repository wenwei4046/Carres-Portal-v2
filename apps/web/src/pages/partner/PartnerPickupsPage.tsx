import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, usePartnerToDeliver, type PartnerToDeliverRow } from "@/lib/queries";
import { apiFetch } from "@/lib/api";
import PartnerRequestForDeliveryDialog from "./components/PartnerRequestForDeliveryDialog";
import PODUploadDialog from "./components/PODUploadDialog";

/**
 * Partner · Deliveries — customer-leg work queue.
 *
 * Renamed + scoped 2026-05-10 (Loo): the procurement-leg flow
 * (supplier → warehouse) lives on the new PartnerFactoryPickupsPage. This
 * page is now strictly the customer-leg (warehouse → customer):
 *
 *   1. **RFD Pending** — customer-leg threads where Logistics raised an
 *      RFD against this partner and the partner hasn't responded.
 *      Source: GET /api/partner/pickups/rfd-pending → wraps the
 *      `logistics_partner_rfd_pending` SECURITY DEFINER RPC (migration 0059).
 *
 *   2. **In Transit** — customer-leg threads at logistics_stage='dispatched'.
 *      Each row gets a "Mark Delivered" button that opens PODUploadDialog.
 *      `partner_attach_pod` (Phase 7 Sprint 1) advances thread to 'delivered'
 *      and the row drops off this list.
 *
 * The old "All Pickups" section was procurement-leg duplication and got
 * removed in the split — that data now lives on /factory-pickups with a
 * proper 3-column kanban + per-stage actions per the proto reference.
 */
type RfdPendingRow = {
  thread_id: string;
  order_id: string;
  po_id: string;
  customer_name: string;
  request_for_delivery_at: string;
  confirm_delivery_date: string | null;
};

export default function PartnerPickupsPage() {
  const qc = useQueryClient();
  const [openRfd, setOpenRfd] = useState<{ threadId: string; poLabel: string } | null>(null);
  const [openPod, setOpenPod] = useState<PartnerToDeliverRow | null>(null);
  const { data: toDeliverRows, isLoading: toDeliverLoading } = usePartnerToDeliver();

  const { data: rfdRows, isLoading: rfdLoading } = useQuery({
    queryKey: qk.partner.rfdPending(),
    queryFn: () => apiFetch<RfdPendingRow[]>("/api/partner/pickups/rfd-pending"),
  });

  if (rfdLoading || toDeliverLoading) {
    return (
      <div className="px-9 py-8 pb-14 text-[13px] text-base-600">Loading…</div>
    );
  }

  const closeRfdDialog = () => {
    qc.invalidateQueries({ queryKey: qk.partner.rfdPending() });
    setOpenRfd(null);
  };

  return (
    <div className="px-9 py-8 pb-14 space-y-6">
      <div>
        <div className="kicker">LP · Deliveries</div>
        <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-tight font-semibold">
          Deliveries
        </h1>
        <div className="text-[13px] text-base-600 mt-1">
          Warehouse → customer leg. For supplier pickups (factory →
          warehouse), see <strong>Factory pickups</strong>.
        </div>
      </div>

      {/* Section 1: RFD Pending */}
      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-base-700">
          RFD Pending
        </h2>
        <div className="bg-white border border-base-200 rounded-md overflow-hidden">
          {(rfdRows ?? []).length === 0 ? (
            <div className="p-4 text-[12px] text-base-500">
              No RFD requests waiting for your response.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-base-200 bg-base-50">
                  <th className="text-left p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                    PO
                  </th>
                  <th className="text-left p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                    Customer
                  </th>
                  <th className="text-left p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                    RFD raised
                  </th>
                  <th className="text-left p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                    Confirm delivery
                  </th>
                  <th className="text-right p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {(rfdRows ?? []).map((r) => (
                  <tr key={r.thread_id} className="border-b border-base-200 last:border-0">
                    <td className="p-3 text-[13px] font-medium text-base-900">{r.po_id}</td>
                    <td className="p-3 text-[13px] text-base-700">{r.customer_name}</td>
                    <td className="p-3 text-[12px] text-base-600">
                      {formatDateTime(r.request_for_delivery_at)}
                    </td>
                    <td className="p-3 text-[12px] text-base-600">
                      {r.confirm_delivery_date ?? "—"}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() =>
                          setOpenRfd({ threadId: r.thread_id, poLabel: r.po_id })
                        }
                        className="px-3 py-1.5 bg-accent text-white rounded text-[12px] font-medium"
                      >
                        View RFD
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Section 2: In Transit (customer-leg dispatched threads) */}
      <section className="space-y-2" data-testid="partner-in-transit-section">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-base-700">
          In Transit
        </h2>
        <div className="bg-white border border-base-200 rounded-md overflow-hidden">
          {(toDeliverRows ?? []).length === 0 ? (
            <div className="p-4 text-[12px] text-base-500">
              Nothing in transit. Accepted RFDs will surface here once Logistics dispatches.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-base-200 bg-base-50">
                  <th className="text-left p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                    PO
                  </th>
                  <th className="text-left p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                    Customer
                  </th>
                  <th className="text-left p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                    Confirm delivery
                  </th>
                  <th className="text-right p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {(toDeliverRows ?? []).map((r) => (
                  <tr key={r.thread_id} className="border-b border-base-200 last:border-0">
                    <td className="p-3 text-[13px] font-medium text-base-900">{r.po_id ?? "—"}</td>
                    <td className="p-3 text-[13px] text-base-700">{r.customer_name}</td>
                    <td className="p-3 text-[12px] text-base-600">
                      {r.confirm_delivery_date ?? "—"}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setOpenPod(r)}
                        className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-[12px] font-medium"
                        data-testid={`mark-delivered-${r.thread_id}`}
                      >
                        Mark Delivered
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {openPod && (
        <PODUploadDialog row={openPod} onClose={() => setOpenPod(null)} />
      )}

      {openRfd && (
        <PartnerRequestForDeliveryDialog
          threadId={openRfd.threadId}
          poLabel={openRfd.poLabel}
          onClose={closeRfdDialog}
        />
      )}
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
