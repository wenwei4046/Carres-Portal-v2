/**
 * THE DELIVERY ORDERS REGISTER — document truth on the shared Register grammar.
 * Owner UI correction 2026-09-06 · `docs/delivery/MASTER.md` §8 ·
 * register shell law `docs/ui/MASTER.md` §6.7.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE SALES ORDERS GRAMMAR, APPLIED (owner correction 2026-09-06)
 *
 * The register lacked the shared Register powers every other document register
 * carries: row checkboxes, header select-all, the in-place selection toolbar,
 * ▸ expansion, sticky identity and a 240px page-owned FilterRail. This
 * correction adds them through the SAME engine (`register/DataGrid`) and the
 * SAME rail recipe (`FilterRail`) — nothing page-local is invented.
 *
 * ── SELECTION IS DOCUMENT-ORIENTED ──────────────────────────────────────────
 *
 * `Print {n} delivery orders` — the governed DO document per row, one file.
 * There is deliberately NO `Assign logistics` here: initial assignment lives
 * on Monitor, whose planning population includes scopes that have no DO yet.
 * A register's selection scopes OUTPUT, never a write (MASTER §8).
 *
 * ── THE RAIL ────────────────────────────────────────────────────────────────
 *
 * WORK TO DO — lenses over canonical recorded facts (delivery-orders-register
 * owns the arithmetic; a queue with no canonical record is not faked).
 * DOCUMENT STATUS — the document ladder's own five words. One document sits in
 * at most one primary queue; finished work leaves the queue and stays in the
 * status views.
 *
 * There is still NO create button: the SYSTEM issues a DO when a trip's
 * requirements are met (orders MASTER §8) — no Release, no Approve, no Issue.
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PanelLeftOpen } from "lucide-react";
import { toast } from "sonner";
import type { DeliveryHandoverKind, DeliveryOrderStatus, OrderActionTone } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import StatusPill from "@/components/kit/StatusPill";
import { ApiError, apiFetch } from "@/lib/api";
import { renderCombinedDoPdf } from "@/lib/pdf/render";
import type { DoTemplateData } from "@/lib/pdf/types";
import {
  useDeliveryOrdersRegister,
  useSalesOrderExpansion,
  type DeliveryOrderAttemptRow,
} from "@/lib/queries";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridContextMenuItem,
} from "@/components/register/DataGrid";
import ModuleHeader from "./components/ModuleHeader";
import GoodsMiniTable, { goodsCategoryOf, type GoodsMiniLine } from "./components/GoodsMiniTable";
import { FilterRail, FilterRailGroup, FilterRailRow } from "./components/workspace-rail";
import { lineName } from "./sales-order-facts";
import { DATE_TO_BE_CONFIRMED_FULL } from "./sales-order-guidance";
import { requestedDeliveryText } from "./sales-order-columns";
import { DW } from "./delivery-work";
import {
  DELIVERY_RESULT_LABEL,
  DOR_COPY,
  DO_QUEUE_LABEL,
  DO_STATUS_KEYS,
  DO_WORK_QUEUES,
  buildDoRegisterRails,
  buildDoRegisterRow,
  doRegisterFooter,
  matchesDoFilters,
  type DoRegisterFilters,
  type DoRegisterRow,
  type DoWorkQueue,
} from "./delivery-orders-register";

/** Owner column ruling 2026-08-18: Created GREY · Out for delivery BLUE ·
 *  Delivered GREEN · Delivery exception AMBER (+ its reason, small line 2). */
const STATUS_TONE: Record<DeliveryOrderStatus["kind"], OrderActionTone> = {
  created: "neutral",
  out_for_delivery: "info",
  delivered: "success",
  exception: "warning",
  cancelled: "neutral",
};

const STATUS_LABEL: Record<DeliveryOrderStatus["kind"], string> = {
  created: "Created",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  exception: "Delivery exception",
  cancelled: "Cancelled",
};

const FILTER_RAIL_STORAGE_KEY = "carres.deliveryOrders.filterRail";

/** ⭐ AN ABSENCE IS QUIETER THAN A FACT — owner ruling 2026-08-15. */
function Absent({ children }: { children: string }) {
  return (
    <span className="text-kit-slate-9" data-absence="true">
      {children}
    </span>
  );
}

