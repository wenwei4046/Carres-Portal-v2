/**
 * SO BATCH PURCHASE · BY SALES ORDER (owner 13 Oct 2026, round 3; 01 §5;
 * Purchasing MASTER §9.1). One row per Sales Order on the ONE listing engine,
 * the way `By supplier` is drawn: rows 54, item rows 44, and columns that fit
 * the page so nothing scrolls sideways.
 *
 *   SO no. (takes the room that is left) · Items 150 · Proceed date 104 ·
 *   Customer’s original requested delivery 150 · Status 132.
 *
 * A row opens to its item lines: tick · Item · Qty · Stock you can use ·
 * Supplier · Supplier delivers to. The register passes each line in ready
 * (`OrderItemLine`): the tick rule, the Ready Stock cell and its picker, the
 * `Supplier Deliver To` editor and every stated reason are the page's own.
 * Nothing is recomputed here; this file only draws.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SoBatchOrderRow } from "@carres/shared";
import StatusPill from "@/components/kit/StatusPill";
import { DataGrid, type DataGridColumn, type DataGridContextMenuItem } from "@/components/register/DataGrid";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import TwoLineCell from "@/components/register/TwoLineCell";
import RowTick from "@/components/register/RowTick";
import ItemRows from "@/components/register/ItemRows";
import PoNumberLinks from "@/components/register/PoNumberLinks";
import type { PoNumberLink } from "@/components/register/po-number-links";
import { BY_SUPPLIER as B, COLUMN_FLOOR, daysBetween, fitColumns } from "./by-supplier";
import { BY_SALES_ORDER as O, type OrderRowFacts } from "./by-sales-order";

/** The four fixed columns and the grid's own tick and arrow columns. */
const FIXED = { items: 150, proceed: 104, requested: 150, status: 132 } as const;
/* 72 for the tick and the arrow, and 8 because the engine gives a sortable
   header a few pixels more than its column asks for. */
const GRID_LEAD = 80;
const SO_MIN = 150;
/* An item line under the row: Qty, Stock you can use and Supplier are fixed;
   Supplier delivers to takes what is left, so its select has room. */
const LINE = { qty: 64, stock: 124, supplier: 110 } as const;
const LINE_TIGHT = { qty: 52, stock: 92, supplier: 84 } as const;
/* `Customer’s original` on one header line, never cut: its own floor. */
const REQUESTED_FLOOR = 122;

const soRef = (so: number | null) => (so == null ? O.notRecorded : `SO-${so}`);
const weekday = (iso: string) => fmtDate(iso).split(",")[0] ?? "";

/** One item line of an opened Sales Order, ready to draw. */
export interface OrderItemLine {
  key: string;
  /** The model code as the data spells it (`CODY-SK`). */
  code: string;
  /** The size and fabric, under the code. */
  detail: string | null;
  qty: string;
  /** The Ready Stock cell (`{n} available` · `{n} reserved`). */
  stock: ReactNode;
  /** The Ready Stock picker when it is open, under this line. */
  stockDetail: ReactNode;
  supplier: string | null;
  /** The editor while the line is to buy; else where the PO sends it, or the
   *  door that fixes why it cannot be bought. */
  deliverTo: ReactNode;
  /** Every PO this line is on, each its own link. */
  po: ReactNode;
  /** `null`: the line belongs to a set whose first line carries the tick. */
  tick: { label: string; checked: boolean; disabled: boolean; why: string | null; onChange: () => void; testId: string } | null;
  testId?: string;
}

