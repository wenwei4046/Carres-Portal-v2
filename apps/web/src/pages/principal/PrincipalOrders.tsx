import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { qk } from "@/lib/queries";
import { apiFetch } from "@/lib/api";

/**
 * Phase 10 · Principal · All orders — `reference/proto/principal-views.jsx`
 * L4-76 pixel parity. Cross-dealer feed with 3 filters (search + dealer
 * dropdown + status tab strip). Read-only.
 */

type OrderRow = {
  id: string;
  so: number;
  dealerId: string | null;
  dealerName: string | null;
  status: "place" | "proceed_order" | "delivered" | "cancelled";
  customerName: string | null;
  paid: number;
  total: number;
  qtyTotal: number;
  placedAt: string | null;
};

type DealerOpt = { id: string; name: string };

const STATUS_TABS = ["all", "place", "proceed_order", "delivered", "cancelled"] as const;

export default function PrincipalOrders() {
  const [dealerFilter, setDealerFilter] = useState("all");
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_TABS)[number]>("all");
  const [search, setSearch] = useState("");

  const queryStr = useMemo(() => {
    const p = new URLSearchParams();
    if (dealerFilter !== "all") p.set("dealer", dealerFilter);
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (search.trim()) p.set("q", search.trim());
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [dealerFilter, statusFilter, search]);

  const { data, isLoading } = useQuery<{ orders: OrderRow[] }>({
    queryKey: qk.principal.orders({ dealer: dealerFilter, status: statusFilter, q: search }),
    queryFn: () => apiFetch(`/api/principal/orders${queryStr}`),
  });
  const orders = data?.orders ?? [];

  // Cheap dealer list — derive from the dashboard query the principal app
  // already runs, OR fall back to deriving from rows we just fetched.
  const dealersFromRows = useMemo<DealerOpt[]>(() => {
    const map = new Map<string, string>();
    orders.forEach((o) => {
      if (o.dealerId && o.dealerName) map.set(o.dealerId, o.dealerName);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  return (
    <div className="px-9 py-8 pb-14">
      <div className="mb-[22px]">
        <div className="kicker">HQ · Operations</div>
        <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-[-0.025em] font-semibold">
          Every order, every dealer
        </h1>
        <div className="text-[13px] text-base-600 mt-1.5">
          {orders.length} order{orders.length !== 1 ? "s" : ""}. Read-only.
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2.5 mb-3.5 flex-wrap">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SO number or customer name…"
          className="flex-1 min-w-[220px] px-3 py-2 border border-base-200 rounded text-[13px] bg-white outline-none focus:border-base-700"
        />
        <select
          value={dealerFilter}
          onChange={(e) => setDealerFilter(e.target.value)}
          className="px-3 py-2 border border-base-200 rounded text-[13px] bg-white"
        >
          <option value="all">All dealers</option>
          {dealersFromRows.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <div className="flex gap-1 p-1 bg-base-100 rounded">
          {STATUS_TABS.map((k) => (
            <button
              key={k}
              onClick={() => setStatusFilter(k)}
              className={`px-3 py-1.5 text-[11.5px] rounded cursor-pointer capitalize ${
                statusFilter === k
                  ? "bg-white text-base-900 font-semibold"
                  : "text-base-600 font-medium"
              }`}
            >
              {k.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-base-200 rounded overflow-auto">
        <table className="w-full border-collapse text-[13px]" style={{ minWidth: 720 }}>
          <thead>
            <tr className="bg-base-50 border-b border-base-200">
              <Th>SO</Th>
              <Th>Dealer</Th>
              <Th>Customer</Th>
              <Th>Items</Th>
              <Th right>Total</Th>
              <Th right>Paid</Th>
              <Th>Status</Th>
              <Th>Placed</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8} className="p-10 text-center text-[12px] text-base-500">Loading…</td></tr>
            )}
            {!isLoading && orders.length === 0 && (
              <tr><td colSpan={8} className="p-10 text-center text-[12px] text-base-500">No orders match those filters.</td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-base-100">
                <td className="px-4 py-2.5 font-mono">
                  <strong>SO-{o.so}</strong>
                </td>
                <td className="px-4 py-2.5 text-base-700">{o.dealerName ?? "—"}</td>
                <td className="px-4 py-2.5">{o.customerName ?? "—"}</td>
                <td className="px-4 py-2.5 text-base-600 text-[12px]">
                  {o.qtyTotal} item{o.qtyTotal !== 1 ? "s" : ""}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold font-mono">
                  RM {o.total.toLocaleString()}
                </td>
                <td className={`px-4 py-2.5 text-right font-mono ${o.paid >= o.total ? "text-success" : "text-primary"}`}>
                  RM {o.paid.toLocaleString()}
                </td>
                <td className="px-4 py-2.5">
                  <StatusChip status={o.status} />
                </td>
                <td className="px-4 py-2.5 text-base-500 text-[11.5px]">
                  {o.placedAt ? o.placedAt.slice(0, 10) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-base-500 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function StatusChip({ status }: { status: OrderRow["status"] }) {
  return (
    <span className="inline-block text-[10px] px-2 py-[2px] bg-base-100 rounded uppercase font-semibold tracking-[0.05em] text-base-700">
      {status.replace("_", " ")}
    </span>
  );
}
