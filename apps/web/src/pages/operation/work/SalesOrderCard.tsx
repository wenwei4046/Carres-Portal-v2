/**
 * THE SALES ORDER CARD — the right panel's second block (Jess, 2026-09-26):
 * after the Route, before the parties, the order's own facts in five lines so
 * the operator never opens the Sales Order just to read them.
 *
 * ```
 *   Sales Order                                  Open SO-1362
 *   Customer       Lim Kuan Yang · 012-345 6789
 *   Deliver to     12 Jalan Bukit Jalil, 57000 KL
 *   Goods          Sofa 2-seater Grey ×1 · Coffee table Oak ×1
 *   Customer date  Mon, 28 Sep
 *   Balance        RM 0.00 · paid
 * ```
 *
 * READ-ONLY (ERP-ARCHITECTURE Law B): every line is the order's own record,
 * spelled by the shared facts; nothing here is a form.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { displayCustomerName } from "@/lib/customer-name";
import { fmtDate } from "@/lib/fmt-date";
import Icon from "@/components/kit/Icon";
import { useCatalog } from "@/lib/queries";
import { moneyOfOrder } from "../sales-order-facts";
import { useLogisticsModel } from "./LogisticsCard";
import { useMissionRoute } from "./WorkOrderRoute";
import { SectionTitle } from "./PartyCardShell";
import { WorkSection } from "./WorkCard";

const RM = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Fact({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <>
      <dt className="text-[12px] leading-4 text-kit-slate-9">{label}</dt>
      <dd className="min-w-0 break-words text-[12px] leading-4 text-kit-slate-12" data-testid={testId}>{children}</dd>
    </>
  );
}

export default function SalesOrderCard({ orderId, label }: { orderId: string; label: string }) {
  const lm = useLogisticsModel(orderId);
  const { route } = useMissionRoute(orderId);
  const catalogQ = useCatalog();
  /* The goods by their catalogue names (`Carres Cloud · King`), never the
     bare SKU — the operator reads names (PoDetailModal's own spelling). */
  const nameOf = useMemo(() => {
    const models = new Map((catalogQ.data?.models ?? []).map((m) => [m.id, m.name]));
    const skus = new Map((catalogQ.data?.skus ?? []).map((s) => [s.sku, s]));
    return (sku: string) => {
      const found = skus.get(sku);
      if (!found) return sku;
      const model = models.get(found.modelId);
      return model ? `${model} · ${found.variant}` : found.variant;
    };
  }, [catalogQ.data]);
  const o = lm.o;
  const card = lm.card;
  if (!o || !card) return null;
  const name = displayCustomerName(o.customer_name) || "Name not recorded";
  const phone = (o.customer_phone ?? "").trim() || null;
  const address = (o.customer_address ?? "").trim() || null;
  const goods = (o.order_lines ?? []).map((l) => `${nameOf(l.sku)} ×${l.qty}`);
  const money = moneyOfOrder(o);
  /* The Route's payment sentence, said here once: `RM 1,250.00 to collect by
     26 Sep` (its deadline is the governed collection timing). */
  const routePayment = route?.paymentLine?.text.replace(/^Payment · /, "") ?? null;
  const balance = !money.known
    ? "Value not recorded"
    : money.outstanding > 0
      ? routePayment ?? `RM ${RM.format(money.outstanding)} · not paid`
      : "RM 0.00 · paid";
  const customerDate = card.scope.customerDeliveryIso ? fmtDate(card.scope.customerDeliveryIso) : "No delivery date";
  return (
    <WorkSection className="shrink-0 px-3 py-2 min-[768px]:px-4" data-testid="work-sales-order" aria-label="Sales Order">
      <div className="flex items-center justify-between">
        <SectionTitle>Sales Order</SectionTitle>
        <Link
          to={`/operation/orders/so/${encodeURIComponent(orderId)}`}
          className="grid h-7 w-7 place-items-center rounded-control text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
          aria-label={`Open ${label}`}
          title={`Open ${label}`}
          data-testid="work-sales-order-open"
        >
          <Icon name="open" size={14} />
        </Link>
      </div>
      {/* Two columns from 768px so the panel's width carries the facts in
          three lines, not six (Jess, 2026-09-26: "width so empty"). */}
      <dl className="mt-1.5 grid grid-cols-[92px_minmax(0,1fr)] gap-x-2 gap-y-1 min-[768px]:grid-cols-[92px_minmax(0,1fr)_92px_minmax(0,1fr)]">
        <Fact label="Customer" testId="work-so-customer">{name}{phone ? ` · ${phone}` : ""}</Fact>
        <Fact label="Customer date" testId="work-so-date">{customerDate}</Fact>
        <Fact label="Deliver to" testId="work-so-address">{address ?? "Address not recorded"}</Fact>
        <Fact label="Balance" testId="work-so-balance">
          <span className={money.known && money.outstanding > 0 ? "font-semibold text-danger" : ""}>{balance}</span>
        </Fact>
        <Fact label="Goods" testId="work-so-goods">{goods.length ? goods.join(" · ") : "No goods lines"}</Fact>
      </dl>
    </WorkSection>
  );
}
