import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  grnDateMonths,
  grnDateWeeks,
  receivingDisplayNo,
  receivingExtraQty,
  RECEIVING_CATEGORY_ROWS,
  warehouseReceiptTotals,
  type GrnReceivedWith,
  type WarehouseReceiptLine,
} from "@carres/shared";
import {
  useOperationGrnRegister,
  useOperationPos,
  useOperationSuppliers,
  useOperationWarehouse,
  useReceivingDuty,
  type operationPoListRow,
  type SupplierRow,
  type WarehouseReceiptQueueRow,
} from "@/lib/queries";
import { fmtDate, fmtDateShort, fmtMonth } from "@/lib/fmt-date";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { DateField } from "@/components/register/DateField";
import { REGISTER_FIELD_WIDTH } from "@/components/register/register-field-widths";
import {
  FilterRail,
  FilterRailExpandableRow,
  FilterRailGroup,
  FilterRailRow,
} from "./components/workspace-rail";
import GoodsMiniTable, {
  type GoodsMiniLine,
} from "./components/GoodsMiniTable";
import PoReceivingView from "./components/PoReceivingView";
import ReceivingRecord from "./components/ReceivingRecord";
import PurchasingTabs from "./PurchasingTabs";
import ArrivalSourceWorkspace from "./ArrivalSourceWorkspace";
// ⭐ HEADER PALETTE MATCHES THE PURCHASING REGISTERS (owner request 2026-09-15)
// — the same approved light slate blue-grey table header as SO Batch
// Purchase / Manual Purchase / Purchase Orders, so one colour means
// "section header" everywhere in Operations (manual-purchase-create.css).

/**
 * OperationReceiving — the ONE Receiving destination
 * (owner corrections 2026-09-06; owner rulings 2026-09-17 / 2026-09-18;
 * purchasing/MASTER.md §9.4; UI MASTER §6.7–§6.9; PURCHASING CARD 12).
 *
 * ```
 * My Work / Team Work   =  what staff must receive or review
 * Receiving             =  the complete GRN Register, beside its rail
 * ```
 *
 * ONE PAGE. No Receiving Monitor, no `Calendar View / GRN Register View`
 * switch, no permanent tabs, no second Receiving destination.
 *
 * THE REGISTER BOUNDARY: a row exists only once `Save Receiving` created the
 * GRN. A Warehouse count awaiting Carres action lives in My Work / Team Work
 * and deep-links (`?session=`) to its Receiving review; it never becomes a
 * Register row. Partial or completed RECEIPT PROGRESS belongs to the purchase
 * order, not to a GRN: a GRN is a document, and a document is not half saved.
 *
 * ⭐ NO DATE HAS TO BE CHOSEN TO SEE RECORDS (owner ruling 2026-09-18). The
 * page opens on every GRN the operator may see, newest first, server-paged.
 * The rail's `GRN date` group is an OPTIONAL narrowing, and its counts are
 * counts of GRN RECORDS — never outstanding work and never pieces of goods.
 *
 * THE RAIL — six groups, in the owner's order (§9.4, 2026-09-17). The month
 * Calendar is RETIRED; the expected-arrival view lives in Warehouse Arrival
 * Schedule.
 *
 *   GRN date          weeks · their days (the arrow opens, it never filters)
 *                     · months · `Choose dates…`
 *   Received with     `Damaged goods` · `Wrong items` · `Extra goods` — a
 *                     record of what was FOUND, and three OVERLAPPING counts
 *                     that are never added into a total
 *   Category · Goods arrived at · Supplier      the facts present in the set
 *   Cancelled GRNs    the last row
 *
 * One choice per group; pressing the chosen row again clears it. There is no
 * `Clear filters` button at the foot of the rail (owner correction
 * 2026-09-18) — the toolbar's active-condition chips clear what is on.
 *
 * THE REGISTER PAGINATES ON THE SERVER: `Showing 1–50 of {total}` with
 * Previous/Next — the browser never renders the whole history, and every
 * rail count is computed over the COMPLETE filtered result set by the one
 * shared arithmetic (`buildGrnRegisterView`, behind `?scope=grn`).
 *
 *   [Start Receiving]  →  Find PO or CO  →  pre-start object  →  Session
 *   `?session=` (Work) →  the count review (Save Receiving / Return count)
 *   a Register row     →  the formal GRN object (50/50, Amend / More ▾)
 *
 * THE REGISTER STAYS MOUNTED under an open object (`invisible`, never
 * display:none) so Back restores rail filters, search, sort and scroll — the
 * Manual Purchase / SO object law.
 *
 * No `Work` column, no owner avatar on rows, no local duty arithmetic: the
 * resolved GRN authority comes from the ONE shared resolver
 * (`useReceivingDuty` → 0425 `receiving_actor_context`), and it appears only
 * where an action needs it.
 */

// design-standard: not-a-list-page — the Receiving Register renders through
// the shared register DataGrid engine (UI MASTER §6.7), not ListPageShell.

/** Rows still owing goods — the Find PO or CO population. The search is
 *  CONTROLLED: the user must select an existing PO before starting Receiving
 *  (an unknown delivery never invents a source). */
function poStillOwes(po: operationPoListRow): boolean {
  if (po.status !== "open") return false;
  const lines = po.purchase_order_lines ?? [];
  return lines.some((l) => (l.received_qty ?? 0) < (l.qty ?? 0));
}

