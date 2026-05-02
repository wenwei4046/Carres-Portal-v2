import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { type Order, type OrderStatus } from "@carres/shared";
import { useOrders } from "@/lib/queries";
import DealerOrderDetail from "./DealerOrderDetail";

const TABS: { key: OrderStatus; label: string }[] = [
  { key: "place", label: "Place" },
  { key: "proceed_order", label: "Proceed" },
  { key: "delivered", label: "Delivered" },
];

export default function DealerOrders() {
  const [tab, setTab] = useState<OrderStatus>("place");
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get("open");
  const loc = useLocation();
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

  return (
    <div className="p-9">
      <header className="flex items-start justify-between mb-6 gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Orders</p>
          <h1 className="font-display text-3xl mt-1.5 tracking-tight">Your customers' journey</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono font-semibold text-foreground">{allOrders.length}</span> total · click any row for detail
          </p>
        </div>
        <Link
          to={`${loc.pathname}?new=1`}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 whitespace-nowrap"
        >
          + New order
        </Link>
      </header>

      <div className="flex gap-1 border-b border-border mb-4">
        {TABS.map((t) => {
          const active = tab === t.key;
          const cnt = buckets[t.key].length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 border-b-2 text-sm flex items-center gap-2 transition-colors ${
                active
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground font-medium hover:text-foreground"
              }`}
            >
              {t.label}
              <span
                className={`font-mono text-[11px] px-1.5 py-0.5 rounded-full ${
                  active ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
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
  return (
    <button
      onClick={onClick}
      className="grid grid-cols-[64px_2fr_2fr_1fr_1fr] gap-6 items-center bg-card border border-border rounded-md px-5 py-4 text-left hover:border-primary/60 transition-colors"
    >
      <div>
        <div className="font-mono text-[10px] text-muted-foreground">#</div>
        <div className="font-mono text-sm font-semibold">{order.dl}</div>
      </div>
      <div>
        <div className="text-sm font-semibold truncate">{order.customer.name}</div>
        <div className="font-mono text-[11px] text-muted-foreground mt-0.5">{order.customer.phone ?? "—"}</div>
      </div>
      <div>
        <div className="text-[13px] text-foreground/80">{lineCount} item{lineCount === 1 ? "" : "s"}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {order.delivery.dateTbd ? "Date TBD" : `Delivery ${order.delivery.date ?? "—"}`}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm font-semibold">RM {order.paid.toLocaleString()}</div>
        <div className="font-mono text-[11px] text-muted-foreground mt-0.5">paid</div>
      </div>
      <div className="text-right">
        <StatusBadge status={order.status} />
        <div className="text-[10px] text-muted-foreground mt-1.5">{new Date(order.placedAt).toLocaleDateString()}</div>
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const styles: Record<OrderStatus, string> = {
    place: "text-amber-700",
    proceed_order: "text-blue-700",
    delivered: "text-emerald-700",
    cancelled: "text-muted-foreground line-through",
  };
  const labels: Record<OrderStatus, string> = {
    place: "Place",
    proceed_order: "In delivery prep",
    delivered: "✓ Delivered",
    cancelled: "Cancelled",
  };
  return <span className={`text-[11px] uppercase tracking-wider font-semibold ${styles[status]}`}>{labels[status]}</span>;
}
