import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/queries";
import { apiFetch } from "@/lib/api";

/**
 * PartnerPickupsPage — the LP's per-leg work queue. Replaces the Task 18
 * stub with the real listing wired to `GET /api/partner/pickups` (Task 24).
 *
 * Each row shows:
 *   - PO id
 *   - `sup_status` chip (low-effort styling for now — Task 28+ may swap in a
 *     dedicated chip component if the LP-side enum diverges from logistics)
 *
 * Phase 4.5 Chunk 2 Sprint C (migrations 0052/0053): the 4 customer-leg
 * columns (`confirm_delivery_date`, `request_for_delivery_at`,
 * `partner_accepted_at`, `partner_rejected_at`) were dropped from
 * `purchase_orders` — they live on `order_supplier_threads` now. The partner
 * role is procurement-leg only; the prior PO-sourced "RFD pending" indicator
 * + Accept/Reject dialog launcher were removed in T8'. Customer-leg RFD UI
 * for partners is a Chunk 2 carry-forward — when it lands, it must read
 * thread state via the thread-aware accept-rfd / reject-rfd endpoints
 * (`{ threadId }` body), not from this PO list.
 *
 * Note: `qty` does NOT exist on `purchase_orders` — Task 6 confirmed this.
 * The Row type below intentionally omits it.
 */
type Row = {
  id: string;
  sup_status: string;
};

export default function PartnerPickupsPage() {
  const { data: rows, isLoading } = useQuery({
    queryKey: qk.partner.pickups(),
    queryFn: () => apiFetch<Row[]>("/api/partner/pickups"),
  });

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
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
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
    </div>
  );
}