/** The three `Received with` rows, in the owner's order and words. */
const RECEIVED_WITH_ROWS: ReadonlyArray<{ key: GrnReceivedWith; label: string }> = [
  { key: "damaged", label: "Damaged goods" },
  { key: "wrong_item", label: "Wrong items" },
  { key: "extra", label: "Extra goods" },
];

/** `14 – 20 Sep` — the owner's own spelling, through the ONE date formatter;
 *  a week that crosses a month or a year prints both ends in full. */
function weekLabel(from: string, to: string): string {
  const left = fmtDateShort(from);
  const right = fmtDateShort(to);
  const sameTail = left.slice(left.indexOf(" ")) === right.slice(right.indexOf(" "));
  return sameTail
    ? `${left.slice(0, left.indexOf(" "))} – ${right}`
    : `${left} – ${right}`;
}

export default function OperationReceiving() {
  const [params, setParams] = useSearchParams();
  const sessionId = params.get("session");
  const poId = params.get("po");
  const arrivalId = params.get("arrival");
  const finding = params.get("find") === "1";

  const posQ = useOperationPos();
  const suppliersQ = useOperationSuppliers();
  const warehouseQ = useOperationWarehouse();
  const dutyQ = useReceivingDuty();

  const categorySel = params.get("category");
  const supplierSel = params.get("supplier");
  const siteSel = params.get("site");
  /** The `Received with` row that is on — a record of what was found. */
  const receivedRaw = params.get("received");
  const receivedSel: GrnReceivedWith | null = RECEIVED_WITH_ROWS.some(
    (r) => r.key === receivedRaw,
  )
    ? (receivedRaw as GrnReceivedWith)
    : null;
  /** The `GRN date` pick — a day, a week, a month and `Choose dates…` all
   *  arrive as the same inclusive pair, so the register has one date rule. */
  const fromSel = params.get("from");
  const toSel = params.get("to");
  const cancelledSel = params.get("cancelled") === "1";
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  /** `Choose dates…` opens its two fields in the rail; it is not a filter of
   *  its own until both ends are typed. */
  const [choosing, setChoosing] = useState(false);

  // A changed filter or search term starts the result set over — page 1.
  const filterKey = [
    categorySel,
    supplierSel,
    siteSel,
    receivedSel,
    fromSel,
    toSel,
    cancelledSel ? "1" : "",
    search,
  ].join("|");
  useEffect(() => {
    setOffset(0);
  }, [filterKey]);

  const registerQ = useOperationGrnRegister({
    offset,
    category: categorySel,
    supplier: supplierSel,
    site: siteSel,
    receivedWith: receivedSel,
    from: fromSel,
    to: toSel,
    cancelled: cancelledSel,
    q: search,
  });

  const rows = useMemo(
    () => registerQ.data?.receipts ?? [],
    [registerQ.data],
  );
  const page = registerQ.data?.page ?? { offset: 0, limit: 50, total: 0 };
  const facets = registerQ.data?.facets ?? {
    category: {},
    supplier: {},
    site: {},
    grnDate: {},
    receivedWith: { damaged: 0, wrong_item: 0, extra: 0 },
    cancelled: 0,
  };
  /** The GRN document's own item words and governed categories, resolved by
   *  the server for this page — the SAME two facts the official GRN prints. */
  const lineInfo = registerQ.data?.line_info ?? {};

  const suppliers = useMemo(
    () => suppliersQ.data?.suppliers ?? [],
    [suppliersQ.data],
  ) as SupplierRow[];
  const warehouses = useMemo(
    () => warehouseQ.data?.warehouses ?? [],
    [warehouseQ.data],
  );
  const pos = useMemo(() => posQ.data?.pos ?? [], [posQ.data]);
  const supplierById = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  );

  function setFacet(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null || next.get(key) === value) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  /** One `GRN date` choice, whatever shape it was pressed in. Pressing the
   *  same range again clears it — the rail's own rule, every group. */
  function setGrnDate(from: string | null, to: string | null) {
    const next = new URLSearchParams(params);
    const same = params.get("from") === from && params.get("to") === to;
    next.delete("from");
    next.delete("to");
    if (!same && from && to) {
      next.set("from", from);
      next.set("to", to);
    }
    setParams(next, { replace: true });
  }

  const RAIL_KEYS = ["category", "supplier", "site", "received", "from", "to", "cancelled"];
  function clearRail() {
    const next = new URLSearchParams(params);
    for (const key of RAIL_KEYS) next.delete(key);
    setParams(next, { replace: true });
    setChoosing(false);
  }

  /** The rail's date ladder, folded from the SERVER's complete day counts —
   *  so a week's number is the truth about the whole filtered set. */
  const weeks = useMemo(() => grnDateWeeks(facets.grnDate), [facets.grnDate]);
  const months = useMemo(() => grnDateMonths(facets.grnDate), [facets.grnDate]);
  const dateChosen = Boolean(fromSel && toSel);

  /** Only the governed rows PRESENT in the result set appear (owner
   *  correction 2026-09-06) — plus the active pick, so a row narrowed to
   *  zero elsewhere can still be cleared. Ladder order always. */
  const categoryRows = useMemo(
    () =>
      RECEIVING_CATEGORY_ROWS.filter(
        (w) => (facets.category[w] ?? 0) > 0 || categorySel === w,
      ),
    [facets.category, categorySel],
  );
  const supplierNames = useMemo(() => {
    const names = new Set(Object.keys(facets.supplier));
    if (supplierSel) names.add(supplierSel);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [facets.supplier, supplierSel]);
  const siteNames = useMemo(() => {
    const names = new Set(Object.keys(facets.site));
    if (siteSel) names.add(siteSel);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [facets.site, siteSel]);

  /**
   * ⭐ THE APPROVED REGISTER COLUMNS — owner ruling 2026-09-18, in this order
   * and no other (`purchasing/MASTER.md` §9.4):
   *
   * ```
   * GRN Date · GRN No · SO No / MPR No / CO No / RO No · PO No · Supplier ·
   * Supplier Deliver To · Goods arrived at · Supplier Confirmed Delivery Date ·
   * Goods Received Date · Supplier DO No. · Items · Received Qty ·
   * Damaged Qty · Wrong Item Qty · Extra Qty
   * ```
   *
   * THERE IS NO `Status` COLUMN. A normal GRN shows no status label at all;
   * a cancelled one says `Cancelled` under its own number, which is where a
   * person reading the number is already looking. `Valid` is retired, and
   * `Posted`/`Voided` are database words that never reach this screen.
   *
   * Every width comes from the ONE shared registry (UI MASTER §6.8) — the
   * same field is the same width on SO Batch, Manual Purchase, Purchase
   * Orders and here, and a width that fails validation is fixed there rather
   * than nudged on the page that noticed.
   */
  const columns: DataGridColumn<WarehouseReceiptQueueRow>[] = useMemo(
    () => [
      {
        key: "grnDate",
        label: "GRN Date",
        width: REGISTER_FIELD_WIDTH.date,
        sortable: true,
        /* CREATION — when `Save Receiving` made this document. Never inferred
           from the physical arrival date, and never the other way round. */
        searchValue: (r) => r.grn_date ?? "",
        exportValue: (r) => (r.grn_date ? fmtDate(r.grn_date) : ""),
        filterType: "date",
        dateValue: (r) => r.grn_date ?? null,
        sortFn: (a, b) => (a.grn_date ?? "").localeCompare(b.grn_date ?? ""),
        accessor: (r) =>
          r.grn_date ? (
            <span className="tabular-nums text-body text-base-900">
              {fmtDate(r.grn_date)}
            </span>
          ) : (
            <span className="text-body text-kit-slate-11">Not recorded</span>
          ),
      },
      {
        key: "grn",
        label: "GRN No",
        width: REGISTER_FIELD_WIDTH.documentNo,
        sortable: true,
        /* Every Register row IS a GRN (the boundary above) — the formal
           number exists by construction (purchasing/MASTER.md §7.3). */
        searchValue: (r) => receivingDisplayNo(r),
        exportValue: (r) =>
          r.status === "voided"
            ? `${receivingDisplayNo(r)} · Cancelled`
            : receivingDisplayNo(r),
        accessor: (r) => (
          <span className="flex flex-col">
            <span className="font-mono text-meta text-base-900">
              {receivingDisplayNo(r)}
            </span>
            {r.status === "voided" && (
              /* The ONE place a GRN's document status is said — under its own
                 number, and only when it is cancelled (owner ruling
                 2026-09-17). */
              <span
                className="text-label text-kit-red-11"
                data-testid={`grn-cancelled-${r.id}`}
              >
                Cancelled
              </span>
            )}
          </span>
        ),
      },
      {
        key: "source",
        label: "SO No / MPR No / CO No / RO No",
        headerLines: ["SO No / MPR No", "CO No / RO No"],
        width: REGISTER_FIELD_WIDTH.mixedReferenceFourWay,
        sortable: true,
        /* The receipt's ACTUAL linked documents — every one it has, blank when
           it has none. No word stands in for a missing number, and no PO is
           invented for a receipt that came back through an arrival source. */
        searchValue: (r) => (r.source_refs ?? []).join(" "),
        exportValue: (r) => (r.source_refs ?? []).join(" · "),
        sortFn: (a, b) =>
          (a.source_refs?.[0] ?? "").localeCompare(b.source_refs?.[0] ?? ""),
        accessor: (r) => (
          <span className="flex flex-col">
            {(r.source_refs ?? []).map((ref) => (
              <span key={ref} className="font-mono text-meta text-base-900">
                {ref}
              </span>
            ))}
          </span>
        ),
      },
      {
        key: "po",
        label: "PO No",
        width: REGISTER_FIELD_WIDTH.documentNo,
        sortable: true,
        /* Its own column, and blank for a CO or RO receipt that has no
           purchase order — an absence, never a borrowed number. */
        searchValue: (r) => r.po_id ?? "",
        exportValue: (r) => r.po_id ?? "",
        accessor: (r) => (
          <span className="font-mono text-meta text-base-900">{r.po_id ?? ""}</span>
        ),
      },
      {
        key: "supplier",
        label: "Supplier",
        width: REGISTER_FIELD_WIDTH.supplier,
        sortable: true,
        searchValue: (r) => r.supplier_name ?? "",
        exportValue: (r) => r.supplier_name ?? "",
        overflowText: (r) => r.supplier_name ?? "",
        accessor: (r) => (
          <span className="truncate text-body text-base-900">
            {r.supplier_name ?? ""}
          </span>
        ),
      },
      {
        key: "deliverTo",
        label: "Supplier Deliver To",
        headerLines: ["Supplier", "Deliver To"],
        width: REGISTER_FIELD_WIDTH.supplierDeliverTo,
        sortable: true,
        /* Where the PO INSTRUCTED the supplier to deliver. It is never
           overwritten by where the goods actually landed. */
        searchValue: (r) => r.warehouse_name ?? "",
        exportValue: (r) => r.warehouse_name ?? "",
        overflowText: (r) => r.warehouse_name ?? "",
        accessor: (r) => (
          <span className="truncate text-body text-base-900">
            {r.warehouse_name ?? ""}
          </span>
        ),
      },
      {
        key: "actualSite",
        label: "Goods arrived at",
        headerLines: ["Goods", "arrived at"],
        width: REGISTER_FIELD_WIDTH.goodsArrivedAt,
        sortable: true,
        searchValue: (r) => r.actual_site_name ?? r.warehouse_name ?? "",
        exportValue: (r) => r.actual_site_name ?? r.warehouse_name ?? "",
        accessor: (r) =>
          r.actual_site_name && r.actual_site_name !== r.warehouse_name ? (
            /* The physical truth, preserved BESIDE the instruction — never
               overwriting `Supplier Deliver To` (owner correction 2026-09-06).
               Amber only when the goods landed somewhere other than
               instructed. */
            <span className="truncate text-body text-kit-amber-11">
              {r.actual_site_name}
            </span>
          ) : (
            <span className="truncate text-body text-base-900">
              {r.actual_site_name ?? r.warehouse_name ?? ""}
            </span>
          ),
      },
      {
        key: "supplierConfirmedDeliveryDate",
        label: "Supplier Confirmed Delivery Date",
        headerLines: ["Supplier Confirmed", "Delivery Date"],
        width: REGISTER_FIELD_WIDTH.supplierConfirmedDeliveryDate,
        sortable: true,
        /* The linked PO's governed supplier answer (`poSupplierDeliveryDateOf`,
           server-resolved) — the SAME word the Purchase Orders register uses.
           `Not confirmed` while the supplier has not evidenced one. */
        searchValue: (r) => r.supplier_delivery_date ?? "Not confirmed",
        exportValue: (r) =>
          r.supplier_delivery_date
            ? fmtDate(r.supplier_delivery_date)
            : "Not confirmed",
        filterType: "date",
        dateValue: (r) => r.supplier_delivery_date,
        sortFn: (a, b) =>
          (a.supplier_delivery_date ?? "").localeCompare(
            b.supplier_delivery_date ?? "",
          ),
        accessor: (r) =>
          r.supplier_delivery_date ? (
            <span className="tabular-nums text-body text-base-900">
              {fmtDate(r.supplier_delivery_date)}
            </span>
          ) : (
            <span className="text-body text-kit-slate-11">Not confirmed</span>
          ),
      },
      {
        key: "receivedAt",
        label: "Goods Received Date",
        headerLines: ["Goods Received", "Date"],
        width: REGISTER_FIELD_WIDTH.goodsReceivedDate,
        sortable: true,
        searchValue: (r) => r.goods_received_at ?? "",
        exportValue: (r) =>
          r.goods_received_at ? fmtDate(r.goods_received_at) : "",
        /* The table's date column OWNS detailed date filtering (owner
           correction 2026-09-06) — the rail's date group is the GRN's
           creation date, which is a different fact. */
        filterType: "date",
        dateValue: (r) => r.goods_received_at,
        sortFn: (a, b) =>
          (a.goods_received_at ?? "").localeCompare(b.goods_received_at ?? ""),
        accessor: (r) => (
          <span className="tabular-nums text-body text-base-900">
            {r.goods_received_at ? fmtDate(r.goods_received_at) : ""}
          </span>
        ),
      },
      {
        key: "doNo",
        label: "Supplier DO No.",
        headerLines: ["Supplier", "DO No."],
        width: REGISTER_FIELD_WIDTH.supplierDoNo,
        sortable: true,
        searchValue: (r) => r.do_number ?? "",
        exportValue: (r) => r.do_number ?? "",
        accessor: (r) => (
          <span className="font-mono text-meta text-base-900">
            {r.do_number}
          </span>
        ),
      },
      {
        key: "items",
        label: "Items",
        width: REGISTER_FIELD_WIDTH.items,
        sortable: true,
        /* The GRN PAPER's own line words (`product_skus.variant`, else the
           SKU — server-resolved), first label plus a truthful `+n`. The exact
           item-by-item truth is one disclosure away, in the expansion. */
        searchValue: (r) => (r.product_labels ?? []).join(" "),
        exportValue: (r) => (r.product_labels ?? []).join(" · "),
        accessor: (r) => {
          const labels = r.product_labels ?? [];
          const text =
            labels.length === 0
              ? ""
              : labels.length === 1
                ? labels[0]!
                : `${labels[0]} +${labels.length - 1}`;
          return (
            <span
              className="truncate text-body text-base-900"
              title={labels.join(" · ")}
            >
              {text}
            </span>
          );
        },
      },
      {
        key: "receivedQty",
        label: "Received Qty",
        headerLines: ["Received", "Qty"],
        width: REGISTER_FIELD_WIDTH.receiptQty,
        align: "right",
        sortable: true,
        searchValue: () => "",
        exportValue: (r) =>
          String(
            warehouseReceiptTotals(r.lines as WarehouseReceiptLine[]).received,
          ),
        accessor: (r) => (
          <span className="tabular-nums text-body text-base-900">
            {warehouseReceiptTotals(r.lines as WarehouseReceiptLine[]).received}
          </span>
        ),
      },
      {
        key: "damagedQty",
        label: "Damaged Qty",
        headerLines: ["Damaged", "Qty"],
        width: REGISTER_FIELD_WIDTH.receiptQty,
        align: "right",
        sortable: true,
        searchValue: () => "",
        exportValue: (r) =>
          String(
            warehouseReceiptTotals(r.lines as WarehouseReceiptLine[]).damaged,
          ),
        accessor: (r) => {
          const n = warehouseReceiptTotals(
            r.lines as WarehouseReceiptLine[],
          ).damaged;
          return (
            <span
              className={
                n > 0
                  ? "tabular-nums text-body text-kit-red-11"
                  : "tabular-nums text-body text-base-500"
              }
            >
              {n}
            </span>
          );
        },
      },
      {
        key: "wrongQty",
        label: "Wrong Item Qty",
        headerLines: ["Wrong Item", "Qty"],
        width: REGISTER_FIELD_WIDTH.receiptQty,
        align: "right",
        sortable: true,
        searchValue: () => "",
        exportValue: (r) =>
          String(
            warehouseReceiptTotals(r.lines as WarehouseReceiptLine[]).wrongItem,
          ),
        accessor: (r) => {
          const n = warehouseReceiptTotals(
            r.lines as WarehouseReceiptLine[],
          ).wrongItem;
          return (
            <span
              className={
                n > 0
                  ? "tabular-nums text-body text-kit-red-11"
                  : "tabular-nums text-body text-base-500"
              }
            >
              {n}
            </span>
          );
        },
      },
      {
        key: "extraQty",
        label: "Extra Qty",
        headerLines: ["Extra", "Qty"],
        width: REGISTER_FIELD_WIDTH.receiptQty,
        align: "right",
        sortable: true,
        searchValue: () => "",
        exportValue: (r) => String(receivingExtraQty(r.extra_lines)),
        accessor: (r) => {
          const n = receivingExtraQty(r.extra_lines);
          return (
            <span
              className={
                n > 0
                  ? "tabular-nums text-body text-kit-amber-11"
                  : "tabular-nums text-body text-base-500"
              }
            >
              {n}
            </span>
          );
        },
      },
    ],
    [],
  );

  const narrowed =
    categorySel !== null ||
    supplierSel !== null ||
    siteSel !== null ||
    receivedSel !== null ||
    dateChosen ||
    cancelledSel;

  /**
   * ⭐ THE ACTIVE CONDITIONS LIVE IN THE TOOLBAR — owner correction 2026-09-18.
   *
   * The rail lost its permanent `Clear filters` button: a control that is
   * dead most of the time still costs a row at the foot of every group, and
   * the chips above the table already say WHAT is on as well as clearing it.
   * Pressing a chosen rail row again still clears that one group.
   */
  const activeConditions = [
    ...(dateChosen
      ? [
          {
            key: "grnDate",
            label: `GRN date: ${
              fromSel === toSel
                ? fmtDateShort(fromSel)
                : weekLabel(fromSel!, toSel!)
            }`,
            onClear: () => setGrnDate(null, null),
          },
        ]
      : []),
    ...(receivedSel
      ? [
          {
            key: "received",
            label: `Received with: ${
              RECEIVED_WITH_ROWS.find((r) => r.key === receivedSel)!.label
            }`,
            onClear: () => setFacet("received", null),
          },
        ]
      : []),
    ...(categorySel
      ? [
          {
            key: "category",
            label: `Category: ${categorySel}`,
            onClear: () => setFacet("category", null),
          },
        ]
      : []),
    ...(siteSel
      ? [
          {
            key: "site",
            label: `Goods arrived at: ${siteSel}`,
            onClear: () => setFacet("site", null),
          },
        ]
      : []),
    ...(supplierSel
      ? [
          {
            key: "supplier",
            label: `Supplier: ${supplierSel}`,
            onClear: () => setFacet("supplier", null),
          },
        ]
      : []),
    ...(cancelledSel
      ? [
          {
            key: "cancelled",
            label: "Cancelled GRNs",
            onClear: () => setFacet("cancelled", null),
          },
        ]
      : []),
  ];

  /**
   * ⭐ THE READ-ONLY GOODS EXPANSION — approved 2026-09-18 (§9.4, CARD 12).
   *
   * One row per received line, in the owner's order, built from the SAME
   * receipt facts the official GRN document prints: the governed category,
   * the paper's own item word, the line's bound Unit IDs and the five
   * quantity words. Extra goods keep their own rows — they were never on the
   * order, they never enter Inventory, and they are not quietly folded into a
   * received line.
   *
   * It BUYS NOTHING. No checkbox, no `Ready Stock`, no reservation control.
   */
  function expansionLines(r: WarehouseReceiptQueueRow): GoodsMiniLine[] {
    const sourceNo = r.po_id ?? r.source_refs?.[0] ?? null;
    const unitsByLine = r.unit_ids_by_line;
    const wordsFor = (sku: string) => lineInfo[sku];
    const received = (r.lines ?? []).map((line): GoodsMiniLine => {
      const words = wordsFor(line.sku);
      const units = unitsByLine ? (unitsByLine[line.id] ?? []) : [];
      return {
        key: line.id,
        category: words?.category ?? "",
        unitIds: units,
        /* FIVE answers, never one (COPY-STANDARD): a failed read says so, and
           a line whose stock is counted rather than individually tracked says
           `Counted stock` — the technical register key is never a Unit ID. */
        unitAbsence: unitsByLine == null ? "Could not be loaded" : "Counted stock",
        deliverTo: r.warehouse_name ? [r.warehouse_name] : [],
        deliverToAbsence: "Not recorded",
        supplier: r.supplier_name ?? undefined,
        supplierAbsence: "No supplier yet",
        sourceNo: sourceNo ?? undefined,
        sku: line.sku,
        qty: line.received_now,
        item: words?.description ?? line.sku,
        itemDetail: words?.description ? line.sku : undefined,
        receivedQty: line.received_now,
        damagedQty: line.damaged_qty,
        wrongItemQty: line.wrong_item_qty,
        /* An ordered line has no extra quantity — an absence, not a zero. */
        extraQty: null,
        selectable: false,
        testId: `grn-line-${line.id}`,
      };
    });
    const extra = (r.extra_lines ?? []).map((x, i): GoodsMiniLine => {
      const words = wordsFor(x.sku);
      return {
        key: `extra-${i}-${x.sku}`,
        category: words?.category ?? "",
        unitIds: [],
        /* Extra goods never enter Inventory, so they never become a Unit. */
        unitAbsence: "—",
        deliverTo: r.warehouse_name ? [r.warehouse_name] : [],
        deliverToAbsence: "Not recorded",
        supplier: r.supplier_name ?? undefined,
        supplierAbsence: "No supplier yet",
        sourceNo: undefined,
        /* Extra goods were on no order — the source cell says so rather than
           borrowing the purchase order they did not come on. */
        sourceNoAbsence: "Extra goods",
        sku: x.sku,
        qty: x.qty,
        item: words?.description ?? x.sku,
        itemDetail: words?.description ? x.sku : undefined,
        receivedQty: null,
        damagedQty: null,
        wrongItemQty: null,
        extraQty: x.qty,
        selectable: false,
        testId: `grn-extra-${i}`,
      };
    });
    return [...received, ...extra];
  }

  const openObject = arrivalId ?? sessionId ?? poId ?? (finding ? "find" : null);

  function openSession(id: string) {
    const next = new URLSearchParams(params);
    next.delete("arrival");
    next.delete("po");
    next.delete("find");
    next.set("session", id);
    setParams(next);
  }
  function closeObject() {
    const next = new URLSearchParams(params);
    next.delete("arrival");
    next.delete("session");
    next.delete("po");
    next.delete("find");
    setParams(next);
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-kit-canvas text-kit-slate-12"
      data-testid="receiving-page"
    >
      <PurchasingTabs />

      {/* ── The open object takes the stage; the Register stays MOUNTED
             underneath (`invisible`, never display:none) so Back restores the
             complete listing state. ─────────────────────────────────────── */}
      {arrivalId ? (
        <ArrivalSourceWorkspace receiving sourceId={arrivalId} />
      ) : sessionId ? (
        <ReceivingRecord sessionId={sessionId} onBack={closeObject} />
      ) : poId ? (
        <PoReceivingView
          poId={poId}
          pos={pos}
          suppliers={supplierById}
          warehouses={warehouses}
          dutyAllowed={dutyQ.data?.allowed ?? false}
          dutyKnown={!dutyQ.isLoading}
          backLabel="Receiving"
          onBack={closeObject}
          onOpenSession={openSession}
        />
      ) : finding ? (
        <FindPoView
          pos={pos}
          suppliers={supplierById}
          loading={posQ.isLoading}
          onBack={closeObject}
          onPick={(id) => {
            const next = new URLSearchParams(params);
            next.delete("find");
            next.set("po", id);
            setParams(next);
          }}
        />
      ) : null}

      <div
        className={[
          "flex min-h-0 flex-1 gap-0 p-2",
          openObject ? "invisible h-0 flex-none overflow-hidden p-0" : "",
        ].join(" ")}
        data-testid="receiving-register"
      >
        <FilterRail testId="receiving-rail">
          {/* ── GRN date — weeks, their days, months, and Choose dates… ─────
              The date is the GRN's CREATION date. Nothing has to be chosen to
              see records: this group NARROWS a listing that is already
              complete. The arrow beside a week only opens it; pressing a
              week, a month or a day is what filters. Only periods that HAVE
              GRNs are listed — Sunday included, because a GRN can be created
              on one. Every count is a count of GRN RECORDS. */}
          <FilterRailGroup title="GRN date" icon="date">
            {weeks.map((w) => (
              <FilterRailExpandableRow
                key={w.from}
                label={weekLabel(w.from, w.to)}
                count={w.count}
                active={fromSel === w.from && toSel === w.to}
                onClick={() => setGrnDate(w.from, w.to)}
                expandLabel={`Show the days in ${weekLabel(w.from, w.to)}`}
                testId={`rail-grn-week-${w.from}`}
              >
                {w.days.map((d) => (
                  <FilterRailRow
                    key={d.iso}
                    label={fmtDateShort(d.iso)}
                    count={d.count}
                    active={fromSel === d.iso && toSel === d.iso}
                    onClick={() => setGrnDate(d.iso, d.iso)}
                    testId={`rail-grn-day-${d.iso}`}
                  />
                ))}
              </FilterRailExpandableRow>
            ))}
            {months.map((m) => (
              <FilterRailRow
                key={m.period}
                label={fmtMonth(m.period)}
                count={m.count}
                active={fromSel === m.from && toSel === m.to}
                onClick={() => setGrnDate(m.from, m.to)}
                testId={`rail-grn-month-${m.period}`}
              />
            ))}
            <FilterRailRow
              label="Choose dates…"
              active={false}
              onClick={() => setChoosing((v) => !v)}
              testId="rail-grn-choose"
            />
            {choosing && (
              /* Two real fields, both labelled: a range is not a filter until
                 both ends exist, so nothing narrows while one is being
                 typed. */
              <div
                className="flex flex-col gap-1 px-2 pb-1"
                data-testid="rail-grn-range"
              >
                <span className="text-label text-kit-slate-11">From</span>
                <DateField
                  aria-label="GRN date from"
                  value={fromSel ?? ""}
                  fullWidth
                  onChange={(iso) =>
                    setGrnDate(iso || null, toSel ?? (iso || null))
                  }
                />
                <span className="text-label text-kit-slate-11">To</span>
                <DateField
                  aria-label="GRN date to"
                  value={toSel ?? ""}
                  fullWidth
                  onChange={(iso) =>
                    setGrnDate(fromSel ?? (iso || null), iso || null)
                  }
                />
              </div>
            )}
          </FilterRailGroup>

          {/* ── Received with — a RECORD of what was found at receiving, not
              a to-do list. Counted by GRN, and a GRN that carries two of them
              appears in two rows: these three numbers OVERLAP and may never
              be added into a total. */}
          <FilterRailGroup title="Received with" icon="goods">
            {RECEIVED_WITH_ROWS.map((row) => (
              <FilterRailRow
                key={row.key}
                label={row.label}
                count={facets.receivedWith[row.key] ?? 0}
                active={receivedSel === row.key}
                onClick={() => setFacet("received", row.key)}
                testId={`rail-received-${row.key}`}
              />
            ))}
          </FilterRailGroup>

          {/* Only the governed category rows PRESENT in the result set, in
              the shared ladder's order — no `Any`, no `All …`, no invented
              category. Counts speak for the COMPLETE filtered result set;
              re-clicking the active row clears the section. */}
          <FilterRailGroup title="Category" icon="goods">
            {categoryRows.map((word) => (
              <FilterRailRow
                key={word}
                label={word}
                count={facets.category[word] ?? 0}
                active={categorySel === word}
                onClick={() => setFacet("category", word)}
                testId={`rail-category-${word}`}
              />
            ))}
          </FilterRailGroup>

          {/* The receiving locations actually present in the records —
              where the goods PHYSICALLY arrived. */}
          <FilterRailGroup title="Goods arrived at" icon="warehouse">
            {siteNames.map((name) => (
              <FilterRailRow
                key={name}
                label={name}
                count={facets.site[name] ?? 0}
                active={siteSel === name}
                onClick={() => setFacet("site", name)}
                testId={`rail-site-${name}`}
              />
            ))}
          </FilterRailGroup>

          {/* The suppliers actually present in Receiving records. */}
          <FilterRailGroup title="Supplier" icon="supplier">
            {supplierNames.map((name) => (
              <FilterRailRow
                key={name}
                label={name}
                count={facets.supplier[name] ?? 0}
                active={supplierSel === name}
                onClick={() => setFacet("supplier", name)}
                testId={`rail-supplier-${name}`}
              />
            ))}
          </FilterRailGroup>

          {/* The last ROW, not a group of one: a cancelled GRN keeps its row
              and its number in the register forever, and this narrows to
              them. There is no `Clear filters` button beneath it. */}
          <div className="border-t border-kit-slate-5 py-2">
            <FilterRailRow
              label="Cancelled GRNs"
              count={facets.cancelled}
              active={cancelledSel}
              onClick={() => setFacet("cancelled", cancelledSel ? null : "1")}
              testId="rail-cancelled"
            />
          </div>
        </FilterRail>

        <div className="flex min-h-0 flex-1 flex-col pl-2" data-testid="receiving-register-column">
          {registerQ.isError ? (
            /* A failure sentence is never the empty sentence (COPY-STANDARD
               2026-08-28): what broke, then the act that fixes it. */
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white">
              <p className="text-body text-base-700">
                Receiving could not be opened
              </p>
              <button
                type="button"
                className="rounded-control border border-base-200 bg-white px-3 py-1.5 text-meta font-medium text-base-700 hover:bg-hovertint"
                onClick={() => void registerQ.refetch()}
              >
                Try again
              </button>
            </div>
          ) : (
            <DataGrid<WarehouseReceiptQueueRow>
              appearance="reference"
              rows={rows}
              columns={columns}
              /* v2 — the approved sixteen-column, date-first register
                 replaces v1's eleven, so a saved v1 layout cannot pin a
                 column that no longer exists. */
              storageKey="carres.receiving.register.v2"
              rowKey={(r) => r.id}
              exportName="Receiving"
              searchPlaceholder="GRN, PO, supplier or DO number…"
              isLoading={registerQ.isLoading}
              onSearchChange={setSearch}
              /* GRN Date and GRN No lead and pin at a canvas ≥768px; below it
                 the number pins alone. No column is hidden by width. */
              leadingColumns={{ date: "grnDate", identity: "grn" }}
              activeConditions={activeConditions}
              onClearConditions={clearRail}
              groupBanner={false}
              /* Receiving is UNGROUPED — one sticky header, no business
                 groups. The group-local header pattern applies to registers
                 that HAVE groups; inventing GRN groups to use it would be a
                 regression. */
              expandTitle="Show goods"
              expandable={{
                flush: true,
                alignToColumn: "grnDate",
                testId: (r) => `grn-expand-${r.id}`,
                renderExpansion: (r) => (
                  <div className="px-2 py-3" data-testid={`grn-goods-${r.id}`}>
                    <GoodsMiniTable
                      label={`Goods on ${receivingDisplayNo(r)}`}
                      lines={expansionLines(r)}
                      receivingLayout
                      deliverToHeading="Supplier Deliver To"
                      itemHeading="Items"
                    />
                  </div>
                ),
              }}
              onRowClick={(r) => openSession(r.id)}
              toolbarStart={
                <button
                  type="button"
                  data-testid="start-receiving-door"
                  onClick={() => {
                    // A PUSH, not a replace — Back from the Find step returns
                    // to the Register, the same way an open object does.
                    const next = new URLSearchParams(params);
                    next.set("find", "1");
                    setParams(next);
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-kit-blue-9 px-3 text-body font-medium text-white hover:brightness-95"
                >
                  Start Receiving
                </button>
              }
              emptyMessage={
                !narrowed && search.trim() === ""
                  ? // The record is what is empty — never "the goods have not
                    // come" (Jess, 2026-08-03).
                    "No receiving activity yet."
                  : "No receiving matches these filters."
              }
              statusSummary={() => {
                /* SERVER-SIDE PAGINATION (owner correction 2026-09-06):
                   `Showing 1–50 of 10,000` speaks for the WHOLE filtered
                   result set; Previous/Next move one server page. */
                const from = page.total === 0 ? 0 : page.offset + 1;
                const to = Math.min(page.offset + page.limit, page.total);
                return (
                  <span className="flex items-center gap-3">
                    <span data-testid="grn-page-range" className="truncate">
                      Showing {from}–{to} of {page.total}
                    </span>
                    <button
                      type="button"
                      data-testid="grn-page-previous"
                      disabled={page.offset === 0}
                      onClick={() =>
                        setOffset(Math.max(0, offset - page.limit))
                      }
                      className="rounded-control border border-kit-slate-5 bg-white px-2 py-0.5 text-meta text-kit-slate-11 hover:bg-kit-slate-3 disabled:text-kit-slate-11 disabled:bg-kit-slate-2 disabled:hover:bg-kit-slate-2"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      data-testid="grn-page-next"
                      disabled={to >= page.total}
                      onClick={() => setOffset(offset + page.limit)}
                      className="rounded-control border border-kit-slate-5 bg-white px-2 py-0.5 text-meta text-kit-slate-11 hover:bg-kit-slate-3 disabled:text-kit-slate-11 disabled:bg-kit-slate-2 disabled:hover:bg-kit-slate-2"
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

/* ── Find PO or CO — the controlled entrance ─────────────────────────────── */

function FindPoView({
  pos,
  suppliers,
  loading,
  onBack,
  onPick,
}: {
  pos: operationPoListRow[];
  suppliers: Map<string, SupplierRow>;
  loading: boolean;
  onBack: () => void;
  onPick: (poId: string) => void;
}) {
  const [q, setQ] = useState("");
  const candidates = useMemo(() => {
    const owing = pos.filter(poStillOwes);
    const needle = q.trim().toLowerCase();
    if (!needle) return owing;
    return owing.filter((p) => {
      const sup = suppliers.get(p.supplier_id)?.name ?? p.supplier_id;
      return (
        p.id.toLowerCase().includes(needle) ||
        sup.toLowerCase().includes(needle)
      );
    });
  }, [pos, suppliers, q]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white p-4" data-testid="receiving-find-po">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          data-testid="receiving-find-back"
          className="text-body text-kit-blue-11 hover:underline"
        >
          ‹ Receiving
        </button>
      </div>
      <h2 className="mt-2 text-strong text-base-900">Find PO or CO</h2>
      <p className="mt-1 text-meta text-base-500">
        Receiving starts from the exact source. Choose the purchase order the
        goods belong to.
      </p>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Find PO or CO"
        placeholder="PO number or supplier…"
        data-testid="receiving-find-input"
        className="mt-3 h-9 w-full max-w-md rounded-control border border-kit-slate-5 bg-white px-3 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
      />
      <div className="mt-3 flex max-w-3xl flex-col divide-y divide-kit-slate-4">
        {loading ? (
          <p className="py-3 text-meta text-base-500">Opening the purchase orders…</p>
        ) : candidates.length === 0 ? (
          <p className="py-3 text-meta text-base-500" data-testid="receiving-find-empty">
            {q.trim() === ""
              ? "No supplier delivery is ready to receive."
              : "No open purchase order matches. Check the number with Purchasing — an unknown delivery never invents a source."}
          </p>
        ) : (
          candidates.map((p) => {
            const sup = suppliers.get(p.supplier_id)?.name ?? p.supplier_id;
            const lines = p.purchase_order_lines ?? [];
            const pending = lines.reduce(
              (n, l) => n + Math.max(0, (l.qty ?? 0) - (l.received_qty ?? 0)),
              0,
            );
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p.id)}
                data-testid={`receiving-find-${p.id}`}
                className="flex items-center gap-3 py-2.5 text-left hover:bg-kit-slate-3"
              >
                <span className="w-44 shrink-0 font-mono text-meta text-base-900">
                  {p.id}
                </span>
                <span className="min-w-0 flex-1 truncate text-body text-base-900">
                  {sup}
                </span>
                <span className="shrink-0 tabular-nums text-meta text-base-500">
                  {pending} pending delivery
                </span>
                {p.eta_date ? (
                  <span className="shrink-0 tabular-nums text-meta text-base-500">
                    {fmtDateShort(p.eta_date)}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