/**
 * ▸ HAS EXACTLY ONE JOB: this DOCUMENT's goods lines, read-only — the trip's
 * own scope (`tripLinesOf`, one arithmetic with the DO page), through the
 * shared `GoodsMiniTable`.
 */
function DoExpansion({ row }: { row: DoRegisterRow }) {
  const expansion = useSalesOrderExpansion(row.orderId);
  const factsByLine = new Map((expansion.data?.lines ?? []).map((l) => [l.lineId, l]));
  const miniLines: GoodsMiniLine[] = row.lines.map((line, index): GoodsMiniLine => {
    const fact = factsByLine.get(line.id ?? "");
    return {
      key: line.id ?? `${line.sku}-${index}`,
      testId: `do-good-${line.sku}`,
      category: goodsCategoryOf(line),
      unitIds: fact?.unitIds ?? [],
      unitAbsence: "Not allocated",
      deliverTo: (fact?.deliverTo ?? []).map((d) =>
        (fact?.deliverTo.length ?? 0) > 1 ? `${d.name} ×${d.qty}` : d.name,
      ),
      deliverToAbsence: expansion.isLoading ? "Loading…" : DW.notRecorded,
      sku: line.sku,
      qty: line.qty,
      item: lineName(line),
      selectable: true,
    };
  });
  return (
    <div data-testid="do-register-expansion">
      {miniLines.length === 0 ? (
        <div className="px-2 py-2 text-body text-kit-slate-11">{DOR_COPY.noGoods}</div>
      ) : (
        <GoodsMiniTable label={`Goods on ${row.doNumber}`} lines={miniLines} />
      )}
    </div>
  );
}

/**
 * `Print {n} delivery orders` — each document's data assembled server-side
 * under RLS exactly as the single-DO print does, then ONE file carrying one
 * governed DO page per document. READ-ONLY.
 */
async function printDeliveryOrders(rows: DoRegisterRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const bundles: DoTemplateData[] = [];
    for (const r of rows) {
      bundles.push(
        await apiFetch<DoTemplateData>(
          `/api/operation/orders/${r.orderId}/print-do-data?do_number=${encodeURIComponent(r.doNumber)}`,
        ),
      );
    }
    const blob = await renderCombinedDoPdf(bundles);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : String(error);
    toast.error(`Printing ${rows.length} delivery orders failed: ${message}`);
  }
}

/** This register's row, through the portal's ONE `Requested Delivery Date`
 *  spelling — cell, search, per-column filter and Excel export alike. */
function requestedText(r: DoRegisterRow): string {
  return requestedDeliveryText({ iso: r.requestedDelivery, tbd: r.requestedTbd });
}

