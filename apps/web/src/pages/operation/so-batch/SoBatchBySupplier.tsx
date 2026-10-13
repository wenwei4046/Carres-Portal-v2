/**
 * SO BATCH PURCHASE · BY SUPPLIER (owner 12 Oct 2026; 01 §5; Purchasing MASTER
 * §9.1). The demand of the By sales order list, read the way a buyer orders
 * it: one row per supplier and category. A row opens to its item lines; a tick
 * on the row ticks every line of it that can be bought, and the same
 * `Issue PO` door takes the ticks.
 *
 * An item line keeps everything the By sales order list gives it: the same
 * tick and eligibility rule, the same `Supplier Deliver To` editor (Split
 * included) and the same stated reason when a line may not be bought. The
 * register passes those in (`lineExtras`); nothing is recomputed here.
 *
 * It is the ONE listing engine with six columns (01 §5):
 *   Supplier (takes the room that is left) · Items 80 · Sales orders 96 ·
 *   Order PO deadline 120 · Supplier ready by 120 · Status 120.
 * Words: COPY-STANDARD "SO Batch Purchase · By supplier". Every date and
 * number is the server's; this file only draws.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PurchaseDemandRow } from "@carres/shared";
import StatusPill from "@/components/kit/StatusPill";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { documentDisplayNumber } from "@carres/shared";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import TwoLineCell from "@/components/register/TwoLineCell";
import RowTick from "@/components/register/RowTick";
import ItemRows from "@/components/register/ItemRows";
import { BY_SUPPLIER as B, daysBetween, type GroupBy, type SupplierGroup } from "./by-supplier";

/** The five fixed columns (01 §5) and the grid's own tick and arrow columns. */
const FIXED = { items: 80, orders: 96, deadline: 120, readyBy: 120, status: 120 } as const;
const FIXED_TOTAL = FIXED.items + FIXED.orders + FIXED.deadline + FIXED.readyBy + FIXED.status;
/* 72 for the tick and the arrow, and 8 because the engine gives a sortable
   header a few pixels more than its column asks for. */
const GRID_LEAD = 80;
const SUPPLIER_MIN = 150;
/* `By category` and `By order deadline` (the design file's third layout):
   the first column, Items, Sales orders, Suppliers and Status. Suppliers also
   holds the room the design leaves empty before Status, so an item line's
   Supplier delivers to has space for its select. */
const GROUPED = { items: 80, orders: 96, suppliers: 230, status: 124 } as const;
const GROUPED_TOTAL = GROUPED.items + GROUPED.orders + GROUPED.suppliers + GROUPED.status;
const LINE_SUPPLIER = 110;

const soRef = (so: number | null) => (so == null ? B.notRecorded : `SO-${so}`);
const weekday = (iso: string) => fmtDate(iso).split(",")[0] ?? "";
const poNo = (id: string) => documentDisplayNumber(id);
/* Item line 1 is the model code as the data spells it (`CODY-SK`); the size
   is line 2 (owner 13 Oct 2026). A line with no code keeps its model name. */
const modelCode = (line: PurchaseDemandRow) => (line.skus?.length ? line.skus.join(" + ") : line.item);

