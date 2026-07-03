import { useRef, useState } from "react";
import { CalendarDays, MapPin, Shield, User, type LucideIcon } from "lucide-react";
import type { CatalogResponse, OutletDto, SalespersonDto } from "@carres/shared";
import MYAddressFields from "@/components/MYAddressFields";
import { composeAddress } from "@/data/malaysia-postcodes";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useCustomerTypeProbe } from "@/lib/queries";
import type { WizardDraft } from "../new-order/draft";
import Step3Delivery from "../new-order/Step3Delivery";
import StairCarryFields from "./StairCarryFields";
import OrderSummaryRail from "./OrderSummaryRail";

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

/** MY-standard demographic option lists (0200 — feed Sales analysis). */
const RACE_OPTIONS = ["Malay", "Chinese", "Indian", "Other"] as const;
const GENDER_OPTIONS = ["Female", "Male"] as const;

/** In-flow dealer pick (internal operator placing on behalf of a dealer).
 *  Absent for dealer-side logins — their JWT dealer is the order's dealer. */
export interface DealerPick {
  dealers: Array<{ id: string; name: string }>;
  loading: boolean;
  value: string | null;
  onPick: (id: string, name: string) => void;
}

const CHIPS: Array<{ n: 1 | 2 | 3 | 4; label: string; icon: LucideIcon }> = [
  { n: 1, label: "Customer", icon: User },
  { n: 2, label: "Address", icon: MapPin },
  { n: 3, label: "Emergency", icon: Shield },
  { n: 4, label: "Target date", icon: CalendarDays },
];

/**
 * Step 02 — CUSTOMER (2990s Image-#4 parity). Header eyebrow "Phase 1 of 2 ·
 * Additional info" + Back-to-cart, a 4-chip section nav (Customer / Address /
 * Emergency / Target date) that scrolls to each card, the form column, and the
 * sticky right Order-summary rail. The Customer card gains EMAIL / CUSTOMER
 * TYPE (AUTO, probe by phone) / RACE / GENDER / BIRTHDAY (0200 demographics —
 * POS-required via the step1 gate, server-lenient).
 *
 * Absorbs the legacy Step1Customer form verbatim (sale info / customer /
 * address / emergency / billing — validation + composeAddress unchanged);
 * Step3Delivery + StairCarryFields render inside the Target-date card.
 *
 * POS-parity — when `dealerPick` is provided (internal operator), a Dealer card
 * leads the column; the rest of the form appears only after a dealer is chosen
 * (outlets + salespersons belong to that dealer).
 */
