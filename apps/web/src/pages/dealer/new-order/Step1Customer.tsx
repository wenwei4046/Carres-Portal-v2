import type { OutletDto, SalespersonDto } from "@carres/shared";
import MYAddressFields from "@/components/MYAddressFields";
import { composeAddress } from "@/data/malaysia-postcodes";
import type { WizardDraft } from "./draft";

const RELATIONSHIPS = [
  "Spouse",
  "Parent",
  "Child",
  "Sibling",
  "Relative",
  "Friend",
  "Colleague",
  "Helper",
] as const;

interface Props {
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
  outlets: OutletDto[];
  salespersons: SalespersonDto[];
}

export default function Step1Customer({ draft, onChange, outlets, salespersons }: Props) {
  const c = draft.customer;

  function setC(patch: Partial<WizardDraft["customer"]>) {
    onChange({ ...draft, customer: { ...c, ...patch } });
  }

  function setOutlet(outletId: string) {
    // If current SP isn't in this outlet, default to the first SP in it (or
    // null if none). Mirrors proto/new-order-step1.jsx setOutlet().
    const currentSP = salespersons.find((sp) => sp.id === draft.salespersonId);
    const keepSP =
      currentSP && currentSP.outletId === outletId
        ? draft.salespersonId
        : (salespersons.find((sp) => sp.outletId === outletId)?.id ?? null);
    onChange({ ...draft, outletId, salespersonId: keepSP });
  }

  const visibleSPs = draft.outletId
    ? salespersons.filter((sp) => sp.outletId === draft.outletId)
    : salespersons;

  return (
    <div className="flex flex-col gap-7">
      {/* Sale info */}
      <Section title="Sale info" hint="Manage outlets & salespersons in Settings">
        {outlets.length === 0 ? (
          <div className="rounded bg-warning-soft text-warning px-3 py-2.5 text-xs font-body">
            ⚠ No outlets yet — add one in <strong>Settings</strong> before creating an order.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Outlet *">
              <select
                value={draft.outletId ?? ""}
                onChange={(e) => setOutlet(e.target.value)}
                className={inputClass()}
              >
                <option value="">— pick outlet —</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Salesperson *">
              <select
                value={draft.salespersonId ?? ""}
                onChange={(e) =>
                  onChange({ ...draft, salespersonId: e.target.value || null })
                }
                disabled={visibleSPs.length === 0}
                className={inputClass({ disabled: visibleSPs.length === 0 })}
              >
                <option value="">
                  {visibleSPs.length === 0 ? "— none in this outlet —" : "— pick salesperson —"}
                </option>
                {visibleSPs.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </Section>

      {/* Customer details */}
      <Section title="Customer details" hint="Use English, Chinese, or Malay characters">
        <div className="grid grid-cols-2 gap-3.5">
          <Field label="Full name *">
            <input
              type="text"
              value={c.name}
              placeholder="e.g. Tan Mei Ling, 陈志强, Ahmad bin Yusof"
              onChange={(e) => setC({ name: e.target.value })}
              className={inputClass()}
            />
          </Field>
          <Field label="Phone *">
            <input
              type="text"
              value={c.phone}
              placeholder="012-3456789"
              onChange={(e) => setC({ phone: e.target.value })}
              className={inputClass()}
            />
          </Field>
        </div>

        {/* Address — cascading state → city → postcode picker */}
        <div className="mt-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="label">
              Delivery address {!c.addressUnknown && "*"}
            </span>
            <InlineCheckbox
              label="Customer hasn't provided yet"
              checked={c.addressUnknown}
              onChange={(v) =>
                setC({
                  addressUnknown: v,
                  // Wipe structured fields when toggled on so a later un-toggle
                  // doesn't surface stale data.
                  ...(v
                    ? { addressLine1: "", addressLine2: "", addressState: "", addressCity: "", addressPostcode: "" }
                    : {}),
                })
              }
            />
          </div>
          {c.addressUnknown ? (
            <div className="rounded bg-base-50 border border-dashed border-base-200 px-3 py-2.5 text-xs font-body text-base-500">
              Address will be required before this order can move to operation.
            </div>
          ) : (
            <MYAddressFields
              data={{
                addressLine1: c.addressLine1,
                addressLine2: c.addressLine2,
                addressState: c.addressState,
                addressCity: c.addressCity,
                addressPostcode: c.addressPostcode,
              }}
              onChange={(patch) => setC(patch)}
            />
          )}
        </div>

        {/* Emergency contact */}
        <div className="mt-3.5">
          <span className="label block mb-1.5">
            Emergency contact *
          </span>
          <div className="grid grid-cols-3 gap-2.5">
            <input
              type="text"
              value={c.emergencyName}
              placeholder="Name"
              onChange={(e) => setC({ emergencyName: e.target.value })}
              className={inputClass()}
            />
            <input
              type="text"
              value={c.emergencyPhone}
              placeholder="012-9988776"
              onChange={(e) => setC({ emergencyPhone: e.target.value })}
              className={inputClass()}
            />
            <select
              value={c.emergencyRelationship}
              onChange={(e) =>
                setC({
                  emergencyRelationship: e.target.value,
                  emergencyRelationshipOther:
                    e.target.value === "__OTHER__" ? c.emergencyRelationshipOther : "",
                })
              }
              className={inputClass()}
            >
              <option value="">— Relationship —</option>
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="__OTHER__">Others (type below)</option>
            </select>
          </div>
          {c.emergencyRelationship === "__OTHER__" && (
            <input
              type="text"
              value={c.emergencyRelationshipOther}
              placeholder="Specify relationship"
              onChange={(e) => setC({ emergencyRelationshipOther: e.target.value })}
              className={`${inputClass()} mt-1.5`}
            />
          )}
        </div>
      </Section>

      {/* Billing */}
      <Section title="Billing address">
        <InlineCheckbox
          label="Same as delivery address"
          checked={c.billingSame}
          onChange={(v) =>
            setC({
              billingSame: v,
              billing: v ? composeAddress({ line1: c.addressLine1, line2: c.addressLine2, state: c.addressState, city: c.addressCity, postcode: c.addressPostcode }) : c.billing,
            })
          }
        />
        {!c.billingSame && (
          <textarea
            rows={2}
            value={c.billing}
            placeholder="Billing address"
            onChange={(e) => setC({ billing: e.target.value })}
            className={`${inputClass()} mt-2.5`}
          />
        )}
        {c.billingSame && !c.addressUnknown && c.addressLine1 && (
          <div className="rounded bg-base-50 border border-dashed border-base-200 px-3 py-2.5 text-xs font-body text-base-700 mt-2">
            ↳ Bills will be sent to:{" "}
            <strong className="text-base-900">
              {composeAddress({
                line1: c.addressLine1,
                line2: c.addressLine2,
                state: c.addressState,
                city: c.addressCity,
                postcode: c.addressPostcode,
              })}
            </strong>
          </div>
        )}
      </Section>

      {/* 2026-05-22 (Loo) — Delivery date section moved to the new Step 3
          (Step3Delivery.tsx) because the min-date constraint depends on
          what's in the cart (mattress/bedframe 14 days, sofa 21 days). Step
          1 stays focused on customer + outlet + address info. */}
    </div>
  );
}

// --- small UI atoms ---

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
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

function InlineCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-base-700 font-body">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5"
      />
      {label}
    </label>
  );
}

function inputClass({ disabled }: { disabled?: boolean } = {}) {
  // Two-tone gating cue: active fields are pure WHITE (next to fill, draws
  // the eye); disabled / waiting-on-prerequisite fields fall back to the
  // body cream so the form's filling order reads at a glance.
  // 2990s re-skin: rounded-xl, 1.5px border, flame focus ring.
  if (disabled) {
    return "w-full px-3 py-2.5 text-sm font-body rounded-xl border-[1.5px] border-base-300 bg-base-50 text-base-500 cursor-not-allowed outline-none";
  }
  return "w-full px-3 py-2.5 text-sm font-body rounded-xl border-[1.5px] border-base-200 bg-white outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-colors";
}
