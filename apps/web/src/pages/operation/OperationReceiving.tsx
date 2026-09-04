import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  receivingDisplayNo,
  receivingExtraQty,
  warehouseReceiptStatusLabel,
  warehouseReceiptTotals,
  type WarehouseReceiptLine,
} from "@carres/shared";
import {
  useOperationPos,
  useOperationSuppliers,
  useOperationWarehouse,
  useOperationWarehouseReceipts,
  useReceivingDuty,
  type operationPoListRow,
  type SupplierRow,
  type WarehouseReceiptQueueRow,
} from "@/lib/queries";
import { fmtDate, fmtDateShort } from "@/lib/fmt-date";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import {
  FilterRail,
  FilterRailGroup,
  FilterRailRow,
} from "./components/workspace-rail";
import ReceivingWorkspace from "./components/ReceivingWorkspace";
import ReceivingRecord from "./components/ReceivingRecord";
import PurchasingTabs from "./PurchasingTabs";

/**
 * OperationReceiving — the Receiving Register and its object surfaces
 * (owner instruction 2026-09-04; purchasing/MASTER.md §9.4; UI MASTER §6.7).
 *
 * ```
 * Receiving
 * ├─ 240px Filter Rail        concrete record facets, never Today/Tomorrow
 * └─ Full-width register      36/38/32 register DataGrid · status footer
 * ```
 *
 * The Register lists RECEIVING SESSIONS — every count the warehouse filed and
 * every posted, numbered GRN. Opening a row shows the Receiving object or the
 * formal GRN, depending on its state. Work (what to receive today) lives in
 * `My Work` / `Team Work`; this page is the record and the doors:
 *
 *   [Start Receiving]  →  Find PO or CO  →  pre-start object  →  Session
 *   a submitted row    →  the count review (Save Receiving / Return count)
 *   a posted row       →  the read-only GRN record (Amend / Void doors)
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

type StateFacet = "submitted" | "returned" | "posted" | "voided";

const STATE_ROWS: Array<{ key: StateFacet; label: string }> = [
  { key: "submitted", label: "Count waiting for check" },
  { key: "returned", label: "Sent back to recount" },
  { key: "posted", label: "Posted" },
  { key: "voided", label: "Voided" },
];

/** Rows still owing goods — the Find PO or CO population. The search is
 *  CONTROLLED: the user must select an existing PO before starting Receiving
 *  (an unknown delivery never invents a source). */
function poStillOwes(po: operationPoListRow): boolean {
  if (po.status !== "open") return false;
  const lines = po.purchase_order_lines ?? [];
  return lines.some((l) => (l.received_qty ?? 0) < (l.qty ?? 0));
}

