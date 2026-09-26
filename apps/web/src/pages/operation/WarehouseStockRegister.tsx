import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  applyRailSelection,
  categoryKeyOf,
  displayUnitId,
  INVENTORY_STATUS_RAIL,
  inventoryStatusOf,
  isCurrentUnit,
  isHeldUnit,
  isRailFiltered,
  NO_CATALOG_KEY,
  NO_CATALOG_LABEL,
  registerSummaryLine,
  stillToArriveLine,
  stockConditionOf,
  summariseRegister,
  UNIT_LIFECYCLE_OUTCOME_LABEL,
  UNIT_OWNERSHIP_LABEL,
  unitIdOf,
  type InventoryStatus,
  type StockRailSelection,
  type StockRegisterUnit,
  type UnitLifecycleOutcome,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { useStockRegister } from "@/lib/queries";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ModuleHeader from "./components/ModuleHeader";
import { FilterRail, FilterRailGroup, FilterRailRow } from "./components/workspace-rail";
import Button from "@/components/kit/Button";
import WarehouseUnitDetail from "./WarehouseUnitDetail";

/**
 * INVENTORY — the one current Unit Register.
 * Stock MASTER §7 (owner rulings 2026-09-25) · UI MASTER §6.0.
 *
 * ── THE DEFAULT LIST IS WHAT CARRES PHYSICALLY HOLDS ────────────────────────
 * `All stock` opens on Available · Reserved · Cannot sell (and a Unit on the
 * road, which keeps its word). `Incoming` — born with the PO, not received —
 * is its own rail row, and the footer says how many are still to arrive.
 * Measured on production 2026-09-25: `All stock 222` while 127 rows were
 * Incoming and 95 stood in a Site; a new operator read 222 as goods on the
 * floor.
 *
 * ── ONE ROW IS ONE UNIT, ONE CELL IS ONE FACT ───────────────────────────────
 * Eleven single-line columns in the owner's own order; no row expansion, no
 * composite cell. Every head is a dictionary word. `Who has it`, `Site`,
 * `Where`, `Stock use`, `Not available`, `In transit` and `With NETS Delivery`
 * are retired screen words: the road shows in `Ship Date · Pickup By ·
 * Delivery Location`, and `Stock Location` is always the Carres or transit
 * Site the Unit stands in or last stood in — never a company.
 */
const STOCK_VIEWS = [
  ["all", "All stock"],
  ["reserved", "Reserved"],
  ["ready", "Ready Stock"],
  ["display", "Showroom Display"],
  ["service", "Service Case"],
] as const;
type InventoryView = (typeof STOCK_VIEWS)[number][0] | "history";

function matchesView(u: StockRegisterUnit, view: InventoryView) {
  if (view === "history") return !isCurrentUnit(u);
  if (!isHeldUnit(u)) return false;
  switch (view) {
    case "reserved":
      return u.availability === "reserved";
    case "ready":
      return u.availability === "available" && u.identityScope !== "quantity" && u.qty === 1;
    case "display":
      return u.siteName === "PJ Showroom" || u.condition === "exhibition" || u.purchasePurpose === "showroom_display";
    case "service":
      return u.purchasePurpose === "service_case";
    default:
      return true;
  }
}

const CATEGORY_LABEL: Record<string, string> = {
  mattress: "Mattress",
  bedframe: "Bedframe",
  sofa: "Sofa",
  accessory: "Accessory",
  service: "Service",
  guarantee: "Guarantee",
};
const CATEGORY_ORDER = ["mattress", "bedframe", "sofa", "accessory", "service", "guarantee"];

/** Owner ruling 2026-09-25: a fact that has not happened yet (no ship, no
 *  pickup, nowhere to go) stays BLANK — it is not an absence word and not the
 *  engine's dash, which is reserved for a counted row's Unit ID. */
function Blank() {
  return <span aria-hidden="true" />;
}

/** A Sales Order number is a door only when the Sales Order exists in this
 *  portal; an opening-stock row carries the old order's reference as text. */
