import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { OpsStockItem, OpsStockListResponse } from "@carres/shared";
import OpsStockListView from "./OpsStockListView";
import ImportStockDialog from "./components/ImportStockDialog";
import Segmented from "@/components/Segmented";

/**
 * OperationStockOnHand — the unified Stock "On Hand" list.
 *
 * On Hand redesign C+ · P1 shell (Jess-locked 2026-07-10, memory
 * project-on-hand-redesign-cplus): the page adopts the Orders design language
 * with Design 2 = an always-visible LEFT filter rail. Built for scale
 * (memory project-scale-targets: 1000+ units) — the rail keeps Status /
 * Condition / Supplier + a "Needs attention" quick-view visible so the
 * operator can narrow a big pool fast, and the table gets the rest of the
 * width.
 *
 * This phase is pure frontend: it still fetches the master `/inventory` grid
 * ONCE and filters client-side, then hands the filtered rows to
 * OpsStockListView (`rows=` + `embedded`) so all the shipped per-row actions
 * (reserve / release / reassign / takeout / flag-repair / condition / remove)
 * + mutations are reused verbatim. P2 moves filtering + a grouped-by-model
 * rollup server-side; P3 adds the Excel import; a Location filter arrives with
 * multi-warehouse (today ops_stock is Carres Klang only, migration 0137).
 *
 * Status buckets mirror the server filters exactly (apps/api/.../ops/stock.ts):
 *   ready    : status='free' AND condition∈(new,exhibition,old,refurbished) AND !needs_repair
 *   reserved : status='reserved'
 *   defective: needs_repair OR condition='damaged'
 */

type Status = "all" | "ready" | "reserved" | "defective";

const STATUS_FILTERS: { key: Status; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "reserved", label: "Reserved" },
  { key: "defective", label: "Defective" },
];

const CONDITION_LABEL: Record<string, string> = {
  new: "New",
  exhibition: "Display",
  old: "Fair (used)",
  refurbished: "Refurbished",
  damaged: "Damaged",
};
const CONDITION_ORDER = ["new", "exhibition", "old", "refurbished", "damaged"];

function isReady(r: OpsStockItem): boolean {
  return (
    r.status === "free" &&
    (r.condition === "new" ||
      r.condition === "exhibition" ||
      r.condition === "old" ||
      r.condition === "refurbished") &&
    !r.needsRepair
  );
}
function isReserved(r: OpsStockItem): boolean {
  return r.status === "reserved";
}
function isDefective(r: OpsStockItem): boolean {
  return r.needsRepair || r.condition === "damaged";
}

function matchesStatus(r: OpsStockItem, s: Status): boolean {
  switch (s) {
    case "ready":
      return isReady(r);
    case "reserved":
      return isReserved(r);
    case "defective":
      return isDefective(r);
    case "all":
    default:
      return true;
  }
}

