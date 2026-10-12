/**
 * SO BATCH PURCHASE · BY SUPPLIER (owner 12 Oct 2026; 01 §5; Purchasing MASTER
 * §9.1). The demand of the By sales order list, read the way a buyer orders
 * it: one row per supplier and category. A row opens to its item lines; a tick
 * on the row ticks every line of it that can be bought, and the same
 * `Issue PO` door takes the ticks.
 *
 * It is the ONE listing engine with six columns (01 §5):
 *   Supplier (takes the room that is left) · Items 80 · Sales orders 96 ·
 *   Order PO deadline 120 · Supplier ready by 120 · Status 120.
 * Words: COPY-STANDARD "SO Batch Purchase · By supplier". Every date and
 * number is the server's; this file only draws.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PurchaseDemandRow } from "@carres/shared";
import Checkbox from "@/components/kit/Checkbox";
import StatusPill from "@/components/kit/StatusPill";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { BY_SUPPLIER as B, daysBetween, type SupplierGroup } from "./by-supplier";

/** The five fixed columns (01 §5) and the grid's own tick and arrow columns. */
const FIXED = { items: 80, orders: 96, deadline: 120, readyBy: 120, status: 120 } as const;
const FIXED_TOTAL = FIXED.items + FIXED.orders + FIXED.deadline + FIXED.readyBy + FIXED.status;
/* 72 for the tick and the arrow, and 8 because the engine gives a sortable
   header a few pixels more than its column asks for. */
const GRID_LEAD = 80;
const SUPPLIER_MIN = 150;

const soRef = (so: number | null) => (so == null ? B.notRecorded : `SO-${so}`);
const weekday = (iso: string) => fmtDate(iso).split(",")[0] ?? "";

/** Two lines in one cell: the value, then one grey line (01 §5 cell formats). */
function Two({ top, sub, warn = false, strong = false, testId }: {
  top: ReactNode; sub?: ReactNode; warn?: boolean; strong?: boolean; testId?: string;
}) {
  return (
    <span className="flex min-w-0 flex-col" data-testid={testId}>
      <span className={`text-body ${strong ? "font-semibold" : ""} ${warn ? "text-c-warn-fg" : "text-c-ink"}`}>{top}</span>
      {sub ? <span className={`break-words text-meta ${warn ? "text-c-warn-fg" : "text-c-secondary"}`}>{sub}</span> : null}
    </span>
  );
}

