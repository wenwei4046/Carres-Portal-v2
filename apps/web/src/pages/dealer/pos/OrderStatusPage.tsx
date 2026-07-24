import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Lock,
  MapPin,
  Network,
  Package2,
  Search,
  ShieldCheck,
  Store,
  Users,
  X,
} from "lucide-react";
import { isShowroom, type Order } from "@carres/shared";
import { useAuth } from "@/lib/auth";
import { useOrders, useOutlets, usePrincipalDealers, useSalespersons } from "@/lib/queries";
import { useStaffSession } from "@/lib/staff";
import { laneOf, type Lane } from "./order-edit-scope";
import {
  BoardFilterDropdown,
  LANES,
  OrderCard,
  SummaryCard,
  checkConditions,
  monthLabel,
  orderOutletOf,
  paidPct,
  rmGroup,
  sameMonth,
  sumRevenue,
  type Revenue,
} from "./order-board-ui";
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
 *
 * Filter cascade (Loo 2026-07-25): Store → Outlet → Salesperson.
 * - A PRINCIPAL with no acting store ("network mode") sees every store's
 *   orders, so the board leads with a Store dropdown grouped Our showrooms /
 *   Dealers; salespeople only appear once a store is picked.
 * - Any owner-level view of a store with ≥2 outlets gets an Outlet dropdown
 *   (order → outlet via its own stamp, falling back to its salesperson's
 *   outlet — `orderOutletOf`).
 * - Salespeople always come LAST, scoped to the picked store/outlet.
 */

/** Loo 2026-07-14. Rotate in code when it leaks. */
export const ORDER_STATUS_PIN = "111111";

// Lane bucketing moved to order-edit-scope.ts (2026-07-14); the card / summary
// / revenue pieces moved to order-board-ui.tsx (2026-07-19) so this board and
// the BD network board share ONE implementation. Everything is re-exported
// here so existing imports (tests) keep working.
export { laneOf, checkConditions, paidPct, rmGroup, sumRevenue };
export type { Lane, Revenue };

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

