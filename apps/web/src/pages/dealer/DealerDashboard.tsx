import { Link, useLocation } from "react-router-dom";
import { useDealerSelf, useOrders } from "@/lib/queries";
import { proceedBlockers } from "@/lib/order-blockers";
import { type Order } from "@carres/shared";

const CJK_RE = /[一-鿿]/;

const RM = (n: number) =>
  `RM ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  const readyToProceed = place.filter((o) => proceedBlockers(o).length === 0);
  // Monthly value — sum of totalAmount for orders placed this calendar month.
  // Mirrors proto's dealer.jsx `monthValue` that skips stair-carry. Falls back
  // to 0 if totalAmount is missing on a row.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthValue = orders
    .filter((o) => o.placedAt >= monthStart)
    .reduce((s, o) => s + (o.totalAmount ?? 0), 0);

  return (
    <div className="p-9">
      {/* Top row — proto's 3-column hero: heading | "Start a sale" black CTA | "Ready to proceed" stat */}
      <header className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr_1fr] gap-4 mb-7 items-stretch">
        <div className="self-end">
          <p className="kicker">Selamat pagi</p>
          <h1 className="font-display text-[36px] font-bold mt-2 leading-[1.05] tracking-[-0.025em]">
            {dealer.data?.name ?? "Dealer"}.
            <br />
            <span className="text-base-600 font-medium">Here&rsquo;s where things stand.</span>
          </h1>
          <p className="text-[13px] text-base-600 mt-1">
            <span className="font-mono font-semibold text-foreground">{inFlight}</span> in flight ·
            this month{" "}
            <span className="font-mono font-semibold text-foreground">{RM(monthValue)}</span>
          </p>
        </div>
        <Link
          to={`${loc.pathname}?new=1`}
          className="rounded-md bg-base-900 text-white p-[22px] flex flex-col justify-between hover:bg-base-800 transition-colors"
        >
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-signature-100">
              Start a sale
            </span>
            <div className="font-display text-[26px] font-bold mt-1.5 leading-[1.1]">+ New order</div>
            <p className="text-[12px] text-base-300 mt-1">3 steps · ~3 min</p>
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary mt-3">
            Begin →
          </span>
        </Link>
        <Link
          to="/dealer/orders"
          className={`rounded-md bg-card border border-border p-5 hover:border-primary/40 transition-colors ${
            readyToProceed.length > 0 ? "border-l-[3px] border-l-success" : "border-l-[3px] border-l-base-200"
          }`}
        >
          <span
            className={`block text-[11px] font-semibold uppercase tracking-[0.18em] ${
              readyToProceed.length > 0 ? "text-success" : "text-base-500"
            }`}
          >
            Ready to proceed
          </span>
          <div className="font-display text-[36px] font-bold mt-1.5 leading-none">
            {readyToProceed.length}
          </div>
          <p className="text-[12px] text-base-600 mt-1">
            {readyToProceed.length === 0
              ? "All in-flight orders need more info"
              : `order${readyToProceed.length === 1 ? "" : "s"} ready to push to operation`}
          </p>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-base-700 mt-2.5">
            View orders →
          </span>
        </Link>
      </header>

      {/* Order journey kicker + see-all link */}
      <div className="flex items-baseline justify-between mb-3.5 gap-4 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-base-500">
          Order journey
        </span>
        <Link
          to="/dealer/orders"
          className="text-[12px] font-semibold uppercase tracking-[0.16em] text-base-700 hover:text-base-900"
        >
          See all orders →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <StatusColumn title="Place" hint="Awaiting completion" count={place.length} accent="text-warning" orders={place.slice(0, 4)} />
        <StatusColumn title="Proceed" hint="Sent to operation" count={proceed.length} accent="text-info" orders={proceed.slice(0, 4)} />
        <StatusColumn title="Delivered" hint="DO submitted" count={delivered.length} accent="text-success" orders={delivered.slice(0, 4)} />
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
        <p className="text-[11px] text-base-500 mt-0.5">{hint}</p>
      </div>
      <div className="p-2 min-h-[200px]">
        {orders.length === 0 && <div className="text-center text-base-400 text-[11px] py-6">—</div>}
        {orders.map((o) => {
          const blockers = o.status === "place" ? proceedBlockers(o) : [];
          const isCJK = CJK_RE.test(o.customer.name);
          return (
            <Link
              key={o.id}
              to={`/dealer/orders?open=${o.id}`}
              className="block w-full bg-white border border-base-100 rounded px-3 py-2.5 mb-1.5 hover:border-primary/60 transition-colors"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[11px] font-semibold">#{o.so}</span>
                <span className="font-mono text-[11px] text-base-500">
                  {typeof o.totalAmount === "number" ? RM(o.totalAmount) : `${o.lineCount ?? 0} item${(o.lineCount ?? 0) === 1 ? "" : "s"}`}
                </span>
              </div>
              <div
                className={`text-[13px] font-medium mt-0.5 truncate ${isCJK ? "font-sans" : ""}`}
              >
                {o.customer.name}
              </div>
              {o.status === "place" && blockers.length > 0 && (
                <div className="text-[10px] text-warning mt-1">⚠ {blockers[0]?.message}</div>
              )}
              {o.status === "place" && blockers.length === 0 && (
                <div className="text-[10px] text-success mt-1">✓ Ready to proceed</div>
              )}
            </Link>
          );
        })}
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