function SoCell({ u }: { u: StockRegisterUnit }) {
  const navigate = useNavigate();
  if (!u.reservedRef) return <span className="text-kit-slate-11">No SO</span>;
  if (!u.soldOrderId) return <span className="font-mono">{u.reservedRef}</span>;
  return (
    <button
      type="button"
      className="font-mono text-kit-blue-11 hover:underline"
      onClick={() => navigate(`/operation/orders/${encodeURIComponent(u.soldOrderId!)}`)}
    >
      {u.reservedRef}
    </button>
  );
}

export default function WarehouseStockRegister() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedUnit = params.get("unit");
  const unitHref = (code: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", "stock-onhand");
    next.set("unit", code);
    return `/operation?${next}`;
  };
  const { data, isLoading, isError, error, refetch } = useStockRegister();
  const [railOpen, setRailOpen] = useState(true);
  const requestedView = params.get("view");
  const view: InventoryView =
    params.get("history") === "1" || requestedView === "history"
      ? "history"
      : STOCK_VIEWS.some(([key]) => key === requestedView)
        ? (requestedView as InventoryView)
        : "all";
  const requestedStatus = params.get("status");
  const status: InventoryStatus | null = INVENTORY_STATUS_RAIL.includes(requestedStatus as InventoryStatus)
    ? (requestedStatus as InventoryStatus)
    : null;
  const sourceReady = !!data && !isLoading && !isError;

  function setView(next: InventoryView) {
    const updated = new URLSearchParams(params);
    updated.set("tab", "stock-onhand");
    updated.delete("history");
    updated.delete("status");
    if (next === "all") updated.delete("view");
    else updated.set("view", next);
    setParams(updated, { replace: true });
  }
  function setStatus(next: InventoryStatus) {
    const updated = new URLSearchParams(params);
    updated.set("tab", "stock-onhand");
    updated.delete("view");
    updated.delete("history");
    if (status === next) updated.delete("status");
    else updated.set("status", next);
    setParams(updated, { replace: true });
  }

  /** The rail lives in the URL so a narrowed view can be sent to a colleague
   *  and comes back the same. */
  const sel: StockRailSelection = useMemo(
    () => ({
      attention: null,
      availability: null,
      site: params.get("site"),
      ownership: params.get("ownership"),
      category: params.get("category"),
      changed: null,
      query: "",
      showEnded: view === "history",
    }),
    [params, view],
  );

  const [search, setSearch] = useState("");
  const [gridRevision, setGridRevision] = useState(0);
  const now = useMemo(() => new Date(), []);
  const allUnits = useMemo(() => data?.units ?? [], [data]);

  function setRail(key: "ownership" | "category" | "site", value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null || next.get(key) === value) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  function clearAll() {
    setParams(new URLSearchParams({ tab: "stock-onhand" }), { replace: true });
    setSearch("");
    setGridRevision((revision) => revision + 1);
  }

  /** Facet counts describe the goods Carres holds before any narrowing. */
  const heldUnits = useMemo(() => allUnits.filter(isHeldUnit), [allUnits]);
  const incomingCount = useMemo(
    () => allUnits.filter((u) => u.availability === "incoming").length,
    [allUnits],
  );

  const counts = useMemo(() => {
    const ownership = new Map<string, number>();
    const category = new Map<string, number>();
    const byStatus = new Map<InventoryStatus, number>();
    for (const u of heldUnits) {
      ownership.set(u.ownership, (ownership.get(u.ownership) ?? 0) + 1);
      const ck = categoryKeyOf(u);
      category.set(ck, (category.get(ck) ?? 0) + 1);
      const word = inventoryStatusOf(u);
      if (word) byStatus.set(word, (byStatus.get(word) ?? 0) + 1);
    }
    byStatus.set("Incoming", incomingCount);
    return { ownership, category, byStatus };
  }, [heldUnits, incomingCount]);

  const scopedRows = useMemo(() => {
    if (view === "history") return allUnits.filter((u) => !isCurrentUnit(u));
    if (status === "Incoming") return allUnits.filter((u) => u.availability === "incoming");
    const held = view === "all" ? heldUnits : heldUnits.filter((u) => matchesView(u, view));
    return status ? held.filter((u) => inventoryStatusOf(u) === status) : held;
  }, [allUnits, heldUnits, view, status]);

  const rows = useMemo(
    () => applyRailSelection(scopedRows, { ...sel, query: search }, now),
    [scopedRows, sel, search, now],
  );

  const categoryKeys = useMemo(() => {
    const present = [...counts.category.keys()].filter((k) => k !== NO_CATALOG_KEY);
    return [
      ...CATEGORY_ORDER.filter((c) => present.includes(c)),
      ...present.filter((c) => !CATEGORY_ORDER.includes(c)).sort(),
    ];
  }, [counts.category]);

  const dateColumn = (
    key: "goodsReceivedDate" | "shipDate" | "soDate" | "poDate" | "expectedArrival" | "lastVerifiedAt" | "lastEventAt",
    label: string,
    options: { absent?: string; defaultHidden?: boolean; chooserGroup: string; width?: number; headerLines?: readonly [string, string] },
  ): DataGridColumn<StockRegisterUnit> => ({
    key,
    label,
    headerLines: options.headerLines,
    width: options.width ?? 104,
    sortable: true,
    filterType: "date",
    defaultHidden: options.defaultHidden,
    chooserGroup: options.chooserGroup,
    dateValue: (u) => u[key] ?? null,
    exportValue: (u) => u[key] ?? "",
    accessor: (u) =>
      u[key] ? (
        <span className="text-body text-base-900">{fmtDate(u[key]!)}</span>
      ) : options.absent ? (
        <span className="text-body text-kit-slate-11">{options.absent}</span>
      ) : (
        <Blank />
      ),
  });

  const columns: DataGridColumn<StockRegisterUnit>[] = useMemo(
    () => [
      // A governed header sets the column's minimum width; the two-line
      // presentation keeps the label and recovers the width a one-line
      // `Goods Received Date` would spend (Receiving does the same).
      dateColumn("goodsReceivedDate", "Goods Received Date", { absent: "Not received", chooserGroup: "Dates", width: 112, headerLines: ["Goods Received", "Date"] }),
      dateColumn("shipDate", "Ship Date", { chooserGroup: "Dates" }),
      {
        key: "so",
        label: "SO No",
        width: 130,
        sortable: true,
        chooserGroup: "Documents",
        searchValue: (u) => u.reservedRef ?? "",
        exportValue: (u) => u.reservedRef ?? "No SO",
        accessor: (u) => <SoCell u={u} />,
      },
      {
        key: "inventoryStatus",
        label: "Inventory Status",
        headerLines: ["Inventory", "Status"],
        width: 108,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Unit",
        filterValue: (u) => inventoryStatusOf(u) ?? UNIT_LIFECYCLE_OUTCOME_LABEL[u.lifecycleOutcome as UnitLifecycleOutcome] ?? u.lifecycleOutcome,
        exportValue: (u) => inventoryStatusOf(u) ?? UNIT_LIFECYCLE_OUTCOME_LABEL[u.lifecycleOutcome as UnitLifecycleOutcome] ?? u.lifecycleOutcome,
        accessor: (u) => {
          const word = inventoryStatusOf(u);
          return (
            <span className="text-body text-base-900">
              {word ?? UNIT_LIFECYCLE_OUTCOME_LABEL[u.lifecycleOutcome as UnitLifecycleOutcome] ?? u.lifecycleOutcome}
            </span>
          );
        },
      },
      {
        key: "stockCondition",
        label: "Stock Condition",
        headerLines: ["Stock", "Condition"],
        // `Waiting inspection` is the longest governed word; it is never cut.
        width: 140,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Unit",
        filterValue: (u) => stockConditionOf(u),
        exportValue: (u) => stockConditionOf(u),
        accessor: (u) => <span className="text-body text-base-900">{stockConditionOf(u)}</span>,
      },
      {
        key: "poNo",
        label: "PO No / Ref No",
        headerLines: ["PO No /", "Ref No"],
        width: 130,
        sortable: true,
        chooserGroup: "Documents",
        searchValue: (u) => u.poNo ?? "",
        exportValue: (u) => u.poNo ?? "Not recorded",
        accessor: (u) =>
          u.poNo ? (
            <button
              type="button"
              className="font-mono text-kit-blue-11 hover:underline"
              onClick={() => navigate(`/operation/procurement?po=${encodeURIComponent(u.poNo!)}`)}
            >
              {u.poNo}
            </button>
          ) : (
            <span className="text-body text-kit-slate-11">Not recorded</span>
          ),
      },
      {
        key: "unitCode",
        label: "Unit ID",
        width: 118,
        sortable: true,
        chooserGroup: "Unit",
        // Display, search and EXPORT all read the one resolver. Counted goods
        // have no identity, so the column prints `—` rather than the technical
        // key that keys their row (0453).
        searchValue: (u) => unitIdOf(u) ?? "",
        exportValue: (u) => displayUnitId(u),
        accessor: (u) =>
          unitIdOf(u) ? (
            <Link className="font-mono font-medium text-kit-blue-11 hover:underline" to={unitHref(unitIdOf(u)!)}>
              {displayUnitId(u)}
            </Link>
          ) : (
            <span className="font-mono text-base-900">—</span>
          ),
      },
      {
        key: "item",
        label: "Item",
        width: 210,
        sortable: true,
        chooserGroup: "Unit",
        overflowText: (u) => `${u.productName ?? u.sku} · ${u.sku}${u.qty > 1 ? ` ×${u.qty}` : ""}`,
        searchValue: (u) => `${u.productName ?? ""} ${u.sku}`,
        exportValue: (u) => `${u.productName ?? u.sku} · ${u.sku}${u.qty > 1 ? ` ×${u.qty}` : ""}`,
        accessor: (u) => (
          <span className="text-body text-base-900" title={`${u.productName ?? u.sku} · ${u.sku}`}>
            {u.productName ?? u.sku}
            <span className="text-base-600"> · {u.sku}</span>
            {u.qty > 1 ? <span className="text-base-900"> ×{u.qty}</span> : null}
          </span>
        ),
      },
      {
        key: "pickupBy",
        label: "Pickup By",
        width: 110,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Movement",
        filterValue: (u) => u.pickupBy ?? "",
        exportValue: (u) => u.pickupBy ?? "",
        accessor: (u) => (u.pickupBy ? <span className="text-body text-base-900">{u.pickupBy}</span> : <Blank />),
      },
      {
        key: "site",
        label: "Stock Location",
        headerLines: ["Stock", "Location"],
        width: 130,
        sortable: true,
        filterType: "enum",
        chooserGroup: "Movement",
        filterValue: (u) => u.siteName ?? "Not recorded",
        exportValue: (u) => u.siteName ?? "Not recorded",
        accessor: (u) =>
          u.siteName ? (
            <span className="text-body text-base-900">{u.siteName}</span>
          ) : (
            <span className="text-body text-kit-slate-11">Not recorded</span>
          ),
      },
      {
        key: "deliveryLocation",
        label: "Delivery Location",
        headerLines: ["Delivery", "Location"],
        width: 200,
        sortable: true,
        chooserGroup: "Movement",
        overflowText: (u) => u.deliveryLocation ?? "",
        searchValue: (u) => u.deliveryLocation ?? "",
        exportValue: (u) => u.deliveryLocation ?? "",
        accessor: (u) =>
          u.deliveryLocation ? <span className="text-body text-base-900">{u.deliveryLocation}</span> : <Blank />,
      },
      // ── One click away in Columns ──────────────────────────────────────
      {
        key: "ownership",
        label: "Ownership",
        width: 160,
        sortable: true,
        defaultHidden: true,
        filterType: "enum",
        chooserGroup: "Unit",
        filterValue: (u) => UNIT_OWNERSHIP_LABEL[u.ownership as keyof typeof UNIT_OWNERSHIP_LABEL] ?? u.ownership,
        exportValue: (u) => UNIT_OWNERSHIP_LABEL[u.ownership as keyof typeof UNIT_OWNERSHIP_LABEL] ?? u.ownership,
        accessor: (u) => (
          <span className="text-body text-base-900">
            {UNIT_OWNERSHIP_LABEL[u.ownership as keyof typeof UNIT_OWNERSHIP_LABEL] ?? u.ownership}
          </span>
        ),
      },
      {
        key: "category",
        label: "Category",
        width: 120,
        sortable: true,
        defaultHidden: true,
        filterType: "enum",
        chooserGroup: "Unit",
        filterValue: (u) => CATEGORY_LABEL[u.category ?? ""] ?? (u.category ?? NO_CATALOG_LABEL),
        exportValue: (u) => CATEGORY_LABEL[u.category ?? ""] ?? (u.category ?? NO_CATALOG_LABEL),
        accessor: (u) => (
          <span className="text-body text-base-900">{CATEGORY_LABEL[u.category ?? ""] ?? (u.category ?? NO_CATALOG_LABEL)}</span>
        ),
      },
      {
        key: "supplier",
        label: "Supplier",
        width: 150,
        sortable: true,
        defaultHidden: true,
        chooserGroup: "Documents",
        searchValue: (u) => u.supplier ?? "",
        exportValue: (u) => u.supplier ?? "",
        accessor: (u) =>
          u.supplier ? (
            <span className="text-body text-base-900">{u.supplier}</span>
          ) : (
            <span className="text-body text-kit-slate-11">Not recorded</span>
          ),
      },
      dateColumn("soDate", "SO Date", { defaultHidden: true, chooserGroup: "Dates" }),
      dateColumn("poDate", "PO Doc Date", { defaultHidden: true, chooserGroup: "Dates" }),
      dateColumn("expectedArrival", "Expected arrival", { defaultHidden: true, chooserGroup: "Dates" }),
      dateColumn("lastVerifiedAt", "Last verified", { defaultHidden: true, chooserGroup: "Dates" }),
      dateColumn("lastEventAt", "Last moved", { defaultHidden: true, chooserGroup: "Dates", absent: "Not moved yet" }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, params],
  );

  const filtered = isRailFiltered({ ...sel, query: search }) || !!status || view !== "all";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {selectedUnit && (
        <WarehouseUnitDetail
          unitCode={selectedUnit}
          onBack={() => {
            const next = new URLSearchParams(params);
            next.delete("unit");
            setParams(next);
          }}
        />
      )}
      {/* Keep the grid mounted: its search, column filters and viewport belong
          to this visit, including browser Back from the selected Unit. */}
      <div hidden={!!selectedUnit} className={selectedUnit ? "hidden" : "flex min-h-0 flex-1 flex-col"}>
        {!selectedUnit && (
          <ModuleHeader
            testId="stock-register-destination-header"
            word="Inventory"
            docTitle="Inventory · Warehouse — Carres"
            right={
              <Link className="text-kit-blue-11 text-body" to="/operation?tab=arrival-source&kind=transfer">
                Request Transfer
              </Link>
            }
            destinationHeader
          />
        )}
        <div className="flex min-h-0 flex-1" data-testid="stock-register">
          {railOpen ? (
            <FilterRail testId="stock-rail" onHide={() => setRailOpen(false)}>
              <FilterRailGroup title="Stock" icon="order">
                {STOCK_VIEWS.map(([key, label]) => (
                  <FilterRailRow
                    key={key}
                    testId={key === "all" ? "rail-all-stock" : `rail-${key}`}
                    label={label}
                    active={view === key && !status}
                    resets={key === "all"}
                    count={sourceReady ? (key === "all" ? heldUnits.length : heldUnits.filter((u) => matchesView(u, key)).length) : undefined}
                    onClick={() => (key === "all" ? clearAll() : setView(key))}
                  />
                ))}
                {INVENTORY_STATUS_RAIL.map((word) => (
                  <FilterRailRow
                    key={word}
                    testId={`rail-status-${word.toLowerCase().replace(/\s+/g, "-")}`}
                    label={word}
                    active={status === word}
                    count={sourceReady ? counts.byStatus.get(word) ?? 0 : undefined}
                    onClick={() => setStatus(word)}
                  />
                ))}
              </FilterRailGroup>
              {sourceReady ? (
                <>
                  <FilterRailGroup title="Category" icon="goods">
                    {categoryKeys.map((key) => (
                      <FilterRailRow
                        key={key}
                        testId={`rail-category-${key}`}
                        label={CATEGORY_LABEL[key] ?? key}
                        count={counts.category.get(key) ?? 0}
                        active={sel.category === key}
                        onClick={() => setRail("category", key)}
                      />
                    ))}
                    {(counts.category.get(NO_CATALOG_KEY) ?? 0) > 0 ? (
                      <FilterRailRow
                        testId="rail-no-catalog"
                        label={NO_CATALOG_LABEL}
                        count={counts.category.get(NO_CATALOG_KEY)}
                        active={sel.category === NO_CATALOG_KEY}
                        onClick={() => setRail("category", NO_CATALOG_KEY)}
                      />
                    ) : null}
                  </FilterRailGroup>
                  <FilterRailGroup title="Ownership" icon="customer">
                    {[...counts.ownership].map(([id, count]) => (
                      <FilterRailRow
                        key={id}
                        testId={`rail-ownership-${id}`}
                        label={UNIT_OWNERSHIP_LABEL[id as keyof typeof UNIT_OWNERSHIP_LABEL] ?? id}
                        count={count}
                        active={sel.ownership === id}
                        onClick={() => setRail("ownership", id)}
                      />
                    ))}
                  </FilterRailGroup>
                </>
              ) : null}
              <FilterRailGroup title="Control" icon="history">
                <FilterRailRow
                  testId="rail-history"
                  label="History"
                  active={view === "history"}
                  count={sourceReady ? allUnits.filter((u) => !isCurrentUnit(u)).length : undefined}
                  onClick={() => setView("history")}
                />
              </FilterRailGroup>
            </FilterRail>
          ) : null}

          {/* ── THE REGISTER ───────────────────────────────────────────────── */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2" data-testid="register-column">
            {!railOpen || filtered ? (
              <div className="flex shrink-0 gap-2 pb-2">
                {!railOpen ? (
                  <Button icon="filter" onClick={() => setRailOpen(true)}>
                    Show filters
                  </Button>
                ) : null}
                {filtered ? <Button onClick={clearAll}>Clear filters</Button> : null}
              </div>
            ) : null}
            {isError ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white">
                <p className="text-body text-base-700">Stock could not be loaded</p>
                {(error as Error | undefined)?.message ? (
                  <p className="text-meta text-base-500">{(error as Error).message}</p>
                ) : null}
                <button
                  type="button"
                  className="rounded-md border border-base-200 bg-white px-3 py-1.5 text-meta font-medium text-base-700 hover:bg-base-50"
                  onClick={() => void refetch()}
                >
                  Try again
                </button>
              </div>
            ) : (
              <DataGrid<StockRegisterUnit>
                key={gridRevision}
                appearance="reference"
                rows={rows}
                columns={columns}
                storageKey="carres.warehouse.inventory.v5"
                rowKey={(u) => u.id}
                exportName="Inventory"
                searchPlaceholder="Unit ID, item, SO No, PO No or supplier…"
                isLoading={isLoading || !data}
                onSearchChange={setSearch}
                /* ⭐ The owner's order puts Unit ID seventh; once the sheet scrolls
                   the identity pins after the gutter and the facts slide under it. */
                stickyIdentity={{ columnKey: "unitCode" }}
                rowHeight={40}
                groupBanner={false}
                chooserGroupOrder={["Dates", "Documents", "Unit", "Movement"]}
                onRowDoubleClick={(u) => {
                  // A counted row has no Unit page to open — it is not a Unit.
                  const id = unitIdOf(u);
                  if (id) navigate(unitHref(id));
                }}
                emptyMessage={
                  allUnits.length === 0
                    ? "No stock in Carres control yet."
                    : "No stock matches these filters."
                }
                statusSummary={(visibleRows) => {
                  /* UI MASTER §6.0: the 32px footer carries the summary; the
                     second fact is how many goods are still owed. */
                  const line = registerSummaryLine(summariseRegister(visibleRows), scopedRows.length);
                  const owed = view === "all" && !status ? stillToArriveLine(incomingCount) : null;
                  const text = owed ? `${line} · ${owed}` : line;
                  return (
                    <span className="block truncate" title={text}>
                      {text}
                    </span>
                  );
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
