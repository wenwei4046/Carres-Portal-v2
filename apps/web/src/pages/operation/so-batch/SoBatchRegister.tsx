import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PanelLeftOpen } from "lucide-react";
import {
  SO_BATCH_ORDER_STATUS_WORDS,
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
import { FilterRail, FilterRailGroup, FilterRailRow } from "../components/workspace-rail";
import PurchasingTabs from "../PurchasingTabs";
import DestinationAllocationEditor from "./DestinationAllocationEditor";
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
const STORAGE_KEY = "carres.soBatchPurchase.register.v2";
const FILTER_RAIL_STORAGE_KEY = "carres.soBatchPurchase.filters.open";

/** Governed absence — a muted sentence, never a bare dash. */
function Absent({ children }: { children: string }) {
  return <span className="text-kit-slate-11">{children}</span>;
}

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
  const toggleProduct = useCallback((c: SoBatchProductCategory) => {
    setFilter((prev) => ({ ...prev, product: prev.product === c ? null : c }));
  }, []);
  const toggleSupplier = useCallback((name: string) => {
    setFilter((prev) => ({ ...prev, supplier: prev.supplier === name ? null : name }));
  }, []);
  const toggleRegion = useCallback((name: string) => {
    setFilter((prev) => ({ ...prev, region: prev.region === name ? null : name }));
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
  const [selected, setSelected] = useState<Map<string, DestinationAllocation[]>>(new Map());
  const live = useMemo(() => {
    const out = new Map<string, DestinationAllocation[]>();
    for (const [id, allocations] of selected) {
      const row = leafById.get(id);
      if (row && selectable(row)) out.set(id, allocations);
    }
    return out;
  }, [selected, leafById, selectable]);

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
          next.set(id, defaultAllocations(row, tickDestinationId));
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
            if (row) next.set(id, defaultAllocations(row, tickDestinationId));
          }
        }
        return next;
      });
    },
    [eligibleByOrder, leafById, tickDestinationId],
  );

  const setLeafAllocations = useCallback(
    (id: string, allocations: DestinationAllocation[]) => {
      setSelected((prev) => new Map(prev).set(id, allocations));
    },
    [],
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
        key: "status",
        label: W.colStatus,
        width: 76,
        sortable: true,
        chooserGroup: "Order",
        accessor: (o) => (
          <span data-testid={`so-batch-status-${o.orderId}`}>
            {SO_BATCH_ORDER_STATUS_WORDS[o.status]}
          </span>
        ),
        filterValue: (o) => SO_BATCH_ORDER_STATUS_WORDS[o.status] || "Not ordered",
        sortFn: (a, b) => a.status.localeCompare(b.status),
        exportValue: (o) => SO_BATCH_ORDER_STATUS_WORDS[o.status],
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
        key: "poNo",
        label: W.colPoNo,
        width: 144,
        sortable: true,
        chooserGroup: "Documents",
        accessor: (o) => {
          const s = soBatchCellSummary(o.pos.map((p) => p.poId));
          if (s.kind === "none") return null;
          if (s.kind === "one") {
            return (
              <button
                type="button"
                className="font-mono text-kit-blue-11 underline-offset-2 hover:underline"
                data-testid={`so-batch-po-link-${o.orderId}`}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/operation/procurement?po=${encodeURIComponent(s.value)}`);
                }}
              >
                {s.value}
              </button>
            );
          }
          /* The exact numbers live in the expansion — the cell only counts. */
          return <span data-testid={`so-batch-po-many-${o.orderId}`}>{`${s.count} POs`}</span>;
        },
        searchValue: (o) => o.pos.map((p) => p.poId).join(" "),
        filterValue: (o) =>
          summaryText(soBatchCellSummary(o.pos.map((p) => p.poId)), (n) => `${n} POs`) ?? "",
        exportValue: (o) => o.pos.map((p) => p.poId).join(" · "),
      },
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
        key: "supplier",
        label: W.colSupplier,
        width: 110,
        sortable: true,
        chooserGroup: "Buying",
        accessor: (o) => {
          const text = summaryText(supplierSummaryOf(o), (n) => `${n} suppliers`);
          return <span data-testid={`so-batch-supplier-${o.orderId}`}>{text}</span>;
        },
        searchValue: (o) =>
          [...o.outstandingSuppliers, ...o.pos.map((p) => p.supplierName ?? "")].join(" "),
        filterValue: (o) => summaryText(supplierSummaryOf(o), (n) => `${n} suppliers`) ?? "",
        exportValue: (o) => summaryText(supplierSummaryOf(o), (n) => `${n} suppliers`) ?? "",
      },
      {
        /* Before issue: the arrangement control over the order's eligible
           demand. After issue: the destination the ISSUED document actually
           carries — never silently rewritten. */
        key: "deliverTo",
        label: W.deliverTo,
        width: 176,
        chooserGroup: "Buying",
        accessor: (o) => {
          const eligible = (leafsByOrder.get(o.orderId) ?? []).filter(selectable);
          if (eligible.length === 1) {
            const row = eligible[0]!;
            return (
              <span data-testid={`so-batch-deliver-to-${o.orderId}`}>
                <DestinationAllocationEditor
                  row={row}
                  destinations={data.destinations}
                  allocations={leafAllocations(row)}
                  onWholeRow={(destinationId) => changeWholeLeaf(row, destinationId)}
                  onSplit={(allocations) => setLeafAllocations(row.id, allocations)}
                />
              </span>
            );
          }
          if (eligible.length > 1) {
            /* One select for the whole order — the common act. The exact
               per-item allocation (and Split) lives in the expansion. */
            const arranged = soBatchCellSummary(
              eligible.flatMap((r) => leafAllocations(r).map((a) => a.destinationId)),
            );
            const value = arranged.kind === "one" ? arranged.value : "";
            return (
              <span data-testid={`so-batch-deliver-to-${o.orderId}`}>
                <select
                  className="w-full min-w-0 truncate rounded-control border border-kit-slate-6 bg-white px-1.5 py-0.5 text-meta"
                  data-testid={`so-batch-deliver-to-select-${o.orderId}`}
                  value={value}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    for (const r of eligible) changeWholeLeaf(r, e.target.value);
                  }}
                >
                  {arranged.kind !== "one" ? (
                    <option value="" disabled>
                      {W.multiple}
                    </option>
                  ) : null}
                  {data.destinations.map((d) => (
                    <option key={d.id} value={d.id} disabled={!d.active}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </span>
            );
          }
          const issued = soBatchCellSummary(
            o.pos.map((p) => destinationName(p.destinationId)),
          );
          const text =
            issued.kind === "none"
              ? null
              : issued.kind === "one"
                ? issued.value
                : W.multiple;
          /* THE EMPTY CELL SAYS WHY IT IS EMPTY (YH, 2026-09-02:
             "still cant click checkboxes, delivery to column is still empty").
             This cell draws a CONTROL on any row that can still be bought, so
             an empty one means no line is eligible. That has two very different
             causes and the page drew them identically:
               · nothing left to buy - Ordered, or covered from ready stock.
                 Correct, and the Status column already says so.
               · a BLOCKER - the row cannot be bought at all, because a SKU has
                 no catalog cost, no supplier, no production days, no customer
                 date, or no SKU. Any one of these makes `issueRef` null and the
                 tick, the dropdown and the Split button all vanish together.
             The reason was computed and then shown ONLY inside the row
             expansion, behind the small grey triangle. So the operator met a
             blank row, a dead checkbox and an empty cell with nothing on screen
             naming the cause - which reads as a broken page and is exactly how
             it was reported, twice.
             A page that cannot buy a row must say why on that row. */
          if (text == null) {
            const blocked = (leafsByOrder.get(o.orderId) ?? []).filter(
              (leaf) => !isPurchaseDemandTimingState(leaf.state),
            );
            if (blocked.length > 0) {
              const reasons = [...new Set(blocked.map((leaf) => stateWords[leaf.state]))];
              return (
                <span
                  className="text-kit-amber-11"
                  data-testid={`so-batch-deliver-to-${o.orderId}`}
                  title="Open the row to see what to do about it"
                >
                  {reasons.length === 1 ? reasons[0] : W.multiple}
                </span>
              );
            }
          }
          return <span data-testid={`so-batch-deliver-to-${o.orderId}`}>{text}</span>;
        },
        exportValue: (o) => {
          const eligible = (leafsByOrder.get(o.orderId) ?? []).filter(selectable);
          if (eligible.length > 0) {
            return eligible
              .flatMap((r) =>
                leafAllocations(r).map((a) => `${destinationName(a.destinationId)} ${a.qty}`),
              )
              .join(" · ");
          }
          return (
            summaryText(
              soBatchCellSummary(o.pos.map((p) => destinationName(p.destinationId))),
              () => W.multiple,
            ) ?? ""
          );
        },
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
          const text = s.kind === "none" ? null : s.kind === "one" ? fmtDate(s.value) : W.multiple;
          return <span data-testid={`so-batch-po-date-${o.orderId}`}>{text}</span>;
        },
        sortFn: (a, b) =>
          (a.pos[0]?.officialDeliveryDate ?? "").localeCompare(b.pos[0]?.officialDeliveryDate ?? ""),
        exportValue: (o) =>
          summaryText(soBatchCellSummary(o.pos.map((p) => p.officialDeliveryDate)), () => W.multiple) ?? "",
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
    />
  );

  /* ── The page ─────────────────────────────────────────────────────────── */
  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col bg-kit-canvas"
      data-testid="so-batch-page"
    >
      <PurchasingTabs />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Card 02-C — the readable 240px shell. Navigation, not batch
            selection: no rail row carries a checkbox, one filter per section,
            sections combine, and the fixed rows print their live count, zero
            included. */}
        {filterRailOpen && <FilterRail testId="so-batch-rail" onHide={() => setFilterRailVisible(false)}>
          <FilterRailGroup title={SO_BATCH_RAIL.toOrder.heading}>
            <FilterRailRow
              active={filter.notOrderedOnly}
              onClick={() =>
                setFilter((prev) => ({ ...prev, notOrderedOnly: !prev.notOrderedOnly }))
              }
              testId="so-batch-all-not-ordered"
              label={SO_BATCH_RAIL.toOrder.all}
              count={rail.notOrderedCount}
              title={`${rail.notOrderedCount} ${W.footerUnit} not ordered`}
            />
          </FilterRailGroup>
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
          <FilterRailGroup title={SO_BATCH_RAIL.product.heading}>
            {/* The CATALOG's categories, never SKU-text inference. `All
                products` is the section's clear — and where the uncommon
                categories live. */}
            <FilterRailRow
              active={filter.product == null}
              onClick={() => setFilter((prev) => ({ ...prev, product: null }))}
              testId="so-batch-product-all"
              label={SO_BATCH_RAIL.product.all}
            />
            {SO_BATCH_RAIL.product.categories.map((c) => (
              <FilterRailRow
                key={c.category}
                active={filter.product === c.category}
                onClick={() => toggleProduct(c.category)}
                testId={`so-batch-product-${c.category}`}
                label={c.word}
                count={rail.productCounts[c.category]}
              />
            ))}
          </FilterRailGroup>
          <FilterRailGroup title={SO_BATCH_RAIL.supplier.heading}>
            {/* Actual names from the Register's own supplier projection —
                dynamic, alphabetical, never hardcoded. A name with no match
                under the other filters drops off; the SELECTED name stays,
                with its honest 0. */}
            <FilterRailRow
              active={filter.supplier == null}
              onClick={() => setFilter((prev) => ({ ...prev, supplier: null }))}
              testId="so-batch-supplier-all"
              label={SO_BATCH_RAIL.supplier.all}
            />
            {rail.suppliers.map((s) => (
              <FilterRailRow
                key={s.name}
                active={filter.supplier === s.name}
                onClick={() => toggleSupplier(s.name)}
                testId={`so-batch-supplier-${s.name}`}
                label={s.name}
                count={s.count}
              />
            ))}
          </FilterRailGroup>
          <FilterRailGroup title={SO_BATCH_RAIL.region.heading}>
            <FilterRailRow
              active={filter.region == null}
              onClick={() => setFilter((prev) => ({ ...prev, region: null }))}
              testId="so-batch-region-all"
              label={SO_BATCH_RAIL.region.all}
            />
            {rail.regions.map((region) => (
              <FilterRailRow
                key={region.name}
                active={filter.region === region.name}
                onClick={() => toggleRegion(region.name)}
                testId={`so-batch-region-${region.name}`}
                label={region.name}
                count={region.count}
              />
            ))}
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
                /* `not ordered` is the RAIL's word for outstanding demand —
                   printing a second, status-based "not ordered" number here
                   would put two arithmetics behind one phrase. The footer
                   states the Register's own status tallies and stops. */
                const partial = filtered.filter((o) => o.status === "partial").length;
                const ordered = filtered.filter((o) => o.status === "ordered").length;
                const line = `${filtered.length} ${W.footerUnit} · ${partial} Partial · ${ordered} Ordered`;
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
 * ▸ THE ORDER'S OWN GOODS — the shared `GoodsMiniTable`, and nothing else
 * (owner ruling 2026-08-15; Card 02-B §5).
 *
 * The expansion says only what the parent row cannot: per item line, what
 * covers it (`Ready Stock` · the exact PO numbers · `Not ordered yet`), the
 * Unit ID where one is allocated, the exact supplier / `Deliver To` /
 * `PO Delivery Date` mapping when the parent cell could only summarise, and
 * the arrangement editor for the lines still being bought.
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
  const leafByLineId = useMemo(() => {
    const m = new Map<string, PurchaseDemandRow>();
    for (const leaf of leafs) for (const id of leaf.lineIds) m.set(id, leaf);
    return m;
  }, [leafs]);
  const poById = useMemo(() => new Map(order.pos.map((p) => [p.poId, p])), [order.pos]);

  /* The editor renders ONCE per leaf — a matched set spans several item lines
     but is arranged (and ticked) as one demand. */
  const editorDrawn = new Set<string>();

  const lines: GoodsMiniLine[] = order.lines.map((l) => {
    const leaf = leafByLineId.get(l.orderLineId);
    const linePos = l.pos.map((p) => poById.get(p.poId)).filter(Boolean);
    const coveredBy = [
      ...(l.stockTaken > 0 ? ["Ready Stock"] : []),
      ...l.pos.map((p) => p.poId),
    ];
    const eligible = leaf != null && isSelectableForOrder(leaf, order.status);
    const drawEditor = eligible && !editorDrawn.has(leaf.id);
    if (drawEditor) editorDrawn.add(leaf.id);
    const arranged = eligible ? leafAllocations(leaf) : [];
    const issuedDest = soBatchCellSummary(
      linePos.map((p) => destinationName(p!.destinationId)),
    );
    const supplier = soBatchCellSummary([
      ...(leaf ? [leaf.supplier] : []),
      ...linePos.map((p) => p!.supplierName),
    ]);
    const poDate = soBatchCellSummary(linePos.map((p) => p!.officialDeliveryDate));
    return {
      key: l.orderLineId,
      testId: `so-batch-part-${l.sku}`,
      category: l.category ? categoryWord(l.category) : "Other goods",
      unitIds: unitIdsByLine.get(l.orderLineId) ?? [],
      unitAbsence: "Not allocated",
      coveredBy,
      coveredByAbsence: "Not ordered yet",
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
              : issuedDest.values,
      deliverToAbsence: eligible ? "Not chosen" : "—",
      supplier: summaryText(supplier, (n) => `${n} suppliers`) ?? undefined,
      supplierAbsence: "—",
      poDeliveryDate:
        poDate.kind === "none"
          ? undefined
          : poDate.kind === "one"
            ? fmtDate(poDate.value)
            : W.multiple,
      poDeliveryDateAbsence: "—",
      sku: l.sku,
      qty: l.qty,
      item: l.item,
      selectable: eligible,
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
        unitAbsence: "Not allocated",
        coveredBy: [],
        coveredByAbsence: "Not ordered yet",
        deliverTo: [],
        deliverToAbsence: "—",
        supplierAbsence: "—",
        supplier: leaf.supplier ?? undefined,
        poDeliveryDateAbsence: "—",
        sku: part.sku,
        qty: part.qty,
        item: leaf.item,
        selectable: false,
      });
    }
  }

  if (lines.length === 0) {
    return <div className="px-2 py-2 text-body text-kit-slate-11">No items on this order</div>;
  }

  const stateWords = purchaseDemandStateWords(safetyDays);
  /* An `Ordered` order's leaves are not blockers and must not be listed as
     any. They fail `isSelectableForOrder` because the order is FINISHED
     buying, not because something is wrong with them — printing
     "Issue PO to Ohana" in an amber panel on an order whose purchase orders
     are already sent would be an instruction to duplicate work. The `Ordered`
     pill and the `PO No` column are the explanation, and both read the same
     lineage that closed the tick. */
  const blockers =
    order.status === "ordered"
      ? []
      : leafs.filter((leaf) => !isSelectableForBuying(leaf) && leaf.action != null);

  return (
    <div data-testid={`so-batch-inspector-${order.orderId}`}>
      {blockers.length > 0 && (
        <div className="mb-2 overflow-hidden rounded-control border border-warning/40 bg-warning-soft/40">
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
      <GoodsMiniTable
        label={order.so == null ? "Goods on this order" : `Goods on SO-${order.so}`}
        lines={lines}
        showCoveredBy
        showSupplier
        showPoDeliveryDate
        /* ⭐ THE EXPANSION IS THE MULTI-PO DOOR (YH, 2026-09-01). The `PO No`
           cell links only when there is exactly one; with several it prints
           "2 POs" and sends the reader here, where the exact numbers were bare
           text. So the more work an order generated, the fewer doors it had.
           Same navigation the single-PO cell already performs.
           `Ready Stock` is an answer, not a document, so `poById` — not a
           string test — decides what is a door. */
        isCoveredByLinkable={(v) => poById.has(v)}
        onCoveredByClick={(poId) =>
          navigate(`/operation/procurement?po=${encodeURIComponent(poId)}`)
        }
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
    </div>
  );
}
