import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Network,
  Package2,
  Search,
  Store,
  Users,
} from "lucide-react";
import type { Order } from "@carres/shared";
import { useBdDealers, useOrders, useSalespersons } from "@/lib/queries";
import { laneOf } from "@/pages/dealer/pos/order-edit-scope";
import {
  LANES,
  OrderCard,
  SummaryCard,
  monthLabel,
  rmGroup,
  sameMonth,
  sumRevenue,
} from "@/pages/dealer/pos/order-board-ui";
import PosOrderDetail from "@/pages/dealer/pos/PosOrderDetail";

/**
 * BdOrdersBoard — the BD "My orders" view (Loo 2026-07-19): the WHOLE dealer
 * network on the same 3-lane board a store sees, with a By-dealer filter for
 * measuring each dealer's sales. Same design contract as OrderStatusPage
 * (shared order-board-ui pieces); differences:
 *
 *   - no PIN gate — BD is an HQ email login on a personal device, not a
 *     shared showroom tablet;
 *   - summary card 1 = the network (or the picked dealer); card 2 compares
 *     the picked dealer and carries its ALL-TIME totals (dealers_with_stats);
 *   - the dealer dropdown replaces the salesperson one until a dealer is
 *     picked (then both show — salespeople scoped to that dealer);
 *   - "All dealers" mode hides AutoCount-archive imports (they'd flood the
 *     Proceed lane); picking their dealer still shows them, store-board rules.
 *
 * Card click opens the SAME PosOrderDetail drawer — BD edits under the store's
 * own lane rules (place editable · proceed locked fields · delivered
 * read-only), plus the internal-role History timeline.
 */
