// design-standard: not-a-list-page — unattributed-orders worklist rendered
// inside the Commission page; the page header lives in HrApp.
import { useState } from "react";
import { toast } from "sonner";
import Btn from "@/components/Btn";
import { fieldCls } from "@/components/Field";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { useHrAssignSalesperson, useHrReport } from "@/lib/queries";

/**
 * The month's orders that have NO salesperson (0244/0245).
 * Assigning is the audited hr_assign_salesperson RPC; on success the whole
 * ["hr"] cache invalidates so the commission report re-derives.
 *
 * Was its own Attribution tab until Loo retired it (2026-07-27): the list is
 * empty on a healthy month, so a permanent rail item cost a click every day to
 * say "nothing to do". It now renders INSIDE Commission → Earnings, directly
 * under the under-count warning, and only while something is unassigned —
 * which is also where the blocking `attribution` close-check complains, so the
 * problem and its fix are on one screen. Deleting it outright would have left
 * that check with no UI at all: it refuses the month close, and nothing else
 * in the app calls `hr_assign_salesperson`.
 */
export default function HrUnattributedWorklist({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const { data, isLoading, isError } = useHrReport(year, month);
  const assign = useHrAssignSalesperson();
  // per-order picked salesperson (uncommitted until Assign is pressed)
  const [picked, setPicked] = useState<Record<string, string>>({});
  // the row whose Assign is in flight (so only that button spins/disables)
  const [assigningId, setAssigningId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="py-12 text-[13px] text-base-500">Loading orders without a salesperson…</div>;
  }
  if (isError || !data) {
    return (
      <div className="py-12 text-[13px] text-danger">
        Failed to load the orders without a salesperson. Refresh to retry.
      </div>
    );
  }

  const { unattributed, staff } = data;

  // Nothing to assign = nothing to say. The old tab printed a green "all clear"
  // card because a rail item always had to render something; inside Commission
  // the healthy month is simply silent — the page above already reports it.
  if (unattributed.length === 0) return null;

  const handleAssign = (orderId: string, so: number) => {
    const salespersonId = picked[orderId];
    if (!salespersonId) return;
    setAssigningId(orderId);
    assign.mutate(
      { orderId, salespersonId },
      {
        onSuccess: () => {
          toast.success(`SO-${so} assigned`);
        },
        onError: (e) => {
          toast.error(e.message || "Assign failed");
        },
        onSettled: () => setAssigningId(null),
      },
    );
  };

  return (
    <div className="bg-white border border-base-200 rounded-[12px] overflow-hidden">
      <table className="w-full table-fixed">
        <colgroup>
          <col className="w-[11%]" />
          <col className="w-[16%]" />
          <col />
          <col className="w-[18%]" />
          <col className="w-[12%]" />
          <col className="w-[26%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-base-200">
            <th className="text-left px-3 py-2 text-[12px] font-semibold text-base-900">
              Order
            </th>
            <th className="text-left px-2 py-2 text-[12px] font-semibold text-base-900">
              Placed
            </th>
            <th className="text-left px-2 py-2 text-[12px] font-semibold text-base-900">
              Customer
            </th>
            <th className="text-left px-2 py-2 text-[12px] font-semibold text-base-900">
              Store
            </th>
            <th className="text-right px-2 py-2 text-[12px] font-semibold text-base-900">
              Amount
            </th>
            <th className="text-left px-2 py-2 text-[12px] font-semibold text-base-900">
              Salesperson
            </th>
          </tr>
        </thead>
        <tbody>
          {unattributed.map((o) => {
            // only active staff of the SAME store can take the credit
            const options = staff.filter(
              (s) => s.active && s.dealerId === o.dealerId,
            );
            const busy = assigningId === o.orderId;
            return (
              <tr key={o.orderId} className="h-11 border-b border-base-100">
                <td className="px-3 font-mono text-[13px] font-semibold whitespace-nowrap">
                  SO-{o.so}
                </td>
                <td className="px-2 text-[12px] text-base-900 whitespace-nowrap truncate">
                  {fmtDate(o.placedAt)}
                </td>
                <td className="px-2 text-[13px] text-base-900 whitespace-nowrap truncate">
                  {o.customerName || "—"}
                </td>
                <td className="px-2 text-[12px] text-base-700 whitespace-nowrap truncate">
                  {o.storeName || "—"}
                </td>
                <td className="px-2 text-right text-[13px] t-num whitespace-nowrap">
                  {rm(o.amount)}
                </td>
                <td className="px-2">
                  <div className="flex items-center gap-1.5">
                    <select
                      className={`${fieldCls} min-w-0 flex-1`}
                      aria-label={`Salesperson for SO-${o.so}`}
                      value={picked[o.orderId] ?? ""}
                      onChange={(e) =>
                        setPicked((p) => ({
                          ...p,
                          [o.orderId]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Pick a salesperson…</option>
                      {options.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.outletName ? ` · ${s.outletName}` : ""}
                        </option>
                      ))}
                    </select>
                    <Btn
                      size="sm"
                      disabled={!picked[o.orderId] || busy}
                      onClick={() => handleAssign(o.orderId, o.so)}
                    >
                      {busy ? "Assigning…" : "Assign"}
                    </Btn>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
