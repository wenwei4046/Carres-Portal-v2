import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PanelLeftOpen } from "lucide-react";
import {
  SO_BATCH_PURCHASE_WORDS as W,
  SO_BATCH_RAIL,
  SO_BATCH_RAIL_CLEAR,
  defaultAllocations,
  isSelectableForBuying,
  isSelectableForOrder,
  purchaseDemandRailWords,
  isPurchaseDemandTimingState,
  purchaseDemandStateWords,
  setDestination,
  soBatchCellSummary,
  soBatchOrderSelection,
  soBatchOrderSupplierNames,
  soBatchRailFacts,
  soBatchRailModel,
  soBatchSelectionSummary,
  type DestinationAllocation,
  type PurchaseDemandRow,
  type PurchaseDemandTimingState,
  type SoBatchCellSummary,
  type SoBatchOrderRow,
  type SoBatchProductCategory,
  type SoBatchPurchaseResponse,
  type SoBatchRailFilter,
  type SoBatchSelection,
} from "@carres/shared";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridContextMenuItem,
} from "@/components/register/DataGrid";
import { fmtDate } from "@/lib/fmt-date";
import { conciseLocality, NOT_RECORDED } from "@/lib/locality";
import { useSalesOrderExpansion } from "@/lib/queries";
import { avatarColor, personInitials } from "@/lib/staff-avatar";
import {
  FilterRail,
  FilterRailGroup,
  FilterRailRow,
  FilterRailSelect,
} from "../components/workspace-rail";
import PurchasingTabs from "../PurchasingTabs";
import styles from "./SoBatchRegister.module.css";
import DestinationAllocationEditor from "./DestinationAllocationEditor";
import ReadyStockPanel from "./ReadyStockPanel";
import { ReadyStockDisclosure } from "../components/ReadyStockTable";
import ConnectedSections, {
  CONNECT_AT_DISCLOSURE,
  CONNECT_AT_TABLE_HEADER,
  type ConnectedSection,
} from "../components/ConnectedSections";
import PoDetailsTable, {
  poDetailRowsForLine,
  type UnitReadState,
} from "./PoDetailsTable";
import GoodsMiniTable, {
  categoryWord,
  type GoodsMiniLine,
} from "../components/GoodsMiniTable";

/**
 * SO BATCH PURCHASE — THE PERMANENT ORDER REGISTER
 * (CARD 02-B, owner ruling 2026-08-27; `docs/purchasing/MASTER.md` §9.1).
 *
 * ONE ROW PER PROCEEDED PHYSICAL-GOODS SALES ORDER — and the row never leaves
 * when a purchase order is issued. The page is the buying surface AND the
 * permanent purchasing audit register: an inexperienced operator reads, per
 * order, whether it is ordered (blank · `Partial` · `Ordered`), which PO
 * covers it, who the customer is, where they are, what date they asked for,
 * which supplier is involved, where the supplier must deliver, and the
 * official date on the PO.
 *
 * ── EVERY NUMBER AND EVERY STATUS IS THE SERVER'S ───────────────────────────
 *
 * `registerRows` carries the aggregation: Status derived from the confirmed-
 * sent lineage, PO attribution from `po_line_sources` ONLY, the official
 * `PO Delivery Date` from `purchase_orders.eta_date`. This file composes
 * words and cells; it performs no demand arithmetic (Law D).
 *
 * ── THE LEAF ROWS REMAIN THE ISSUE CONTRACT ─────────────────────────────────
 *
 * `rows` (the demand leafs) still power selection, destination arrangement
 * and the unchanged 50/50 issue journey. The parent checkbox stands for ALL
 * of its order's eligible uncovered leafs (`soBatchOrderSelection`); the
 * expansion's per-line checkboxes narrow it; a stale tick is dropped the
 * moment its leaf stops being buyable.
 */

/* v2 — Card 02-B changed the approved column set; a stale saved layout from
   the leaf-grain Register must not override the owner-approved order. */
/* v3 — the DEFAULT column order changed (Status retired, SO No leading), and a
   stored v2 arrangement would have pinned every returning operator to the old
   one. The key is the only thing that retires a saved layout. */
const STORAGE_KEY = "carres.soBatchPurchase.register.v3";
const FILTER_RAIL_STORAGE_KEY = "carres.soBatchPurchase.filters.open";

/**
 * ⭐ ONE PO IS A DOOR; SEVERAL ARE A COUNT — owner correction 2026-09-11.
 *
 * This cell measured its own text against its own width and printed as many
 * numbers as happened to fit, plus `+2 more`. Three readers got three answers:
 * the eye saw one-and-a-half numbers, `Export` saw the full list, and a
 * narrower window silently changed what the screen said without anything
 * having changed about the order.
 *
 * A summary now says exactly one thing. One purchase order prints in full and
 * opens Purchase Orders; several print how many there are and open the row's
 * own expansion, where every number is its own door beside the item line it
 * actually covers. No measurement, no truncation, no resize behaviour.
 */
function PoNumbersCell({ order }: { order: SoBatchOrderRow }) {
  const navigate = useNavigate();
  const numbers = useMemo(() => [...new Set(order.pos.map((po) => po.poId))], [order.pos]);
  if (numbers.length === 0) return null;
  if (numbers.length === 1) {
    const number = numbers[0]!;
    return (
      <button
        type="button"
        className="truncate text-kit-blue-11 underline-offset-2 hover:underline"
        data-testid={`so-batch-po-link-${order.orderId}`}
        onClick={(event) => {
          event.stopPropagation();
          navigate(`/operation/procurement?po=${encodeURIComponent(number)}`);
        }}
      >
        {number}
      </button>
    );
  }
  return (
    <button
      type="button"
      className="truncate text-kit-blue-11 underline-offset-2 hover:underline"
      data-testid={`so-batch-po-many-${order.orderId}`}
      title="Open the row to see every purchase order"
      onClick={(event) => {
        event.stopPropagation();
        const row = event.currentTarget.closest("tr");
        const arrow = row?.querySelector<HTMLButtonElement>("button[aria-expanded]");
        if (arrow?.getAttribute("aria-expanded") === "false") arrow.click();
        requestAnimationFrame(() => {
          row?.nextElementSibling
            ?.querySelector('[data-testid="grid-expansion-cell"]')
            ?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
        });
      }}
    >
      {`${numbers.length} POs`}
    </button>
  );
}

/** Governed absence — a muted sentence, never a bare dash. */
function Absent({ children }: { children: string }) {
  return <span className="text-kit-slate-11">{children}</span>;
}

/**
 * One ticked leaf: the arrangement, and the `To buy` it was arranged against.
 *
 * The second half is what makes a tick falsifiable. Without it the Register
 * cannot tell an arrangement the operator still means from one the server has
 * since recomputed underneath them.
 */
type LeafTick = { toBuy: number; allocations: DestinationAllocation[] };

/** A parent cell over many values: `—` · the value · the compact summary. */
function summaryText(
  s: SoBatchCellSummary,
  many: (n: number) => string,
): string | null {
  if (s.kind === "none") return null;
  if (s.kind === "one") return s.value;
  return many(s.count);
}

export interface SoBatchRegisterProps {
  data: SoBatchPurchaseResponse;
  isLoading: boolean;
  /** Hands the arrangement to the issue journey. This page creates nothing. */
  onIssue: (selections: SoBatchSelection[]) => void;
}

