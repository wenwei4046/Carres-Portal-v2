import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Inbox,
  Lock,
  MapPin,
  Package2,
  Receipt,
  Search,
  ShieldCheck,
  Store,
  Users,
  X,
} from "lucide-react";
import type { Order } from "@carres/shared";
import { useOrders, useSalespersons } from "@/lib/queries";
import { useStaffSession } from "@/lib/staff";
import { laneOf, type Lane } from "./order-edit-scope";
import PinPad from "./PinPad";
import PosOrderDetail from "./PosOrderDetail";

/**
 * Order Status — the POS "My orders" sales view (design contract:
 * prototype/pos-order-status.jsx). PIN-gated (customer details + pricing sit
 * on a showroom tablet), then a revenue summary + a 3-lane board over the
 * dealer's REAL orders:
 *
 *   01 Order placed → status 'place'         (editable, may need info)
 *   02 Proceed      → status 'proceed_order' (locked, HQ handling)
 *   03 Delivered    → status 'delivered'
 *
 * Cancelled orders stay off the board (the design has no lane for them).
 * Card click opens the POS-native PosOrderDetail drawer (2026-07-14 — 2990s
 * drawer parity: proceed-lane customer/payment edits, un-proceed, checklist).
 *
 * Carres adaptations from the 2990s design (data the list endpoint has):
 * - Revenue rows = Products & add-ons / Collected / Outstanding (no
 *   service/KPI line split in the list response; outstanding IS the number a
 *   Carres dealer chases — the 50% top-up gate).
 * - Second summary card compares the selected salesperson (Carres logs in as
 *   the DEALER, not a staff member, so "mine" is the picked filter).
 */

/** Loo 2026-07-14. Rotate in code when it leaks. */
export const ORDER_STATUS_PIN = "111111";

// Lane bucketing moved to order-edit-scope.ts (2026-07-14) so the pure
// edit-scope helper and this board share ONE lane definition. Re-exported
// here so existing imports (tests) keep working.
export { laneOf };
export type { Lane };

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

function sameMonth(iso: string, anchor: Date): boolean {
  const x = new Date(iso);
  return x.getMonth() === anchor.getMonth() && x.getFullYear() === anchor.getFullYear();
}
function monthLabel(anchor: Date): string {
  return anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}
function daysAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return diff <= 0 ? "today" : `${diff}d ago`;
}

/* ---------- PIN gate ---------- */

function PinGate({ onUnlock, onCancel }: { onUnlock: () => void; onCancel: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  function press(k: string) {
    setErr(false);
    if (k === "del") return setPin((p) => p.slice(0, -1));
    if (k === "clr") return setPin("");
    if (pin.length >= 6) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 6) {
      if (next === ORDER_STATUS_PIN) {
        setTimeout(onUnlock, 150);
      } else {
        setErr(true);
        setTimeout(() => {
          setPin("");
          setErr(false);
        }, 700);
      }
    }
  }

  return (
    <div className="pin-gate" data-testid="os-pin-gate">
      <div className="pin-gate__card">
        <button className="icon-btn pin-gate__close" onClick={onCancel} aria-label="Close">
          <X size={16} strokeWidth={1.75} />
        </button>
        <div className="pin-gate__icon">
          <Lock size={20} strokeWidth={1.75} />
        </div>
        <div className="pin-gate__eyebrow">Restricted view</div>
        <h2 className="pin-gate__title">Enter passcode</h2>
        <p className="pin-gate__sub">
          Order Status contains customer details and pricing. Enter the 6-digit showroom passcode
          to continue.
        </p>

        <PinPad pin={pin} onKey={press} error={err} testIdPrefix="os-pin" />

        <div className="pin-gate__hint">Ask your manager for the passcode</div>
      </div>
    </div>
  );
}

/* ---------- Order card ---------- */

