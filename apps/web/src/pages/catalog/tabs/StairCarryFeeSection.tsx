import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CatalogResponse } from "@carres/shared";
import { MAX_DELIVERY_FLOOR } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { usePatchFloorConfig } from "@/lib/queries";
import { INPUT_CLS } from "@/pages/operation/components/Modal";

/**
 * Stair-carry fee (floor_config) — principal-gated. Lives in the Special
 * Add-ons tab's Order Add-ons panel (Loo 2026-07-06 — it's an order-level
 * add-on charge, not delivery-trip config; moved out of the Delivery tab).
 */
export default function StairCarryFeeSection({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const patch = usePatchFloorConfig();
  const fc = catalog.floorConfig;
  const [freeUpTo, setFreeUpTo] = useState(String(fc.freeUpToFloor));
  const [perFloor, setPerFloor] = useState(String(fc.perFloorPerItem));

  // Re-sync the inputs if the bundle refetches with new floor_config values
  // (another session saved, or our own save round-tripped) so the editor never
  // shows stale numbers against a changed server state.
  useEffect(() => {
    setFreeUpTo(String(fc.freeUpToFloor));
    setPerFloor(String(fc.perFloorPerItem));
  }, [fc.freeUpToFloor, fc.perFloorPerItem]);

  const freeNum = Number(freeUpTo);
  const perNum = Number(perFloor);
  const valid =
    Number.isInteger(freeNum) &&
    freeNum >= 0 &&
    Number.isFinite(perNum) &&
    perNum >= 0;
  const dirty = freeNum !== fc.freeUpToFloor || perNum !== fc.perFloorPerItem;

  function save() {
    if (!valid || !dirty) return;
    patch.mutate(
      { freeUpToFloor: freeNum, perFloorPerItem: perNum },
      {
        onSuccess: () => toast.success("Delivery fee saved"),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Save failed"),
      },
    );
  }

  return (
    <section data-testid="stair-carry-section">
      <div className="text-strong font-display mb-1">Stair-carry fee</div>
      <p className="text-meta text-base-500 mb-3">
        Free up to a floor, then a per-floor-per-item charge. Carres does not
        stair-carry above floor {MAX_DELIVERY_FLOOR}. Separate from the delivery
        trip fee — both fold into the order total.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>
      <div className="bg-white border border-base-200 rounded-[4px] p-4 flex flex-wrap gap-5 items-end">
        <label className="block">
          <span className="label block mb-1">Free up to floor</span>
          <input
            type="number"
            min={0}
            step="1"
            value={freeUpTo}
            disabled={!isPrincipal}
            onChange={(e) => setFreeUpTo(e.target.value)}
            className={`${INPUT_CLS} w-32 disabled:opacity-60`}
          />
        </label>
        <label className="block">
          <span className="label block mb-1">Per floor / item (RM)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={perFloor}
            disabled={!isPrincipal}
            onChange={(e) => setPerFloor(e.target.value)}
            className={`${INPUT_CLS} w-32 disabled:opacity-60`}
          />
        </label>
        {isPrincipal && (
          <button
            type="button"
            onClick={save}
            disabled={!valid || !dirty || patch.isPending}
            className="btn-primary text-meta disabled:opacity-40"
          >
            {patch.isPending ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </section>
  );
}
