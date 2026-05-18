import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import BDOrderModal from "./BDOrderModal";

/**
 * Phase 10 · BD · Dealer detail page — `reference/proto/bd-dealers.jsx`
 * L94+ pixel parity. Shows the dealer's profile + last 30 orders in a
 * clickable table. Click an order → BDOrderModal opens with full detail.
 */

type DealerDetail = {
  id: string;
  name: string;
  region: string | null;
  contact: string | null;
  status: string;
  joined_date: string | null;
  payment_terms: string | null;
  credit_limit: number | null;
  deposit_balance: number | null;
  order_count: number;
  gmv: number;
  outstanding: number;
};

type OrderRow = {
  id: string;
  so: number;
  status: "place" | "proceed_order" | "delivered" | "cancelled";
  customerName: string | null;
  paid: number;
  total: number;
  qtyTotal: number;
  placedAt: string | null;
  deliveryDate: string | null;
};

export default function BDDealerDetail() {
  const { dealerId } = useParams();
  const [openSo, setOpenSo] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery<{
    dealer: DealerDetail;
    orders: OrderRow[];
  }>({
    queryKey: ["bd", "dealers", dealerId],
    queryFn: () => apiFetch(`/api/bd/dealers/${dealerId}`),
    enabled: !!dealerId,
  });

  if (isLoading) {
    return <div className="px-9 py-8 text-[13px] text-base-600">Loading…</div>;
  }
  if (error || !data) {
    return (
      <div className="px-9 py-8">
        <Link to="/bd/dealers" className="text-[13px] text-base-600 hover:text-base-900">← Back to Dealers</Link>
        <div className="mt-6 text-[13px] text-base-500">Dealer not found.</div>
      </div>
    );
  }
  const { dealer, orders } = data;

  return (
    <div className="px-9 py-8 pb-14">
      <Link
        to="/bd/dealers"
        className="text-[12px] text-base-600 hover:text-base-900 mb-3 inline-block"
      >
        ← Back to Dealers
      </Link>

      <div className="mb-6">
        <div className="kicker">BD · Dealer</div>
        <h1 className="font-display text-[30px] leading-[1.05] mt-1.5 tracking-[-0.025em] font-semibold">
          {dealer.name}
        </h1>
        <div className="text-[13px] text-base-600 mt-1.5">
          {dealer.region ?? "—"}
          {dealer.contact ? ` · ${dealer.contact}` : ""}
          {dealer.joined_date ? ` · joined ${dealer.joined_date}` : ""}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Tile label="Orders" value={`${dealer.order_count}`} />
        <Tile label="GMV" value={`RM ${Math.round(Number(dealer.gmv ?? 0)).toLocaleString()}`} />
        <Tile
          label="Outstanding"
          value={`RM ${Math.round(Number(dealer.outstanding ?? 0)).toLocaleString()}`}
          tone={Number(dealer.outstanding ?? 0) > 0 ? "warn" : undefined}
        />
        <Tile
          label="Deposit"
          value={`RM ${Math.round(Number(dealer.deposit_balance ?? 0)).toLocaleString()}`}
        />
      </div>

      {/* Orders table */}
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-base-500">
        Recent orders ({orders.length})
      </div>
      <div className="bg-white border border-base-200 rounded overflow-auto">
        <table className="w-full border-collapse text-[13px]" style={{ minWidth: 760 }}>
          <thead>
            <tr className="bg-base-50 border-b border-base-200">
              <Th>SO</Th>
              <Th>Customer</Th>
              <Th>Items</Th>
              <Th right>Total</Th>
              <Th right>Paid</Th>
              <Th>Status</Th>
              <Th>Placed</Th>
              <Th>Delivery</Th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan={8} className="p-10 text-center text-[12px] text-base-500">No orders yet for this dealer.</td></tr>
            )}
            {orders.map((o) => (
              <tr
                key={o.id}
                onClick={() => setOpenSo(o.so)}
                className="border-t border-base-100 hover:bg-base-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-mono"><strong>SO-{o.so}</strong></td>
                <td className="px-4 py-3">{o.customerName ?? "—"}</td>
                <td className="px-4 py-3 text-base-600 text-[12px]">
                  {o.qtyTotal} item{o.qtyTotal !== 1 ? "s" : ""}
                </td>
                <td className="px-4 py-3 text-right font-semibold font-mono">
                  RM {o.total.toLocaleString()}
                </td>
                <td className={`px-4 py-3 text-right font-mono ${o.paid >= o.total ? "text-success" : "text-primary"}`}>
                  RM {o.paid.toLocaleString()}
                </td>
                <td className="px-4 py-3"><OrderStatusPill status={o.status} /></td>
                <td className="px-4 py-3 text-base-500 text-[11.5px]">
                  {o.placedAt?.slice(0, 10) ?? "—"}
                </td>
                <td className="px-4 py-3 text-base-500 text-[11.5px]">
                  {o.deliveryDate?.slice(0, 10) ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openSo !== null && <BDOrderModal so={openSo} onClose={() => setOpenSo(null)} />}
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-base-500 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  const colorClass = tone === "warn" ? "text-primary" : "text-base-900";
  return (
    <div className="bg-white border border-base-200 rounded p-4">
      <div className="kicker text-[9px]">{label}</div>
      <div className={`font-display text-[24px] font-semibold mt-1 tracking-[-0.02em] ${colorClass}`}>{value}</div>
    </div>
  );
}

function OrderStatusPill({ status }: { status: OrderRow["status"] }) {
  const map = {
    place:         { l: "Place",        bg: "bg-base-100",      c: "text-base-700" },
    proceed_order: { l: "In progress",  bg: "bg-primary/10",    c: "text-primary" },
    delivered:     { l: "Delivered",    bg: "bg-success-soft",  c: "text-success" },
    cancelled:     { l: "Cancelled",    bg: "bg-base-200",      c: "text-base-700" },
  } as const;
  const m = map[status] ?? map.place;
  return (
    <span className={`inline-block text-[10px] px-2 py-[2px] rounded uppercase font-semibold tracking-[0.06em] ${m.bg} ${m.c}`}>
      {m.l}
    </span>
  );
}
