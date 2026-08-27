import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  SO_BATCH_ORDER_STATUS_WORDS,
  SO_BATCH_PURCHASE_WORDS as W,
  SO_BATCH_RAIL,
  defaultAllocations,
  isSelectableForBuying,
  purchaseDemandRailWords,
  purchaseDemandStateWords,
  setDestination,
  soBatchCellSummary,
  soBatchOrderSelection,
  soBatchSelectionSummary,
  type DestinationAllocation,
  type PurchaseDemandRow,
  type PurchaseDemandState,
  type SoBatchCellSummary,
  type SoBatchOrderRow,
  type SoBatchPurchaseResponse,
  type SoBatchSelection,
} from "@carres/shared";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { fmtDate } from "@/lib/fmt-date";
import { conciseLocality, NOT_GIVEN } from "@/lib/locality";
import { useSalesOrderExpansion } from "@/lib/queries";
import { RailGroup, RailItem } from "../components/workspace-rail";
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
  /** The order's eligible uncovered demand — the parent checkbox's meaning. */
  const eligibleByOrder = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const o of orders) {
      m.set(
        o.orderId,
        (leafsByOrder.get(o.orderId) ?? []).filter(isSelectableForBuying).map((r) => r.id),
      );
    }
    return m;
  }, [orders, leafsByOrder]);

  /* ── The rail (Card 02-A wording, Card 02-B counting) ─────────────────────
   *
   * The DEFAULT no-filter view shows every proceeded record, Ordered ones
   * included — the Register is permanent. `All not ordered` is therefore a
   * REAL outstanding-only filter now, and every facet counts UNIQUE Sales
   * Orders with outstanding eligible child demand, so an Ordered record can
   * never be counted as not ordered. */
  const [states, setStates] = useState<Set<PurchaseDemandState>>(new Set());
  const [notOrderedOnly, setNotOrderedOnly] = useState(false);
  const outstandingOrders = useMemo(
    () => new Set(leafs.map((r) => r.orderId)),
    [leafs],
  );
  const soCounts = useMemo(() => {
    const m = new Map<PurchaseDemandState, Set<string>>();
    for (const r of leafs) {
      let set = m.get(r.state);
      if (!set) {
        set = new Set();
        m.set(r.state, set);
      }
      set.add(r.orderId);
    }
    return m;
  }, [leafs]);
  const countOf = useCallback(
    (s: PurchaseDemandState) => soCounts.get(s)?.size ?? 0,
    [soCounts],
  );
  const shown = useMemo(() => {
    if (!notOrderedOnly && states.size === 0) return orders;
    return orders.filter((o) => {
      if (notOrderedOnly && outstandingOrders.has(o.orderId)) return true;
      for (const s of states) {
        if (soCounts.get(s)?.has(o.orderId)) return true;
      }
      return false;
    });
  }, [orders, notOrderedOnly, states, outstandingOrders, soCounts]);
  const toggleState = useCallback((s: PurchaseDemandState) => {
    setStates((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);
  const stateWords = useMemo(() => purchaseDemandStateWords(data.safetyDays), [data.safetyDays]);
  const railWords = useMemo(() => purchaseDemandRailWords(data.safetyDays), [data.safetyDays]);
  /* `SETUP TO FIX` renders only while its count is above zero. When the last
     such line is fixed, its filter must not survive as an invisible narrowing
     the operator can no longer see or clear. */
  const setupCount = countOf("no_production_days");
  useEffect(() => {
    if (setupCount > 0) return;
    setStates((prev) => {
      if (!prev.has("no_production_days")) return prev;
      const next = new Set(prev);
      next.delete("no_production_days");
      return next;
    });
  }, [setupCount]);

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
      if (row && isSelectableForBuying(row)) out.set(id, allocations);
    }
    return out;
  }, [selected, leafById]);

  const selections = useMemo<SoBatchSelection[]>(
    () => [...live].map(([demandId, allocations]) => ({ demandId, allocations })),
    [live],
  );
  const summary = useMemo(
    () => soBatchSelectionSummary(selections, leafById),
    [selections, leafById],
  );

  const toggleLeaf = useCallback(
    (id: string) => {
      const row = leafById.get(id);
      if (!row || !isSelectableForBuying(row)) return;
      setSelected((prev) => {
        const next = new Map(prev);
        if (next.has(id)) next.delete(id);
        else if (data.defaultDestinationId) {
          next.set(id, defaultAllocations(row, data.defaultDestinationId));
        }
        return next;
      });
    },
    [leafById, data.defaultDestinationId],
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
          else if (!next.has(id) && data.defaultDestinationId) {
            const row = leafById.get(id);
            if (row) next.set(id, defaultAllocations(row, data.defaultDestinationId));
          }
        }
        return next;
      });
    },
    [eligibleByOrder, leafById, data.defaultDestinationId],
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
      const next = setDestination(
        { demandId: row.id, allocations: current ?? [] },
        destinationId,
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
      (data.defaultDestinationId ? defaultAllocations(row, data.defaultDestinationId) : []),
    [live, data.defaultDestinationId],
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
  const supplierSummaryOf = useCallback(
    (o: SoBatchOrderRow) =>
      soBatchCellSummary([...o.outstandingSuppliers, ...o.pos.map((p) => p.supplierName)]),
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
        key: "proceedDate",
        label: W.colProceedDate,
        width: 104,
        sortable: true,
        chooserGroup: "Order",
        accessor: (o) => (
          <span data-testid={`so-batch-proceed-${o.orderId}`}>
            {o.proceedDate ? fmtDate(o.proceedDate) : null}
          </span>
        ),
        dateValue: (o) => o.proceedDate,
        filterType: "date",
        sortFn: (a, b) => (a.proceedDate ?? "").localeCompare(b.proceedDate ?? ""),
        exportValue: (o) => o.proceedDate ?? "",
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
              {locality === NOT_GIVEN ? <Absent>{NOT_GIVEN}</Absent> : locality}
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
          const eligible = (leafsByOrder.get(o.orderId) ?? []).filter(isSelectableForBuying);
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
          return <span data-testid={`so-batch-deliver-to-${o.orderId}`}>{text}</span>;
        },
        exportValue: (o) => {
          const eligible = (leafsByOrder.get(o.orderId) ?? []).filter(isSelectableForBuying);
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
        /* `purchase_orders.eta_date` — the OFFICIAL supplier-facing date.
           Never `Goods Must Arrive`, never an "if ordered today" estimate. */
        key: "poDeliveryDate",
        label: W.colPoDeliveryDate,
        width: 126,
        sortable: true,
        chooserGroup: "Documents",
        accessor: (o) => {
          const s = soBatchCellSummary(o.pos.map((p) => p.etaDate));
          const text = s.kind === "none" ? null : s.kind === "one" ? fmtDate(s.value) : W.multiple;
          return <span data-testid={`so-batch-po-date-${o.orderId}`}>{text}</span>;
        },
        sortFn: (a, b) =>
          (a.pos[0]?.etaDate ?? "").localeCompare(b.pos[0]?.etaDate ?? ""),
        exportValue: (o) =>
          summaryText(soBatchCellSummary(o.pos.map((p) => p.etaDate)), () => W.multiple) ?? "",
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
        <aside
          className="flex w-[200px] min-h-0 shrink-0 flex-col gap-4 overflow-y-auto border-r border-kit-slate-5 bg-white px-3 py-3"
          data-testid="so-batch-rail"
        >
          <RailGroup title={SO_BATCH_RAIL.toOrder.heading}>
            {/* Card 02-B — a REAL outstanding-only filter now that Ordered
                records stay in the listing. It counts unique Sales Orders
                with outstanding eligible demand, and it toggles. */}
            <RailItem
              active={notOrderedOnly}
              onClick={() => setNotOrderedOnly((v) => !v)}
              testId="so-batch-all-not-ordered"
              label={SO_BATCH_RAIL.toOrder.all}
              count={outstandingOrders.size > 0 ? outstandingOrders.size : undefined}
              title={`${outstandingOrders.size} ${W.footerUnit} not ordered`}
            />
          </RailGroup>
          <RailGroup title={SO_BATCH_RAIL.timing.heading}>
            {SO_BATCH_RAIL.timing.states.map((s) => (
              <RailItem
                key={s}
                active={states.has(s)}
                onClick={() => toggleState(s)}
                testId={`so-batch-state-${s}`}
                label={railWords[s] ?? ""}
                /* A zero prints nothing: an absent queue and an empty one
                   read the same to an operator, and only one is news. */
                count={countOf(s) > 0 ? countOf(s) : undefined}
                title={`${countOf(s)} ${W.footerUnit} · ${stateWords[s]}`}
              />
            ))}
          </RailGroup>
          {/* The one Purchasing-owned setup exception, and only while it
              exists — an empty exception section is noise wearing a heading. */}
          {setupCount > 0 && (
            <RailGroup title={SO_BATCH_RAIL.setup.heading}>
              {SO_BATCH_RAIL.setup.states.map((s) => (
                <RailItem
                  key={s}
                  active={states.has(s)}
                  onClick={() => toggleState(s)}
                  testId={`so-batch-state-${s}`}
                  label={railWords[s] ?? ""}
                  count={countOf(s) > 0 ? countOf(s) : undefined}
                  title={`${countOf(s)} ${W.footerUnit} · ${stateWords[s]}`}
                />
              ))}
            </RailGroup>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col p-2">
          <div className="min-h-0 flex-1" data-testid="so-batch-grid">
            <DataGrid<SoBatchOrderRow>
              appearance="reference"
              rows={shown}
              columns={columns}
              storageKey={STORAGE_KEY}
              rowKey={(o) => o.orderId}
              rowTestId={(o) => `so-batch-row-${o.orderId}`}
              exportName={W.destination}
              searchPlaceholder={W.search}
              isLoading={isLoading}
              emptyMessage={W.empty}
              groupBanner={false}
              stickyIdentity={{ columnKey: "soNo" }}
              chooserGroupOrder={["Order", "Documents", "Buying"]}
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

          {summary.lines > 0 ? (
            <div
              className="mt-2 flex shrink-0 items-center justify-between gap-3 rounded-control border border-kit-slate-6 bg-white px-3 py-2"
              data-testid="so-batch-selection-bar"
            >
              <span className="truncate text-body">{summary.text}</span>
              {data.mayIssue ? (
                <button
                  type="button"
                  data-testid="so-batch-issue"
                  className="inline-flex h-7 shrink-0 items-center rounded-control bg-kit-blue-9 px-3 text-meta font-medium text-white hover:opacity-90"
                  onClick={() => onIssue(selections)}
                >
                  {W.issuePo}
                </button>
              ) : (
                /* NOT a disabled button. A control the operator cannot use
                   should say WHO can, not grey itself out and stay silent. */
                /* ⭐ AND IT NAMES WHOEVER MAY ACT TODAY (0379; closure §1).
                   A dated buddy cover is the person to ask, not the holder they
                   are covering — a chip that named the absent holder sent the
                   operator to somebody who is on leave. */
                <span
                  className="shrink-0 truncate text-meta text-kit-slate-11"
                  data-testid="so-batch-duty-chip"
                >
                  {data.actingPoDuty
                    ? `${data.actingPoDuty.name} is covering PO duty`
                    : data.currentPoDuty
                      ? `${data.currentPoDuty.name} holds PO duty`
                      : "Nobody holds PO duty"}
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
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
}) {
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
    const eligible = leaf != null && isSelectableForBuying(leaf);
    const drawEditor = eligible && !editorDrawn.has(leaf.id);
    if (drawEditor) editorDrawn.add(leaf.id);
    const arranged = eligible ? leafAllocations(leaf) : [];
    const issuedDest = soBatchCellSummary(
      linePos.map((p) => destinationName(p!.destinationId)),
    );
    const supplier = soBatchCellSummary([
      ...(eligible ? [leaf.supplier] : []),
      ...linePos.map((p) => p!.supplierName),
    ]);
    const poDate = soBatchCellSummary(linePos.map((p) => p!.etaDate));
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

  return (
    <div data-testid={`so-batch-inspector-${order.orderId}`}>
      <GoodsMiniTable
        label={order.so == null ? "Goods on this order" : `Goods on SO-${order.so}`}
        lines={lines}
        showCoveredBy
        showSupplier
        showPoDeliveryDate
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
