import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  expectedArrivalCounts,
  receivingDisplayNo,
  receivingExtraQty,
  RECEIVING_CATEGORY_ROWS,
  warehouseReceiptStatusLabel,
  warehouseReceiptTotals,
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
import ReceivingWorkspace from "./components/ReceivingWorkspace";
import ReceivingRecord from "./components/ReceivingRecord";
import PurchasingTabs from "./PurchasingTabs";
import ArrivalSourceWorkspace from "./ArrivalSourceWorkspace";

/**
 * OperationReceiving — the ONE Receiving destination
 * (owner corrections 2026-09-06; purchasing/MASTER.md §9.4; UI MASTER §6.7).
 *
 * ```
 * My Work / Team Work   =  what staff must receive or review
 * Receiving             =  the complete GRN Register, beside its rail
 * ```
 *
 * ONE PAGE. No Receiving Monitor, no `Calendar View / GRN Register View`
 * switch, no permanent tabs, no second Receiving destination — the earlier
 * two-view proposal is superseded. The left 240px rail holds the full month
 * Calendar FIXED on top and the business filters scrolling beneath it; the
 * right side is always the complete GRN Register.
 *
 * THE REGISTER BOUNDARY: a row exists only once `Save Receiving` created the
 * GRN — the Register lists `Valid` and `Cancelled` GRNs, nothing else. A
 * Warehouse count awaiting Carres action lives in My Work / Team Work and
 * deep-links (`?session=`) to its Receiving review; it never becomes a
 * Register row.
 *
 * THE RAIL CALENDAR (owner correction 2026-09-06):
 *   · one month at a time, ‹ › exactly one month; Sunday visible but muted —
 *     Receiving follows the Warehouse working calendar, Monday–Saturday,
 *   · a date with expected supplier arrivals prints a COUNT (never colour
 *     alone), from the linked POs' governed `Supplier Delivery Date`
 *     (`expectedArrivalCounts` — the ONE reply arithmetic; our own estimate
 *     never marks a day),
 *   · picking a date filters the SAME register by that Supplier Delivery
 *     Date; picking it again — or `Clear filters` — restores the whole list,
 *   · the right side never becomes a weekly calendar and never shows work
 *     cards — daily Receiving actions stay in My Work / Team Work.
 *
 * The filters below it: CATEGORY (only governed rows present in the result
 * set) · SUPPLIER · GOODS ARRIVED AT · Clear filters. No `Any`, no `All …`;
 * re-clicking the active row clears its section. Detailed received-date
 * filtering is the TABLE's `Goods received on` column — the rail carries no
 * second received-date filter.
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

/** Today in the business timezone — the Calendar opens on the month the
 *  operator is standing in, wherever the machine thinks it is. */