/** The item rows under one Sales Order row. */
export function OrderItemRows({ label, lines, columns, stepBack, testId, before }: {
  label: string;
  lines: OrderItemLine[];
  /** The grid template the list above measured. */
  columns: string;
  stepBack: number;
  testId?: string;
  /** A business blocker for this order, above its lines. */
  before?: ReactNode;
}) {
  return (
    <ItemRows label={label} stepBack={stepBack} testId={testId}>
      {before}
      <div role="row" className="grid min-h-[32px] items-center bg-c-info-bg text-meta font-medium text-c-secondary" style={{ gridTemplateColumns: columns }}>
        <span role="columnheader" />
        <span role="columnheader" />
        <span role="columnheader" className="px-[5px]">{O.lineItem}</span>
        <span role="columnheader" className="px-[5px]">{O.lineQty}</span>
        <span role="columnheader" className="px-[5px]">{O.lineStock}</span>
        <span role="columnheader" className="px-[5px]">{O.lineSupplier}</span>
        <span role="columnheader" className="px-[5px]">{O.lineDeliverTo}</span>
      </div>
      {lines.length === 0 ? <div role="row" className="px-[77px] py-3 text-body text-c-secondary">{O.noItems}</div> : null}
      {lines.map((line) => (
        <div key={line.key} role="row" className="grid min-h-[44px] items-center border-t border-c-row-line py-1"
          style={{ gridTemplateColumns: columns }} data-testid={line.testId ?? `by-order-line-${line.key}`}>
          <span role="cell" className="grid place-items-center">
            {line.tick ? (
              <RowTick testId={line.tick.testId} label={line.tick.label} checked={line.tick.checked}
                disabled={line.tick.disabled} why={line.tick.why} onChange={line.tick.onChange} />
            ) : null}
          </span>
          <span role="cell" />
          <span role="cell" className="flex min-w-0 flex-col px-[5px]">
            <span className="break-words text-body text-c-ink">{line.code}</span>
            {line.detail ? <span className="break-words text-meta text-c-secondary">{line.detail}</span> : null}
          </span>
          <span role="cell" className="px-[5px] text-body text-c-ink">{line.qty}</span>
          <span role="cell" className="min-w-0 px-[5px] text-body text-c-ink" data-testid={`by-order-stock-${line.key}`}>{line.stock}</span>
          <span role="cell" className="break-words px-[5px] text-body text-c-ink">{line.supplier ?? <span className="text-c-secondary">{B.supplierNotSet}</span>}</span>
          <span role="cell" className="flex min-w-0 flex-col px-[5px] text-body text-c-ink" data-testid={`by-order-deliver-${line.key}`}>
            {line.deliverTo}
            {line.po ? <span className="text-meta">{line.po}</span> : null}
          </span>
          {line.stockDetail ? (
            <div role="cell" className="min-w-0 pb-1 pr-2 pt-1.5" style={{ gridColumn: "3 / -1" }} data-testid={`by-order-stock-detail-${line.key}`}>
              {line.stockDetail}
            </div>
          ) : null}
        </div>
      ))}
    </ItemRows>
  );
}

