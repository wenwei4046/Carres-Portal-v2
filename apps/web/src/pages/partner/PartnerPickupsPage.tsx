import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, usePartnerToDeliver, type PartnerToDeliverRow } from "@/lib/queries";
import { apiFetch } from "@/lib/api";
import PartnerRequestForDeliveryDialog from "./components/PartnerRequestForDeliveryDialog";
import PODUploadDialog from "./components/PODUploadDialog";

/**
 * PartnerPickupsPage — the LP's per-leg work queue. Two sections:
 *
 *   1. **RFD Pending** (top) — customer-leg threads where Logistics has raised
 *      a Request-For-Delivery and the partner has not yet accepted or rejected.
 *      Source: `GET /api/partner/pickups/rfd-pending` → wraps the SECURITY
 *      DEFINER RPC `logistics_partner_rfd_pending` (migration 0059). Each row
 *      surfaces a "View RFD" button that mounts `PartnerRequestForDeliveryDialog`
 *      against `{ threadId, poLabel }`. After Accept / Reject, the row
 *      disappears (dialog success → mutation invalidates pickups + dashboard;
 *      this page additionally invalidates `rfd-pending` on dialog close so the
 *      list updates without a manual refetch).
 *
 *   2. **All Pickups** (below) — the existing procurement-leg PO listing
 *      sourced from `GET /api/partner/pickups` (rows where the partner is
 *      `purchase_orders.procurement_partner_id` per migration 0052 rename).
 *
 * Phase 4.5 Chunk 2 carry-forward `phase-4.5-chunk-2-partner-rfd-page-rebuild`:
 * Sprint C migration 0052 dropped the 4 customer-leg columns
 * (`confirm_delivery_date`, `request_for_delivery_at`, `partner_accepted_at`,
 * `partner_rejected_at`) from `purchase_orders` — they live on
 * `order_supplier_threads` now (migration 0049 + backfill 0050). The Chunk 1
 * PO-sourced "RFD pending" indicator + Accept/Reject button were removed in
 * T8' because the columns no longer existed; this rebuild restores the same
 * UX surface but reads from threads via the new RPC.
 *
 * Out of scope for this carry-forward (Phase 7+): accepted-but-not-yet-delivered
 * state, in-transit indicator, POD upload on delivery. The `sup_status` chip
 * on the procurement-leg list is unchanged.
 */
type ProcurementPoRow = {
  id: string;
  sup_status: string;
};

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

  const { data: poRows, isLoading: posLoading } = useQuery({
    queryKey: qk.partner.pickups(),
    queryFn: () => apiFetch<ProcurementPoRow[]>("/api/partner/pickups"),
  });

  const { data: rfdRows, isLoading: rfdLoading } = useQuery({
    queryKey: qk.partner.rfdPending(),
    queryFn: () => apiFetch<RfdPendingRow[]>("/api/partner/pickups/rfd-pending"),
  });

  if (posLoading || rfdLoading || toDeliverLoading) {
    return (
      <div className="px-9 py-8 pb-14 text-[13px] text-base-600">Loading…</div>
    );
  }

  const closeRfdDialog = () => {
    // Refetch the RFD-pending list so an accepted/rejected thread drops off
    // immediately without a manual reload. Cancel-close also fires this — the
    // refetch is cheap and keeps the page invariant simple ("list reflects
    // server state on every dialog close").
    qc.invalidateQueries({ queryKey: qk.partner.rfdPending() });
    setOpenRfd(null);
  };

  return (
    <div className="px-9 py-8 pb-14 space-y-6">
      <div>
        <div className="kicker">LP · Pickups</div>
        <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-tight font-semibold">
          Pickups
        </h1>
      </div>

      {/* Section 1: RFD Pending (customer-leg) */}
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

      {/* Section 2: In Transit — customer-leg threads at logistics_stage='dispatched'.
          Phase 7 Sprint 2: each row gets a "Mark Delivered" button that opens
          PODUploadDialog. After successful POD upload, partner_attach_pod RPC
          advances the thread to 'delivered' and the row drops off this list. */}
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

      {/* Section 3: All Pickups (procurement-leg) */}
      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-base-700">
          All Pickups
        </h2>
        <div className="bg-white border border-base-200 rounded-md overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-base-200 bg-base-50">
                <th className="text-left p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                  PO
                </th>
                <th className="text-left p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {(poRows ?? []).map((r) => (
                <tr key={r.id} className="border-b border-base-200 last:border-0">
                  <td className="p-3 text-[13px] font-medium text-base-900">
                    {r.id}
                  </td>
                  <td className="p-3">
                    <span className="inline-block text-[9px] font-bold uppercase tracking-[0.12em] py-[3px] px-[7px] border border-base-300 rounded-[3px] text-base-600">
                      {r.sup_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  // Minimal ISO → "YYYY-MM-DD HH:mm" formatter to keep the row dense without a
  // dayjs/date-fns dependency. Times are server-side UTC; the partner reads
  // these to gauge urgency, exact timezone fidelity isn't load-bearing.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
