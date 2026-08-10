import { useEffect, useMemo } from "react";
import {
  resolvePaymentMethods,
  STRIPE_METHOD_KEY,
  STRIPE_PAYMENT_METHOD,
  type CatalogResponse,
} from "@carres/shared";
import { draftTotals } from "@/lib/order-totals";
import { newWizardSessionId } from "@/lib/storage";
import { previewDefaultGifts } from "../pos/free-line";
import { cartModeOf } from "../pos/rental-cart";
import {
  composeEmergency,
  type DraftPayment,
  type WizardDraft,
} from "./draft";
import PaymentSlipPicker from "./PaymentSlipPicker";
import SignaturePad from "./SignaturePad";

interface Props {
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
  catalog: CatalogResponse;
  /** 0224 (Loo 2026-07-15) — tapping the "Pay online" card should surface the
   *  QR immediately, not wait for the footer button. Fired AFTER the method is
   *  written to the draft; the parent auto-submits when the draft is ready
   *  (or explains what's still missing). */
  onStripeTap?: () => void;
}

/** Per-method copy for the approval-code field. Known builtin keys keep their
 *  specialized labels/hints (Loo 2026-05-10 reconciliation wording); any
 *  operator-created method falls back to the generic reference copy. */
const APPROVAL_COPY: Record<
  string,
  { label: string; hint: string; placeholder: string; maxLength: number }
> = {
  online: {
    label: "Bank reference number *",
    hint: "Transaction reference from the bank slip / DuitNow confirmation (e.g. FT2026... / DN-...). Finance uses this to reconcile against the bank statement.",
    placeholder: "e.g. FT2026050012345",
    maxLength: 32,
  },
  credit: {
    label: "Approval code *",
    hint: "Read the approval code from the EDC terminal slip after the card is charged.",
    placeholder: "e.g. 472019",
    maxLength: 12,
  },
  installment: {
    label: "Approval code *",
    hint: "Bank-issued installment approval code from the EDC slip.",
    placeholder: "e.g. 8821-INST",
    maxLength: 16,
  },
};
const APPROVAL_COPY_GENERIC = {
  label: "Reference code *",
  hint: "The receipt / approval reference finance reconciles this payment with.",
  placeholder: "e.g. REF-2026-001",
  maxLength: 32,
};

/** Per-method slip copy — same pattern (builtin keys specialized, generic
 *  fallback for operator-created methods incl. cash). */
const SLIP_COPY: Record<string, { label: string; hint: string }> = {
  online: {
    label: "Bank slip / receipt photo *",
    hint: "Bank transfer slip, e-receipt screenshot, or DuitNow confirmation",
  },
  credit: {
    label: "EDC slip / payment receipt *",
    hint: "Photo of the credit / debit card terminal slip",
  },
  installment: {
    label: "EDC slip / installment confirmation *",
    hint: "Photo of the installment approval slip from the bank",
  },
  cash: {
    label: "Cash receipt photo *",
    hint: "Photo of the signed cash receipt / payment voucher",
  },
};
const SLIP_COPY_GENERIC = {
  label: "Payment receipt photo *",
  hint: "Photo of the payment receipt or confirmation",
};

/**
 * Step 3 — Confirm + sign + record payment. Mirrors proto/new-order-step3.jsx
 * structurally (Customer / Order recap / Payment received / Payment method
 * / Signature / T&C) and now uses proto warm-linen status tokens for the
 * willProceed alerts, paid-pct hint, and T&C accept box.
 *
 * Submit lives in the parent footer. This component is purely presentational
 * + drives the draft mutations that step3Valid() reads.
 */
