import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import {
  POOL_USE_REASONS,
  POOL_USE_REASON_LABEL,
  poolDrawProblem,
  poolUseNeedsNote,
  reserveLevelWarning,
  type PoolUseReason,
} from "@carres/shared";
import { useStockUsage } from "@/lib/queries";

/**
 * The one place the warehouse asks "why is this unit leaving the shelf?" —
 * Ready Stock card K4 (migration 0292).
 *
 * BOTH doors that draw from the free pool mount this: the order drawer's
 * picker (ReserveStockDialog / StockPickerGrid) and the On-hand box. One
 * component, so the question, the words and the disabled-button rule cannot
 * drift between two screens that do the same thing.
 *
 * THE WARNING WARNS AND NEVER BLOCKS — Jess's own word, and the same restraint
 * the monthly plan's over-suggestion warning already keeps. The register can be
 * behind what the person on the floor knows, so the screen states the two
 * numbers it has and lets the human decide. Nothing here disables anything
 * because of a reserve level; the ONLY thing that dims the button is a missing
 * reason, which is the thing we are collecting.
 */

export interface PoolDrawState {
  reason: PoolUseReason | "";
  note: string;
  setReason: (r: PoolUseReason | "") => void;
  setNote: (n: string) => void;
  /** Why the draw cannot be sent yet — the SAME function the server enforces. */
  problem: string | null;
  /** Spread into the POST body once `problem` is null. */
  body: { reason: PoolUseReason; note: string | null };
  /** Reserve-level warnings for what is about to be taken. */
  warningsFor: (taking: { sku: string; qty: number }[]) => PoolLevelWarning[];
}

export interface PoolLevelWarning {
  sku: string;
  freeAfter: number;
  reserveLevel: number;
}

export function usePoolDrawReason(): PoolDrawState {
  const [reason, setReason] = useState<PoolUseReason | "">("");
  const [note, setNote] = useState("");
  // The levels + free counts the server already computed. Failing to load them
  // costs a warning, never the draw — see `warningsFor`.
  const { data } = useStockUsage();

  const levels = useMemo(() => {
    const m = new Map<string, { free: number; reserveLevel: number | null }>();
    for (const l of data?.levels ?? []) {
      m.set(l.sku, { free: l.free, reserveLevel: l.reserveLevel });
    }
    return m;
  }, [data?.levels]);

  return {
    reason,
    note,
    setReason,
    setNote,
    problem: poolDrawProblem({ reason, note }),
    body: { reason: reason as PoolUseReason, note: note.trim() || null },
    warningsFor: (taking) => {
      const out: PoolLevelWarning[] = [];
      for (const t of taking) {
        const row = levels.get(t.sku);
        if (!row) continue;
        const w = reserveLevelWarning({
          free: row.free,
          taking: t.qty,
          reserveLevel: row.reserveLevel,
        });
        if (w) out.push({ sku: t.sku, ...w });
      }
      return out.sort((a, b) => a.sku.localeCompare(b.sku));
    },
  };
}

export default function PoolReasonPicker({
  state,
  warnings,
  compact,
}: {
  state: PoolDrawState;
  /** What this draw would leave behind, per SKU. Empty = nothing to say. */
  warnings?: PoolLevelWarning[];
  /** Inline (one row) rather than stacked — for a dense action bar. */
  compact?: boolean;
}) {
  const needsWords = state.reason ? poolUseNeedsNote(state.reason) : false;
  return (
    <div
      className={compact ? "flex items-center gap-2" : "flex flex-col gap-1.5"}
      data-testid="pool-reason-picker"
    >
      <div className="flex items-center gap-2">
        <select
          value={state.reason}
          onChange={(e) => state.setReason(e.target.value as PoolUseReason | "")}
          className="rounded border border-base-300 px-2 py-1.5 text-meta bg-white focus:border-primary focus:outline-none"
          aria-label="Why this unit is being taken"
          data-testid="pool-reason"
        >
          <option value="">Why taken?</option>
          {POOL_USE_REASONS.map((r) => (
            <option key={r} value={r}>
              {POOL_USE_REASON_LABEL[r]}
            </option>
          ))}
        </select>
        <input
          value={state.note}
          onChange={(e) => state.setNote(e.target.value)}
          placeholder={needsWords ? "Say what the reason is" : "More detail (optional)"}
          className={`${
            compact ? "w-[160px]" : "flex-1 min-w-[180px]"
          } rounded border border-base-300 px-2 py-1.5 text-meta focus:border-primary focus:outline-none`}
          aria-label="More detail"
          data-testid="pool-reason-note"
        />
      </div>

      {(warnings ?? []).length > 0 ? (
        <div className="flex flex-col gap-0.5" data-testid="pool-reserve-warning">
          {(warnings ?? []).map((w) => (
            <div
              key={w.sku}
              className="text-meta text-warning-700 inline-flex items-center gap-1"
            >
              <TriangleAlert size={14} strokeWidth={2} className="shrink-0" />
              <span>
                Only{" "}
                <span className="font-mono tabular-nums">{w.freeAfter}</span> of{" "}
                {w.sku} left after this — keep at least{" "}
                <span className="font-mono tabular-nums">{w.reserveLevel}</span>.
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