function todayMYT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date());
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
  /** The rail Calendar's picked `Supplier Delivery Date`. */
  const expectedSel = params.get("expected");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  /** The visible Calendar month — opens on the picked date's month, else
   *  today's (MYT). The ‹ › arrows move exactly one month. */
  const [month, setMonth] = useState(() =>
    (expectedSel ?? todayMYT()).slice(0, 7),
  );

  // A changed filter or search term starts the result set over — page 1.
  const filterKey = [categorySel, supplierSel, siteSel, expectedSel, search].join("|");
  useEffect(() => {
    setOffset(0);
  }, [filterKey]);

  const registerQ = useOperationGrnRegister({
    offset,
    category: categorySel,
    supplier: supplierSel,
    site: siteSel,
    expected: expectedSel,
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
  };

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

  /** The Calendar's markers — expected supplier arrivals per governed
   *  `Supplier Delivery Date`, the ONE shared arithmetic over the same PO
   *  list Find PO already reads. */
  const markers = useMemo(() => expectedArrivalCounts(pos), [pos]);

  function setFacet(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null || next.get(key) === value) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

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

  const columns: DataGridColumn<WarehouseReceiptQueueRow>[] = useMemo(
    () => [
      {
        key: "grn",
        label: "GRN No",
        width: 168,
        sortable: true,
        /* Every Register row IS a GRN (the boundary above) — the formal
           number exists by construction (purchasing/MASTER.md §7.3). */
        searchValue: (r) => receivingDisplayNo(r),
        exportValue: (r) => receivingDisplayNo(r),
        accessor: (r) => (
          <span className="font-mono text-meta text-base-900">
            {receivingDisplayNo(r)}
          </span>
        ),
      },
      {
        key: "supplierDeliveryDate",
        label: "Supplier Delivery Date",
        width: 166,
        sortable: true,
        /* The linked PO's governed supplier answer (`poSupplierDeliveryDateOf`,
           server-resolved) — the SAME date the rail Calendar filters by, so
           the picked day and this cell can never disagree. `Not confirmed`
           while the supplier has not evidenced one. */
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
            <span className="text-body text-kit-slate-9">Not confirmed</span>
          ),
      },
      {
        key: "receivedAt",
        label: "Goods received on",
        width: 150,
        sortable: true,
        searchValue: (r) => r.goods_received_at ?? "",
        exportValue: (r) =>
          r.goods_received_at ? fmtDate(r.goods_received_at) : "",
        /* The table's date column OWNS detailed date filtering (owner
           correction 2026-09-06) — the rail carries no second one. */
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
        key: "po",
        label: "PO/CO No",
        width: 150,
        sortable: true,
        searchValue: (r) => r.po_id,
        exportValue: (r) => r.po_id,
        accessor: (r) => (
          <span className="font-mono text-meta text-base-900">{r.po_id}</span>
        ),
      },
      {
        key: "supplier",
        label: "Supplier",
        minWidth: 140,
        sortable: true,
        searchValue: (r) => r.supplier_name ?? "",
        exportValue: (r) => r.supplier_name ?? "",
        accessor: (r) => (
          <span className="truncate text-body text-base-900">
            {r.supplier_name ?? ""}
          </span>
        ),
      },
      {
        key: "product",
        label: "Product",
        minWidth: 160,
        sortable: true,
        /* The GRN PAPER's own line words (`product_skus.variant`, else the
           SKU — server-resolved), first label plus a truthful `+n`. */
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
        key: "deliverTo",
        label: "Deliver To",
        width: 150,
        sortable: true,
        searchValue: (r) => r.warehouse_name ?? "",
        exportValue: (r) => r.warehouse_name ?? "",
        accessor: (r) => (
          <span className="truncate text-body text-base-900">
            {r.warehouse_name ?? ""}
          </span>
        ),
      },
      {
        key: "actualSite",
        label: "Goods arrived at",
        width: 150,
        sortable: true,
        searchValue: (r) => r.actual_site_name ?? r.warehouse_name ?? "",
        exportValue: (r) => r.actual_site_name ?? r.warehouse_name ?? "",
        accessor: (r) =>
          r.actual_site_name && r.actual_site_name !== r.warehouse_name ? (
            /* The physical truth, preserved BESIDE the instruction — never
               overwriting `Deliver To` (owner correction 2026-09-06). Amber
               only when the goods landed somewhere other than instructed. */
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
        key: "receivedQty",
        label: "Received Qty",
        width: 110,
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
        key: "status",
        label: "Status",
        width: 110,
        sortable: true,
        /* Document status words — `Valid` / `Cancelled` (owner correction
           2026-09-06). `Posted`/`Voided` stay internal database statuses. */
        searchValue: (r) => warehouseReceiptStatusLabel(r.status),
        exportValue: (r) => warehouseReceiptStatusLabel(r.status),
        accessor: (r) => (
          <span
            className={
              r.status === "voided"
                ? "text-body text-base-500 line-through"
                : "text-body text-base-900"
            }
          >
            {warehouseReceiptStatusLabel(r.status)}
          </span>
        ),
      },
      {
        key: "doNo",
        label: "Supplier DO No.",
        width: 140,
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
        key: "damagedQty",
        label: "Damaged Qty",
        width: 110,
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
        width: 120,
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
        width: 100,
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
    expectedSel !== null;

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
    <div className="flex min-h-0 flex-1 flex-col" data-testid="receiving-page">
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
        <FilterRail
          testId="receiving-rail"
          header={
            /* The full month Calendar, FIXED at the top of the rail while the
               business filters scroll beneath it (owner correction
               2026-09-06). Picking a date filters the SAME register by that
               Supplier Delivery Date; picking it again clears. */
            <MonthCalendar
              testId="receiving-calendar"
              month={month}
              onMonthChange={setMonth}
              selected={expectedSel}
              onSelect={(iso) => setFacet("expected", iso)}
              markers={markers}
              markerWord="expected supplier arrival"
            />
          }
        >
          {/* Only the governed category rows PRESENT in the result set, in
              the shared ladder's order — no `Any`, no `All …`, no invented
              category. Counts speak for the COMPLETE filtered result set;
              re-clicking the active row clears the section. */}
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

          {/* The suppliers actually present in Receiving records. */}
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

          {/* The receiving locations actually present in the records —
              where the goods PHYSICALLY arrived. */}
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

          <button
            type="button"
            disabled={!narrowed}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete("category");
              next.delete("supplier");
              next.delete("site");
              next.delete("expected");
              setParams(next, { replace: true });
            }}
            data-testid="rail-clear-filters"
            className="self-start rounded-control px-2 py-1.5 text-left text-body text-kit-blue-11 hover:bg-kit-slate-3 disabled:text-kit-slate-9"
          >
            Clear filters
          </button>
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
              storageKey="carres.receiving.register.v1"
              rowKey={(r) => r.id}
              exportName="Receiving"
              searchPlaceholder="GRN, PO, supplier or DO number…"
              isLoading={registerQ.isLoading}
              onSearchChange={setSearch}
              stickyIdentity
              groupBanner={false}
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
                      className="rounded-control border border-kit-slate-5 bg-white px-2 py-0.5 text-meta text-kit-slate-11 hover:bg-kit-slate-3 disabled:text-kit-slate-9 disabled:hover:bg-white"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      data-testid="grn-page-next"
                      disabled={to >= page.total}
                      onClick={() => setOffset(offset + page.limit)}
                      className="rounded-control border border-kit-slate-5 bg-white px-2 py-0.5 text-meta text-kit-slate-11 hover:bg-kit-slate-3 disabled:text-kit-slate-9 disabled:hover:bg-white"
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
