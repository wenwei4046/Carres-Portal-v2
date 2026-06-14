import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import BDOrderModal from "./BDOrderModal";

/**
 * Phase 10 · BD · Dealer detail — extended 2026-05-19 to bucket the
 * dealer's orders by lifecycle stage (Loo: "BD should see Place / Process /
 * Delivery directly when entering a dealer"). Three sections render the
 * same row shape so visual rhythm stays consistent; row click opens
 * BDOrderModal with full SO detail. Cancelled orders surface as a small
 * collapsed footer if any exist.
 *
 * Bucketing rules (mirrors the order lifecycle from migration 0001 + the
 * operation_stage rollup chain in 0036/0040/0047/0106):
 *   Place    — orders.status='place'              (awaiting 50% top-up)
 *   Process  — orders.status='proceed_order' AND
 *              operation_stage NOT IN (ready_to_dispatch, dispatched, delivered)
 *   Delivery — orders.status='proceed_order' AND
 *              operation_stage IN (ready_to_dispatch, dispatched)
 *              OR orders.status='delivered'
 *   Cancelled — orders.status='cancelled' (footer strip)
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
  operationStage:
    | "confirmed"
    | "in_production"
    | "ready_to_dispatch"
    | "dispatched"
    | "delivered"
    | null;
  customerName: string | null;
  paid: number;
  total: number;
  qtyTotal: number;
  placedAt: string | null;
  deliveryDate: string | null;
};

const DELIVERY_STAGES: ReadonlySet<NonNullable<OrderRow["operationStage"]>> =
  new Set(["ready_to_dispatch", "dispatched"]);

function bucketOf(o: OrderRow): "place" | "process" | "delivery" | "cancelled" {
  if (o.status === "cancelled") return "cancelled";
  if (o.status === "place") return "place";
  if (o.status === "delivered") return "delivery";
  // status === 'proceed_order'
  if (o.operationStage && DELIVERY_STAGES.has(o.operationStage)) return "delivery";
  return "process";
}

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

  const buckets = useMemo(() => {
    const orders = data?.orders ?? [];
    return {
      place:     orders.filter((o) => bucketOf(o) === "place"),
      process:   orders.filter((o) => bucketOf(o) === "process"),
      delivery:  orders.filter((o) => bucketOf(o) === "delivery"),
      cancelled: orders.filter((o) => bucketOf(o) === "cancelled"),
    };
  }, [data?.orders]);

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
  const { dealer } = data;

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

      {/* KPI strip — high-level dealer health */}
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

      {/* Pipeline strip — at-a-glance counts per bucket */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <PipelineTile label="Place orders"   count={buckets.place.length}    tone="neutral" />
        <PipelineTile label="Process orders" count={buckets.process.length}  tone="warn" />
        <PipelineTile label="Delivery"       count={buckets.delivery.length} tone="success" />
      </div>

      {/* Three lifecycle sections */}
      <Section
        title="Place orders"
        subtitle="Awaiting 50% top-up before HQ proceeds."
        orders={buckets.place}
        onOpen={(so) => setOpenSo(so)}
        emptyText="No orders sitting in Place."
      />

      <Section
        title="Process orders"
        subtitle="50% paid · HQ procuring + preparing for dispatch."
        orders={buckets.process}
        onOpen={(so) => setOpenSo(so)}
        emptyText="No orders currently in Process."
      />

      <Section
        title="Delivery"
        subtitle="Ready to dispatch, dispatched, or delivered."
        orders={buckets.delivery}
        onOpen={(so) => setOpenSo(so)}
        emptyText="No orders in the delivery pipeline."
      />

      {buckets.cancelled.length > 0 && (
        <Section
          title={`Cancelled (${buckets.cancelled.length})`}
          subtitle="No revenue, no follow-up needed — kept for the record."
          orders={buckets.cancelled}
          onOpen={(so) => setOpenSo(so)}
          emptyText=""
          muted
        />
      )}

      {openSo !== null && <BDOrderModal so={openSo} onClose={() => setOpenSo(null)} />}
    </div>
  );
}