export default function DeliveryOrdersRegister() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceOrderId = searchParams.get("order")?.trim() || undefined;
  const { data, isLoading, isError, error, refetch } = useDeliveryOrdersRegister(
    sourceOrderId ? { orderId: sourceOrderId } : undefined,
  );

  /* ── THE RAIL PICKS RIDE THE URL ───────────────────────────────────────── */
  const workParam = searchParams.get("work");
  const statusParam = searchParams.get("status");
  const filters: DoRegisterFilters = useMemo(
    () => ({
      queue: (DO_WORK_QUEUES as readonly string[]).includes(workParam ?? "")
        ? (workParam as DoWorkQueue)
        : null,
      status: (DO_STATUS_KEYS as readonly string[]).includes(statusParam ?? "")
        ? (statusParam as DeliveryOrderStatus["kind"])
        : null,
    }),
    [workParam, statusParam],
  );
  const toggleParam = (key: "work" | "status", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (searchParams.get(key) === value) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: false });
  };
  const clearParam = (key: "work" | "status") => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    setSearchParams(next, { replace: false });
  };

  const [filterRailOpen, setFilterRailOpen] = useState(() => {
    try {
      return localStorage.getItem(FILTER_RAIL_STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const setFilterRailVisible = (open: boolean) => {
    setFilterRailOpen(open);
    try {
      localStorage.setItem(FILTER_RAIL_STORAGE_KEY, open ? "1" : "0");
    } catch {
      /* Storage may be unavailable; the live state still works. */
    }
  };

  const allRows = useMemo<DoRegisterRow[]>(() => {
    const attemptsByDo = new Map<string, DeliveryOrderAttemptRow[]>();
    for (const a of data?.attempts ?? []) {
      if (!a.do_number) continue;
      const list = attemptsByDo.get(a.do_number) ?? [];
      list.push(a);
      attemptsByDo.set(a.do_number, list);
    }
    // The §4 handover facts (0363) — Received by Logistics lights the blue pill.
    const handoverByDoId = new Map<string, DeliveryHandoverKind[]>();
    for (const e of data?.handoverEvents ?? []) {
      const list = handoverByDoId.get(e.delivery_order_id) ?? [];
      list.push(e.kind);
      handoverByDoId.set(e.delivery_order_id, list);
    }
    return (data?.deliveryOrders ?? []).map((r) =>
      buildDoRegisterRow(r, attemptsByDo, handoverByDoId),
    );
  }, [data]);

  const rails = useMemo(() => buildDoRegisterRails(allRows, filters), [allRows, filters]);
  const rows = useMemo(
    () => allRows.filter((r) => matchesDoFilters(r, filters)),
    [allRows, filters],
  );

  /* ── SELECTION — ticks scope document OUTPUT only, never a write. ──────── */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleRow = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  /* Header select-all acts on the VISIBLE filtered rows the engine hands in —
     never on rows a filter hid. */
  const toggleAll = useCallback((keys: string[], allSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (allSelected) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }, []);

  const openDeliveryOrder = useCallback(
    (r: DoRegisterRow) =>
      navigate(`/operation/delivery-orders/${encodeURIComponent(r.doNumber)}`),
    [navigate],
  );

  const columns = useMemo<DataGridColumn<DoRegisterRow>[]>(
    () => [
      {
        /* THE IDENTITY COLUMN — pins while optional columns widen the sheet. */
        key: "do_number",
        label: "DO No",
        width: 150,
        sortable: true,
        filterType: "numbering",
        chooserGroup: "Document",
        accessor: (r) => (
          <button
            type="button"
            className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              openDeliveryOrder(r);
            }}
          >
            {r.doNumber}
          </button>
        ),
        searchValue: (r) => r.doNumber,
        filterValue: (r) => r.doNumber,
      },
      {
        /* The fact cell stays focused on identity (owner correction
           2026-09-06): the inline `Order Route` second line is retired; the
           route stays one right-click away in the governed context menu. */
        key: "so",
        label: "SO No",
        width: 110,
        sortable: true,
        filterType: "numbering",
        chooserGroup: "Document",
        accessor: (r) => (
          <button
            type="button"
            className="font-mono font-medium text-blue-700 underline-offset-2 hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/operation/orders/so/${encodeURIComponent(r.orderId)}`);
            }}
          >
            SO-{r.so}
          </button>
        ),
        searchValue: (r) => `SO-${r.so} ${r.so}`,
        filterValue: (r) => `SO-${r.so}`,
        sortFn: (a, b) => a.so - b.so,
      },
      {
        key: "customer",
        label: "Customer",
        width: 190,
        sortable: true,
        chooserGroup: "Customer",
        accessor: (r) => (
          <span className="block truncate" title={r.customer}>
            {r.customer}
          </span>
        ),
        searchValue: (r) => r.customer,
        filterValue: (r) => r.customer,
      },
      {
        /* `Requested Delivery Date` = the date the CUSTOMER asked Carres to
           deliver on, from the Sales Order — the governed word (owner ruling
           2026-08-27), read through the ONE `requestedDeliveryOf` arithmetic.
           ⭐ VISIBLE BY DEFAULT (owner correction 2026-09-09), immediately
           beside `Confirmed Delivery`: the register's job includes answering
           *what did the customer ask for, and has anyone agreed a day yet?* —
           and a column hidden in the chooser answers nobody. `DO date` — the
           day the document was issued — keeps its place at the far end; it is
           never either delivery date. */
        key: "customer_delivery",
        label: "Requested Delivery Date",
        width: 176,
        sortable: true,
        chooserGroup: "Dates",
        filterType: "date",
        dateValue: (r) => r.requestedDelivery,
        accessor: (r) =>
          r.requestedDelivery ? (
            requestedText(r)
          ) : (
            <span title={r.requestedTbd ? DATE_TO_BE_CONFIRMED_FULL : undefined}>
              <Absent>{requestedText(r)}</Absent>
            </span>
          ),
        /* ⭐ THE SHEET SAYS WHAT THE SCREEN SAYS. The cell prints three
           different things — a date, `To be confirmed`, `No delivery date` —
           and the export used to flatten the middle one into the last, so an
           Excel reader was told a customer had named no day when the customer
           had in fact asked for one still being settled. ONE spelling now
           feeds the cell, the search, the filter and the export. */
        searchValue: (r) => requestedText(r),
        exportValue: (r) => requestedText(r),
        filterValue: (r) => requestedText(r),
        sortFn: (a, b) =>
          (a.requestedDelivery ?? "").localeCompare(b.requestedDelivery ?? ""),
      },
      {
        /* `Confirmed Delivery` — the agreed operational day (COPY-STANDARD;
           the ambiguous `Delivery date` label is retired by the 2026-09-06
           correction). `Confirmed Time` is its own column in the chooser. */
        key: "confirmed_delivery",
        label: "Confirmed Delivery",
        width: 150,
        sortable: true,
        chooserGroup: "Dates",
        filterType: "date",
        dateValue: (r) => r.confirmedDelivery,
        accessor: (r) =>
          r.confirmedDelivery ? (
            fmtDate(r.confirmedDelivery)
          ) : (
            <Absent>{DOR_COPY.noConfirmedDate}</Absent>
          ),
        searchValue: (r) =>
          r.confirmedDelivery ? fmtDate(r.confirmedDelivery) : DOR_COPY.noConfirmedDate,
        filterValue: (r) =>
          r.confirmedDelivery ? fmtDate(r.confirmedDelivery) : DOR_COPY.noConfirmedDate,
        sortFn: (a, b) =>
          (a.confirmedDelivery ?? "").localeCompare(b.confirmedDelivery ?? ""),
      },
      {
        key: "confirmed_time",
        label: "Confirmed Time",
        width: 120,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Dates",
        accessor: (r) => r.confirmedTime ?? <Absent>{DOR_COPY.noTime}</Absent>,
        searchValue: (r) => r.confirmedTime ?? DOR_COPY.noTime,
        filterValue: (r) => r.confirmedTime ?? DOR_COPY.noTime,
      },
      {
        /* The partner named on the document — a snapshot fact of THIS trip. */
        key: "logistics",
        label: "Logistics Partner",
        width: 140,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Delivery",
        accessor: (r) =>
          r.logisticsPartner ?? <Absent>{DOR_COPY.noLogistics}</Absent>,
        searchValue: (r) => r.logisticsPartner ?? DOR_COPY.noLogistics,
        filterValue: (r) => r.logisticsPartner ?? DOR_COPY.noLogistics,
      },
      {
        key: "location",
        label: "Delivery Location",
        width: 180,
        sortable: true,
        chooserGroup: "Customer",
        accessor: (r) => (
          <span className="block truncate" title={r.location}>
            {r.location}
          </span>
        ),
        searchValue: (r) => r.location,
        filterValue: (r) => r.location,
      },
      {
        /* The LATEST recorded result — a fact somebody recorded, never a
           clock inference. */
        key: "delivery_result",
        label: "Delivery Result",
        width: 150,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Delivery",
        accessor: (r) =>
          r.latestResult ? (
            DELIVERY_RESULT_LABEL[r.latestResult]
          ) : (
            <Absent>{DOR_COPY.notDelivered}</Absent>
          ),
        searchValue: (r) =>
          r.latestResult ? DELIVERY_RESULT_LABEL[r.latestResult] : DOR_COPY.notDelivered,
        filterValue: (r) =>
          r.latestResult ? DELIVERY_RESULT_LABEL[r.latestResult] : DOR_COPY.notDelivered,
      },
      {
        /* Proof facts, stated — the T6 photo ledger and the signed document on
           file. An UNKNOWN ledger (older payload) prints nothing rather than a
           false absence; a document nobody delivered is not due proof yet. */
        key: "proof_status",
        label: "Proof Status",
        width: 170,
        sortable: true,
        chooserGroup: "Delivery",
        accessor: (r) => {
          const reached = r.latestResult === "delivered" || r.latestResult === "partial";
          if (!reached) return <Absent>{DOR_COPY.notDelivered}</Absent>;
          return (
            <span className="block min-w-0">
              {r.photosPresent === null ? null : (
                <span className="block truncate">
                  {r.photosPresent ? (
                    DOR_COPY.photoSaved
                  ) : (
                    <Absent>{DOR_COPY.noPhoto}</Absent>
                  )}
                </span>
              )}
              <span className="block truncate text-label font-normal">
                {r.signedDoPresent ? (
                  <span className="text-base-600">{DOR_COPY.signedDoOnFile}</span>
                ) : (
                  <Absent>{DOR_COPY.noSignedDo}</Absent>
                )}
              </span>
            </span>
          );
        },
        searchValue: (r) => {
          const reached = r.latestResult === "delivered" || r.latestResult === "partial";
          if (!reached) return DOR_COPY.notDelivered;
          return [
            r.photosPresent === null
              ? ""
              : r.photosPresent
                ? DOR_COPY.photoSaved
                : DOR_COPY.noPhoto,
            r.signedDoPresent ? DOR_COPY.signedDoOnFile : DOR_COPY.noSignedDo,
          ]
            .filter(Boolean)
            .join(" · ");
        },
        filterValue: (r) => {
          const reached = r.latestResult === "delivered" || r.latestResult === "partial";
          if (!reached) return DOR_COPY.notDelivered;
          if (r.photosPresent === false || !r.signedDoPresent) return "Proof required";
          return "Proof on file";
        },
      },
      {
        key: "status",
        label: "Status",
        width: 190,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Document",
        /* Two-line 13/11 grammar (ui MASTER §5): the pill is the document
           status; an exception's ONE reason rides line 2 in the quieter rank.
           A register still shows no action sentence — the reason is a FACT. */
        accessor: (r) => (
          <span className="block min-w-0">
            <StatusPill tone={STATUS_TONE[r.status.kind]}>{r.status.label}</StatusPill>
            {r.status.reasonLabel ? (
              <span className="block truncate text-label font-normal text-base-600">
                {r.status.reasonLabel}
              </span>
            ) : null}
          </span>
        ),
        searchValue: (r) =>
          r.status.reasonLabel ? `${r.status.label} ${r.status.reasonLabel}` : r.status.label,
        filterValue: (r) => r.status.label,
      },
      {
        /* `DO date` = the day the system issued this document (owner column
           ruling 2026-08-18). */
        key: "do_date",
        label: "DO date",
        width: 113,
        sortable: true,
        chooserGroup: "Dates",
        filterType: "date",
        dateValue: (r) => r.issuedAt,
        accessor: (r) => fmtDate(r.issuedAt),
        searchValue: (r) => fmtDate(r.issuedAt),
        filterValue: (r) => fmtDate(r.issuedAt),
        sortFn: (a, b) => a.issuedAt.localeCompare(b.issuedAt),
      },
      {
        key: "goods",
        label: "Goods",
        width: 220,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Delivery",
        accessor: (r) => (
          <span className="block truncate" title={r.goodsSummary}>
            {r.goodsSummary}
          </span>
        ),
        searchValue: (r) => r.goodsSummary,
        filterValue: (r) => r.goodsSummary,
      },
      {
        /* Available in the chooser, OFF by default (owner ruling 2026-08-18):
           `DO date` already answers when the document was issued. */
        key: "created",
        label: "Created",
        width: 113,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Dates",
        filterType: "date",
        dateValue: (r) => r.issuedAt,
        accessor: (r) => fmtDate(r.issuedAt),
        searchValue: (r) => fmtDate(r.issuedAt),
        filterValue: (r) => fmtDate(r.issuedAt),
        sortFn: (a, b) => a.issuedAt.localeCompare(b.issuedAt),
      },
    ],
    [navigate, openDeliveryOrder],
  );

  const contextMenu = useCallback(
    (r: DoRegisterRow): DataGridContextMenuItem[] => [
      { label: "View", onClick: () => openDeliveryOrder(r) },
      {
        label: "Open SO-" + r.so,
        onClick: () => navigate(`/operation/orders/so/${encodeURIComponent(r.orderId)}`),
      },
      {
        label: "Open Order Route",
        onClick: () =>
          navigate(`/operation/orders/so/${encodeURIComponent(r.orderId)}?route=1`),
      },
    ],
    [navigate, openDeliveryOrder],
  );

  const showFiltersButton = (
    <button
      type="button"
      aria-label="Show filters"
      title="Show filters"
      className="grid h-7 w-7 shrink-0 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
      data-testid="delivery-orders-show-filters"
      onClick={() => setFilterRailVisible(true)}
    >
      <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader
        testId="delivery-orders-destination-header"
        word={DOR_COPY.page}
        docTitle={DOR_COPY.docTitle}
        destinationHeader
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {filterRailOpen ? (
          <FilterRail
            testId="delivery-orders-rail"
            onHide={() => setFilterRailVisible(false)}
          >
            <FilterRailGroup title={DOR_COPY.railWork}>
              {DO_WORK_QUEUES.map((key) => (
                <FilterRailRow
                  key={key}
                  label={DO_QUEUE_LABEL[key]}
                  count={rails.work[key]}
                  active={filters.queue === key}
                  onClick={() => toggleParam("work", key)}
                  testId={`delivery-orders-work-${key}`}
                />
              ))}
            </FilterRailGroup>
            <FilterRailGroup title={DOR_COPY.railStatus}>
              <FilterRailRow
                label={DOR_COPY.allDocuments}
                count={rails.total}
                active={filters.status === null}
                onClick={() => clearParam("status")}
                testId="delivery-orders-status-all"
              />
              {DO_STATUS_KEYS.map((key) => (
                <FilterRailRow
                  key={key}
                  label={STATUS_LABEL[key]}
                  count={rails.status[key]}
                  active={filters.status === key}
                  onClick={() => toggleParam("status", key)}
                  testId={`delivery-orders-status-${key}`}
                />
              ))}
            </FilterRailGroup>
          </FilterRail>
        ) : null}

        {/* 8px work-surface breathing room — REGISTER STATUS FOOTER law. */}
        <div className="flex min-w-0 min-h-0 flex-1 flex-col p-2" data-testid="register-column">
          {isError ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white">
              <p className="text-body text-base-700">{DOR_COPY.loadFailed}</p>
              {(error as Error | undefined)?.message ? (
                <p className="text-meta text-base-500">{(error as Error).message}</p>
              ) : null}
              <button
                type="button"
                className="rounded-md border border-base-200 bg-white px-3 py-1.5 text-meta font-medium text-base-700 hover:bg-base-50"
                onClick={() => void refetch()}
              >
                {DOR_COPY.tryAgain}
              </button>
            </div>
          ) : (
            <DataGrid<DoRegisterRow>
              appearance="reference"
              rows={rows}
              columns={columns}
              storageKey="carres.deliveryOrders.register.v4"
              rowKey={(r) => r.id}
              exportName="Delivery Orders"
              searchPlaceholder={DOR_COPY.search}
              isLoading={isLoading}
              /* The governed empty state answers all three questions (COPY-
                 STANDARD): what is missing, why, and who does what next. */
              emptyMessage={
                allRows.length === 0 ? DOR_COPY.emptyRegister : DOR_COPY.emptyFiltered
              }
              groupBanner={false}
              stickyIdentity
              chooserGroupOrder={["Document", "Customer", "Delivery", "Dates"]}
              onRowDoubleClick={openDeliveryOrder}
              contextMenu={contextMenu}
              expandTitle="Show delivery order goods"
              expandable={{ renderExpansion: (r) => <DoExpansion row={r} /> }}
              selectable={{
                selectedKeys: selected,
                onToggle: toggleRow,
                onToggleAll: toggleAll,
              }}
              selectionSummary={(n) =>
                n === 1 ? "1 delivery order selected" : `${n} delivery orders selected`
              }
              selectionActions={[
                {
                  /* Document output only — never `Assign logistics` here:
                     initial assignment is Monitor's journey (MASTER §8). */
                  label: (n) => `Print ${n} delivery order${n === 1 ? "" : "s"}`,
                  kind: "output",
                  onClick: (picked) => {
                    void printDeliveryOrders(picked as unknown as DoRegisterRow[]);
                  },
                },
              ]}
              toolbarStart={!filterRailOpen ? showFiltersButton : undefined}
              statusSummary={(filtered) => {
                /* Narrowed-versus-total stays explicit against the WHOLE
                   register (REGISTER STATUS FOOTER law) — a rail pick is a
                   narrowing too. */
                const line = doRegisterFooter(filtered.length, allRows.length);
                return (
                  <span className="block truncate" title={line}>
                    {line}
                  </span>
                );
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
