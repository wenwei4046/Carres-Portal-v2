import { useMemo, useState } from "react";
import { rm } from "@/lib/format-currency";
import { fmtDate } from "@/lib/fmt-date";
import { useOrders, useOutlets, usePrincipalDealers } from "@/lib/queries";
import type { DealerListItem } from "./components/DealerRow";
import DealerOrderDetail from "@/pages/dealer/DealerOrderDetail";

/**
 * Principal · Orders — read/trace across ALL dealers. Reuses `useOrders`
 * (RLS already returns every order to a principal) for the list and the
 * dealer-side `DealerOrderDetail` (in `readOnly` mode — no Edit/Cancel/Proceed)
 * for the detail drawer. Shows the owning dealer + outlet per row since the
 * principal sees across the whole network. No backend change — view only.
 */
const STATUS_STYLE: Record<string, string> = {
  place: "bg-base-100 text-base-700",
  proceed_order: "bg-signature-50 text-primary",
  delivered: "bg-success-soft text-success",
  cancelled: "bg-base-100 text-base-400 line-through",
};

export default function PrincipalOrders() {
  const { data, isLoading, error } = useOrders();
  const { data: outletsData } = useOutlets();
  const { data: dealersData } = usePrincipalDealers();
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const dealerName = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of (dealersData?.dealers ?? []) as DealerListItem[]) m.set(d.id, d.name);
    return m;
  }, [dealersData]);
  const outletName = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of outletsData?.outlets ?? []) m.set(o.id, o.name);
    return m;
  }, [outletsData]);

  const orders = useMemo(() => {
    const all = data?.orders ?? [];
    if (!q.trim()) return all;
    const needle = q.toLowerCase();
    return all.filter(
      (o) =>
        String(o.so).includes(needle) ||
        o.customer.name.toLowerCase().includes(needle) ||
        (dealerName.get(o.dealerId) ?? "").toLowerCase().includes(needle),
    );
  }, [data, q, dealerName]);

  return (
    <div className="p-8 max-w-[1100px] mx-auto">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <p className="t-micro text-base-400">Principal · oversight</p>
          <h1 className="t-h1">Orders</h1>
          <p className="t-small text-base-500 mt-1">Every order across all dealers — trace only.</p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search SO / customer / dealer…"
          className="rounded-md border border-base-300 bg-white px-3 py-2 t-small w-64"
          data-testid="principal-orders-search"
        />
      </div>

      <div className="bg-card border border-base-200 rounded-lg overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-base-200 t-tiny uppercase tracking-wide text-base-500">
              <th className="px-4 py-2.5 font-semibold">SO</th>
              <th className="px-4 py-2.5 font-semibold">Customer</th>
              <th className="px-4 py-2.5 font-semibold">Dealer · Outlet</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold text-right">Total</th>
              <th className="px-4 py-2.5 font-semibold">Placed</th>
            </tr>
          </thead>
          <tbody data-testid="principal-orders-rows">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 t-small text-base-500">Loading orders…</td></tr>
            )}
            {error && (
              <tr><td colSpan={6} className="px-4 py-6 t-small text-danger">{(error as Error).message}</td></tr>
            )}
            {!isLoading && !error && orders.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 t-small text-base-500">No orders.</td></tr>
            )}
            {orders.map((o) => (
              <tr
                key={o.id}
                onClick={() => setOpenId(o.id)}
                className="border-t border-base-100 hover:bg-base-50 cursor-pointer"
              >
                <td className="px-4 py-2.5 font-mono t-small">SO-{o.so}</td>
                <td className="px-4 py-2.5 t-small">{o.customer.name || "—"}</td>
                <td className="px-4 py-2.5 t-small text-base-600">
                  {dealerName.get(o.dealerId) ?? "—"}
                  {o.outletId && outletName.get(o.outletId) ? ` · ${outletName.get(o.outletId)}` : ""}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 t-tiny font-semibold ${STATUS_STYLE[o.status] ?? "bg-base-100 text-base-600"}`}>
                    {o.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono t-small text-right">{rm(o.totalAmount ?? 0)}</td>
                <td className="px-4 py-2.5 t-small text-base-500">{fmtDate(o.placedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId && <DealerOrderDetail id={openId} readOnly onClose={() => setOpenId(null)} />}
    </div>
  );
}