function Section({
  title,
  subtitle,
  orders,
  onOpen,
  emptyText,
  muted,
}: {
  title: string;
  subtitle: string;
  orders: OrderRow[];
  onOpen: (so: number) => void;
  emptyText: string;
  muted?: boolean;
}) {
  return (
    <section className={`mb-6 ${muted ? "opacity-75" : ""}`}>
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <h2 className="text-[15px] font-semibold text-base-900">
            {title}{" "}
            <span className="text-base-500 font-medium font-mono text-[12px]">
              · {orders.length}
            </span>
          </h2>
          <div className="text-[11.5px] text-base-500 mt-0.5">{subtitle}</div>
        </div>
      </div>
      <div className="bg-white border border-base-200 rounded overflow-auto">
        {orders.length === 0 && (
          <div className="p-6 text-center text-[12px] text-base-500">{emptyText}</div>
        )}
        {orders.length > 0 && (
          <table className="w-full border-collapse text-[13px]" style={{ minWidth: 760 }}>
            <thead>
              <tr className="bg-base-50 border-b border-base-200">
                <Th>SO</Th>
                <Th>Customer</Th>
                <Th>Items</Th>
                <Th right>Total</Th>
                <Th right>Paid</Th>
                <Th>Stage</Th>
                <Th>Placed</Th>
                <Th>Delivery</Th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => onOpen(o.so)}
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
                  <td className="px-4 py-3"><StageChip o={o} /></td>
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
        )}
      </div>
    </section>
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

function PipelineTile({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "neutral" | "warn" | "success";
}) {
  const bg =
    tone === "warn"    ? "border-primary/40 bg-primary/[0.04]" :
    tone === "success" ? "border-success/40 bg-success-soft/40" :
    "border-base-200 bg-white";
  const valueColor =
    tone === "warn"    ? "text-primary" :
    tone === "success" ? "text-success" :
    "text-base-900";
  return (
    <div className={`border rounded p-4 ${bg}`}>
      <div className="kicker text-[9px]">{label}</div>
      <div className={`font-display text-[26px] font-semibold mt-1 tracking-[-0.02em] ${valueColor}`}>
        {count}
      </div>
    </div>
  );
}

function StageChip({ o }: { o: OrderRow }) {
  // Fine-grained pill — Place / Top-up / Procuring / Awaiting dispatch /
  // Ready / Dispatched / Delivered / Cancelled — derived from the same
  // (status, operation_stage) tuple that drives bucketOf.
  let label = o.status.replace("_", " ");
  let cls = "bg-base-100 text-base-700";

  if (o.status === "cancelled") {
    label = "Cancelled";
    cls = "bg-base-200 text-base-700";
  } else if (o.status === "place") {
    label = "Place";
    cls = "bg-base-100 text-base-700";
  } else if (o.status === "delivered") {
    label = "Delivered";
    cls = "bg-success-soft text-success";
  } else if (o.status === "proceed_order") {
    const stage = o.operationStage;
    if (stage === "ready_to_dispatch") {
      label = "Ready";
      cls = "bg-success-soft text-success";
    } else if (stage === "dispatched") {
      label = "Dispatched";
      cls = "bg-success-soft text-success";
    } else if (stage === "delivered") {
      label = "Delivered";
      cls = "bg-success-soft text-success";
    } else if (stage === "in_production") {
      label = "Awaiting HQ";
      cls = "bg-primary/10 text-primary";
    } else {
      label = "Procuring";
      cls = "bg-primary/10 text-primary";
    }
  }
  return (
    <span className={`inline-block text-[10px] px-2 py-[2px] rounded uppercase font-semibold tracking-[0.06em] ${cls}`}>
      {label}
    </span>
  );
}