export default function Step3SignaturePayment({ draft, onChange, catalog, onStripeTap }: Props) {
  // Lazily mint a wizard session id the first time Step 3 mounts. Stays stable
  // across re-renders so the dealer can edit fields without resetting the
  // Storage folder each keystroke.
  useEffect(() => {
    if (!draft.wizardSessionId) {
      onChange({ ...draft, wizardSessionId: newWizardSessionId() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live totals — the shared draftTotals (single source of truth with the
  // OrderSummaryRail + the DealerPos footer, so the three can never drift).
  // The 0184 delivery portion runs the SAME pure engine the Hono recompute
  // uses; the server is authoritative at submit (NOT submitted from here —
  // DealerPos sends only additionalDeliveryFee + crossCategorySourceSo).
  // Dormant config (0/0) + no matching rule + no additional fee → 0 (hidden).
  const totals = useMemo(() => draftTotals(draft, catalog), [draft, catalog]);
  const { lineSub, addonSub, stair, deliveryTotal } = totals;
  const deliveryPreview = totals.delivery;

  // Default free gifts the server WILL append at submit — the same RM0 preview
  // rows the OrderSummaryRail shows, so the two panes list identical items.
  const giftRows = useMemo(() => previewDefaultGifts(draft.lines, catalog), [draft.lines, catalog]);

  const total = totals.grand;
  const minDeposit = useMemo(() => Math.round(total * 0.5), [total]);
  const paidPct = total > 0 ? Math.round((draft.paid / total) * 100) : 0;

  function setPay(patch: Partial<DraftPayment>) {
    onChange({ ...draft, payment: { ...draft.payment, ...patch } });
  }

  // ---------- Payment methods (0219 — config-driven) ----------
  // The list renders from order_entry_config (the Order Entry page edits it);
  // empty/absent config → code defaults = the historical trio + Cash.
  // 0224 — "Pay online (Stripe)" is appended as a first-class BUILT-IN (not
  // operator-editable): its proof is system-generated, so a config edit can
  // never break or hide it.
  const methods = useMemo(
    () => [...resolvePaymentMethods(catalog.orderEntryConfig), STRIPE_PAYMENT_METHOD],
    [catalog.orderEntryConfig],
  );
  const selectedMethod = methods.find((m) => m.key === draft.payment.method);
  const isStripe = draft.payment.method === STRIPE_METHOD_KEY;

  // ---------- Submit-eligibility helpers (proto parity) ----------
  const hasSlip = !!draft.payment.slip;
  const hasApproval = draft.payment.approvalCode.trim().length >= 3;
  const missingFollowUp = selectedMethod?.followUps.find(
    (fu) => fu.required && !(draft.payment.followUps?.[fu.key] ?? "").trim(),
  );
  // Stripe: no manual proof — the only requirement is an amount to collect
  // (mirrors step4Valid). Everything else keeps the 0219 config gates.
  const paymentMethodOk = isStripe
    ? draft.paid > 0
    : !!selectedMethod &&
      hasSlip &&
      (!selectedMethod.approvalCodeRequired || hasApproval) &&
      !missingFollowUp;
  // Stripe submits the order with paid 0 (money moves only when the customer
  // completes Checkout), so it can never auto-qualify for Proceed at submit.
  const willProceed =
    !isStripe &&
    paidPct >= 50 &&
    !draft.customer.addressUnknown &&
    !draft.delivery.dateTbd &&
    paymentMethodOk;

  function paymentBlockerLabel(): string | null {
    if (paymentMethodOk) return null;
    if (!selectedMethod) return "a payment method is picked";
    if (isStripe) return "the amount to collect is entered";
    const needApproval = selectedMethod.approvalCodeRequired && !hasApproval;
    if (needApproval && !hasSlip) return "approval / reference code & slip are added";
    if (needApproval) return "approval / reference code is entered";
    if (missingFollowUp) return `${missingFollowUp.label} is selected`;
    return "payment slip is attached";
  }

  return (
    <div className="flex flex-col gap-7">
      {/* ---------- Customer recap ---------- */}
      <Section title="Customer">
        <div className="rounded border border-base-200 bg-white p-4">
          <div className="font-display text-lg font-semibold leading-tight">
            {draft.customer.name || <em className="text-base-400">—</em>}
          </div>
          <div className="font-mono text-xs text-base-500 mt-0.5">
            {draft.customer.phone}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-3.5">
            <KV
              label="Delivery address"
              value={
                draft.customer.addressUnknown ? (
                  <em className="text-warning">Customer to provide later</em>
                ) : (
                  draft.customer.address
                )
              }
            />
            <KV
              label="Billing address"
              value={
                draft.customer.billingSame ? (
                  <em className="text-base-500">Same as delivery</em>
                ) : (
                  draft.customer.billing
                )
              }
            />
            {draft.customer.buildingType && (
              <KV label="Building type" value={draft.customer.buildingType} />
            )}
            <KV label="Emergency contact" value={composeEmergency(draft.customer)} />
            <KV
              label="Delivery date"
              value={
                draft.delivery.dateTbd ? (
                  <em className="text-warning">Confirm further notice</em>
                ) : (
                  draft.delivery.date
                )
              }
            />
          </div>
        </div>
      </Section>

      {/* ---------- Order recap ---------- */}
      <Section title="Order">
        <div className="rounded border border-base-200 bg-white overflow-hidden">
          {draft.lines.map((l, i) => (
            <div
              key={l.localId}
              className={`flex justify-between px-3.5 py-2.5 ${i ? "border-t border-base-100" : ""}`}
            >
              <span className="text-[13px]">
                {l.label} <span className="text-base-500">×{l.qty}</span>
              </span>
              <span className="font-mono text-[13px]">
                RM {(l.unitPrice * l.qty).toLocaleString()}
              </span>
            </div>
          ))}
          {giftRows.map((g) => (
            <div
              key={`gift-${g.sourceModelId}-${g.giftSku}`}
              className="flex justify-between px-3.5 py-2.5 border-t border-base-100"
              data-testid={`step3-gift-${g.giftSku}`}
            >
              <span className="text-[13px]">
                {g.name} <span className="text-base-500">×{g.qty} · GWP</span>
                {g.campaign && <span className="text-base-500"> · {g.campaign}</span>}
              </span>
              <span className="font-mono text-[13px] text-success">FREE</span>
            </div>
          ))}
          {draft.addons.map((a) => (
            <div
              key={a.key}
              className="flex justify-between px-3.5 py-2.5 border-t border-base-100 text-base-600"
            >
              <span className="text-[13px]">
                + {a.name}
                {a.qty > 1 && <span className="text-base-500"> ×{a.qty}</span>}
              </span>
              <span className="font-mono text-[13px]">
                RM {(a.unitPrice * a.qty).toLocaleString()}
              </span>
            </div>
          ))}
          {stair > 0 && (
            <div className="flex justify-between px-3.5 py-2.5 border-t border-base-100 text-base-600">
              <span className="text-[13px]">
                + Stair carry · floor {draft.delivery.floor}
                {draft.delivery.hasLift ? " (with lift)" : ""}
              </span>
              <span className="font-mono text-[13px]">RM {stair.toLocaleString()}</span>
            </div>
          )}
          {deliveryPreview && deliveryPreview.base > 0 && (
            <div className="flex justify-between px-3.5 py-2.5 border-t border-base-100 text-base-600">
              <span className="text-[13px]">
                + {deliveryPreview.isFollowup
                  ? "Cross-category follow-up delivery"
                  : deliveryPreview.isSpecial
                    ? "Special delivery fee"
                    : "Delivery fee"}
              </span>
              <span className="font-mono text-[13px]">RM {deliveryPreview.base.toLocaleString()}</span>
            </div>
          )}
          {deliveryPreview && deliveryPreview.crossCategory > 0 && (
            <div className="flex justify-between px-3.5 py-2.5 border-t border-base-100 text-base-600">
              <span className="text-[13px]">+ Cross-category delivery</span>
              <span className="font-mono text-[13px]">RM {deliveryPreview.crossCategory.toLocaleString()}</span>
            </div>
          )}
          {deliveryPreview && deliveryPreview.additional > 0 && (
            <div className="flex justify-between px-3.5 py-2.5 border-t border-base-100 text-base-600">
              <span className="text-[13px]">+ Additional delivery fee</span>
              <span className="font-mono text-[13px]">RM {deliveryPreview.additional.toLocaleString()}</span>
            </div>
          )}
          <div className="px-3.5 py-3 border-t border-base-200 bg-base-50 text-xs">
            <Row label="Subtotal" value={`RM ${lineSub.toLocaleString()}`} />
            {addonSub > 0 && <Row label="Add-ons" value={`RM ${addonSub.toLocaleString()}`} />}
            {stair > 0 && <Row label="Stair carry" value={`RM ${stair.toLocaleString()}`} />}
            {deliveryTotal > 0 && <Row label="Delivery fee" value={`RM ${deliveryTotal.toLocaleString()}`} />}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-base-200">
              <span className="text-sm font-semibold text-base-700">Total</span>
              <span className="pos-price" style={{ fontSize: "36px", lineHeight: 1 }}>
                <span className="pos-price-rm">RM</span>
                {total.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </Section>

      {/* ---------- Delivery fee (0184) ---------- */}
      <Section title="Delivery fee" hint="Server-priced — these two are operator inputs">
        <div className="rounded border border-base-200 bg-white p-4 flex flex-col gap-3.5">
          <FieldLabel label="Additional delivery fee (optional)">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[13px] text-base-500">RM</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={draft.additionalDeliveryFee || ""}
                placeholder="0.00"
                onChange={(e) =>
                  onChange({
                    ...draft,
                    additionalDeliveryFee: Math.max(0, parseFloat(e.target.value) || 0),
                  })
                }
                className="flex-1 px-3 py-2.5 border-[1.5px] border-base-200 rounded-xl font-mono text-sm bg-white outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-colors"
                aria-label="Additional delivery fee"
                data-testid="step3-additional-delivery-fee"
              />
            </div>
            <div className="text-[11px] text-base-500 mt-1.5">
              A free-form fee agreed at handover (e.g. remote area). Added on top of the
              base trip fee.
            </div>
          </FieldLabel>
          <FieldLabel label="Previous SO — cross-category link (optional)">
            <input
              type="text"
              value={draft.crossCategorySourceSo ?? ""}
              placeholder="e.g. SO-1042"
              onChange={(e) => onChange({ ...draft, crossCategorySourceSo: e.target.value })}
              className="w-full px-3 py-2.5 border-[1.5px] border-base-200 rounded-xl font-mono text-sm bg-white outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-colors"
              aria-label="Previous SO cross-category link"
              data-testid="step3-cross-category-so"
            />
            <div className="text-[11px] text-base-500 mt-1.5">
              If this order delivers as a follow-up to the customer's earlier SO (the base
              fee was already paid there), enter that SO so only the reduced cross-category
              rate applies. The server validates it before booking.
            </div>
          </FieldLabel>
        </div>
      </Section>

      {/* ---------- Payment received ---------- */}
      <Section title="Payment received" hint="50% required to move to Proceed Order">
        <div className="grid grid-cols-3 gap-2 mb-3">
          {(
            [
              { pct: 50, label: "50%", sub: `RM ${minDeposit.toLocaleString()}` },
              { pct: 100, label: "Full", sub: `RM ${total.toLocaleString()}` },
              { pct: null, label: "Custom", sub: "Type below" },
            ] as const
          ).map((p) => {
            const active =
              p.pct === 50
                ? draft.paid === minDeposit
                : p.pct === 100
                  ? draft.paid === total
                  : draft.paid !== minDeposit && draft.paid !== total && draft.paid > 0;
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (p.pct === 50) onChange({ ...draft, paid: minDeposit });
                  else if (p.pct === 100) onChange({ ...draft, paid: total });
                }}
                className={`pos-pay-card text-center${active ? " pos-selected" : ""}`}
              >
                <div className="text-[13px] font-semibold">{p.label}</div>
                <div className="font-mono text-[11px] text-base-500 mt-0.5">{p.sub}</div>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[13px] text-base-500">RM</span>
          <input
            type="number"
            value={draft.paid || ""}
            placeholder="Amount received"
            min={0}
            max={total}
            onChange={(e) =>
              onChange({
                ...draft,
                paid: Math.min(total, Math.max(0, parseFloat(e.target.value) || 0)),
              })
            }
            className="flex-1 px-3 py-2.5 border-[1.5px] border-base-200 rounded-xl font-mono text-sm bg-white outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-colors"
            aria-label="Amount received"
          />
          <span
            className={`text-xs font-body ${paidPct >= 50 ? "text-success" : "text-warning"}`}
          >
            {paidPct}% of total
          </span>
        </div>
        {draft.paid > 0 && isStripe && (
          <div className="mt-2.5 px-3 py-2.5 rounded text-xs leading-relaxed text-base-800 border border-success bg-success-soft">
            ✓ After you complete the order, a <strong>QR / payment link</strong> for RM{" "}
            {draft.paid.toLocaleString()} opens — the customer pays there and the payment
            records itself.{" "}
            {/* A RENTAL leaves Place when FINANCE APPROVES it, not when money
                lands (0275 replaced the deposit gate with the credit-approval
                gate). Telling an operator to watch for the payment sends them
                watching the wrong thing — nobody would think to chase finance. */}
            {cartModeOf(draft.lines) === "rental" ? (
              <>
                The order sits in <strong>Place</strong> until finance approves the rental.
              </>
            ) : (
              <>
                The order sits in <strong>Place</strong> until the payment lands.
              </>
            )}
          </div>
        )}
        {draft.paid > 0 && !isStripe && (
          <div
            className={`mt-2.5 px-3 py-2.5 rounded text-xs leading-relaxed text-base-800 border ${
              willProceed
                ? "border-success bg-success-soft"
                : "border-warning bg-warning-soft"
            }`}
          >
            {willProceed ? (
              <>
                ✓ Payment ≥ 50% and all info complete — this order will be eligible for{" "}
                <strong>Proceed</strong> immediately after submit.
              </>
            ) : (
              <>
                ⚠ Order will sit in <strong>Place</strong> until{" "}
                {[
                  paidPct < 50 && `payment reaches 50% (now ${paidPct}%)`,
                  paymentBlockerLabel(),
                  draft.customer.addressUnknown && "delivery address is provided",
                  draft.delivery.dateTbd && "delivery date is confirmed",
                ]
                  .filter(Boolean)
                  .join(", ")}
                .
              </>
            )}
          </div>
        )}
      </Section>

      {/* ---------- Payment method (0219 — config-driven) ---------- */}
      <Section title="Payment method" hint="How the customer is paying">
        <div
          className="grid gap-2 mb-3"
          style={{
            gridTemplateColumns: `repeat(${Math.min(Math.max(methods.length, 1), 4)}, minmax(0, 1fr))`,
          }}
        >
          {methods.map((m) => {
            const active = draft.payment.method === m.key;
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  // Switching methods clears the follow-up answers — a bank
                  // picked for credit must not silently ride along to cash.
                  setPay({ method: m.key, followUps: {} });
                  // Stripe: the tap itself should pop the QR (Loo 2026-07-15).
                  if (m.key === STRIPE_METHOD_KEY) onStripeTap?.();
                }}
                className={`pos-pay-card text-center${active ? " pos-selected" : ""}`}
                data-testid={`pay-method-${m.key}`}
              >
                <div className="text-[13px] font-semibold">{m.label}</div>
                <div className="text-[11px] text-base-500 mt-0.5">{m.sublabel}</div>
              </button>
            );
          })}
        </div>

        {/* 0224 — Stripe: no manual proof fields. The reference (PaymentIntent
            id) + receipt (Stripe hosted receipt) are captured automatically
            when the payment lands, so finance reconciles without a slip. */}
        {isStripe && (
          <div
            className="rounded border border-base-200 bg-white p-4 text-xs leading-relaxed text-base-700"
            data-testid="pay-stripe-info"
          >
            <div className="text-sm font-semibold text-base-900 mb-1">
              No slip or reference code needed
            </div>
            The customer pays by FPX / card on Stripe&rsquo;s secure page (QR at the counter, or
            a WhatsApp link). The payment records itself with a <strong>payment code</strong> and
            an official <strong>Stripe receipt</strong> attached for finance — nothing to key in
            or photograph.
          </div>
        )}

        {selectedMethod && !isStripe && (
          <div className="flex flex-col gap-3.5">
            {/* Installment keeps its months picker (builtin behavior). */}
            {selectedMethod.key === "installment" && (
              <FieldLabel label="Installment plan *">
                <div className="grid grid-cols-2 gap-2">
                  {([6, 12] as const).map((m) => {
                    const active = draft.payment.installmentMonths === m;
                    const monthly = total > 0 ? total / m : 0;
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setPay({ installmentMonths: m })}
                        className={`pos-pay-card text-center${active ? " pos-selected" : ""}`}
                      >
                        <div className="text-[13px] font-semibold">{m} months</div>
                        <div className="font-mono text-[11px] text-base-500 mt-0.5">
                          ≈ RM {Math.round(monthly).toLocaleString()} / mo
                        </div>
                      </button>
                    );
                  })}
                </div>
              </FieldLabel>
            )}

            {/* Follow-up dropdowns (e.g. Bank for Credit/Debit) — from config. */}
            {selectedMethod.followUps.map((fu) => (
              <FieldLabel key={fu.key} label={`${fu.label}${fu.required ? " *" : ""}`}>
                <select
                  value={draft.payment.followUps?.[fu.key] ?? ""}
                  onChange={(e) =>
                    setPay({
                      followUps: {
                        ...(draft.payment.followUps ?? {}),
                        [fu.key]: e.target.value,
                      },
                    })
                  }
                  className="w-full px-3 py-2.5 border-[1.5px] border-base-200 rounded-xl text-sm bg-white outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-colors"
                  data-testid={`pay-followup-${fu.key}`}
                >
                  <option value="">— select {fu.label.toLowerCase()} —</option>
                  {fu.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </FieldLabel>
            ))}

            {/* Approval / reference code — per the method's config flag. */}
            {selectedMethod.approvalCodeRequired &&
              (() => {
                const copy = APPROVAL_COPY[selectedMethod.key] ?? APPROVAL_COPY_GENERIC;
                return (
                  <ApprovalCodeField
                    label={copy.label}
                    value={draft.payment.approvalCode}
                    onChange={(v) =>
                      setPay({ approvalCode: v.replace(/[^0-9A-Za-z-]/g, "").toUpperCase() })
                    }
                    maxLength={copy.maxLength}
                    hint={copy.hint}
                    placeholder={copy.placeholder}
                  />
                );
              })()}

            {/* Slip / receipt photo — required for every method. */}
            {(() => {
              const copy = SLIP_COPY[selectedMethod.key] ?? SLIP_COPY_GENERIC;
              return (
                <PaymentSlipPicker
                  label={copy.label}
                  hint={copy.hint}
                  slip={draft.payment.slip}
                  onChange={(slip) => setPay({ slip })}
                />
              );
            })()}
          </div>
        )}
      </Section>

      {/* ---------- Signature ---------- */}
      <Section title="Customer signature *" hint="Customer signs with finger or stylus">
        <SignaturePad
          value={draft.signature}
          onChange={(sig) => onChange({ ...draft, signature: sig })}
        />
      </Section>

      {/* ---------- T&C ---------- */}
      {/* 2026-05-22 (Loo) — wording mirrors `sales-order-template.tsx` so the
          customer reads the same 5 clauses on-screen (here) and on the printed
          PDF they sign. Any future edit must touch both files together. */}
      <Section title="Terms & conditions">
        <div className="rounded border border-base-200 bg-white p-3.5 text-[11px] leading-relaxed text-base-700 max-h-[140px] overflow-auto">
          <p className="text-base-900 font-semibold mb-1.5">Carres Group Sdn Bhd · Order Terms</p>
          <p>
            {/* THE OWNER-CORRECTED WORDING (2026-08-09), law in
                docs/pdf/SO-PDF-STANDARD.md §T&C. Card 3.0-FIX applied it to the
                PDF and MISSED THIS SCREEN, so the customer was signing "becomes
                a binding tax invoice" while receiving "the sales invoice is a
                separate document". The comment above this Section predicted
                exactly that — "any future edit must touch both files together" —
                and prose cannot enforce it, so sales-order-terms.test.tsx now
                does. */}
            1. This sales order records your purchase agreement with Carres. The sales invoice is a
            separate document issued upon delivery.
          </p>
          <p>
            2. Balance due is payable in full on or before delivery. Cash, bank transfer, DuitNow
            QR, and cheque accepted.
          </p>
          <p>
            3. Delivery date is best-effort and may shift ±3 working days subject to operation
            confirmation.
          </p>
          <p>
            4. Stair-carry surcharges (if any) are billed on this sales order and are not invoiced
            separately on the DO.
          </p>
          <p>
            5. Once the delivery date has been confirmed, any subsequent request to change or
            extend the date will incur a rescheduling surcharge.
          </p>
        </div>
        <label
          className={`mt-2.5 flex items-start gap-2.5 px-3.5 py-3 border rounded cursor-pointer ${
            draft.termsAccepted
              ? "border-success bg-success-soft"
              : "border-base-300 bg-white"
          }`}
        >
          <input
            type="checkbox"
            checked={draft.termsAccepted}
            onChange={(e) => onChange({ ...draft, termsAccepted: e.target.checked })}
            className="mt-0.5 w-4 h-4"
            aria-label="Customer accepts all terms and conditions"
          />
          <div>
            <div className="text-sm font-semibold">
              Customer accepts all terms and conditions
            </div>
            <div className="text-[11px] text-base-600 mt-0.5">
              By ticking, the customer confirms they have read and agreed to the above.
            </div>
          </div>
        </label>
      </Section>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

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

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1" style={{ letterSpacing: "0.16em", fontSize: "10px" }}>
        {label}
      </div>
      <div className="text-[13px] text-base-800">
        {value || <em className="text-base-400">—</em>}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-base-600">
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function ApprovalCodeField({
  label,
  value,
  onChange,
  hint,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint: string;
  maxLength: number;
  placeholder: string;
}) {
  return (
    <FieldLabel label={label}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border-[1.5px] border-base-200 rounded-xl font-mono text-sm tracking-wider bg-white outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-colors"
      />
      <div className="text-[11px] text-base-500 mt-1.5">{hint}</div>
    </FieldLabel>
  );
}
