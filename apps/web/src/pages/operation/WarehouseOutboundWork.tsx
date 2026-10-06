// The dated Warehouse work over outgoing arrangements, as a governed
// Register (unified Inbound/Outbound card, 2026-09-07).
import { blue } from "@radix-ui/colors";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  buildOutboundRegisterView,
  warehouseEmptyDaySentence,
  DELIVERY_PHOTO_MAX_BYTES,
  DELIVERY_PHOTO_MIMES,
  HANDOVER_EVIDENCE_MAX_FILES,
  HANDOVER_EVIDENCE_VIDEO_MAX_BYTES,
  HANDOVER_EVIDENCE_VIDEO_MIMES,
  driverCollectedLine,
  outboundExceptionLines,
  outboundStatusWordOf,
  warehouseAssignedDriverLine,
  warehouseLoadedLine,
  warehouseOutboundCards,
  warehouseRecordLoadedSentence,
  warehouseUnitNotCollectedSentence,
  warehouseUnitPendingReason,
  type DeliveryWarehouseScheduleEvent,
  type WarehouseOutboundCard,
  type WarehousePrepFact,
} from "@carres/shared";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import EvidenceUploadField, {
  type EvidenceEntry,
} from "@/components/EvidenceUploadField";
import {
  useDeliveryWarehouseSchedule,
  useRecordHandoverEvent,
  useRecordOutboundPrep,
} from "@/lib/queries";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { REGISTER_FIELD_WIDTH } from "@/components/register/register-field-widths";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import ModuleHeader from "./components/ModuleHeader";
import { Modal, ModalActions } from "./components/Modal";
import {
  FilterRail,
  FilterRailGroup,
  FilterRailRow,
} from "./components/workspace-rail";
import { FieldError } from "@/components/kit/FieldFrame";

/**
 * WAREHOUSE — OUTBOUND: one row = one dated pickup arrangement (one DO
 * scope), in the same Register grammar as Inbound: Destination Header, one
 * toolbar row, 240px rail, wrap-not-truncate Product and Exceptions columns,
 * explicit clicks only.
 *
 * From the menu the Register lists EVERY unfinished arrangement under its
 * original date; a Monitor card inherits its exact date, Site and DO scope.
 * The rail counts, the listed rows, the footer totals and the export all
 * read one shared filter pipeline — a `Loaded 1` beside an empty day can no
 * longer happen, because both numbers describe the same scope.
 *
 * The three quantities stay three facts, per product and per Unit:
 *
 *   Required           the DO scope
 *   Warehouse loaded   what the identified operator scanned and submitted
 *   Driver confirmed   what the Logistics side itself confirmed receiving
 *
 * Only matching exact-Unit evidence changes `Who has it` (the server's
 * rule). The governed acts — scan, check, pack, record loaded — live inside
 * the expansion, the arrangement's own detail; the row itself acts nowhere.
 */


/** Below Tailwind's `md` the 45px toolbar cannot hold the date controls in
 *  one row — they move into the Filters drawer (the mobile filter surface). */
function useIsNarrow(): boolean {
  const query = "(max-width: 767px)";
  const [narrow, setNarrow] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return narrow;
}

/** A fact that has not happened yet (no ship, no vehicle) stays BLANK —
 *  never a dash and never an absence word. */
function OutboundBlank() {
  return <span aria-hidden="true" />;
}

/** `Done` only when every required Unit is loaded AND driver-confirmed —
 *  loading alone never claims the driver's act (Stock MASTER §7). */
export function outboundLoadingDone(
  c: Pick<WarehouseOutboundCard, "unitsRequired" | "handedOver" | "driverConfirmed">,
): boolean {
  return c.unitsRequired > 0 && c.handedOver >= c.unitsRequired && c.driverConfirmed >= c.unitsRequired;
}

const STATUSES = [
  ["open", "Awaiting loading or driver confirmation"],
  ["not-loaded", "Not loaded yet"],
  ["awaiting-driver", "Awaiting driver confirmation"],
  ["loaded", "Loaded"],
  ["no-evidence", "Evidence not submitted"],
  ["all", "All pickups"],
] as const;

