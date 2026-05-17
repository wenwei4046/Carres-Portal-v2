import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ManualCostSource } from "@carres/shared";
import { ApiError, apiFetch } from "@/lib/api";

/**
 * CogsLineEditor — Phase 4.5 Chunk 2 Sprint E Task 28.
 *
 * Per-line editor sub-component used inside `CreatePOModal`'s lines table
 * (T29 wires it). Lets the operator pick a `cost_source` heuristic and
 * supplies the resulting `cost` value back to the parent via `onChange`.
 *
 * The 3 cost-source options match the `cost_source_enum` 1:1 (migration 0055):
 *   - `hand_entered`    : user types cost manually
 *   - `prev_po`         : auto-fill from `GET /api/operation/skus/:sku/recent-cost`
 *   - `system_suggested`: 110% of the recent-cost (round to 2dp); falls back to
 *                        "no historical data" when no prior PO exists
 *
 * Behavior contract (matches plan §Sprint E Task 28):
 *   - Switching to `prev_po`         → fetch + populate cost from response
 *   - Switching to `system_suggested`→ fetch + populate cost = round(prev * 1.1, 2)
 *   - User types in cost input       → flips dropdown back to `hand_entered`
 *                                      (don't lock the auto-fill)
 *   - When historical data is null   → inline "no historical data" message AND
 *                                      keep the previous cost (don't clobber)
 *
 * The component is rendered as a 2-cell row (cost input + dropdown) so the
 * parent (CreatePOModal) can drop it into a grid alongside SKU/qty cells.
 *
 * Validation hint (display only — final 422 happens at the API edge against
 * the shared zod `createPoInput` schema):
 *   - cost < 0           → not normally reachable (input has `min={0}`) but
 *                          guarded defensively below
 *   - cost > 0 && source = null
 *                        → both fields must travel together; the schema
 *                          requires `cost` AND `costSource` non-NULL
 */

interface RecentCostResponse {
  cost: number | null;
  lastPoId: string | null;
  lastReceivedAt: string | null;
}

export interface CogsLineEditorProps {
  /** SKU for the line — drives the recent-cost lookup. */
  sku: string;
  /** Current cost value in the parent's draft state; null = "not yet set". */
  cost: number | null;
  /**
   * Current cost-source selection in the parent's draft state.
   *
   * T42-C1 — narrowed to `ManualCostSource` (3-value: `hand_entered | prev_po
   * | system_suggested`). The DB-level `CostSource` includes `auto_issued`,
   * which is a server-only label this manual-edit dropdown cannot produce.
   */
  costSource: ManualCostSource | null;
  /** Bubble both fields up on every meaningful change. */
  onChange: (cost: number | null, costSource: ManualCostSource | null) => void;
  /** When true, all inputs are disabled (e.g. while the parent is submitting). */
  disabled?: boolean;
}