export default function SoBatchBySalesOrder({
  orders, total, factsOf, blockedReason, today, isLoading, storageKey, sessionKey,
  eligibleOf, isTicked, onToggleOrder, selectionSummary, selectionPrimary, toolbarEnd, toolbarAfterTools, toolbarStart,
  onOpenOrder, onRowDoubleClick, contextMenu, renderItems, emptyMessage, noMatchMessage, initialSearch, searchPlaceholder, warning, searchOf, poLinksOf, onOpenPo,
  onVisibleChange, onClearConditions,
}: {
  /** The Sales Orders this tab and the rail are showing. */
  orders: SoBatchOrderRow[];
  /** Every proceeded Sales Order the page holds, for the footer. */
  total: number;
  factsOf: (order: SoBatchOrderRow) => OrderRowFacts;
  /** Why nothing on this order can be bought, in the page's governed words.
   *  `fix` = something is missing and must be set before it can be bought. */
  blockedReason: (order: SoBatchOrderRow) => { text: string; fix: boolean; tick: string | null } | null;
  /** The server's Malaysia date, `YYYY-MM-DD`. */
  today: string;
  isLoading: boolean;
  storageKey: string;
  sessionKey: string;
  /** The demand lines of the order that may be ticked for a PO. */
  eligibleOf: (orderId: string) => readonly string[];
  isTicked: (demandId: string) => boolean;
  onToggleOrder: (orderId: string, on: boolean) => void;
  selectionSummary: string;
  selectionPrimary: ReactNode;
  toolbarEnd: ReactNode;
  toolbarAfterTools?: ReactNode;
  toolbarStart?: ReactNode;
  onOpenOrder: (order: SoBatchOrderRow) => void;
  onRowDoubleClick?: (order: SoBatchOrderRow) => void;
  contextMenu?: (order: SoBatchOrderRow) => DataGridContextMenuItem[];
  /** The item rows of one order, drawn on the template this list measured. */
  renderItems: (order: SoBatchOrderRow, layout: { columns: string; stepBack: number }) => ReactNode;
  emptyMessage: string;
  /** What a search or a filter that finds nothing says: never the empty sentence. */
  noMatchMessage: string;
  initialSearch?: string;
  searchPlaceholder?: string;
  /** A business blocker shown between the toolbar and the list. */
  warning?: string;
  /** The rows left after the list's own search and filters. */
  onVisibleChange?: (orders: SoBatchOrderRow[]) => void;
  /** `Clear filters` also clears what the page itself narrowed by. */
  onClearConditions?: () => void;
  /** Everything a search may find the order by. */
  searchOf: (order: SoBatchOrderRow) => string;
  /** Every PO the order is on (owner ruling 2026-10-05: every number, each a link). */
  poLinksOf: (order: SoBatchOrderRow) => readonly PoNumberLink[];
  onOpenPo: (poId: string) => void;
}) {
  const ticked = (order: SoBatchOrderRow) => eligibleOf(order.orderId).filter(isTicked).length;

  /* SO no. takes the room the four fixed columns leave, never under 150, so
     Status stays in view with no side scroll. The listing engine sizes
     columns in pixels, so the room is measured here; and an item row is drawn
     on the list's own measured tick, arrow and first column. */
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  const [drawn, setDrawn] = useState<number[]>([]);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      setRoom(el.clientWidth);
      const widths = [...el.querySelectorAll("thead th")].map((th) => Math.round(th.getBoundingClientRect().width * 10) / 10);
      setDrawn((previous) => (previous.join() === widths.join() ? previous : widths));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const table = el.querySelector("table");
    if (table) observer.observe(table);
    measure();
    return () => observer.disconnect();
  });
  /* The fixed columns give way when the room is short (Tasks open on a
     narrow screen), so Status stays in view with no side scroll. */
  const fit = fitColumns(room, GRID_LEAD, SO_MIN, [FIXED.items, FIXED.proceed, FIXED.requested, FIXED.status],
    [COLUMN_FLOOR.fixed, COLUMN_FLOOR.fixed, REQUESTED_FLOOR, COLUMN_FLOOR.status]);
  /* A header's filter button needs 24 of its column. Short of room, Items
     and the two dates keep their sort and give the filter up; Status keeps
     its filter, and the rail, the tabs and the search still narrow the list. */
  const roomy = !fit.tight;
  const soWidth = fit.first;
  const [itemsWidth, proceedWidth, requestedWidth, statusWidth] = fit.fixed as [number, number, number, number];
  const soFloor = fit.tight ? COLUMN_FLOOR.first : SO_MIN;
  const lead = drawn.length >= 3 ? drawn.slice(0, 3).map((width) => `${width}px`).join(" ") : `40px 32px ${Math.max(soFloor, soWidth)}px`;
  /* The item line gives way with them, so Supplier delivers to keeps room. */
  const line = fit.tight ? LINE_TIGHT : LINE;
  const lineColumns = `${lead} ${line.qty}px ${line.stock}px ${line.supplier}px 1fr`;
  const stepBack = drawn.length >= 2 ? drawn[0]! + drawn[1]! : 72;

  const statusCell = (order: SoBatchOrderRow) => {
    const facts = factsOf(order);
    const blocked = facts.status === "blocked" ? blockedReason(order) : null;
    const word = facts.status === "blocked" ? B.toBuy : O.status(facts.status);
    const done = facts.status === "ordered" || facts.status === "from_ready_stock";
    /* Amber is for what needs doing now: a date or a window that has gone by,
       a part still to buy, or a missing fact that stops the purchase. */
    const warn = facts.status === "late_to_order" || facts.status === "cut_off_passed" || facts.status === "partly_ordered" || !!blocked?.fix;
    const days = facts.orderBy ? daysBetween(today, facts.orderBy) : null;
    const sub = facts.status === "ordered" ? ""
      : facts.status === "from_ready_stock" ? O.noPoNeeded
        : facts.status === "blocked" ? blocked?.text ?? ""
          : days != null ? B.deadline(days) : "";
    const subWarn = facts.status === "late_to_order" || facts.status === "cut_off_passed" || !!blocked?.fix;
    const links = poLinksOf(order);
    return (
      <span className="flex min-w-0 flex-col items-start gap-0.5" data-testid={`so-batch-status-${order.orderId}`}>
        <StatusPill tone={done ? "success" : warn ? "warning" : "neutral"}>{word}</StatusPill>
        {sub ? <span className={`break-words text-meta ${subWarn ? "text-c-warn-fg" : "text-c-secondary"}`}>{sub}</span> : null}
        {/* Every PO the order is on, each its own door (owner ruling 2026-10-05). */}
        {links.length > 0 ? (
          <span className="min-w-0 max-w-full text-meta">
            <PoNumberLinks wrap numbers={links} onOpen={onOpenPo} testId={`so-batch-po-${order.orderId}`} linkTestId={`so-batch-po-link-${order.orderId}`} />
          </span>
        ) : null}
      </span>
    );
  };

  const columns = useMemo<DataGridColumn<SoBatchOrderRow>[]>(() => [
    {
      key: "soNo", label: O.colSoNo, width: soWidth, minWidth: soFloor, sortable: true, wrap: true,
      accessor: (order) => (
        <TwoLineCell strong testId={`so-batch-so-${order.orderId}`}
          top={order.so == null ? O.notRecorded : (
            <button type="button" data-testid={`so-batch-so-link-${order.orderId}`}
              onClick={(event) => { event.stopPropagation(); onOpenOrder(order); }}
              className="font-semibold text-c-ink underline decoration-c-secondary decoration-dotted underline-offset-[3px] hover:decoration-solid">
              {soRef(order.so)}
            </button>
          )}
          sub={order.customer ?? O.notRecorded} />
      ),
      sortFn: (a, b) => (a.so ?? 0) - (b.so ?? 0),
      searchValue: searchOf,
      exportValue: (order) => soRef(order.so),
    },
    {
      key: "items", label: O.colItems, width: itemsWidth, minWidth: itemsWidth, sortable: true, wrap: true, filterable: roomy,
      accessor: (order) => { const facts = factsOf(order); return <TwoLineCell top={B.qty(facts.unit, facts.pieces)} sub={O.itemsLine(facts)} testId={`so-batch-items-${order.orderId}`} />; },
      sortFn: (a, b) => factsOf(a).pieces - factsOf(b).pieces,
      exportValue: (order) => { const facts = factsOf(order); return [B.qty(facts.unit, facts.pieces), O.itemsLine(facts)].filter(Boolean).join(" · "); },
    },
    {
      key: "proceededAt", label: O.colProceedDate, headerLines: ["Proceed", "date"], width: proceedWidth, minWidth: proceedWidth, sortable: true, wrap: true,
      accessor: (order) => order.proceededAt
        ? <TwoLineCell top={fmtDateShort(order.proceededAt)} sub={weekday(order.proceededAt)} testId={`so-batch-proceed-${order.orderId}`} />
        : <span className="text-body text-c-secondary" data-testid={`so-batch-proceed-${order.orderId}`}>{O.notRecorded}</span>,
      dateValue: (order) => order.proceededAt,
      filterType: "date", filterable: roomy,
      sortFn: (a, b) => (a.proceededAt ?? "").localeCompare(b.proceededAt ?? ""),
      exportValue: (order) => order.proceededAt ?? "",
    },
    {
      key: "requestedDelivery", label: O.colRequestedDelivery, headerLines: ["Customer’s original", "requested delivery"],
      width: requestedWidth, minWidth: requestedWidth, sortable: true, wrap: true,
      accessor: (order) => order.originalRequestedDeliveryDate
        ? <TwoLineCell top={fmtDateShort(order.originalRequestedDeliveryDate)} sub={weekday(order.originalRequestedDeliveryDate)} testId={`so-batch-requested-${order.orderId}`} />
        : <span className="text-body text-c-secondary" data-testid={`so-batch-requested-${order.orderId}`}>{O.notRecorded}</span>,
      dateValue: (order) => order.originalRequestedDeliveryDate ?? null,
      filterType: "date", filterable: roomy,
      sortFn: (a, b) => (a.originalRequestedDeliveryDate ?? "").localeCompare(b.originalRequestedDeliveryDate ?? ""),
      exportValue: (order) => order.originalRequestedDeliveryDate ?? "",
    },
    {
      key: "status", label: O.colStatus, width: statusWidth, minWidth: statusWidth, sortable: true, wrap: true,
      accessor: statusCell,
      sortFn: (a, b) => O.status(factsOf(a).status).localeCompare(O.status(factsOf(b).status)),
      filterValue: (order) => O.status(factsOf(order).status),
      exportValue: (order) => [O.status(factsOf(order).status), poLinksOf(order).map((po) => po.display).join(", ")].filter(Boolean).join(" · "),
    },
  ], [today, roomy, soWidth, soFloor, itemsWidth, proceedWidth, requestedWidth, statusWidth, factsOf, blockedReason, searchOf, onOpenOrder, poLinksOf, onOpenPo]);

  return (
    /* The kit's table puts 10 between columns and no padding inside a cell
       (01 §5). The listing engine pads every cell instead, so its padding is
       5 a side here, as on By supplier. */
    <div ref={box} className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="by-sales-order" style={{ ["--table-row-pad" as string]: "6px 5px" }}>
      <DataGrid<SoBatchOrderRow>
        rows={orders}
        columns={columns}
        storageKey={storageKey}
        sessionKey={sessionKey}
        rowKey={(order) => order.orderId}
        rowTestId={(order) => `so-batch-row-${order.orderId}`}
        rowHeight={54}
        appearance="reference"
        palette="slate"
        presentationTools
        toolbarAfterTools={toolbarAfterTools ?? (fit.tight ? undefined : <span aria-hidden className="block" style={{ width: FIXED.status + 8 }} />)}
        wrapToolbar
        searchPresentation="icon"
        allowColumnGrouping={false}
        groupBanner={false}
        isLoading={isLoading}
        warning={warning}
        emptyMessage={emptyMessage}
        noMatchMessage={noMatchMessage}
        facetRows={orders}
        onFacetRowsChange={onVisibleChange}
        onClearConditions={onClearConditions}
        initialSearch={initialSearch}
        searchPlaceholder={searchPlaceholder}
        toolbarStart={toolbarStart}
        toolbarEnd={toolbarEnd}
        exportName={B.bySalesOrder}
        onRowDoubleClick={onRowDoubleClick}
        contextMenu={contextMenu}
        expandable={{
          flush: true,
          testId: (order) => `so-batch-expand-${order.orderId}`,
          renderExpansion: (order) => renderItems(order, { columns: lineColumns, stepBack }),
        }}
        selectable={{
          selectedKeys: new Set(orders.filter((order) => { const ids = eligibleOf(order.orderId); return ids.length > 0 && ticked(order) === ids.length; }).map((order) => order.orderId)),
          onToggle: (orderId) => {
            const order = orders.find((candidate) => candidate.orderId === orderId); if (!order) return;
            onToggleOrder(orderId, ticked(order) !== eligibleOf(orderId).length);
          },
          /* Visible rows only: a filter must never cause hidden demand to be
             ticked by the header switch. */
          onToggleAll: (keys, allSelected) => { for (const key of keys) onToggleOrder(key, !allSelected); },
          isSelectable: (order: SoBatchOrderRow) => eligibleOf(order.orderId).length > 0,
          /* Printed under Status too; here it is what a screen reader hears on the tick. */
          unselectableReason: (order: SoBatchOrderRow) => blockedReason(order)?.tick ?? null,
          isIndeterminate: (order: SoBatchOrderRow) => { const n = ticked(order); return n > 0 && n < eligibleOf(order.orderId).length; },
          testId: (order: SoBatchOrderRow) => `so-batch-select-${order.orderId}`,
        }}
        selectionSummary={() => selectionSummary}
        selectionPrimary={selectionPrimary}
        statusSummary={(filtered) => {
          const line = filtered.length === total ? O.footer(total) : `${filtered.length} of ${O.footer(total)}`;
          return <span className="block" data-testid="so-batch-footer">{line}</span>;
        }}
      />
    </div>
  );
}
