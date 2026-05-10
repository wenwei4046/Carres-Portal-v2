import { useEffect, useMemo } from "react";
import type { CatalogResponse } from "@carres/shared";
import { floorSurchargeRaw } from "@/lib/order-totals";
import { newWizardSessionId } from "@/lib/storage";
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
}

const PAYMENT_METHODS: ReadonlyArray<{
  id: DraftPayment["method"];
  label: string;
  sub: string;
}> = [
  { id: "online", label: "Online transfer", sub: "FPX / DuitNow" },
  { id: "credit", label: "Credit / Debit", sub: "Full payment" },
  { id: "installment", label: "Installment", sub: "6 / 12 months" },
];

/**
 * Step 3 — Confirm + sign + record payment. Mirrors proto/new-order-step3.jsx
 * structurally (Customer / Order recap / Payment received / Payment method
 * / Signature / T&C) and now uses proto warm-linen status tokens for the
 * willProceed alerts, paid-pct hint, and T&C accept box.
 *
 * Submit lives in the parent footer. This component is purely presentational
 * + drives the draft mutations that step3Valid() reads.
 */
export default function Step3SignaturePayment({ draft, onChange, catalog }: Props) {
  const cfg = catalog.floorConfig;

  // Lazily mint a wizard session id the first time Step 3 mounts. Stays stable
  // across re-renders so the dealer can edit fields without resetting the
  // Storage folder each keystroke.
  useEffect(() => {
    if (!draft.wizardSessionId) {
      onChange({ ...draft, wizardSessionId: newWizardSessionId() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live totals — same formula as Step 2 (single source of truth via
  // floorSurchargeRaw). Recomputed each render; no dependency on memo since
  // input arrays are tiny.
  const lineSub = draft.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const addonSub = draft.addons.reduce((s, a) => s + a.unitPrice * a.qty, 0);
  const itemsTotal = draft.lines.reduce((s, l) => s + l.qty, 0);
  const stair = floorSurchargeRaw(draft.delivery.floor, draft.delivery.hasLift, itemsTotal, cfg);
  const total = lineSub + addonSub + stair;
  const minDeposit = useMemo(() => Math.round(total * 0.5), [total]);
  const paidPct = total > 0 ? Math.round((draft.paid / total) * 100) : 0;

  function setPay(patch: Partial<DraftPayment>) {
    onChange({ ...draft, payment: { ...draft.payment, ...patch } });
  }

  // ---------- Submit-eligibility helpers (proto parity) ----------
  const hasSlip = !!draft.payment.slip;
  const hasApproval = draft.payment.approvalCode.trim().length >= 3;
  // 2026-05-10 (Loo) — approval / reference code now required for every
  // payment method (online used to skip this; finance couldn't reconcile).
  const paymentMethodOk =
    draft.payment.method === "online"
      ? hasApproval && hasSlip
      : draft.payment.method === "credit"
        ? hasApproval && hasSlip
        : draft.payment.method === "installment"
          ? hasApproval && hasSlip
          : false;
  const willProceed =
    paidPct >= 50 &&
    !draft.customer.addressUnknown &&
    !draft.delivery.dateTbd &&
    paymentMethodOk;

  function paymentBlockerLabel(): string | null {
    if (paymentMethodOk) return null;
    // 2026-05-10 (Loo) — online now also requires the bank reference code
    // for finance reconciliation; same blocker hierarchy as the other
    // methods (both → both, missing one → name it).
    if (!hasApproval && !hasSlip) return "approval / reference code & slip are added";
    if (!hasApproval) return "approval / reference code is entered";
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
          <div className="px-3.5 py-3 border-t border-base-200 bg-base-50 text-xs">
            <Row label="Subtotal" value={`RM ${lineSub.toLocaleString()}`} />
            {addonSub > 0 && <Row label="Add-ons" value={`RM ${addonSub.toLocaleString()}`} />}
            {stair > 0 && <Row label="Stair carry" value={`RM ${stair.toLocaleString()}`} />}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-base-200">
              <span className="text-sm font-semibold">Total</span>
              <span className="font-mono text-base font-bold">RM {total.toLocaleString()}</span>
            </div>
          </div>
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
                onClick={() => {
                  if (p.pct === 50) onChange({ ...draft, paid: minDeposit });
                  else if (p.pct === 100) onChange({ ...draft, paid: total });
                }}
                className={`px-3 py-3 rounded border-[1.5px] text-center ${
                  active ? "border-primary bg-signature-50" : "border-base-200 bg-white"
                }`}
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
            className="flex-1 px-3 py-2.5 border border-base-300 rounded font-mono text-sm bg-white outline-none focus:border-primary"
            aria-label="Amount received"
          />
          <span
            className={`text-xs font-body ${paidPct >= 50 ? "text-success" : "text-warning"}`}
          >
            {paidPct}% of total
          </span>
        </div>
        {draft.paid > 0 && (
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

      {/* ---------- Payment method ---------- */}
      <Section title="Payment method" hint="How the customer is paying">
        <div className="grid grid-cols-3 gap-2 mb-3">
          {PAYMENT_METHODS.map((m) => {
            const active = draft.payment.method === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setPay({ method: m.id })}
                className={`px-3 py-3 rounded border-[1.5px] text-center ${
                  active ? "border-primary bg-signature-50" : "border-base-200 bg-white"
                }`}
              >
                <div className="text-[13px] font-semibold">{m.label}</div>
                <div className="text-[11px] text-base-500 mt-0.5">{m.sub}</div>
              </button>
            );
          })}
        </div>

        {draft.payment.method === "online" && (
          <div className="flex flex-col gap-3.5">
            {/* 2026-05-10 (Loo) — bank reference / FT number is required so
                finance can match the deposit on the bank statement. Was
                previously hidden for online and the slip alone wasn't
                enough — orders sat unprocessed until someone manually
                chased the dealer for the reference. */}
            <ApprovalCodeField
              label="Bank reference number *"
              value={draft.payment.approvalCode}
              onChange={(v) =>
                setPay({ approvalCode: v.replace(/[^0-9A-Za-z-]/g, "").toUpperCase() })
              }
              maxLength={32}
              hint="Transaction reference from the bank slip / DuitNow confirmation (e.g. FT2026... / DN-...). Finance uses this to reconcile against the bank statement."
              placeholder="e.g. FT2026050012345"
            />
            <PaymentSlipPicker
              label="Bank slip / receipt photo *"
              hint="Bank transfer slip, e-receipt screenshot, or DuitNow confirmation"
              slip={draft.payment.slip}
              onChange={(slip) => setPay({ slip })}
            />
          </div>
        )}

        {draft.payment.method === "credit" && (
          <div className="flex flex-col gap-3.5">
            <ApprovalCodeField
              label="Approval code *"
              value={draft.payment.approvalCode}
              onChange={(v) => setPay({ approvalCode: v.replace(/[^0-9A-Za-z]/g, "").toUpperCase() })}
              maxLength={12}
              hint="Read the approval code from the EDC terminal slip after the card is charged."
              placeholder="e.g. 472019"
            />
            <PaymentSlipPicker
              label="EDC slip / payment receipt *"
              hint="Photo of the credit / debit card terminal slip"
              slip={draft.payment.slip}
              onChange={(slip) => setPay({ slip })}
            />
          </div>
        )}

        {draft.payment.method === "installment" && (
          <div className="flex flex-col gap-3.5">
            <FieldLabel label="Installment plan *">
              <div className="grid grid-cols-2 gap-2">
                {([6, 12] as const).map((m) => {
                  const active = draft.payment.installmentMonths === m;
                  const monthly = total > 0 ? total / m : 0;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPay({ installmentMonths: m })}
                      className={`px-3 py-3 rounded border-[1.5px] text-center ${
                        active ? "border-primary bg-signature-50" : "border-base-200 bg-white"
                      }`}
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
            <ApprovalCodeField
              label="Approval code *"
              value={draft.payment.approvalCode}
              onChange={(v) =>
                setPay({ approvalCode: v.replace(/[^0-9A-Za-z-]/g, "").toUpperCase() })
              }
              maxLength={16}
              hint="Bank-issued installment approval code from the EDC slip."
              placeholder="e.g. 8821-INST"
            />
            <PaymentSlipPicker
              label="EDC slip / installment confirmation *"
              hint="Photo of the installment approval slip from the bank"
              slip={draft.payment.slip}
              onChange={(slip) => setPay({ slip })}
            />
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
      <Section title="Terms & conditions">
        <div className="rounded border border-base-200 bg-white p-3.5 text-[11px] leading-relaxed text-base-700 max-h-[140px] overflow-auto">
          <p className="text-base-900 font-semibold mb-1.5">Carres Group Sdn Bhd · Order Terms</p>
          <p>
            1. All orders are subject to stock availability. 50% deposit confirms reservation.
          </p>
          <p>
            2. Final payment is due before delivery. Goods remain property of Carres until full
            payment is received.
          </p>
          <p>
            3. Delivery dates are estimates. Stair carry surcharges apply from{" "}
            {cfg.freeUpToFloor + 1}F onward at RM {cfg.perFloorPerItem} per item per floor (no
            charge if lift available).
          </p>
          <p>
            4. Returns accepted within 7 days, original packaging only. Custom orders are
            non-refundable.
          </p>
          <p>
            5. Customer warrants all information provided is accurate and consents to delivery
            contact via the emergency contact above.
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
        <h3 className="font-display text-base font-semibold tracking-[-0.01em]">{title}</h3>
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
        className="w-full px-3 py-2.5 border border-base-300 rounded font-mono text-sm tracking-wider bg-white outline-none focus:border-primary"
      />
      <div className="text-[11px] text-base-500 mt-1.5">{hint}</div>
    </FieldLabel>
  );
}
