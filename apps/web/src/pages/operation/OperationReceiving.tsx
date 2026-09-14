import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PanelLeftOpen } from "lucide-react";
import {
  expectedArrivalCounts,
  grnExceptionFacts,
  grnExceptionSummary,
  grnLineName,
  receivingDisplayNo,
  receivingExtraQty,
  RECEIVING_CATEGORY_ROWS,
  warehouseReceiptStatusLabel,
  warehouseReceiptTotals,
  type ReceivingExtraLine,
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
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import MonthCalendar from "@/components/kit/MonthCalendar";
import {
  FilterRail,
  FilterRailGroup,
  FilterRailRow,
} from "./components/workspace-rail";
import GoodsMiniTable, { type GoodsMiniLine } from "./components/GoodsMiniTable";
import {
  ExceptionEvidenceDoors,
  ExceptionEvidenceViewer,
  type EvidenceScope,
} from "./components/ExceptionEvidence";
import ReceivingWorkspace from "./components/ReceivingWorkspace";
import ReceivingRecord from "./components/ReceivingRecord";
import PurchasingTabs from "./PurchasingTabs";
import ArrivalSourceWorkspace from "./ArrivalSourceWorkspace";

/**
 * OperationReceiving — the ONE Receiving destination
 * (owner instruction 2026-09-13, superseding the 2026-09-06 corrections where
 * they differ; purchasing/MASTER.md §9.4; UI MASTER §6.7).
 *
 * ```
 * My Work / Team Work   =  what staff must receive or review
 * Receiving             =  the complete GRN Register, beside its rail
 * ```
 *
 * ONE PAGE. No Receiving Monitor, no view switch, no permanent tabs, no KPI
 * cards, no duplicate headings. Left: the 240px filter rail — the two-month
 * EXPECTED-ARRIVAL display on top (current month + next, display-only, counts
 * never colour alone, today a thin outline; it filters nothing and hides no
 * historical GRN), then only the facet groups that can still narrow the
 * result. Right: always the complete GRN Register.
 *
 * THE REGISTER BOUNDARY: a row exists only once `Save Receiving` created the
 * GRN — the Register lists `Confirmed` and `Cancelled` GRNs, nothing else. A
 * Warehouse count awaiting Carres action lives in My Work / Team Work and
 * deep-links (`?session=`) to its Receiving review.
 *
 * DEFAULT COLUMNS, in this order and no other:
 *   ▸ · GRN No · GRN Date · Supplier DO No · Supplier · PO No · Items ·
 *   Received Qty · Exceptions · GRN Status
 * Every other fact is a governed OPTIONAL column (Columns) or lives in the
 * expansion / the GRN object. `GRN Date` is the posting's date (the document's
 * birth, MYT) — never parsed from the number; `Goods received on` stays its own
 * optional column. `Received Qty` is the good count only.
 *
 * ▸ EXPANDS to this GRN's own counted lines — `Item · Received · Damaged ·
 * Wrong Item · Extra` in the shared child table — never the whole PO. `Item`
 * is the goods' FULL name (`grnLineName`: the posting-time snapshot, else the
 * current catalog — flagged — else the SKU; never the variant alone) with its
 * configuration. A positive exception carries its own Photos / Videos doors.
 *
 * TOOLBAR: `Start Receiving` (and `Show filters` while the rail is hidden) on
 * the left; Search · Export · Columns on the right. NO `Clear filters`
 * anywhere: re-clicking a rail row clears that section, Search clears in
 * Search, a column condition clears in its menu or on its own chip. The pager
 * sits in the top control area and only when there is more than one page;
 * the footer is information only.
 *
 * THE REGISTER STAYS MOUNTED under an open object (`invisible`, never
 * display:none) so Back restores rail filters, search, sort, page and scroll.
 */

// design-standard: not-a-list-page — the Receiving Register renders through
// the shared register DataGrid engine (UI MASTER §6.7), not ListPageShell.

/** Rows still owing goods — the Find PO or CO population. */
function poStillOwes(po: operationPoListRow): boolean {
  if (po.status !== "open") return false;
  const lines = po.purchase_order_lines ?? [];
  return lines.some((l) => (l.received_qty ?? 0) < (l.qty ?? 0));
}

/** Today in the business timezone. */
function todayMYT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date());
}

