import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  applyRailSelection,
  ATTENTION_REASONS,
  availabilityLabel,
  categoryKeyOf,
  changedWithin,
  CHANGED_SCOPES,
  hasAttention,
  isCurrentUnit,
  isRailFiltered,
  NO_CATALOG_KEY,
  NO_CATALOG_LABEL,
  registerSummaryLine,
  summariseRegister,
  UNIT_AVAILABILITY,
  UNIT_OWNERSHIP_LABEL,
  type AttentionReason,
  type ChangedScope,
  type StockRailSelection,
  type StockRegisterUnit,
  type UnitAvailability,
  displayUnitId,
  unitIdOf,
  READY_STOCK_CONDITION_WORDS,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { useStockRegister } from "@/lib/queries";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ModuleHeader from "./components/ModuleHeader";
import { FilterRail, FilterRailGroup, FilterRailRow } from "./components/workspace-rail";
import Button from "@/components/kit/Button";
import WarehouseUnitDetail from "./WarehouseUnitDetail";

/** Inventory is the current Unit Register. Its 240px rail narrows the same
 * authority; source facts are read-only. Sales Order alone owns reservation. */
const STOCK_VIEWS = [
  ["all", "All stock"], ["reserved", "Reserved for Sales Orders"],
  ["ready", "Ready Stock"], ["display", "Showroom Display"],
  ["service", "Service Case"], ["checking", "Needs checking"],
] as const;
type InventoryView = typeof STOCK_VIEWS[number][0] | "history";
function matchesView(u: StockRegisterUnit, view: InventoryView) {
  if (view === "history") return !isCurrentUnit(u);
  if (!isCurrentUnit(u)) return false;
  switch (view) {
    case "reserved": return u.availability === "reserved";
    case "ready": return u.availability === "available" && u.qty === 1;
    case "display": return u.condition === "exhibition" || u.purchasePurpose === "showroom_display";
    case "service": return u.purchasePurpose === "service_case";
    case "checking": return ATTENTION_REASONS.some((r) => hasAttention(u, r));
    default: return true;
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

/** Availability decides the dot's colour. The ARITHMETIC is 0366's; this only
 *  paints the answer it was handed. */
const AVAILABILITY_DOT: Record<UnitAvailability, string> = {
  available: "bg-kit-green-11",
  reserved: "bg-kit-blue-9",
  incoming: "bg-kit-slate-9",
  in_transit: "bg-kit-amber-11",
  not_available: "bg-kit-red-9",
  ended: "bg-kit-slate-5",
};

export default function WarehouseStockRegister() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedUnit = params.get("unit");
  useEffect(() => {
    // Unit Detail owns the title while open. Its unmount cleanup must not
    // replace Inventory's title when the still-mounted register returns.
    if (!selectedUnit) document.title = "Inventory · Warehouse — Carres";
  }, [selectedUnit]);
  const unitHref = (code: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", "stock-onhand");
    next.set("unit", code);
    return `/operation?${next}`;
  };
  const { data, isLoading, isError, error, refetch } = useStockRegister();
  const [railOpen, setRailOpen] = useState(true);
  const requestedView = params.get("view");
  const view: InventoryView = params.get("history") === "1" || requestedView === "history" ? "history"
    : STOCK_VIEWS.some(([key]) => key === requestedView) ? requestedView as InventoryView : "all";
  const holder = params.get("holder");
  const sourceReady = !!data && !isLoading && !isError;
  function setView(next: InventoryView) {
    const updated = new URLSearchParams(params);
    updated.set("tab", "stock-onhand");
    updated.delete("history");
    if (next === "all") updated.delete("view"); else updated.set("view", next);
    setParams(updated, { replace: true });
  }
  function setHolder(next: string) {
    const updated = new URLSearchParams(params);
    if (holder === next) updated.delete("holder"); else updated.set("holder", next);
    setParams(updated, { replace: true });
  }

  /** The rail lives in the URL so a narrowed view can be sent to a colleague
   *  and comes back the same (Card §6 — deep-link behaviour). */
  const sel: StockRailSelection = useMemo(
    () => ({
      attention: (params.get("attention") as AttentionReason | null) ?? null,
      availability: (params.get("availability") as UnitAvailability | null) ?? null,
      site: params.get("site"),
      ownership: params.get("ownership"),
      category: params.get("category"),
      changed: (params.get("changed") as ChangedScope | null) ?? null,
      query: "",
      showEnded: view === "history",
    }),
    [params, view],
  );

  const [search, setSearch] = useState("");
  const [gridRevision, setGridRevision] = useState(0);
  const now = useMemo(() => new Date(), []);
  const allUnits = useMemo(() => data?.units ?? [], [data]);

  function setRail(key: keyof StockRailSelection, value: string | null) {
    const next = new URLSearchParams(params);
    const urlKey = key === "showEnded" ? "history" : key;
    // One selection applies WITHIN a section: picking the active chip clears it.
    if (value === null || next.get(urlKey) === value) next.delete(urlKey);
    else next.set(urlKey, value);
    setParams(next, { replace: true });
  }

  function clearAll() {
    setParams(new URLSearchParams({ tab: "stock-onhand" }), { replace: true });
    setSearch("");
    setGridRevision((revision) => revision + 1);
  }

  /** Facet counts describe the whole current Register before narrowing it. */
  const currentUnits = useMemo(
    () => allUnits.filter((u) => (sel.showEnded ? true : isCurrentUnit(u))),
    [allUnits, sel.showEnded],
  );

  const counts = useMemo(() => {
    const availability = new Map<string, number>();
    const attention = new Map<string, number>();
    const site = new Map<string, { name: string; n: number }>();
    const ownership = new Map<string, number>();
    const category = new Map<string, number>();
    const changed = new Map<string, number>();

    for (const u of currentUnits) {
      availability.set(u.availability, (availability.get(u.availability) ?? 0) + 1);
      for (const r of ATTENTION_REASONS) {
        if (hasAttention(u, r)) attention.set(r, (attention.get(r) ?? 0) + 1);
      }
      if (u.warehouseId) {
        const prev = site.get(u.warehouseId);
        site.set(u.warehouseId, { name: u.siteName ?? "Unnamed site", n: (prev?.n ?? 0) + 1 });
      }
      ownership.set(u.ownership, (ownership.get(u.ownership) ?? 0) + 1);
      const ck = categoryKeyOf(u);
      category.set(ck, (category.get(ck) ?? 0) + 1);
      for (const scope of CHANGED_SCOPES) {
        if (changedWithin(u, scope, now)) changed.set(scope, (changed.get(scope) ?? 0) + 1);
      }
    }
    return { availability, attention, site, ownership, category, changed };
  }, [currentUnits, now]);

  const holderRows = useMemo(() => allUnits.filter((u) => !holder ||
    (holder === "not-recorded" ? !u.holderPartyId : u.holderPartyId === holder)), [allUnits, holder]);
  const rows = useMemo(() => applyRailSelection(
    view === "all" ? holderRows : holderRows.filter((u) => matchesView(u, view)),
    { ...sel, query: search }, now,
  ), [holderRows, view, sel, search, now]);
  const holders = useMemo(() => {
    const result = new Map<string, string>();
    for (const u of allUnits.filter(isCurrentUnit)) {
      result.set(u.holderPartyId ?? "not-recorded", u.holderName ?? "Not recorded");
    }
    return [...result].sort((a, b) => a[1].localeCompare(b[1]));
  }, [allUnits]);

  const categoryKeys = useMemo(() => {
    const present = [...counts.category.keys()].filter((k) => k !== NO_CATALOG_KEY);
    return [
      ...CATEGORY_ORDER.filter((c) => present.includes(c)),
      ...present.filter((c) => !CATEGORY_ORDER.includes(c)).sort(),
    ];
  }, [counts.category]);

  const columns: DataGridColumn<StockRegisterUnit>[] = useMemo(
    () => [
      {
        key: "unitCode",
        label: "Unit ID",
        width: 130,
        wrap: true,
        sortable: true,
        // Display, search and EXPORT all read the one resolver. Counted goods
        // have no identity, so the column prints `—` rather than the technical
        // key that keys their row (0453).
        searchValue: (u) => unitIdOf(u) ?? "",
        exportValue: (u) => displayUnitId(u),
        chooserGroup: "Unit",
        accessor: (u) => (
          unitIdOf(u) ? <Link className="font-mono text-meta text-kit-blue-11 hover:underline" to={unitHref(unitIdOf(u)!)}>{displayUnitId(u)}</Link> : <span className="font-mono text-meta text-base-900">—</span>
        ),
      },
      {
        key: "sku",
        label: "Product",
        width: 195,
        wrap: true,
        sortable: true,
        searchValue: (u) => `${u.productName ?? ""} ${u.sku}`,
        exportValue: (u) => [u.productName, u.sku, `Qty ${u.qty}`].filter(Boolean).join(" · "),
        chooserGroup: "Unit",
        accessor: (u) => (
          <div className="min-w-0 whitespace-normal break-words">
            <div className="whitespace-normal break-words text-body text-base-900" title={u.productName ?? u.sku}>
              {u.productName ?? u.sku}
            </div>
            <div className="whitespace-normal break-words text-meta text-base-500">{u.sku} · {u.category ?? "Not in catalog"}</div>
            <div className="text-meta text-base-700">Qty {u.qty}</div>
            {/* An inline second line is the ONE exception to a single-line row
                (Constitution §2) — and it earns it: a bulk record is not one
                Unit, and the operator must see that before promising it. */}
            {u.qty > 1 ? (
              <div className="text-meta text-kit-amber-11">
                {u.qty} pieces in one record — cannot be promised individually
              </div>
            ) : null}
          </div>
        ),
      },
      {
        key: "availability",
        label: "Stock use",
        defaultHidden: true,
        width: 150,
        sortable: true,
        filterType: "enum",
        filterValue: (u) => availabilityLabel(u.availability),
        exportValue: (u) => availabilityLabel(u.availability),
        chooserGroup: "Unit",
        accessor: (u) => (
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${AVAILABILITY_DOT[u.availability]}`} />
            <span className="text-meta text-base-800">{availabilityLabel(u.availability)}</span>
          </span>
        ),
      },
      {
        key: "site",
        label: "Site / stock use",
        width: 160,
        wrap: true,
        sortable: true,
        filterType: "enum",
        filterValue: (u) => u.siteName ?? "Not recorded",
        exportValue: (u) => u.siteName ?? "",
        chooserGroup: "Place",
        accessor: (u) => (
          <div className="space-y-1 whitespace-normal break-words text-meta text-base-800">
            <div>{u.siteName ?? "Site not recorded"}</div>
            <div>Who has it · {u.holderName ?? "Not recorded"}</div>
            <div>{availabilityLabel(u.availability)} · {READY_STOCK_CONDITION_WORDS[u.condition] ?? u.condition}</div>
            {attentionSentence(u) && <div className="text-kit-amber-11">{attentionSentence(u)}</div>}
          </div>
        ),
      },
      {
        key: "holder",
        label: "Who has it",
        defaultHidden: true,
        width: 150,
        sortable: true,
        filterType: "enum",
        filterValue: (u) => u.holderName ?? "Not recorded",
        exportValue: (u) => u.holderName ?? "",
        chooserGroup: "Place",
        accessor: (u) =>
          u.holderName ? (
            <span className="whitespace-normal break-words text-meta text-base-800">{u.holderName}</span>
          ) : (
            /* An absent holder stays absent instead of inventing an owner. */
            <span className="text-meta text-kit-slate-11">Not recorded</span>
          ),
      },
      {
        key: "ownership",
        label: "Ownership",
        width: 160,
        sortable: true,
        defaultHidden: true,
        filterType: "enum",
        filterValue: (u) => UNIT_OWNERSHIP_LABEL[u.ownership as keyof typeof UNIT_OWNERSHIP_LABEL] ?? u.ownership,
        exportValue: (u) => UNIT_OWNERSHIP_LABEL[u.ownership as keyof typeof UNIT_OWNERSHIP_LABEL] ?? u.ownership,
        chooserGroup: "Unit",
        accessor: (u) => (
          <span className="text-meta text-base-800">
            {UNIT_OWNERSHIP_LABEL[u.ownership as keyof typeof UNIT_OWNERSHIP_LABEL] ?? u.ownership}
          </span>
        ),
      },
      {
        key: "condition",
        label: "Condition",
        defaultHidden: true,
        width: 130,
        sortable: true,
        filterType: "enum",
        filterValue: (u) => READY_STOCK_CONDITION_WORDS[u.condition] ?? u.condition,
        exportValue: (u) => READY_STOCK_CONDITION_WORDS[u.condition] ?? u.condition,
        chooserGroup: "Unit",
        accessor: (u) => (
          <span className="text-meta text-base-800">{READY_STOCK_CONDITION_WORDS[u.condition] ?? u.condition}</span>
        ),
      },
      {
        key: "attention",
        label: "Needs checking",
        defaultHidden: true,
        minWidth: 190,
        chooserGroup: "Unit",
        exportValue: (u) => attentionSentence(u) ?? "",
        /* Card §2: ONE current attention item, and only when action is genuinely
           open. It does not repeat the Unit ID or the product — those are the
           row's own metadata, and saying them twice is what the card forbids. */
        accessor: (u) => {
          const line = attentionSentence(u);
          return line ? (
            <span className="whitespace-normal break-words text-meta text-kit-amber-11" title={line}>
              {line}
            </span>
          ) : (
            <span className="text-meta text-base-300">Not recorded</span>
          );
        },
      },
      {
        key: "source",
        label: "Orders / dates",
        width: 230,
        wrap: true,
        sortable: true,
        searchValue: (u) => u.poNo ?? "",
        exportValue: (u) => u.poNo ?? "",
        chooserGroup: "Source",
        accessor: (u) => <div className="space-y-1 whitespace-normal break-words text-meta">
          <div>{u.poNo ? <button className="font-mono text-kit-blue-11 hover:underline" onClick={() => navigate(`/operation/procurement?po=${encodeURIComponent(u.poNo!)}`)}>{u.poNo}</button> : "No purchase order"}</div>
          <div>PO issued · {u.poDate ? fmtDate(u.poDate) : "Not recorded"}</div>
          <div>{u.soldOrderId && u.reservedRef ? <button className="font-mono text-kit-blue-11 hover:underline" onClick={() => navigate(`/operation/orders/${encodeURIComponent(u.soldOrderId!)}`)}>{u.reservedRef}</button> : u.reservedRef ?? "No Sales Order"}</div>
          <div>SO issued · {u.soDate ? fmtDate(u.soDate) : "Not recorded"}</div>
          <div>Expected arrival · {u.expectedArrival ? fmtDate(u.expectedArrival) : "Not recorded"}</div>
          <div>Last verified · {u.lastVerifiedAt ? fmtDate(u.lastVerifiedAt) : "Not recorded"}</div>
        </div>,
      },
      {
        key: "so", defaultHidden: true, label: "SO No", width: 150, sortable: true, chooserGroup: "Source",
        searchValue: (u) => u.reservedRef ?? "", exportValue: (u) => u.reservedRef ?? "",
        accessor: (u) => u.soldOrderId && u.reservedRef
          ? <button className="font-mono text-kit-blue-11 hover:underline" onClick={() => navigate(`/operation/orders/${encodeURIComponent(u.soldOrderId!)}`)}>{u.reservedRef}</button>
          : <span>{u.reservedRef ?? "Not recorded"}</span>,
      },
      ...([ ["soDate", "SO date"], ["poDate", "PO date"], ["expectedArrival", "Expected arrival"], ["lastVerifiedAt", "Last verified"] ] as const).map(([key, label]): DataGridColumn<StockRegisterUnit> => ({
        key, label, defaultHidden: true, width: 150, sortable: true, filterType: "date", chooserGroup: "Dates",
        dateValue: (u) => u[key] ?? null, exportValue: (u) => u[key] ?? "",
        accessor: (u) => u[key] ? fmtDate(u[key]!) : "Not recorded",
      })),
      {
        key: "supplier",
        label: "Supplier",
        width: 150,
        sortable: true,
        defaultHidden: true,
        searchValue: (u) => u.supplier ?? "",
        exportValue: (u) => u.supplier ?? "",
        chooserGroup: "Source",
        accessor: (u) => (
          <span className="whitespace-normal break-words text-meta text-base-700">{u.supplier ?? "Not recorded"}</span>
        ),
      },
      {
        key: "lastEventAt",
        label: "Last moved",
        width: 150,
        sortable: true,
        defaultHidden: true,
        filterType: "date",
        dateValue: (u) => u.lastEventAt,
        exportValue: (u) => u.lastEventAt ?? "",
        chooserGroup: "Dates",
        accessor: (u) =>
          u.lastEventAt ? (
            <span className="text-meta text-base-700">{fmtDate(u.lastEventAt)}</span>
          ) : (
            <span className="text-meta text-kit-slate-11">Not moved yet</span>
          ),
      },
    ],
    [navigate, params],
  );

  const filtered = isRailFiltered({ ...sel, query: search }) || !!holder || view !== "all";

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      {selectedUnit && <div className="absolute inset-0 flex min-h-0 flex-col"><WarehouseUnitDetail unitCode={selectedUnit} onBack={() => {
        const next = new URLSearchParams(params);
        next.delete("unit");
        setParams(next);
      }} /></div>}
      {/* Keep the grid mounted: its search, column filters and viewport belong
          to this visit, including browser Back from the selected Unit. Visibility
          preserves the virtualizer viewport; display:none would reset it. */}
      <div aria-hidden={!!selectedUnit} style={{ visibility: selectedUnit ? "hidden" : undefined }} className="flex min-h-0 flex-1 flex-col">
      <ModuleHeader
        testId="stock-register-destination-header"
        word="Inventory"
        docTitle="Inventory · Warehouse — Carres"
        right={<Link className="text-kit-blue-11 text-body" to="/operation?tab=arrival-source&kind=transfer">Request Transfer</Link>}
        destinationHeader
      />
      <div className="flex min-h-0 flex-1" data-testid="stock-register">
        {railOpen ? <FilterRail testId="stock-rail" onHide={() => setRailOpen(false)}>
          <FilterRailGroup title="Stock" icon="order">
            {STOCK_VIEWS.map(([key, label]) => <FilterRailRow key={key} testId={key === "all" ? "rail-all-stock" : `rail-${key}`}
              label={label} active={view === key} resets={key === "all"} count={sourceReady ? allUnits.filter((u) => matchesView(u, key)).length : undefined}
              onClick={() => key === "all" ? clearAll() : setView(key)} />)}
          </FilterRailGroup>
          {sourceReady ? <>
            <FilterRailGroup title="Who has it" icon="people">{holders.map(([id, label]) => <FilterRailRow key={id} testId={`rail-holder-${id}`}
              label={label} active={holder === id} count={allUnits.filter((u) => isCurrentUnit(u) && (u.holderPartyId ?? "not-recorded") === id).length}
              onClick={() => setHolder(id)} />)}</FilterRailGroup>
            <FilterRailGroup title="Ownership" icon="customer">{[...counts.ownership].map(([id, count]) => <FilterRailRow key={id} testId={`rail-ownership-${id}`}
              label={UNIT_OWNERSHIP_LABEL[id as keyof typeof UNIT_OWNERSHIP_LABEL] ?? id} count={count} active={sel.ownership === id}
              onClick={() => setRail("ownership", id)} />)}</FilterRailGroup>
            <FilterRailGroup title="Site" icon="warehouse">{[...counts.site].map(([id, item]) => <FilterRailRow key={id} testId={`rail-site-${id}`}
              label={item.name} count={item.n} active={sel.site === id} onClick={() => setRail("site", id)} />)}</FilterRailGroup>
            <FilterRailGroup title="Stock use" icon="ready">{UNIT_AVAILABILITY.filter((a) => a !== "ended").map((a) => <FilterRailRow key={a} testId={`rail-availability-${a}`}
              label={availabilityLabel(a)} count={counts.availability.get(a) ?? 0} active={sel.availability === a} onClick={() => setRail("availability", a)} />)}</FilterRailGroup>
            <FilterRailGroup title="Category" icon="goods">{categoryKeys.map((key) => <FilterRailRow key={key} testId={`rail-category-${key}`}
              label={CATEGORY_LABEL[key] ?? key} count={counts.category.get(key) ?? 0} active={sel.category === key} onClick={() => setRail("category", key)} />)}
              {(counts.category.get(NO_CATALOG_KEY) ?? 0) > 0 ? <FilterRailRow testId="rail-no-catalog" label={NO_CATALOG_LABEL}
                count={counts.category.get(NO_CATALOG_KEY)} active={sel.category === NO_CATALOG_KEY} onClick={() => setRail("category", NO_CATALOG_KEY)} /> : null}
            </FilterRailGroup>
          </> : null}
          <FilterRailGroup title="History" icon="history"><FilterRailRow testId="rail-history" label="Delivered / history" active={view === "history"}
            count={sourceReady ? allUnits.filter((u) => !isCurrentUnit(u)).length : undefined} onClick={() => setView("history")} /></FilterRailGroup>
        </FilterRail> : null}

        {/* ── THE REGISTER ───────────────────────────────────────────────── */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2" data-testid="register-column">
          {!railOpen || filtered ? <div className="flex shrink-0 gap-2 pb-2">
            {!railOpen ? <Button icon="filter" onClick={() => setRailOpen(true)}>Show filters</Button> : null}
            {filtered ? <Button onClick={clearAll}>Clear filters</Button> : null}
          </div> : null}
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
              storageKey="carres.warehouse.inventory.v3"
              rowKey={(u) => u.id}
              exportName="Inventory"
              searchPlaceholder="Unit ID, product, PO, SO or supplier…"
              isLoading={isLoading || !data}
              onSearchChange={setSearch}
              stickyIdentity
              groupBanner={false}
              chooserGroupOrder={["Unit", "Place", "Source", "Dates"]}
              onRowDoubleClick={(u) => {
                // A counted row has no Unit page to open — it is not a Unit.
                const id = unitIdOf(u);
                if (id) navigate(unitHref(id));
              }}
              emptyMessage={
                allUnits.length === 0
                  ? "No Units yet — a Unit is created when a purchase order or consignment order is confirmed, and Receiving checks it in against the ID the supplier put on the label."
                  : "No Units match these filters."
              }
              statusSummary={(visibleRows) => {
                /* UI MASTER §6.7: the 32px footer carries the summary. No KPI
                   strip above the table — a Register is truth, not a dashboard. */
                const line = registerSummaryLine(summariseRegister(visibleRows), currentUnits.length);
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
    </div>
  );
}

/**
 * ONE current attention item, in the operator's words.
 *
 * Card §2 forbids repeating the Unit ID, SO, customer or owner inside the
 * sentence — those already belong to the row. Card §5 forbids `Review`,
 * `Handle`, `Follow up`, `Priority`, `Next Action` and `Mark done`, so every
 * line here names the OBSERVED FACT instead of a vague verb.
 */
function attentionSentence(u: StockRegisterUnit): string | null {
  if (u.holdReason) return "Waiting inspection";
  if (u.needsRepair) return "In repair";
  if (u.condition === "damaged") return "Damaged";
  if (!u.poNo) return "No purchase order";
  return null;
}