export default function SoBatchBySupplier({
  groups, today, isLoading, storageKey, sessionKey, canBuy, isTicked, onToggleLine, onToggleLines,
  selectionSummary, selectionPrimary, toolbarEnd, toolbarStart, onOpenOrder, emptyMessage, initialSearch, searchPlaceholder,
}: {
  groups: SupplierGroup[];
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
  toolbarStart?: ReactNode;
  onOpenOrder: (orderId: string) => void;
  emptyMessage: string;
  initialSearch?: string;
  searchPlaceholder?: string;
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
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setRoom(el.clientWidth));
    observer.observe(el);
    setRoom(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  const supplierWidth = room > 0 ? Math.max(SUPPLIER_MIN, Math.floor(room - GRID_LEAD - FIXED_TOTAL - 2)) : 260;

  const columns = useMemo<DataGridColumn<SupplierGroup>[]>(() => [
    {
      key: "supplier", label: B.colSupplier, width: supplierWidth, minWidth: SUPPLIER_MIN, sortable: true, wrap: true,
      accessor: (g) => <Two strong top={g.supplier ?? B.supplierNotSet} sub={B.supplierLine(g)} testId={`by-supplier-name-${g.key}`} />,
      sortFn: (a, b) => (a.supplier ?? "").localeCompare(b.supplier ?? ""),
      searchValue: (g) => `${g.supplier ?? B.supplierNotSet} ${g.lines.map((l) => `${l.item} ${l.variant ?? ""} ${soRef(l.so)}`).join(" ")}`,
      filterValue: (g) => g.supplier ?? B.supplierNotSet,
      exportValue: (g) => g.supplier ?? B.supplierNotSet,
    },
    {
      key: "items", label: B.colItems, width: FIXED.items, minWidth: FIXED.items, sortable: true, wrap: true,
      accessor: (g) => <Two top={B.qty(g.category, g.qty)} sub={B.models(g.models)} />,
      sortFn: (a, b) => a.qty - b.qty,
      exportValue: (g) => B.qty(g.category, g.qty),
    },
    {
      key: "orders", label: B.colOrders, headerLines: ["Sales", "orders"], width: FIXED.orders, minWidth: FIXED.orders, sortable: true, wrap: true,
      accessor: (g) => <Two top={String(g.orders.length)} sub={<span title={g.orders.map((o) => soRef(o.so)).join(", ")}>{B.orderRefs(g.orders, soRef)}</span>} />,
      sortFn: (a, b) => a.orders.length - b.orders.length,
      exportValue: (g) => g.orders.map((o) => soRef(o.so)).join(", "),
    },
    {
      key: "deadline", label: B.colDeadline, headerLines: ["Order PO", "deadline"], width: FIXED.deadline, minWidth: FIXED.deadline, sortable: true, wrap: true,
      accessor: (g) => {
        if (!g.orderBy) return <span className="text-body text-c-secondary">{B.notRecorded}</span>;
        const days = daysBetween(today, g.orderBy);
        return <Two warn={days < 0} top={fmtDateShort(g.orderBy)} sub={`${weekday(g.orderBy)} · ${B.deadline(days)}`} testId={`by-supplier-deadline-${g.key}`} />;
      },
      sortFn: (a, b) => (a.orderBy ?? "9999").localeCompare(b.orderBy ?? "9999"),
      exportValue: (g) => g.orderBy ?? "",
    },
    {
      key: "readyBy", label: B.colReadyBy, headerLines: ["Supplier", "ready by"], width: FIXED.readyBy, minWidth: FIXED.readyBy, sortable: true, wrap: true,
      accessor: (g) =>
        g.readyBy
          ? <Two top={fmtDateShort(g.readyBy)} sub={`${weekday(g.readyBy)} · ${B.ifSentToday}`} />
          : <span className="text-body text-c-secondary">{g.supplier ? B.notRecorded : B.supplierNotSet}</span>,
      sortFn: (a, b) => (a.readyBy ?? "9999").localeCompare(b.readyBy ?? "9999"),
      exportValue: (g) => g.readyBy ?? "",
    },
    {
      key: "status", label: B.colStatus, width: FIXED.status, minWidth: FIXED.status, sortable: true, wrap: true,
      accessor: (g) => (
        <span className="flex min-w-0 flex-col items-start gap-0.5" data-testid={`by-supplier-status-${g.key}`}>
          <StatusPill tone={g.cutOffPassed ? "warning" : "neutral"}>{g.cutOffPassed ? B.cutOffPassed : B.toBuy}</StatusPill>
          <span className={`text-meta ${g.cutOffPassed ? "text-c-warn-fg" : "text-c-secondary"}`}>
            {g.cutOffPassed ? B.toBuyLine(g.category, g.qty) : B.qty(g.category, g.qty)}
          </span>
        </span>
      ),
      sortFn: (a, b) => Number(b.cutOffPassed) - Number(a.cutOffPassed),
      filterValue: (g) => (g.cutOffPassed ? B.cutOffPassed : B.toBuy),
      exportValue: (g) => (g.cutOffPassed ? B.cutOffPassed : B.toBuy),
    },
  ], [today, supplierWidth]);

  const suppliers = new Set(groups.map((g) => g.supplierId ?? "none")).size;
  /* An item line repeats the row's columns: its tick and name under Supplier,
     then quantity, sales order and deadline under their own headers. */
  const lineColumns = `40px ${Math.max(SUPPLIER_MIN, supplierWidth) - 40}px ${FIXED.items + 4}px ${FIXED.orders}px ${FIXED.deadline}px 1fr`;

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
      wrapToolbar
      searchPresentation="responsive"
      allowColumnGrouping={false}
      groupBanner={false}
      isLoading={isLoading}
      emptyMessage={emptyMessage}
      noMatchMessage={emptyMessage}
      initialSearch={initialSearch}
      searchPlaceholder={searchPlaceholder}
      toolbarStart={toolbarStart}
      toolbarEnd={toolbarEnd}
      exportName={B.view}
      expandable={{
        flush: true,
        testId: (g) => `by-supplier-expand-${g.key}`,
        renderExpansion: (g) => (
          <div role="table" aria-label={`${g.supplier ?? B.supplierNotSet} items`} className="bg-white" data-testid={`by-supplier-lines-${g.key}`}>
            {g.lines.map((line) => {
              const buy = canBuy(line);
              const days = line.orderBy ? daysBetween(today, line.orderBy) : null;
              return (
                <div key={line.id} role="row"
                  className="grid min-h-[44px] items-center border-t border-c-row-line py-1.5"
                  style={{ gridTemplateColumns: lineColumns }}
                  data-testid={`by-supplier-line-${line.id}`}>
                  <span role="cell" className="pl-[5px]">
                    <Checkbox id={`by-supplier-tick-${line.id}`} ariaLabel={`Select ${line.item} for ${soRef(line.so)}`}
                      checked={isTicked(line.id)} disabled={!buy} onCheckedChange={() => onToggleLine(line.id)} />
                  </span>
                  <span role="cell" className="flex min-w-0 flex-col pr-[5px]">
                    <span className="break-words text-body text-c-ink">{line.item}</span>
                    {line.variant ? <span className="break-words text-meta text-c-secondary">{line.variant}</span> : null}
                  </span>
                  <span role="cell" className="px-[5px] text-body text-c-ink">{B.qty(line.category, line.toBuy ?? 0)}</span>
                  <span role="cell" className="px-[5px]">
                    <button type="button" onClick={() => onOpenOrder(line.orderId)}
                      className="text-body font-semibold text-c-ink underline decoration-c-secondary decoration-dotted underline-offset-[3px] hover:decoration-solid">
                      {soRef(line.so)}
                    </button>
                  </span>
                  <span role="cell" className={`flex min-w-0 flex-col px-[5px] ${days != null && days < 0 ? "text-c-warn-fg" : "text-c-secondary"}`}>
                    {line.orderBy && days != null
                      ? <><span className="text-body text-c-ink">{fmtDateShort(line.orderBy)}</span><span className="text-meta">{B.deadline(days)}</span></>
                      : <span className="text-meta">{B.notRecorded}</span>}
                  </span>
                </div>
              );
            })}
          </div>
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
        <span className="block truncate" data-testid="by-supplier-footer">
          {filtered.length === groups.length ? B.footer(groups.length, suppliers) : `${filtered.length} of ${B.footer(groups.length, suppliers)}`}
        </span>
      )}
    />
    </div>
  );
}
