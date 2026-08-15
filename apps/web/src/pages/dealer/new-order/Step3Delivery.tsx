import { useMemo } from "react";
import { minDeliveryDateISO, type CatalogResponse } from "@carres/shared";
import type { WizardDraft } from "./draft";
import CalendarDateField from "../pos/date-keyin/CalendarDateField";
import { fmtChipDate } from "../pos/date-keyin/date-keyin";

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
 *
 * ⛔ 2026-08-15 (Jess) — **"Confirm later" is GONE.** The delivery date is a
 * PROMISE to the customer (`docs/orders/MASTER.md` — THE THREE DELIVERY
 * DATES), and if the date is not confirmed with the customer, Operation must
 * not receive the order. The step cannot be passed without a real date, and
 * `createOrderInputSchema` refuses a dateless order at the door as well.
 * Legacy no-date orders keep their governed `No delivery date` rendering and
 * their ConfirmDateModal until they close — nothing is rewritten.
 *
 * 2026-07-12 (Loo) — the "As Fast As Possible" pill is REMOVED. The dealer
 * always picks explicit dates; the `delivery.asap` draft flag stays in the
 * shape (date edits keep clearing it) but nothing sets it anymore.
 *
 * 2026-07-14 (Loo) — native `<input type="date">` replaced by
 * `CalendarDateField`: a POS-skinned calendar popover that greys out days
 * before the lead-time floor (quick-date chips were tried and dropped the
 * same day — Loo wants calendar-only). Draft contract unchanged (ISO
 * strings).
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

  // ISO yyyy-mm-dd of today + lead — the calendar's selectable floor; the
  // wizard footer ALSO validates via step3DateValid (defence in depth).
  const minDate = useMemo(() => minDeliveryDateISO(minLeadDays), [minLeadDays]);
  // Phase 11.1 — proceed (production-start) date floor = today; ceiling = the
  // delivery date. minDeliveryDateISO(0) is today in the same TZ as minDate.
  const todayIso = useMemo(() => minDeliveryDateISO(0), []);

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
        <div>
          <Field label="Delivery date *">
            <CalendarDateField
              value={d.date}
              onChange={(iso) =>
                // User picked a date — drop the ASAP flag so we don't
                // auto-proceed against a date the dealer overrode.
                setD({ date: iso, asap: false })
              }
              minIso={minDate}
              todayIso={todayIso}
              ariaLabel="Pick delivery date"
              footNote={
                minLeadDays > 0 ? (
                  <>
                    {minLeadDays}-day lead time · earliest <strong>{fmtChipDate(minDate)}</strong>
                  </>
                ) : (
                  <>Today onwards</>
                )
              }
              testId="delivery-date-input"
            />
          </Field>
          <p className="text-[11px] text-base-500 mt-1.5" data-testid="delivery-date-required-note">
            Ask the customer for the date before you save the order. An order
            without a delivery date cannot be filed.
          </p>
        </div>

        {/* Phase 11.1 (Loo) — Proceed date = the day production should START.
            Picked deliberately so we don't pull stock too early for a far-out
            delivery. Bounded today..deliveryDate. Hidden value when TBD. */}
        <div className="mt-3.5">
          <Field label="Proceed date · production start *">
            <CalendarDateField
              value={d.proceedDate}
              onChange={(iso) => setD({ proceedDate: iso, asap: false })}
              minIso={todayIso}
              maxIso={d.date || undefined}
              todayIso={todayIso}
              ariaLabel="Pick proceed date"
              footNote={
                d.date ? (
                  <>
                    Today → delivery (<strong>{fmtChipDate(d.date)}</strong>)
                  </>
                ) : (
                  <>Today onwards · pick the delivery date first to cap it</>
                )
              }
              testId="proceed-date-input"
            />
          </Field>
          <p className="text-[11px] text-base-500 mt-1.5">
            When production should start — pick it deliberately (e.g. ~a month
            before delivery) so we don't reserve stock too early. Must be on or
            before the delivery date.
          </p>
        </div>
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
  // A <div>, not a <label> — the picker children are buttons (chips/trigger),
  // and a wrapping label would re-dispatch text clicks onto the first one.
  return (
    <div className="block">
      <span className="label block mb-1.5">{label}</span>
      {children}
    </div>
  );
}

