import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { CreateOrderInput, Order } from "@carres/shared";
import { maxLeadDaysFor } from "@carres/shared";
import { composeAddress } from "@/data/malaysia-postcodes";
import CarresLockup from "@/components/CarresLockup";
import { rm } from "@/lib/format-currency";
import { useAuth } from "@/lib/auth";
import {
  useCatalog,
  useCreateOrder,
  useDealerSelf,
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
  step3DateValid,
  step3DateFirstIssue,
  step4Valid,
} from "./new-order/draft";
import Step3SignaturePayment from "./new-order/Step3SignaturePayment";
import ThankYou from "./new-order/ThankYou";
import CatalogStep from "./pos/CatalogStep";
import CustomerStep from "./pos/CustomerStep";
import PosStepper from "./pos/PosStepper";
import { cartItemCount, cartTotalExStair } from "./pos/cart";

/** True when a restored draft has real content worth resuming. */
function draftHasContent(d: WizardDraft): boolean {
  return d.lines.length > 0 || d.addons.length > 0 || d.customer.name.trim().length > 0;
}

/**
 * Full-screen POS order-entry flow — the dealer landing page. Three steps:
 * 01 CATALOG (pick products → cart) → 02 CUSTOMER (info + delivery + access) →
 * 03 CONFIRM (payment + signature + submit). Replaces the legacy 4-step
 * `?new=1` modal wizard; reuses its draft persistence, validation gates, and
 * submit pipeline verbatim so the API / schema are untouched.
 */