function OrderCard({
  order,
  staffName,
  onOpen,
}: {
  order: Order;
  staffName: string | null;
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
          <div className="os-card__id">#{order.so}</div>
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

function SummaryCard({
  icon: Icon,
  eyebrow,
  rev,
  count,
  muted,
}: {
  icon: typeof Store;
  eyebrow: string;
  rev: Revenue;
  count: number;
  muted?: boolean;
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
      </div>
    </div>
  );
}

/* ---------- The screen ---------- */

const LANES: { key: Lane; num: string; title: string; sub: string }[] = [
  { key: "place", num: "01", title: "Order placed", sub: "Just placed · may need detail tweaks" },
  { key: "proceed", num: "02", title: "Proceed", sub: "Locked · HQ operation handling" },
  { key: "delivered", num: "03", title: "Delivered", sub: "Closed · signed off" },
];

export default function OrderStatusPage({
  onClose,
  dealerId,
}: {
  onClose: () => void;
  /** Scope the board to one dealer — set when a principal is acting on a
   *  picked dealer's behalf (undefined = the caller's own JWT scope). */
  dealerId?: string;
}) {
  // Staff PIN login (0233): once a staff PIN is verified the identity is already
  // proven, so the legacy 6-digit passcode gate is skipped. A salesperson-tier
  // session is server-scoped to its own orders, so the per-person compare chips
  // are hidden (there's no one else to compare against). No token (principal
  // on-behalf / dormant store) → the legacy gate is unchanged.
  const staffTier = useStaffSession((s) => s.staff?.tier ?? null);
  const hasStaffToken = useStaffSession((s) => s.token !== null);
  const salespersonScoped = hasStaffToken && staffTier === "salesperson";
  const [unlocked, setUnlocked] = useState(hasStaffToken);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [salesFilter, setSalesFilter] = useState<string>("all"); // salesperson id | 'all'
  const [period, setPeriod] = useState<"month" | "range">("month");
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [peopleOpen, setPeopleOpen] = useState(false);

  const ordersQ = useOrders(dealerId ? { dealerId } : undefined, { enabled: unlocked });
  const salespersonsQ = useSalespersons(undefined, { enabled: unlocked });
  const orders = useMemo(
    () => (ordersQ.data?.orders ?? []).filter((o) => laneOf(o.status, o.operationStage, o.sourceSystem) !== null),
    [ordersQ.data],
  );
  const staffById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of salespersonsQ.data?.salespersons ?? []) m.set(s.id, s.name);
    return m;
  }, [salespersonsQ.data]);

  const inPeriod = (o: Order) => (period === "range" ? true : sameMonth(o.placedAt, monthAnchor));
  const periodOrders = useMemo(() => orders.filter(inPeriod), [orders, period, monthAnchor]);

  const showroom = sumRevenue(periodOrders);
  const mineOrders =
    salesFilter === "all" ? [] : periodOrders.filter((o) => o.salespersonId === salesFilter);
  const mine = sumRevenue(mineOrders);

  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return periodOrders.filter((o) => {
      if (salesFilter !== "all" && o.salespersonId !== salesFilter) return false;
      if (!q) return true;
      return (
        String(o.so).includes(q) ||
        (o.customer.name || "").toLowerCase().includes(q) ||
        (o.customer.phone || "").includes(q)
      );
    });
  }, [periodOrders, query, salesFilter]);

  const lanes = useMemo(
    () => ({
      place: scoped.filter((o) => laneOf(o.status, o.operationStage, o.sourceSystem) === "place"),
      proceed: scoped.filter((o) => laneOf(o.status, o.operationStage, o.sourceSystem) === "proceed"),
      delivered: scoped.filter((o) => laneOf(o.status, o.operationStage, o.sourceSystem) === "delivered"),
    }),
    [scoped],
  );

  const monthName = monthLabel(monthAnchor);
  const stepMonth = (delta: number) =>
    setMonthAnchor((a) => {
      const x = new Date(a);
      x.setMonth(x.getMonth() + delta);
      return x;
    });

  return createPortal(
    <div
      className="pos-proto"
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--pos-bg)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Order status"
      data-testid="pos-order-status"
    >
      {!unlocked ? (
        <PinGate onUnlock={() => setUnlocked(true)} onCancel={onClose} />
      ) : (
        <div className="os-page">
          {/* Header */}
          <div className="os-head">
            <div className="os-head__left">
              <button className="icon-btn" onClick={onClose} aria-label="Back" data-testid="os-back">
                <ArrowLeft size={16} strokeWidth={1.75} />
              </button>
              <div>
                <div className="os-head__eyebrow">Sales view · showroom</div>
                <h1 className="os-head__title">My orders</h1>
              </div>
            </div>
            {!hasStaffToken && (
              <button className="os-lockbtn" onClick={() => setUnlocked(false)} data-testid="os-lock">
                <ShieldCheck size={14} strokeWidth={1.75} />
                Lock again
              </button>
            )}
          </div>

          {/* Revenue summary */}
          <div className="os-summary">
            <SummaryCard
              icon={Store}
              eyebrow={`Showroom · ${period === "range" ? "All time" : monthName}`}
              rev={showroom}
              count={periodOrders.length}
            />
            {!salespersonScoped && (
              <SummaryCard
                icon={Users}
                eyebrow={
                  salesFilter === "all"
                    ? "Pick a salesperson to compare"
                    : `${staffById.get(salesFilter) ?? "Salesperson"} · ${period === "range" ? "All time" : monthName}`
                }
                rev={salesFilter === "all" ? { products: 0, collected: 0, outstanding: 0, total: 0 } : mine}
                count={mineOrders.length}
                muted
              />
            )}
          </div>

          {/* Controls */}
          <div className="os-controls">
            <div className="os-search">
              <Search size={14} strokeWidth={1.75} />
              <input
                placeholder="Search SO no., customer or phone"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="os-search"
              />
            </div>
            <div className="os-people" style={salespersonScoped ? { display: "none" } : undefined}>
              <button className="os-people__btn" onClick={() => setPeopleOpen((o) => !o)}>
                <Users size={14} strokeWidth={1.75} />
                <span>
                  {salesFilter === "all" ? "All salespeople" : staffById.get(salesFilter) ?? "…"}
                </span>
                <ChevronDown size={13} strokeWidth={1.75} />
              </button>
              {peopleOpen && (
                <div className="os-people__menu">
                  <button
                    className={salesFilter === "all" ? "is-on" : ""}
                    onClick={() => {
                      setSalesFilter("all");
                      setPeopleOpen(false);
                    }}
                  >
                    All salespeople
                  </button>
                  {(salespersonsQ.data?.salespersons ?? []).map((s) => (
                    <button
                      key={s.id}
                      className={salesFilter === s.id ? "is-on" : ""}
                      onClick={() => {
                        setSalesFilter(s.id);
                        setPeopleOpen(false);
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="os-seg">
              <button className={period === "month" ? "is-on" : ""} onClick={() => setPeriod("month")}>
                Month
              </button>
              <button className={period === "range" ? "is-on" : ""} onClick={() => setPeriod("range")}>
                Range
              </button>
            </div>
            <div className="os-monthnav">
              <button
                onClick={() => stepMonth(-1)}
                aria-label="Previous month"
                disabled={period === "range"}
              >
                <ChevronLeft size={14} strokeWidth={1.75} />
              </button>
              <span>{period === "range" ? "All time" : monthName}</span>
              <button
                onClick={() => stepMonth(1)}
                aria-label="Next month"
                disabled={period === "range"}
              >
                <ChevronRight size={14} strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {/* Board */}
          <div className="os-board">
            {LANES.map((lane) => {
              const list = lanes[lane.key];
              return (
                <div key={lane.key} className={`os-lane os-lane--${lane.key}`} data-testid={`os-lane-${lane.key}`}>
                  <div className="os-lane__head">
                    <div className="os-lane__num">{lane.num}</div>
                    <div>
                      <div className="os-lane__title">{lane.title}</div>
                      <div className="os-lane__sub">{lane.sub}</div>
                    </div>
                    <span className="os-lane__count">{list.length}</span>
                  </div>
                  <div className="os-lane__body">
                    {ordersQ.isLoading ? (
                      <div className="os-empty os-empty--plain">
                        <p>Loading…</p>
                      </div>
                    ) : list.length === 0 ? (
                      <div className="os-empty">
                        {lane.key === "place" ? (
                          <Inbox size={20} strokeWidth={1.5} />
                        ) : (
                          <Package2 size={20} strokeWidth={1.5} />
                        )}
                        <p>Nothing here yet</p>
                      </div>
                    ) : (
                      list.map((o) => (
                        <OrderCard
                          key={o.id}
                          order={o}
                          staffName={o.salespersonId ? staffById.get(o.salespersonId) ?? null : null}
                          onOpen={(x) => setActiveId(x.id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full order detail — the POS-native drawer (2990s parity: proceed-lane
          customer/payment edits, un-proceed, place-lane checklist + proceed). */}
      {activeId &&
        (() => {
          const active = orders.find((o) => o.id === activeId);
          const staffName = active?.salespersonId
            ? staffById.get(active.salespersonId) ?? null
            : null;
          return (
            <PosOrderDetail id={activeId} staffName={staffName} onClose={() => setActiveId(null)} />
          );
        })()}
    </div>,
    document.body,
  );
}
