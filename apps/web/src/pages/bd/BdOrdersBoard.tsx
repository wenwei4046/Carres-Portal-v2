import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Inbox,
  MapPin,
  Network,
  Package2,
  Search,
  Store,
  Users,
} from "lucide-react";
import type { Order } from "@carres/shared";
import { useBdDealers, useOrders, useOutlets, useSalespersons } from "@/lib/queries";
import { laneOf } from "@/pages/dealer/pos/order-edit-scope";
import {
  BoardFilterDropdown,
  LANES,
  OrderCard,
  SummaryCard,
  monthLabel,
  orderOutletOf,
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
 *   - BD sees DEALERS only (Loo 2026-07-25): /api/bd/dealers drops Carres'
 *     own showrooms, and the board gates its ORDERS to that dealer-id set
 *     too — a showroom's orders never surface here (they'd otherwise ride in
 *     on bd's internal JWT). The principal's all-stores view lives on
 *     OrderStatusPage instead;
 *   - the dealer dropdown replaces the salesperson one until a dealer is
 *     picked; a picked dealer with ≥2 outlets adds an Outlet level between
 *     them, and salespeople come LAST, scoped to the picked dealer/outlet
 *     (Loo 2026-07-25 cascade);
 *   - "All dealers" mode hides AutoCount-archive imports (they'd flood the
 *     Proceed lane); picking their store still shows them, store-board rules.
 *
 * Card click opens the SAME PosOrderDetail drawer — BD edits under the store's
 * own lane rules (place editable · proceed locked fields · delivered
 * read-only), plus the internal-role History timeline.
 */
export default function BdOrdersBoard({ onClose }: { onClose: () => void }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dealerFilter, setDealerFilter] = useState<string>("all"); // dealer id | 'all'
  const [outletFilter, setOutletFilter] = useState<string>("all"); // outlet id | 'all'
  const [salesFilter, setSalesFilter] = useState<string>("all"); // salesperson id | 'all'
  const [period, setPeriod] = useState<"month" | "range">("month");
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [dealersOpen, setDealersOpen] = useState(false);
  const [outletsOpen, setOutletsOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);

  // ONE network-wide fetch (RLS: bd is internal → all orders), filtered
  // client-side like the store board. ⚠ the list endpoint caps at the
  // PostgREST page size — fine at today's volume; revisit with a SQL
  // aggregate when the network outgrows one page.
  const ordersQ = useOrders();
  const dealersQ = useBdDealers();
  const salespersonsQ = useSalespersons();
  // Outlets are RLS-scoped; bd is internal → every store's outlets.
  const outletsQ = useOutlets();

  const dealers = dealersQ.data?.dealers ?? [];
  const dealerById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of dealers) m.set(d.id, d.name);
    return m;
  }, [dealers]);
  // BD sees DEALERS only (Loo 2026-07-25) — /api/bd/dealers already drops
  // Carres' own showrooms, so the menu is a flat dealer list, and this id set
  // gates the ORDERS below too (bd's internal JWT reads every store's orders;
  // a showroom's must never surface on the BD board).
  const dealerIds = useMemo(() => new Set(dealers.map((d) => d.id)), [dealers]);
  const storeOptions = useMemo(
    () =>
      [...dealers]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((d) => ({ id: d.id, label: d.name })),
    [dealers],
  );
  const staffRows = salespersonsQ.data?.salespersons ?? [];
  const staffById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staffRows) m.set(s.id, s.name);
    return m;
  }, [staffRows]);
  const staffOutletById = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const s of staffRows) m.set(s.id, s.outletId ?? null);
    return m;
  }, [staffRows]);
  const dealerSalespersons = useMemo(
    () =>
      dealerFilter === "all"
        ? []
        : staffRows
            .filter((s) => s.dealerId === dealerFilter)
            .filter((s) => outletFilter === "all" || s.outletId === outletFilter),
    [staffRows, dealerFilter, outletFilter],
  );
  // "if dealer got 2 outlet, can select by outlet as well" (Loo 2026-07-25).
  const scopeOutlets = useMemo(
    () =>
      dealerFilter === "all"
        ? []
        : (outletsQ.data?.outlets ?? []).filter((o) => o.dealerId === dealerFilter),
    [outletsQ.data, dealerFilter],
  );
  const showOutletFilter = scopeOutlets.length >= 2;

  const orders = useMemo(
    () =>
      (ordersQ.data?.orders ?? []).filter(
        (o) =>
          laneOf(o.status, o.operationStage, o.sourceSystem) !== null &&
          dealerIds.has(o.dealerId),
      ),
    [ordersQ.data, dealerIds],
  );
  const boardLoading = ordersQ.isLoading || dealersQ.isLoading;

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
  // Outlet narrowing applies to the LANES (the summary cards keep their fixed
  // network-vs-store comparison semantics).
  const outletOrders = useMemo(
    () =>
      outletFilter === "all"
        ? periodOrders
        : periodOrders.filter((o) => orderOutletOf(o, staffOutletById) === outletFilter),
    [periodOrders, outletFilter, staffOutletById],
  );
  const network = sumRevenue(networkOrders);
  const dealer = sumRevenue(dealerOrders);
  const dealerStats = dealerFilter === "all" ? null : dealers.find((d) => d.id === dealerFilter) ?? null;

  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return outletOrders.filter((o) => {
      if (salesFilter !== "all" && o.salespersonId !== salesFilter) return false;
      if (!q) return true;
      return (
        String(o.so).includes(q) ||
        (o.customer.name || "").toLowerCase().includes(q) ||
        (o.customer.phone || "").includes(q)
      );
    });
  }, [outletOrders, query, salesFilter]);

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
    setOutletFilter("all"); // outlets + salespeople belong to the previous store
    setSalesFilter("all");
    setDealersOpen(false);
  }
  function pickOutlet(id: string) {
    setOutletFilter(id);
    setSalesFilter("all");
    setOutletsOpen(false);
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
          <BoardFilterDropdown
            icon={Store}
            value={dealerFilter}
            allLabel="All dealers"
            options={storeOptions}
            open={dealersOpen}
            onToggle={() => setDealersOpen((o) => !o)}
            onPick={pickDealer}
            testId="bd-dealer-filter"
            optionTestIdPrefix="bd-dealer-option"
          />
          {showOutletFilter && (
            <BoardFilterDropdown
              icon={MapPin}
              value={outletFilter}
              allLabel="All outlets"
              options={scopeOutlets.map((o) => ({ id: o.id, label: o.name }))}
              open={outletsOpen}
              onToggle={() => setOutletsOpen((o) => !o)}
              onPick={pickOutlet}
              testId="os-outlet-filter"
              optionTestIdPrefix="os-outlet-option"
            />
          )}
          {dealerFilter !== "all" && (
            <BoardFilterDropdown
              icon={Users}
              value={salesFilter}
              allLabel="All salespeople"
              options={dealerSalespersons.map((s) => ({ id: s.id, label: s.name }))}
              open={peopleOpen}
              onToggle={() => setPeopleOpen((o) => !o)}
              onPick={(id) => {
                setSalesFilter(id);
                setPeopleOpen(false);
              }}
              testId="os-sales-filter"
              optionTestIdPrefix="os-sales-option"
            />
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
                  {boardLoading ? (
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