export default function SoBatchRegister({ data, isLoading, onIssue }: SoBatchRegisterProps) {
  const navigate = useNavigate();

  /* ⭐ THE ROW IS A DOOR (YH, 2026-09-01).
   *
   * This register handed the grid `expandable` and `selectable` and nothing
   * else, so `onRowDoubleClick` and `contextMenu` were undefined: the engine
   * called nothing and the browser's event was discarded. Double-click did
   * nothing at all, and right-click gave the browser's own menu.
   *
   * That left ONE working door on a ~1200px row — the ~90px blue `SO-####`
   * cell — on the module's permanent purchasing audit book. An operator who
   * wants the order behind a row reaches for double-click first, gets nothing,
   * and concludes the page is dead. That is the report that started this.
   *
   * ⭐ IT ALSO MAKES THE CURSOR HONEST (defect 13). The grid paints the
   * pointing hand on any row that is selectable OR expandable, and every row
   * here is expandable — so the page advertised itself as clickable on all
   * ~1200px and answered on 90. Now every row answers.
   *
   * ⛔ THE MENU CARRIES ONLY DOORS THAT EXIST. The sibling Sales Orders menu
   * ends in `Cancel SO`; a buying register must not offer that — it records
   * what was bought, it does not amend the sale. `Open <PO>` appears only when
   * the order has exactly one, which is the same test the PO No cell makes;
   * the exact numbers for a multi-PO order live in the expansion. */
  const openOrder = useCallback(
    (o: SoBatchOrderRow) => navigate(`/operation/orders/so/${o.orderId}`),
    [navigate],
  );
  const rowMenu = useCallback(
    (o: SoBatchOrderRow): DataGridContextMenuItem[] => {
      const po = soBatchCellSummary(o.pos.map((p) => p.poId));
      return [
        { label: "View", onClick: () => openOrder(o) },
        ...(po.kind === "one"
          ? [
              {
                label: `Open ${po.value}`,
                onClick: () =>
                  navigate(`/operation/procurement?po=${encodeURIComponent(po.value)}`),
              },
            ]
          : []),
      ];
    },
    [navigate, openOrder],
  );
  const leafs = data.rows;
  const orders = data.registerRows;
  const leafById = useMemo(() => new Map(leafs.map((r) => [r.id, r])), [leafs]);
  const leafsByOrder = useMemo(() => {
    const m = new Map<string, PurchaseDemandRow[]>();
    for (const r of leafs) {
      const arr = m.get(r.orderId);
      if (arr) arr.push(r);
      else m.set(r.orderId, [r]);
    }
    return m;
  }, [leafs]);
  /* An `Ordered` order has bought everything it required, and its own
     `po_line_sources` lineage proves it. Its demand rows stay VISIBLE — the
     register is permanent (Card 02-B) — but nothing on them may be ticked, or
     the tick raises a SECOND purchase order for units this order already sent
     for. `isSelectableForOrder` carries the reasoning and the fail-open rule
     that keeps a lineage-less order tickable. */
  const statusByOrder = useMemo(
    () => new Map(orders.map((o) => [o.orderId, o.status])),
    [orders],
  );
  const selectable = useCallback(
    (row: PurchaseDemandRow) =>
      isSelectableForOrder(row, statusByOrder.get(row.orderId) ?? "blank"),
    [statusByOrder],
  );

  /** The order's eligible uncovered demand — the parent checkbox's meaning. */
  const eligibleByOrder = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const o of orders) {
      m.set(
        o.orderId,
        (leafsByOrder.get(o.orderId) ?? []).filter(selectable).map((r) => r.id),
      );
    }
    return m;
  }, [orders, leafsByOrder, selectable]);

  /* ── The rail (fact sections, one selection per section) ────────────────
   *
   * The DEFAULT no-filter view shows every proceeded record, Ordered ones
   * included — the Register is permanent. One filter per section; sections
   * combine; every count is the SHARED model's unique-Sales-Order arithmetic,
   * cross-updated against the other sections so the printed number predicts
   * the rows a click would show. This file picks; it never counts. */
  const [filter, setFilter] = useState<SoBatchRailFilter>(SO_BATCH_RAIL_CLEAR);
  const [filterRailOpen, setFilterRailOpen] = useState(() => {
    try {
      return localStorage.getItem(FILTER_RAIL_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const setFilterRailVisible = useCallback((open: boolean) => {
    setFilterRailOpen(open);
    try {
      localStorage.setItem(FILTER_RAIL_STORAGE_KEY, open ? "1" : "0");
    } catch {
      // Storage may be unavailable in a locked-down browser; the live state
      // still works for this visit.
    }
  }, []);
  const railFacts = useMemo(() => soBatchRailFacts(orders, leafs), [orders, leafs]);
  const rail = useMemo(() => soBatchRailModel(railFacts, filter), [railFacts, filter]);
  const shown = useMemo(
    () => orders.filter((o) => rail.visibleOrderIds.has(o.orderId)),
    [orders, rail.visibleOrderIds],
  );
  const toggleTiming = useCallback((s: PurchaseDemandTimingState) => {
    setFilter((prev) => ({ ...prev, timing: prev.timing === s ? null : s }));
  }, []);
  const stateWords = useMemo(() => purchaseDemandStateWords(data.safetyDays), [data.safetyDays]);
  const railWords = useMemo(() => purchaseDemandRailWords(data.safetyDays), [data.safetyDays]);
  /* `SETUP TO FIX` renders only while an affected Sales Order exists. When the
     last such line is fixed, its filter must not survive as an invisible
     narrowing the operator can no longer see or clear. */
  useEffect(() => {
    if (rail.setupExists) return;
    setFilter((prev) => (prev.setup ? { ...prev, setup: false } : prev));
  }, [rail.setupExists]);

  /* ── The arrangement ──────────────────────────────────────────────────────
   *
   * Session state, deliberately. `Deliver To` becomes truth when a purchase
   * order carries it; storing it here would create a second demand field that
   * nothing recomputes (Card §4.1).
   *
   * A tick is dropped the moment its leaf stops being buyable — a refetch
   * that covers a line must not leave a stale tick able to order it. */
  /**
   * ⭐ A TICK REMEMBERS THE NUMBER IT WAS TAKEN AGAINST (2026-09-10).
   *
   * A tick is an arrangement of `To buy` units across destinations, so it is
   * only meaningful against the `To buy` the operator saw. That number MOVES
   * under an open page: Ready Stock commits a Unit to one of the order's item
   * lines, a colleague issues a purchase order, someone releases a reservation
   * — and the very next read of this Register answers a smaller (or larger)
   * remainder for the same leaf.
   *
   * Measured before the fix: ticking `To buy 3`, reserving 2 Units in the Ready
   * Stock section below, then pressing `Issue PO` sent an arrangement of 3
   * against a server remainder of 1. The door refused it (`allocation_mismatch`
   * — the law held) and the operator was left with an error instead of the
   * recalculated quantity. So the tick is DROPPED when its number moves: the
   * operator ticks the new remainder, deliberately.
   *
   * It is not refreshed silently to the new number. A tick is a decision about
   * a quantity, and a decision the system rewrites is not the operator's.
   */
  const [selected, setSelected] = useState<Map<string, LeafTick>>(new Map());
  const live = useMemo(() => {
    const out = new Map<string, DestinationAllocation[]>();
    for (const [id, tick] of selected) {
      const row = leafById.get(id);
      if (!row || !selectable(row)) continue;
      if ((row.toBuy ?? 0) !== tick.toBuy) continue;
      out.set(id, tick.allocations);
    }
    return out;
  }, [selected, leafById, selectable]);

  /* A dropped tick leaves the map too, so a remainder that happens to return to
     its old number cannot resurrect a decision nobody took twice. */
  useEffect(() => {
    setSelected((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, tick] of prev) {
        const row = leafById.get(id);
        if (row && selectable(row) && (row.toBuy ?? 0) === tick.toBuy) continue;
        next.delete(id);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [leafById, selectable]);

  /**
   * THE READY STOCK SECTION'S CONSEQUENCE, APPLIED AT ONCE.
   *
   * The refetch that recomputes `To buy` is a round trip away, and `Issue PO`
   * is one click. So the moment a reservation succeeds, every tick standing on
   * an item line it answered is dropped here — before the new numbers arrive,
   * never after.
   */
  const dropTicksForLines = useCallback((orderId: string, orderLineIds: readonly string[]) => {
    const answered = new Set(orderLineIds);
    setSelected((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const id of prev.keys()) {
        const row = leafById.get(id);
        if (!row || row.orderId !== orderId) continue;
        if (!row.lineIds.some((lineId) => answered.has(lineId))) continue;
        next.delete(id);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [leafById]);

  const selections = useMemo<SoBatchSelection[]>(
    () => [...live].map(([demandId, allocations]) => ({ demandId, allocations })),
    [live],
  );
  const summary = useMemo(
    () => soBatchSelectionSummary(selections, leafById),
    [selections, leafById],
  );

  /**
   * THE DESTINATION A TICK ALLOCATES TO (YH, 2026-09-02).
   *
   * A tick is an allocation, so it needs a destination id. It used to demand
   * the DEFAULT one specifically - and nothing in the schema requires a default
   * row to exist: `purchasing_destinations_one_default` is a partial index that
   * enforces AT MOST one, never at least one. So a perfectly healthy list with
   * nobody's `is_default` set killed every checkbox on the page.
   *
   * That gate was also stricter than its own siblings. The Deliver To dropdown
   * and the Split editor's Apply both tick a line WITHOUT ever reading the
   * default - which is how the page ended up half-alive rather than plainly
   * broken: two controls that worked and one that refused, over one fact.
   *
   * A default is a CONVENIENCE - "everything to Carres Klang unless you say
   * otherwise" - not a permission. When there is no default, the first active
   * destination is the sensible opening arrangement and the operator changes it
   * per row exactly as they always could. Only a genuinely EMPTY list can stop
   * a tick now, because then there is truly nowhere for the goods to go.
   */
  const tickDestinationId = useMemo(
    () =>
      data.defaultDestinationId ??
      data.destinations.find((d) => d.active)?.id ??
      null,
    [data.defaultDestinationId, data.destinations],
  );

  const toggleLeaf = useCallback(
    (id: string) => {
      const row = leafById.get(id);
      if (!row || !selectable(row)) return;
      setSelected((prev) => {
        const next = new Map(prev);
        if (next.has(id)) next.delete(id);
        else if (tickDestinationId) {
          next.set(id, {
            toBuy: row.toBuy ?? 0,
            allocations: defaultAllocations(row, tickDestinationId),
          });
        }
        return next;
      });
    },
    [leafById, tickDestinationId, selectable],
  );

  /** The parent switch: all of the order's eligible leafs, on or off. */
  const setOrderSelected = useCallback(
    (orderId: string, on: boolean) => {
      const eligible = eligibleByOrder.get(orderId) ?? [];
      if (eligible.length === 0) return;
      setSelected((prev) => {
        const next = new Map(prev);
        for (const id of eligible) {
          if (!on) next.delete(id);
          else if (!next.has(id) && tickDestinationId) {
            const row = leafById.get(id);
            if (row) {
              next.set(id, {
                toBuy: row.toBuy ?? 0,
                allocations: defaultAllocations(row, tickDestinationId),
              });
            }
          }
        }
        return next;
      });
    },
    [eligibleByOrder, leafById, tickDestinationId],
  );

  const setLeafAllocations = useCallback(
    (id: string, allocations: DestinationAllocation[]) => {
      /* The arrangement is recorded against the remainder it was arranged for,
         so a split made a minute ago is judged by the same rule a tick is. */
      const toBuy = leafById.get(id)?.toBuy ?? 0;
      setSelected((prev) => new Map(prev).set(id, { toBuy, allocations }));
    },
    [leafById],
  );

  /**
   * Changing the destination on a leaf nobody ticked TICKS IT. The operator's
   * act said "this one goes to Sungai Buloh", and a destination on an unticked
   * leaf would be an arrangement for a buy that is not happening.
   */
  const changeWholeLeaf = useCallback(
    (row: PurchaseDemandRow, destinationId: string) => {
      const current = live.get(row.id);
      /* ⭐ A GOVERNED DESTINATION IS NOT THE PURCHASE'S TO MOVE (0405).
         When Purchasing Settings pins where a supplier's collected goods land,
         the server refuses any purchase that names somewhere else
         (`to-order.ts`, `supplier_collection_destination_mismatch`). So a
         control that moved the line anyway was offering a choice the system
         would then reject — and the order-level Deliver To did exactly that to
         EVERY line at once, which on an order spanning two governed suppliers
         could not be satisfied by any single value the dropdown offered. The
         line keeps its rule; the operator changes the rule in Settings. */
      const fixed = row.supplierCollection?.fixedDestinationId;
      const to = fixed ?? destinationId;
      const next = setDestination(
        { demandId: row.id, allocations: current ?? [] },
        to,
        row.toBuy ?? 0,
      );
      setLeafAllocations(row.id, next.allocations);
    },
    [live, setLeafAllocations],
  );

  const destinationName = useCallback(
    (id: string | null) => data.destinations.find((d) => d.id === id)?.name ?? "",
    [data.destinations],
  );

  /** The leaf's CURRENT arrangement — the live tick, else the standing default. */
  const leafAllocations = useCallback(
    (row: PurchaseDemandRow): DestinationAllocation[] =>
      live.get(row.id) ??
      (tickDestinationId ? defaultAllocations(row, tickDestinationId) : []),
    [live, tickDestinationId],
  );

  /* ── The parent selection surface ─────────────────────────────────────── */
  const orderSelection = useCallback(
    (orderId: string) =>
      soBatchOrderSelection({
        eligibleIds: eligibleByOrder.get(orderId) ?? [],
        selectedIds: new Set(live.keys()),
      }),
    [eligibleByOrder, live],
  );
  const selectedOrderKeys = useMemo(() => {
    const s = new Set<string>();
    for (const o of orders) {
      if (orderSelection(o.orderId).checked) s.add(o.orderId);
    }
    return s;
  }, [orders, orderSelection]);

  /* ── The ten approved columns ─────────────────────────────────────────── */
  /* The SAME projection the SUPPLIER rail filters by (Card 02-C §7) — the
     rail can never learn a supplier this column does not print. */
  const supplierSummaryOf = useCallback(
    (o: SoBatchOrderRow) => soBatchCellSummary(soBatchOrderSupplierNames(o)),
    [],
  );
  const columns = useMemo<DataGridColumn<SoBatchOrderRow>[]>(
    () => [
      {
        /* THE IDENTITY — explicitly sticky, so horizontal scrolling never
           loses WHICH record a row is (Card §9). */
        key: "soNo",
        label: W.colSoNo,
        width: 90,
        sortable: true,
        chooserGroup: "Order",
        accessor: (o) => (
          <span data-testid={`so-batch-so-${o.orderId}`}>
            {o.so == null ? null : (
              <button
                type="button"
                className="font-mono font-medium text-kit-blue-11 underline-offset-2 hover:underline"
                data-testid={`so-batch-so-link-${o.orderId}`}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/operation/orders/so/${o.orderId}`);
                }}
              >
                {`SO-${o.so}`}
              </button>
            )}
          </span>
        ),
        searchValue: (o) =>
          [
            o.so == null ? "" : `SO-${o.so} ${o.so}`,
            o.customer ?? "",
            ...o.lines.map((l) => l.sku),
            ...o.outstandingSuppliers,
            ...o.pos.map((p) => `${p.poId} ${p.supplierName ?? ""}`),
          ].join(" "),
        sortFn: (a, b) => (a.so ?? 0) - (b.so ?? 0),
        exportValue: (o) => (o.so == null ? "" : `SO-${o.so}`),
      },
      {
        key: "customer",
        label: W.colCustomer,
        width: 130,
        sortable: true,
        chooserGroup: "Order",
        accessor: (o) => (
          <span className="truncate" data-testid={`so-batch-customer-${o.orderId}`}>
            {o.customer ?? ""}
          </span>
        ),
        searchValue: (o) => o.customer ?? "",
        exportValue: (o) => o.customer ?? "",
      },
      {
        key: "proceededAt",
        label: W.colProceedDate,
        width: 104,
        sortable: true,
        chooserGroup: "Order",
        accessor: (o) => (
          <span data-testid={`so-batch-proceed-${o.orderId}`}>
            {o.proceededAt ? fmtDate(o.proceededAt) : <Absent>Not recorded</Absent>}
          </span>
        ),
        dateValue: (o) => o.proceededAt,
        filterType: "date",
        sortFn: (a, b) => (a.proceededAt ?? "").localeCompare(b.proceededAt ?? ""),
        exportValue: (o) => o.proceededAt ?? "",
      },
      {
        key: "requestedDelivery",
        label: W.colRequestedDelivery,
        width: 158,
        sortable: true,
        chooserGroup: "Order",
        accessor: (o) => (
          <span data-testid={`so-batch-requested-${o.orderId}`}>
            {o.requestedDeliveryDate ? (
              fmtDate(o.requestedDeliveryDate)
            ) : (
              <Absent>No delivery date yet</Absent>
            )}
          </span>
        ),
        dateValue: (o) => o.requestedDeliveryDate,
        filterType: "date",
        sortFn: (a, b) =>
          (a.requestedDeliveryDate ?? "").localeCompare(b.requestedDeliveryDate ?? ""),
        exportValue: (o) => o.requestedDeliveryDate ?? "",
      },
      {
        /* The CUSTOMER's locality — never the supplier's destination. The one
           shared rule Sales Orders reads (`conciseLocality`), so two registers
           cannot print two localities for one order. */
        key: "deliveryLocation",
        label: W.colDeliveryLocation,
        width: 160,
        sortable: true,
        chooserGroup: "Order",
        accessor: (o) => {
          const locality = conciseLocality(o.deliveryCity, o.deliveryState);
          return (
            <span data-testid={`so-batch-location-${o.orderId}`}>
              {locality === NOT_RECORDED ? <Absent>{NOT_RECORDED}</Absent> : locality}
            </span>
          );
        },
        searchValue: (o) => conciseLocality(o.deliveryCity, o.deliveryState),
        filterValue: (o) => conciseLocality(o.deliveryCity, o.deliveryState),
        exportValue: (o) => conciseLocality(o.deliveryCity, o.deliveryState),
      },
      {
        key: "supplier",
        label: W.colSupplier,
        width: 110,
        sortable: true,
        chooserGroup: "Buying",
        /* ⭐ A SUMMARY SAYS ONE THING (owner correction 2026-09-11). It used
           to print as much of the list as the column could hold plus
           `+2 more`, so the visible text, the copied text and the accessible
           name were three different answers and none of them was complete.
           One value prints itself; several print how many there are, and the
           expansion holds the exact mapping. */
        accessor: (o) => {
          const s = supplierSummaryOf(o);
          return (
            <span className="truncate" data-testid={`so-batch-supplier-${o.orderId}`}>
              {summaryText(s, (n) => `${n} suppliers`) ?? null}
            </span>
          );
        },
        searchValue: (o) =>
          [...o.outstandingSuppliers, ...o.pos.map((p) => p.supplierName ?? "")].join(" "),
        filterValue: (o) => summaryText(supplierSummaryOf(o), (n) => `${n} suppliers`) ?? "",
        exportValue: (o) => summaryText(supplierSummaryOf(o), (n) => `${n} suppliers`) ?? "",
      },
      {
        /**
         * ⭐ A PARENT SUMMARY NEVER EDITS — owner correction 2026-09-11.
         *
         * This cell used to be the arrangement CONTROL: one eligible demand
         * drew the full editor, several drew a `<select>` whose own text was
         * made transparent so a summary could be painted on top of it. Three
         * things were wrong with that and only one of them was cosmetic.
         *
         *   · A summary that edits is a second writer for a fact the row's own
         *     demand owns (ERP Architecture Law B). One click on a row that
         *     spans two demands rewrote BOTH of them.
         *   · The visible text, the keyboard value and the accessible name
         *     were three different answers. The `<select>`'s value was one
         *     destination id; the overlay read `Carres Klang +2 more`; the
         *     screen reader heard the joined list.
         *   · A PLANNED destination looked exactly like an ISSUED one. The
         *     document's destination is a fact; the plan is not yet anything.
         *
         * So the cell states the ISSUED document's destination and nothing
         * else, and the one place an unissued demand is arranged is its own
         * row in the expansion — where `Split` already lives.
         */
        key: "deliverTo",
        label: W.deliverTo,
        width: 150,
        chooserGroup: "Buying",
        accessor: (o) => {
          const issued = soBatchCellSummary(
            o.pos.map((p) => destinationName(p.destinationId)),
          );
          if (issued.kind !== "none") {
            return (
              <span className="truncate" data-testid={`so-batch-deliver-to-${o.orderId}`}>
                {summaryText(issued, () => W.multiple)}
              </span>
            );
          }
          /* THE EMPTY CELL SAYS WHY IT IS EMPTY (YH, 2026-09-02). Nothing is
             issued, so there are two very different reasons and they are not
             the same answer: the order is simply not bought yet, or it CANNOT
             be bought because a SKU has no catalog cost, no supplier, no
             production days, no customer date or no SKU. The blocker is named
             here rather than only inside the expansion. */
          const blocked = (leafsByOrder.get(o.orderId) ?? []).filter(
            (leaf) => !isPurchaseDemandTimingState(leaf.state),
          );
          if (blocked.length > 0) {
            const reasons = [...new Set(blocked.map((leaf) => stateWords[leaf.state]))];
            return (
              <span
                className="truncate text-kit-amber-11"
                data-testid={`so-batch-deliver-to-${o.orderId}`}
                title="Open the row to see what to do about it"
              >
                {reasons.length === 1 ? reasons[0] : W.multiple}
              </span>
            );
          }
          /* No document, so nothing to describe — `PO No` already says so. */
          return <span data-testid={`so-batch-deliver-to-${o.orderId}`} />;
        },
        exportValue: (o) =>
          summaryText(
            soBatchCellSummary(o.pos.map((p) => destinationName(p.destinationId))),
            () => W.multiple,
          ) ?? "",
      },
      {
        key: "poNo",
        label: W.colPoNo,
        width: 144,
        sortable: true,
        chooserGroup: "Documents",
        /* ⭐ THE DOCUMENT COLUMN SAYS THERE IS NO DOCUMENT — once, and here.
           `Deliver To` and `PO Delivery Date` describe a purchase order, so on
           a row that has none they stay blank rather than repeating the same
           sentence three times across one row. */
        accessor: (o) => (
          <span className="block truncate" data-testid={`so-batch-po-${o.orderId}`}>
            {o.pos.length ? <PoNumbersCell order={o} /> : <Absent>Not ordered yet</Absent>}
          </span>
        ),
        searchValue: (o) => o.pos.map((p) => p.poId).join(" "),
        filterValue: (o) =>
          summaryText(soBatchCellSummary(o.pos.map((p) => p.poId)), (n) => `${n} POs`) ?? "",
        exportValue: (o) => o.pos.map((p) => p.poId).join(" · "),
      },
      {
        /* `purchase_orders.official_delivery_date` — the ORIGINAL
           supplier-facing date, stamped at birth and never changed
           (0428/0430, MASTER §5.7). It read `eta_date` until 2026-09-09,
           which is the LIVE planning arrival: recording a factory ready date
           moved it, so this column silently disagreed with the same column on
           Purchase Orders and with the paper the supplier holds. Never
           `Goods Must Arrive`, never an "if ordered today" estimate. */
        key: "poDeliveryDate",
        label: W.colPoDeliveryDate,
        width: 126,
        sortable: true,
        chooserGroup: "Documents",
        accessor: (o) => {
          const s = soBatchCellSummary(o.pos.map((p) => p.officialDeliveryDate));
          /* A blank cell means NO PURCHASE ORDER. A purchase order whose
             original date the 0428 recovery could not evidence is a different
             answer and owes a sentence, so it says so in the same word the
             Purchase Orders register uses for it (21 of 62 live POs). Merging
             the two would make an unknown original look like nothing ordered. */
          /* Several documents print how many there are, not the first date
             and a truncation — the exact per-item date is in the expansion. */
          const text =
            s.kind === "many"
              ? W.multiple
              : s.kind === "one"
                ? fmtDate(s.value)
                : o.pos.length > 0
                  ? W.poDeliveryDateUnknown
                  : null;
          return (
            <span className="truncate" data-testid={`so-batch-po-date-${o.orderId}`}>
              {text}
            </span>
          );
        },
        sortFn: (a, b) =>
          (a.pos[0]?.officialDeliveryDate ?? "").localeCompare(b.pos[0]?.officialDeliveryDate ?? ""),
        exportValue: (o) => {
          const s = soBatchCellSummary(o.pos.map((p) => p.officialDeliveryDate));
          return (
            summaryText(s, () => W.multiple) ??
            (o.pos.length > 0 ? W.poDeliveryDateUnknown : "")
          );
        },
      },
    ],
    [
      navigate,
      data.destinations,
      leafsByOrder,
      leafAllocations,
      changeWholeLeaf,
      setLeafAllocations,
      destinationName,
      supplierSummaryOf,
    ],
  );

  /* ── The expansion — the shared child table, and only it ──────────────── */
  const renderExpansion = (o: SoBatchOrderRow) => (
    <SoBatchOrderExpansion
      order={o}
      leafs={leafsByOrder.get(o.orderId) ?? []}
      selectedIds={new Set(live.keys())}
      onToggleLeaf={toggleLeaf}
      leafAllocations={leafAllocations}
      onWholeLeaf={changeWholeLeaf}
      onSplitLeaf={setLeafAllocations}
      destinations={data.destinations}
      destinationName={destinationName}
      safetyDays={data.safetyDays}
      onReserved={dropTicksForLines}
    />
  );

  /* ── The page ─────────────────────────────────────────────────────────── */
  return (
    <div
      className={`${styles.page} flex h-full min-h-0 w-full flex-1 flex-col`}
      data-testid="so-batch-page"
    >
      <PurchasingTabs />
      {/* `relative` is what lets the rail LEAVE the flow on a narrow window —
          see the rail's own class below. */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Card 02-C — the readable 240px shell. Navigation, not batch
            selection: no rail row carries a checkbox, one filter per section,
            sections combine, and the fixed rows print their live count, zero
            included. */}
        {filterRailOpen && <FilterRail
          testId="so-batch-rail"
          onHide={() => setFilterRailVisible(false)}
          /* ⭐ THE RAIL DOES NOT EAT THE TABLE ON A NARROW WINDOW — the shared
             purchasing responsive pattern, already shipped on Purchase Orders
             (`PurchaseOrdersPage.tsx`). Below `md` the 240px rail floats over
             the Register instead of taking 240 of its 459 pixels, so the
             primary action and the goods stay reachable; `Hide filters` puts
             it away exactly as it does on a wide screen. Above `md` nothing
             changes at all. */
          className="max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-30"
        >
          {/* ⛔ `TO ORDER / All not ordered` IS GONE (owner correction
              2026-09-11). It was the one row on this rail that named no fact
              about a Sales Order — it named the page's own default, which is
              what an operator sees with nothing selected — and it sat ABOVE
              `ORDER TIMING`, the section that answers what to buy today. The
              outstanding arithmetic behind it is untouched and still governs
              the tick and the Ready Stock door. */}
          <FilterRailGroup title={SO_BATCH_RAIL.timing.heading}>
            {SO_BATCH_RAIL.timing.states.map((s) => (
              <FilterRailRow
                key={s}
                active={filter.timing === s}
                onClick={() => toggleTiming(s)}
                testId={`so-batch-state-${s}`}
                label={railWords[s] ?? ""}
                count={rail.timingCounts[s]}
                title={`${rail.timingCounts[s]} ${W.footerUnit} · ${stateWords[s]}`}
              />
            ))}
          </FilterRailGroup>
          {/* ── PRODUCT AND SUPPLIER ARE COMPACT DROPDOWNS (owner ruling
              2026-09-11, the shared purchasing rail grammar) ──────────────
              Both are FACT lists rather than the daily worklist, and the
              supplier list grows with the business: as rows they pushed
              `ORDER TIMING` — what to buy today — below the fold of a 240px
              rail. The control writes the same single-slot section value the
              rows wrote, so `All …` still clears only its own section and
              sections still combine with AND. The counts ride in the option
              text; `TO ORDER` and `ORDER TIMING` keep their visible rows. */}
          <FilterRailGroup title={SO_BATCH_RAIL.product.heading}>
            {/* The CATALOG's categories, never SKU-text inference. `All
                products` is the section's clear — and where the uncommon
                categories live. */}
            <FilterRailSelect
              label={SO_BATCH_RAIL.product.heading}
              allLabel={SO_BATCH_RAIL.product.all}
              testId="so-batch-product-select"
              value={filter.product}
              options={SO_BATCH_RAIL.product.categories.map((c) => ({
                value: c.category,
                label: c.word,
                count: rail.productCounts[c.category],
              }))}
              onChange={(product) =>
                setFilter((prev) => ({
                  ...prev,
                  product: product as SoBatchProductCategory | null,
                }))
              }
            />
          </FilterRailGroup>
          <FilterRailGroup title={SO_BATCH_RAIL.supplier.heading}>
            {/* Actual names from the Register's own supplier projection —
                dynamic, alphabetical, never hardcoded. A name with no match
                under the other filters drops off; the SELECTED name stays,
                with its honest 0. */}
            <FilterRailSelect
              label={SO_BATCH_RAIL.supplier.heading}
              allLabel={SO_BATCH_RAIL.supplier.all}
              testId="so-batch-supplier-select"
              value={filter.supplier}
              options={rail.suppliers.map((s) => ({
                value: s.name,
                label: s.name,
                count: s.count,
              }))}
              onChange={(supplier) => setFilter((prev) => ({ ...prev, supplier }))}
            />
          </FilterRailGroup>
          <FilterRailGroup title={SO_BATCH_RAIL.region.heading}>
            {/* ⭐ REGION JOINS PRODUCT AND SUPPLIER (owner correction
                2026-09-11). It is the third FACT list on this rail and it grows
                with the business — every outstation state Carres delivers to
                gets its own row — so as rows it pushed `SETUP TO FIX`, and on a
                short window `ORDER TIMING` itself, below the fold of a 240px
                rail. The control writes the same single-slot section value the
                rows wrote, carries the same counts in its option text, and
                `All regions` still clears only its own section. */}
            <FilterRailSelect
              label={SO_BATCH_RAIL.region.heading}
              allLabel={SO_BATCH_RAIL.region.all}
              testId="so-batch-region-select"
              value={filter.region}
              options={rail.regions.map((region) => ({
                value: region.name,
                label: region.name,
                count: region.count,
              }))}
              onChange={(region) => setFilter((prev) => ({ ...prev, region }))}
            />
          </FilterRailGroup>
          {/* The one Purchasing-owned setup exception, and only while it
              exists — an empty exception section is noise wearing a heading. */}
          {rail.setupExists && (
            <FilterRailGroup title={SO_BATCH_RAIL.setup.heading}>
              {SO_BATCH_RAIL.setup.states.map((s) => (
                <FilterRailRow
                  key={s}
                  active={filter.setup}
                  onClick={() => setFilter((prev) => ({ ...prev, setup: !prev.setup }))}
                  testId={`so-batch-state-${s}`}
                  label={railWords[s] ?? ""}
                  count={rail.setupCount}
                  title={`${rail.setupCount} ${W.footerUnit} · ${stateWords[s]}`}
                />
              ))}
            </FilterRailGroup>
          )}
        </FilterRail>}

        <div className="flex min-w-0 flex-1 flex-col p-2">
          {/* ⭐ A PAGE THAT CANNOT BUY SAYS SO (YH, 2026-09-01 — "the boxes are
              all not clickable"), AND ONE THAT CAN, DOESN'T (YH, 2026-09-02 —
              "is making it tickable, that is all i ask for").
              Every control that starts a purchase needs a Deliver To
              destination to allocate a tick to. That is a real requirement and
              an EMPTY list is a real blocker — the goods have nowhere to go, so
              the sentence names the setting that fixes it.
              A MISSING DEFAULT IS NOT THAT. It used to be treated as one, and
              it killed every checkbox on a page whose destination list was
              perfectly healthy. `tickDestinationId` now falls back to the first
              active destination, so the tick works and the operator changes it
              per row as they always could — which is exactly what the Deliver
              To dropdown and Split's Apply were already doing without ever
              reading the default. The warning that remains is the one that is
              still true. */}
          {data.destinations.length === 0 ? (
            <p
              className="mb-2 rounded-control bg-kit-amber-3 px-3 py-2 text-meta text-kit-amber-11"
              data-testid="so-batch-no-destination"
            >
              No Deliver To destinations are set, so nothing can be bought on
              this page. Set one in Purchasing → Settings.
            </p>
          ) : !data.defaultDestinationId ? (
            /* Not a blocker — a heads-up. Buying works; it just opens on a
               destination nobody nominated, so say WHICH one before the
               operator discovers it on a purchase order. */
            <p
              className="mb-2 rounded-control bg-kit-slate-3 px-3 py-2 text-meta text-kit-slate-11"
              data-testid="so-batch-no-default-destination"
            >
              No Deliver To destination is marked as the default, so ticks open
              on {destinationName(tickDestinationId)}. Change it on any row, or
              set a default in Purchasing → Settings.
            </p>
          ) : null}
          {/* ⛔ `flex flex-col` IS LOAD-BEARING, NOT DECORATION (YH, 2026-09-02
              — "is it me or is /operation?tab=purchase not scrollable").
              DataGrid's own scroller fills its shell with `flex: 1 1 auto`
              (`DataGrid.module.css` `.root` / `.scroll`), which does nothing
              inside a plain block. So the grid sized itself to its CONTENT —
              measured 948px of rows in a box reporting 948px, nothing to
              scroll — and `:723`'s `overflow-hidden` cut off whatever did not
              fit the window. Every register that works mounts the grid inside
              a flex column (`SalesOrdersRegister.tsx:613`); this one put a
              bare wrapper in between and lost the chain. */}
          <div
            className="flex min-h-0 flex-1 flex-col"
            data-testid="so-batch-grid"
          >
            <DataGrid<SoBatchOrderRow>
              appearance="reference"
              rows={shown}
              columns={columns}
              storageKey={STORAGE_KEY}
              rowKey={(o) => o.orderId}
              rowTestId={(o) => `so-batch-row-${o.orderId}`}
              exportName={W.destination}
              searchPlaceholder={W.search}
              toolbarStart={
                !filterRailOpen ? (
                  <button
                    type="button"
                    aria-label="Show filters"
                    title="Show filters"
                    data-testid="so-batch-show-filters"
                    onClick={() => setFilterRailVisible(true)}
                    className="grid h-7 w-7 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
                  >
                    <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                ) : null
              }
              isLoading={isLoading}
              emptyMessage={W.empty}
              groupBanner={false}
              stickyIdentity={{ columnKey: "soNo" }}
              chooserGroupOrder={["Order", "Documents", "Buying"]}
              onRowDoubleClick={openOrder}
              contextMenu={rowMenu}
              expandable={{
                flush: true,
                renderExpansion,
                testId: (o) => `so-batch-expand-${o.orderId}`,
              }}
              selectable={{
                selectedKeys: selectedOrderKeys,
                onToggle: (orderId) =>
                  setOrderSelected(orderId, !orderSelection(orderId).checked),
                onToggleAll: (keys, allSelected) => {
                  /* Visible rows only — a facet must never cause hidden
                     demand to be selected by the header switch. */
                  for (const k of keys) setOrderSelected(k, !allSelected);
                },
                isSelectable: (o: SoBatchOrderRow) =>
                  (eligibleByOrder.get(o.orderId) ?? []).length > 0,
                isIndeterminate: (o: SoBatchOrderRow) =>
                  orderSelection(o.orderId).indeterminate,
                testId: (o: SoBatchOrderRow) => `so-batch-select-${o.orderId}`,
              }}
              selectionSummary={() => summary.text}
              selectionPrimary={summary.lines > 0 ? (
                <span
                  className="flex shrink-0 items-center gap-2"
                  data-testid="so-batch-selection-actions"
                >
                  <SoBatchPoDutyChip data={data} />
                  {data.mayIssue ? (
                    <button
                      type="button"
                      data-testid="so-batch-issue"
                      className="inline-flex h-7 shrink-0 items-center rounded-control bg-kit-blue-9 px-3 text-meta font-medium text-white hover:opacity-90"
                      onClick={() => onIssue(selections)}
                    >
                      {W.issuePo}
                    </button>
                  ) : null}
                </span>
              ) : null}
              statusSummary={(filtered) => {
                /* ⭐ THE FOOTER ANSWERS *WHAT AM I LOOKING AT* — owner
                   correction 2026-09-11. It used to tally `0 Partial ·
                   2 Ordered`, two words that came from the retired Status
                   presentation and that nothing on the page could act on;
                   worse, `2 Ordered` out of a filtered view read as a claim
                   about the whole business. What an operator needs from a
                   footer is the SCOPE: how many records this view holds, out
                   of how many the Register has. Selection is summarised once,
                   in the toolbar, and never repeated down here. */
                const line =
                  filtered.length === orders.length
                    ? `${orders.length} ${W.footerUnit}`
                    : `${filtered.length} of ${orders.length} ${W.footerUnit}`;
                return (
                  <span className="block truncate" data-testid="so-batch-footer" title={line}>
                    {line}
                  </span>
                );
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SoBatchPoDutyChip({ data }: { data: SoBatchPurchaseResponse }) {
  const person = data.poDutyUnavailable || data.poDutyNameUnavailable
    ? null
    : (data.actingPoDuty ?? data.currentPoDuty);
  const label = poDutyLabel(data);

  if (!person) {
    return (
      <span
        data-testid="so-batch-duty-chip"
        aria-label={label}
        title={label}
        className="shrink-0 text-meta text-kit-red-11"
      >
        {label}
      </span>
    );
  }

  const colour = avatarColor(person.userId);
  return (
    <span
      data-testid="so-batch-duty-chip"
      aria-label={label}
      title={label}
      className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border border-kit-slate-6 px-2 text-label font-semibold leading-none"
      style={{ background: colour.bg, color: colour.fg }}
    >
      {personInitials(person.name, person.name)}
    </span>
  );
}

function poDutyLabel(data: SoBatchPurchaseResponse): string {
  if (data.poDutyUnavailable) return "PO duty could not be checked.";
  if (data.actingPoDuty) {
    const normal = data.currentPoDuty ? ` for ${data.currentPoDuty.name}` : "";
    return `${data.actingPoDuty.name} · PO Duty cover${normal}`;
  }
  if (data.poDutyNameUnavailable) return "PO duty name is missing.";
  if (data.currentPoDuty) return `${data.currentPoDuty.name} · PO Duty`;
  return "Nobody holds PO duty this month.";
}

/**
 * ▸ ONE SALES ORDER, THREE CONNECTED SECTIONS — owner correction 2026-09-11.
 *
 * ```
 *   ▼ SO-1303
 *     │
 *     ├─ Goods on SO-1303           the ACTIONABLE demand: what the customer
 *     │                             ordered, what is left, and the one tick
 *     │                             and one destination editor per demand
 *     ├─ ▸ Ready Stock              what is on the shelf for it
 *     │
 *     ╰─ ▾ Purchase order details   the READ-ONLY record: every document, every
 *                                   Unit, and no control at all
 *   ▸ SO-1302
 * ```
 *
 * ── WHY THE RECORD LEFT THE ITEM TABLE ──────────────────────────────────────
 *
 * It was inside it twice. `On PO` stacked every covering purchase order in one
 * cell — a line fourteen documents touch drew a fourteen-line-tall item row and
 * filled the screen with one item — and the same fourteen numbers were then
 * repeated in the rows underneath. A collection of documents was deciding how
 * tall a demand row is, and the demand it belonged to had become the smallest
 * thing on screen.
 *
 * Nothing was truncated to fix it. `On PO` states the QUANTITY documents carry,
 * which is the number the arithmetic `Qty · Ready Stock · On PO · To buy`
 * actually needs, and it is a door: pressing it opens the details, where each
 * document is its own row with its own Unit, quantity, destination, supplier
 * and original date. Every reference is still on the page, in the section that
 * is about references.
 *
 * ── AND THE TWO TABLES ANSWER TWO DIFFERENT QUESTIONS ───────────────────────
 *
 * The goods table is about what can still be BOUGHT, so every row on it carries
 * a checkbox and an arrangement editor. The details table is about what has
 * already BEEN bought, so nothing on it carries either — a sent purchase order
 * is not re-arranged from a register, and a Unit that exists is not bought
 * again. Keeping them in one table is what put a destination editor beside a
 * historical document in the first place.
 *
 * Unit IDs are read LAZILY through the Sales Order expansion endpoint — the
 * same read the Sales Orders register uses (Law D: Stock owns the fact, both
 * disclosures ask the same door), and only when a row is actually opened.
 */
function SoBatchOrderExpansion({
  order,
  leafs,
  selectedIds,
  onToggleLeaf,
  leafAllocations,
  onWholeLeaf,
  onSplitLeaf,
  destinations,
  destinationName,
  safetyDays,
  onReserved,
}: {
  order: SoBatchOrderRow;
  leafs: PurchaseDemandRow[];
  selectedIds: ReadonlySet<string>;
  onToggleLeaf: (leafId: string) => void;
  leafAllocations: (row: PurchaseDemandRow) => DestinationAllocation[];
  onWholeLeaf: (row: PurchaseDemandRow, destinationId: string) => void;
  onSplitLeaf: (leafId: string, allocations: DestinationAllocation[]) => void;
  destinations: SoBatchPurchaseResponse["destinations"];
  destinationName: (id: string | null) => string;
  safetyDays: number;
  /** Ready Stock answered these item lines — every tick on them is now stale. */
  onReserved: (orderId: string, orderLineIds: readonly string[]) => void;
}) {
  /* Its own handle on the router: this box is a top-level component, not a
     closure inside the register, so the multi-PO door below cannot borrow the
     register's `navigate`. */
  const navigate = useNavigate();
  const expansion = useSalesOrderExpansion(order.orderId);
  const unitIdsByLine = useMemo(
    () => new Map((expansion.data?.lines ?? []).map((l) => [l.lineId, l.unitIds])),
    [expansion.data],
  );
  /**
   * ⭐ UNKNOWN IS NOT `None` (2026-09-11). Three different things can be true
   * of a Unit cell — the goods exist, no Unit is tied to this line yet, or the
   * read has not answered — and printing the third as the second is how an
   * operator concludes goods do not exist because a request was slow.
   */
  const unitRead: UnitReadState = expansion.isError
    ? "error"
    : expansion.isPending
      ? "loading"
      : "ready";
  /**
   * ⭐ AN ANSWER THAT DID NOT COVER THIS LINE IS NOT AN ANSWER ABOUT IT
   * (2026-09-11). The read answers for the ORDER; a line it carries no entry
   * for has not been looked at, and `Not allocated` — which claims Carres
   * looked and found nothing — would be a fact the read never established.
   */
  const linesAnswered = useMemo(
    () => new Set((expansion.data?.lines ?? []).map((l) => l.lineId)),
    [expansion.data],
  );
  const leafByLineId = useMemo(() => {
    const m = new Map<string, PurchaseDemandRow>();
    for (const leaf of leafs) for (const id of leaf.lineIds) m.set(id, leaf);
    return m;
  }, [leafs]);
  const poById = useMemo(() => new Map(order.pos.map((p) => [p.poId, p])), [order.pos]);

  /**
   * The details section opens with the row, because the parent's `14 POs`
   * summary is a door and a door that opens onto a closed box has not answered
   * anything. `On PO` in the goods table above scrolls it into view — and opens
   * it again if the operator has collapsed it.
   */
  const [poOpen, setPoOpen] = useState(true);
  const poSection = useRef<HTMLDivElement | null>(null);
  const openPoDetails = useCallback(() => {
    setPoOpen(true);
    requestAnimationFrame(() =>
      poSection.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" }),
    );
  }, []);

  /* ⭐ THE TICK AND THE EDITOR BELONG TO THE DEMAND, NOT TO EVERY ROW THAT
     SHOWS IT (owner correction 2026-09-11). A matched set spans several item
     lines and is ONE demand: it is arranged once, ticked once, and its other
     lines say they are part of it rather than offering a second control that
     moves the same number. */
  const editorDrawn = new Set<string>();
  const linesPerLeaf = new Map<string, number>();
  for (const l of order.lines) {
    const leaf = leafByLineId.get(l.orderLineId);
    if (leaf) linesPerLeaf.set(leaf.id, (linesPerLeaf.get(leaf.id) ?? 0) + 1);
  }

  const lines: GoodsMiniLine[] = order.lines.map((l) => {
    const leaf = leafByLineId.get(l.orderLineId);
    const linePos = l.pos.map((p) => poById.get(p.poId)).filter(Boolean);
    const eligible = leaf != null && isSelectableForOrder(leaf, order.status);
    const drawEditor = eligible && !editorDrawn.has(leaf.id);
    if (drawEditor) editorDrawn.add(leaf.id);
    const setSize = leaf ? (linesPerLeaf.get(leaf.id) ?? 1) : 1;
    const arranged = eligible ? leafAllocations(leaf) : [];
    /* ⭐ THE DOCUMENT LINE'S OWN `Deliver To`, never the parent document's
       (owner correction 2026-09-11). The server resolves it per lineage entry
       and falls back to the document only where the LINE records none. */
    const issuedDest = soBatchCellSummary(
      l.pos.map((p) => destinationName(p.destinationId ?? poById.get(p.poId)?.destinationId ?? null)),
    );
    const supplier = soBatchCellSummary([
      ...(leaf ? [leaf.supplier] : []),
      ...linePos.map((p) => p!.supplierName),
    ]);
    return {
      key: l.orderLineId,
      testId: `so-batch-part-${l.sku}`,
      category: l.category ? categoryWord(l.category) : "Other goods",
      unitIds: [],
      unitAbsence: "—",
      /* The four numbers that used to hide inside `Covered by`: what the
         customer ordered, what the shelf already answered, how much documents
         have ORDERED for this line, and what is left.

         ⭐ `Ordered Qty` is HISTORY, and its head says so (owner correction
         2026-09-11). It is the exact `po_line_sources` quantity for THIS item
         line — every non-cancelled document, `Completed` ones included, never
         netted by what has arrived. It is NOT `On PO`, which is the
         dictionary's head for the engine's pooled, netted, still-outstanding
         coverage; printing this figure under that head said "still on order"
         about goods that may already be in the warehouse. */
      fromStock: l.stockTaken > 0 ? l.stockTaken : null,
      /* A covered build is not tickable, but its figure still explains the
         row — so it prints, with the refusal beside it. */
      toBuy: drawEditor || leaf?.fullyOnPo === true ? (leaf!.toBuy ?? 0) : null,
      /* ⭐ WHICH KIND OF NUMBER `To buy` IS, AND WHAT WOULD HAPPEN.
         The engine's own `fullyOnPo` says every unit of this build is already
         on an OPEN purchase order, so the figure is not a remainder — and since
         0430 `issue-batch` REFUSES such a selection by name (`already_on_po`,
         422, naming the covering document) and creates nothing. The row is not
         tickable (`isSelectableForOrder`) and says the door's own words, so the
         operator is not invited into an act that fails. Printed on the line
         whatever its tick state, because the number is what raised the
         question. */
      toBuyNote: leaf?.fullyOnPo === true ? W.toBuyAlreadyOnPo : undefined,
      toBuyNoteWhy: leaf?.fullyOnPo === true ? W.toBuyAlreadyOnPoWhy : undefined,
      orderedQty: l.pos.reduce((sum, p) => sum + Math.max(0, p.qty), 0),
      orderedQtyAbsence: l.stockTaken > 0 && l.pos.length === 0 ? "—" : "Not ordered yet",
      /* An eligible line carries its own editor (Split included); a covered
         line states the destination the issued document carries. */
      ...(drawEditor
        ? {
            deliverToNode: (
              <DestinationAllocationEditor
                row={leaf}
                destinations={destinations}
                allocations={arranged}
                onWholeRow={(destinationId) => onWholeLeaf(leaf, destinationId)}
                onSplit={(allocations) => onSplitLeaf(leaf.id, allocations)}
              />
            ),
          }
        : {}),
      deliverTo: drawEditor
        ? []
        : eligible
          ? arranged.map((a) =>
              arranged.length > 1
                ? `${destinationName(a.destinationId)} ×${a.qty}`
                : destinationName(a.destinationId),
            )
          : issuedDest.kind === "none"
            ? []
            : issuedDest.kind === "one"
              ? [issuedDest.value]
              : [W.multiple],
      deliverToAbsence: eligible ? "Not chosen" : "—",
      supplier: summaryText(supplier, (n) => `${n} suppliers`) ?? undefined,
      supplierAbsence: "—",
      sku: l.sku,
      qty: l.qty,
      item: l.item,
      /* ⭐ THE CONFIGURATION IS WHAT TELLS TWO LINES OF ONE MODEL APART
         (owner correction 2026-09-11). `Jager` and `Jager` are the same words;
         `Queen · Fabric 3` and `King · Fabric 3` are the goods. The line's own
         recorded variant is printed under the item — never re-derived from the
         SKU — and a matched set adds what one tick actually buys. */
      itemDetail:
        [
          l.variant ?? "",
          drawEditor && setSize > 1 ? `With ${setSize - 1} more lines in this set` : "",
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      /* ONE tick per demand. A set's remaining lines print the absence — the
         demand they belong to already carries the control. */
      selectable: drawEditor,
    };
  });

  /* Demand the order Register's line facts cannot carry — a sold SKU Catalog
     has never heard of. The leaf names it, so the expansion prints the leaf. */
  for (const leaf of leafs) {
    if (leaf.lineIds.some((id) => order.lines.some((l) => l.orderLineId === id))) continue;
    for (const part of leaf.parts.length > 0
      ? leaf.parts
      : [{ sku: leaf.skus[0] ?? leaf.item, qty: leaf.qtyNeeded, unitCost: null }]) {
      lines.push({
        key: `${leaf.id}::${part.sku}`,
        testId: `so-batch-part-${part.sku}`,
        category: leaf.category ? categoryWord(leaf.category) : "Other goods",
        unitIds: [],
        unitAbsence: "—",
        orderedQtyAbsence: "Not ordered yet",
        deliverTo: [],
        deliverToAbsence: "—",
        supplierAbsence: "—",
        supplier: leaf.supplier ?? undefined,
        sku: part.sku,
        qty: part.qty,
        item: leaf.item,
        selectable: false,
      });
    }
  }

  /**
   * THE RECORD, RESOLVED ONCE PER ITEM LINE.
   *
   * `po_line_sources` is the only visible attribution (Card 02-B), so a row
   * exists for every unit of it — named by its Unit where the read can evidence
   * one, and stated as a quantity where it cannot. Nothing is counted as
   * coverage without that lineage, and nothing with it is dropped.
   */
  const poRows = order.lines.flatMap((l) =>
    poDetailRowsForLine({
      lineKey: l.orderLineId,
      sku: l.sku,
      item: l.item,
      itemDetail: l.variant,
      lineage: l.pos,
      unitIds: unitIdsByLine.get(l.orderLineId) ?? [],
      unitCoverage: expansion.data?.unitCoverage ?? {},
      unitLines: expansion.data?.unitLines,
      unitScopes: expansion.data?.unitScopes,
      orderLineId: l.orderLineId,
      unitRead,
      lineRead: linesAnswered.has(l.orderLineId) ? "answered" : "absent",
      po: (poId) => poById.get(poId),
      destinationName,
    }),
  );

  if (lines.length === 0) {
    return <div className="px-2 py-2 text-body text-kit-slate-11">No items on this order</div>;
  }

  const stateWords = purchaseDemandStateWords(safetyDays);
  /* An `Ordered` order's leaves are not blockers and must not be listed as
     any. They fail `isSelectableForOrder` because the order is FINISHED
     buying, not because something is wrong with them — printing
     "Issue PO to Ohana" in an amber panel on an order whose purchase orders
     are already sent would be an instruction to duplicate work. The
     `PO No` column and the details section are the explanation, and both read
     the same lineage that closed the tick. */
  const blockers =
    order.status === "ordered"
      ? []
      : leafs.filter((leaf) => !isSelectableForBuying(leaf) && leaf.action != null);

  const goodsTable = (
    <GoodsMiniTable
      label={order.so == null ? "Goods on this order" : `Goods on SO-${order.so}`}
      lines={lines}
      /* ⭐ THE GOODS IDENTIFY THEMSELVES FIRST (owner correction 2026-09-11),
         and the numbers are explicit: `Qty` the customer's order, `Ready
         Stock` what the shelf answered, `Ordered Qty` how much documents have
         ordered for this line (history, delivered included), and `To buy` the
         remainder this page can still act on. */
      identityFirst
      showFromStock
      showOrderedQty
      showToBuy
      showSupplier
      /* ⛔ NO `Unit ID` COLUMN, and no `PO Delivery Date` (owner correction
         2026-09-11). Both describe a DOCUMENT's goods, not a demand, so on the
         actionable table they printed an absence on every row of every order
         that has not been bought — a column of dashes in the width of a real
         answer. Both are columns of the details section below, where the Unit
         sits next to the purchase order it came in on. */
      showUnitId={false}
      onOpenPoDetails={poRows.length > 0 ? openPoDetails : undefined}
      selection={{
        selectedKeys: new Set(
          order.lines
            .filter((l) => {
              const leaf = leafByLineId.get(l.orderLineId);
              return leaf != null && selectedIds.has(leaf.id);
            })
            .map((l) => l.orderLineId),
        ),
        onToggle: (lineKey) => {
          const leaf = leafByLineId.get(lineKey);
          if (leaf) onToggleLeaf(leaf.id);
        },
      }}
    />
  );

  const sections: ConnectedSection[] = [
    { key: "goods", connectAt: CONNECT_AT_TABLE_HEADER, node: goodsTable },
    {
      key: "ready-stock",
      connectAt: CONNECT_AT_DISCLOSURE,
      /* ⭐ READY STOCK sits between the two tables (owner ruling 2026-09-10,
         placement confirmed 2026-09-11): after the compact demand it can
         answer, and BEFORE the record, which is the section that grows without
         limit. Its selection is its own — choosing a Unit never touches the
         purchasing tick above. */
      node: <ReadyStockPanel orderId={order.orderId} so={order.so} onReserved={onReserved} frameClassName="" />,
    },
    ...(poRows.length > 0
      ? [
          {
            key: "po-details",
            connectAt: CONNECT_AT_DISCLOSURE,
            node: (
              <ReadyStockDisclosure
                testId={`so-batch-po-details-${order.orderId}`}
                open={poOpen}
                onToggle={() => setPoOpen((v) => !v)}
                title={W.poDetails}
                className=""
                headingRef={poSection}
              >
                <PoDetailsTable
                  label={
                    order.so == null
                      ? "Purchase order details"
                      : `Purchase order details for SO-${order.so}`
                  }
                  rows={poRows}
                  onPoClick={(poId) =>
                    navigate(`/operation/procurement?po=${encodeURIComponent(poId)}`)
                  }
                />
              </ReadyStockDisclosure>
            ),
          },
        ]
      : []),
  ];

  return (
    <div data-testid={`so-batch-inspector-${order.orderId}`}>
      {expansion.isError && (
        <button
          type="button"
          className="px-2 pt-2 text-kit-blue-11 hover:underline"
          onClick={() => void expansion.refetch()}
        >
          Unit IDs could not be loaded. Try again
        </button>
      )}
      {blockers.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-control border border-warning/40 bg-warning-soft/40">
          {blockers.map((leaf) => (
            <div
              key={leaf.id}
              className="border-b border-warning/30 px-3 py-2 last:border-b-0"
              data-testid={`so-batch-blocker-${leaf.id}`}
            >
              <div className="text-body font-medium text-kit-slate-12">
                {stateWords[leaf.state]}
              </div>
              <div className="text-meta text-kit-slate-11">{leaf.action!.action}</div>
            </div>
          ))}
        </div>
      )}
      <ConnectedSections sections={sections} testId={`so-batch-sections-${order.orderId}`} />
    </div>
  );
}