export default function DealerPos() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<WizardDraft>(() => loadDraft() ?? emptyDraft());
  const [submitted, setSubmitted] = useState<Order | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [showResume, setShowResume] = useState(() => {
    const d = loadDraft();
    return !!d && draftHasContent(d);
  });

  const dealerId = useAuth((s) => s.dealerId);
  const role = useAuth((s) => s.role);
  const userEmail = useAuth((s) => s.user?.email ?? "");
  const createOrder = useCreateOrder();
  const proceedOrder = useProceedOrder();

  const dealerQ = useDealerSelf();
  const outletsQ = useOutlets();
  const salespersonsQ = useSalespersons();
  const catalogQ = useCatalog();

  // Refetch catalog once on mount so the dealer's locked unit_price is fresh
  // against principal updates (the legacy wizard refetched on Step 2 entry).
  useEffect(() => {
    void catalogQ.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save on every draft change (except after submit, when it's cleared).
  useEffect(() => {
    if (submitted) return;
    saveDraft(draft);
  }, [draft, submitted]);

  // minLeadDays — category-aware delivery lead (mattress/bedframe 14, sofa 21),
  // computed from the cart's categories. Needed at the CUSTOMER step.
  const minLeadDays = useMemo(() => {
    if (!catalogQ.data) return 0;
    const cats = new Set<string>();
    for (const line of draft.lines) {
      const sku = catalogQ.data.skus.find((s) => s.sku === line.sku);
      if (!sku) continue;
      const model = catalogQ.data.models.find((m) => m.id === sku.modelId);
      if (model) cats.add(model.category);
    }
    return maxLeadDaysFor([...cats]);
  }, [draft.lines, catalogQ.data]);

  // ASAP deposit hard-gate — when ASAP is on we auto-proceed after create, and
  // Proceed needs ≥50%; reject at submit rather than create-then-bounce.
  const asapDepositOk = useMemo(() => {
    if (!draft.delivery.asap) return true;
    const lineSub = draft.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    const addonSub = draft.addons.reduce((s, a) => s + a.unitPrice * a.qty, 0);
    const totalForPct = lineSub + addonSub;
    if (totalForPct <= 0) return false;
    return (draft.paid / totalForPct) * 100 >= 50;
  }, [draft]);

  // CATALOG (step 1) advances via the cart drawer, which gates on step2Valid
  // itself; the shell only gates the CUSTOMER → CONFIRM → submit transitions.
  const customerReady = useMemo(
    () => step1Valid(draft) && step3DateValid(draft, minLeadDays),
    [draft, minLeadDays],
  );
  const confirmReady = useMemo(
    () => step4Valid(draft) && asapDepositOk,
    [draft, asapDepositOk],
  );

  // Footer total — lines + addons + stair carry (shown on steps 2/3).
  const footerTotal = useMemo(() => {
    if (!catalogQ.data) return 0;
    const lineSub = draft.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    const addonSub = draft.addons.reduce((s, a) => s + a.unitPrice * a.qty, 0);
    const itemsTotal = draft.lines.reduce((s, l) => s + l.qty, 0);
    const stair = draft.delivery.hasLift
      ? 0
      : Math.max(0, draft.delivery.floor - catalogQ.data.floorConfig.freeUpToFloor) *
        catalogQ.data.floorConfig.perFloorPerItem *
        itemsTotal;
    return lineSub + addonSub + stair;
  }, [draft, catalogQ.data]);

  const submitDisabled =
    !confirmReady || uploading || createOrder.isPending || !dealerId;

  /**
   * Submit pipeline (ported verbatim from the legacy wizard):
   *   1. Upload signature + (optional) payment slip dataURLs to Storage
   *   2. POST /api/orders with the composed CreateOrderInput
   *   3. clearDraft + render ThankYou; auto-proceed if ASAP
   */
  async function handleSubmit() {
    if (!confirmReady || !step3DateValid(draft, minLeadDays) || !dealerId || !draft.wizardSessionId)
      return;
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
      const depositPct = totalForPct > 0 ? Math.round((draft.paid / totalForPct) * 100) : 0;

      const composedAddress = composeAddress({
        line1: draft.customer.addressLine1,
        line2: draft.customer.addressLine2,
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
          proceedDate: draft.delivery.dateTbd ? null : (draft.delivery.proceedDate || null),
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
          attrs: a.attrs ?? null,
        })),
        paid: draft.paid,
        signaturePath,
        paymentSlipPath,
        termsAccepted: true,
        depositPct: Math.min(100, Math.max(0, depositPct)),
        paymentMethod: draft.payment.method,
        // 2026-06-16 (Loo) — forward the approval / reference code for EVERY
        // method, including online: the CONFIRM step requires a bank reference
        // number for online (step4Valid gates it), and Finance needs it to
        // reconcile the deposit against the bank statement. The old code
        // discarded it for online (sent null), so the entered reference was
        // collected then thrown away.
        approvalCode: draft.payment.approvalCode.trim() || null,
        installmentMonths:
          draft.payment.method === "installment" ? draft.payment.installmentMonths : null,
      };

      const created = await createOrder.mutateAsync(input);
      clearDraft();
      setSubmitted(created);

      if (draft.delivery.asap) {
        try {
          await proceedOrder.mutateAsync(created.id);
          toast.success(`Order SO-${created.so} auto-proceeded · ASAP`);
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
    setShowResume(false);
  }

  function discardDraft() {
    clearDraft();
    setDraft(emptyDraft());
    setStep(1);
    setShowResume(false);
  }

  function handleExit() {
    if (!submitted && draftHasContent(draft)) {
      const leave = window.confirm(
        "You have an unsaved order. Leave the POS? Your draft is saved and will be here when you return.",
      );
      if (!leave) return;
    }
    navigate("/dealer/orders");
  }

  const outletName = draft.outletId
    ? outletsQ.data?.outlets.find((o) => o.id === draft.outletId)?.name
    : undefined;
  const contextLabel = outletName ?? dealerQ.data?.name ?? "New sale";
  const itemCount = cartItemCount(draft.lines);
  const cartTotal = cartTotalExStair(draft.lines, draft.addons);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background text-foreground">
      {/* Top bar — 56px fixed height, white over cream page, hairline bottom border. */}
      <header className="shrink-0 h-14 border-b border-base-200 bg-white px-5 flex items-center gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <CarresLockup size={22} />
          <div className="hidden sm:block border-l border-base-200 pl-3 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-base-400">
              POS · {(role ?? "dealer").toUpperCase()}
            </p>
            <p className="t-small font-semibold truncate max-w-[200px]">{contextLabel}</p>
          </div>
        </div>

        {!submitted ? (
          <div className="flex-1 flex justify-center">
            <PosStepper step={step} onStepClick={(n) => setStep(n as 1 | 2 | 3)} />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        <div className="flex items-center gap-2">
          {!submitted && (
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setCartOpen(true);
              }}
              className="flex items-center gap-2 rounded-full border border-base-300 bg-white px-3 py-1.5 hover:border-base-500 transition-colors"
              data-testid="pos-topbar-cart"
            >
              <span className="grid place-items-center w-5 h-5 rounded-full bg-base-900 text-white font-mono text-[10px]">
                {itemCount}
              </span>
              <span className="font-mono text-[12px] font-semibold">{rm(cartTotal)}</span>
            </button>
          )}
          <button onClick={handleExit} className="btn-ghost text-[12px]" data-testid="pos-exit">
            Exit
          </button>
          <Link
            to="/me"
            title="Profile · Sign out"
            className="w-8 h-8 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-semibold"
          >
            {(dealerQ.data?.name || userEmail || "··").slice(0, 2).toUpperCase()}
          </Link>
        </div>
      </header>

      {/* Resume banner */}
      {showResume && !submitted && (
        <div className="shrink-0 bg-signature-50 border-b border-primary/20 px-5 py-2 flex items-center justify-between gap-3">
          <p className="t-small text-base-700">
            You have an unsaved order in progress — pick up where you left off?
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowResume(false)} className="btn-primary text-[12px]">
              Resume
            </button>
            <button onClick={discardDraft} className="btn-ghost text-[12px]">
              Start fresh
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {submitted ? (
          <div className="h-full overflow-auto">
            <div className="mx-auto max-w-xl w-full">
              <ThankYou
                order={submitted}
                onNewOrder={startAnotherOrder}
                onClose={() => {
                  clearDraft();
                  navigate("/dealer/orders");
                }}
              />
            </div>
          </div>
        ) : !catalogQ.data ? (
          <CenterMessage>
            {catalogQ.error
              ? `Couldn't load catalog: ${(catalogQ.error as Error).message}`
              : "Loading catalog…"}
          </CenterMessage>
        ) : step === 1 ? (
          /* Step 1 — full-screen CatalogStep; keyed so step-enter plays on
             re-entry from step 2 back-click. CatalogStep manages its own
             internal layout (category rail + grid + cart drawer). */
          <div key={1} className="animate-page-enter h-full">
            <CatalogStep
              draft={draft}
              onChange={setDraft}
              catalog={catalogQ.data}
              onProceed={() => setStep(2)}
              cartOpen={cartOpen}
              onCartOpenChange={setCartOpen}
            />
          </div>
        ) : step === 2 ? (
          <div key={2} className="animate-page-enter h-full overflow-auto">
            {outletsQ.data && salespersonsQ.data ? (
              <CustomerStep
                draft={draft}
                onChange={setDraft}
                outlets={outletsQ.data.outlets}
                salespersons={salespersonsQ.data.salespersons}
                catalog={catalogQ.data}
                minLeadDays={minLeadDays}
              />
            ) : (
              <CenterMessage>
                {outletsQ.error || salespersonsQ.error
                  ? `Couldn't load outlets/salespersons: ${
                      (outletsQ.error ?? salespersonsQ.error)?.message
                    }`
                  : "Loading outlets + salespersons…"}
              </CenterMessage>
            )}
          </div>
        ) : (
          <div key={3} className="animate-page-enter h-full overflow-auto">
            <div className="mx-auto max-w-3xl w-full px-6 py-8">
              <Step3SignaturePayment draft={draft} onChange={setDraft} catalog={catalogQ.data} />
            </div>
          </div>
        )}
      </main>

      {/* Footer — steps 2 + 3 only (step 1 advances via the cart). */}
      {!submitted && step !== 1 && (
        <footer className="shrink-0 border-t border-base-200 bg-base-50 px-5 py-3 flex flex-col gap-2">
          {submitError && (
            <p className="text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded px-3 py-1.5">
              {submitError}
            </p>
          )}
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={() => setStep((step - 1) as 1 | 2 | 3)}
              className="btn-ghost"
              disabled={uploading || createOrder.isPending}
            >
              ← Back
            </button>
            <div className="flex items-center gap-4">
              <span className="text-[13px] text-base-700">
                Total{" "}
                <span className="font-mono font-semibold text-base-900">{rm(footerTotal)}</span>
              </span>
              {step === 2 ? (
                <div className="flex flex-col items-end gap-1">
                  <button
                    onClick={() => customerReady && setStep(3)}
                    disabled={!customerReady}
                    className="btn-primary"
                  >
                    Continue →
                  </button>
                  {!customerReady && (
                    <span className="text-[11px] text-base-500 italic">
                      {step1Valid(draft)
                        ? step3DateFirstIssue(draft, minLeadDays)
                        : `Missing: ${step1FirstIssue(draft)}`}
                    </span>
                  )}
                </div>
              ) : (
                <button onClick={handleSubmit} disabled={submitDisabled} className="btn-hero">
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
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full grid place-items-center">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
