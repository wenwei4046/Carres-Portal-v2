import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { OpsStockItem, OpsStockListResponse } from "@carres/shared";
import OpsStockListView from "./OpsStockListView";

/**
 * OperationStockOnHand — the unified Stock "On Hand" list (Jess redesign step 3,
 * `docs/operation-portal-redesign.md` §3 + memory project-stock-model).
 *
 * Merges the four legacy per-unit pages (Ready / Reserved / Defective(Repair) /
 * Inventory) into ONE table at Carres Klang. The four are now FILTER CHIPS over
 * a single list; the old "Inventory" master grid becomes the default **All**
 * chip (so Inventory is dropped as a standalone menu, per Jess).
 *
 *   All       — every unit (the master grid)
 *   Ready     — status=free, good condition, not flagged for repair
 *   Reserved  — held against a customer ref
 *   Defective — flagged for repair OR old/damaged condition
 *
 * One round-trip: we fetch the master `/inventory` grid once (sharing the
 * `["operation","ops-stock","inventory"]` cache key with OpsStockListView's
 * legacy inventory view), then client-side filter per chip + count the chips
 * off the same array. Switching chips is instant — no refetch. The filtered
 * rows are handed to OpsStockListView (`rows=` + `embedded`) so all the existing
 * per-row actions (reserve / release / reassign / takeout / flag-repair /
 * condition) + mutations are reused verbatim; those mutations invalidate the
 * ops-stock cache, so this list refreshes after any action.
 *
 * Chip predicates mirror the server filters exactly (apps/api/.../ops/stock.ts):
 *   ready    : status='free' AND condition∈(new,exhibition) AND !needs_repair
 *   reserved : status='reserved'
 *   defective: needs_repair OR condition∈(old,damaged)
 */

type Chip = "all" | "ready" | "reserved" | "defective";

const CHIPS: { key: Chip; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "reserved", label: "Reserved" },
  { key: "defective", label: "Defective" },
];

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

function matchesChip(r: OpsStockItem, chip: Chip): boolean {
  switch (chip) {
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

/** Every per-row action — each button self-gates on the row's status inside
 *  OpsStockListView, so enabling all of them surfaces the right set per unit
 *  regardless of the active chip. */
const ALL_ACTIONS = [
  "reserve",
  "release",
  "reassign",
  "takeout",
  "flag-repair",
  "add",
  "remove",
] as const;

export default function OperationStockOnHand() {
  const [chip, setChip] = useState<Chip>("all");

  // Single source — the master grid. Shares OpsStockListView's inventory cache
  // key so a mutation anywhere refreshes this list too.
  const invQ = useQuery<OpsStockListResponse>({
    queryKey: ["operation", "ops-stock", "inventory"],
    queryFn: () => apiFetch("/api/ops/stock/inventory"),
    refetchInterval: 20_000,
  });

  const items = useMemo(() => invQ.data?.items ?? [], [invQ.data]);

  const counts = useMemo(() => {
    let ready = 0,
      reserved = 0,
      defective = 0;
    for (const r of items) {
      if (isReady(r)) ready += 1;
      if (isReserved(r)) reserved += 1;
      if (isDefective(r)) defective += 1;
    }
    return { all: items.length, ready, reserved, defective };
  }, [items]);

  const filtered = useMemo(
    () => items.filter((r) => matchesChip(r, chip)),
    [items, chip],
  );

  return (
    <div className="px-9 py-8 pb-14" data-testid="operation-stock-onhand">
      {/* Header */}
      <div className="mb-[18px]">
        <div className="kicker">HQ · Operations · Carres Klang</div>
        <h1 className="t-h1 font-display mt-1.5">
          On Hand
        </h1>
        <div className="text-[13px] text-base-600 mt-1.5">
          Every physical unit at Carres Klang, tracked by Unit ID. Filter by
          Ready / Reserved / Defective.
        </div>
      </div>

      {/* Filter chips */}
      <div
        className="flex gap-1 p-1 bg-base-100 rounded mb-3.5 w-fit max-w-full overflow-auto"
        role="tablist"
        aria-label="Stock filter"
      >
        {CHIPS.map((t) => {
          const active = chip === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setChip(t.key)}
              className={`px-3 py-1.5 text-[12px] rounded cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                active
                  ? "bg-white text-base-900 font-semibold shadow-sm"
                  : "text-base-600 font-medium hover:text-base-900"
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-px rounded-full ${
                  active
                    ? "bg-base-100 text-base-700"
                    : "bg-base-200 text-base-500"
                }`}
              >
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

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
        // Reuse the per-unit table + all its actions/mutations. We inject the
        // pre-filtered rows so it skips its own fetch (single round-trip above).
        <OpsStockListView
          embedded
          rows={filtered}
          endpoint="/inventory"
          cacheKey="inventory"
          title="On Hand"
          kicker=""
          blurb=""
          actions={[...ALL_ACTIONS]}
        />
      )}
    </div>
  );
}
