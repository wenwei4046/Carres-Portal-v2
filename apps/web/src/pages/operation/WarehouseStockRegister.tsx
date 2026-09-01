import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  applyRailSelection,
  ATTENTION_REASONS,
  ATTENTION_REASON_LABEL,
  availabilityLabel,
  categoryKeyOf,
  changedWithin,
  CHANGED_SCOPES,
  CHANGED_SCOPE_LABEL,
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
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import { useStockRegister } from "@/lib/queries";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ModuleHeader from "./components/ModuleHeader";

/**
 * THE STOCK REGISTER — Warehouse's one current listing of controlled Units.
 * CARD-2026-08-20-stock-register · Stock MASTER §7 · UI MASTER §6.7.
 *
 * ── THE DESTINATION IS `Inventory` ──────────────────────────────────────────
 * The owner-approved 2026-09-01 Blueprint names the Warehouse master Register
 * `Inventory` (Stock MASTER §2; COPY-STANDARD unbanned the word for exactly
 * this destination). Not `On hand`, not `Stock Units` — `On hand` described a
 * QUANTITY on a shelf; this page lists exact Units and answers "which one,
 * where, who has it, can it be used". The `?tab=stock-onhand` address is
 * unchanged (CARD-2026-09-01-warehouse-01-sidebar renamed the door, not the
 * page).
 *
 * ── READ-ONLY, DELIBERATELY ─────────────────────────────────────────────────
 * There is no row editor, no status selector, no Add stock, no Delete and no
 * reservation control anywhere on this page. Choosing, binding, substituting and
 * releasing an exact Unit are the SALES ORDER's decisions (Stock MASTER §4), and
 * 0366 removed the write policy that used to let a page reach around them. A
 * Register finds things; the Unit page shows one; work lives in Work.
 *
 * ── WHAT THE FOOTER SAYS, AND WHY IT IS TWO NUMBERS ─────────────────────────
 * `85 you can promise · 893 pieces you cannot`. Both are true and they are
 * different facts: `ops_stock_items_bulk_never_reserved` (0366) forbids a
 * qty > 1 record from ever being reserved, so the 893 pillows on the floor can
 * be sold in principle but no Sales Order can name one of them. One number here
 * would either hide 893 real pillows or promise 893 that cannot be promised.
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
  const { data, isLoading, isError, error, refetch } = useStockRegister();

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
      showEnded: params.get("history") === "1",
    }),
    [params],
  );

  const [search, setSearch] = useState("");
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
    setParams(new URLSearchParams(), { replace: true });
    setSearch("");
  }

  /** Section counts are computed against everything the section does NOT filter,
   *  so a count never lies about what clicking it would show. */
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

  const rows = useMemo(
    () => applyRailSelection(allUnits, { ...sel, query: search }, now),
    [allUnits, sel, search, now],
  );

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
        width: 148,
        sortable: true,
        searchValue: (u) => u.unitCode,
        exportValue: (u) => u.unitCode,
        chooserGroup: "Unit",
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
        chooserGroup: "Unit",
        accessor: (u) => (
          <div className="min-w-0">
            <div className="truncate text-body text-base-900" title={u.sku}>
              {u.sku}
            </div>
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
        label: "Availability",
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
        label: "Where",
        width: 180,
        sortable: true,
        filterType: "enum",
        filterValue: (u) => u.siteName ?? "—",
        exportValue: (u) => u.siteName ?? "",
        chooserGroup: "Place",
        accessor: (u) => (
          <span className="truncate text-meta text-base-800">{u.siteName ?? "—"}</span>
        ),
      },
      {
        key: "holder",
        label: "Who has it",
        width: 150,
        sortable: true,
        filterType: "enum",
        filterValue: (u) => u.holderName ?? "Not recorded",
        exportValue: (u) => u.holderName ?? "",
        chooserGroup: "Place",
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
        width: 130,
        sortable: true,
        filterType: "enum",
        filterValue: (u) => CONDITION_LABEL[u.condition] ?? u.condition,
        exportValue: (u) => CONDITION_LABEL[u.condition] ?? u.condition,
        chooserGroup: "Unit",
        accessor: (u) => (
          <span className="text-meta text-base-800">{CONDITION_LABEL[u.condition] ?? u.condition}</span>
        ),
      },
      {
        key: "attention",
        label: "Current attention",
        minWidth: 190,
        chooserGroup: "Unit",
        exportValue: (u) => attentionSentence(u) ?? "",
        /* Card §2: ONE current attention item, and only when action is genuinely
           open. It does not repeat the Unit ID or the product — those are the
           row's own metadata, and saying them twice is what the card forbids. */
        accessor: (u) => {
          const line = attentionSentence(u);
          return line ? (
            <span className="truncate text-meta text-kit-amber-11" title={line}>
              {line}
            </span>
          ) : (
            <span className="text-meta text-base-300">—</span>
          );
        },
      },
      {
        key: "source",
        label: "Source",
        width: 160,
        sortable: true,
        defaultHidden: true,
        searchValue: (u) => u.poNo ?? "",
        exportValue: (u) => u.poNo ?? "",
        chooserGroup: "Source",
        accessor: (u) =>
          u.poNo ? (
            <span className="truncate font-mono text-meta text-base-700">{u.poNo}</span>
          ) : (
            <span className="text-meta text-base-400">—</span>
          ),
      },
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
          <span className="truncate text-meta text-base-700">{u.supplier ?? "—"}</span>
        ),
      },
      {
        key: "dateIn",
        label: "Came in",
        width: 130,
        sortable: true,
        filterType: "date",
        dateValue: (u) => u.dateIn,
        exportValue: (u) => u.dateIn ?? "",
        chooserGroup: "Dates",
        accessor: (u) => (
          <span className="text-meta text-base-700">{u.dateIn ? fmtDate(u.dateIn) : "—"}</span>
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
            <span className="text-meta text-base-400">Not moved yet</span>
          ),
      },
    ],
    [],
  );

  const totals = summariseRegister(rows);
  const filtered = isRailFiltered({ ...sel, query: search });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ModuleHeader
        testId="stock-register-destination-header"
        word="Inventory"
        docTitle="Inventory · Warehouse — Carres"
        destinationHeader
      />
      <div className="flex min-h-0 flex-1 gap-4 p-2" data-testid="stock-register">
        {/* ── LEFT FILTER RAIL (Card §3) ─────────────────────────────────── */}
        <aside
          className="w-[196px] shrink-0 space-y-3 overflow-y-auto"
          data-testid="stock-rail"
          aria-label="Filter stock"
        >
          <RailButton
            label="All stock"
            n={allUnits.filter(isCurrentUnit).length}
            active={!filtered}
            onClick={clearAll}
            testId="rail-all-stock"
          />

          <RailSection title="Attention">
            {ATTENTION_REASONS.filter((r) => (counts.attention.get(r) ?? 0) > 0).length === 0 ? (
              <p className="px-1 text-meta text-base-400">Nothing needs attention</p>
            ) : (
              ATTENTION_REASONS.filter((r) => (counts.attention.get(r) ?? 0) > 0).map((r) => (
                <RailButton
                  key={r}
                  label={ATTENTION_REASON_LABEL[r]}
                  n={counts.attention.get(r) ?? 0}
                  active={sel.attention === r}
                  tone="warning"
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
                n={counts.availability.get(a) ?? 0}
                active={sel.availability === a}
                onClick={() => setRail("availability", a)}
              />
            ))}
          </RailSection>

          {/* A filter offering ONE choice is not a filter. Today there is one
              Site and one ownership value, so neither section is drawn. Each
              appears by itself the moment a second value exists. */}
          {counts.site.size > 1 ? (
            <RailSection title="Where">
              {[...counts.site.entries()].map(([id, v]) => (
                <RailButton
                  key={id}
                  label={v.name}
                  n={v.n}
                  active={sel.site === id}
                  onClick={() => setRail("site", id)}
                />
              ))}
            </RailSection>
          ) : null}

          {counts.ownership.size > 1 ? (
            <RailSection title="Ownership">
              {[...counts.ownership.entries()].map(([o, n]) => (
                <RailButton
                  key={o}
                  label={UNIT_OWNERSHIP_LABEL[o as keyof typeof UNIT_OWNERSHIP_LABEL] ?? o}
                  n={n}
                  active={sel.ownership === o}
                  onClick={() => setRail("ownership", o)}
                />
              ))}
            </RailSection>
          ) : null}

          <RailSection title="Category">
            {categoryKeys.map((c) => (
              <RailButton
                key={c}
                label={CATEGORY_LABEL[c] ?? c}
                n={counts.category.get(c) ?? 0}
                active={sel.category === c}
                onClick={() => setRail("category", c)}
              />
            ))}
            {(counts.category.get(NO_CATALOG_KEY) ?? 0) > 0 ? (
              /* NOT a category, and it never folds into Accessory: "we do not
                 know what this is" is a different fact from "this is an
                 accessory" (Card §3 — an honest bucket, Catalog was asked). */
              <RailButton
                label={NO_CATALOG_LABEL}
                n={counts.category.get(NO_CATALOG_KEY) ?? 0}
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
                n={counts.changed.get(s) ?? 0}
                active={sel.changed === s}
                onClick={() => setRail("changed", s)}
              />
            ))}
            {[...counts.changed.values()].every((n) => n === 0) ? (
              <p className="px-1 pt-1 text-meta text-base-400">
                No Unit has moved yet — this fills in as goods are received,
                counted and handed over.
              </p>
            ) : null}
          </RailSection>

          <RailSection title="History">
            {/* Delivered and ended Units are a DESTINATION, not a filter mixed
                into today's shelf (Card §1). Exact-ID search finds them either
                way. */}
            <RailButton
              label="Delivered / history"
              n={allUnits.filter((u) => !isCurrentUnit(u)).length}
              active={sel.showEnded}
              onClick={() => setRail("showEnded", sel.showEnded ? null : "1")}
              testId="rail-history"
            />
          </RailSection>
        </aside>

        {/* ── THE REGISTER ───────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col" data-testid="register-column">
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
              appearance="reference"
              rows={rows}
              columns={columns}
              storageKey="carres.warehouse.stockRegister.v1"
              rowKey={(u) => u.id}
              exportName="Inventory"
              searchPlaceholder="Unit ID, product, PO, SO or supplier…"
              isLoading={isLoading}
              onSearchChange={setSearch}
              stickyIdentity
              groupBanner={false}
              chooserGroupOrder={["Unit", "Place", "Source", "Dates"]}
              onRowDoubleClick={(u) => navigate(`/operation/stock/unit/${u.unitCode}`)}
              emptyMessage={
                allUnits.length === 0
                  ? "No Units yet — a Unit is created when a purchase order or consignment order is confirmed, and Receiving checks it in against the ID the supplier put on the label."
                  : "No Units match these filters."
              }
              statusSummary={() => {
                /* UI MASTER §6.7: the 32px footer carries the summary. No KPI
                   strip above the table — a Register is truth, not a dashboard. */
                const line = registerSummaryLine(totals, currentUnits.length);
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

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-base-200 bg-white p-2">
      <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-base-500">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function RailButton({
  label,
  n,
  active,
  onClick,
  tone,
  testId,
}: {
  label: string;
  n: number;
  active: boolean;
  onClick: () => void;
  tone?: "warning";
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={[
        "flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-meta",
        active ? "bg-primary/10 font-semibold text-primary" : "text-base-700 hover:bg-hovertint",
      ].join(" ")}
    >
      <span className="truncate">{label}</span>
      <span className={tone === "warning" && n > 0 && !active ? "text-kit-amber-11" : "text-base-500"}>
        {n}
      </span>
    </button>
  );
}
