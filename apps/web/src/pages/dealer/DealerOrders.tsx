import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { type Order, type OrderStatus } from "@carres/shared";
import { useOrders } from "@/lib/queries";
import { proceedBlockers } from "@/lib/order-blockers";
import DealerOrderDetail from "./DealerOrderDetail";

const TABS: { key: OrderStatus; label: string }[] = [
  { key: "place", label: "Place" },
  { key: "proceed_order", label: "Proceed" },
  { key: "delivered", label: "Delivered" },
];

const RM = (n: number) =>
  `RM ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function DealerOrders() {
  const [tab, setTab] = useState<OrderStatus>("place");
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get("open");
  const ordersQ = useOrders(); // single fetch — filter client-side per tab

  // Keep ?open in sync with the modal lifecycle.
  useEffect(() => {
    return () => {
      // No teardown needed; query param is intentionally persistent for deep-linking.
    };
  }, []);

  function openOrder(id: string) {
    setSearchParams((p) => {
      p.set("open", id);
      return p;
    });
  }
  function closeOrder() {
    setSearchParams((p) => {
      p.delete("open");
      return p;
    });
  }

  if (ordersQ.isPending) {
    return <div className="p-9 text-sm text-muted-foreground">Loading orders…</div>;
  }
  if (ordersQ.error) {
    return (
      <div className="p-9">
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Couldn't load orders: {(ordersQ.error as Error).message}
        </p>
      </div>
    );
  }

  const allOrders = ordersQ.data?.orders ?? [];
  const buckets: Record<OrderStatus, Order[]> = {
    place: allOrders.filter((o) => o.status === "place"),
    proceed_order: allOrders.filter((o) => o.status === "proceed_order"),
    delivered: allOrders.filter((o) => o.status === "delivered"),
    cancelled: allOrders.filter((o) => o.status === "cancelled"),
  };
  const list = buckets[tab];

  // KPIs relocated from the old DealerDashboard hero — surfaced here now that
  // the dealer landing page is the POS catalog.
  const inFlight = buckets.place.length + buckets.proceed_order.length;
  const readyToProceed = buckets.place.filter((o) => proceedBlockers(o).length === 0).length;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthValue = allOrders
    .filter((o) => o.placedAt >= monthStart)
    .reduce((s, o) => s + (o.totalAmount ?? 0), 0);

  return (
    <div className="p-9">
      <header className="flex items-start justify-between mb-6 gap-4">
        <div>
          <p className="kicker">Orders</p>
          <h1 className="font-display text-[32px] mt-1.5 tracking-[-0.025em] leading-[1.05]">Your customers' journey</h1>
          <p className="text-[13px] text-base-600 mt-1">
            <span className="font-mono font-semibold text-foreground">{allOrders.length}</span> total · click any row for detail
          </p>
        </div>
        <Link to="/dealer" className="btn-hero whitespace-nowrap">
          + New order
        </Link>
      </header>

      {/* KPI strip — in-flight · this month · ready to proceed (from old dashboard) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Stat label="In flight" value={String(inFlight)} hint="Place + Proceed" />
        <Stat label="This month" value={RM(monthValue)} hint="Orders placed this month" mono />
        <button
          type="button"
          onClick={() => setTab("place")}
          className={`card text-left px-4 py-3 hover:border-primary transition-colors border-l-[3px] ${
            readyToProceed > 0 ? "border-l-success" : "border-l-base-200"
          }`}
        >
          <div
            className={`label ${readyToProceed > 0 ? "text-success" : "text-base-500"}`}
          >
            Ready to proceed
          </div>
          <div className="font-display text-[26px] font-bold mt-0.5 leading-none">
            {readyToProceed}
          </div>
          <div className="t-tiny text-base-500 mt-1">
            {readyToProceed === 0 ? "all in-flight need more info" : "ready to push to operation"}
          </div>
        </button>
      </div>

      <div className="flex gap-1 border-b border-base-200 mb-4">
        {TABS.map((t) => {
          const active = tab === t.key;
          const cnt = buckets[t.key].length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-[18px] py-3 border-b-2 text-[13px] flex items-center gap-2 transition-colors ${
                active
                  ? "border-primary text-base-900 font-semibold"
                  : "border-transparent text-base-500 font-medium hover:text-base-900"
              }`}
            >
              {t.label}
              <span
                className={`font-mono text-[11px] px-1.5 py-0.5 rounded-full ${
                  active ? "bg-signature-50 text-primary" : "bg-base-100 text-base-600"
                }`}
              >
                {cnt}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2.5">
        {list.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-9 text-center text-muted-foreground">
            No orders in <strong>{TABS.find((t) => t.key === tab)?.label}</strong> right now.
          </div>
        )}
        {list.map((o) => (
          <OrderRow key={o.id} order={o} onClick={() => openOrder(o.id)} />
        ))}
      </div>

      {openId && <DealerOrderDetail id={openId} onClose={closeOrder} />}
    </div>
  );
}

