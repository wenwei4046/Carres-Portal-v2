import { blue } from "@radix-ui/colors";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  ARRIVAL_SOURCE_TYPES,
  INBOUND_STATUS_FILTERS,
  INBOUND_UNMAPPED_SITE,
  inboundExceptionLines,
  inboundStatusWordOf,
  type InboundArrival,
} from "@carres/shared";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import {
  useOperationPos,
  useOperationSuppliers,
  useOperationWarehouse,
  useReceivingDuty,
  type SupplierRow,
} from "@/lib/queries";
import ArrivalSourceWorkspace from "./ArrivalSourceWorkspace";
import ModuleHeader from "./components/ModuleHeader";
import PoReceivingView from "./components/PoReceivingView";
import {
  FilterRail,
  FilterRailGroup,
  FilterRailRow,
} from "./components/workspace-rail";
import { useWarehouseInbound } from "./useWarehouseInbound";

/**
 * WAREHOUSE — INBOUND (approved receiving workspace, 2026-09-15).
 *
 * One row = one dated arrival arrangement with its own goods scope. What
 * changed from the 2026-09-07 unified card, and why:
 *
 * 1. **SITE IS A TAB, NOT A RAIL ROW.** Inbound answers "what is arriving
 *    HERE", and the place is the first question, not the eighth filter. The
 *    strip opens on Carres Klang Warehouse and is built from the governed
 *    Sites the server returns — never from a hardcoded partner name.
 *
 * 2. **THREE FILTERS, NOT FIVE.** `Not finished` · `Received` · `All
 *    arrivals`. `Expected`, `Part received` and `With issue` overlapped each
 *    other and every other word; they are FACTS ON THE ROW and always were.
 *
 * 3. **THE FIVE GOVERNED QUANTITIES PRINT SEPARATELY** — `Order Qty` ·
 *    `Received Qty` · `Pending Delivery Qty`, with `Damaged Qty` and
 *    `Wrong Item Qty` in their own column. The operator never subtracts, and
 *    damaged goods never quietly settle the supplier's debt.
 *
 * 4. **RECEIVING HAPPENS HERE.** The row's own `Receive` button opens the
 *    authoritative `ReceivingWorkspace` FULL-WIDTH on this page. The Register
 *    stays mounted underneath, so Site, filters, search and scroll position
 *    are exactly as they were when the operator comes back. Inbound still
 *    owns no write path — `ReceivingWorkspace` and
 *    `/api/operation/pos/:id/office-receive` remain the only ones.
 *
 * Clicks stay explicit: the Document number opens the document; the Product
 * cell (arrow + content, ONE entry) expands the row; a Unit ID inside the
 * expansion opens that Unit; the row itself navigates nowhere.
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

/** The Site whose goods Carres Klang receives — the strip's opening tab when
 *  the URL names none. Matched by the governed name the server returns, and
 *  falling back to the FIRST Site rather than to a guess. */
const DEFAULT_SITE_NAME = "Carres Klang Warehouse";

/** The Document number opens the DOCUMENT — never the work surface. */
function documentHref(r: InboundArrival) {
  if (r.sourceType === "supplier-delivery")
    return `/operation/procurement?po=${encodeURIComponent(r.sourceId)}`;
  return `/operation?tab=arrival-source&arrival=${encodeURIComponent(r.sourceId)}`;
}

/** `Not confirmed` · `Same as PO` · the supplier's own different date.
 *  ABSENCE FIRST, THEN THE EQUALITY — the reverse turned "the supplier has
 *  said nothing" into "the supplier confirmed our date". */
function supplierDeliveryWord(r: InboundArrival): string {
  if (r.sourceType !== "supplier-delivery") return "";
  if (!r.supplierDeliveryDate) return "Not confirmed";
  if (r.supplierDeliveryDate === r.poDeliveryDate) return "Same as PO";
  return fmtDate(r.supplierDeliveryDate);
}

