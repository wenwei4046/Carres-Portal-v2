import { useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import {
  resolveFormTab,
  type CatalogResponse,
  type CustomField,
  type OrderEntryTab,
  type OutletDto,
  type SalespersonDto,
} from "@carres/shared";
import MYAddressFields from "@/components/MYAddressFields";
import { composeAddress } from "@/data/malaysia-postcodes";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useCustomerSearch, useCustomerTypeProbe, type CustomerSearchHit } from "@/lib/queries";
import { step2FirstDisposalIssue, step3DateValid, type WizardDraft } from "../new-order/draft";
import Step3Delivery from "../new-order/Step3Delivery";
import AddonsPanel, { offerableAddons } from "./AddonsPanel";
import StairCarryFields from "./StairCarryFields";
import OrderSummaryRail from "./OrderSummaryRail";
import { customerPatchFromHit, RELATIONSHIPS } from "./customer-autofill";

/** MY-standard demographic option lists (0200 — feed Sales analysis). */
const RACE_OPTIONS = ["Malay", "Chinese", "Indian", "Other"] as const;
const GENDER_OPTIONS = ["Female", "Male"] as const;

const PHONE_RE = /^[0-9-+\s]{8,}/;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** In-flow dealer pick (internal operator placing on behalf of a dealer).
 *  Absent for dealer-side logins — their JWT dealer is the order's dealer. */
export interface DealerPick {
  dealers: Array<{ id: string; name: string }>;
  loading: boolean;
  value: string | null;
  onPick: (id: string, name: string) => void;
}

const PHASE1_STEPS = ["Customer", "Address", "Emergency", "Target date"] as const;

