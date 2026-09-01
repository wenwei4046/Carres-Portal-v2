import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PanelLeftOpen } from "lucide-react";
import {
  applyRailSelection,
  ATTENTION_REASONS,
  ATTENTION_REASON_LABEL,
  availabilityLabel,
  categoryKeyOf,
  exactUnitRecords,
  CHANGED_SCOPES,
  CHANGED_SCOPE_LABEL,
  hasAttention,
  holderKeyOf,
  isCurrentUnit,
  isRailFiltered,
  nextMovementLabel,
  stockAvailabilityLabel,
  NO_CATALOG_KEY,
  NO_CATALOG_LABEL,
  NO_HOLDER_LABEL,
  registerSummaryLine,
  summariseRegister,
  UNIT_AVAILABILITY,
  UNIT_OWNERSHIP_LABEL,
  type AttentionReason,
  type ChangedScope,
  type StockRailSelection,
  type StockRegisterUnit,
  type UnitAvailability,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { useStockRegister } from "@/lib/queries";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ModuleHeader from "./components/ModuleHeader";
import {
  FilterRail,
  FilterRailGroup,
  FilterRailRow,
} from "./components/workspace-rail";

/**
 * THE STOCK REGISTER — Warehouse's one current listing of controlled Units.
 * CARD-2026-08-20-stock-register · Stock MASTER §7 · UI MASTER §6.7.
 *
 * ── THE DESTINATION IS `Stock` ──────────────────────────────────────────────
 * Not `On hand`, not `Stock Units` (Card §1, Stock MASTER §2 rejects both by
 * name). `On hand` described a QUANTITY on a shelf; this page lists exact Units
 * and answers "which one, where, who has it, can it be used".
 *
 * ── READ-ONLY, DELIBERATELY ─────────────────────────────────────────────────
 * There is no row editor, no status selector, no Add stock, no Delete and no
 * reservation control anywhere on this page. Choosing, binding, substituting and
 * releasing an exact Unit are the SALES ORDER's decisions (Stock MASTER §4), and
 * 0366 removed the write policy that used to let a page reach around them. A
 * Register finds things; the Unit page shows one; work lives in Work.
 *
 * ── EXACT UNITS ONLY ─────────────────────────────────────────────────────────
 * Quantity-controlled records remain real governed pieces, but one qty=555 row
 * is not one exact Unit and is never expanded into invented identities here.
 *
 * ── THE RAIL IS DRAWN FROM FACTS THAT EXIST ─────────────────────────────────
 * Card §3 lists seven sections. Site and Ownership render only when the data
 * holds more than one value — a filter offering one choice is not a filter, and
 * today there is one Site and no consignment Unit. Five of the nine Attention
 * reasons have no column behind them at all and are recorded as a gap in
 * docs/stock/MASTER.md rather than drawn as chips that cannot answer anything.
 * `03-page-patterns.md:149` bans a control that does nothing.
 */

const CATEGORY_LABEL: Record<string, string> = {
  mattress: "Mattress",
  bedframe: "Bedframe",
  sofa: "Sofa",
  accessory: "Accessory",
  service: "Service",
  guarantee: "Guarantee",
};
const CATEGORY_ORDER = ["mattress", "bedframe", "sofa", "accessory", "service", "guarantee"];

const CONDITION_LABEL: Record<string, string> = {
  new: "New",
  exhibition: "Display",
  old: "Fair (used)",
  refurbished: "Refurbished",
  damaged: "Damaged",
};

const FILTER_RAIL_STORAGE_KEY = "carres.warehouse.stock.filterRail.v1";

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
  const { data, isLoading, isError, refetch } = useStockRegister();
  const railStorageKey = FILTER_RAIL_STORAGE_KEY;
  const [railOpen, setRailOpen] = useState(() => {
    try {
      return window.localStorage.getItem(railStorageKey) !== "0";
    } catch {
      return true;
    }
  });

  /** The rail lives in the URL so a narrowed view can be sent to a colleague
   *  and comes back the same (Card §6 — deep-link behaviour). */
  const sel: StockRailSelection = useMemo(
    () => ({
      attention: (params.get("attention") as AttentionReason | null) ?? null,
      availability: (params.get("availability") as UnitAvailability | null) ?? null,
      site: params.get("site"),
      holder: params.get("holder"),
      ownership: params.get("ownership"),
      category: params.get("category"),
      changed: (params.get("changed") as ChangedScope | null) ?? null,
      query: "",
      // Retired history URLs no longer widen Inventory. Ended Units remain
      // reachable only when their exact permanent ID is searched.
      showEnded: false,
    }),
    [params],
  );

  const [search, setSearch] = useState("");
  const now = useMemo(() => new Date(), []);
  const authorityUnits = useMemo(() => data?.units ?? [], [data]);
  const allUnits = useMemo(() => exactUnitRecords(authorityUnits), [authorityUnits]);

  const setRailVisible = useCallback((open: boolean) => {
    setRailOpen(open);
    try {
      window.localStorage.setItem(railStorageKey, open ? "1" : "0");
    } catch {
      // A locked-down browser may refuse storage; this visit still keeps the
      // live choice and the Register remains fully usable.
    }
  }, [railStorageKey]);

  function setRail(key: keyof StockRailSelection, value: string | null) {
    const next = new URLSearchParams(params);
    const urlKey = key === "showEnded" ? "history" : key;
    // One selection applies WITHIN a section: picking the active chip clears it.
    if (value === null || next.get(urlKey) === value) next.delete(urlKey);
    else next.set(urlKey, value);
    setParams(next, { replace: true });
  }

  function clearAll() {
    const next = new URLSearchParams(params);
    for (const key of [
      "attention",
      "availability",
      "site",
      "holder",
      "ownership",
      "category",
      "changed",
      "history",
    ]) {
      next.delete(key);
    }
    setParams(next, { replace: true });
    setSearch("");
  }

  /** Section counts are computed against everything the section does NOT filter,
   *  so a count never lies about what clicking it would show. */
  const currentUnits = useMemo(
    () => allUnits.filter((u) => (sel.showEnded ? true : isCurrentUnit(u))),
    [allUnits, sel.showEnded],
  );

  const rows = useMemo(
    () => applyRailSelection(allUnits, { ...sel, query: search }, now),
    [allUnits, sel, search, now],
  );

  /** Each option says what the Register would contain after choosing it. The
   *  choice replaces only its own section and keeps every other active filter. */
  const predictedCount = useCallback(
    (key: keyof StockRailSelection, value: string | boolean | null) =>
      applyRailSelection(
        allUnits,
        { ...sel, query: search, [key]: value } as StockRailSelection,
        now,
      ).length,
    [allUnits, now, search, sel],
  );

  const railValues = useMemo(() => {
    const sites = new Map<string, string>();
    const holders = new Map<string, string>();
    const ownership = new Set<string>();
    const categories = new Set<string>();
    const attention = new Set<AttentionReason>();
    for (const u of currentUnits) {
      if (u.warehouseId) sites.set(u.warehouseId, u.siteName ?? "Unnamed location");
      holders.set(holderKeyOf(u), u.holderName ?? NO_HOLDER_LABEL);
      ownership.add(u.ownership);
      categories.add(categoryKeyOf(u));
      for (const reason of ATTENTION_REASONS) {
        if (hasAttention(u, reason)) attention.add(reason);
      }
    }
    return { sites, holders, ownership, categories, attention };
  }, [currentUnits]);

  const categoryKeys = useMemo(() => {
    const present = [...railValues.categories].filter((k) => k !== NO_CATALOG_KEY);
    return [
      ...CATEGORY_ORDER.filter((c) => present.includes(c)),
      ...present.filter((c) => !CATEGORY_ORDER.includes(c)).sort(),
    ];
  }, [railValues.categories]);

  const columns: DataGridColumn<StockRegisterUnit>[] = useMemo(
    () => [
      {
        key: "unitCode",
        label: "Unit ID",
        width: 148,
        sortable: true,
        searchValue: (u) => u.unitCode,
        exportValue: (u) => u.unitCode,
        chooserGroup: "Inventory",
        accessor: (u) => (
          <span className="font-mono text-meta text-base-900">{u.unitCode}</span>
        ),
      },
      {
        key: "sku",
        label: "Product",
        minWidth: 220,
        sortable: true,
        searchValue: (u) => u.sku,
        exportValue: (u) => u.sku,
        chooserGroup: "Inventory",
        accessor: (u) => (
          <div className="min-w-0">
            <div className="truncate text-body text-base-900" title={u.sku}>
              {u.sku}
            </div>
          </div>
        ),
      },
      {
        key: "availability",
        label: "Availability",
        width: 150,
        sortable: true,
        filterType: "enum",
        filterValue: (u) => stockAvailabilityLabel(u),
        exportValue: (u) => stockAvailabilityLabel(u),
        chooserGroup: "Inventory",
        accessor: (u) => (
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${AVAILABILITY_DOT[u.availability]}`} />
            <span className="text-meta text-base-800">{stockAvailabilityLabel(u)}</span>
          </span>
        ),
      },
      {
        key: "site",
        label: "Location",
        width: 180,
        sortable: true,
        filterType: "enum",
        filterValue: (u) => u.siteName ?? "—",
        exportValue: (u) => u.siteName ?? "",
        chooserGroup: "Inventory",
        accessor: (u) => (
          <span className="truncate text-meta text-base-800">{u.siteName ?? "—"}</span>
        ),
      },
      {
        key: "holder",
        label: "Held by",
        width: 150,
        sortable: true,
        filterType: "enum",
        filterValue: (u) => u.holderName ?? "Not recorded",
        exportValue: (u) => u.holderName ?? "",
        chooserGroup: "Inventory",
        accessor: (u) =>
          u.holderName ? (
            <span className="truncate text-meta text-base-800">{u.holderName}</span>
          ) : (
            /* NULL on every Unit today: the column shipped hours ago and no door
               populates it yet. It says so rather than showing a false owner. */
            <span className="text-meta text-base-400">Not recorded</span>
          ),
      },
      {
        key: "condition",
        label: "Item condition",
        width: 130,
        sortable: true,
        filterType: "enum",
        filterValue: (u) => CONDITION_LABEL[u.condition] ?? u.condition,
        exportValue: (u) => CONDITION_LABEL[u.condition] ?? u.condition,
        chooserGroup: "Inventory",
        accessor: (u) => (
          <span className="text-meta text-base-800">{CONDITION_LABEL[u.condition] ?? u.condition}</span>
        ),
      },
      {
        key: "lastEventAt",
        label: "Last moved",
        width: 150,
        sortable: true,
        filterType: "date",
        dateValue: (u) => u.lastEventAt,
        exportValue: (u) => u.lastEventAt ?? "",
        chooserGroup: "Inventory",
        accessor: (u) =>
          u.lastEventAt ? (
            <span className="text-meta text-base-700">{fmtDate(u.lastEventAt)}</span>
          ) : (
            <span className="text-meta text-base-400">Not moved yet</span>
          ),
      },
      {
        key: "nextMovement",
        label: "Next movement",
        minWidth: 240,
        exportValue: (u) => nextMovementLabel(u),
        chooserGroup: "Inventory",
        accessor: (u) => {
          const label = nextMovementLabel(u);
          return <span className={`truncate text-meta ${label === "—" ? "text-base-400" : "text-base-800"}`}>{label}</span>;
        },
      },
      {
        key: "moveDate",
        label: "Move date",
        width: 140,
        sortable: true,
        filterType: "date",
        dateValue: (u) => u.moveDate ?? null,
        exportValue: (u) => u.moveDate ?? "",
        chooserGroup: "Inventory",
        accessor: (u) => u.moveDate ? (
          <span className="text-meta text-base-700">{fmtDate(u.moveDate)}</span>
        ) : (
          <span className="text-meta text-base-400">—</span>
        ),
      },
      {
        key: "work",
        label: "Work",
        minWidth: 190,
        exportValue: () => "",
        chooserGroup: "Inventory",
        accessor: () => <span className="text-meta text-base-300">—</span>,
      },
    ],
    [],
  );

  const authorityRows = useMemo(
    () => applyRailSelection(authorityUnits, { ...sel, query: search }, now),
    [authorityUnits, now, search, sel],
  );
  const totals = summariseRegister(authorityRows);
  const filtered = isRailFiltered({ ...sel, query: search });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ModuleHeader
        testId="stock-register-destination-header"
        word="Inventory"
        docTitle="Inventory · Warehouse — Carres"
        destinationHeader
      />
      <div
        className="flex min-h-0 min-w-0 flex-1 bg-white"
        data-testid="stock-register"
      >
        {isError ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-white">
            <p className="text-body text-base-700">
              Inventory could not be loaded
            </p>
            <p className="text-meta text-base-500">
              Try again. If it still fails, ask the system owner to check Inventory.
            </p>
            <button
              type="button"
              className="rounded-control border border-kit-slate-6 bg-white px-3 py-1.5 text-meta font-medium text-kit-slate-11 hover:bg-kit-slate-3"
              onClick={() => void refetch()}
            >
              Try again
            </button>
          </div>
        ) : (
          <>
        {/* ── LEFT FILTER RAIL (Card §3) ─────────────────────────────────── */}
        {railOpen ? (
          <FilterRail testId="stock-rail" onHide={() => setRailVisible(false)}>
          <RailButton
            label="All inventory"
            n={unitCount(allUnits.filter(isCurrentUnit).length)}
            active={!filtered}
            onClick={clearAll}
            testId="rail-all-stock"
          />

          <RailSection title="Attention">
            {railValues.attention.size === 0 ? (
              <p className="px-1 text-meta text-base-400">Nothing needs attention</p>
            ) : (
              ATTENTION_REASONS.filter((r) => railValues.attention.has(r)).map((r) => (
                <RailButton
                  key={r}
                  label={ATTENTION_REASON_LABEL[r]}
                  n={unitCount(predictedCount("attention", r))}
                  active={sel.attention === r}
                  onClick={() => setRail("attention", r)}
                />
              ))
            )}
          </RailSection>

          <RailSection title="Availability">
            {UNIT_AVAILABILITY.filter((a) => a !== "ended").map((a) => (
              <RailButton
                key={a}
                label={availabilityLabel(a)}
                n={unitCount(predictedCount("availability", a))}
                active={sel.availability === a}
                onClick={() => setRail("availability", a)}
              />
            ))}
          </RailSection>

          <RailSection title="Location">
              {[...railValues.sites.entries()].map(([id, name]) => (
                <RailButton
                  key={id}
                  label={name}
                  n={unitCount(predictedCount("site", id))}
                  active={sel.site === id}
                  onClick={() => setRail("site", id)}
                />
              ))}
          </RailSection>

          <RailSection title="Held by">
              {[...railValues.holders.entries()].map(([id, name]) => (
                <RailButton
                  key={id}
                  label={name}
                  n={unitCount(predictedCount("holder", id))}
                  active={sel.holder === id}
                  onClick={() => setRail("holder", id)}
                />
              ))}
          </RailSection>

          <RailSection title="Ownership">
              {[...railValues.ownership].map((o) => (
                <RailButton
                  key={o}
                  label={UNIT_OWNERSHIP_LABEL[o as keyof typeof UNIT_OWNERSHIP_LABEL] ?? o}
                  n={unitCount(predictedCount("ownership", o))}
                  active={sel.ownership === o}
                  onClick={() => setRail("ownership", o)}
                />
              ))}
          </RailSection>

          <RailSection title="Product category">
            {categoryKeys.map((c) => (
              <RailButton
                key={c}
                label={CATEGORY_LABEL[c] ?? c}
                n={unitCount(predictedCount("category", c))}
                active={sel.category === c}
                onClick={() => setRail("category", c)}
              />
            ))}
            {railValues.categories.has(NO_CATALOG_KEY) ? (
              /* NOT a category, and it never folds into Accessory: "we do not
                 know what this is" is a different fact from "this is an
                 accessory" (Card §3 — an honest bucket, Catalog was asked). */
              <RailButton
                label={NO_CATALOG_LABEL}
                n={unitCount(predictedCount("category", NO_CATALOG_KEY))}
                active={sel.category === NO_CATALOG_KEY}
                onClick={() => setRail("category", NO_CATALOG_KEY)}
              />
            ) : null}
          </RailSection>

          <RailSection title="Changed">
            {CHANGED_SCOPES.map((s) => (
              <RailButton
                key={s}
                label={CHANGED_SCOPE_LABEL[s]}
                n={unitCount(predictedCount("changed", s))}
                active={sel.changed === s}
                onClick={() => setRail("changed", s)}
              />
            ))}
            {CHANGED_SCOPES.every((scope) => predictedCount("changed", scope) === 0) ? (
              <p className="px-1 pt-1 text-meta text-base-400">
                No Unit has moved yet — this fills in as goods are received,
                counted and handed over.
              </p>
            ) : null}
          </RailSection>

          </FilterRail>
        ) : null}

        {/* ── THE REGISTER ───────────────────────────────────────────────── */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="register-column">
            <DataGrid<StockRegisterUnit>
                appearance="reference"
                rows={rows}
                columns={columns}
                storageKey="carres.warehouse.stockRegister.v1"
                rowKey={(u) => u.id}
                exportName="Inventory"
                searchPlaceholder="Unit ID, product, PO, SO or supplier…"
                isLoading={isLoading}
                onSearchChange={setSearch}
                toolbarStart={!railOpen ? (
                  <ShowFiltersButton onClick={() => setRailVisible(true)} />
                ) : null}
                stickyIdentity
                groupBanner={false}
                chooserGroupOrder={["Inventory"]}
                onRowDoubleClick={(u) => navigate(`/operation/stock/unit/${u.unitCode}`)}
                emptyMessage={
                  allUnits.length === 0
                    ? "No Units yet — a Unit is created when a purchase order or consignment order is confirmed, and Receiving checks it in against the ID the supplier put on the label."
                    : "No Units match these filters."
                }
                statusSummary={() => {
                  const line = registerSummaryLine(totals, currentUnits.length);
                  return <span className="block truncate" title={line}>{line}</span>;
                }}
            />
        </div>
          </>
        )}
      </div>
    </div>
  );
}

function ShowFiltersButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Show filters"
      title="Show filters"
      className="grid h-7 w-7 place-items-center rounded-control border border-kit-slate-6 bg-white text-kit-slate-11 hover:bg-kit-slate-3 hover:text-kit-slate-12"
      onClick={onClick}
    >
      <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <FilterRailGroup title={title}>{children}</FilterRailGroup>;
}

function RailButton({
  label,
  n,
  active,
  onClick,
  testId,
}: {
  label: string;
  n: number | string;
  active: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <FilterRailRow
      label={label}
      count={n}
      active={active}
      onClick={onClick}
      testId={testId ?? `stock-filter-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
    />
  );
}

function unitCount(n: number): string {
  return `${n} ${n === 1 ? "Unit" : "Units"}`;
}
