import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setThresholdInput } from "@carres/shared";
import { ApiError, apiFetch } from "@/lib/api";
import { qk } from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";

/**
 * SetThresholdDialog — Phase 4.5 Chunk 2 Sprint D Task 20.
 *
 * Inline-edit surface for `low_threshold` / `high_threshold` on a single
 * (sku, warehouse_id) `stock_balances` row. Triggered from the
 * LogisticsWarehouse page (T21 wires it; T20 is component-only).
 *
 * Wired against:
 *   - POST /api/logistics/warehouses/:warehouseId/skus/:sku/threshold
 *     body: `{ low: int|null, high: int|null }` (zod `setThresholdInput`)
 *
 * Validation mirrors the shared zod schema (and the SQL CHECK in migration
 * 0054):
 *   - both fields optional / nullable (empty input = null);
 *   - both must be `>= 0` integers when set;
 *   - `high >= low` when both are non-NULL.
 *
 * Visual conventions match the `Modal` + `ModalActions` primitive used by
 * `AdjustStockModal` and `AssignPickupDialog`:
 *   - Modal panel uses `bg-card` (HSL 40 53% 97% — Loo's three-layer cream
 *     intentional offset from proto white per memory `feedback_modal_cream`).
 *   - Inputs styled with `INPUT_CLS`; primary/cancel via `ModalActions`.
 *
 * Cache invalidation: blasts `qk.logistics.warehouse()` so the warehouse page
 * refetches the row + threshold pill, plus `["logistics", "stock-alerts"]`
 * (set up in T18) so the dashboard alert tile updates if the new low cleared
 * an existing alert.
 */
export interface SetThresholdDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouseId: string;
  /** Display name for the warehouse (header only — not sent to server). */
  warehouseName: string;
  sku: string;
  /** Current low threshold; `null` means "no threshold set". */
  currentLow: number | null;
  /** Current high threshold; `null` means "use low * 2 fallback". */
  currentHigh: number | null;
  /** Optional refetch hook fired after a successful save. */
  onSuccess?: () => void;
}

/** Empty-string → null. Integer-string → number. Anything else → invalid sentinel. */
function parseField(text: string): number | null | "invalid" {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return "invalid";
  return n;
}

export default function SetThresholdDialog({
  open,
  onOpenChange,
  warehouseId,
  warehouseName,
  sku,
  currentLow,
  currentHigh,
  onSuccess,
}: SetThresholdDialogProps) {
  // Inputs are kept as strings so empty-string ("") can be distinguished from
  // 0 (a valid threshold). Conversion happens on submit.
  const [lowText, setLowText] = useState<string>(
    currentLow === null ? "" : String(currentLow),
  );
  const [highText, setHighText] = useState<string>(
    currentHigh === null ? "" : String(currentHigh),
  );
  const [error, setError] = useState<string | null>(null);

  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (input: { low: number | null; high: number | null }) =>
      apiFetch(
        `/api/logistics/warehouses/${warehouseId}/skus/${encodeURIComponent(sku)}/threshold`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.logistics.warehouse(), exact: true });
      // Stock-alerts cache (T18/T21) — broad invalidation so the dashboard
      // tile re-derives once the new threshold lands. Uses the centralized
      // query key per CLAUDE.md §9.6 (no magic strings).
      await qc.invalidateQueries({ queryKey: qk.logistics.stockAlerts() });
      onSuccess?.();
      onOpenChange(false);
    },
  });

  if (!open) return null;

  const handleSave = () => {
    setError(null);

    const lowParsed = parseField(lowText);
    const highParsed = parseField(highText);
    if (lowParsed === "invalid") {
      setError("Low threshold must be a non-negative integer");
      return;
    }
    if (highParsed === "invalid") {
      setError("High threshold must be a non-negative integer");
      return;
    }

    const payload = { low: lowParsed, high: highParsed };
    // Mirror the shared zod schema's refinement client-side so the user gets
    // a 422-equivalent inline error without an extra round-trip.
    const validated = setThresholdInput.safeParse(payload);
    if (!validated.success) {
      const first = validated.error.issues[0];
      setError(first?.message ?? "Invalid thresholds");
      return;
    }

    save.mutate(validated.data, {
      onError: (e) => {
        if (e instanceof ApiError) {
          setError(e.message || "Save failed");
        } else if (e instanceof Error) {
          setError(e.message);
        } else {
          setError("Save failed");
        }
      },
    });
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Modal
      title={`Set thresholds — ${sku} @ ${warehouseName}`}
      onClose={handleCancel}
    >
      <div className="text-[12px] text-base-600 mb-3.5 font-body">
        Leave blank to clear; high must be ≥ low when both set.
      </div>

      <div className="mb-3.5">
        <label
          htmlFor="set-threshold-low"
          className="label mb-1.5 block"
        >
          Low threshold
        </label>
        <input
          id="set-threshold-low"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          placeholder="e.g. 5 (blank to clear)"
          value={lowText}
          onChange={(e) => setLowText(e.target.value)}
          className={INPUT_CLS}
          data-testid="set-threshold-low-input"
        />
      </div>

      <div className="mb-3.5">
        <label
          htmlFor="set-threshold-high"
          className="label mb-1.5 block"
        >
          High threshold
        </label>
        <input
          id="set-threshold-high"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          placeholder="e.g. 20 (blank to clear)"
          value={highText}
          onChange={(e) => setHighText(e.target.value)}
          className={INPUT_CLS}
          data-testid="set-threshold-high-input"
        />
      </div>

      {error ? (
        <div
          role="alert"
          data-testid="set-threshold-error"
          className="text-[11px] font-body mb-3.5 px-2.5 py-1.5 rounded-[4px]"
          style={{
            color: "var(--destructive)",
            background: "var(--error-soft)",
          }}
        >
          {error}
        </div>
      ) : null}

      <ModalActions
        onCancel={handleCancel}
        onPrimary={handleSave}
        primary="Save"
        primaryPending={save.isPending}
      />
    </Modal>
  );
}
