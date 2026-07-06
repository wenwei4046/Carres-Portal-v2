import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CatalogResponse } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useUpdateFabricTierConfig } from "@/lib/queries";
import { INPUT_CLS } from "@/pages/operation/components/Modal";

/**
 * FabricTierDeltasCard — global RM premium for P2 and P3 sofa fabrics.
 * These apply to all sofa models unless a per-model override is set in the
 * Modular drawer. Principal-only write (RLS + UI gate).
 *
 * Moved out of MaintenanceTab (was 0176 → 0202): the Fabrics tab's "Fabric
 * Pricing" sidebar panel is now the ONLY entry point — the Maintenance tab's
 * duplicate "Fabric Tiers" item was removed (Loo 2026-07-06).
 */
export default function FabricTierDeltasCard({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const patch = useUpdateFabricTierConfig();
  const cfg = catalog.fabricTierConfig;

  const [t2, setT2] = useState(String(cfg?.sofaTier2Delta ?? 0));
  const [t3, setT3] = useState(String(cfg?.sofaTier3Delta ?? 0));

  // Re-sync when bundle refetches (another session saved or our own save)
  useEffect(() => {
    setT2(String(cfg?.sofaTier2Delta ?? 0));
    setT3(String(cfg?.sofaTier3Delta ?? 0));
  }, [cfg?.sofaTier2Delta, cfg?.sofaTier3Delta]);

  const t2Num = Number(t2);
  const t3Num = Number(t3);
  const valid =
    Number.isFinite(t2Num) && t2Num >= 0 &&
    Number.isFinite(t3Num) && t3Num >= 0;
  const dirty =
    t2Num !== (cfg?.sofaTier2Delta ?? 0) ||
    t3Num !== (cfg?.sofaTier3Delta ?? 0);

  function save() {
    if (!valid || !dirty) return;
    patch.mutate(
      { sofaTier2Delta: t2Num, sofaTier3Delta: t3Num },
      {
        onSuccess: () => toast.success("Fabric tier deltas saved"),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Save failed"),
      },
    );
  }

  return (
    <section>
      <div className="t-h4 font-display mb-1">Fabric tier deltas</div>
      <p className="t-tiny text-base-500 mb-3">
        Global RM premium added to the base sofa price for P2 (mid) and P3 (premium) fabrics.
        P1 fabrics always carry zero delta. Per-model overrides in the Modular tab take precedence.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>
      <div className="bg-white border border-base-200 rounded-[4px] p-4 flex flex-wrap gap-5 items-end">
        <label className="block">
          <span className="label block mb-1">P2 delta (RM)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={t2}
            disabled={!isPrincipal}
            onChange={(e) => setT2(e.target.value)}
            className={`${INPUT_CLS} w-32 disabled:opacity-60`}
            data-testid="global-tier2-delta"
          />
        </label>
        <label className="block">
          <span className="label block mb-1">P3 delta (RM)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={t3}
            disabled={!isPrincipal}
            onChange={(e) => setT3(e.target.value)}
            className={`${INPUT_CLS} w-32 disabled:opacity-60`}
            data-testid="global-tier3-delta"
          />
        </label>
        {isPrincipal && (
          <button
            type="button"
            onClick={save}
            disabled={!valid || !dirty || patch.isPending}
            className="btn-primary text-[12px] disabled:opacity-40"
            data-testid="global-tier-save"
          >
            {patch.isPending ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      {/* Summary pill */}
      <p className="t-tiny text-base-500 mt-2" data-testid="fabric-tier-summary">
        P2 adds <span className="font-semibold text-base-800">RM {(cfg?.sofaTier2Delta ?? 0).toFixed(2)}</span>
        &nbsp;&middot;&nbsp;
        P3 adds <span className="font-semibold text-base-800">RM {(cfg?.sofaTier3Delta ?? 0).toFixed(2)}</span>
      </p>
    </section>
  );
}
