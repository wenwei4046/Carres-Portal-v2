import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  MapPin,
  Receipt,
  Store,
} from "lucide-react";
import type { Order } from "@carres/shared";
import { laneOf, type Lane } from "./order-edit-scope";

/**
 * Shared My-orders board pieces (extracted verbatim from OrderStatusPage on
 * 2026-07-19) — the revenue math, the order card, the summary card and the
 * lane definitions are now consumed by TWO boards: the store's own
 * OrderStatusPage and the BD network board (BdOrdersBoard), so a card tweak
 * lands on both. OrderStatusPage re-exports everything, keeping its public
 * surface (tests, imports) unchanged.
 */

export interface Revenue {
  products: number;
  collected: number;
  outstanding: number;
  total: number;
}

export function sumRevenue(list: Order[]): Revenue {
  return list.reduce<Revenue>(
    (a, o) => {
      const paid = Number(o.paid ?? 0);
      // AutoCount-imported rows carry no line prices (totalAmount 0) but DO
      // carry payments — revenue can never read below what was collected, so
      // the effective total floors at paid.
      const total = Math.max(Number(o.totalAmount ?? 0), paid);
      a.products += total;
      a.collected += paid;
      a.outstanding += Math.max(0, total - paid);
      a.total += total;
      return a;
    },
    { products: 0, collected: 0, outstanding: 0, total: 0 },
  );
}

/** Locale-proof RM grouping (comma thousands, no decimals) — the design's
 *  rmGroup; toLocaleString falls back to period grouping in some runtimes. */
export function rmGroup(n: number): string {
  return Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function paidPct(o: Pick<Order, "paid" | "totalAmount">): number {
  const total = Number(o.totalAmount ?? 0);
  if (total <= 0) return 0;
  return Math.min(100, Math.round((Number(o.paid ?? 0) / total) * 100));
}

/** Proceed-lane eligibility, from what the POS itself gates on. */
export function checkConditions(o: Order) {
  const customerInfoOk = !!(o.customer.name && o.customer.phone);
  const addressOk = !!o.customer.address && !o.customer.addressUnknown;
  const paidOk = Number(o.totalAmount ?? 0) > 0 && paidPct(o) >= 50;
  const dateOk = !o.delivery.dateTbd && !!o.delivery.date;
  return { customerInfoOk, addressOk, paidOk, dateOk, allOk: customerInfoOk && addressOk && paidOk && dateOk };
}

export function sameMonth(iso: string, anchor: Date): boolean {
  const x = new Date(iso);
  return x.getMonth() === anchor.getMonth() && x.getFullYear() === anchor.getFullYear();
}
export function monthLabel(anchor: Date): string {
  return anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}
export function daysAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return diff <= 0 ? "today" : `${diff}d ago`;
}

/* ---------- Order card ---------- */

export function OrderCard({
  order,
  staffName,
  dealerName,
  onOpen,
}: {
  order: Order;
  staffName: string | null;
  /** BD network board only — names the owning store on the card when the
   *  board shows every dealer at once. Store boards pass nothing. */
  dealerName?: string | null;
  onOpen: (o: Order) => void;
}) {
  const lane = laneOf(order.status, order.operationStage, order.sourceSystem) ?? "place";
  const cond = checkConditions(order);
  const pct = paidPct(order);
  const pieces = order.lineCount ?? 0;
  const flags: string[] = [];
  if (order.delivery.dateTbd) flags.push("Further notice for delivery date");
  if (order.customer.addressUnknown || !order.customer.address)
    flags.push("Further notice for delivery address");

  return (
    <button
      className={`os-card os-card--${lane}`}
      onClick={() => onOpen(order)}
      data-testid={`os-card-${order.so}`}
    >
      <div className="os-card__head">
        <div>
          <div className="os-card__id">SO-{order.so}</div>
          <div className="os-card__name">{order.customer.name || "Walk-in"}</div>
        </div>
        {pieces > 0 && (
          <div className="os-card__photo">
            <span className="os-card__count">×{pieces}</span>
          </div>
        )}
      </div>

      <div className="os-card__total">
        <span className="os-card__total-num">
          <sup>RM</sup>
          {rmGroup(Number(order.totalAmount ?? 0))}
        </span>
        <span className="os-card__total-paid">{pct}% paid</span>
      </div>
      <div className="os-card__bar">
        <span
          className="os-card__bar-fill"
          style={{ width: pct + "%", background: pct >= 50 ? "var(--c-orange)" : "#C5806B" }}
        ></span>
      </div>

      <div className="os-card__rows">
        {dealerName && (
          <div className="os-card__row" data-testid="os-card-dealer">
            <Store size={12} strokeWidth={1.75} />
            <span>{dealerName}</span>
          </div>
        )}
        <div className="os-card__row">
          <Calendar size={12} strokeWidth={1.75} />
          <span>
            {!order.delivery.dateTbd && order.delivery.date
              ? fmtDate(order.delivery.date)
              : "Date TBD"}
          </span>
        </div>
        <div className="os-card__row">
          <MapPin size={12} strokeWidth={1.75} />
          <span>
            {order.customer.address ? order.customer.address.slice(0, 34) : "Address TBD"}
          </span>
        </div>
      </div>

      {flags.length > 0 && lane === "place" && (
        <div className="os-card__flags">
          {flags.map((f, i) => (
            <span key={i} className="os-card__flag">
              <AlertCircle size={11} strokeWidth={2} />
              {f}
            </span>
          ))}
        </div>
      )}

      {lane === "place" && (
        <div className={`os-card__readiness ${cond.allOk ? "is-ready" : ""}`}>
          {cond.allOk ? (
            <>
              <CheckCircle2 size={12} strokeWidth={2} />
              Ready to proceed
            </>
          ) : (
            <>
              <CircleDashed size={12} strokeWidth={2} />
              Awaiting info
            </>
          )}
        </div>
      )}

      <div className="os-card__foot">
        <span>{staffName ?? "—"}</span>
        <span>{daysAgo(order.placedAt)}</span>
      </div>
    </button>
  );
}

