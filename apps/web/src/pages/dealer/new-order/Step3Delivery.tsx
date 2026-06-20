import { useMemo } from "react";
import { minDeliveryDateISO, type CatalogResponse } from "@carres/shared";
import type { WizardDraft } from "./draft";

/**
 * Step 3 — Delivery date.
 *
 * 2026-05-22 (Loo) — split out of Step 1 because the min-date constraint
 * depends on what's in the cart. The wizard parent computes
 * `minLeadDays` from the cart's categories (via shared `maxLeadDaysFor`)
 * and passes it in.
 *
 * Rules:
 *   - Mattress + Bedframe SKUs gate at 14 days
 *   - Sofa SKUs gate at 21 days
 *   - When cart has mixed categories, the longest lead wins
 *   - "Confirm later" (TBD) still allowed — order parks in Place until a
 *     real date is entered later
 *   - "As Fast As Possible" pill = min date (= today + minLeadDays). Caps
 *     to 20 days when no lead-restricted category is in cart (matches the
 *     old Step 1 behavior so non-furniture / pure-addon orders aren't
 *     held up artificially).
 */
interface Props {
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
  catalog: CatalogResponse;
  minLeadDays: number;
}

export default function Step3Delivery({ draft, onChange, catalog, minLeadDays }: Props) {
  const d = draft.delivery;

  function setD(patch: Partial<WizardDraft["delivery"]>) {
    onChange({ ...draft, delivery: { ...d, ...patch } });
  }

  // ISO yyyy-mm-dd of today + lead. `<input type="date" min={...}>` enforces
  // it natively on most browsers; the wizard footer ALSO validates via
  // step3DateValid for browsers that ignore the min attribute (Safari old).
  const minDate = useMemo(() => minDeliveryDateISO(minLeadDays), [minLeadDays]);
  // Phase 11.1 — proceed (production-start) date floor = today; ceiling = the
  // delivery date. minDeliveryDateISO(0) is today in the same TZ as minDate.
  const todayIso = useMemo(() => minDeliveryDateISO(0), []);
  // 2026-05-22 (Loo) — ASAP pill snaps exactly to the cart's lead time
  // (mattress 14 / sofa 21). Fallback to 1 day when the cart has no gated
  // categories so the pill doesn't show "0 days". The old Math.max(..,20)
  // floor was a holdover from the legacy fixed-20-day rush rule.
  const asapDays = Math.max(minLeadDays, 1);

  // Category breakdown is consumed only for the hint header copy now. The
  // duplicate "Lead time driven by: ..." chip below the pill was redundant
  // with the "Earliest available: ..." line in the section header — dropped
  // per Loo's pass on the wording.
  const hasSofa = useMemo(() => {
    for (const line of draft.lines) {
      const sku = catalog.skus.find((s) => s.sku === line.sku);
      if (!sku) continue;
      const model = catalog.models.find((m) => m.id === sku.modelId);
      if (model?.category === "sofa") return true;
    }
    return false;
  }, [draft.lines, catalog]);

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Delivery date"
        hint={
          minLeadDays > 0
            ? `Earliest available: ${minDate} (${minLeadDays}-day lead time${
                hasSofa ? " · sofa production gating" : ""
              })`
            : undefined
        }
      >
        <div className="grid grid-cols-[1fr_auto] gap-3.5 items-end">
          <Field label={d.dateTbd ? "Delivery date (TBD)" : "Delivery date *"}>
            <input
              type="date"
              value={d.date}
              min={minDate}
              disabled={d.dateTbd}
              onChange={(e) =>
                // User edited the date manually — drop the ASAP flag so we
                // don't auto-proceed against a date the dealer overrode.
                setD({ date: e.target.value, asap: false })
              }
              className={inputClass({ disabled: d.dateTbd })}
            />
          </Field>
          <div className="pb-2.5">
            <InlineCheckbox
              label="Confirm later"
              checked={d.dateTbd}
              onChange={(v) =>
                // Phase 11.1 — TBD covers BOTH dates (clear proceed date too).
                setD({
                  dateTbd: v,
                  date: v ? "" : d.date,
                  proceedDate: v ? "" : d.proceedDate,
                  asap: v ? false : d.asap,
                })
              }
            />
          </div>
        </div>

        {/* Phase 11.1 (Loo) — Proceed date = the day production should START.
            Picked deliberately so we don't pull stock too early for a far-out
            delivery. Bounded today..deliveryDate. Hidden value when TBD. */}
        <div className="mt-3.5">
          <Field label={d.dateTbd ? "Proceed date · production start (TBD)" : "Proceed date · production start *"}>
            <input
              type="date"
              value={d.proceedDate}
              min={todayIso}
              max={d.date || undefined}
              disabled={d.dateTbd}
              onChange={(e) => setD({ proceedDate: e.target.value, asap: false })}
              className={inputClass({ disabled: d.dateTbd })}
              data-testid="proceed-date-input"
            />
          </Field>
          <p className="text-[11px] text-base-500 mt-1.5">
            When production should start — pick it deliberately (e.g. ~a month
            before delivery) so we don't reserve stock too early. Must be on or
            before the delivery date.
          </p>
        </div>

        {/* "As Fast As Possible" pill — same auto-Proceed semantics as
            before, but the date it sets is the actual lead-time floor when
            the cart has gated categories (vs the old fixed 20 days). */}
        <div className="flex items-center gap-2.5 mt-2.5">
          <button
            type="button"
            onClick={() => {
              const iso = minDeliveryDateISO(asapDays);
              // Phase 11.1 — ASAP = start production now, so proceed date = today.
              setD({ date: iso, proceedDate: todayIso, dateTbd: false, asap: true });
            }}
            disabled={d.dateTbd}
            className={`px-3 py-1.5 rounded text-[12px] font-semibold transition-colors ${
              d.asap
                ? "bg-primary text-white"
                : "border border-primary text-primary hover:bg-primary/5"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            data-testid="delivery-asap-pill"
          >
            ⚡ As Fast As Possible ({asapDays} days)
          </button>
          {d.asap && (
            <span className="text-[11px] text-base-600 font-body">
              Order will auto-proceed once submitted (skips the manual
              Place → Proceed click).
            </span>
          )}
        </div>

        {d.dateTbd && (
          <div className="rounded bg-warning-soft text-warning px-3 py-2.5 text-xs font-body mt-2.5">
            ⓘ Order will sit in <strong>Place</strong> until you confirm a date — it can't move
            to <em>Proceed</em> without one.
          </div>
        )}
      </Section>
    </div>
  );
}

// --- small UI atoms (mirrors Step1Customer for visual parity) ---

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="kicker">{title}</h3>
        {hint && <p className="text-[11px] text-base-500">{hint}</p>}
      </div>
      {children}
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

function InlineCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer text-[12px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4"
      />
      {label}
    </label>
  );
}

function inputClass({ disabled }: { disabled?: boolean } = {}) {
  // 2990s re-skin: rounded-xl, 1.5px border, flame focus ring.
  return `w-full px-3 py-2.5 border-[1.5px] border-base-200 rounded-xl text-sm outline-none transition-colors ${
    disabled
      ? "bg-base-50 text-base-500 cursor-not-allowed border-base-300"
      : "bg-white focus:border-primary focus:ring-2 focus:ring-primary/10"
  }`;
}