/* ---------- The screen ---------- */

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
  // Manager-tier orders are already OUTLET-scoped server-side (0233), so an
  // outlet dropdown there would be a lying no-op — owner-level views only.
  const outletFilterEligible = !hasStaffToken || staffTier === "principal";

  // HQ network mode (Loo 2026-07-25): a PRINCIPAL opening My orders without an
  // acting store sees every store's orders, so the board gains the cascade
  // Store (Our showrooms / Dealers) → Outlet (when that store has ≥2) →
  // Salesperson. Store logins / acting-principal keep the single-store board,
  // plus the same outlet level when their own store has ≥2 outlets.
  const role = useAuth((s) => s.role);
  const networkMode = role === "principal" && !dealerId;

  const [unlocked, setUnlocked] = useState(hasStaffToken);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState<string>("all"); // dealer id | 'all'
  const [outletFilter, setOutletFilter] = useState<string>("all"); // outlet id | 'all'
  const [salesFilter, setSalesFilter] = useState<string>("all"); // salesperson id | 'all'
  const [period, setPeriod] = useState<"month" | "range">("month");
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [storesOpen, setStoresOpen] = useState(false);
  const [outletsOpen, setOutletsOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);

  const ordersQ = useOrders(dealerId ? { dealerId } : undefined, { enabled: unlocked });
  const salespersonsQ = useSalespersons(undefined, { enabled: unlocked });
  // Store list for the network cascade — principal-gated route, never fired
  // for store logins.
  const storesQ = usePrincipalDealers({}, { enabled: unlocked && networkMode });
  // Outlets are RLS-scoped: a store login gets its own rows, internal gets all.
  const outletsQ = useOutlets({ enabled: unlocked && !salespersonScoped });
  const orders = useMemo(
    () => (ordersQ.data?.orders ?? []).filter((o) => laneOf(o.status, o.operationStage, o.sourceSystem) !== null),
    [ordersQ.data],
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

  const stores = storesQ.data?.dealers ?? [];
  const storeById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of stores) m.set(d.id, d.name);
    return m;
  }, [stores]);
  const storeOptions = useMemo(
    () =>
      [...stores]
        .sort(
          (a, b) =>
            (isShowroom(b.channel) ? 1 : 0) - (isShowroom(a.channel) ? 1 : 0) ||
            a.name.localeCompare(b.name),
        )
        .map((d) => ({
          id: d.id,
          label: d.name,
          group: isShowroom(d.channel) ? "Our showrooms" : "Dealers",
        })),
    [stores],
  );

  // The store whose board this is: the picked one (network mode), the acting
  // one (principal on-behalf), or null for a store login — whose salesperson /
  // outlet rows are already own-scoped by RLS.
  const scopeStoreId = networkMode ? (storeFilter !== "all" ? storeFilter : null) : dealerId ?? null;

  const scopeOutlets = useMemo(() => {
    const all = outletsQ.data?.outlets ?? [];
    if (networkMode) return scopeStoreId ? all.filter((o) => o.dealerId === scopeStoreId) : [];
    if (dealerId) return all.filter((o) => o.dealerId === dealerId);
    return all;
  }, [outletsQ.data, networkMode, scopeStoreId, dealerId]);
  // "if dealer got 2 outlet, can select by outlet as well" — one branch needs
  // no picker.
  const showOutletFilter = outletFilterEligible && scopeOutlets.length >= 2;

  const scopeStaff = useMemo(() => {
    let rows = staffRows;
    if (networkMode) rows = scopeStoreId ? rows.filter((s) => s.dealerId === scopeStoreId) : [];
    else if (dealerId) rows = rows.filter((s) => s.dealerId === dealerId);
    if (outletFilter !== "all") rows = rows.filter((s) => s.outletId === outletFilter);
    return rows;
  }, [staffRows, networkMode, scopeStoreId, dealerId, outletFilter]);

  const inPeriod = (o: Order) => (period === "range" ? true : sameMonth(o.placedAt, monthAnchor));
  // Network scope: the AutoCount archive stays off the all-stores board (it
  // would drown the Proceed lane — BdOrdersBoard rule); a picked store shows
  // everything, exactly like that store's own board.
  const storeOrders = useMemo(() => {
    if (!networkMode) return orders;
    if (storeFilter === "all") return orders.filter((o) => o.sourceSystem !== "autocount");
    return orders.filter((o) => o.dealerId === storeFilter);
  }, [orders, networkMode, storeFilter]);
  const periodOrders = useMemo(() => storeOrders.filter(inPeriod), [storeOrders, period, monthAnchor]);
  const outletOrders = useMemo(
    () =>
      outletFilter === "all"
        ? periodOrders
        : periodOrders.filter((o) => orderOutletOf(o, staffOutletById) === outletFilter),
    [periodOrders, outletFilter, staffOutletById],
  );

  const showroom = sumRevenue(outletOrders);
  const mineOrders =
    salesFilter === "all" ? [] : outletOrders.filter((o) => o.salespersonId === salesFilter);
  const mine = sumRevenue(mineOrders);

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

  function pickStore(id: string) {
    setStoreFilter(id);
    setOutletFilter("all"); // outlets + salespeople belong to the previous store
    setSalesFilter("all");
    setStoresOpen(false);
  }
  function pickOutlet(id: string) {
    setOutletFilter(id);
    setSalesFilter("all");
    setOutletsOpen(false);
  }

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
                <div className="os-head__eyebrow">
                  {networkMode ? "Sales view · all stores" : "Sales view · showroom"}
                </div>
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
              icon={networkMode && storeFilter === "all" ? Network : Store}
              eyebrow={`${
                networkMode
                  ? storeFilter === "all"
                    ? "All stores"
                    : storeById.get(storeFilter) ?? "Store"
                  : "Showroom"
              } · ${period === "range" ? "All time" : monthName}`}
              rev={showroom}
              count={outletOrders.length}
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
            {networkMode && (
              <BoardFilterDropdown
                icon={Store}
                value={storeFilter}
                allLabel="All stores"
                options={storeOptions}
                open={storesOpen}
                onToggle={() => setStoresOpen((o) => !o)}
                onPick={pickStore}
                testId="os-store-filter"
                optionTestIdPrefix="os-store-option"
              />
            )}
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
            {/* Salespeople come LAST in the cascade — and only once a store is
                on screen (network mode hides them until a store is picked). */}
            {!salespersonScoped && (!networkMode || storeFilter !== "all") && (
              <BoardFilterDropdown
                icon={Users}
                value={salesFilter}
                allLabel="All salespeople"
                options={scopeStaff.map((s) => ({ id: s.id, label: s.name }))}
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
                          dealerName={
                            networkMode && storeFilter === "all"
                              ? storeById.get(o.dealerId) ?? null
                              : null
                          }
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