/* ---------- Revenue summary card ---------- */

export function SummaryCard({
  icon: Icon,
  eyebrow,
  rev,
  count,
  muted,
  footnote,
}: {
  icon: typeof Store;
  eyebrow: string;
  rev: Revenue;
  count: number;
  muted?: boolean;
  /** BD board — an extra all-time line under the monthly rows. */
  footnote?: string;
}) {
  return (
    <div className={`os-sumcard ${muted ? "os-sumcard--muted" : ""}`}>
      <div className="os-sumcard__eyebrow">
        <Icon size={13} strokeWidth={1.75} />
        {eyebrow}
      </div>
      <div className="os-sumcard__total">
        <sup>RM</sup>
        {rmGroup(rev.total)}
      </div>
      <div className="os-sumcard__orders">
        <Receipt size={12} strokeWidth={1.75} />
        {count} {count === 1 ? "order" : "orders"}
      </div>
      <div className="os-sumcard__rows">
        <div className="os-sumrow os-sumrow--lead">
          <span>Products &amp; add-ons revenue</span>
          <span className="os-sumrow__val">
            <sup>RM</sup>
            {rmGroup(rev.products)}
          </span>
        </div>
        <div className="os-sumrow">
          <span>Collected</span>
          <span className="os-sumrow__val">
            <sup>RM</sup>
            {rmGroup(rev.collected)}
          </span>
        </div>
        <div className="os-sumrow">
          <span>Outstanding (customer owes HQ)</span>
          <span className="os-sumrow__val">
            <sup>RM</sup>
            {rmGroup(rev.outstanding)}
          </span>
        </div>
        {footnote && (
          <div className="os-sumrow" data-testid="os-sumcard-footnote">
            <span style={{ color: "var(--fg-muted)" }}>{footnote}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Cascade filter pieces (store → outlet → salesperson) ---------- */

/**
 * Which outlet an order belongs to: the order's own stamp first, falling back
 * to its salesperson's outlet — most pre-PIN-era rows carry no `outlet_id`
 * (14/51 in prod, 2026-07-25), so the fallback keeps the outlet filter useful
 * on older orders. A staff transfer re-attributes those fallback rows; the
 * stamped ones never move.
 */
export function orderOutletOf(
  o: Order,
  staffOutletById: Map<string, string | null>,
): string | null {
  return o.outletId ?? (o.salespersonId ? staffOutletById.get(o.salespersonId) ?? null : null);
}

export interface BoardFilterOption {
  id: string;
  label: string;
  /** Options sharing a group render under an uppercase header — the store
   *  menu's "Our showrooms" / "Dealers" split (store-kind.ts naming rule). */
  group?: string;
}

/**
 * One dropdown of the board's filter cascade (Loo 2026-07-25: store →
 * outlet → salesperson). Same `.os-people` anatomy the salespeople picker
 * always had, plus optional group headers. Controlled: the board owns the
 * value/open state so it can reset the levels below a pick.
 */
export function BoardFilterDropdown({
  icon: Icon,
  value,
  allLabel,
  options,
  open,
  onToggle,
  onPick,
  testId,
  optionTestIdPrefix,
}: {
  icon: typeof Store;
  /** `'all'` or an option id. */
  value: string;
  allLabel: string;
  options: BoardFilterOption[];
  open: boolean;
  onToggle: () => void;
  /** Receives `'all'` or the picked option id. */
  onPick: (id: string) => void;
  testId?: string;
  optionTestIdPrefix?: string;
}) {
  const current = value === "all" ? allLabel : options.find((o) => o.id === value)?.label ?? "…";
  const groups = [...new Set(options.map((o) => o.group).filter((g): g is string => !!g))];
  const renderOption = (o: BoardFilterOption) => (
    <button
      key={o.id}
      className={value === o.id ? "is-on" : ""}
      onClick={() => onPick(o.id)}
      data-testid={optionTestIdPrefix ? `${optionTestIdPrefix}-${o.id}` : undefined}
    >
      {o.label}
    </button>
  );
  return (
    <div className="os-people">
      <button className="os-people__btn" onClick={onToggle} data-testid={testId}>
        <Icon size={14} strokeWidth={1.75} />
        <span>{current}</span>
        <ChevronDown size={13} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="os-people__menu">
          <button className={value === "all" ? "is-on" : ""} onClick={() => onPick("all")}>
            {allLabel}
          </button>
          {groups.length > 0
            ? groups.map((g) => (
                <div key={g} style={{ display: "contents" }}>
                  <div className="os-people__grouplab">{g}</div>
                  {options.filter((o) => o.group === g).map(renderOption)}
                </div>
              ))
            : options.map(renderOption)}
        </div>
      )}
    </div>
  );
}

/* ---------- Lane definitions ---------- */

export const LANES: { key: Lane; num: string; title: string; sub: string }[] = [
  { key: "place", num: "01", title: "Order placed", sub: "Just placed · may need detail tweaks" },
  { key: "proceed", num: "02", title: "Proceed", sub: "Locked · HQ operation handling" },
  { key: "delivered", num: "03", title: "Delivered", sub: "Closed · signed off" },
];