export default function WarehouseOutboundWork() {
  const [params, setParams] = useSearchParams();
  const today = appTodayIso();
  const selectedDo = params.get("do");
  const workId = params.get("loading");
  /* Menu default = every unfinished arrangement; an exact Monitor deep link
     must show its arrangement even when the work is already done. */
  const effectiveView = params.get("view") ?? (selectedDo ? "all" : "open");

  const { data, isLoading, error, refetch } = useDeliveryWarehouseSchedule();
  const allCards = useMemo(
    () =>
      warehouseOutboundCards(
        (data?.events ?? []) as DeliveryWarehouseScheduleEvent[],
      ),
    [data],
  );
  const view = useMemo(() => {
    const p = new URLSearchParams(params);
    p.set("view", effectiveView);
    return buildOutboundRegisterView(allCards, p);
  }, [allCards, params, effectiveView]);
  const siteNames = useMemo(
    () =>
      [...new Set(allCards.map((c) => c.fromLocation))]
        .filter((s) => s && s !== "Not recorded")
        .sort(),
    [allCards],
  );

  const [showFilters, setShowFilters] = useState(false);
  const [railHidden, setRailHidden] = useState(false);
  const isNarrow = useIsNarrow();
  const root = useRef<HTMLDivElement>(null);
  const listParams = new URLSearchParams(params);
  listParams.delete("loading");
  const scrollKey = `outbound-scroll:${listParams.toString()}`;
  useEffect(() => {
    if (isLoading || workId) return;
    const scroll =
      root.current?.querySelector<HTMLElement>('[data-testid="grid-scroll"]');
    if (scroll)
      scroll.scrollTop = Number(sessionStorage.getItem(scrollKey) ?? 0);
  }, [isLoading, scrollKey, workId]);

  const setFilter = useCallback(
    (key: string, value: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const onSearch = useCallback(
    (value: string) => setFilter("q", value),
    [setFilter],
  );
  const workKey = (c: WarehouseOutboundCard) => `${c.deliveryOrderId ?? c.doNumber}:${c.warehouseSiteId ?? c.fromLocation}`;
  const workCard = allCards.find((c) => workKey(c) === workId);

  /**
   * THE OUTBOUND REGISTER — owner ruling 2026-09-25 (Stock MASTER §7).
   *
   * One row is one DO + Site scope, 40px, ONE FACT PER CELL, in the owner's
   * order:
   *
   *   Scheduled handover · Ship Date · DO No · SO No · Pickup By ·
   *   Delivery Location · Item · Required · Loaded · Driver confirmed · Loading
   *
   * `Scheduled handover` is Delivery's planned pickup day; `Ship Date` is the
   * day the Warehouse recorded the goods loaded (blank until then). `Pickup
   * By` is the company whose driver comes; `Delivery Location` is the customer
   * address or the next Site. `Required · Loaded · Driver confirmed` are three
   * columns, never one number. `Loading` prints `Done` once every required
   * Unit is loaded AND driver-confirmed. The 2026-09-07 composite cells
   * (`Document` · `Units`) are retired as design; `From` · `Assigned Driver` ·
   * `Status` · `Exceptions` · `SO date` · `Vehicle` · `Loaded at` · `Driver
   * collected at` stay one click away in Columns.
   */
  const columns = useMemo<DataGridColumn<WarehouseOutboundCard>[]>(
    () => [
      {
        key: "date",
        label: "Scheduled handover",
        headerLines: ["Scheduled", "handover"] as const,
        width: REGISTER_FIELD_WIDTH.date,
        sortable: true,
        filterType: "date",
        chooserGroup: "Dates",
        dateValue: (c) => c.eventDate,
        searchValue: (c) => c.eventDate,
        exportValue: (c) =>
          `${c.eventDate}${c.expectedCollectionWindow ? ` · Driver pickup ${c.expectedCollectionWindow}` : " · Time not provided"}`,
        /* The approved second line (COPY: `Driver pickup {time}` or exactly
           `Time not provided`) — 11px slate-11 under the 13px date, inside
           the one 40px row. */
        accessor: (c) => (
          <span className="block leading-[18px]" data-testid={`wo-date-${c.doNumber}`}>
            <span className="block">{fmtDate(c.eventDate)}</span>
            <span className="block text-label font-normal leading-[14px] text-kit-slate-11">
              {c.expectedCollectionWindow
                ? `Driver pickup ${c.expectedCollectionWindow}`
                : "Time not provided"}
            </span>
          </span>
        ),
      },
      {
        key: "shipDate",
        label: "Ship Date",
        width: REGISTER_FIELD_WIDTH.date,
        sortable: true,
        filterType: "date",
        chooserGroup: "Dates",
        dateValue: (c) => c.actualHandoverAt?.slice(0, 10) ?? null,
        searchValue: (c) => c.actualHandoverAt?.slice(0, 10) ?? "",
        exportValue: (c) => c.actualHandoverAt?.slice(0, 10) ?? "",
        accessor: (c) =>
          c.actualHandoverAt ? (
            <span data-testid={`wo-ship-date-${c.doNumber}`}>{fmtDate(c.actualHandoverAt)}</span>
          ) : (
            <OutboundBlank />
          ),
      },
      {
        key: "document",
        label: "DO No",
        width: REGISTER_FIELD_WIDTH.documentNo,
        sortable: true,
        chooserGroup: "Documents",
        searchValue: (c) => `DO No ${c.doNumber}`,
        exportValue: (c) => c.doNumber,
        accessor: (c) => (
          <Link
            className="font-mono text-kit-blue-11 hover:underline"
            onClick={(e) => e.stopPropagation()}
            to={c.deliveryOrderHref}
            data-testid={`outbound-document-${c.doNumber}`}
          >
            {c.doNumber}
          </Link>
        ),
      },
      {
        key: "so",
        label: "SO No",
        width: REGISTER_FIELD_WIDTH.soNo,
        sortable: true,
        chooserGroup: "Documents",
        searchValue: (c) => c.source,
        exportValue: (c) => c.source,
        accessor: (c) => (
          <Link
            className="font-mono text-kit-blue-11 hover:underline"
            onClick={(e) => e.stopPropagation()}
            to={c.sourceHref}
            data-testid={`wo-so-${c.doNumber}`}
          >
            {c.source}
          </Link>
        ),
      },
      {
        key: "partner",
        label: "Pickup By",
        width: REGISTER_FIELD_WIDTH.partyName,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Movement",
        searchValue: (c) => c.logisticsPartner,
        filterValue: (c) => c.logisticsPartner,
        exportValue: (c) => c.logisticsPartner,
        accessor: (c) => <span className="block truncate" title={c.logisticsPartner} data-testid={`wo-pickup-by-${c.doNumber}`}>{c.logisticsPartner}</span>,
      },
      {
        key: "to",
        label: "Delivery Location",
        headerLines: ["Delivery", "Location"] as const,
        width: REGISTER_FIELD_WIDTH.address,
        sortable: true,
        chooserGroup: "Movement",
        searchValue: (c) => c.toCustomer,
        exportValue: (c) => c.toCustomer,
        accessor: (c) => <span className="block truncate" title={c.toCustomer} data-testid={`wo-delivery-location-${c.doNumber}`}>{c.toCustomer}</span>,
      },
      {
        key: "products",
        label: "Item",
        width: REGISTER_FIELD_WIDTH.items,
        sortable: true,
        chooserGroup: "Goods",
        searchValue: (c) =>
          c.products
            .map((x) => `${x.name ?? ""} ${x.sku ?? ""}`)
            .concat(c.units.map((u) => u.unitId))
            .join(" "),
        exportValue: (c) =>
          c.products.map((x) => `${x.name ?? x.sku ?? "Product not recorded"} × ${x.qty}`).join(" · "),
        accessor: (c) => {
          if (c.products.length === 0) return <span data-testid={`wo-item-${c.doNumber}`}>Products not recorded</span>;
          /* Several goods print `{n} items` and keep the expansion; one good
             prints its name with the SKU on the approved 11px second line. */
          if (c.products.length > 1)
            return <span data-testid={`wo-item-${c.doNumber}`}>{c.products.length} items</span>;
          const x = c.products[0]!;
          return (
            <span className="block leading-[18px]" data-testid={`wo-item-${c.doNumber}`}>
              <span className="block">{x.name ?? x.sku ?? "Product not recorded"}</span>
              {x.name && x.sku ? (
                <span className="block text-label font-normal leading-[14px] text-kit-slate-11">{x.sku}</span>
              ) : null}
            </span>
          );
        },
      },
      ...(
        [
          ["required", "Required", "unitsRequired", ["Required", ""]],
          ["loaded", "Loaded", "handedOver", ["Loaded", ""]],
          ["driverConfirmed", "Driver confirmed", "driverConfirmed", ["Driver", "confirmed"]],
        ] as const
      ).map(([key, label, field, lines]) => ({
        key,
        label,
        headerLines: lines[1] ? (lines as readonly [string, string]) : undefined,
        width: REGISTER_FIELD_WIDTH.smallCount,
        align: "right" as const,
        sortable: true,
        filterType: "number" as const,
        chooserGroup: "Goods",
        numberValue: (c: WarehouseOutboundCard) => c[field],
        searchValue: (c: WarehouseOutboundCard) => String(c[field]),
        exportValue: (c: WarehouseOutboundCard) => c[field],
        accessor: (c: WarehouseOutboundCard) => (
          <span className="tabular-nums" data-testid={`wo-count-${key}-${c.doNumber}`}>{c[field]}</span>
        ),
      })),
      {
        key: "loading",
        label: "Loading",
        width: REGISTER_FIELD_WIDTH.shortFact,
        sortable: false,
        filterable: false,
        exportLabel: "Loading",
        exportValue: (c) => (outboundLoadingDone(c) ? "Done" : ""),
        /* `Done` only once every required Unit is loaded AND driver-confirmed;
           loading alone never claims the driver's act. */
        accessor: (c) =>
          outboundLoadingDone(c) ? (
            <span data-testid={`wo-loading-done-${c.doNumber}`}>Done</span>
          ) : (
            <button
              type="button"
              className="inline-flex h-7 items-center rounded-control border border-kit-slate-5 bg-white px-2 text-meta text-kit-blue-11 hover:bg-hovertint"
              data-testid={`wo-open-loading-${c.doNumber}`}
              onClick={() => setFilter("loading", workKey(c))}
            >
              Loading
            </button>
          ),
      },
      /* ── One click away in Columns ────────────────────────────────────── */
      {
        key: "from",
        defaultHidden: true,
        label: "From",
        width: REGISTER_FIELD_WIDTH.placeWord,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Movement",
        searchValue: (c) => c.fromLocation,
        filterValue: (c) => c.fromLocation,
        exportValue: (c) => c.fromLocation,
        accessor: (c) => c.fromLocation,
      },
      {
        key: "driver",
        defaultHidden: true,
        label: "Assigned Driver",
        width: REGISTER_FIELD_WIDTH.partyName,
        sortable: true,
        chooserGroup: "Movement",
        searchValue: (c) => c.driverName ?? "",
        exportValue: (c) => warehouseAssignedDriverLine(c.logisticsPartner, c.driverName),
        overflowText: (c) => warehouseAssignedDriverLine(c.logisticsPartner, c.driverName),
        accessor: (c) => (
          <span data-testid={`wo-driver-${c.doNumber}`}>
            {warehouseAssignedDriverLine(c.logisticsPartner, c.driverName)}
          </span>
        ),
      },
      {
        key: "status",
        defaultHidden: true,
        label: "Status",
        width: REGISTER_FIELD_WIDTH.status,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Goods",
        searchValue: (c) => outboundStatusWordOf(c),
        filterValue: (c) => outboundStatusWordOf(c),
        exportValue: (c) => outboundStatusWordOf(c),
        accessor: (c) => outboundStatusWordOf(c),
      },
      {
        key: "exceptions",
        defaultHidden: true,
        label: "Exceptions",
        width: REGISTER_FIELD_WIDTH.address,
        chooserGroup: "Goods",
        searchValue: (c) => outboundExceptionLines(c, today, fmtDate).join(" "),
        exportValue: (c) => outboundExceptionLines(c, today, fmtDate).join(" · "),
        overflowText: (c) => outboundExceptionLines(c, today, fmtDate).join(" · "),
        accessor: (c) => {
          const lines = outboundExceptionLines(c, today, fmtDate);
          return lines.length === 0 ? <OutboundBlank /> : <span>{lines.join(" · ")}</span>;
        },
      },
      {
        key: "soDate",
        label: "SO date",
        defaultHidden: true,
        width: REGISTER_FIELD_WIDTH.date,
        sortable: true,
        filterType: "date",
        chooserGroup: "Dates",
        dateValue: (c) => c.soDate,
        exportValue: (c) => c.soDate ?? "",
        accessor: (c) => (c.soDate ? fmtDate(c.soDate) : <OutboundBlank />),
      },
      {
        key: "vehicle",
        label: "Vehicle",
        defaultHidden: true,
        width: REGISTER_FIELD_WIDTH.shortFact,
        sortable: true,
        chooserGroup: "Movement",
        searchValue: (c) => c.vehicle ?? "",
        exportValue: (c) => c.vehicle ?? "",
        accessor: (c) => c.vehicle ?? <OutboundBlank />,
      },
      {
        key: "loadedAt",
        label: "Loaded at",
        defaultHidden: true,
        width: REGISTER_FIELD_WIDTH.goodsReceivedDate,
        sortable: true,
        filterType: "date",
        chooserGroup: "Dates",
        dateValue: (c) => c.actualHandoverAt?.slice(0, 10) ?? null,
        exportValue: (c) => c.actualHandoverAt ?? "",
        accessor: (c) =>
          c.actualHandoverAt ? fmtDate(c.actualHandoverAt, { time: true }) : <OutboundBlank />,
      },
      {
        key: "collectedAt",
        label: "Driver collected at",
        defaultHidden: true,
        width: REGISTER_FIELD_WIDTH.goodsReceivedDate,
        sortable: true,
        filterType: "date",
        chooserGroup: "Dates",
        dateValue: (c) => c.actualCollectionAt?.slice(0, 10) ?? null,
        exportValue: (c) => c.actualCollectionAt ?? "",
        accessor: (c) =>
          c.actualCollectionAt
            ? fmtDate(c.actualCollectionAt, { time: true })
            : <OutboundBlank />,
      },
    ],
    [today, setFilter],
  );

  const context = params.get("date") || params.get("from");
  /* One exact date keeps the governed empty sentence; a range or other
     filters say what they are. */
  const exactDate =
    params.get("date") ||
    (params.get("from") &&
    (!params.get("to") || params.get("to") === params.get("from"))
      ? params.get("from")
      : null);
  const empty = exactDate && !params.get("q") && !selectedDo
    ? warehouseEmptyDaySentence(fmtDate(exactDate))
    : effectiveView === "open" && !context && !params.get("q") && !selectedDo
      ? "No pickups awaiting loading or driver confirmation match these filters."
      : "No pickups match these filters.";

  const dateControls = (
    <>
      <label className="text-meta">
        Pickup date from{" "}
        <input
          className="h-7 rounded-control border border-kit-slate-5 px-2"
          type="date"
          aria-label="Handover from"
          value={params.get("date") || params.get("from") || ""}
          onChange={(e) => {
            setParams(
              (prev) => {
                const p = new URLSearchParams(prev);
                p.delete("date");
                if (e.target.value) p.set("from", e.target.value);
                else p.delete("from");
                return p;
              },
              { replace: true },
            );
          }}
        />
      </label>
      <label className="text-meta">
        To{" "}
        <input
          className="h-7 rounded-control border border-kit-slate-5 px-2"
          type="date"
          aria-label="Handover to"
          min={params.get("date") || params.get("from") || undefined}
          value={params.get("to") || ""}
          onChange={(e) => setFilter("to", e.target.value)}
        />
      </label>
      <button
        className="h-7 px-2 text-body text-kit-blue-11"
        onClick={() =>
          setParams({ tab: "warehouse-outbound" }, { replace: true })
        }
      >
        Clear filters
      </button>
    </>
  );
  return (
    <div
      ref={root}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-testid="warehouse-outbound"
      onScrollCapture={(e) => {
        const el = e.target as HTMLElement;
        if (el.getAttribute("data-testid") === "grid-scroll")
          sessionStorage.setItem(scrollKey, String(el.scrollTop));
      }}
    >
      <ModuleHeader
        testId="warehouse-outbound-header"
        word="Outbound"
        docTitle="Outbound · Warehouse · Carres"
        destinationHeader
      />
      {workId && <div className="flex min-h-0 flex-1 flex-col overflow-auto" data-testid="outbound-loading-workspace">
        <div className="flex flex-wrap items-center gap-3 border-b border-kit-slate-5 bg-white p-3">
          <button type="button" className="text-body text-kit-blue-11" onClick={() => setFilter("loading", "")}>← Back to Outbound</button>
          {workCard && <span className="font-mono text-body">{workCard.doNumber}</span>}
        </div>
        {isLoading ? <p role="status" className="p-3">Loading…</p> : error ? <div role="alert" className="p-3">{error.message}<button onClick={() => void refetch()}>Try again</button></div> : workCard ? <OutboundUnitWork card={workCard} /> : <p role="alert" className="p-3">This pickup could not be opened.</p>}
      </div>}
      <div className={`flex min-h-0 min-w-0 flex-1 ${workId ? "hidden" : ""}`}>
        <div
          className={`${showFilters ? "flex" : "hidden"} min-h-0 shrink-0 ${railHidden ? "md:hidden" : "md:flex"}`}
        >
          <FilterRail
            testId="wo-rail"
            onHide={() => {
              setRailHidden(true);
              setShowFilters(false);
            }}
          >
            {isNarrow && (
              <div className="flex flex-wrap items-center gap-2">
                {dateControls}
              </div>
            )}
            <FilterRailGroup title="Pickup status" icon="waiting">
              {STATUSES.map(([value, label]) => (
                <FilterRailRow
                  key={value}
                  label={label}
                  active={effectiveView === value}
                  resets={value === "all"}
                  count={
                    isLoading || error ? undefined : view.facets.view[value] ?? 0
                  }
                  testId={`wo-view-${value}`}
                  onClick={() => {
                    setFilter("view", value);
                    setShowFilters(false);
                  }}
                />
              ))}
            </FilterRailGroup>
            {siteNames.length > 1 && (
              <FilterRailGroup title="Site" icon="warehouse">
                {siteNames.map((name) => (
                  <FilterRailRow
                    key={name}
                    label={name}
                    active={params.get("site") === name}
                    count={
                      isLoading || error
                        ? undefined
                        : view.facets.site[name] ?? 0
                    }
                    testId={`wo-site-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    onClick={() => {
                      setFilter(
                        "site",
                        params.get("site") === name ? "" : name,
                      );
                      setShowFilters(false);
                    }}
                  />
                ))}
              </FilterRailGroup>
            )}
          </FilterRail>
        </div>
        <div
          className={`${showFilters ? "hidden md:flex" : "flex"} min-h-0 min-w-0 flex-1 flex-col p-2`}
        >
          {error ? (
            <div
              role="alert"
              className="flex flex-1 flex-col items-center justify-center gap-3 bg-white"
            >
              <p>Outbound could not be opened</p>
              <p>{error.message}</p>
              <button
                className="rounded-control border border-base-200 px-3 py-1.5 text-body"
                onClick={() => void refetch()}
              >
                Try again
              </button>
            </div>
          ) : (
            <DataGrid<WarehouseOutboundCard>
              stickyIdentity={{ columnKey: "document" }}
              key={`${params.get("q") === null ? "clear" : "search"}:${selectedDo ?? ""}:${selectedDo ? view.rows.map((c) => c.warehouseSiteId ?? c.fromLocation).join(",") : ""}`}
              appearance="reference"
              wrapToolbar
              rows={view.rows}
              columns={columns}
              rowKey={(c) => `${c.deliveryOrderId ?? c.doNumber}:${c.warehouseSiteId ?? c.fromLocation}`}
              rowTestId={(c) => `wo-row-${c.doNumber}`}
              storageKey="carres.outbound.register.v3"
              rowHeight={40}
              chooserGroupOrder={["Dates", "Documents", "Movement", "Goods"]}
              exportName="Outbound"
              searchPlaceholder="DO, SO, product, customer, driver or Unit ID…"
              initialSearch={params.get("q") ?? ""}
              onSearchChange={onSearch}
              isLoading={isLoading || !data}
              groupBanner={false}
              emptyMessage={empty}
              rowStyle={(c) =>
                selectedDo === c.doNumber
                  ? { background: blue.blue3 }
                  : undefined
              }
              toolbarStart={
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded border border-kit-slate-5 bg-white px-2 text-meta text-base-600 hover:bg-hovertint md:hidden"
                    onClick={() => setShowFilters((v) => !v)}
                    data-testid="wo-toggle-filters"
                  >
                    <PanelLeftOpen size={14} /> Filters
                  </button>
                  {railHidden && (
                    <button
                      type="button"
                      className="hidden h-7 items-center gap-1 rounded border border-kit-slate-5 bg-white px-2 text-meta text-base-600 hover:bg-hovertint md:inline-flex"
                      onClick={() => setRailHidden(false)}
                      data-testid="wo-show-filters"
                    >
                      <PanelLeftClose size={14} /> Show filters
                    </button>
                  )}
                  <Link
                    to={`/operation?${(() => {
                      const back = new URLSearchParams(params);
                      /* Outbound IS pickup work, so it returns to the Pickup
                         Schedule — carrying `date` and `site` untouched, which
                         is what puts the operator back on the column they
                         opened this from. */
                      back.set("tab", "warehouse-pickup-schedule");
                      back.delete("do");
                      back.delete("view");
                      back.delete("q");
                      return back.toString();
                    })()}`}
                    className="text-meta text-base-600 underline-offset-2 hover:underline"
                    data-testid="wo-back-monitor"
                  >
                    ← Pickup Schedule
                  </Link>
                  {!isNarrow && dateControls}
                  {selectedDo && (
                    <span className="text-meta" data-testid="wo-do-context">
                      Document: {selectedDo}
                    </span>
                  )}
                </div>
              }
              expandTitle="Show every product and Unit"
              expandable={{
                trigger: { columnKey: "products" },
                testId: (c) => `wo-row-toggle-${c.doNumber}`,
                renderExpansion: (c) => <div className="space-y-2 p-3 text-body" data-testid={`wo-product-detail-${c.doNumber}`}>
                  {c.products.map((p) => <div key={p.sku ?? "no-sku"}>{p.name ?? p.sku} · {p.sku} · Qty {p.qty}</div>)}
                  {c.units.map((u) => <div key={u.unitId}><Link className="font-mono text-kit-blue-11" to={`/operation/stock/unit/${encodeURIComponent(u.unitId)}`}>{u.unitId}</Link> · {u.productName ?? u.sku}</div>)}
                  {/* The reason prints where the row's details live (UI §6.8):
                      each difference names its exact Unit or fact. */}
                  {outboundExceptionLines(c, today, fmtDate).map((line) => <div key={line} className="text-meta text-kit-slate-11" data-testid={`wo-exception-${c.doNumber}`}>{line}</div>)}
                </div>,
              }}
              statusSummary={(visible) => {
                const cards = visible as WarehouseOutboundCard[];
                const required = cards.reduce((n, c) => n + c.unitsRequired, 0);
                const loaded = cards.reduce((n, c) => n + c.handedOver, 0);
                const confirmed = cards.reduce(
                  (n, c) => n + c.driverConfirmed,
                  0,
                );
                return (
                  <span data-testid="wo-range-summary">
                    {cards.length} pickup arrangement
                    {cards.length === 1 ? "" : "s"} · Units: Required {required}{" "}
                    · Loaded {loaded} · Driver confirmed {confirmed}
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

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-label font-semibold text-kit-slate-11">{label}</div>
      <div className="truncate text-base-800">{value}</div>
    </div>
  );
}

/** The exact Units of one DO scope, and the governed acts on them. */
export function OutboundUnitWork({ card }: { card: WarehouseOutboundCard }) {
  const doId = card.deliveryOrderId ?? "";
  const prep = useRecordOutboundPrep(doId);
  const [scanValue, setScanValue] = useState("");
  const [prepError, setPrepError] = useState<string | null>(null);
  const [loadOpen, setLoadOpen] = useState(false);

  const remaining = card.units.filter((u) => !u.unitHandedOverAt);
  const scannedNotChecked = remaining.filter((u) => u.unitScannedAt && !u.unitCheckedAt);
  const checkedNotPacked = remaining.filter((u) => u.unitCheckedAt && !u.unitPackedAt);
  const readyUnits = remaining.filter(
    (u) => u.unitScannedAt && u.unitCheckedAt && u.unitPackedAt,
  );
  const receiverWord =
    (card.driverName ?? "").trim() || card.logisticsPartner;
  /* The DO-level collection is confirmed while an exact Unit was never
     loaded: that Unit did NOT travel — say so per Unit, never generically. */
  const notCollected =
    card.actualCollectionAt !== null
      ? remaining.map((u) =>
          warehouseUnitNotCollectedSentence(u.unitId, receiverWord, card.fromLocation),
        )
      : [];

  function recordPrep(fact: WarehousePrepFact, unitCodes: string[], done: string) {
    if (!doId) {
      setPrepError("This delivery order cannot be addressed. Reload the page.");
      return;
    }
    setPrepError(null);
    prep.mutate(
      { fact, unitCodes },
      {
      onSuccess: () => { toast.success(done); if (fact === "scanned") setScanValue(""); },
        onError: (e) => setPrepError(e.message),
      },
    );
  }

  function scanUnit() {
    if (prep.isPending) return;
    const code = scanValue.trim();
    if (!code) return;
    const match = card.units.find(
      (u) => u.unitId.toLowerCase() === code.toLowerCase(),
    );
    if (!match) {
      setPrepError(`${code} is not a Unit this delivery order requires. Check the label and scan the required Unit.`);
      return;
    }
    if (match.unitHandedOverAt) {
      setPrepError(`${match.unitId} was already loaded. Scan a Unit still to load.`);
      return;
    }
    recordPrep("scanned", [match.unitId], `${match.unitId} scanned`);
  }

  const operator =
    card.units
      .filter((u) => u.unitHandedOverAt)
      .map((u) => u.unitWarehouseOperator)
      .find(Boolean) ?? null;
  return (
    <div className="border-t border-kit-slate-5 px-3 py-2" data-testid={`wo-units-${card.doNumber}`}>
      <div className="mb-1 text-label font-semibold uppercase tracking-wide text-base-600">
        Goods scheduled for pickup
      </div>
      {/* The two evidence records, never merged (§8): the Warehouse's own
          submission and the driver's independent confirmation. */}
      <div className="mb-2 space-y-0.5 text-meta text-base-600">
        <p>{card.fromLocation} → {card.toCustomer} · {card.logisticsPartner}</p>
        <p data-testid={`wo-driver-${card.doNumber}`}>{warehouseAssignedDriverLine(card.logisticsPartner, card.driverName)}</p>
        <p>Scheduled handover {fmtDate(card.eventDate)}</p>
        <Link className="font-mono text-kit-blue-11 hover:underline" to={card.deliveryOrderHref}>{card.doNumber}</Link>
        <p data-testid={`wo-loaded-${card.doNumber}`}>
          {warehouseLoadedLine(card)}
          {operator ? ` · recorded by ${operator}` : ""}
          {card.handedOver > 0
            ? card.evidenceNotSubmitted
              ? " · evidence not submitted"
              : " · evidence submitted"
            : ""}
        </p>
        <p data-testid={`wo-collected-${card.doNumber}`}>
          {/* A per-Unit confirmation IS a confirmation — the sentence may
              never say `not confirmed yet` beside a confirmed count. */}
          {card.driverConfirmed > 0
            ? `${(card.driverName ?? "").trim() || card.logisticsPartner} confirmed ${card.driverConfirmed} of ${card.unitsRequired} Units`
            : driverCollectedLine(card)}
        </p>
        {card.vehicle && <p>Vehicle {card.vehicle}</p>}
      </div>
      {remaining.length === 0 && card.units.length > 0 && (
        <div className="mb-2 text-body text-base-700" data-testid="wo-loading-next-step">
          <p>{card.driverConfirmed < card.unitsRequired
            ? "Loading recorded. Awaiting driver confirmation."
            : "Loading and driver confirmation recorded."}</p>
          {card.evidenceNotSubmitted && <p>Loading evidence is still missing.</p>}
          <Link className="text-kit-blue-11 hover:underline" to={card.deliveryOrderHref}>
            Open Delivery Order
          </Link>
        </div>
      )}
      {remaining.length > 0 && <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-meta text-base-600">
          Scan Unit ID
          <input
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                scanUnit();
              }
            }}
            className="h-7 w-44 rounded border border-kit-slate-5 px-2 font-mono text-[13px]"
            placeholder="U1-000-001"
            data-testid="wo-scan-input"
          />
        </label>
        <button
          type="button"
          className="btn-primary h-7 px-2.5 text-meta"
          onClick={scanUnit}
          disabled={prep.isPending || !scanValue.trim()}
          data-testid="wo-scan-btn"
        >
          Scan
        </button>
        {scannedNotChecked.length > 0 && (
          <button
            type="button"
            className="btn-primary h-7 px-2.5 text-meta"
            onClick={() =>
              recordPrep(
                "checked",
                scannedNotChecked.map((u) => u.unitId),
                `${scannedNotChecked.length} Unit(s) checked`,
              )
            }
            disabled={prep.isPending}
            data-testid="wo-check-btn"
          >
            Record check ({scannedNotChecked.length})
          </button>
        )}
        {checkedNotPacked.length > 0 && (
          <button
            type="button"
            className="btn-primary h-7 px-2.5 text-meta"
            onClick={() =>
              recordPrep(
                "packed",
                checkedNotPacked.map((u) => u.unitId),
                `${checkedNotPacked.length} Unit(s) packed`,
              )
            }
            disabled={prep.isPending}
            data-testid="wo-pack-btn"
          >
            Record pack ({checkedNotPacked.length})
          </button>
        )}
        {readyUnits.length > 0 && (
          <button
            type="button"
            className="btn-hero h-7 px-3 text-meta"
            onClick={() => setLoadOpen(true)}
            data-testid="wo-record-loaded"
          >
            {warehouseRecordLoadedSentence(readyUnits.length, receiverWord)}
          </button>
        )}
      </div>}
      {prepError && <div className="mb-2"><FieldError>{prepError}</FieldError></div>}
      {readyUnits.length > 0 && (
        <p className="mb-2 text-label text-base-500" data-testid="wo-receiver-consequence">
          Recording the load moves the accepted Units to {card.logisticsPartner}. Name the person
          who actually receives them and attach proof.
        </p>
      )}
      {notCollected.length > 0 && (
        <div className="mb-2 space-y-0.5" data-testid="wo-not-collected">
          {notCollected.map((line) => (
            <p key={line} className="text-label text-base-600">
              {line}
            </p>
          ))}
        </div>
      )}
      <div className="overflow-x-auto"><table className="w-full border-collapse text-body">
        <thead>
          <tr className="text-left text-label font-semibold text-kit-slate-11">
            <th className="py-1 pr-3 font-medium">Unit ID</th>
            <th className="py-1 pr-3 font-medium">Product</th>
            <th className="py-1 pr-3 font-medium">Scanned / Checked / Packed</th>
            <th className="py-1 pr-3 font-medium">Loaded / Driver confirmed</th>
            <th className="py-1 font-medium">Still to do</th>
          </tr>
        </thead>
        <tbody>
          {card.units.map((u) => (
            <UnitRow key={u.unitId} unit={u} />
          ))}
        </tbody>
      </table></div>
      {loadOpen && card.deliveryOrderId && (
        <RecordLoadedModal
          card={card}
          readyUnits={readyUnits}
          onClose={() => setLoadOpen(false)}
        />
      )}
    </div>
  );
}

function UnitRow({ unit }: { unit: DeliveryWarehouseScheduleEvent }) {
  const reason = warehouseUnitPendingReason(unit);
  const at = (iso: string | null) => (iso ? fmtDate(iso, { time: true }) : "");
  return (
    <tr className="border-t border-kit-slate-5" data-testid={`wo-unit-${unit.unitId}`}>
      <td className="py-1.5 pr-3 font-mono text-base-800">{unit.unitId}</td>
      <td className="py-1.5 pr-3" title={unit.productName ?? unit.sku ?? undefined}>
        {unit.productName ?? unit.sku ?? ""}
        <div className="text-meta text-base-600">{unit.sku} · Reserved for {unit.source}</div>
      </td>
      <td className="py-1.5 pr-3 text-base-600"><div>Scanned {at(unit.unitScannedAt)}</div><div>Checked {at(unit.unitCheckedAt)}</div><div>Packed {at(unit.unitPackedAt)}</div></td>
      <td className="py-1.5 pr-3 text-base-600">
        <div>Loaded {" "}
        {unit.unitHandedOverAt
          ? `${at(unit.unitHandedOverAt)}${unit.unitDeliveryPerson ? ` · ${unit.unitDeliveryPerson}` : ""}`
          : ""}</div>
        <div data-testid={`wo-unit-confirmed-${unit.unitId}`}>Driver confirmed {at(unit.unitDriverConfirmedAt)}</div>
      </td>
      <td className="py-1.5 text-base-600" data-testid={`wo-unit-reason-${unit.unitId}`}>
        {reason ?? (unit.unitDriverConfirmedAt ? "Loaded · Driver confirmed" : "Loaded · Awaiting driver confirmation")}
      </td>
    </tr>
  );
}

/** The evidence-backed loading record: pick the packed Units this batch
 *  physically moves, name the ACTUAL receiver, attach proof. A partial batch
 *  changes only the accepted Units — the server enforces every rule again. */
function RecordLoadedModal({
  card,
  readyUnits,
  onClose,
}: {
  card: WarehouseOutboundCard;
  readyUnits: DeliveryWarehouseScheduleEvent[];
  onClose: () => void;
}) {
  const doId = card.deliveryOrderId as string;
  const record = useRecordHandoverEvent(doId);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(readyUnits.map((u) => u.unitId)),
  );
  const [receiver, setReceiver] = useState("");
  const [vehicle, setVehicle] = useState("");
  /* Outbound proof is photo or video — never a PDF (the field is generic since 0587). */
  const [evidence, setEvidence] = useState<Array<EvidenceEntry & { kind: "photo" | "video" }>>([]);

  /* The server names every object key; the field only carries the file. */
  const signEvidence = useCallback(
    (file: File) =>
      apiFetch<{ token: string; path: string }>(
        `/api/operation/delivery-orders/${encodeURIComponent(doId)}/handover-proof/sign-upload`,
        {
          method: "POST",
          body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
        },
      ),
    [doId],
  );

  const canSubmit =
    picked.size > 0 &&
    receiver.trim().length > 0 &&
    evidence.length > 0 &&
    !record.isPending;
  const primaryLabel = warehouseRecordLoadedSentence(
    picked.size,
    receiver.trim() || (card.driverName ?? "").trim() || card.logisticsPartner,
  );

  return (
    <Modal title={`Record Units loaded: ${card.doNumber}`} onClose={onClose}>
      <div className="space-y-3 text-[13px]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
          <Field label="Logistics Partner" value={card.logisticsPartner} />
          <Field
            label="Assigned Driver"
            value={warehouseAssignedDriverLine(card.logisticsPartner, card.driverName)}
          />
        </div>
        <div>
          <div className="mb-1 text-label uppercase tracking-wide text-base-500">
            Units in this load
          </div>
          {readyUnits.map((u) => (
            <label key={u.unitId} className="flex items-center gap-2 py-0.5">
              <input
                type="checkbox"
                checked={picked.has(u.unitId)}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(u.unitId);
                  else next.delete(u.unitId);
                  setPicked(next);
                }}
                data-testid={`wo-pick-${u.unitId}`}
              />
              <span className="font-mono">{u.unitId}</span>
              <span className="truncate text-base-500">{u.productName ?? u.sku ?? ""}</span>
            </label>
          ))}
          <p className="mt-1 text-label text-base-500">
            Units left out keep their current holder and stay under {fmtDate(card.eventDate)}.
          </p>
        </div>
        <label className="block">
          <span className="text-label uppercase tracking-wide text-base-500">
            Loaded to ({card.logisticsPartner})
          </span>
          <input
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            className="mt-0.5 h-8 w-full rounded border border-kit-slate-5 px-2"
            placeholder="The person who actually received the goods"
            data-testid="wo-receiver"
          />
        </label>
        <label className="block">
          <span className="text-label uppercase tracking-wide text-base-500">
            Vehicle (when known)
          </span>
          <input
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            className="mt-0.5 h-8 w-full rounded border border-kit-slate-5 px-2"
            data-testid="wo-vehicle"
          />
        </label>
        <div>
          <span className="text-label uppercase tracking-wide text-base-500">
            Proof: photos and videos of the loaded goods
          </span>
          <div className="mt-0.5" data-testid="wo-proof">
            <EvidenceUploadField
              entries={evidence}
              onChange={setEvidence}
              sign={signEvidence}
              bucket="proof-of-delivery"
              imageMimes={DELIVERY_PHOTO_MIMES}
              videoMimes={HANDOVER_EVIDENCE_VIDEO_MIMES}
              imageMaxBytes={DELIVERY_PHOTO_MAX_BYTES}
              videoMaxBytes={HANDOVER_EVIDENCE_VIDEO_MAX_BYTES}
              maxFiles={HANDOVER_EVIDENCE_MAX_FILES}
              ariaLabel="Loading evidence"
              testId="wo-evidence"
            />
          </div>
        </div>
      </div>
      <ModalActions
        onCancel={onClose}
        primary={primaryLabel}
        primaryDisabled={!canSubmit}
        primaryPending={record.isPending}
        onPrimary={() =>
          record.mutate(
            {
              kind: "handed_over",
              receiverName: receiver.trim(),
              vehicle: vehicle.trim() || undefined,
              evidence,
              unitCodes: [...picked],
            },
            {
              onSuccess: () => {
                toast.success(
                  `Loaded ${picked.size} of ${card.unitsRequired} Units to ${receiver.trim()}`,
                );
                onClose();
              },
              onError: (e) => toast.error(e.message),
            },
          )
        }
      />
    </Modal>
  );
}