function matchesQuery(r: OpsStockItem, q: string): boolean {
  const hay = [r.sku, r.unitCode, r.reservedRef, r.poNo, r.sourceRef, r.supplier]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

/** Every per-row action — each button self-gates on the row's status inside
 *  OpsStockListView, so enabling all of them surfaces the right set per unit. */
const ALL_ACTIONS = [
  "reserve",
  "release",
  "reassign",
  "takeout",
  "flag-repair",
  "refurbish",
  "add",
  "remove",
] as const;

export default function OperationStockOnHand() {
  const [status, setStatus] = useState<Status>("all");
  const [condition, setCondition] = useState<string>("");
  const [supplier, setSupplier] = useState<string>("");
  // "Needs attention" quick-views (each an additive AND filter).
  const [onlyRepair, setOnlyRepair] = useState(false);
  const [onlyNoPo, setOnlyNoPo] = useState(false);
  const [q, setQ] = useState("");
  // Grouped-by-model rollup (default) vs flat per-unit list. P2 scale view.
  const [view, setView] = useState<"grouped" | "flat">("grouped");
  // P3 — Excel import from the Klg Warehouse sheet.
  const [showImport, setShowImport] = useState(false);

  const invQ = useQuery<OpsStockListResponse>({
    queryKey: ["operation", "ops-stock", "inventory"],
    queryFn: () => apiFetch("/api/ops/stock/inventory"),
    refetchInterval: 20_000,
  });

  const items = useMemo(() => invQ.data?.items ?? [], [invQ.data]);

  const counts = useMemo(() => {
    let ready = 0,
      reserved = 0,
      defective = 0,
      repair = 0,
      noPo = 0;
    const byCondition = new Map<string, number>();
    const bySupplier = new Map<string, number>();
    for (const r of items) {
      if (isReady(r)) ready += 1;
      if (isReserved(r)) reserved += 1;
      if (isDefective(r)) defective += 1;
      if (r.needsRepair) repair += 1;
      if (!r.poNo) noPo += 1;
      byCondition.set(r.condition, (byCondition.get(r.condition) ?? 0) + 1);
      if (r.supplier)
        bySupplier.set(r.supplier, (bySupplier.get(r.supplier) ?? 0) + 1);
    }
    return {
      all: items.length,
      ready,
      reserved,
      defective,
      repair,
      noPo,
      byCondition,
      bySupplier,
    };
  }, [items]);

  const suppliers = useMemo(
    () => [...counts.bySupplier.keys()].sort((a, b) => a.localeCompare(b)),
    [counts.bySupplier],
  );

  const qLower = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      items.filter(
        (r) =>
          matchesStatus(r, status) &&
          (condition === "" || r.condition === condition) &&
          (supplier === "" || r.supplier === supplier) &&
          (!onlyRepair || r.needsRepair) &&
          (!onlyNoPo || !r.poNo) &&
          (qLower === "" || matchesQuery(r, qLower)),
      ),
    [items, status, condition, supplier, onlyRepair, onlyNoPo, qLower],
  );

  const anyFilter =
    status !== "all" ||
    condition !== "" ||
    supplier !== "" ||
    onlyRepair ||
    onlyNoPo ||
    qLower !== "";
  function clearAll() {
    setStatus("all");
    setCondition("");
    setSupplier("");
    setOnlyRepair(false);
    setOnlyNoPo(false);
    setQ("");
  }

  return (
    <div className="px-9 py-8 pb-14" data-testid="operation-stock-onhand">
      {/* Top bar — title + search (Orders-style) */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="kicker">HQ · Operations · Carres Klang</div>
          <h1 className="t-h1 font-display mt-1.5">On Hand</h1>
          <div className="text-[13px] text-base-600 mt-1.5">
            Every physical unit at Carres Klang, tracked by Unit ID.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="SKU / ref / PO…"
              className="rounded border border-base-300 pl-3 pr-8 py-2 text-sm w-64 focus:border-primary focus:outline-none"
              aria-label="Search stock"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-base-400 hover:text-base-700 text-sm"
                aria-label="Clear search"
              >
                ×
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="btn-secondary text-[12px] py-2 whitespace-nowrap"
            data-testid="onhand-import-open"
          >
            Import sheet
          </button>
        </div>
      </div>

      {showImport ? (
        <ImportStockDialog
          existing={items}
          onClose={() => setShowImport(false)}
        />
      ) : null}

      {invQ.isLoading ? (
        <p className="text-sm text-base-500">Loading…</p>
      ) : invQ.isError ? (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
          <div className="text-destructive font-semibold mb-2">
            Couldn&rsquo;t load stock
          </div>
          <div className="text-[12px] text-base-700 mb-3">
            {(invQ.error as Error | undefined)?.message ?? "Unknown error"}
          </div>
          <button
            type="button"
            onClick={() => void invQ.refetch()}
            className="btn-secondary text-[11px] py-1.5 px-3"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="flex gap-5 items-start">
          {/* LEFT FILTER RAIL (Design 2) */}
          <aside className="w-[212px] shrink-0 space-y-3">
            {/* Metrics */}
            <div className="rounded border border-base-200 bg-white p-3 space-y-1.5">
              <MetricRow label="All units" n={counts.all} />
              <MetricRow label="Ready" n={counts.ready} tone="text-success-700" />
              <MetricRow label="Reserved" n={counts.reserved} />
              <MetricRow
                label="Defective"
                n={counts.defective}
                tone="text-base-700"
              />
            </div>

            {/* Needs attention */}
            {counts.repair + counts.noPo > 0 ? (
              <div className="rounded border border-base-200 bg-white p-3">
                <RailLabel>Needs attention</RailLabel>
                <div className="flex flex-col gap-1.5 mt-1.5">
                  <AttnChip
                    label="In repair"
                    n={counts.repair}
                    tone="warning"
                    active={onlyRepair}
                    onClick={() => setOnlyRepair((v) => !v)}
                  />
                  <AttnChip
                    label="No PO"
                    n={counts.noPo}
                    tone="danger"
                    active={onlyNoPo}
                    onClick={() => setOnlyNoPo((v) => !v)}
                  />
                </div>
              </div>
            ) : null}

            {/* Status */}
            <FilterGroup label="Status">
              {STATUS_FILTERS.map((s) => (
                <FilterPill
                  key={s.key}
                  label={s.label}
                  n={counts[s.key]}
                  active={status === s.key}
                  onClick={() => setStatus(s.key)}
                />
              ))}
            </FilterGroup>

            {/* Condition */}
            <FilterGroup label="Condition">
              <FilterPill
                label="Any"
                active={condition === ""}
                onClick={() => setCondition("")}
              />
              {CONDITION_ORDER.filter((c) => counts.byCondition.get(c)).map(
                (c) => (
                  <FilterPill
                    key={c}
                    label={CONDITION_LABEL[c] ?? c}
                    n={counts.byCondition.get(c) ?? 0}
                    active={condition === c}
                    onClick={() =>
                      setCondition((cur) => (cur === c ? "" : c))
                    }
                  />
                ),
              )}
            </FilterGroup>

            {/* Supplier */}
            {suppliers.length > 0 ? (
              <FilterGroup label="Supplier">
                <FilterPill
                  label="Any"
                  active={supplier === ""}
                  onClick={() => setSupplier("")}
                />
                {suppliers.map((s) => (
                  <FilterPill
                    key={s}
                    label={s}
                    n={counts.bySupplier.get(s) ?? 0}
                    active={supplier === s}
                    onClick={() =>
                      setSupplier((cur) => (cur === s ? "" : s))
                    }
                  />
                ))}
              </FilterGroup>
            ) : null}

            {anyFilter ? (
              <button
                type="button"
                onClick={clearAll}
                className="text-[11px] text-base-500 hover:text-primary underline pl-1"
              >
                Clear filters
              </button>
            ) : null}
          </aside>

          {/* LIST — reuse the per-unit table + all shipped actions/mutations. */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] text-base-500">
                Showing{" "}
                <span className="font-semibold text-base-800">
                  {filtered.length}
                </span>{" "}
                of {counts.all} units
              </div>
              {/* v4 §10 — THE segmented recipe (grey rail + white active chip). */}
              <Segmented
                ariaLabel="Stock view"
                value={view}
                onChange={setView}
                options={[
                  { value: "grouped", label: "Grouped by model" },
                  { value: "flat", label: "Flat units" },
                ]}
              />
            </div>
            <OpsStockListView
              embedded
              rows={filtered}
              grouped={view === "grouped"}
              endpoint="/inventory"
              cacheKey="inventory"
              title="On Hand"
              kicker=""
              blurb=""
              actions={[...ALL_ACTIONS]}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MetricRow({
  label,
  n,
  tone,
}: {
  label: string;
  n: number;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[12px] text-base-600">{label}</span>
      <span className={`text-[15px] font-semibold ${tone ?? "text-base-900"}`}>
        {n}
      </span>
    </div>
  );
}

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.03em] text-base-400">
      {children}
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-base-200 bg-white p-3">
      <RailLabel>{label}</RailLabel>
      <div className="flex flex-col gap-1 mt-1.5">{children}</div>
    </div>
  );
}

function FilterPill({
  label,
  n,
  active,
  onClick,
}: {
  label: string;
  n?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-[12px] text-left transition-colors ${
        active
          ? "bg-primary text-white font-medium"
          : "text-base-700 hover:bg-base-100"
      }`}
    >
      <span className="truncate">{label}</span>
      {n !== undefined ? (
        <span
          className={`text-[10px] font-mono ${
            active ? "text-white/80" : "text-base-400"
          }`}
        >
          {n}
        </span>
      ) : null}
    </button>
  );
}

function AttnChip({
  label,
  n,
  tone,
  active,
  onClick,
}: {
  label: string;
  n: number;
  tone: "warning" | "danger";
  active: boolean;
  onClick: () => void;
}) {
  const toneCls =
    tone === "danger"
      ? "bg-error-50 text-error-700 border-error-200"
      : "bg-warning-50 text-warning-700 border-warning-200";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-2 rounded border px-2 py-1 text-[12px] transition-colors ${
        active ? "ring-2 ring-primary/40 " + toneCls : toneCls + " hover:brightness-95"
      }`}
    >
      <span>{label}</span>
      <span className="text-[11px] font-mono font-semibold">{n}</span>
    </button>
  );
}
