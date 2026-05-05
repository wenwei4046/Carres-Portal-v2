import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { qk } from "@/lib/queries";
import { apiFetch } from "@/lib/api";
import PartnerRequestForDeliveryDialog from "./components/PartnerRequestForDeliveryDialog";

/**
 * PartnerPickupsPage — the LP's per-leg work queue. Replaces the Task 18
 * stub with the real listing wired to `GET /api/partner/pickups` (Task 24).
 *
 * Each row shows:
 *   - PO id
 *   - `sup_status` chip (low-effort styling for now — Task 28+ may swap in a
 *     dedicated chip component if the LP-side enum diverges from logistics)
 *   - "RFD pending" amber indicator when logistics has fired the RFD but the
 *     LP hasn't accepted/rejected yet (`request_for_delivery_at IS NOT NULL`
 *     AND both `partner_accepted_at` AND `partner_rejected_at` are NULL)
 *   - Action button that opens `PartnerRequestForDeliveryDialog` (a stub in
 *     Task 26; real Accept/Reject UI lands in Task 28)
 *
 * Note: `qty` does NOT exist on `purchase_orders` — Task 6 confirmed this.
 * The Row type below intentionally omits it.
 */
type Row = {
  id: string;
  sup_status: string;
  request_for_delivery_at: string | null;
  partner_accepted_at: string | null;
  partner_rejected_at: string | null;
  confirm_delivery_date: string | null;
};

export default function PartnerPickupsPage() {
  const { data: rows, isLoading } = useQuery({
    queryKey: qk.partner.pickups(),
    queryFn: () => apiFetch<Row[]>("/api/partner/pickups"),
  });
  const [openId, setOpenId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="px-9 py-8 pb-14 text-[13px] text-base-600">Loading…</div>
    );
  }

  return (
    <div className="px-9 py-8 pb-14 space-y-6">
      <div>
        <div className="kicker">LP · Pickups</div>
        <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-tight font-semibold">
          Pickups
        </h1>
      </div>

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
              <th className="text-left p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                RFD
              </th>
              <th className="text-left p-3 text-[11px] uppercase tracking-[0.18em] font-semibold text-base-600">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => {
              const rfdPending =
                !!r.request_for_delivery_at &&
                !r.partner_accepted_at &&
                !r.partner_rejected_at;
              return (
                <tr key={r.id} className="border-b border-base-200 last:border-0">
                  <td className="p-3 text-[13px] font-medium text-base-900">
                    {r.id}
                  </td>
                  <td className="p-3">
                    <span className="inline-block text-[9px] font-bold uppercase tracking-[0.12em] py-[3px] px-[7px] border border-base-300 rounded-[3px] text-base-600">
                      {r.sup_status}
                    </span>
                  </td>
                  <td className="p-3 text-[12px]">
                    {rfdPending && (
                      <span className="text-warning font-semibold">
                        RFD pending
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-[12px]">
                    {rfdPending && (
                      <button
                        className="underline text-base-700 hover:text-base-900"
                        onClick={() => setOpenId(r.id)}
                      >
                        Accept / Reject
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openId && (
        <PartnerRequestForDeliveryDialog
          poId={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