export default function SoBatchBySupplier({
  groups, by = "supplier", today, isLoading, storageKey, sessionKey, canBuy, isTicked, onToggleLine, onToggleLines,
  selectionSummary, selectionPrimary, toolbarEnd, toolbarAfterTools, toolbarStart, onOpenOrder, emptyMessage, noMatchMessage, onClearConditions, initialSearch, searchPlaceholder, lineExtras, warning,
}: {
  groups: SupplierGroup[];
  /** How the rows are grouped. The columns follow it. */
  by?: GroupBy;
  /** The server's Malaysia date, `YYYY-MM-DD`. */
  today: string;
  isLoading: boolean;
  storageKey: string;
  sessionKey: string;
  /** May this line be ticked for a PO (the By sales order list's own rule). */
  canBuy: (row: PurchaseDemandRow) => boolean;
  isTicked: (demandId: string) => boolean;
  onToggleLine: (demandId: string) => void;
  onToggleLines: (demandIds: string[], on: boolean) => void;
  selectionSummary: string;
  selectionPrimary: ReactNode;
  toolbarEnd: ReactNode;
  /** Drawn after the ⋮ menu button, at the toolbar's end. */
  toolbarAfterTools?: ReactNode;
  toolbarStart?: ReactNode;
  onOpenOrder: (orderId: string) => void;
  emptyMessage: string;
  /** What a search or a filter that finds nothing says: never the empty sentence. */
  noMatchMessage?: string;
  /** `Clear filters` also clears what the page itself narrowed by. */
  onClearConditions?: () => void;
  initialSearch?: string;
  searchPlaceholder?: string;
  /** The By sales order list's own controls for one demand line: where the
   *  supplier delivers it, and why it may not be bought. */
  lineExtras?: (line: PurchaseDemandRow) => { deliverTo?: ReactNode; whyText?: string | null; door?: ReactNode };
  /** A business blocker shown between the toolbar and the list. */
  warning?: string;
}) {
  const buyable = useMemo(
    () => new Map(groups.map((g) => [g.key, g.lines.filter(canBuy).map((l) => l.id)])),
    [groups, canBuy],
  );
  const ticked = (g: SupplierGroup) => (buyable.get(g.key) ?? []).filter(isTicked).length;

  /* Supplier takes the room the five fixed columns leave, never under 150
     (01 §5: `minmax(150px,1fr)`), so Status stays in view with no side
     scroll. The listing engine sizes columns in pixels, so the room is
     measured here. */
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  /* The list's own column widths as it drew them (tick, arrow, then the six
     columns), so an item row sits exactly under its row's columns at every
     width. Measured, because the engine sizes its tick column by the canvas. */
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
  const fixedTotal = by === "supplier" ? FIXED_TOTAL : GROUPED_TOTAL;
  const supplierWidth = room > 0 ? Math.max(SUPPLIER_MIN, Math.floor(room - GRID_LEAD - fixedTotal - 2)) : 260;

  /* A supplier with rows in two categories (one PO per supplier and category)
     names the category on each of them: `Ohana · Bedframe`, `Ohana · Sofa`. */
  const twoCategories = useMemo(() => {
    const seen = new Map<string, Set<string>>();
    for (const g of groups) { const id = g.supplierId ?? "none"; (seen.get(id) ?? seen.set(id, new Set()).get(id)!).add(g.category ?? "other"); }
    return new Set([...seen].filter(([, categories]) => categories.size > 1).map(([id]) => id));
  }, [groups]);
  const nameOf = (g: SupplierGroup) => (by === "category" ? B.category(g.category) : by === "deadline" ? (g.orderBy ?? B.notRecorded) : B.groupName(g, twoCategories.has(g.supplierId ?? "none")));

  /* A group of one category counts in that category's unit; a mixed group in pieces. */
  const unitOf = (g: SupplierGroup) => {
    const all = [...g.lines.map((l) => l.category), ...(g.ordered?.lines ?? []).map((l) => l.category)];
    return new Set(all).size <= 1 ? g.category : null;
  };
  const statusWord = (g: SupplierGroup) => (g.ordered ? B.ordered : g.deadline === "passed" ? B.lateToOrder : g.cutOffPassed ? B.cutOffPassed : B.toBuy);
  const statusCell = (g: SupplierGroup) => {
    if (g.ordered) return (
      <span className="flex min-w-0 flex-col items-start gap-0.5" data-testid={`by-supplier-status-${g.key}`}>
        <StatusPill tone="success">{B.ordered}</StatusPill>
        <span className="break-words text-meta text-c-secondary" title={g.ordered.poIds.map(poNo).join(", ")}>{B.poRefs(g.ordered.poIds, poNo)}</span>
      </span>
    );
    const warn = g.deadline === "passed" || g.cutOffPassed;
    return (
      <span className="flex min-w-0 flex-col items-start gap-0.5" data-testid={`by-supplier-status-${g.key}`}>
        <StatusPill tone={warn ? "warning" : "neutral"}>{statusWord(g)}</StatusPill>
        <span className={`text-meta ${warn ? "text-c-warn-fg" : "text-c-secondary"}`}>
          {warn ? B.toBuyLine(unitOf(g), g.qty) : B.qty(unitOf(g), g.qty)}
        </span>
      </span>
    );
  };

  const supplierColumns = useMemo<DataGridColumn<SupplierGroup>[]>(() => [
    {
      key: "supplier", label: B.colSupplier, width: supplierWidth, minWidth: SUPPLIER_MIN, sortable: true, wrap: true,
      accessor: (g) => <TwoLineCell strong top={nameOf(g)} sub={g.ordered ? B.category(g.category) : B.supplierLine(g)} testId={`by-supplier-name-${g.key}`} />,
      sortFn: (a, b) => nameOf(a).localeCompare(nameOf(b)),
      searchValue: (g) => `${g.supplier ?? B.supplierNotSet} ${[...g.lines, ...(g.ordered?.lines ?? [])].map((l) => `${l.item} ${l.variant ?? ""} ${soRef(l.so)}`).join(" ")} ${(g.ordered?.poIds ?? []).map((id) => `${id} ${poNo(id)}`).join(" ")}`,
      filterValue: (g) => nameOf(g),
      exportValue: (g) => nameOf(g),
    },
    {
      key: "items", label: B.colItems, width: FIXED.items, minWidth: FIXED.items, sortable: true, wrap: true,
      accessor: (g) => <TwoLineCell top={B.qty(g.category, g.qty)} sub={B.models(g.models)} />,
      sortFn: (a, b) => a.qty - b.qty,
      exportValue: (g) => B.qty(g.category, g.qty),
    },
    {
      key: "orders", label: B.colOrders, headerLines: ["Sales", "orders"], width: FIXED.orders, minWidth: FIXED.orders, sortable: true, wrap: true,
      accessor: (g) => <TwoLineCell top={String(g.orders.length)} sub={<span title={g.orders.map((o) => soRef(o.so)).join(", ")}>{B.orderRefs(g.orders, soRef)}</span>} />,
      sortFn: (a, b) => a.orders.length - b.orders.length,
      exportValue: (g) => g.orders.map((o) => soRef(o.so)).join(", "),
    },
    {
      key: "deadline", label: B.colDeadline, headerLines: ["Order PO", "deadline"], width: FIXED.deadline, minWidth: FIXED.deadline, sortable: true, wrap: true,
      accessor: (g) => {
        if (g.ordered) return <span className="text-body text-c-secondary">{B.ordered}</span>;
        if (!g.orderBy) return <span className="text-body text-c-secondary">{B.notRecorded}</span>;
        const days = daysBetween(today, g.orderBy);
        return <TwoLineCell warn={days < 0} top={fmtDateShort(g.orderBy)} sub={`${weekday(g.orderBy)} · ${B.deadline(days)}`} testId={`by-supplier-deadline-${g.key}`} />;
      },
      sortFn: (a, b) => (a.orderBy ?? "9999").localeCompare(b.orderBy ?? "9999"),
      exportValue: (g) => g.orderBy ?? "",
    },
    {
      key: "readyBy", label: B.colReadyBy, headerLines: ["Supplier", "ready by"], width: FIXED.readyBy, minWidth: FIXED.readyBy, sortable: true, wrap: true,
      accessor: (g) =>
        g.readyBy
          ? <TwoLineCell top={fmtDateShort(g.readyBy)} sub={g.ordered ? weekday(g.readyBy) : `${weekday(g.readyBy)} · ${B.ifSentToday}`} />
          : <span className="text-body text-c-secondary">{g.supplier ? B.notRecorded : B.supplierNotSet}</span>,
      sortFn: (a, b) => (a.readyBy ?? "9999").localeCompare(b.readyBy ?? "9999"),
      exportValue: (g) => g.readyBy ?? "",
    },
    {
      key: "status", label: B.colStatus, width: FIXED.status, minWidth: FIXED.status, sortable: true, wrap: true,
      accessor: statusCell,
      sortFn: (a, b) => Number(!!a.ordered) - Number(!!b.ordered) || Number(b.cutOffPassed) - Number(a.cutOffPassed),
      filterValue: statusWord,
      exportValue: statusWord,
    },
  ], [today, supplierWidth, twoCategories, by]);

  /* `By category` and `By order deadline`: the same rows of lines, grouped
     another way. The first column names the group; Suppliers lists who makes
     the goods; Items, Sales orders and Status read as they do by supplier. */
  const columns = useMemo<DataGridColumn<SupplierGroup>[]>(() => {
    if (by === "supplier") return supplierColumns;
    const pick = (key: string) => supplierColumns.find((column) => column.key === key)!;
    const search = pick("supplier").searchValue;
    const deadlineLabel = (g: SupplierGroup) => {
      if (g.deadline === "passed") return { top: B.deadlinePassed, sub: g.orderBy ? B.deadline(daysBetween(today, g.orderBy)) : "", warn: true };
      if (g.deadline === "later") return { top: B.nextWeekAndLater, sub: g.orderBy ? B.from(fmtDateShort(g.orderBy)) : "", warn: false };
      if (g.deadline === "none" || !g.orderBy) return { top: B.notRecorded, sub: "", warn: false };
      return { top: fmtDateShort(g.orderBy), sub: `${weekday(g.orderBy)} · ${B.deadline(daysBetween(today, g.orderBy))}`, warn: false };
    };
    const first: DataGridColumn<SupplierGroup> = by === "category" ? {
      key: "category", label: B.colCategory, width: supplierWidth, minWidth: SUPPLIER_MIN, sortable: true, wrap: true,
      accessor: (g) => <TwoLineCell strong top={B.category(g.category)} testId={`by-supplier-name-${g.key}`} />,
      searchValue: (g) => `${B.category(g.category)} ${g.suppliers.join(" ")} ${search ? search(g) : ""}`,
      filterValue: (g) => B.category(g.category),
      exportValue: (g) => B.category(g.category),
    } : {
      key: "deadlineGroup", label: B.colDeadline, width: supplierWidth, minWidth: SUPPLIER_MIN, sortable: true, wrap: true,
      accessor: (g) => { const label = deadlineLabel(g); return <TwoLineCell strong warn={label.warn} top={label.top} sub={label.sub} testId={`by-supplier-name-${g.key}`} />; },
      sortFn: (a, b) => (a.orderBy ?? "9999").localeCompare(b.orderBy ?? "9999"),
      searchValue: (g) => `${deadlineLabel(g).top} ${g.suppliers.join(" ")} ${search ? search(g) : ""}`,
      filterValue: (g) => deadlineLabel(g).top,
      exportValue: (g) => g.orderBy ?? deadlineLabel(g).top,
    };
    return [
      first,
      { ...pick("items"), accessor: (g) => <TwoLineCell top={B.qty(unitOf(g), g.qty)} sub={B.models(g.models)} />, exportValue: (g) => B.qty(unitOf(g), g.qty) },
      pick("orders"),
      {
        key: "suppliers", label: B.colSuppliers, width: GROUPED.suppliers, minWidth: GROUPED.suppliers, sortable: true, wrap: true,
        accessor: (g) => <TwoLineCell top={g.suppliers[0] ?? B.supplierNotSet} sub={B.moreSuppliers(g.suppliers)} />,
        sortFn: (a, b) => (a.suppliers[0] ?? "").localeCompare(b.suppliers[0] ?? ""),
        filterValue: (g) => g.suppliers[0] ?? B.supplierNotSet,
        exportValue: (g) => g.suppliers.join(", ") || B.supplierNotSet,
      },
      { ...pick("status"), width: GROUPED.status, minWidth: GROUPED.status },
    ];
  }, [by, supplierColumns, supplierWidth, today]);

  /* An item line repeats the row's columns: its tick under the row's tick,
     its name under Supplier, then quantity, sales order and deadline under
     their own headers. The engine starts an opened row at the first data
     column, so the lines step back over the tick and arrow columns (72). */
  const grouped = by !== "supplier";
  const lineColumns = grouped
    ? (drawn.length >= 5
      ? `${drawn.slice(0, 5).map((width) => `${width}px`).join(" ")} ${LINE_SUPPLIER}px 1fr`
      : `40px 32px ${Math.max(SUPPLIER_MIN, supplierWidth)}px ${GROUPED.items + 2}px ${GROUPED.orders + 2}px ${LINE_SUPPLIER}px 1fr`)
    : drawn.length >= 6
      ? `${drawn.slice(0, 6).map((width) => `${width}px`).join(" ")} 1fr`
      : `40px 32px ${Math.max(SUPPLIER_MIN, supplierWidth)}px ${FIXED.items + 2}px ${FIXED.orders + 2}px ${FIXED.deadline + 3}px 1fr`;
  const stepBack = drawn.length >= 2 ? drawn[0]! + drawn[1]! : 72;

  return (
    /* The kit's table puts 10 between columns and no padding inside a cell
       (01 §5). The listing engine pads every cell instead, so its padding is
       5 a side here: the same 10 between column texts, and the widths above
       then hold the same words the kit's do. */
    <div ref={box} className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="by-supplier" style={{ ["--table-row-pad" as string]: "6px 5px" }}>
    <DataGrid<SupplierGroup>
      rows={groups}
      columns={columns}
      storageKey={storageKey}
      sessionKey={sessionKey}
      rowKey={(g) => g.key}
      rowTestId={(g) => `by-supplier-row-${g.key}`}
      rowHeight={54}
      appearance="reference"
      palette="slate"
      presentationTools
      /* The ⋮ menu opens below its button and to the left. The toolbar ends
         one Status column short (where the design file has its Tasks button),
         so the button is not over Status and its menu never covers that
         column (owner 13 Oct 2026). */
      toolbarAfterTools={toolbarAfterTools ?? <span aria-hidden className="block" style={{ width: (by === "supplier" ? FIXED.status : GROUPED.status) + 8 }} />}
      wrapToolbar
      /* The top bar already searches everything; here search is one icon, so
         the tabs and the view button stay on one line (01 §4). */
      searchPresentation="icon"
      allowColumnGrouping={false}
      groupBanner={false}
      isLoading={isLoading}
      warning={warning}
      emptyMessage={emptyMessage}
      noMatchMessage={noMatchMessage ?? emptyMessage}
      onClearConditions={onClearConditions}
      initialSearch={initialSearch}
      searchPlaceholder={searchPlaceholder}
      toolbarStart={toolbarStart}
      toolbarEnd={toolbarEnd}
      exportName={B.view}
      expandable={{
        flush: true,
        testId: (g) => `by-supplier-expand-${g.key}`,
        renderExpansion: (g) => g.ordered ? (
          <ItemRows label={`${nameOf(g)} items`} stepBack={stepBack} testId={`by-supplier-lines-${g.key}`}>
            <div role="row" className="grid min-h-[32px] items-center bg-c-info-bg text-meta font-medium text-c-secondary" style={{ gridTemplateColumns: lineColumns }}>
              <span role="columnheader" />
              <span role="columnheader" />
              <span role="columnheader" className="px-[5px]">{B.lineItem}</span>
              <span role="columnheader" className="px-[5px]">{B.lineQty}</span>
              <span role="columnheader" className="px-[5px]">{B.lineSoNo}</span>
              {grouped ? <span role="columnheader" className="px-[5px]">{B.lineSupplier}</span> : null}
              <span role="columnheader" className="px-[5px]">{B.linePoNo}</span>
              {grouped ? null : <span role="columnheader" />}
            </div>
            {g.ordered.lines.map((line) => (
              <div key={line.id} role="row" className="grid min-h-[44px] items-center border-t border-c-row-line py-1"
                style={{ gridTemplateColumns: lineColumns }} data-testid={`by-supplier-ordered-line-${line.id}`}>
                <span role="cell" />
                <span role="cell" />
                <span role="cell" className="flex min-w-0 flex-col px-[5px]">
                  <span className="break-words text-body text-c-ink">{line.sku}</span>
                  {line.variant ? <span className="break-words text-meta text-c-secondary">{line.variant}</span> : null}
                </span>
                <span role="cell" className="px-[5px] text-body text-c-ink">{B.qty(line.category, line.qty)}</span>
                <span role="cell" className="px-[5px]">
                  <button type="button" onClick={() => onOpenOrder(line.orderId)}
                    className="text-body font-semibold text-c-ink underline decoration-c-secondary decoration-dotted underline-offset-[3px] hover:decoration-solid">
                    {soRef(line.so)}
                  </button>
                </span>
                {grouped ? <span role="cell" className="break-words px-[5px] text-body text-c-ink">{line.supplier ?? B.supplierNotSet}</span> : null}
                <span role="cell" className="break-words px-[5px] text-body text-c-ink" style={grouped ? undefined : { gridColumn: "6 / -1" }}>{poNo(line.poId)}</span>
              </div>
            ))}
          </ItemRows>
        ) : (
          <ItemRows label={`${nameOf(g)} items`} stepBack={stepBack} testId={`by-supplier-lines-${g.key}`}>
            <div role="row" className="grid min-h-[32px] items-center bg-c-info-bg text-meta font-medium text-c-secondary" style={{ gridTemplateColumns: lineColumns }}>
              <span role="columnheader" />
              <span role="columnheader" />
              <span role="columnheader" className="px-[5px]">{B.lineItem}</span>
              <span role="columnheader" className="px-[5px]">{B.lineToBuy}</span>
              <span role="columnheader" className="px-[5px]">{B.lineSoNo}</span>
              <span role="columnheader" className="px-[5px]">{grouped ? B.lineSupplier : B.lineOrderBy}</span>
              <span role="columnheader" className="px-[5px]">{B.lineDeliverTo}</span>
            </div>
            {g.lines.map((line) => {
              const buy = canBuy(line);
              const days = line.orderBy ? daysBetween(today, line.orderBy) : null;
              const extras = lineExtras?.(line) ?? {};
              return (
                <div key={line.id} role="row"
                  className="grid min-h-[44px] items-center border-t border-c-row-line py-1"
                  style={{ gridTemplateColumns: lineColumns }}
                  data-testid={`by-supplier-line-${line.id}`}>
                  <span role="cell" className="grid place-items-center">
                    <RowTick testId={`by-supplier-tick-${line.id}`} label={`Select ${modelCode(line)} for ${soRef(line.so)}`}
                      checked={isTicked(line.id)} disabled={!buy} why={extras.whyText} onChange={() => onToggleLine(line.id)} />
                  </span>
                  <span role="cell" />
                  <span role="cell" className="flex min-w-0 flex-col px-[5px]">
                    <span className="break-words text-body text-c-ink">{modelCode(line)}</span>
                    {line.variant ? <span className="break-words text-meta text-c-secondary">{line.variant}</span> : null}
                  </span>
                  <span role="cell" className="px-[5px] text-body text-c-ink">{B.qty(line.category, line.toBuy ?? 0)}</span>
                  <span role="cell" className="flex min-w-0 flex-col items-start px-[5px]">
                    <button type="button" onClick={() => onOpenOrder(line.orderId)}
                      className="text-body font-semibold text-c-ink underline decoration-c-secondary decoration-dotted underline-offset-[3px] hover:decoration-solid">
                      {soRef(line.so)}
                    </button>
                    {/* Grouped another way, the line's own deadline sits under its Sales Order (the design file). */}
                    {grouped && line.orderBy && days != null
                      ? <span className={`text-meta ${days < 0 ? "text-c-warn-fg" : "text-c-secondary"}`}>{B.deadline(days)}</span> : null}
                  </span>
                  {grouped ? (
                    <span role="cell" className="break-words px-[5px] text-body text-c-ink">{line.supplier ?? B.supplierNotSet}</span>
                  ) : (
                    <span role="cell" className={`flex min-w-0 flex-col px-[5px] ${days != null && days < 0 ? "text-c-warn-fg" : "text-c-secondary"}`}>
                      {line.orderBy && days != null
                        ? <><span className="text-body text-c-ink">{fmtDateShort(line.orderBy)}</span><span className="text-meta">{B.deadline(days)}</span></>
                        : <span className="text-meta">{B.notRecorded}</span>}
                    </span>
                  )}
                  <span role="cell" className="min-w-0 px-[5px] text-body text-c-ink" data-testid={`by-supplier-deliver-${line.id}`}>
                    {extras.deliverTo ?? extras.door ?? null}
                  </span>
                </div>
              );
            })}
          </ItemRows>
        ),
      }}
      selectable={{
        selectedKeys: new Set(groups.filter((g) => { const ids = buyable.get(g.key) ?? []; return ids.length > 0 && ticked(g) === ids.length; }).map((g) => g.key)),
        onToggle: (key) => {
          const g = groups.find((x) => x.key === key); if (!g) return;
          const ids = buyable.get(key) ?? [];
          onToggleLines(ids, ticked(g) !== ids.length);
        },
        onToggleAll: (keys, allSelected) => onToggleLines(keys.flatMap((k) => buyable.get(k) ?? []), !allSelected),
        isSelectable: (g: SupplierGroup) => (buyable.get(g.key) ?? []).length > 0,
        isIndeterminate: (g: SupplierGroup) => { const n = ticked(g); return n > 0 && n < (buyable.get(g.key) ?? []).length; },
        testId: (g: SupplierGroup) => `by-supplier-select-${g.key}`,
      }}
      selectionSummary={() => selectionSummary}
      selectionPrimary={selectionPrimary}
      statusSummary={(filtered) => (
        <span className="block" data-testid="by-supplier-footer">
          {filtered.length === groups.length ? B.footer(groups.length) : `${filtered.length} of ${B.footer(groups.length)}`}
        </span>
      )}
    />
    </div>
  );
}
