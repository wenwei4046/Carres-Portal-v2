import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type WarehouseReceiptRow } from "@carres/shared";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import {
  useOperationPos,
  useOperationSuppliers,
  useOperationWarehouse,
  useOperationWarehouseReceipts,
  type operationPoListRow,
} from "@/lib/queries";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ModuleHeader from "./components/ModuleHeader";
import {
  FilterRail,
  FilterRailGroup,
  FilterRailRow,
} from "./components/workspace-rail";

/**
 * WAREHOUSE — INBOUND: expected physical arrivals at a governed Site
 * (owner replacement Card 2026-09-06 §5; Stock MASTER §2).
 *
 * `240px page-specific filter rail + Inbound Register`. One row per open
 * source document still owing goods — what the Warehouse should expect at
 * its door. The toolbar's compact date control is only a filter; Monitor
 * alone owns the Calendar summary.
 *
 * INBOUND ROUTES, IT NEVER POSTS (Law C — a door, never a duplicate):
 * actual receipt work lives in the governed Receiving Session. Opening a
 * row lands on `Receiving` — the waiting count review when one exists,
 * else the PO's own pre-start — and this page stores no receiving fact,
 * duplicates no GRN and owns no second form.
 *
 * Status words are the governed existing vocabulary, derived per row:
 * `Waiting goods arrival` · `Overdue goods arrival` · `Waiting Carres
 * check` (a warehouse count is already in front of Carres).
 */

// design-standard: not-a-list-page — the Inbound Register renders through
// the shared register DataGrid engine (UI MASTER §6.7), not ListPageShell.

interface InboundRow {
  poId: string;
  supplierName: string;
  siteName: string;
  etaDate: string | null;
  orderQty: number;
  receivedQty: number;
  pendingQty: number;
  statusWord:
    | "Waiting goods arrival"
    | "Overdue goods arrival"
    | "Waiting Carres check";
  /** The waiting count's session id, when the warehouse already filed one. */
  openReceiptId: string | null;
}

function pendingOf(po: operationPoListRow): number {
  return (po.purchase_order_lines ?? []).reduce(
    (n, l) => n + Math.max(0, (l.qty ?? 0) - (l.received_qty ?? 0)),
    0,
  );
}