export default function CustomerStep({
  draft,
  onChange,
  outlets,
  salespersons,
  catalog,
  minLeadDays,
  dealerPick,
  onBackToCart,
}: {
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
  outlets: OutletDto[];
  salespersons: SalespersonDto[];
  catalog: CatalogResponse;
  minLeadDays: number;
  dealerPick?: DealerPick;
  onBackToCart?: () => void;
}) {
  const c = draft.customer;
  const [activeChip, setActiveChip] = useState<1 | 2 | 3 | 4>(1);
  const sectionRefs = {
    1: useRef<HTMLElement>(null),
    2: useRef<HTMLElement>(null),
    3: useRef<HTMLElement>(null),
    4: useRef<HTMLElement>(null),
  };

  // CUSTOMER TYPE (AUTO) — probe visible orders by the (debounced) phone.
  const debouncedPhone = useDebouncedValue(c.phone.trim(), 400);
  const probe = useCustomerTypeProbe(debouncedPhone);
  const customerType =
    debouncedPhone.length < 8
      ? "—"
      : probe.isLoading
        ? "Checking…"
        : probe.data?.existing
          ? "Existing customer"
          : "New customer";

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

  function goTo(n: 1 | 2 | 3 | 4) {
    setActiveChip(n);
    sectionRefs[n].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const dealerPending = !!dealerPick && !dealerPick.value;
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-6 animate-page-enter">
      {/* Header row — phase eyebrow + Back to cart (2990s parity) */}
      <div className="flex items-center justify-between mb-4">
        <p className="t-micro text-primary flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" aria-hidden="true" />
          Phase 1 of 2 · Additional info
        </p>
        {onBackToCart && (
          <button type="button" onClick={onBackToCart} className="btn-secondary text-[12px]">
            ← Back to cart
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="flex flex-col gap-6 min-w-0">
          {/* Section chip nav */}
          <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {CHIPS.map(({ n, label, icon: Icon }) => {
              const active = activeChip === n;
              return (
                <li key={n}>
                  <button
                    type="button"
                    onClick={() => goTo(n)}
                    aria-current={active ? "step" : undefined}
                    data-testid={`pos-customer-chip-${n}`}
                    className={[
                      "w-full flex items-center gap-2 rounded-xl border px-3.5 py-3 transition-colors text-left",
                      active
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-base-200 bg-white text-base-600 hover:border-base-300",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "grid place-items-center w-6 h-6 rounded-full text-[11px] font-semibold",
                        active ? "bg-primary text-white" : "bg-base-100 text-base-500",
                      ].join(" ")}
                    >
                      {n}
                    </span>
                    <Icon size={15} strokeWidth={1.75} />
                    <span className="t-small font-semibold truncate">{label}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* Dealer card — internal operator picks who this sale belongs to. */}
          {dealerPick && (
            <div className="pos-card p-6">
              <p className="t-micro text-base-400">Sale info</p>
              <h3 className="t-h4 mt-0.5">Dealer</h3>
              <p className="t-small text-base-500 mt-1">
                Pick the dealer this sale belongs to. The order, outlet and salesperson are
                recorded under that dealer; the activity log keeps your name as who placed it.
              </p>
              <select
                value={dealerPick.value ?? ""}
                onChange={(e) => {
                  const d = dealerPick.dealers.find((x) => x.id === e.target.value);
                  if (d) dealerPick.onPick(d.id, d.name);
                }}
                disabled={dealerPick.loading || dealerPick.dealers.length === 0}
                data-testid="pos-dealer-pick"
                className="mt-3 w-full max-w-sm rounded-md border border-base-300 bg-white px-3 py-2 t-body disabled:opacity-50"
              >
                <option value="">
                  {dealerPick.loading
                    ? "Loading dealers…"
                    : dealerPick.dealers.length === 0
                      ? "No active dealers"
                      : "Select a dealer…"}
                </option>
                {dealerPick.dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {dealerPending ? (
            <p className="t-small text-base-500 text-center py-4">
              Pick a dealer to continue — the outlet and salesperson lists follow the dealer.
            </p>
          ) : (
            <>
              {/* ── 1 · Customer additional info ── */}
              <section ref={sectionRefs[1]} className="pos-card p-6 scroll-mt-4">
                <h3 className="t-h3">Customer additional info</h3>
                <p className="t-small text-base-500 mt-1 mb-5">
                  Hand the tablet to the customer to fill in their details.
                </p>

                {/* Sale info */}
                <SectionBlock title="Sale info" hint="Manage outlets & salespersons in Settings">
                  {outlets.length === 0 ? (
                    <div className="rounded bg-warning-soft text-warning px-3 py-2.5 text-xs font-body">
                      ⚠ No outlets yet — add one in <strong>Settings</strong> before creating an
                      order.
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
                            {visibleSPs.length === 0
                              ? "— none in this outlet —"
                              : "— pick salesperson —"}
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
                </SectionBlock>

                {/* Identity */}
                <div className="mt-5 grid grid-cols-2 gap-3.5">
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
                  <Field label="Email *">
                    <input
                      type="email"
                      value={c.email}
                      placeholder="customer@example.com — for receipt & order updates"
                      onChange={(e) => setC({ email: e.target.value })}
                      className={inputClass()}
                    />
                  </Field>
                  <Field label="Customer type (auto)">
                    <input
                      type="text"
                      value={customerType}
                      readOnly
                      disabled
                      data-testid="pos-customer-type"
                      className={inputClass({ disabled: true })}
                    />
                    <span className="t-tiny text-base-400 mt-1 block">
                      Auto-detected from past orders (phone)
                    </span>
                  </Field>
                </div>

                {/* Demographics — 0200 */}
                <div className="mt-3.5 grid grid-cols-2 gap-3.5">
                  <Field label="Race *">
                    <select
                      value={c.race}
                      onChange={(e) => setC({ race: e.target.value })}
                      data-testid="pos-customer-race"
                      className={inputClass()}
                    >
                      <option value="">— select —</option>
                      {RACE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Gender *">
                    <select
                      value={c.gender}
                      onChange={(e) => setC({ gender: e.target.value })}
                      data-testid="pos-customer-gender"
                      className={inputClass()}
                    >
                      <option value="">— select —</option>
                      {GENDER_OPTIONS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Birthday *">
                    <input
                      type="date"
                      value={c.birthday}
                      max={todayIso}
                      onChange={(e) => setC({ birthday: e.target.value })}
                      data-testid="pos-customer-birthday"
                      className={inputClass()}
                    />
                  </Field>
                </div>
              </section>

              {/* ── 2 · Address ── */}
              <section ref={sectionRefs[2]} className="pos-card p-6 scroll-mt-4">
                <h3 className="t-h4 mb-4">Address</h3>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="label">Delivery address {!c.addressUnknown && "*"}</span>
                  <InlineCheckbox
                    label="Customer hasn't provided yet"
                    checked={c.addressUnknown}
                    onChange={(v) =>
                      setC({
                        addressUnknown: v,
                        // Wipe structured fields when toggled on so a later
                        // un-toggle doesn't surface stale data.
                        ...(v
                          ? {
                              addressLine1: "",
                              addressLine2: "",
                              addressState: "",
                              addressCity: "",
                              addressPostcode: "",
                            }
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

                {/* Billing */}
                <div className="mt-5">
                  <span className="label block mb-1.5">Billing address</span>
                  <InlineCheckbox
                    label="Same as delivery address"
                    checked={c.billingSame}
                    onChange={(v) =>
                      setC({
                        billingSame: v,
                        billing: v
                          ? composeAddress({
                              line1: c.addressLine1,
                              line2: c.addressLine2,
                              state: c.addressState,
                              city: c.addressCity,
                              postcode: c.addressPostcode,
                            })
                          : c.billing,
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
                </div>
              </section>

              {/* ── 3 · Emergency ── */}
              <section ref={sectionRefs[3]} className="pos-card p-6 scroll-mt-4">
                <h3 className="t-h4 mb-4">Emergency contact *</h3>
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
              </section>

              {/* ── 4 · Target date + delivery access ── */}
              <section ref={sectionRefs[4]} className="pos-card p-6 scroll-mt-4">
                <Step3Delivery
                  draft={draft}
                  onChange={onChange}
                  catalog={catalog}
                  minLeadDays={minLeadDays}
                />
                <div className="border-t border-base-100 mt-6 pt-6">
                  <StairCarryFields draft={draft} onChange={onChange} cfg={catalog.floorConfig} />
                </div>
              </section>
            </>
          )}
        </div>

        {/* Right rail — sticky Order summary (lg+) */}
        <div className="hidden lg:block sticky top-4">
          <OrderSummaryRail draft={draft} catalog={catalog} />
        </div>
      </div>
    </div>
  );
}

// --- small UI atoms (carried over from the retired Step1Customer) ---

function SectionBlock({
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