/** Round to 2 decimal places — matches the DB's `numeric(14,2)` precision. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Parse a free-form cost input. Empty → null; numeric → number; else null. */
function parseCost(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export default function CogsLineEditor({
  sku,
  cost,
  costSource,
  onChange,
  disabled,
}: CogsLineEditorProps) {
  // Lazy fetcher for the recent-cost RPC. `enabled: false` keeps it off
  // until the user picks `prev_po` or `system_suggested` — the parent doesn't
  // pre-fetch for every line, only the one being edited at click time.
  const recentCostQ = useQuery<RecentCostResponse>({
    queryKey: ["operation", "recent-cost", sku],
    queryFn: () =>
      apiFetch<RecentCostResponse>(
        `/api/operation/skus/${encodeURIComponent(sku)}/recent-cost`,
      ),
    enabled: false,
    staleTime: 30_000,
  });

  // Track the dropdown's last-known auto-fill state so we can flip back to
  // `hand_entered` when the user types a manual override. A ref (not state)
  // avoids re-render churn — the value is read inside the input handler only.
  const lastAutoFillRef = useRef<ManualCostSource | null>(null);
  useEffect(() => {
    if (costSource === "prev_po" || costSource === "system_suggested") {
      lastAutoFillRef.current = costSource;
    } else {
      lastAutoFillRef.current = null;
    }
  }, [costSource]);

  /**
   * Handle cost-source dropdown change.
   * - `hand_entered`   : do not clobber — keep current cost, just update source
   * - `prev_po`        : fetch + populate `recent.cost`
   * - `system_suggested`: fetch + populate `round(recent.cost * 1.1, 2)`
   *
   * On a null recent-cost, surface "no historical data" inline AND keep the
   * previous cost (i.e. don't clobber the user's prior entry).
   */
  async function handleSourceChange(next: ManualCostSource) {
    if (next === "hand_entered") {
      onChange(cost, "hand_entered");
      return;
    }

    // Optimistically flip the source so the UI reflects the user's pick even
    // before the network round-trip finishes. The cost stays as-is until the
    // refetch lands; if it returns null we keep the prior value.
    onChange(cost, next);

    const res = await recentCostQ.refetch();
    if (res.error || !res.data) return; // surfaced via recentCostQ.isError below
    const recent = res.data.cost;
    if (recent == null) return; // null cost → keep prior + show inline message

    const nextCost = next === "system_suggested" ? round2(recent * 1.1) : recent;
    onChange(nextCost, next);
  }

  /**
   * Handle cost input change. If the current source is an auto-fill mode
   * (`prev_po` / `system_suggested`), flip it back to `hand_entered` —
   * a manual override is a user override, not a heuristic.
   */
  function handleCostChange(text: string) {
    const parsed = parseCost(text);
    const nextSource: ManualCostSource | null =
      lastAutoFillRef.current !== null
        ? "hand_entered"
        : costSource ?? (parsed === null ? null : "hand_entered");
    onChange(parsed, nextSource);
  }

  // "No historical data" — the recent-cost endpoint returned `cost: null`
  // for an auto-fill-mode pick. Only surface when the user picked a
  // historical heuristic AND the fetch resolved with a null cost.
  const isHeuristic =
    costSource === "prev_po" || costSource === "system_suggested";
  const noHistorical =
    isHeuristic &&
    recentCostQ.isFetched &&
    !recentCostQ.isError &&
    (recentCostQ.data?.cost ?? null) === null;

  // Validation hint — displayed inline, mirrors what the API edge will reject.
  // (a) cost < 0 (defensive — `min={0}` on the input usually prevents this)
  // (b) cost set but source unset → schema requires both
  const hintError =
    cost != null && cost < 0
      ? "Cost cannot be negative"
      : cost != null && costSource == null
        ? "Pick a cost source"
        : null;

  return (
    <div className="flex flex-col gap-1" data-testid={`cogs-line-editor-${sku}`}>
      <div className="grid items-center gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <input
          type="number"
          min={0}
          step={0.01}
          inputMode="decimal"
          value={cost == null ? "" : String(cost)}
          onChange={(e) => handleCostChange(e.target.value)}
          disabled={disabled}
          aria-label={`Cost for ${sku}`}
          data-testid={`cogs-cost-input-${sku}`}
          placeholder="0.00"
          className="px-2 py-1.5 border border-base-300 rounded-[4px] text-[12px] text-right bg-white outline-none focus:border-base-500"
        />
        <select
          value={costSource ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") return;
            void handleSourceChange(v as ManualCostSource);
          }}
          disabled={disabled}
          aria-label={`Cost source for ${sku}`}
          data-testid={`cogs-source-select-${sku}`}
          className="px-2 py-1.5 border border-base-300 rounded-[4px] text-[12px] bg-white outline-none focus:border-base-500"
        >
          <option value="" disabled>
            — pick source —
          </option>
          <option value="hand_entered">Hand-entered</option>
          <option value="prev_po">Previous PO</option>
          <option value="system_suggested">System suggested</option>
        </select>
      </div>

      {recentCostQ.isFetching && isHeuristic && (
        <div
          className="text-[10.5px] text-base-600 font-body"
          data-testid={`cogs-loading-${sku}`}
        >
          Loading recent cost…
        </div>
      )}

      {noHistorical && (
        <div
          role="status"
          data-testid={`cogs-no-history-${sku}`}
          className="text-[10.5px] font-body"
          style={{ color: "var(--brand-signature)" }}
        >
          No historical data — please hand-enter.
        </div>
      )}

      {recentCostQ.isError && isHeuristic && (
        <div
          role="alert"
          data-testid={`cogs-fetch-error-${sku}`}
          className="text-[10.5px] font-body"
          style={{ color: "var(--destructive)" }}
        >
          {recentCostQ.error instanceof ApiError && recentCostQ.error.message
            ? recentCostQ.error.message
            : "Failed to load recent cost"}
        </div>
      )}

      {hintError && (
        <div
          role="alert"
          data-testid={`cogs-hint-error-${sku}`}
          className="text-[10.5px] font-body"
          style={{ color: "var(--destructive)" }}
        >
          {hintError}
        </div>
      )}
    </div>
  );
}
