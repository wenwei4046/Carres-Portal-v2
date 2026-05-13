import { useEffect, useMemo, useState } from "react";
import type { CreateOrderInput, Order } from "@carres/shared";
import { composeAddress } from "@/data/malaysia-postcodes";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  useCatalog,
  useCreateOrder,
  useOutlets,
  useProceedOrder,
  useSalespersons,
} from "@/lib/queries";
import { extensionForMime, uploadDataUrl } from "@/lib/storage";
import {
  type WizardDraft,
  clearDraft,
  composeEmergency,
  emptyDraft,
  loadDraft,
  saveDraft,
  step1FirstIssue,
  step1Valid,
  step2Valid,
  step3Valid,
} from "./draft";
import Step1Customer from "./Step1Customer";
import Step2Products from "./Step2Products";
import Step3SignaturePayment from "./Step3SignaturePayment";
import ThankYou from "./ThankYou";

interface Props {
  /** Modal is mounted globally; this prop drives visibility from `?new=1`. */
  open: boolean;
  /** Strips `?new=1` from URL. Modal decides whether to clear the draft based on
   *  which close path the user took (soft via X/backdrop/ESC, hard via Cancel). */
  onClose: () => void;
}

const STEP_LABELS: Record<number, string> = {
  1: "Customer & delivery",
  2: "Products & add-ons",
  3: "Confirm and sign",
};

/**
 * Wizard shell — modal renders 3-step stepper + Step 1 form. Steps 2 + 3 are
 * placeholders until 2B.3 ships product picker + signature + create RPC.
 *
 * sessionStorage draft persistence (D4): typing in any field auto-saves the
 * full draft; refresh / accidental close / sidebar nav restores on next open.
 * Cancel and X explicitly discard via `clearDraft()`.
 */