export default function WarehouseInbound() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const today = appTodayIso();

  const posQ = useOperationPos();
  const suppliersQ = useOperationSuppliers();
  const warehouseQ = useOperationWarehouse();
  const receiptsQ = useOperationWarehouseReceipts("all");

  const statusSel = params.get("status");
  const siteSel = params.get("site");
  const dateSel = params.get("date");
  const poSel = params.get("po");

  const allRows = useMemo(() => {
    const supplierName = new Map(
      (suppliersQ.data?.suppliers ?? []).map((s: { id: string; name: string }) => [
        s.id,
        s.name,
      ]),
    );
    const siteName = new Map(
      (warehouseQ.data?.warehouses ?? []).map((w: { id: string; name: string }) => [
        w.id,
        w.name,
      ]),
    );
    /* A SUBMITTED count means the arrival already happened and the session
       is waiting for Carres — the row must say so, not `Waiting goods
       arrival`. Posted/voided sessions are GRN records and live on the
       Receiving Register, never here. */
    const openReceiptByPo = new Map<string, string>();
    for (const r of (receiptsQ.data?.receipts ?? []) as WarehouseReceiptRow[]) {
      if (r.status === "submitted") openReceiptByPo.set(r.po_id, r.id);
    }
    const rows: InboundRow[] = [];
    for (const po of posQ.data?.pos ?? []) {
      if (po.status !== "open") continue;
      const pendingQty = pendingOf(po);
      if (pendingQty <= 0) continue;
      const lines = po.purchase_order_lines ?? [];
      const openReceiptId = openReceiptByPo.get(po.id) ?? null;
      rows.push({
        poId: po.id,
        supplierName: supplierName.get(po.supplier_id) ?? "—",
        siteName:
          siteName.get(po.destination_id ?? po.warehouse_id) ??
          siteName.get(po.warehouse_id) ??
          "—",
        etaDate: po.eta_date,
        orderQty: lines.reduce((n, l) => n + Math.max(0, l.qty ?? 0), 0),
        receivedQty: lines.reduce((n, l) => n + Math.max(0, l.received_qty ?? 0), 0),
        pendingQty,
        statusWord: openReceiptId
          ? "Waiting Carres check"
          : po.eta_date && po.eta_date < today
            ? "Overdue goods arrival"
            : "Waiting goods arrival",
        openReceiptId,
      });
    }
    return rows;
  }, [posQ.data, suppliersQ.data, warehouseQ.data, receiptsQ.data, today]);

  /** One filter per rail section; sections combine with AND; counts are
   *  computed against the OTHER selections so a number never lies. */
  const matchesExcept = (r: InboundRow, except: string) => {
    if (except !== "status" && statusSel && r.statusWord !== statusSel) return false;
    if (except !== "site" && siteSel && r.siteName !== siteSel) return false;
    if (dateSel && r.etaDate !== dateSel) return false;
    if (poSel && r.poId !== poSel) return false;
    return true;
  };

  const rows = useMemo(
    () => allRows.filter((r) => matchesExcept(r, "")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRows, statusSel, siteSel, dateSel, poSel],
  );

  const statusCount = (word: InboundRow["statusWord"]) =>
    allRows.filter((r) => r.statusWord === word && matchesExcept(r, "status")).length;
  const siteNames = useMemo(
    () => [...new Set(allRows.map((r) => r.siteName))].filter((s) => s !== "—").sort(),
    [allRows],
  );

  function setFacet(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null || next.get(key) === value) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  /** THE DOOR (card §5): a row opens the governed Receiving surface —
   *  the waiting count review when one exists, else the PO's pre-start. */
  function openRow(r: InboundRow) {
    const next = new URLSearchParams();
    next.set("tab", "receiving");
    if (r.openReceiptId) next.set("session", r.openReceiptId);
    else next.set("po", r.poId);
    navigate(`/operation?${next.toString()}`);
  }

  const columns: DataGridColumn<InboundRow>[] = useMemo(
    () => [
      {
        key: "eta",
        label: "Expected arrival",
        accessor: (r) => (r.etaDate ? fmtDate(r.etaDate) : "No date from supplier"),
        width: 150,
        sortable: true,
        sortFn: (a, b) => (a.etaDate ?? "9999").localeCompare(b.etaDate ?? "9999"),
        filterType: "date",
        dateValue: (r) => r.etaDate,
        exportValue: (r) => r.etaDate ?? "",
      },
      {
        key: "po",
        label: "PO No",
        accessor: (r) => <span className="font-mono">{r.poId}</span>,
        searchValue: (r) => r.poId,
        exportValue: (r) => r.poId,
        width: 150,
        sortable: true,
        filterType: "numbering",
        filterValue: (r) => r.poId,
      },
      {
        key: "supplier",
        label: "Supplier",
        accessor: (r) => r.supplierName,
        width: 180,
        sortable: true,
        groupable: true,
      },
      {
        key: "site",
        label: "Site",
        accessor: (r) => r.siteName,
        width: 180,
        sortable: true,
        groupable: true,
      },
      {
        key: "orderQty",
        label: "Order Qty",
        accessor: (r) => String(r.orderQty),
        align: "right",
        width: 100,
        sortable: true,
        sortFn: (a, b) => a.orderQty - b.orderQty,
        filterType: "number",
        numberValue: (r) => r.orderQty,
      },
      {
        key: "receivedQty",
        label: "Received Qty",
        accessor: (r) => String(r.receivedQty),
        align: "right",
        width: 110,
        sortable: true,
        sortFn: (a, b) => a.receivedQty - b.receivedQty,
        filterType: "number",
        numberValue: (r) => r.receivedQty,
      },
      {
        key: "pendingQty",
        label: "Pending Delivery Qty",
        accessor: (r) => String(r.pendingQty),
        align: "right",
        width: 150,
        sortable: true,
        sortFn: (a, b) => a.pendingQty - b.pendingQty,
        filterType: "number",
        numberValue: (r) => r.pendingQty,
      },
      {
        key: "status",
        label: "Status",
        accessor: (r) => r.statusWord,
        width: 170,
        sortable: true,
        groupable: true,
      },
    ],
    [],
  );

  const isLoading = posQ.isLoading || receiptsQ.isLoading;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-testid="warehouse-inbound">
      <ModuleHeader
        testId="warehouse-inbound-header"
        word="Inbound"
        docTitle="Inbound · Warehouse — Carres"
        destinationHeader
      />
      <div className="flex min-h-0 flex-1">
        <FilterRail testId="wi-rail">
          <FilterRailGroup title="ARRIVAL STATUS">
            {(
              [
                "Waiting goods arrival",
                "Overdue goods arrival",
                "Waiting Carres check",
              ] as const
            ).map((word) => (
              <FilterRailRow
                key={word}
                label={word}
                count={statusCount(word)}
                active={statusSel === word}
                onClick={() => setFacet("status", word)}
                testId={`wi-status-${word.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              />
            ))}
          </FilterRailGroup>
          {siteNames.length > 1 && (
            <FilterRailGroup title="SITE">
              {siteNames.map((name) => (
                <FilterRailRow
                  key={name}
                  label={name}
                  count={allRows.filter((r) => r.siteName === name && matchesExcept(r, "site")).length}
                  active={siteSel === name}
                  onClick={() => setFacet("site", name)}
                  testId={`wi-site-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                />
              ))}
            </FilterRailGroup>
          )}
          {/* SOURCE is not rendered while `Purchase Order` is the only live
              source (Transfers and returns arrive in their own slices): a
              one-option group is a dead control. */}
        </FilterRail>
        <div className="min-h-0 min-w-0 flex-1">
          <DataGrid<InboundRow>
            appearance="reference"
            rows={rows}
            columns={columns}
            storageKey="carres.warehouse.inbound.v1"
            rowKey={(r) => r.poId}
            exportName="Inbound"
            searchPlaceholder="PO, supplier or Site…"
            isLoading={isLoading}
            onRowClick={openRow}
            toolbarStart={
              (dateSel || poSel) && (
                <button
                  type="button"
                  className="inline-flex h-7 items-center gap-1 rounded border border-kit-slate-5 bg-white px-2 text-meta text-base-600 hover:bg-hovertint"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete("date");
                    next.delete("po");
                    setParams(next, { replace: true });
                  }}
                  data-testid="wi-clear-scope"
                >
                  {[
                    dateSel ? fmtDate(dateSel) : null,
                    poSel ?? null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  ✕
                </button>
              )
            }
            statusSummary={(filteredRows) => (
              <span>
                {filteredRows.length} expected arrival{filteredRows.length === 1 ? "" : "s"} ·{" "}
                {filteredRows.reduce((n, r) => n + r.pendingQty, 0)} pending delivery
              </span>
            )}
          />
        </div>
      </div>
    </div>
  );
}