export default function OperationReceiving() {
  const [params, setParams] = useSearchParams();
  const sessionId = params.get("session");
  const poId = params.get("po");
  const finding = params.get("find") === "1";

  const receiptsQ = useOperationWarehouseReceipts("all");
  const posQ = useOperationPos();
  const suppliersQ = useOperationSuppliers();
  const warehouseQ = useOperationWarehouse();
  const dutyQ = useReceivingDuty();

  const stateSel = (params.get("state") as StateFacet | null) ?? null;
  const supplierSel = params.get("supplier");
  const siteSel = params.get("site");
  const [search, setSearch] = useState("");

  const receipts = useMemo(
    () => receiptsQ.data?.receipts ?? [],
    [receiptsQ.data],
  );
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

  /** One filter per section; sections combine with AND; counts are computed
   *  against the OTHER selected sections so a number never lies about what
   *  clicking it would show. */
  const matchesExcept = (r: WarehouseReceiptQueueRow, except: string) => {
    if (except !== "state" && stateSel && r.status !== stateSel) return false;
    if (
      except !== "supplier" &&
      supplierSel &&
      (r.supplier_name ?? "") !== supplierSel
    )
      return false;
    if (
      except !== "site" &&
      siteSel &&
      (r.actual_site_name ?? r.warehouse_name ?? "") !== siteSel
    )
      return false;
    return true;
  };

  const counts = useMemo(() => {
    const state = new Map<string, number>();
    const supplier = new Map<string, number>();
    const site = new Map<string, number>();
    for (const r of receipts) {
      if (matchesExcept(r, "state"))
        state.set(r.status, (state.get(r.status) ?? 0) + 1);
      if (matchesExcept(r, "supplier") && r.supplier_name)
        supplier.set(r.supplier_name, (supplier.get(r.supplier_name) ?? 0) + 1);
      const siteName = r.actual_site_name ?? r.warehouse_name;
      if (matchesExcept(r, "site") && siteName)
        site.set(siteName, (site.get(siteName) ?? 0) + 1);
    }
    return { state, supplier, site };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipts, stateSel, supplierSel, siteSel]);

  const rows = useMemo(
    () =>
      receipts.filter(
        (r) =>
          matchesExcept(r, "") &&
          // draft sessions have no business existence on the register
          r.status !== "draft",
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [receipts, stateSel, supplierSel, siteSel],
  );

  const supplierNames = useMemo(
    () => [...counts.supplier.keys()].sort((a, b) => a.localeCompare(b)),
    [counts.supplier],
  );
  const siteNames = useMemo(
    () => [...counts.site.keys()].sort((a, b) => a.localeCompare(b)),
    [counts.site],
  );

  const columns: DataGridColumn<WarehouseReceiptQueueRow>[] = useMemo(
    () => [
      {
        key: "grn",
        label: "GRN No",
        width: 168,
        sortable: true,
        searchValue: (r) =>
          r.status === "posted" || r.status === "voided"
            ? receivingDisplayNo(r)
            : "",
        exportValue: (r) =>
          r.status === "posted" || r.status === "voided"
            ? receivingDisplayNo(r)
            : "No GRN yet",
        accessor: (r) =>
          r.status === "posted" || r.status === "voided" ? (
            <span className="font-mono text-meta text-base-900">
              {receivingDisplayNo(r)}
            </span>
          ) : (
            /* The formal GRN exists only from the posted session
               (purchasing/MASTER.md §7.3) — an honest absence, never `—`. */
            <span className="text-meta text-base-500">No GRN yet</span>
          ),
      },
      {
        key: "status",
        label: "Status",
        width: 170,
        sortable: true,
        searchValue: (r) => warehouseReceiptStatusLabel(r.status),
        exportValue: (r) => warehouseReceiptStatusLabel(r.status),
        accessor: (r) => (
          <span
            className={
              r.status === "submitted"
                ? "text-body text-kit-amber-11"
                : r.status === "voided"
                  ? "text-body text-base-500 line-through"
                  : "text-body text-base-900"
            }
          >
            {warehouseReceiptStatusLabel(r.status)}
          </span>
        ),
      },
      {
        key: "receivedAt",
        label: "Goods Received At",
        width: 150,
        sortable: true,
        searchValue: (r) => r.goods_received_at ?? "",
        exportValue: (r) =>
          r.goods_received_at ? fmtDate(r.goods_received_at) : "",
        accessor: (r) => (
          <span className="tabular-nums text-body text-base-900">
            {r.goods_received_at ? fmtDate(r.goods_received_at) : ""}
          </span>
        ),
      },
      {
        key: "po",
        label: "PO No",
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
        label: "Actual Site",
        width: 150,
        sortable: true,
        searchValue: (r) => r.actual_site_name ?? "",
        exportValue: (r) => r.actual_site_name ?? "Same as Deliver To",
        accessor: (r) =>
          r.actual_site_name ? (
            /* The physical truth, preserved BESIDE the instruction — never
               overwriting it (owner instruction §6). */
            <span className="truncate text-body text-kit-amber-11">
              {r.actual_site_name}
            </span>
          ) : (
            <span className="text-meta text-base-500">Same as Deliver To</span>
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

  const waiting = receiptsQ.data?.counts.waiting ?? 0;
  const narrowed = stateSel !== null || supplierSel !== null || siteSel !== null;

  const openObject = sessionId ?? poId ?? (finding ? "find" : null);

  function openSession(id: string) {
    const next = new URLSearchParams(params);
    next.delete("po");
    next.delete("find");
    next.set("session", id);
    setParams(next);
  }
  function closeObject() {
    const next = new URLSearchParams(params);
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
      {sessionId ? (
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
        <FilterRail testId="receiving-rail">
          <FilterRailGroup title="RECEIVING">
            <FilterRailRow
              label="All receiving"
              active={!narrowed}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete("state");
                next.delete("supplier");
                next.delete("site");
                setParams(next, { replace: true });
              }}
              testId="rail-all-receiving"
            />
            {STATE_ROWS.map((s) => (
              <FilterRailRow
                key={s.key}
                label={s.label}
                count={counts.state.get(s.key) ?? 0}
                active={stateSel === s.key}
                onClick={() => setFacet("state", s.key)}
                testId={`rail-state-${s.key}`}
              />
            ))}
          </FilterRailGroup>

          <FilterRailGroup title="SUPPLIER">
            <FilterRailRow
              label="All suppliers"
              active={supplierSel === null}
              onClick={() => setFacet("supplier", null)}
              testId="rail-all-suppliers"
            />
            {supplierNames.map((name) => (
              <FilterRailRow
                key={name}
                label={name}
                count={counts.supplier.get(name) ?? 0}
                active={supplierSel === name}
                onClick={() => setFacet("supplier", name)}
                testId={`rail-supplier-${name}`}
              />
            ))}
          </FilterRailGroup>

          {/* A filter offering one choice is not a filter — SITE appears the
              moment a second site holds a receiving. */}
          {siteNames.length > 1 ? (
            <FilterRailGroup title="SITE">
              {siteNames.map((name) => (
                <FilterRailRow
                  key={name}
                  label={name}
                  count={counts.site.get(name) ?? 0}
                  active={siteSel === name}
                  onClick={() => setFacet("site", name)}
                  testId={`rail-site-${name}`}
                />
              ))}
            </FilterRailGroup>
          ) : null}
        </FilterRail>

        <div className="flex min-h-0 flex-1 flex-col pl-2" data-testid="receiving-register-column">
          {receiptsQ.isError ? (
            /* A failure sentence is never the empty sentence (COPY-STANDARD
               2026-08-28): what broke, then the act that fixes it. */
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white">
              <p className="text-body text-base-700">
                Receiving could not be opened
              </p>
              <button
                type="button"
                className="rounded-control border border-base-200 bg-white px-3 py-1.5 text-meta font-medium text-base-700 hover:bg-hovertint"
                onClick={() => void receiptsQ.refetch()}
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
              isLoading={receiptsQ.isLoading}
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
                receipts.length === 0
                  ? // The record is what is empty — never "the goods have not
                    // come" (Jess, 2026-08-03).
                    "No receiving activity yet."
                  : "No receiving matches these filters."
              }
              statusSummary={(filteredRows) => {
                const bits = [
                  `${filteredRows.length} receiving record${filteredRows.length === 1 ? "" : "s"}`,
                ];
                if (narrowed || search.trim() !== "")
                  bits.push(`of ${receipts.length}`);
                if (waiting > 0)
                  bits.push(`${waiting} count${waiting === 1 ? "" : "s"} waiting for check`);
                const line = bits.join(" · ");
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