export default function DealerNewOrder({ open, onClose }: Props) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<WizardDraft>(() => loadDraft() ?? emptyDraft());
  // After a successful Submit we hold the freshly minted Order so the modal
  // can render the ThankYou screen instead of Step 3. Reset on close / new.
  const [submitted, setSubmitted] = useState<Order | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const dealerId = useAuth((s) => s.dealerId);
  const createOrder = useCreateOrder();
  const proceedOrder = useProceedOrder();

  const outletsQ = useOutlets({ enabled: open });
  const salespersonsQ = useSalespersons(undefined, { enabled: open });
  // Catalog needed for Step 2; only fetched when wizard is open. D5 rationale:
  // staleTime is 5min globally, but we explicitly refetch on Step 2 entry so
  // the dealer's locked unit_price is always fresh against principal updates.
  const catalogQ = useCatalog({ enabled: open });
  useEffect(() => {
    if (open && step === 2) catalogQ.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  // Restore draft each time the modal re-opens. If the dealer closed via X /
  // Cancel previously, sessionStorage was cleared and we get a fresh draft.
  useEffect(() => {
    if (open) {
      setDraft(loadDraft() ?? emptyDraft());
      setStep(1);
      setSubmitted(null);
      setSubmitError(null);
    }
  }, [open]);

  // Auto-save on every change. Only when modal is open — closed-state writes
  // would clobber the cleared-on-close invariant.
  useEffect(() => {
    if (!open) return;
    if (submitted) return; // Don't re-persist post-submit; draft has been cleared.
    saveDraft(draft);
  }, [open, draft, submitted]);

  // ESC = soft close (preserves draft). Only the footer Cancel button discards.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") softClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Soft close — backdrop click, X header button, ESC. Draft stays in
   *  sessionStorage so reopening the wizard restores everything. */
  function softClose() {
    onClose();
  }

  /** Hard close — explicit Cancel footer button. Discards the draft. */
  function cancelAndClose() {
    clearDraft();
    onClose();
  }

  const canStep1 = useMemo(() => step1Valid(draft), [draft]);
  const canStep2 = useMemo(() => step2Valid(draft), [draft]);
  // 2026-05-10 (Loo) — when ASAP is on, the 50% deposit threshold is a HARD
  // submit gate (the wizard auto-fires Proceed after create — Proceed
  // requires ≥50% so we reject the order at submit time rather than create
  // it then have auto-proceed bounce). For non-ASAP orders the threshold
  // stays advisory (per Phase 2C: 50% is a Place→Proceed gate, not a
  // create gate — dealer can still create + collect later).
  const asapDepositOk = useMemo(() => {
    if (!draft.delivery.asap) return true;
    const lineSub = draft.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    const addonSub = draft.addons.reduce((s, a) => s + a.unitPrice * a.qty, 0);
    const totalForPct = lineSub + addonSub;
    if (totalForPct <= 0) return false;
    return (draft.paid / totalForPct) * 100 >= 50;
  }, [draft]);
  const canStep3 = useMemo(
    () => step3Valid(draft) && asapDepositOk,
    [draft, asapDepositOk],
  );
  const canAdvance = step === 1 ? canStep1 : step === 2 ? canStep2 : canStep3;
  const submitDisabled =
    !canStep3 || uploading || createOrder.isPending || !dealerId;

  // Footer total — shown from Step 2 onward to mirror proto. We exclude
  // stair carry from the visible Total to match proto's `monthValue` definition
  // and the Step 3 deposit-pct math (line + addon only).
  const footerTotal = useMemo(() => {
    if (!catalogQ.data) return 0;
    const lineSub = draft.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    const addonSub = draft.addons.reduce((s, a) => s + a.unitPrice * a.qty, 0);
    const itemsTotal = draft.lines.reduce((s, l) => s + l.qty, 0);
    const stair = catalogQ.data
      ? draft.delivery.hasLift
        ? 0
        : Math.max(0, draft.delivery.floor - catalogQ.data.floorConfig.freeUpToFloor) *
          catalogQ.data.floorConfig.perFloorPerItem *
          itemsTotal
      : 0;
    return lineSub + addonSub + stair;
  }, [draft, catalogQ.data]);

  /**
   * Submit pipeline:
   *   1. Upload signature dataURL → orders-attachments/{dealerId}/{wizardSessionId}/signature.png
   *   2. Upload payment slip dataURL (if present) → same folder, ext from MIME
   *   3. POST /api/orders with the two paths
   *   4. On success → clearDraft() + setSubmitted(order) → ThankYou renders
   *   5. On any error → keep draft intact + surface message in the footer
   */
  async function handleSubmit() {
    if (!canStep3 || !dealerId || !draft.wizardSessionId) return;
    setSubmitError(null);
    try {
      setUploading(true);
      const signaturePath = await uploadDataUrl({
        dealerId,
        wizardSessionId: draft.wizardSessionId,
        filename: "signature.png",
        dataUrl: draft.signature!,
      });
      let paymentSlipPath: string | null = null;
      if (draft.payment.slip) {
        paymentSlipPath = await uploadDataUrl({
          dealerId,
          wizardSessionId: draft.wizardSessionId,
          filename: `payment-slip.${extensionForMime(draft.payment.slip.mime)}`,
          dataUrl: draft.payment.slip.dataUrl,
        });
      }
      setUploading(false);

      const lineSub = draft.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
      const addonSub = draft.addons.reduce((s, a) => s + a.unitPrice * a.qty, 0);
      const totalForPct = lineSub + addonSub; // Stair excluded — matches preview math.
      const depositPct =
        totalForPct > 0 ? Math.round((draft.paid / totalForPct) * 100) : 0;

      const composedAddress = composeAddress({
        line1: draft.customer.addressLine1,
        state: draft.customer.addressState,
        city: draft.customer.addressCity,
        postcode: draft.customer.addressPostcode,
      });
      const input: CreateOrderInput = {
        outletId: draft.outletId!,
        salespersonId: draft.salespersonId!,
        customer: {
          name: draft.customer.name,
          phone: draft.customer.phone,
          address: draft.customer.addressUnknown ? null : composedAddress,
          addressUnknown: draft.customer.addressUnknown,
          billing: draft.customer.billingSame ? null : draft.customer.billing,
          billingSame: draft.customer.billingSame,
          emergency: composeEmergency(draft.customer),
        },
        delivery: {
          date: draft.delivery.dateTbd ? null : draft.delivery.date,
          dateTbd: draft.delivery.dateTbd,
          floor: draft.delivery.floor,
          hasLift: draft.delivery.hasLift,
          stairItems: draft.delivery.stairItems,
        },
        lines: draft.lines.map((l) => ({
          sku: l.sku,
          qty: l.qty,
          attrs: l.attrs,
          unitPrice: l.unitPrice,
        })),
        addons: draft.addons.map((a) => ({
          addonKey: a.key,
          qty: a.qty,
          unitPrice: a.unitPrice,
        })),
        paid: draft.paid,
        signaturePath,
        paymentSlipPath,
        termsAccepted: true,
        depositPct: Math.min(100, Math.max(0, depositPct)),
        paymentMethod: draft.payment.method,
        approvalCode:
          draft.payment.method === "online"
            ? null
            : draft.payment.approvalCode.trim() || null,
        installmentMonths:
          draft.payment.method === "installment" ? draft.payment.installmentMonths : null,
      };

      const created = await createOrder.mutateAsync(input);
      clearDraft();
      setSubmitted(created);

      // 2026-05-10 (Loo) — "As Fast As Possible" auto-proceed. After
      // create succeeds, if the dealer ticked ASAP on Step 1 (delivery
      // date pill), fire the Proceed mutation so the order skips the
      // manual Place→Proceed click. Failures (e.g. insufficient deposit
      // / blocked rule) surface as a toast — order stays in 'place' for
      // the dealer to top up + manually proceed later.
      if (draft.delivery.asap) {
        try {
          await proceedOrder.mutateAsync(created.id);
          toast.success(`Order DL-${created.dl} auto-proceeded · ASAP`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Auto-proceed failed";
          toast.warning(`Order created, but auto-proceed failed: ${msg}`);
        }
      }
    } catch (err) {
      setUploading(false);
      const msg = err instanceof Error ? err.message : "Submit failed";
      setSubmitError(msg);
    }
  }

  function startAnotherOrder() {
    setSubmitted(null);
    setSubmitError(null);
    setDraft(emptyDraft());
    setStep(1);
  }

  if (!open) return null;

  return (
    <div
      onClick={softClose}
      className="fixed inset-0 bg-base-900/55 grid place-items-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="New order"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[880px] max-h-[90vh] flex flex-col bg-card text-card-foreground rounded-md shadow-md border border-base-900/10"
      >
        {/* Header */}
        <header className="px-7 pt-5 pb-3.5 border-b border-base-100 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {submitted ? (
              <>
                <p className="kicker text-success">
                  Order placed
                </p>
                <h2 className="font-display text-[22px] mt-0.5 tracking-[-0.02em] leading-[1.2] font-semibold">
                  Thank you
                </h2>
              </>
            ) : (
              <>
                <p className="kicker">
                  New order · step {step} of 3
                </p>
                <h2 className="font-display text-[22px] mt-0.5 tracking-[-0.02em] leading-[1.2] font-semibold">
                  {STEP_LABELS[step]}
                </h2>
              </>
            )}
          </div>
          <button
            onClick={softClose}
            aria-label="Close"
            title={submitted ? "Close" : "Close — your draft will be saved"}
            className="btn-ghost text-xl leading-none px-2 py-1"
          >
            ×
          </button>
        </header>

        {/* Stepper — hidden on the ThankYou screen */}
        {!submitted && (
          <div className="flex px-7 pt-3.5 pb-1 gap-1.5">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={`flex-1 h-[3px] rounded-sm ${n <= step ? "bg-primary" : "bg-base-200"}`}
              />
            ))}
          </div>
        )}

        {/* Body — scrollable */}
        <div className={submitted ? "overflow-auto flex-1" : "p-7 overflow-auto flex-1"}>
          {submitted && (
            <ThankYou
              order={submitted}
              onNewOrder={startAnotherOrder}
              onClose={cancelAndClose}
            />
          )}
          {!submitted && step === 1 && (
            <>
              {(outletsQ.isPending || salespersonsQ.isPending) && (
                <p className="text-sm text-muted-foreground">Loading outlets + salespersons…</p>
              )}
              {outletsQ.data && salespersonsQ.data && (
                <Step1Customer
                  draft={draft}
                  onChange={setDraft}
                  outlets={outletsQ.data.outlets}
                  salespersons={salespersonsQ.data.salespersons}
                />
              )}
              {(outletsQ.error || salespersonsQ.error) && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  Couldn't load outlets/salespersons:{" "}
                  {(outletsQ.error ?? salespersonsQ.error)?.message}
                </p>
              )}
            </>
          )}
          {!submitted && step === 2 && (
            <>
              {catalogQ.isPending && (
                <p className="text-sm text-muted-foreground">Loading catalog…</p>
              )}
              {catalogQ.error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  Couldn't load catalog: {(catalogQ.error as Error).message}
                </p>
              )}
              {catalogQ.data && (
                <Step2Products draft={draft} onChange={setDraft} catalog={catalogQ.data} />
              )}
            </>
          )}
          {!submitted && step === 3 && (
            <>
              {catalogQ.data && (
                <Step3SignaturePayment
                  draft={draft}
                  onChange={setDraft}
                  catalog={catalogQ.data}
                />
              )}
              {!catalogQ.data && (
                <p className="text-sm text-muted-foreground">Loading catalog…</p>
              )}
            </>
          )}
        </div>

        {/* Footer — hidden on ThankYou screen (its own buttons take over) */}
        {!submitted && (
          <footer className="px-7 py-3.5 border-t border-base-100 flex flex-col gap-2 bg-base-50">
            {submitError && (
              <p className="text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded px-3 py-1.5">
                {submitError}
              </p>
            )}
            <div className="flex justify-between items-center">
              <button
                onClick={() => (step === 1 ? cancelAndClose() : setStep(step - 1))}
                title={step === 1 ? "Cancel — discards your draft" : "Back to previous step"}
                className="btn-ghost"
                disabled={uploading || createOrder.isPending}
              >
                {step === 1 ? "Cancel" : "← Back"}
              </button>
              <div className="flex items-center gap-4">
                {step >= 2 && (
                  <span className="text-[13px] text-base-700">
                    Total{" "}
                    <span className="font-mono font-semibold text-base-900">
                      RM{" "}
                      {footerTotal.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </span>
                )}
                {step < 3 ? (
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={() => canAdvance && setStep(step + 1)}
                      disabled={!canAdvance}
                      className="btn-primary"
                    >
                      Continue →
                    </button>
                    {!canAdvance && step === 1 && (
                      <span className="text-[11px] text-base-500 italic">
                        Missing: {step1FirstIssue(draft)}
                      </span>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={submitDisabled}
                    className="btn-primary"
                  >
                    {uploading
                      ? "Uploading…"
                      : createOrder.isPending
                        ? "Submitting…"
                        : "Submit order"}
                  </button>
                )}
              </div>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
