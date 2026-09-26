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
import { displayCustomerName } from "@/lib/customer-name";
import { fmtDate } from "@/lib/fmt-date";
import { moneyOfOrder } from "../sales-order-facts";
import { useLogisticsModel } from "./LogisticsCard";
import { useMissionRoute } from "./WorkOrderRoute";
import { useGoodsName } from "./goods-name";
import { PartyCardShell } from "./PartyCardShell";

const RM = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Fact({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <>
      <dt className="text-[12px] leading-4 text-kit-slate-9">{label}</dt>
      <dd className="min-w-0 break-words text-[12px] leading-4 text-kit-slate-12" data-testid={testId}>{children}</dd>
    </>
  );
}

export default function SalesOrderCard({ orderId, open, onToggle, heading = "Sales Order", trailing, act }: {
  orderId: string; open: boolean; onToggle: (open: boolean) => void;
  /** The Route step this card is (`Proceed · Sales Order`). */
  heading?: string;
  trailing?: React.ReactNode;
  /** The order's own open act (payment, a customer decision): the status line leads with it. */
  act?: { text: string; missed: boolean } | null;
}) {
  const lm = useLogisticsModel(orderId);
  const { route } = useMissionRoute(orderId);
  const nameOf = useGoodsName();
  const o = lm.o;
  const card = lm.card;
  if (!o || !card) return null;
  const name = displayCustomerName(o.customer_name) || "Name not recorded";
  const phone = (o.customer_phone ?? "").trim() || null;
  const address = (o.customer_address ?? "").trim() || null;
  const goods = (o.order_lines ?? []).map((l) => `${nameOf(l.sku)} ×${l.qty}`);
  const money = moneyOfOrder(o);
  /* COPY's Balance line, said ONCE on the panel: `RM 1,250.00 · not paid`,
     then `· by 26 Sep` — the governed collection deadline the Route's payment
     line reads (the Logistics card does not repeat the money below). */
  const deadline = route?.paymentLine?.deadlineText ?? null;
  const owed = money.known && money.outstanding > 0;
  const balance = !money.known
    ? "Value not recorded"
    : owed
      ? `RM ${RM.format(money.outstanding)} · not paid${deadline ? ` · by ${deadline}` : ""}`
      : "RM 0.00 · paid";
  const customerDate = card.scope.customerDeliveryIso ? fmtDate(card.scope.customerDeliveryIso) : "No delivery date";
  /* Collapsed (Jess, 2026-09-26: every card hides and expands): the customer,
     the customer date and the Balance on one line. */
  const status = (
    <span className="flex min-w-0 flex-col" data-testid="work-so-status">
      {act ? <span className={`text-[13px] font-semibold leading-[18px] ${act.missed ? "text-danger" : "text-kit-slate-12"}`} data-testid="work-so-act">{act.text}</span> : null}
      <span className="min-w-0 truncate text-[12px] leading-4 text-kit-slate-11">
        {name}{phone ? ` · ${phone}` : ""} · {customerDate} · <span className={owed ? "font-semibold text-danger" : "text-kit-slate-12"}>{balance}</span>
      </span>
    </span>
  );
  return (
    <PartyCardShell testId="work-sales-order" party="Sales Order" heading={heading} trailing={trailing} status={status} open={open} onToggle={onToggle}>
      {/* Two columns from 768px so the panel's width carries the facts in
          three lines, not six (Jess, 2026-09-26: "width so empty"). */}
      <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-2 gap-y-1 min-[768px]:grid-cols-[92px_minmax(0,1fr)_92px_minmax(0,1fr)]">
        <Fact label="Customer" testId="work-so-customer">{name}{phone ? ` · ${phone}` : ""}</Fact>
        <Fact label="Customer date" testId="work-so-date">{customerDate}</Fact>
        <Fact label="Deliver to" testId="work-so-address">{address ?? "Address not recorded"}</Fact>
        <Fact label="Balance" testId="work-so-balance">
          <span className={owed ? "font-semibold text-danger" : ""}>{balance}</span>
        </Fact>
        <Fact label="Goods" testId="work-so-goods">{goods.length ? goods.join(" · ") : "No goods lines"}</Fact>
      </dl>
    </PartyCardShell>
  );
}
