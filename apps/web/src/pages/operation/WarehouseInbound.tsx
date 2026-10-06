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
import { REGISTER_FIELD_WIDTH } from "@/components/register/register-field-widths";
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

/** A fact that has not happened yet (no receipt, no supplier answer on a
 *  non-PO source) stays BLANK — never a dash, never an absence word. */
function Blank() {
  return <span aria-hidden="true" />;
}

/** The `Item` cell — ONE line of 13px with the approved 11px second line.
 *  An arrangement past its date with no receipt prints
 *  `Expected {date} · not received` as its first line (owner 2026-09-25) and
 *  an unreadable receipt prints the governed status word, so the operator
 *  reads WHY the quantity cells are empty without opening Columns. Several
 *  goods print `{n} items` and keep the row expansion — the one Inbound
 *  exception to "no expansion". */
function InboundItemCell({ row: r, today }: { row: InboundArrival; today: string }) {
  const overdue =
    r.date != null && r.date < today && r.sessions.length === 0 && (!r.quantities.known || r.quantities.arrivedQty === 0);
  const incomplete = r.identitiesMissing || !r.quantities.known;
  const goods =
    r.products.length === 0
      ? "Products not recorded"
      : r.products.length > 1
        ? `${r.products.length} items`
        : (r.products[0]!.name ?? r.products[0]!.sku ?? "Product not recorded");
  const first = overdue
    ? `Expected ${fmtDate(r.date!)} · not received`
    : incomplete
      ? inboundStatusWordOf(r)
      : null;
  return (
    <span className="block leading-[18px]" data-testid={`inbound-item-${r.id}`}>
      {first ? (
        <>
          <span className="block" data-testid={`inbound-item-first-${r.id}`}>{first}</span>
          <span className="block text-label font-normal leading-[14px] text-kit-slate-11">{goods}</span>
        </>
      ) : (
        <>
          <span className="block">{goods}</span>
          {r.products.length === 1 && r.products[0]!.name && r.products[0]!.sku ? (
            <span className="block text-label font-normal leading-[14px] text-kit-slate-11">{r.products[0]!.sku}</span>
          ) : null}
        </>
      )}
    </span>
  );
}

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
  const selectedSource = params.get("source") ?? params.get("po");
  const unresolvedSources = (q.data?.unresolvedSources ?? []).filter(
    (id) => !selectedSource || id === selectedSource,
  );
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
  /**
   * THE INBOUND REGISTER — owner ruling 2026-09-25 (Stock MASTER §7).
   *
   * One row is one arrangement, 40px, ONE FACT PER CELL, in the owner's own
   * order: the three dates first (planned · supplier-confirmed · actual), then
   * the two documents and the supplier, then the goods and the three
   * quantities, `Receive` last.
   *
   *   PO Delivery Date · Supplier Delivery Date · Goods Received Date · PO No ·
   *   Supplier · Supplier DO No · Item · Order Qty · Received Qty ·
   *   Pending Delivery Qty · Receive
   *
   * The 2026-09-15 composite cells (`Document` · `Receiving progress`) are
   * retired as design. Nothing is deleted: `Damaged Qty` · `Wrong Item Qty` ·
   * `PO Issued` · `SO No` · `To` · `Status` · `Exceptions` stay one click away
   * in Columns with their own sort and filter. Widths come from the registry,
   * never a typed number; no governed font is reduced.
   */
  const columns = useMemo<DataGridColumn<InboundArrival>[]>(
    () => [
      {
        key: "poDeliveryDate",
        label: "PO Delivery Date",
        headerLines: ["PO Delivery", "Date"] as const,
        width: REGISTER_FIELD_WIDTH.date,
        sortable: true,
        filterType: "date",
        chooserGroup: "Dates",
        dateValue: (r) => r.poDeliveryDate ?? r.date,
        searchValue: (r) => r.poDeliveryDate ?? r.date ?? "",
        exportValue: (r) => r.poDeliveryDate ?? r.date ?? "",
        accessor: (r) => {
          /* A non-PO arrangement (Transfer · Return · Repair) has no PO date;
             its own expected date stands in the planned-date column. */
          const iso = r.poDeliveryDate ?? r.date;
          return iso ? (
            <span data-testid={`inbound-po-date-${r.id}`}>{fmtDate(iso)}</span>
          ) : (
            <span className="text-kit-slate-11" data-testid={`inbound-po-date-${r.id}`}>Date not recorded</span>
          );
        },
      },
      {
        key: "supplierDeliveryDate",
        label: "Supplier Delivery Date",
        headerLines: ["Supplier Delivery", "Date"] as const,
        width: REGISTER_FIELD_WIDTH.date,
        sortable: true,
        filterType: "date",
        chooserGroup: "Dates",
        dateValue: (r) => r.supplierDeliveryDate,
        searchValue: supplierDeliveryWord,
        filterValue: supplierDeliveryWord,
        exportValue: supplierDeliveryWord,
        accessor: (r) =>
          r.sourceType === "supplier-delivery" ? (
            <span
              className={r.supplierDeliveryDate ? undefined : "text-kit-slate-11"}
              data-testid={`inbound-supplier-date-${r.id}`}
            >
              {supplierDeliveryWord(r)}
            </span>
          ) : (
            <Blank />
          ),
      },
      {
        key: "goodsReceivedDate",
        label: "Goods Received Date",
        headerLines: ["Goods Received", "Date"] as const,
        width: REGISTER_FIELD_WIDTH.goodsReceivedDate,
        sortable: true,
        filterType: "date",
        chooserGroup: "Dates",
        dateValue: (r) => r.sessions.at(-1)?.receivedAt ?? null,
        searchValue: (r) => r.sessions.map((s) => s.receivedAt ?? "").join(" "),
        exportValue: (r) => r.sessions.map((s) => s.receivedAt ?? "Date not recorded").join(" · "),
        accessor: (r) => {
          /* One receipt prints its own actual date. Several receipts print
             the registry's `{n} receipt dates`; each date stands beside its
             own DO number in the expansion, so no truck hides behind the
             latest one. */
          if (r.sessions.length === 0) return <Blank />;
          if (r.sessions.length === 1) {
            const at = r.sessions[0]!.receivedAt;
            return at ? (
              <span data-testid={`inbound-received-${r.id}`}>{fmtDate(at)}</span>
            ) : (
              <span className="text-kit-slate-11" data-testid={`inbound-received-${r.id}`}>Date not recorded</span>
            );
          }
          return <span data-testid={`inbound-received-${r.id}`}>{r.sessions.length} receipt dates</span>;
        },
      },
      {
        key: "poNo",
        label: "PO No",
        width: REGISTER_FIELD_WIDTH.documentNo,
        sortable: true,
        chooserGroup: "Documents",
        searchValue: (r) => `${r.documentWord} ${r.documentNo} ${r.sourceId}`,
        exportValue: (r) => r.documentNo,
        /* A non-PO arrangement keeps its OWN document word on hover —
           `Transfer No` · `Repair Order No` · `Claim No` — never `PO / Source No`. */
        accessor: (r) => (
          <Link
            className="font-mono text-kit-blue-11 hover:underline"
            onClick={(event) => event.stopPropagation()}
            to={documentHref(r)}
            title={r.sourceType === "supplier-delivery" ? undefined : `${r.documentWord} ${r.documentNo}`}
            data-testid={`inbound-document-${r.id}`}
          >
            {r.documentNo}
          </Link>
        ),
      },
      {
        key: "supplier",
        label: "Supplier",
        width: REGISTER_FIELD_WIDTH.supplier,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Documents",
        searchValue: (r) => r.from,
        filterValue: (r) => r.from,
        exportValue: (r) => r.from,
        accessor: (r) => <span className="block truncate" title={r.from} data-testid={`inbound-supplier-${r.id}`}>{r.from}</span>,
      },
      {
        key: "supplierDoNo",
        label: "Supplier DO No",
        headerLines: ["Supplier", "DO No"] as const,
        width: REGISTER_FIELD_WIDTH.supplierDoNo,
        sortable: true,
        chooserGroup: "Documents",
        searchValue: (r) => r.sessions.map((s) => s.doNumber ?? s.grnNo ?? "").join(" "),
        exportValue: (r) => r.sessions.map((s) => s.doNumber ?? s.grnNo ?? "Receipt").join(" · "),
        accessor: (r) =>
          r.sessions.length === 0 ? (
            <Blank />
          ) : (
            /* A PO delivered in two trucks lists two DO numbers, each its own
               link to its own receipt (owner 2026-09-25). */
            <span className="whitespace-nowrap" data-testid={`inbound-do-${r.id}`}>
              {r.sessions.map((s, i) => (
                <span key={s.id}>
                  {i > 0 ? <span className="text-kit-slate-11"> · </span> : null}
                  <Link
                    className="font-mono text-kit-blue-11 hover:underline"
                    onClick={(event) => event.stopPropagation()}
                    to={`/operation?${new URLSearchParams({ tab: "receiving", session: s.id })}`}
                    data-testid={`inbound-receipt-${s.id}`}
                  >
                    {s.doNumber ?? s.grnNo ?? "Receipt"}
                  </Link>
                </span>
              ))}
            </span>
          ),
      },
      {
        key: "item",
        label: "Item",
        width: REGISTER_FIELD_WIDTH.items,
        sortable: true,
        chooserGroup: "Goods",
        searchValue: (r) =>
          r.products
            .map((p) => `${p.name ?? ""} ${p.sku ?? ""}`)
            .concat(r.units.map((u) => u.code))
            .join(" "),
        exportValue: (r) =>
          r.products.map((p) => `${p.name ?? p.sku ?? "Product not recorded"} × ${p.qty}`).join(" · "),
        accessor: (r) => <InboundItemCell row={r} today={today} />,
      },
      /* The three governed quantities, each its own number in its own column
         (one family, one registry width). The operator never subtracts, and
         damaged goods never settle the supplier's debt. An unreadable receipt
         reads `Not recorded`, never zero. */
      ...(
        [
          ["orderQty", "Order Qty", ["Order", "Qty"]],
          ["receivedQty", "Received Qty", ["Received", "Qty"]],
          ["pendingDeliveryQty", "Pending Delivery Qty", ["Pending Delivery", "Qty"]],
        ] as const
      ).map(([key, label, lines]) => ({
        key,
        label,
        headerLines: lines as readonly [string, string],
        width: REGISTER_FIELD_WIDTH.receiptQty,
        align: "right" as const,
        sortable: true,
        filterType: "number" as const,
        chooserGroup: "Goods",
        numberValue: (r: InboundArrival) =>
          r.quantities.known ? r.quantities[key] : null,
        searchValue: (r: InboundArrival) =>
          r.quantities.known ? String(r.quantities[key]) : "Not recorded",
        exportValue: (r: InboundArrival) =>
          r.quantities.known ? r.quantities[key] : "Not recorded",
        accessor: (r: InboundArrival) => (
          <span
            className={`tabular-nums ${r.quantities.known ? "" : "text-kit-slate-11"}`}
            data-testid={`inbound-qty-${key}-${r.id}`}
          >
            {r.quantities.known ? r.quantities[key] : "Not recorded"}
          </span>
        ),
      })),
      {
        key: "receive",
        /* `Receive` is the owner's LAST column (2026-09-25). A door is not a
           fact — no funnel, no sort. Its three words are `Receive` ·
           `Checking…` · and the no-Site tab's `No Site linked`. */
        label: "Receive",
        width: REGISTER_FIELD_WIDTH.shortFact,
        sortable: false,
        filterable: false,
        exportLabel: "Receive",
        exportValue: () => "",
        accessor: (r) => {
          /* GOODS THAT NEVER REACH A CARRES SITE GET NO RECEIPT DOOR. */
          if (!r.siteMapped)
            return (
              <span className="text-meta text-base-500">No Site linked</span>
            );
          if (!dutyKnown) return <span className="text-meta">Checking…</span>;
          if (!dutyAllowed)
            return (
              <span
                className="text-meta text-base-500"
                data-testid={`inbound-receive-denied-${r.id}`}
              >
                Only Operation staff may save a receiving.
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
      /* ── One click away in Columns ────────────────────────────────────── */
      ...(
        [
          ["damagedQty", "Damaged Qty", ["Damaged", "Qty"]],
          ["wrongItemQty", "Wrong Item Qty", ["Wrong Item", "Qty"]],
        ] as const
      ).map(([key, label, lines]) => ({
        key,
        label,
        headerLines: lines as readonly [string, string],
        defaultHidden: true,
        width: REGISTER_FIELD_WIDTH.receiptQty,
        align: "right" as const,
        sortable: true,
        filterType: "number" as const,
        chooserGroup: "Goods",
        numberValue: (r: InboundArrival) =>
          r.quantities.known ? r.quantities[key] : null,
        searchValue: (r: InboundArrival) =>
          r.quantities.known ? String(r.quantities[key]) : "Not recorded",
        exportValue: (r: InboundArrival) =>
          r.quantities.known ? r.quantities[key] : "Not recorded",
        accessor: (r: InboundArrival) => (
          <span className="tabular-nums">
            {r.quantities.known ? r.quantities[key] : "Not recorded"}
          </span>
        ),
      })),
      {
        key: "poIssued",
        label: "PO Issued",
        defaultHidden: true,
        width: REGISTER_FIELD_WIDTH.date,
        sortable: true,
        filterType: "date",
        chooserGroup: "Dates",
        dateValue: (r) => r.poIssued,
        exportValue: (r) => r.poIssued ?? "",
        accessor: (r) => (r.poIssued ? fmtDate(r.poIssued) : <Blank />),
      },
      {
        key: "so",
        label: "SO No",
        defaultHidden: true,
        width: REGISTER_FIELD_WIDTH.soNo,
        sortable: true,
        chooserGroup: "Documents",
        searchValue: (r) => (r.so == null ? "" : String(r.so)),
        exportValue: (r) => r.so ?? "",
        accessor: (r) => (r.so == null ? <Blank /> : <span className="font-mono">{r.so}</span>),
      },
      {
        key: "site",
        /* THE DESTINATION DOES NOT REPEAT INSIDE ITS OWN TAB. On the
           `Destinations without a Site` tab every row differs, so it comes
           back automatically. */
        label: "To",
        width: REGISTER_FIELD_WIDTH.placeWord,
        sortable: true,
        chooserGroup: "Documents",
        defaultHidden: activeSite !== INBOUND_UNMAPPED_SITE,
        searchValue: (r) => r.site,
        exportValue: (r) => r.site,
        overflowText: (r) => r.site,
        accessor: (r) => r.site,
      },
      {
        key: "status",
        defaultHidden: true,
        label: "Status",
        width: REGISTER_FIELD_WIDTH.status,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Goods",
        searchValue: (r) => inboundStatusWordOf(r),
        filterValue: (r) => inboundStatusWordOf(r),
        exportValue: (r) => inboundStatusWordOf(r),
        accessor: (r) => inboundStatusWordOf(r),
      },
      {
        key: "exceptions",
        defaultHidden: true,
        label: "Exceptions",
        width: REGISTER_FIELD_WIDTH.address,
        chooserGroup: "Goods",
        searchValue: (r) => inboundExceptionLines(r, today, fmtDate).join(" "),
        exportValue: (r) => inboundExceptionLines(r, today, fmtDate).join(" · "),
        overflowText: (r) => inboundExceptionLines(r, today, fmtDate).join(" · "),
        accessor: (r) => {
          const lines = inboundExceptionLines(r, today, fmtDate);
          return lines.length === 0 ? <Blank /> : <span>{lines.join(" · ")}</span>;
        },
      },
    ],
    [today, dutyAllowed, dutyKnown, openReceiving, activeSite],
  );
  const context = params.get("date") || params.get("from");
  const dateContext = context
    ? ` for ${fmtDate(context)}${params.get("to") ? ` to ${fmtDate(params.get("to")!)}` : ""}`
    : params.get("to")
      ? ` through ${fmtDate(params.get("to")!)}`
      : "";
  const empty =
    effectiveStatus === "open" && !context && !params.get("q")
      ? "No arrivals awaiting receipt match these filters."
      : `No arrivals match these filters${dateContext}.`;
  const activeSource = params.get("source") || params.get("po");
  const dateControls = (
    <>
      {/* WHICH DATE? The pair filters the arrival date in force — the
          supplier's evidenced answer where one exists, else the PO's own
          date. It said only `From`/`To`, so the operator had to guess which
          of the three dates on the row it meant. */}
      <span className="text-meta text-base-600">Arrival date</span>
      <label className="text-meta">
        from{" "}
        <input
          className="h-7 rounded-control border border-kit-slate-5 px-2"
          type="date"
          aria-label="Arrival date from"
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
        to{" "}
        <input
          className="h-7 rounded-control border border-kit-slate-5 px-2"
          type="date"
          aria-label="Arrival date to"
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
          docTitle="Inbound · Warehouse · Carres"
          destinationHeader
        />
      )}

      {receivePoId && posQ.isLoading ? (
        <p role="status" className="p-4 text-body">Loading…</p>
      ) : receivePoId ? (
        <PoReceivingView
          poId={receivePoId}
          products={rows.find((row) => row.sourceId === receivePoId)?.products}
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
            <FilterRailGroup title="Arrival status" icon="waiting">
              {INBOUND_STATUS_FILTERS.map(([value, label]) => (
                <FilterRailRow
                  key={value}
                  label={label}
                  active={effectiveStatus === value}
                  resets={value === "all"}
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
            <FilterRailGroup title="Document type" icon="order">
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
          {!q.error && unresolvedSources.length ? (
            <div
              role="status"
              className="border-b border-kit-slate-5 bg-white p-3 text-body"
            >
              These sources have different destination instructions. Check their
              exact Units in Receiving:{" "}
              {unresolvedSources.map((id) => (
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
              stickyIdentity={{ columnKey: "poNo" }}
              key={params.get("q") === null ? "clear" : "search"}
              appearance="reference"
              wrapToolbar
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id}
              rowTestId={(r) => `inbound-row-${r.id}`}
              storageKey="carres.inbound.register.v6"
              rowHeight={40}
              chooserGroupOrder={["Dates", "Documents", "Goods"]}
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
                trigger: { columnKey: "item" },
                testId: (r) => `inbound-expand-${r.id}`,
                renderExpansion: (r) => <InboundExpansion row={r} />,
              }}
              statusSummary={() => {
                const from = page.total === 0 ? 0 : page.offset + 1;
                const to = Math.min(page.offset + page.limit, page.total);
                return (
                  <span className="flex items-center gap-3">
                    <span data-testid="inbound-page-range">
                      Showing {from} to {to} of {page.total} arrangements
                    </span>
                    <button
                      type="button"
                      data-testid="inbound-page-previous"
                      disabled={page.offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - page.limit))}
                      className="rounded-control border border-kit-slate-5 bg-white px-2 py-0.5 text-meta text-kit-slate-11 disabled:text-kit-slate-11 disabled:bg-kit-slate-2"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      data-testid="inbound-page-next"
                      disabled={to >= page.total}
                      onClick={() => setOffset(offset + page.limit)}
                      className="rounded-control border border-kit-slate-5 bg-white px-2 py-0.5 text-meta text-kit-slate-11 disabled:text-kit-slate-11 disabled:bg-kit-slate-2"
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
 *  their own governed quantities and the exact Units with per-Unit results.
 *  Receipt documents stay in the Document cell. */
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
              {p.category && <span>{p.category}</span>}
              {p.sku && <span className="font-mono text-base-500">{p.sku}</span>}
              <span className="tabular-nums">
                Order Qty {p.qty} · Received Qty {p.received}
              </span>
            </div>
          ))}
        </div>
      )}
      {r.sessions.length > 0 && (
        <div>
          <div className="mb-1 text-label font-semibold uppercase tracking-wide text-base-600">
            Receipts
          </div>
          {/* Every posted receipt with its own supplier DO number, GRN number
              and actual date — the trucks behind `{n} receipt dates`. */}
          {r.sessions.map((s) => (
            <div key={s.id} className="flex flex-wrap gap-3" data-testid={`inbound-expansion-receipt-${s.id}`}>
              <Link
                className="font-mono text-kit-blue-11 hover:underline"
                to={`/operation?${new URLSearchParams({ tab: "receiving", session: s.id })}`}
              >
                {s.doNumber ?? s.grnNo ?? "Receipt"}
              </Link>
              {s.grnNo && s.doNumber ? <span className="font-mono text-base-600">{s.grnNo}</span> : null}
              <span>Goods Received Date {s.receivedAt ? fmtDate(s.receivedAt) : "Date not recorded"}</span>
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

    </div>
  );
}
