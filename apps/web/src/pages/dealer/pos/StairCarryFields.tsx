import { LIFT_OPTIONS, MAX_DELIVERY_FLOOR, type FloorConfigDto } from "@carres/shared";
import { floorSurchargeRaw, stairCarryCount } from "@/lib/order-totals";
import { rm } from "@/lib/format-currency";
import type { WizardDraft } from "../new-order/draft";

/**
 * Stair-carry (delivery access) fields — floor / quantity / lift toggle + fee
 * panel. Lifted from the legacy Step2Products stair-carry block but relocated
 * to the CUSTOMER step (it's delivery info, and it needs the cart item count
 * which is known once the catalog step is done). Fee math goes through the
 * single-source `floorSurchargeRaw` so the preview can't drift from the order
 * detail.
 */
export default function StairCarryFields({
  draft,
  onChange,
  cfg,
}: {
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
  cfg: FloorConfigDto;
}) {
  function setDelivery(patch: Partial<WizardDraft["delivery"]>) {
    onChange({ ...draft, delivery: { ...draft.delivery, ...patch } });
  }
  function setFloor(next: number) {
    setDelivery({ floor: Math.max(1, Math.min(MAX_DELIVERY_FLOOR, next)) });
  }
  function bumpStairItems(delta: number, maxItems: number) {
    /* `?? 0` follows the 2026-08-27 ruling — unset is NONE, so `+` from an
       untouched stepper goes to 1, not to maxItems + 1. */
    const current = draft.delivery.stairItems ?? 0;
    setDelivery({ stairItems: Math.max(0, Math.min(maxItems, current + delta)) });
  }

  const itemsTotal = draft.lines.reduce((s, l) => s + l.qty, 0);
  /* ⭐ UNSET MEANS NONE — owner ruling 2026-08-27 (YH). This read `null =>
     itemsTotal`, so a dealer who never touched the stepper quoted the maximum
     stair fee. Somebody now has to say how many items need carrying before the
     customer is charged for carrying them. The same rule runs in
     `order-totals.ts` for a saved order, so this quote and the office page
     cannot disagree about the money. */
  const stairItemsEffective = stairCarryCount(itemsTotal, draft.delivery.stairItems);
  const stair = floorSurchargeRaw(
    draft.delivery.floor,
    draft.delivery.hasLift,
    stairItemsEffective,
    cfg,
  );

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="kicker">Delivery access</h3>
        <p className="text-[11px] text-base-500">
          1F–{cfg.freeUpToFloor}F free · {rm(cfg.perFloorPerItem)} per floor per item from{" "}
          {cfg.freeUpToFloor + 1}F · max {MAX_DELIVERY_FLOOR}F
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
        <Field label="Floor">
          <div className="flex items-center gap-1.5 border-[1.5px] border-base-200 bg-white rounded-xl px-1.5 py-1">
            <button
              type="button"
              onClick={() => setFloor(draft.delivery.floor - 1)}
              className="px-2.5 py-1.5 rounded text-sm hover:bg-base-100"
              aria-label="Decrease floor"
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={draft.delivery.floor}
              onChange={(e) => setFloor(parseInt(e.target.value, 10) || 1)}
              className="flex-1 min-w-0 text-center text-sm font-mono bg-transparent outline-none border-none py-1"
            />
            <button
              type="button"
              onClick={() => setFloor(draft.delivery.floor + 1)}
              disabled={draft.delivery.floor >= MAX_DELIVERY_FLOOR}
              className="px-2.5 py-1.5 rounded text-sm hover:bg-base-100 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Increase floor"
            >
              +
            </button>
          </div>
        </Field>

        <Field label={itemsTotal > 0 ? `Quantity (max ${itemsTotal})` : "Quantity"}>
          <div className="flex items-center gap-1.5 border-[1.5px] border-base-200 bg-white rounded-xl px-1.5 py-1">
            <button
              type="button"
              onClick={() => bumpStairItems(-1, itemsTotal)}
              disabled={itemsTotal === 0 || stairItemsEffective === 0}
              className="px-2.5 py-1.5 rounded text-sm hover:bg-base-100 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Decrease stair-carry quantity"
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={stairItemsEffective}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                const safe = Number.isFinite(parsed) ? Math.max(0, Math.min(itemsTotal, parsed)) : 0;
                setDelivery({ stairItems: safe });
              }}
              disabled={itemsTotal === 0}
              placeholder={itemsTotal === 0 ? "—" : ""}
              className="flex-1 min-w-0 text-center text-sm font-mono bg-transparent outline-none border-none py-1 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => bumpStairItems(1, itemsTotal)}
              disabled={itemsTotal === 0 || stairItemsEffective >= itemsTotal}
              className="px-2.5 py-1.5 rounded text-sm hover:bg-base-100 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Increase stair-carry quantity"
            >
              +
            </button>
          </div>
        </Field>

        {/* ⭐ THE WORDS COME FROM SHARED (Jess, 2026-08-26). They were typed
            here and nowhere else until the Sales Order object page had to ask
            the same question; two hand-typed copies of one answer list is how
            the two surfaces stop tallying. The SHAPE stays a pill pair — this
            is a tablet on a shop floor and a two-option pill is a bigger target
            than a select — but the list is no longer this file's to invent. */}
        <Field label="Lift available?">
          <div className="grid grid-cols-2 gap-1.5">
            {LIFT_OPTIONS.map((word) => {
              const isLift = word === "Has lift";
              return (
                <button
                  key={word}
                  type="button"
                  onClick={() => setDelivery({ hasLift: isLift })}
                  className={pillClass(draft.delivery.hasLift === isLift)}
                >
                  {word}
                </button>
              );
            })}
          </div>
        </Field>

        <div
          className={`rounded px-3.5 py-3 text-right border ${
            stair > 0 ? "border-primary bg-signature-50" : "border-base-200 bg-base-50"
          }`}
        >
          <div
            className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
              stair > 0 ? "text-primary" : "text-base-500"
            }`}
          >
            Stair carry fee
          </div>
          <div
            className={`font-mono text-lg font-bold mt-0.5 ${
              stair > 0 ? "text-primary" : "text-base-700"
            }`}
          >
            {rm(stair)}
          </div>
        </div>
      </div>

      {stair > 0 && (
        <p className="text-[11px] text-base-500 mt-2.5">
          {stairItemsEffective} of {itemsTotal} item{itemsTotal === 1 ? "" : "s"} ×{" "}
          {draft.delivery.floor - cfg.freeUpToFloor} floor
          {draft.delivery.floor - cfg.freeUpToFloor === 1 ? "" : "s"} above {cfg.freeUpToFloor}F ×{" "}
          {rm(cfg.perFloorPerItem)} ={" "}
          <span className="font-mono font-semibold text-base-900">{rm(stair)}</span>
        </p>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function pillClass(active: boolean) {
  return [
    "px-3 py-2.5 rounded border-[1.5px] text-sm font-semibold transition-colors",
    active
      ? "border-primary bg-signature-50 text-primary"
      : "border-base-300 bg-white text-base-700 hover:border-primary/40",
  ].join(" ");
}