function OrderRow({ order, onClick }: { order: Order; onClick: () => void }) {
  const lineCount = order.lineCount ?? 0;
  const total = order.totalAmount ?? 0;
  const paidPct = total > 0 ? Math.round((order.paid / total) * 100) : 0;
  const blockers = order.status === "place" ? proceedBlockers(order) : [];
  const ready = order.status === "place" && blockers.length === 0;

  return (
    <button
      onClick={onClick}
      className="grid grid-cols-[64px_2fr_2fr_1fr_1fr] gap-6 items-center bg-white border border-base-200 rounded-md px-5 py-4 text-left hover:border-primary transition-colors"
    >
      <div>
        <div className="font-mono text-[10px] text-base-500">#</div>
        <div className="font-mono text-sm font-semibold">{order.so}</div>
      </div>
      <div>
        <div className="text-sm font-semibold truncate">{order.customer.name}</div>
        <div className="font-mono text-[11px] text-base-500 mt-0.5">{order.customer.phone ?? "—"}</div>
      </div>
      <div>
        <div className="text-[13px] text-base-700">{lineCount} item{lineCount === 1 ? "" : "s"}</div>
        <div className="text-[11px] text-base-500 mt-0.5">
          {order.delivery.dateTbd ? "Date TBD" : `Delivery ${order.delivery.date ?? "—"}`}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm font-semibold">{RM(total)}</div>
        <div className={`font-mono text-[11px] mt-0.5 ${paidPct >= 50 ? "text-success" : "text-warning"}`}>
          {paidPct}% paid
        </div>
      </div>
      <div className="text-right">
        {order.status === "place" ? (
          ready ? (
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-success">✓ Ready to proceed</div>
          ) : (
            <div className="text-[11px] text-warning">⚠ {blockers.length} item{blockers.length === 1 ? "" : "s"} pending</div>
          )
        ) : (
          <StatusBadge status={order.status} />
        )}
        <div className="text-[10px] text-base-500 mt-1.5">{new Date(order.placedAt).toLocaleDateString()}</div>
      </div>
    </button>
  );
}

function Stat({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string;
  hint: string;
  mono?: boolean;
}) {
  return (
    <div className="card px-4 py-3">
      <div className="label text-base-500">{label}</div>
      <div
        className={`text-[26px] font-bold mt-0.5 leading-none ${mono ? "font-mono" : "font-display"}`}
      >
        {value}
      </div>
      <div className="t-tiny text-base-500 mt-1">{hint}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const styles: Record<OrderStatus, string> = {
    place: "text-warning",
    proceed_order: "text-info",
    delivered: "text-success",
    cancelled: "text-base-500 line-through",
  };
  const labels: Record<OrderStatus, string> = {
    place: "Place",
    proceed_order: "In delivery prep",
    delivered: "✓ Delivered",
    cancelled: "Cancelled",
  };
  return <span className={`text-[11px] uppercase tracking-[0.1em] font-semibold ${styles[status]}`}>{labels[status]}</span>;
}