export default function BdOrdersBoard({ onClose }: { onClose: () => void }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dealerFilter, setDealerFilter] = useState<string>("all"); // dealer id | 'all'
  const [salesFilter, setSalesFilter] = useState<string>("all"); // salesperson id | 'all'
  const [period, setPeriod] = useState<"month" | "range">("month");
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [dealersOpen, setDealersOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);

  // ONE network-wide fetch (RLS: bd is internal → all orders), filtered
  // client-side like the store board. ⚠ the list endpoint caps at the
  // PostgREST page size — fine at today's volume; revisit with a SQL
  // aggregate when the network outgrows one page.
  const ordersQ = useOrders();
  const dealersQ = useBdDealers();
  const salespersonsQ = useSalespersons();

  const dealers = dealersQ.data?.dealers ?? [];
  const dealerById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of dealers) m.set(d.id, d.name);
    return m;
  }, [dealers]);
  const staffById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of salespersonsQ.data?.salespersons ?? []) m.set(s.id, s.name);
    return m;
  }, [salespersonsQ.data]);
  const dealerSalespersons = useMemo(
    () =>
      dealerFilter === "all"
        ? []
        : (salespersonsQ.data?.salespersons ?? []).filter((s) => s.dealerId === dealerFilter),
    [salespersonsQ.data, dealerFilter],
  );

  const orders = useMemo(
    () =>
      (ordersQ.data?.orders ?? []).filter(
        (o) => laneOf(o.status, o.operationStage, o.sourceSystem) !== null,
      ),
    [ordersQ.data],
  );

  const inPeriod = (o: Order) => (period === "range" ? true : sameMonth(o.placedAt, monthAnchor));
  // Network scope: AutoCount-archive imports stay off the all-dealers board
  // (184 legacy rows would drown the Proceed lane); a picked dealer shows
  // everything, exactly like that store's own board.
  const networkOrders = useMemo(
    () => orders.filter((o) => inPeriod(o) && o.sourceSystem !== "autocount"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, period, monthAnchor],
  );
  const dealerOrders = useMemo(
    () => (dealerFilter === "all" ? [] : orders.filter((o) => inPeriod(o) && o.dealerId === dealerFilter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, dealerFilter, period, monthAnchor],
  );

  const periodOrders = dealerFilter === "all" ? networkOrders : dealerOrders;
  const network = sumRevenue(networkOrders);
  const dealer = sumRevenue(dealerOrders);
  const dealerStats = dealerFilter === "all" ? null : dealers.find((d) => d.id === dealerFilter) ?? null;

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

  function pickDealer(id: string) {
    setDealerFilter(id);
    setSalesFilter("all"); // salespeople belong to the previous dealer
    setDealersOpen(false);
  }

  return createPortal(
    <div
      className="pos-proto"
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--pos-bg)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Network orders"
      data-testid="bd-orders-board"
    >
      <div className="os-page">
        {/* Header */}
        <div className="os-head">
          <div className="os-head__left">
            <button className="icon-btn" onClick={onClose} aria-label="Back" data-testid="os-back">
              <ArrowLeft size={16} strokeWidth={1.75} />
            </button>
            <div>
              <div className="os-head__eyebrow">Sales view · BD network</div>
              <h1 className="os-head__title">My orders</h1>
            </div>
          </div>
        </div>

        {/* Revenue summary */}
        <div className="os-summary">
          <SummaryCard
            icon={Network}
            eyebrow={`All dealers · ${period === "range" ? "All time" : monthName}`}
            rev={network}
            count={networkOrders.length}
          />
          <SummaryCard
            icon={Store}
            eyebrow={
              dealerFilter === "all"
                ? "Pick a dealer to compare"
                : `${dealerById.get(dealerFilter) ?? "Dealer"} · ${period === "range" ? "All time" : monthName}`
            }
            rev={dealerFilter === "all" ? { products: 0, collected: 0, outstanding: 0, total: 0 } : dealer}
            count={dealerOrders.length}
            muted
            footnote={
              dealerStats
                ? `All-time · RM ${rmGroup(dealerStats.gmv)} · ${dealerStats.orderCount} orders · outstanding RM ${rmGroup(dealerStats.outstanding)}`
                : undefined
            }
          />
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
          <div className="os-people">
            <button
              className="os-people__btn"
              onClick={() => setDealersOpen((o) => !o)}
              data-testid="bd-dealer-filter"
            >
              <Store size={14} strokeWidth={1.75} />
              <span>{dealerFilter === "all" ? "All dealers" : dealerById.get(dealerFilter) ?? "…"}</span>
              <ChevronDown size={13} strokeWidth={1.75} />
            </button>
            {dealersOpen && (
              <div className="os-people__menu">
                <button className={dealerFilter === "all" ? "is-on" : ""} onClick={() => pickDealer("all")}>
                  All dealers
                </button>
                {dealers.map((d) => (
                  <button
                    key={d.id}
                    className={dealerFilter === d.id ? "is-on" : ""}
                    onClick={() => pickDealer(d.id)}
                    data-testid={`bd-dealer-option-${d.id}`}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {dealerFilter !== "all" && (
            <div className="os-people">
              <button className="os-people__btn" onClick={() => setPeopleOpen((o) => !o)}>
                <Users size={14} strokeWidth={1.75} />
                <span>{salesFilter === "all" ? "All salespeople" : staffById.get(salesFilter) ?? "…"}</span>
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
                  {dealerSalespersons.map((s) => (
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
          )}
          <div className="os-seg">
            <button className={period === "month" ? "is-on" : ""} onClick={() => setPeriod("month")}>
              Month
            </button>
            <button className={period === "range" ? "is-on" : ""} onClick={() => setPeriod("range")}>
              Range
            </button>
          </div>
          <div className="os-monthnav">
            <button onClick={() => stepMonth(-1)} aria-label="Previous month" disabled={period === "range"}>
              <ChevronLeft size={14} strokeWidth={1.75} />
            </button>
            <span>{period === "range" ? "All time" : monthName}</span>
            <button onClick={() => stepMonth(1)} aria-label="Next month" disabled={period === "range"}>
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
                        dealerName={dealerFilter === "all" ? dealerById.get(o.dealerId) ?? null : null}
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

      {/* Full order detail — the SAME POS drawer a store uses; BD edits under
          the store lane rules + sees the internal History timeline. */}
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