/** The rail's remembered open/closed choice (UI MASTER: the browser remembers). */
const RAIL_STORAGE_KEY = "carres.receiving.rail.v1";
/** 768–1129px: the rail opens CLOSED unless the browser remembers otherwise;
 *  when opened it keeps its full 240px (owner instruction 2026-09-13 §4). */
const NARROW_DESKTOP = "(min-width: 768px) and (max-width: 1129px)";

function initialRailOpen(): boolean {
  try {
    const stored = localStorage.getItem(RAIL_STORAGE_KEY);
    if (stored === "0") return false;
    if (stored === "1") return true;
  } catch {
    /* storage unavailable — fall through to the width rule */
  }
  try {
    return !window.matchMedia(NARROW_DESKTOP).matches;
  } catch {
    return true;
  }
}

export const RECEIVING_WORDS = {
  noExceptions: "No exceptions",
  itemsNotResolved: "no catalog name",
  catalogName: "name from the current catalog",
  expectedEmpty: (month: string) => `No supplier arrivals expected in ${month}`,
  expectedArrival: "expected supplier arrival",
  railExpected: "EXPECTED ARRIVALS",
} as const;

/** The expansion's one row per counted line, then one per extra line. */
function miniLinesOf(r: WarehouseReceiptQueueRow, onOpen: (s: EvidenceScope) => void): GoodsMiniLine[] {
  const grn = receivingDisplayNo(r);
  const lines = (r.lines ?? []) as WarehouseReceiptLine[];
  const extras = (r.extra_lines ?? []) as ReceivingExtraLine[];
  const facts = grnExceptionFacts(lines, extras);
  const labels = r.line_labels ?? {};
  const nameOf = (key: string, sku: string): string => {
    const lab = labels[key];
    const named = lab
      ? { name: lab.name, source: lab.source }
      : grnLineName({ sku });
    return named.name;
  };
  const doors = (key: string, type: "damaged" | "wrong_item" | "extra") => (
    <ExceptionEvidenceDoors
      receiptId={r.id}
      grnNo={grn}
      type={type}
      facts={facts.filter((f) => f.lineKey === key)}
      nameOf={nameOf}
      counts={r.line_evidence_counts}
      onOpen={onOpen}
      testId={`line-evidence-${key}`}
    />
  );
  const out: GoodsMiniLine[] = lines.map((l) => {
    const lab = labels[l.id];
    const named = lab ? { name: lab.name, source: lab.source } : grnLineName({ sku: l.sku, item_label: l.item_label });
    return {
      key: l.id,
      testId: `expanded-line-${l.id}`,
      category: "",
      unitIds: [],
      unitAbsence: "",
      deliverTo: [],
      deliverToAbsence: "",
      sku: l.sku,
      qty: l.received_now,
      item: named.name,
      itemDetail:
        [
          named.source === "catalog" ? RECEIVING_WORDS.catalogName : null,
          named.source === "sku" ? RECEIVING_WORDS.itemsNotResolved : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      received: Math.max(0, l.received_now),
      damaged: Math.max(0, l.damaged_qty),
      wrongItem: Math.max(0, l.wrong_item_qty),
      extra: 0,
      damagedNode: doors(l.id, "damaged"),
      wrongItemNode: doors(l.id, "wrong_item"),
      selectable: false,
    };
  });
  for (const [i, x] of extras.entries()) {
    const key = (x.id ?? "").trim();
    const lab = key ? labels[key] : undefined;
    const named = lab ? { name: lab.name, source: lab.source } : grnLineName({ sku: x.sku });
    out.push({
      key: key || `extra-${i}`,
      testId: `expanded-extra-${key || i}`,
      category: "",
      unitIds: [],
      unitAbsence: "",
      deliverTo: [],
      deliverToAbsence: "",
      sku: x.sku,
      qty: x.qty,
      item: named.name,
      itemDetail:
        [named.source === "catalog" ? RECEIVING_WORDS.catalogName : null, named.source === "sku" ? RECEIVING_WORDS.itemsNotResolved : null]
          .filter(Boolean)
          .join(" · ") || undefined,
      damaged: 0,
      wrongItem: 0,
      extra: Math.max(0, x.qty),
      extraNode: key ? doors(key, "extra") : undefined,
      selectable: false,
    });
  }
  return out;
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
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [railOpen, setRailOpen] = useState<boolean>(initialRailOpen);
  const setRail = (open: boolean) => {
    setRailOpen(open);
    try {
      localStorage.setItem(RAIL_STORAGE_KEY, open ? "1" : "0");
    } catch {
      /* the live state still works for this visit */
    }
  };
  const [viewer, setViewer] = useState<EvidenceScope | null>(null);
  /** The first of the two displayed months — opens on today's (MYT). */
  const today = useMemo(todayMYT, []);
  const [month, setMonth] = useState(() => today.slice(0, 7));

  // A changed filter or search term starts the result set over — page 1.
  const filterKey = [categorySel, supplierSel, siteSel, search].join("|");
  useEffect(() => {
    setOffset(0);
  }, [filterKey]);

  const registerQ = useOperationGrnRegister({
    offset,
    category: categorySel,
    supplier: supplierSel,
    site: siteSel,
    expected: null,
    q: search,
  });

  const rows = useMemo(() => registerQ.data?.receipts ?? [], [registerQ.data]);
  const page = registerQ.data?.page ?? { offset: 0, limit: 50, total: 0 };
  const facets = registerQ.data?.facets ?? { category: {}, supplier: {}, site: {} };

  const suppliers = useMemo(() => suppliersQ.data?.suppliers ?? [], [suppliersQ.data]) as SupplierRow[];
  const warehouses = useMemo(() => warehouseQ.data?.warehouses ?? [], [warehouseQ.data]);
  const pos = useMemo(() => posQ.data?.pos ?? [], [posQ.data]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  /** The expected-arrival display: supplier-CONFIRMED dates on open orders
   *  still owing goods (`expectedArrivalCounts` — the ONE reply arithmetic).
   *  A date behind today is marked overdue — in words and ink, never invented. */
  const markers = useMemo(() => expectedArrivalCounts(pos), [pos]);
  const overdue = useMemo(
    () => Object.fromEntries(Object.keys(markers).filter((iso) => iso < today).map((iso) => [iso, true])),
    [markers, today],
  );

  function setFacet(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null || next.get(key) === value) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  /** A facet group is drawn only when it can still NARROW the result: at
   *  least one option covers fewer rows than the current total, or the
   *  section is active (so it can be cleared). */
  const canNarrow = (counts: Record<string, number>, active: string | null) =>
    active !== null || Object.values(counts).some((n) => n > 0 && n < page.total);

  const categoryRows = useMemo(
    () => RECEIVING_CATEGORY_ROWS.filter((w) => (facets.category[w] ?? 0) > 0 || categorySel === w),
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

  const columns: DataGridColumn<WarehouseReceiptQueueRow>[] = useMemo(
    () => [
      {
        key: "grn",
        label: "GRN No",
        width: 152,
        sortable: true,
        searchValue: (r) => receivingDisplayNo(r),
        exportValue: (r) => receivingDisplayNo(r),
        accessor: (r) => (
          <span className="font-mono text-meta text-base-900">{receivingDisplayNo(r)}</span>
        ),
      },
      {
        key: "grnDate",
        label: "GRN Date",
        width: 106,
        sortable: true,
        /* The document's date — the posting's stamp in MYT (`grnDateOf`,
           server-resolved). Never parsed from the number. */
        searchValue: (r) => r.grn_date ?? "",
        exportValue: (r) => (r.grn_date ? fmtDate(r.grn_date) : ""),
        filterType: "date",
        dateValue: (r) => r.grn_date,
        sortFn: (a, b) => (a.grn_date ?? "").localeCompare(b.grn_date ?? ""),
        accessor: (r) => (
          <span className="tabular-nums text-body text-base-900">{r.grn_date ? fmtDate(r.grn_date) : ""}</span>
        ),
      },
      {
        key: "doNo",
        label: "Supplier DO No",
        width: 132,
        sortable: true,
        searchValue: (r) => r.do_number ?? "",
        exportValue: (r) => r.do_number ?? "",
        accessor: (r) => <span className="font-mono text-meta text-base-900">{r.do_number}</span>,
      },
      {
        key: "supplier",
        label: "Supplier",
        minWidth: 120,
        sortable: true,
        searchValue: (r) => r.supplier_name ?? "",
        exportValue: (r) => r.supplier_name ?? "",
        accessor: (r) => <span className="truncate text-body text-base-900">{r.supplier_name ?? ""}</span>,
      },
      {
        key: "po",
        label: "PO No",
        width: 156,
        sortable: true,
        /* A consignment source is IDENTIFIED as a CO on its own row — never
           silently relabelled a PO (owner instruction 2026-09-13 §3). */
        searchValue: (r) => `${r.po_id ?? ""} ${r.source_kind ?? ""}`,
        exportValue: (r) => (r.source_kind === "CO" ? `${r.po_id ?? ""} (CO)` : (r.po_id ?? "")),
        accessor: (r) => (
          <span className="font-mono text-meta text-base-900">
            {r.po_id}
            {r.source_kind === "CO" ? (
              <span className="ml-1.5 font-sans text-label text-kit-slate-11" data-testid="source-co">
                CO
              </span>
            ) : null}
          </span>
        ),
      },
      {
        key: "items",
        label: "Items",
        width: 64,
        align: "right",
        sortable: true,
        searchValue: () => "",
        exportValue: (r) => String(r.items ?? (r.lines ?? []).length),
        numberValue: (r) => r.items ?? (r.lines ?? []).length,
        sortFn: (a, b) => (a.items ?? 0) - (b.items ?? 0),
        accessor: (r) => (
          <span className="tabular-nums text-body text-base-900">{r.items ?? (r.lines ?? []).length}</span>
        ),
      },
      {
        key: "receivedQty",
        label: "Received Qty",
        width: 104,
        align: "right",
        sortable: true,
        searchValue: () => "",
        exportValue: (r) => String(warehouseReceiptTotals(r.lines as WarehouseReceiptLine[]).received),
        numberValue: (r) => warehouseReceiptTotals(r.lines as WarehouseReceiptLine[]).received,
        sortFn: (a, b) =>
          warehouseReceiptTotals(a.lines as WarehouseReceiptLine[]).received -
          warehouseReceiptTotals(b.lines as WarehouseReceiptLine[]).received,
        accessor: (r) => (
          <span className="tabular-nums text-body text-base-900">
            {warehouseReceiptTotals(r.lines as WarehouseReceiptLine[]).received}
          </span>
        ),
      },
      {
        key: "exceptions",
        label: "Exceptions",
        /* The summary AND up to six doors on one 38px line: a narrower cell
           clips the doors behind the cell edge, which hides an action the
           owner ruled must sit on the row. The sheet scrolls; the identity
           column stays pinned. */
        minWidth: 540,
        sortable: true,
        searchValue: (r) => grnExceptionSummary(grnExceptionFacts(r.lines as WarehouseReceiptLine[], r.extra_lines)),
        exportValue: (r) => grnExceptionSummary(grnExceptionFacts(r.lines as WarehouseReceiptLine[], r.extra_lines)),
        sortFn: (a, b) =>
          grnExceptionSummary(grnExceptionFacts(a.lines as WarehouseReceiptLine[], a.extra_lines)).localeCompare(
            grnExceptionSummary(grnExceptionFacts(b.lines as WarehouseReceiptLine[], b.extra_lines)),
          ),
        accessor: (r) => {
          const facts = grnExceptionFacts(r.lines as WarehouseReceiptLine[], r.extra_lines);
          const summary = grnExceptionSummary(facts);
          if (!summary)
            return (
              <span className="text-body text-kit-slate-9" data-absence="true">
                {RECEIVING_WORDS.noExceptions}
              </span>
            );
          const labels = r.line_labels ?? {};
          const nameOf = (key: string, sku: string) => {
            const lab = labels[key];
            return lab ? lab.name : grnLineName({ sku }).name;
          };
          return (
            <span className="flex items-center gap-1.5 whitespace-nowrap" data-testid={`exceptions-${r.id}`}>
              <span className="text-body text-kit-red-11">{summary}</span>
              {(["damaged", "wrong_item", "extra"] as const).map((type) => (
                <ExceptionEvidenceDoors
                  key={type}
                  receiptId={r.id}
                  grnNo={receivingDisplayNo(r)}
                  type={type}
                  facts={facts}
                  nameOf={nameOf}
                  counts={r.line_evidence_counts}
                  onOpen={setViewer}
                  compact
                  testId={`row-evidence-${r.id}`}
                />
              ))}
            </span>
          );
        },
      },
      {
        key: "status",
        label: "GRN Status",
        width: 100,
        sortable: true,
        /* Document words — `Confirmed` / `Cancelled` — mapped onto the
           existing internal states; nothing new was invented. */
        searchValue: (r) => warehouseReceiptStatusLabel(r.status),
        exportValue: (r) => warehouseReceiptStatusLabel(r.status),
        filterType: "enum",
        filterValue: (r) => warehouseReceiptStatusLabel(r.status),
        accessor: (r) => (
          <span className={r.status === "voided" ? "text-body text-base-500 line-through" : "text-body text-base-900"}>
            {warehouseReceiptStatusLabel(r.status)}
          </span>
        ),
      },
      /* ── governed OPTIONAL columns — secondary facts, off by default ── */
      {
        key: "receivedAt",
        label: "Goods received on",
        width: 150,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Dates",
        searchValue: (r) => r.goods_received_at ?? "",
        exportValue: (r) => (r.goods_received_at ? fmtDate(r.goods_received_at) : ""),
        filterType: "date",
        dateValue: (r) => r.goods_received_at,
        sortFn: (a, b) => (a.goods_received_at ?? "").localeCompare(b.goods_received_at ?? ""),
        accessor: (r) => (
          <span className="tabular-nums text-body text-base-900">{r.goods_received_at ? fmtDate(r.goods_received_at) : ""}</span>
        ),
      },
      {
        key: "supplierDeliveryDate",
        label: "Supplier Delivery Date",
        width: 166,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Dates",
        searchValue: (r) => r.supplier_delivery_date ?? "Not confirmed",
        exportValue: (r) => (r.supplier_delivery_date ? fmtDate(r.supplier_delivery_date) : "Not confirmed"),
        filterType: "date",
        dateValue: (r) => r.supplier_delivery_date,
        sortFn: (a, b) => (a.supplier_delivery_date ?? "").localeCompare(b.supplier_delivery_date ?? ""),
        accessor: (r) =>
          r.supplier_delivery_date ? (
            <span className="tabular-nums text-body text-base-900">{fmtDate(r.supplier_delivery_date)}</span>
          ) : (
            <span className="text-body text-kit-slate-9">Not confirmed</span>
          ),
      },
      {
        key: "deliverTo",
        label: "Deliver To",
        width: 150,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Location",
        searchValue: (r) => r.warehouse_name ?? "",
        exportValue: (r) => r.warehouse_name ?? "",
        accessor: (r) => <span className="truncate text-body text-base-900">{r.warehouse_name ?? ""}</span>,
      },
      {
        key: "actualSite",
        label: "Goods arrived at",
        width: 150,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Location",
        searchValue: (r) => r.actual_site_name ?? r.warehouse_name ?? "",
        exportValue: (r) => r.actual_site_name ?? r.warehouse_name ?? "",
        accessor: (r) =>
          r.actual_site_name && r.actual_site_name !== r.warehouse_name ? (
            <span className="truncate text-body text-kit-amber-11">{r.actual_site_name}</span>
          ) : (
            <span className="truncate text-body text-base-900">{r.actual_site_name ?? r.warehouse_name ?? ""}</span>
          ),
      },
      {
        key: "damagedQty",
        label: "Damaged Qty",
        width: 110,
        align: "right",
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Quantities",
        searchValue: () => "",
        exportValue: (r) => String(warehouseReceiptTotals(r.lines as WarehouseReceiptLine[]).damaged),
        numberValue: (r) => warehouseReceiptTotals(r.lines as WarehouseReceiptLine[]).damaged,
        accessor: (r) => {
          const n = warehouseReceiptTotals(r.lines as WarehouseReceiptLine[]).damaged;
          return <span className={n > 0 ? "tabular-nums text-body text-kit-red-11" : "tabular-nums text-body text-base-500"}>{n}</span>;
        },
      },
      {
        key: "wrongQty",
        label: "Wrong Item Qty",
        width: 120,
        align: "right",
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Quantities",
        searchValue: () => "",
        exportValue: (r) => String(warehouseReceiptTotals(r.lines as WarehouseReceiptLine[]).wrongItem),
        numberValue: (r) => warehouseReceiptTotals(r.lines as WarehouseReceiptLine[]).wrongItem,
        accessor: (r) => {
          const n = warehouseReceiptTotals(r.lines as WarehouseReceiptLine[]).wrongItem;
          return <span className={n > 0 ? "tabular-nums text-body text-kit-red-11" : "tabular-nums text-body text-base-500"}>{n}</span>;
        },
      },
      {
        key: "extraQty",
        label: "Extra Qty",
        width: 100,
        align: "right",
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Quantities",
        searchValue: () => "",
        exportValue: (r) => String(receivingExtraQty(r.extra_lines)),
        numberValue: (r) => receivingExtraQty(r.extra_lines),
        accessor: (r) => {
          const n = receivingExtraQty(r.extra_lines);
          return <span className={n > 0 ? "tabular-nums text-body text-kit-amber-11" : "tabular-nums text-body text-base-500"}>{n}</span>;
        },
      },
      {
        key: "category",
        label: "Category",
        width: 150,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Goods",
        searchValue: (r) => (r.categories ?? []).join(" "),
        exportValue: (r) => (r.categories ?? []).join(" · "),
        accessor: (r) => <span className="truncate text-body text-base-900">{(r.categories ?? []).join(" · ")}</span>,
      },
    ],
    [],
  );

  const narrowed = categorySel !== null || supplierSel !== null || siteSel !== null || search.trim() !== "";
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

  const expandable = useMemo(
    () => ({
      flush: true,
      fitExpansionToViewport: true,
      testId: (r: WarehouseReceiptQueueRow) => `expand-${r.id}`,
      renderExpansion: (r: WarehouseReceiptQueueRow) => (
        <div data-testid={`row-expansion-${r.id}`}>
          <GoodsMiniTable label={`Goods on ${receivingDisplayNo(r)}`} lines={miniLinesOf(r, setViewer)} receivingLayout />
        </div>
      ),
    }),
    [],
  );

  const pageFrom = page.total === 0 ? 0 : page.offset + 1;
  const pageTo = Math.min(page.offset + page.limit, page.total);
  const multiPage = page.total > page.limit;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="receiving-page">
      <PurchasingTabs />

      {arrivalId ? (
        <ArrivalSourceWorkspace receiving sourceId={arrivalId} />
      ) : sessionId ? (
        <ReceivingRecord sessionId={sessionId} onBack={closeObject} onOpenReceipt={openSession} />
      ) : poId ? (
        <PoReceivingView
          poId={poId}
          pos={pos}
          suppliers={supplierById}
          warehouses={warehouses}
          dutyAllowed={dutyQ.data?.allowed ?? false}
          dutyKnown={!dutyQ.isLoading}
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
        className={["flex min-h-0 flex-1 gap-0 p-2", openObject ? "invisible h-0 flex-none overflow-hidden p-0" : ""].join(" ")}
        data-testid="receiving-register"
      >
        {railOpen && (
          <FilterRail testId="receiving-rail" onHide={() => setRail(false)} ariaLabel="Receiving filters">
            {/* ── the two-month EXPECTED-ARRIVAL display — supplier-confirmed
                   dates on open orders still owing goods. It filters nothing
                   and carries no work; daily Receiving work stays in My Work /
                   Team Work. It scrolls WITH the filters so two complete months
                   never push the filters out of reach (13 Sep review refinement,
                   pending owner acceptance). ────────────────────────────── */}
            <div data-testid="receiving-expected" className="pt-6">
              <div className="flex items-center px-1.5">
                <span className="text-label font-semibold uppercase tracking-wide text-kit-slate-9">
                  {RECEIVING_WORDS.railExpected}
                </span>
              </div>
              <div className="mt-2">
                <MonthCalendar
                  testId="receiving-calendar"
                  month={month}
                  onMonthChange={setMonth}
                  months={2}
                  selectable={false}
                  markers={markers}
                  overdue={overdue}
                  markerWord={RECEIVING_WORDS.expectedArrival}
                  emptyWord={RECEIVING_WORDS.expectedEmpty}
                />
              </div>
            </div>

            {canNarrow(facets.category, categorySel) && categoryRows.length > 0 && (
              <FilterRailGroup title="CATEGORY">
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
            )}

            {canNarrow(facets.supplier, supplierSel) && supplierNames.length > 0 && (
              <FilterRailGroup title="SUPPLIER">
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
            )}

            {canNarrow(facets.site, siteSel) && siteNames.length > 0 && (
              <FilterRailGroup title="GOODS ARRIVED AT">
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
            )}
          </FilterRail>
        )}

        {/* `min-w-0`: the column is a flex child, and without it the sheet's
            own width would widen the column instead of scrolling inside it —
            which pushes Search · Export · Columns off the viewport at 831px.
            The toolbar and footer stay put; only the table scrolls sideways. */}
        <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${railOpen ? "pl-2" : ""}`} data-testid="receiving-register-column">
          {registerQ.isError ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white">
              <p className="text-body text-base-700">Receiving could not be opened</p>
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
              storageKey="carres.receiving.register.v3"
              rowKey={(r) => r.id}
              exportName="Receiving"
              searchPlaceholder="GRN, PO, supplier, DO number or item…"
              isLoading={registerQ.isLoading}
              onSearchChange={setSearch}
              stickyIdentity
              groupBanner={false}
              hideClearFilters
              expandable={expandable}
              expandTitle="This receipt's lines"
              chooserGroupOrder={["Dates", "Location", "Quantities", "Goods"]}
              onRowClick={(r) => openSession(r.id)}
              rowTestId={(r) => `grn-row-${r.id}`}
              toolbarStart={
                <>
                  {!railOpen && (
                    <button
                      type="button"
                      aria-label="Show filters"
                      title="Show filters"
                      data-testid="receiving-show-filters"
                      onClick={() => setRail(true)}
                      className="grid h-7 w-7 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
                    >
                      <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="start-receiving-door"
                    onClick={() => {
                      const next = new URLSearchParams(params);
                      next.set("find", "1");
                      setParams(next);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-kit-blue-9 px-3 text-body font-medium text-white hover:brightness-95"
                  >
                    Start Receiving
                  </button>
                </>
              }
              toolbarEnd={
                multiPage ? (
                  /* The pager lives in the TOP control area and only when
                     there is more than one page — the footer never holds a
                     control (owner instruction 2026-09-13 §4). */
                  <span className="ml-2 flex items-center gap-2 whitespace-nowrap" data-testid="grn-pager">
                    <span className="text-meta text-kit-slate-11" data-testid="grn-page-range">
                      {pageFrom}–{pageTo} of {page.total}
                    </span>
                    <button
                      type="button"
                      data-testid="grn-page-previous"
                      disabled={page.offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - page.limit))}
                      className="rounded-control border border-kit-slate-5 bg-white px-2 py-0.5 text-meta text-kit-slate-11 hover:bg-kit-slate-3 disabled:text-kit-slate-9 disabled:hover:bg-white"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      data-testid="grn-page-next"
                      disabled={pageTo >= page.total}
                      onClick={() => setOffset(offset + page.limit)}
                      className="rounded-control border border-kit-slate-5 bg-white px-2 py-0.5 text-meta text-kit-slate-11 hover:bg-kit-slate-3 disabled:text-kit-slate-9 disabled:hover:bg-white"
                    >
                      Next
                    </button>
                  </span>
                ) : null
              }
              emptyMessage={!narrowed ? "No receiving activity yet." : "No receiving matches these filters."}
              statusSummary={() => {
                /* Information only: the COMPLETE matching count, and the
                   narrowed-versus-total state when a filter or search is on. */
                const all = page.total_all;
                const narrowedWord =
                  narrowed && all != null && all !== page.total
                    ? ` · ${page.total} of ${all} match the filters`
                    : "";
                return (
                  <span data-testid="grn-footer-summary" className="truncate">
                    {page.total} {page.total === 1 ? "GRN" : "GRNs"}
                    {multiPage ? ` · showing ${pageFrom}–${pageTo}` : ""}
                    {narrowedWord}
                  </span>
                );
              }}
            />
          )}
        </div>
      </div>

      {viewer ? <ExceptionEvidenceViewer scope={viewer} onClose={() => setViewer(null)} /> : null}
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

/* ── One PO's receiving — pre-start object and active session ────────────── */

function PoReceivingView({
  poId,
  pos,
  suppliers,
  warehouses,
  dutyAllowed,
  dutyKnown = true,
  onBack,
  onOpenSession,
}: {
  poId: string;
  pos: operationPoListRow[];
  suppliers: Map<string, SupplierRow>;
  warehouses: Array<{ id: string; name: string }>;
  dutyAllowed: boolean;
  dutyKnown?: boolean;
  onBack: () => void;
  onOpenSession: (id: string) => void;
}) {
  const [receiving, setReceiving] = useState(false);
  const po = pos.find((p) => p.id === poId) ?? null;
  if (!po) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white" data-testid="receiving-po-missing">
        <p className="text-body text-base-700">
          This purchase order could not be opened
        </p>
        <button
          type="button"
          onClick={onBack}
          className="text-body text-kit-blue-11 hover:underline"
        >
          ‹ Receiving
        </button>
      </div>
    );
  }
  const supplier = suppliers.get(po.supplier_id);
  const warehouseName =
    warehouses.find((w) => w.id === po.warehouse_id)?.name ?? "";
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white" data-testid="receiving-po-view">
      <div className="flex items-center gap-2 px-4 pt-3">
        <button
          type="button"
          onClick={onBack}
          data-testid="receiving-po-back"
          className="text-body text-kit-blue-11 hover:underline"
        >
          ‹ Receiving
        </button>
      </div>
      <div className="mx-auto w-full max-w-4xl">
        <ReceivingWorkspace
          po={po}
          supplier={supplier}
          warehouseName={warehouseName}
          warehouses={warehouses}
          dutyAllowed={dutyAllowed}
          dutyKnown={dutyKnown}
          receiving={receiving}
          onReceiving={setReceiving}
          onPosted={(id) => onOpenSession(id)}
        />
      </div>
    </div>
  );
}
