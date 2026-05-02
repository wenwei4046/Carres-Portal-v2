import { Link, useLocation } from "react-router-dom";
import { useDealerSelf, useOrders } from "@/lib/queries";
import { type Order } from "@carres/shared";

export default function DealerDashboard() {
  const dealer = useDealerSelf();
  const ordersQ = useOrders();
  const loc = useLocation();

  if (ordersQ.isPending || dealer.isPending) {
    return <DashboardSkeleton />;
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

  const orders = ordersQ.data?.orders ?? [];
  const place = orders.filter((o) => o.status === "place");
  const proceed = orders.filter((o) => o.status === "proceed_order");
  const delivered = orders.filter((o) => o.status === "delivered");
  const inFlight = place.length + proceed.length;

  return (
    <div className="p-9 max-w-[1100px]">
      <header className="mb-7 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Selamat pagi</p>
          <h1 className="font-display text-4xl mt-2 leading-tight tracking-tight">
            {dealer.data?.name ?? "Dealer"}.
            <br />
            <span className="text-muted-foreground font-medium">Here's where things stand.</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono font-semibold text-foreground">{inFlight}</span> in flight ·{" "}
            <span className="font-mono font-semibold text-foreground">{delivered.length}</span> delivered
          </p>
        </div>
        <Link
          to={`${loc.pathname}?new=1`}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 whitespace-nowrap"
        >
          + New order
        </Link>
      </header>

      <div className="grid grid-cols-3 gap-3.5">
        <StatusColumn title="Place" hint="Awaiting completion" count={place.length} accent="text-amber-600" orders={place.slice(0, 4)} />
        <StatusColumn title="Proceed" hint="Sent to logistics" count={proceed.length} accent="text-blue-600" orders={proceed.slice(0, 4)} />
        <StatusColumn title="Delivered" hint="DO submitted" count={delivered.length} accent="text-emerald-700" orders={delivered.slice(0, 4)} />
      </div>

      <div className="mt-6">
        <Link
          to="/dealer/orders"
          className="inline-block text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
        >
          See all orders →
        </Link>
      </div>
    </div>
  );
}

function StatusColumn({
  title,
  hint,
  count,
  accent,
  orders,
}: {
  title: string;
  hint: string;
  count: number;
  accent: string;
  orders: Order[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border">
        <div className="flex items-baseline justify-between">
          <span className={`text-[11px] font-bold uppercase tracking-[0.14em] ${accent}`}>{title}</span>
          <span className="font-mono text-sm font-semibold">{count}</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <div className="p-2 min-h-[200px]">
        {orders.length === 0 && <div className="text-center text-muted-foreground/60 text-[11px] py-6">—</div>}
        {orders.map((o) => (
          <Link
            key={o.id}
            to={`/dealer/orders?open=${o.id}`}
            className="block w-full bg-card border border-border rounded px-3 py-2.5 mb-1.5 hover:border-primary/60 transition-colors"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[11px] font-semibold">#{o.dl}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{o.lineCount ?? 0} item{(o.lineCount ?? 0) === 1 ? "" : "s"}</span>
            </div>
            <div className="text-sm font-medium mt-0.5 truncate">{o.customer.name}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-9">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}