/**
 * Step 02 — CUSTOMER, prototype skin (`.handover` Phase 1, Loo's Claude
 * Design 2026-07-04): two-column layout — left = phase banner ("Phase 1 of
 * 2 · Additional info") + step-pill nav + ONE sub-step per screen (Customer /
 * Address / Emergency / Target date) + ghost-Back / primary-Next footer;
 * right = the live `.summary` Order-summary rail.
 *
 * All Carres functionality is carried over unchanged: in-flow dealer pick
 * (internal operators), outlet/salesperson, EMAIL + CUSTOMER TYPE (AUTO
 * probe) + RACE/GENDER/BIRTHDAY (0200), MY cascading address + billing,
 * emergency contact, Step3Delivery date rules (lead time / TBD / ASAP /
 * proceed date) and stair-carry. The final Next calls `onProceed` — DealerPos
 * still holds the authoritative customerReady gate.
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
  onProceed,
  initialSubStep = 0,
}: {
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
  outlets: OutletDto[];
  salespersons: SalespersonDto[];
  catalog: CatalogResponse;
  minLeadDays: number;
  dealerPick?: DealerPick;
  onBackToCart?: () => void;
  onProceed?: () => void;
  /** Sub-step to open on (Loo 2026-07-12): Back from the CONFIRM step lands on
   *  Target date (3) — the previous screen — not the first Customer form. */
  initialSubStep?: 0 | 1 | 2 | 3;
}) {
  const c = draft.customer;
  const [stepIdx, setStepIdx] = useState<0 | 1 | 2 | 3>(initialSubStep);

  // 0219 — the form renders from order_entry_config (SO Maintenance edits it):
  // toggleable builtins (email/race/gender/birthday, the emergency block) +
  // operator-defined custom fields per tab. Absent config → code defaults =
  // the exact pre-0219 form.
  const formCfg = catalog.orderEntryConfig?.formFields ?? null;
  const custTab = resolveFormTab(formCfg, "customer");
  const addrTab = resolveFormTab(formCfg, "address");
  const emgTab = resolveFormTab(formCfg, "emergency");
  const targetTab = resolveFormTab(formCfg, "target");
  const custB = custTab.builtins;
  const emergencyBlock = emgTab.builtins["emergency"];

  function setCustom(key: string, value: string) {
    onChange({
      ...draft,
      customer: { ...c, custom: { ...(c.custom ?? {}), [key]: value } },
    });
  }
  function customsValid(tab: ReturnType<typeof resolveFormTab>): boolean {
    return tab.custom.every((f) => !f.required || (c.custom?.[f.key] ?? "").trim().length > 0);
  }

  // FULL NAME autocomplete — search past orders' customers by the (debounced)
  // typed name; picking a hit prefills the whole customer block (address +
  // emergency contact included). The dropdown opens on typing/focus and closes
  // on blur or pick; item mousedown fires before the input's blur.
  const [showSuggest, setShowSuggest] = useState(false);
  const debouncedName = useDebouncedValue(c.name.trim(), 300);
  const search = useCustomerSearch(debouncedName);
  const suggestions = showSuggest ? (search.data?.customers ?? []) : [];

  function pickCustomer(hit: CustomerSearchHit) {
    onChange({ ...draft, customer: { ...c, ...customerPatchFromHit(hit) } });
    setShowSuggest(false);
  }

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

  const dealerPending = !!dealerPick && !dealerPick.value;
  const todayIso = new Date().toISOString().slice(0, 10);

  // Per-sub-step advance gates (mirror draft.ts step1FirstIssue's groups).
  // 0219 — toggleable builtins gate per the resolved config; required custom
  // fields gate their own tab.
  function canAdvance(): boolean {
    if (dealerPending) return false;
    if (stepIdx === 0) {
      const emailOk = custB["email"]?.required
        ? EMAIL_RE.test(c.email.trim())
        : !c.email.trim() || EMAIL_RE.test(c.email.trim());
      return (
        !!draft.outletId &&
        !!draft.salespersonId &&
        c.name.trim().length >= 2 &&
        PHONE_RE.test(c.phone) &&
        emailOk &&
        (!custB["race"]?.required || !!c.race) &&
        (!custB["gender"]?.required || !!c.gender) &&
        (!custB["birthday"]?.required || !!c.birthday) &&
        customsValid(custTab)
      );
    }
    if (stepIdx === 1) {
      const addressOk =
        c.addressUnknown ||
        (c.addressLine1.trim().length >= 5 &&
          !!c.addressState &&
          !!c.addressCity &&
          !!c.addressPostcode);
      const billingOk = c.billingSame || c.billing.trim().length >= 5;
      return addressOk && billingOk && customsValid(addrTab);
    }
    if (stepIdx === 2) {
      const blockOk =
        !emergencyBlock?.required ||
        (c.emergencyName.trim().length >= 2 &&
          PHONE_RE.test(c.emergencyPhone) &&
          !!c.emergencyRelationship &&
          (c.emergencyRelationship !== "__OTHER__" ||
            c.emergencyRelationshipOther.trim().length >= 2));
      return blockOk && customsValid(emgTab);
    }
    // Target date: date rules + every picked disposal add-on must have a size
    // (the add-ons picker lives on this sub-step now — same gate the cart
    // drawer applies via step2Valid).
    return (
      step3DateValid(draft, minLeadDays) &&
      step2FirstDisposalIssue(draft) === null &&
      customsValid(targetTab)
    );
  }

  function next() {
    if (!canAdvance()) return;
    if (stepIdx < 3) setStepIdx((stepIdx + 1) as 0 | 1 | 2 | 3);
    else onProceed?.();
  }

  return (
    <div className="handover">
      {/* ── Left: phase banner + step pills + one sub-step per screen ── */}
      <div className="handover__left">
        <div className="handover__title-row">
          <div>
            <span className="phase-banner">
              <span className="phase-banner__dot" />
              Phase 1 of 2 · Additional info
            </span>
            <h1 className="handover__title">Customer additional info</h1>
          </div>
        </div>
        <p className="handover__sub">
          Hand the tablet to the customer to fill in their details. Quote items have been carried
          over — no re-entry needed.
        </p>

        <div className="steps">
          {PHASE1_STEPS.map((label, i) => (
            <div
              key={label}
              className={`step-pill ${stepIdx === i ? "is-active" : ""} ${stepIdx > i ? "is-done" : ""}`}
              data-testid={`pos-customer-chip-${i + 1}`}
            >
              <span className="step-pill__num">
                {stepIdx > i ? <Check size={11} strokeWidth={3} /> : i + 1}
              </span>
              <span className="step-pill__label">{label}</span>
            </div>
          ))}
        </div>

        {/* Dealer card — internal operator picks who this sale belongs to. */}
        {dealerPick && stepIdx === 0 && (
          <div className="fade-in" style={{ marginBottom: 22 }}>
            <div className="field">
              <span className="field__label">
                Dealer <span style={{ color: "var(--c-orange)" }}>*</span>
              </span>
              <select
                value={dealerPick.value ?? ""}
                onChange={(e) => {
                  const d = dealerPick.dealers.find((x) => x.id === e.target.value);
                  if (d) dealerPick.onPick(d.id, d.name);
                }}
                disabled={dealerPick.loading || dealerPick.dealers.length === 0}
                data-testid="pos-dealer-pick"
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
              <span className="field__hint">
                The order, outlet and salesperson are recorded under this dealer; the activity log
                keeps your name as who placed it.
              </span>
            </div>
          </div>
        )}

        {dealerPending ? (
          <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>
            Pick a dealer to continue — the outlet and salesperson lists follow the dealer.
          </p>
        ) : (
          <>
            {/* ── 1 · Customer ── */}
            {stepIdx === 0 && (
              <div className="fade-in">
                <div className="form-grid">
                  <div className="field">
                    <span className="field__label">Outlet *</span>
                    <select value={draft.outletId ?? ""} onChange={(e) => setOutlet(e.target.value)}>
                      <option value="">— pick outlet —</option>
                      {outlets.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <span className="field__label">Salesperson *</span>
                    <select
                      value={draft.salespersonId ?? ""}
                      onChange={(e) =>
                        onChange({ ...draft, salespersonId: e.target.value || null })
                      }
                      disabled={visibleSPs.length === 0}
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
                  </div>
                  <div className="field">
                    <span className="field__label">Full name *</span>
                    <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
                      <input
                        value={c.name}
                        placeholder="e.g. Tan Mei Ling, 陈志强, Ahmad bin Yusof"
                        autoComplete="off"
                        data-testid="pos-customer-name"
                        onChange={(e) => {
                          setC({ name: e.target.value });
                          setShowSuggest(true);
                        }}
                        onFocus={() => setShowSuggest(true)}
                        onBlur={() => setShowSuggest(false)}
                      />
                      {suggestions.length > 0 && (
                        <div className="cust-suggest" data-testid="pos-customer-suggest">
                          <div className="cust-suggest__head">Existing customers</div>
                          {suggestions.map((h, i) => (
                            <button
                              type="button"
                              key={(h.phone ?? h.name) + i}
                              className="cust-suggest__item"
                              data-testid={`pos-customer-suggest-${i}`}
                              // mousedown (not click) — must beat the input's
                              // blur, which unmounts the dropdown.
                              onMouseDown={(e) => {
                                e.preventDefault();
                                pickCustomer(h);
                              }}
                            >
                              <span className="cust-suggest__name">{h.name}</span>
                              <span className="cust-suggest__meta">
                                {[h.phone, h.address].filter(Boolean).join(" · ") ||
                                  "no phone / address on file"}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="field__hint">
                      Returning customer? Pick from the list to auto-fill their info.
                    </span>
                  </div>
                  <div className="field">
                    <span className="field__label">Phone *</span>
                    <input
                      value={c.phone}
                      placeholder="012-3456789"
                      onChange={(e) => setC({ phone: e.target.value })}
                    />
                  </div>
                  {custB["email"]?.enabled && (
                    <div className="field field--span">
                      <span className="field__label">
                        Email{" "}
                        {custB["email"]?.required && (
                          <span style={{ color: "var(--c-orange)" }}>*</span>
                        )}
                      </span>
                      <input
                        type="email"
                        value={c.email}
                        placeholder="customer@example.com — for receipt & order updates"
                        onChange={(e) => setC({ email: e.target.value })}
                      />
                    </div>
                  )}
                  {custB["customerType"]?.enabled && (
                    <div className="field">
                      <span className="field__label">Customer type (auto)</span>
                      <input
                        value={customerType}
                        readOnly
                        disabled
                        data-testid="pos-customer-type"
                        style={{
                          background: "var(--pos-rail)",
                          color: "var(--fg-muted)",
                          cursor: "not-allowed",
                        }}
                      />
                      <span className="field__hint">Auto-detected from past orders (phone)</span>
                    </div>
                  )}
                  {custB["race"]?.enabled && (
                    <div className="field">
                      <span className="field__label">Race{custB["race"]?.required ? " *" : ""}</span>
                      <select
                        value={c.race}
                        onChange={(e) => setC({ race: e.target.value })}
                        data-testid="pos-customer-race"
                      >
                        <option value="">— select —</option>
                        {RACE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {custB["gender"]?.enabled && (
                    <div className="field">
                      <span className="field__label">Gender{custB["gender"]?.required ? " *" : ""}</span>
                      <select
                        value={c.gender}
                        onChange={(e) => setC({ gender: e.target.value })}
                        data-testid="pos-customer-gender"
                      >
                        <option value="">— select —</option>
                        {GENDER_OPTIONS.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {custB["birthday"]?.enabled && (
                    <div className="field">
                      <span className="field__label">
                        Birthday{custB["birthday"]?.required ? " *" : ""}
                      </span>
                      <input
                        type="date"
                        value={c.birthday}
                        max={todayIso}
                        onChange={(e) => setC({ birthday: e.target.value })}
                        data-testid="pos-customer-birthday"
                      />
                    </div>
                  )}
                  <CustomFieldsInputs
                    tab="customer"
                    fields={custTab.custom}
                    values={c.custom ?? {}}
                    onSet={setCustom}
                  />
                </div>
              </div>
            )}

            {/* ── 2 · Address ── */}
            {stepIdx === 1 && (
              <div className="fade-in">
                <label className={`addr-toggle ${c.addressUnknown ? "is-on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={c.addressUnknown}
                    onChange={(e) =>
                      setC({
                        addressUnknown: e.target.checked,
                        // Wipe structured fields when toggled on so a later
                        // un-toggle doesn't surface stale data.
                        ...(e.target.checked
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
                  <span className="addr-toggle__box">
                    {c.addressUnknown && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span>
                    <strong>Fill in address later</strong>
                    <span className="addr-toggle__hint">
                      Customer hasn't confirmed the delivery address yet — it's required before
                      the order can move to operation.
                    </span>
                  </span>
                </label>

                {!c.addressUnknown && (
                  <div style={{ marginTop: 22 }}>
                    <div
                      style={{
                        marginBottom: 14,
                        fontFamily: "var(--font-button)",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      Delivery address
                    </div>
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
                  </div>
                )}

                <label
                  className={`addr-toggle ${c.billingSame ? "is-on" : ""}`}
                  style={{ marginTop: 22 }}
                >
                  <input
                    type="checkbox"
                    checked={c.billingSame}
                    onChange={(e) =>
                      setC({
                        billingSame: e.target.checked,
                        billing: e.target.checked
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
                  <span className="addr-toggle__box">
                    {c.billingSame && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span>
                    <strong>Billing address same as delivery address</strong>
                    <span className="addr-toggle__hint">
                      Uncheck if the invoice should be issued to a different address.
                    </span>
                  </span>
                </label>

                {!c.billingSame && (
                  <div className="form-grid" style={{ marginTop: 22 }}>
                    <div className="field field--span">
                      <span className="field__label">Billing address</span>
                      <textarea
                        rows={2}
                        value={c.billing}
                        placeholder="Unit, street, area"
                        onChange={(e) => setC({ billing: e.target.value })}
                      />
                    </div>
                  </div>
                )}
                {addrTab.custom.length > 0 && (
                  <div className="form-grid" style={{ marginTop: 22 }}>
                    <CustomFieldsInputs
                      tab="address"
                      fields={addrTab.custom}
                      values={c.custom ?? {}}
                      onSet={setCustom}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── 3 · Emergency ── */}
            {stepIdx === 2 && !emergencyBlock?.enabled && (
              <div className="fade-in">
                <p style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 16 }}>
                  Emergency contact is switched off in the order-entry config — nothing to
                  fill here.
                </p>
                {emgTab.custom.length > 0 && (
                  <div className="form-grid">
                    <CustomFieldsInputs
                      tab="emergency"
                      fields={emgTab.custom}
                      values={c.custom ?? {}}
                      onSet={setCustom}
                    />
                  </div>
                )}
              </div>
            )}
            {stepIdx === 2 && emergencyBlock?.enabled && (
              <div className="fade-in">
                <p style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 16 }}>
                  Used only if we cannot reach the customer on delivery day.
                  {!emergencyBlock?.required && " Optional."}
                </p>
                <div className="form-grid">
                  <div className="field">
                    <span className="field__label">Contact name *</span>
                    <input
                      value={c.emergencyName}
                      placeholder="Name"
                      onChange={(e) => setC({ emergencyName: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <span className="field__label">Relationship *</span>
                    <select
                      value={c.emergencyRelationship}
                      onChange={(e) =>
                        setC({
                          emergencyRelationship: e.target.value,
                          emergencyRelationshipOther:
                            e.target.value === "__OTHER__" ? c.emergencyRelationshipOther : "",
                        })
                      }
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
                  <div className="field field--span">
                    <span className="field__label">Phone *</span>
                    <input
                      value={c.emergencyPhone}
                      placeholder="012-9988776"
                      onChange={(e) => setC({ emergencyPhone: e.target.value })}
                    />
                  </div>
                  {c.emergencyRelationship === "__OTHER__" && (
                    <div className="field field--span">
                      <span className="field__label">Specify relationship *</span>
                      <input
                        value={c.emergencyRelationshipOther}
                        placeholder="Specify relationship"
                        onChange={(e) => setC({ emergencyRelationshipOther: e.target.value })}
                      />
                    </div>
                  )}
                  <CustomFieldsInputs
                    tab="emergency"
                    fields={emgTab.custom}
                    values={c.custom ?? {}}
                    onSet={setCustom}
                  />
                </div>
              </div>
            )}

            {/* ── 4 · Target date + delivery access + order add-ons ── */}
            {stepIdx === 3 && (
              <div className="fade-in">
                <Step3Delivery
                  draft={draft}
                  onChange={onChange}
                  catalog={catalog}
                  minLeadDays={minLeadDays}
                />
                <div style={{ borderTop: "1px solid var(--line)", marginTop: 24, paddingTop: 24 }}>
                  <StairCarryFields draft={draft} onChange={onChange} cfg={catalog.floorConfig} />
                </div>
                {/* Order add-ons (Loo 2026-07-12) — inline under Target date,
                    not a 5th sub-step. Same catalog `addons` the maintenance
                    "Order Add-ons" tab configures (disposal services etc.);
                    shares the cart's AddonsPanel so selections stay in sync. */}
                {offerableAddons(catalog.addons).length > 0 && (
                  <div
                    style={{ borderTop: "1px solid var(--line)", marginTop: 24, paddingTop: 24 }}
                    data-testid="pos-target-date-addons"
                  >
                    <div className="flex items-baseline justify-between mb-3">
                      <h3 className="kicker">Order add-ons</h3>
                      <p className="text-[11px] text-base-500">
                        Optional services charged on this order — e.g. dispose old mattress
                      </p>
                    </div>
                    <AddonsPanel
                      addons={offerableAddons(catalog.addons)}
                      draft={draft}
                      onChange={onChange}
                    />
                  </div>
                )}
                {targetTab.custom.length > 0 && (
                  <div
                    style={{ borderTop: "1px solid var(--line)", marginTop: 24, paddingTop: 24 }}
                  >
                    <div className="form-grid">
                      <CustomFieldsInputs
                        tab="target"
                        fields={targetTab.custom}
                        values={c.custom ?? {}}
                        onSet={setCustom}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Footer nav — ghost Back / primary Next (last step → Continue) */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 32,
            paddingTop: 20,
            borderTop: "1px solid var(--line)",
          }}
        >
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() =>
              stepIdx === 0 ? onBackToCart?.() : setStepIdx((stepIdx - 1) as 0 | 1 | 2 | 3)
            }
          >
            <ArrowLeft size={14} strokeWidth={1.75} />
            {stepIdx === 0 ? "Back to cart" : "Previous"}
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn--primary btn--lg"
            disabled={!canAdvance()}
            onClick={next}
            data-testid="pos-customer-next"
          >
            {stepIdx < 3 ? "Next" : "Continue to confirm"}
            <ArrowRight size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* ── Right: live order summary rail ── */}
      <OrderSummaryRail draft={draft} catalog={catalog} />
    </div>
  );
}

/** 0219 — operator-configured CUSTOM fields for one tab (SO Maintenance
 *  "Order Entry" editor authors them). Values live in draft.customer.custom
 *  and submit as entry_data.fields. */
function CustomFieldsInputs({
  tab,
  fields,
  values,
  onSet,
}: {
  tab: OrderEntryTab;
  fields: CustomField[];
  values: Record<string, string>;
  onSet: (key: string, value: string) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <>
      {fields.map((f) => (
        <div key={f.key} className="field" data-testid={`pos-custom-${tab}-${f.key}`}>
          <span className="field__label">
            {f.label}
            {f.required && <span style={{ color: "var(--c-orange)" }}> *</span>}
          </span>
          {f.type === "select" ? (
            <select value={values[f.key] ?? ""} onChange={(e) => onSet(f.key, e.target.value)}>
              <option value="">— select —</option>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
              value={values[f.key] ?? ""}
              onChange={(e) => onSet(f.key, e.target.value)}
            />
          )}
        </div>
      ))}
    </>
  );
}
