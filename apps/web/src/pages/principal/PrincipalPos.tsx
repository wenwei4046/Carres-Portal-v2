import { useMemo, useState } from "react";
import { usePrincipalDealers } from "@/lib/queries";
import type { DealerListItem } from "./components/DealerRow";
import DealerPos from "@/pages/dealer/DealerPos";

/**
 * Principal POS — the dealer/showroom catalog-first POS, reused for a principal
 * placing an order ON BEHALF OF a dealer it picks (Option A, 2026-06-25).
 *
 * The principal carries no own `dealer_id`, so `create_order` (which requires
 * one) is unlocked by choosing a dealer first. Once chosen, we mount the SAME
 * `DealerPos` with `actingDealerId` set — it threads that id into the storage
 * upload folder + the order body's `dealerId` (which the API honors only for
 * internal roles). The dealer path (no `actingDealerId`) is untouched.
 */
export default function PrincipalPos({ onExit }: { onExit?: () => void }) {
  const { data, isLoading } = usePrincipalDealers();
  const [acting, setActing] = useState<{ id: string; name: string } | null>(null);
  const [pick, setPick] = useState<string>("");

  // Only ACTIVE dealers can take a real order (matches the live status gate).
  const dealers = useMemo(
    () => ((data?.dealers ?? []) as DealerListItem[]).filter((d) => d.status === "active"),
    [data],
  );

  // A dealer is picked → hand off to the full-screen POS. Exit returns here so
  // the principal can place another order for a different dealer (or leave).
  if (acting) {
    return (
      <DealerPos
        actingDealerId={acting.id}
        actingDealerName={acting.name}
        onExit={() => {
          setActing(null);
          setPick("");
        }}
      />
    );
  }

  const chosen = dealers.find((d) => d.id === pick);

  return (
    <div className="min-h-full grid place-items-center p-8">
      <div className="w-full max-w-md bg-card border border-base-200 rounded-lg shadow-sm p-7">
        <p className="t-micro text-base-400">Principal · place an order</p>
        <h1 className="t-h2 mt-1">New order on behalf of a dealer</h1>
        <p className="t-small text-base-500 mt-2">
          Pick the dealer this sale belongs to. The order, outlet and salesperson
          are recorded under that dealer; the activity log keeps your name as who
          placed it.
        </p>

        <label className="block mt-6">
          <span className="t-tiny uppercase tracking-wide text-base-500">Dealer</span>
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            disabled={isLoading || dealers.length === 0}
            data-testid="principal-pos-dealer"
            className="mt-1 w-full rounded-md border border-base-300 bg-white px-3 py-2 t-body disabled:opacity-50"
          >
            <option value="">
              {isLoading
                ? "Loading dealers…"
                : dealers.length === 0
                  ? "No active dealers"
                  : "Select a dealer…"}
            </option>
            {dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-7 flex items-center justify-between gap-3">
          <button type="button" onClick={() => onExit?.()} className="btn-ghost">
            ← Back
          </button>
          <button
            type="button"
            disabled={!chosen}
            onClick={() => chosen && setActing({ id: chosen.id, name: chosen.name })}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="principal-pos-start"
          >
            Start order →
          </button>
        </div>
      </div>
    </div>
  );
}