/** An unknown number is an absence, never a zero. */
function qty(r: InboundArrival, key: "orderQty" | "receivedQty" | "pendingDeliveryQty") {
  return r.quantities.known ? String(r.quantities[key]) : "Not recorded";
}

export default function WarehouseInbound() {
  const [params, setParams] = useSearchParams();
  const [offset, setOffset] = useState(0);
  /* From the menu the register shows every UNFINISHED arrangement under its
     original date; an exact Monitor deep link (`source=…`) must show that
     arrangement even when it is already finished, so the default widens. */
  const effectiveStatus =
    params.get("status") ?? (params.get("source") || params.get("po") ? "all" : "open");

  /* ── The receiving stage ────────────────────────────────────────────────
     `receive` names a PO; `receiveArrival` names a transfer/return/repair
     source. Either takes the full width; the Register below stays MOUNTED
     (`invisible`, never unmounted) so every filter, the search term and the
     scroll position survive the round trip. */
  const receivePoId = params.get("receive");
  const receiveArrivalId = params.get("receiveArrival");
  const receivingOpen = Boolean(receivePoId || receiveArrivalId);

  const dutyQ = useReceivingDuty();
  /* Fetched ONLY while the stage is open — the Register itself needs none of
     these, and Inbound is the page an operator leaves open all morning. */
  const posQ = useOperationPos({}, { enabled: Boolean(receivePoId) });
  const suppliersQ = useOperationSuppliers({ enabled: Boolean(receivePoId) });
  const warehouseQ = useOperationWarehouse({ enabled: Boolean(receivePoId) });
  const supplierById = useMemo(
    () =>
      new Map(
        ((suppliersQ.data?.suppliers ?? []) as SupplierRow[]).map((s) => [
          s.id,
          s,
        ]),
      ),
    [suppliersQ.data],
  );

  const queryParams = useMemo(() => {
    const p = new URLSearchParams(params);
    /* Monitor's ARRIVAL card names the PO as `po`; the register's own
       contract is `source`. One scope, two spellings — honour both. */
    if (p.get("po") && !p.get("source")) p.set("source", p.get("po")!);
    p.delete("po");
    p.delete("receive");
    p.delete("receiveArrival");
    if (effectiveStatus === "all") p.delete("status");
    else p.set("status", effectiveStatus);
    return p;
  }, [params, effectiveStatus]);
  const q = useWarehouseInbound(queryParams, offset);
  const rows = q.data?.arrivals ?? [];
  const page = q.data?.page ?? { offset: 0, limit: 50, total: 0 };
  const facets = q.data?.facets ?? { status: {}, sourceType: {}, site: {} };
  const sites = useMemo(() => q.data?.sites ?? [], [q.data]);
  const unmapped = q.data?.unmappedDestinations ?? [];
  const [showFilters, setShowFilters] = useState(false);
  const [railHidden, setRailHidden] = useState(false);
  const isNarrow = useIsNarrow();
  const root = useRef<HTMLDivElement>(null);
  const scrollKey = `inbound-scroll:${params.toString()}`;

  /* THE STRIP OPENS ON CARRES KLANG. Until the first payload arrives there is
     no Site to name, so nothing is written to the URL — a redirect to a Site
     that may not exist is worse than one render with no tab selected. */
  const activeSite = params.get("site");
  useEffect(() => {
    if (activeSite || sites.length === 0) return;
    const opening =
      sites.find((s) => s.name === DEFAULT_SITE_NAME) ?? sites[0];
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("site", opening.id);
        return next;
      },
      { replace: true },
    );
  }, [activeSite, sites, setParams]);

  useEffect(() => {
    if (q.isLoading || receivingOpen) return;
    const scroll =
      root.current?.querySelector<HTMLElement>('[data-testid="grid-scroll"]') ??
      root.current?.querySelector<HTMLElement>(".overflow-auto");
    if (scroll)
      scroll.scrollTop = Number(sessionStorage.getItem(scrollKey) ?? 0);
  }, [q.isLoading, receivingOpen, scrollKey]);
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
  const openReceiving = useCallback(
    (r: InboundArrival) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set(
          r.sourceType === "supplier-delivery" ? "receive" : "receiveArrival",
          r.sourceId,
        );
        return next;
      });
    },
    [setParams],
  );
  const closeReceiving = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("receive");
      next.delete("receiveArrival");
      return next;
    });
  }, [setParams]);

  const filterKey = [
    params.get("status"), params.get("sourceType"), params.get("site"),
    params.get("source"), params.get("po"), params.get("date"),
    params.get("from"), params.get("to"), params.get("q"),
  ].join("|");
  useEffect(() => setOffset(0), [filterKey]);
  const onSearch = useCallback(
    (value: string) => setFilter("q", value),
    [setFilter],
  );
  const today = appTodayIso();
  const dutyAllowed = dutyQ.data?.allowed ?? false;
  const dutyKnown = !dutyQ.isLoading;
  const columns = useMemo<DataGridColumn<InboundArrival>[]>(
    () => [
      {
        key: "document",
        label: "Document",
        width: 165,
        searchValue: (r) => `${r.documentWord} ${r.documentNo} ${r.sourceId}`,
        accessor: (r) => (
          <div className="py-0.5 leading-[18px]">
            <Link
              className="font-mono text-kit-blue-11 hover:underline"
              onClick={(event) => event.stopPropagation()}
              to={documentHref(r)}
              data-testid={`inbound-document-${r.id}`}
            >
              {r.documentNo}
            </Link>
            {/* A non-PO arrangement keeps its OWN document word — `Transfer
                No`, `Repair Order No`, `Claim No`. Never `PO / Source No`. */}
            <div className="text-label text-base-500">
              {r.sourceType === "supplier-delivery"
                ? r.poIssued
                  ? `PO Issued ${fmtDate(r.poIssued)}`
                  : "PO Issued date not recorded"
                : r.documentWord}
            </div>
          </div>
        ),
        wrap: true,
      },
      {
        key: "products",
        /* CONTENT DECIDES THE WIDTH. A furniture identity is model + variant
           (`Booqit CNR Sectional Sofa Left-Hand Facing · Charcoal Weave`), and
           230px folded every one of them over three lines. */
        label: "Product",
        width: 300,
        wrap: true,
        searchValue: (r) =>
          r.products
            .map((p) => `${p.name ?? ""} ${p.sku ?? ""}`)
            .concat(r.units.map((u) => u.code))
            .join(" "),
        accessor: (r) =>
          r.products.length === 0 ? (
            <span>Products not recorded</span>
          ) : (
            /* EVERY PRODUCT IS LISTED — `+N more` stays forbidden. What is
               capped is how many lines ONE name may take: a ten-line PO of
               long furniture names built a 743px row, so the Register showed
               one arrangement per screen (measured 2026-09-15). Each entry
               gets at most two lines and the expansion — whose one job is the
               full product detail — carries the untruncated identity. */
            <div className="space-y-1 py-0.5 leading-[18px]">
              {r.products.map((p) => (
                <div key={p.sku ?? "no-sku"} className="flex gap-2">
                  {/* THE QUANTITY IS PINNED AND NEVER CLIPPED. Clamping the
                      whole line ate the `× 1` first — the one fact on the
                      entry an operator counting a pallet cannot do without. */}
                  <span className="line-clamp-2 min-w-0 flex-1">
                    {p.name ?? p.sku ?? "Product not recorded"}
                    {p.name && p.sku ? (
                      <span className="text-base-500"> · {p.sku}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums">× {p.qty}</span>
                </div>
              ))}
            </div>
          ),
      },
      {
        key: "from",
        label: "Supplier",
        width: 140,
        wrap: true,
        searchValue: (r) => r.from,
        accessor: (r) => r.from,
      },
      {
        key: "site",
        label: "To",
        width: 130,
        wrap: true,
        searchValue: (r) => r.site,
        accessor: (r) => r.site,
      },
      {
        key: "poDeliveryDate",
        label: "PO Delivery Date",
        width: 130,
        /* TOP-ALIGNED, LIKE EVERY OTHER CELL ON THE ROW. A column without
           `wrap` is `vertical-align: middle`, so on a ten-product row the
           date sat ~350px below the PO number it belongs to. Measured in the
           local walk 2026-09-15: row 742px, date centred at 360px. */
        wrap: true,
        filterType: "date",
        dateValue: (r) => r.poDeliveryDate,
        searchValue: (r) => r.poDeliveryDate ?? "",
        accessor: (r) =>
          r.poDeliveryDate
            ? fmtDate(r.poDeliveryDate)
            : r.sourceType === "supplier-delivery"
              ? "Date not recorded"
              : r.date
                ? fmtDate(r.date)
                : "Date not recorded",
      },
      {
        key: "supplierDeliveryDate",
        label: "Supplier Delivery Date",
        width: 145,
        wrap: true,
        filterType: "date",
        dateValue: (r) => r.supplierDeliveryDate,
        searchValue: supplierDeliveryWord,
        filterValue: supplierDeliveryWord,
        accessor: supplierDeliveryWord,
      },
      {
        key: "receivedOn",
        label: "Goods received on",
        width: 190,
        wrap: true,
        searchValue: (r) =>
          r.sessions.map((s) => `${s.doNumber ?? ""} ${s.receivedAt ?? ""}`).join(" "),
        accessor: (r) => {
          if (r.sessions.length === 0) return "";
          /* EACH DELIVERY NOTE IS ITS OWN ARRIVAL. One supplier DO, one
             receipt, one actual date — collapsing several into a single
             "latest" date hid the earlier trucks entirely. */
          return (
            <div className="space-y-0.5 py-0.5 leading-[18px]">
              {r.sessions.map((s) => (
                <div key={s.id}>
                  <Link
                    className="font-mono text-kit-blue-11 hover:underline"
                    onClick={(event) => event.stopPropagation()}
                    to={`/operation?${new URLSearchParams({ tab: "receiving", session: s.id })}`}
                    data-testid={`inbound-receipt-${s.id}`}
                  >
                    {s.doNumber ?? s.grnNo ?? "Receipt"}
                  </Link>
                  <span className="text-base-600">
                    {" · "}
                    {s.receivedAt ? fmtDate(s.receivedAt) : "Date not recorded"}
                  </span>
                </div>
              ))}
            </div>
          );
        },
      },
      ...(
        [
          ["orderQty", "Order Qty"],
          ["receivedQty", "Received Qty"],
          ["pendingDeliveryQty", "Pending Delivery Qty"],
        ] as const
      ).map(([key, label]) => ({
        key,
        label,
        width: key === "pendingDeliveryQty" ? 120 : 95,
        align: "right" as const,
        wrap: true,
        filterType: "number" as const,
        numberValue: (r: InboundArrival) =>
          r.quantities.known ? r.quantities[key] : null,
        searchValue: (r: InboundArrival) => qty(r, key),
        accessor: (r: InboundArrival) => (
          <span className="tabular-nums">{qty(r, key)}</span>
        ),
      })),
      {
        key: "issueQty",
        label: "Damaged / Wrong",
        width: 140,
        wrap: true,
        searchValue: (r) =>
          `${r.quantities.damagedQty} ${r.quantities.wrongItemQty}`,
        accessor: (r) => {
          /* DAMAGED GOODS ARE PRESENT AND UNAVAILABLE, and they never reduce
             Pending Delivery Qty — the supplier still owes a replacement. */
          if (!r.quantities.known) return "";
          const { damagedQty, wrongItemQty } = r.quantities;
          if (damagedQty === 0 && wrongItemQty === 0) return "";
          return (
            <div className="space-y-0.5 py-0.5 tabular-nums leading-[18px]">
              {damagedQty > 0 && <div>Damaged Qty {damagedQty}</div>}
              {wrongItemQty > 0 && <div>Wrong Item Qty {wrongItemQty}</div>}
            </div>
          );
        },
      },
      {
        key: "status",
        label: "Status",
        width: 130,
        wrap: true,
        searchValue: (r) => inboundStatusWordOf(r),
        accessor: (r) => inboundStatusWordOf(r),
      },
      {
        key: "exceptions",
        label: "Exceptions",
        width: 230,
        wrap: true,
        searchValue: (r) => inboundExceptionLines(r, today, fmtDate).join(" "),
        accessor: (r) => {
          const lines = inboundExceptionLines(r, today, fmtDate);
          return lines.length === 0 ? (
            ""
          ) : (
            <div className="space-y-0.5 py-0.5 leading-[18px]">
              {lines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          );
        },
      },
      {
        key: "receive",
        label: "Receiving",
        width: 120,
        wrap: true,
        /* A DOOR IS NOT A FACT — no funnel on an action column. */
        filterable: false,
        exportLabel: "Receiving",
        exportValue: () => "",
        accessor: (r) => {
          /* GOODS THAT NEVER REACH A CARRES SITE GET NO RECEIPT DOOR. An
             arrangement whose destination has no Site is not received by
             Carres at all; offering the button would mint a warehouse receipt
             for goods that went straight to a customer. */
          if (!r.siteMapped)
            return (
              <span className="text-meta text-base-500">
                No Site linked
              </span>
            );
          if (!dutyKnown) return <span className="text-meta">Checking…</span>;
          if (!dutyAllowed)
            return (
              <span
                className="text-meta text-base-500"
                data-testid={`inbound-receive-denied-${r.id}`}
              >
                Not your duty today
              </span>
            );
          return (
            <button
              type="button"
              data-testid={`inbound-receive-${r.id}`}
              className="inline-flex h-7 items-center rounded-control border border-kit-slate-5 bg-white px-2 text-meta text-kit-blue-11 hover:bg-hovertint"
              onClick={(event) => {
                event.stopPropagation();
                openReceiving(r);
              }}
            >
              Receive
            </button>
          );
        },
      },
      {
        key: "so",
        label: "SO No",
        defaultHidden: true,
        width: 100,
        accessor: (r) => r.so ?? "",
      },
    ],
    [today, dutyAllowed, dutyKnown, openReceiving],
  );
  const context = params.get("date") || params.get("from");
  const dateContext = context
    ? ` for ${fmtDate(context)}${params.get("to") ? ` — ${fmtDate(params.get("to")!)}` : ""}`
    : params.get("to")
      ? ` through ${fmtDate(params.get("to")!)}`
      : "";
  const empty =
    effectiveStatus === "open" && !context && !params.get("q")
      ? "No unfinished arrivals. Every arranged arrival is received."
      : `No arrivals match these filters${dateContext}.`;
  const activeSource = params.get("source") || params.get("po");
  const dateControls = (
    <>
      <label className="text-meta">
        From{" "}
        <input
          className="h-7 rounded-control border border-kit-slate-5 px-2"
          type="date"
          aria-label="Arrival from"
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
          aria-label="Arrival to"
          min={params.get("date") || params.get("from") || undefined}
          value={params.get("to") || ""}
          onChange={(e) => setFilter("to", e.target.value)}
        />
      </label>
      <button
        className="h-7 px-2 text-body text-kit-blue-11"
        onClick={() =>
          setParams(
            activeSite
              ? { tab: "warehouse-inbound", site: activeSite }
              : { tab: "warehouse-inbound" },
            { replace: true },
          )
        }
      >
        Clear filters
      </button>
    </>
  );

  /** The Site strip. Built from the governed Sites the server returned, plus
   *  — only when such goods exist — one tab for destinations no Site owns. */
  const siteTabs: Array<{ id: string; label: string; count: number | undefined }> = [
    ...sites.map((s) => ({
      id: s.id,
      label: s.name,
      count: q.isLoading || q.error ? undefined : facets.site[s.id] ?? 0,
    })),
    ...(unmapped.length > 0
      ? [
          {
            id: INBOUND_UNMAPPED_SITE,
            /* Named by what is TRUE of them, with the destinations listed in
               the banner below — never a partner name typed into the code. */
            label: "Destinations without a Site",
            count:
              q.isLoading || q.error
                ? undefined
                : facets.site[INBOUND_UNMAPPED_SITE] ?? 0,
          },
        ]
      : []),
  ];

  return (
    <div
      ref={root}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-testid="warehouse-inbound"
      onScrollCapture={(e) => {
        const el = e.target as HTMLElement;
        if (el.getAttribute("data-testid") === "grid-scroll")
          sessionStorage.setItem(scrollKey, String(el.scrollTop));
      }}
    >
      {/* ONE header row. The hosted arrival workspace draws its own, so
          Inbound's stands down rather than stacking a second one. */}
      {!receiveArrivalId && (
        <ModuleHeader
          testId="inbound-header"
          word="Inbound"
          docTitle="Inbound · Warehouse — Carres"
          destinationHeader
        />
      )}

      {receivePoId ? (
        <PoReceivingView
          poId={receivePoId}
          pos={posQ.data?.pos ?? []}
          suppliers={supplierById}
          warehouses={warehouseQ.data?.warehouses ?? []}
          dutyAllowed={dutyAllowed}
          dutyKnown={dutyKnown}
          backLabel="Inbound"
          onBack={closeReceiving}
          /* The save already invalidated this page's query; closing the stage
             returns to a Register that has re-read its own rows. */
          onPosted={() => void q.refetch()}
          testId="inbound-receiving-stage"
        />
      ) : receiveArrivalId ? (
        <ArrivalSourceWorkspace receiving sourceId={receiveArrivalId} />
      ) : null}

      <div
        className={[
          "flex min-h-0 min-w-0 flex-1",
          receivingOpen ? "pointer-events-none invisible h-0 flex-none" : "",
        ].join(" ")}
        aria-hidden={receivingOpen || undefined}
      >
        <div
          className={`${showFilters ? "flex" : "hidden"} min-h-0 shrink-0 ${railHidden ? "md:hidden" : "md:flex"}`}
        >
          <FilterRail
            testId="inbound-rail"
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
            <FilterRailGroup title="ARRIVAL STATUS">
              {INBOUND_STATUS_FILTERS.map(([value, label]) => (
                <FilterRailRow
                  key={value}
                  label={label}
                  active={effectiveStatus === value}
                  count={
                    q.isLoading || q.error
                      ? undefined
                      : facets.status[value] ?? 0
                  }
                  testId={`inbound-status-${value}`}
                  onClick={() => {
                    setFilter("status", value);
                    setShowFilters(false);
                  }}
                />
              ))}
            </FilterRailGroup>
            <FilterRailGroup title="DOCUMENT TYPE">
              {ARRIVAL_SOURCE_TYPES.map(([type, label]) => (
                <FilterRailRow
                  key={type}
                  label={label}
                  active={params.get("sourceType") === type}
                  count={
                    q.isLoading || q.error
                      ? undefined
                      : facets.sourceType[type] ?? 0
                  }
                  testId={
                    type === "supplier-delivery"
                      ? "inbound-source-supplier"
                      : `inbound-source-${type}`
                  }
                  onClick={() => {
                    setFilter(
                      "sourceType",
                      params.get("sourceType") === type ? "" : type,
                    );
                    setShowFilters(false);
                  }}
                />
              ))}
            </FilterRailGroup>
          </FilterRail>
        </div>
        <div
          className={`${showFilters ? "hidden md:flex" : "flex"} min-h-0 min-w-0 flex-1 flex-col p-2`}
        >
          {/* ── THE SITE STRIP ─────────────────────────────────────────── */}
          {siteTabs.length > 0 && (
            <div
              className="mb-2 flex flex-wrap items-center gap-1 border-b border-kit-slate-5"
              role="tablist"
              aria-label="Receiving Site"
              data-testid="inbound-sites"
            >
              {siteTabs.map((tab) => {
                const active = activeSite === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-testid={`inbound-site-${tab.id}`}
                    onClick={() => setFilter("site", tab.id)}
                    className={[
                      "-mb-px border-b-2 px-3 py-1.5 text-body",
                      active
                        ? "border-kit-blue-11 text-kit-blue-11"
                        : "border-transparent text-base-600 hover:bg-hovertint",
                    ].join(" ")}
                  >
                    {tab.label}
                    {tab.count !== undefined && (
                      <span className="ml-1.5 tabular-nums text-meta text-base-500">
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {activeSite === INBOUND_UNMAPPED_SITE && unmapped.length > 0 ? (
            <div
              role="status"
              className="mb-2 border border-kit-slate-5 bg-white p-3 text-body"
              data-testid="inbound-unmapped-note"
            >
              These purchasing destinations have goods coming and no Carres
              Site linked, so nobody can record a receipt for them:{" "}
              {unmapped
                .map((d) => `${d.name ?? "Destination not named"} (${d.arrivals})`)
                .join(" · ")}
              . Link each one to the Site that actually receives the goods, or
              confirm the goods go straight to the customer.
            </div>
          ) : null}
          {!q.error && q.data?.unresolvedSources?.length ? (
            <div
              role="status"
              className="border-b border-kit-slate-5 bg-white p-3 text-body"
            >
              These sources have different destination instructions. Check their
              exact Units in Receiving:{" "}
              {q.data.unresolvedSources.map((id) => (
                <Link
                  key={id}
                  className="ml-2 text-kit-blue-11 hover:underline"
                  to={`/operation?${new URLSearchParams({ tab: "receiving", po: id })}`}
                >
                  {id}
                </Link>
              ))}
            </div>
          ) : null}
          {q.error ? (
            <div
              role="alert"
              className="flex flex-1 flex-col items-center justify-center gap-3 bg-white"
            >
              <p>Inbound could not be opened</p>
              <p>{q.error.message}</p>
              <button
                className="rounded-control border border-base-200 px-3 py-1.5 text-body"
                onClick={() => void q.refetch()}
              >
                Try again
              </button>
            </div>
          ) : (
            <DataGrid<InboundArrival>
              stickyIdentity={{ columnKey: "document" }}
              key={params.get("q") === null ? "clear" : "search"}
              appearance="reference"
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id}
              rowTestId={(r) => `inbound-row-${r.id}`}
              storageKey="carres.inbound.register.v3"
              exportName="Inbound"
              searchPlaceholder="Document, product, supplier or Unit ID…"
              initialSearch={params.get("q") ?? ""}
              onSearchChange={onSearch}
              isLoading={q.isLoading}
              groupBanner={false}
              emptyMessage={empty}
              rowStyle={(r) =>
                activeSource === r.sourceId
                  ? { background: blue.blue3 }
                  : undefined
              }
              toolbarStart={
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded border border-kit-slate-5 bg-white px-2 text-meta text-base-600 hover:bg-hovertint md:hidden"
                    onClick={() => setShowFilters((v) => !v)}
                    data-testid="inbound-toggle-filters"
                  >
                    <PanelLeftOpen size={14} /> Filters
                  </button>
                  {railHidden && (
                    <button
                      type="button"
                      className="hidden h-7 items-center gap-1 rounded border border-kit-slate-5 bg-white px-2 text-meta text-base-600 hover:bg-hovertint md:inline-flex"
                      onClick={() => setRailHidden(false)}
                      data-testid="inbound-show-filters"
                    >
                      <PanelLeftClose size={14} /> Show filters
                    </button>
                  )}
                  {!isNarrow && dateControls}
                  {activeSource && (
                    <span className="text-meta" data-testid="inbound-source-context">
                      Document: {activeSource}
                    </span>
                  )}
                </div>
              }
              expandTitle="Show every product and Unit"
              expandable={{
                trigger: { columnKey: "products" },
                testId: (r) => `inbound-expand-${r.id}`,
                renderExpansion: (r) => <InboundExpansion row={r} />,
              }}
              statusSummary={() => {
                const from = page.total === 0 ? 0 : page.offset + 1;
                const to = Math.min(page.offset + page.limit, page.total);
                return (
                  <span className="flex items-center gap-3">
                    <span data-testid="inbound-page-range">
                      Showing {from}–{to} of {page.total} arrangements
                    </span>
                    <button
                      type="button"
                      data-testid="inbound-page-previous"
                      disabled={page.offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - page.limit))}
                      className="rounded-control border border-kit-slate-5 bg-white px-2 py-0.5 text-meta text-kit-slate-11 disabled:text-kit-slate-9"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      data-testid="inbound-page-next"
                      disabled={to >= page.total}
                      onClick={() => setOffset(offset + page.limit)}
                      className="rounded-control border border-kit-slate-5 bg-white px-2 py-0.5 text-meta text-kit-slate-11 disabled:text-kit-slate-9"
                    >
                      Next
                    </button>
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

/** The expansion has ONE job: the full product detail. Complete products with
 *  their own governed quantities, the exact Units with per-Unit results, and
 *  every posted receipt with its supplier delivery note. */
function InboundExpansion({ row: r }: { row: InboundArrival }) {
  return (
    <div className="space-y-3 p-3 text-body">
      {r.identitiesMissing && (
        <p>
          Unit IDs or Receiving results are not fully recorded. Open the
          receipt to check the source.
        </p>
      )}
      {r.products.length > 0 && (
        <div>
          <div className="mb-1 text-label font-semibold uppercase tracking-wide text-base-600">
            Products
          </div>
          {r.products.map((p) => (
            <div key={p.sku ?? "no-sku"} className="flex flex-wrap gap-3">
              <span>{p.name ?? p.sku ?? "Product not recorded"}</span>
              {p.sku && <span className="font-mono text-base-500">{p.sku}</span>}
              <span className="tabular-nums">
                Order Qty {p.qty} · Received Qty {p.received}
              </span>
            </div>
          ))}
        </div>
      )}
      {r.units.length > 0 && (
        <div>
          <div className="mb-1 text-label font-semibold uppercase tracking-wide text-base-600">
            Units
          </div>
          {r.units.map((u) => (
            <div key={u.id} className="flex flex-wrap gap-3">
              <Link
                className="font-mono text-kit-blue-11"
                to={`/operation/stock/unit/${encodeURIComponent(u.code)}`}
              >
                {u.code}
              </Link>
              {u.product && <span className="text-base-600">{u.product}</span>}
              <span>
                {u.outcome === "received"
                  ? "Received"
                  : u.outcome === "received_with_issue"
                    ? `Received with issue · ${u.issue === "wrong_item" ? "Wrong item" : "Damaged"}`
                    : u.outcome === "unknown"
                      ? "Receiving result not recorded"
                      : "Not yet received"}
              </span>
              {u.receivedSite && u.receivedSite !== r.site && (
                <span>Received at {u.receivedSite}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {r.sessions.length > 0 && (
        <div>
          <div className="mb-1 text-label font-semibold uppercase tracking-wide text-base-600">
            Receiving records
          </div>
          {r.sessions.map((s) => (
            <div key={s.id} className="flex flex-wrap gap-3">
              <Link
                className="font-mono text-kit-blue-11"
                to={`/operation?${new URLSearchParams({ tab: "receiving", session: s.id })}`}
              >
                {s.grnNo ?? "Receipt"}
              </Link>
              {s.doNumber && <span>Supplier DO No {s.doNumber}</span>}
              {s.receivedAt && <span>Goods received on {fmtDate(s.receivedAt)}</span>}
              {s.actualSite && <span>at {s.actualSite}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
