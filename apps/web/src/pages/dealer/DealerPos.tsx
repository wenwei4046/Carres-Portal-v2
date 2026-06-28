import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { CreateOrderInput, Order } from "@carres/shared";
import { maxLeadDaysFor } from "@carres/shared";
import { composeAddress } from "@/data/malaysia-postcodes";
import CarresLockup from "@/components/CarresLockup";
import { deliveryFeePreview } from "@/lib/order-totals";
import { rm } from "@/lib/format-currency";
import { useAuth } from "@/lib/auth";
import {
  useCatalog,
  useCreateOrder,
  useDealerSelf,
  useFreePwpCode,
  useOutlets,
  useProceedOrder,
  usePwpCodesMine,
  useReservePwpCode,
  useSalespersons,
} from "@/lib/queries";
import { triggerLinesInCart, type PwpTriggerLine } from "./pos/pwp-line";
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
 * 0187 (Phase 8c) — a fresh per-cart claimGroup correlation UUID. Unlike the
 * draft's `newLocalId` (a client-only text key), this value is sent to the
 * `p_claim_group uuid` RPC arg + the `pwp_codes.claim_group uuid` column, so the
 * fallback MUST also be a valid uuid v4 — a non-uuid would fail Postgres text→uuid
 * coercion (22P02) at claim time (review MINOR). Production browsers always have
 * `crypto.randomUUID`; the `getRandomValues` v4 polyfill covers JSDOM / older
 * runtimes so the shape is always a uuid (matching `pwpCodeSchema.claimGroup`'s
 * `.uuid()`). */
function newClaimGroup(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  // RFC 4122 v4 from getRandomValues (uuid-shaped fallback).
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(b);
  } else {
    for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  }
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 10
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}

/**
 * Resolve the dealer an order is placed under.
 *  - Dealer / salesperson / showroom: `actingDealerId` undefined → use the JWT
 *    dealer, and the order body carries NO `dealerId` (the API uses the JWT) —
 *    today's behavior, byte-identical.
 *  - Principal placing ON BEHALF OF a picked dealer: `actingDealerId` set → it is
 *    the storage upload folder + the body `dealerId` the API honors for internal
 *    roles (a dealer can never spoof it; the API ignores the body field for them).
 */
export function resolveActingDealer(
  actingDealerId: string | undefined,
  authDealerId: string | null,
): { effectiveDealerId: string | null; bodyDealerId: string | undefined } {
  return {
    effectiveDealerId: actingDealerId ?? authDealerId ?? null,
    bodyDealerId: actingDealerId,
  };
}

/**
 * Full-screen POS order-entry flow — the dealer landing page. Three steps:
 * 01 CATALOG (pick products → cart) → 02 CUSTOMER (info + delivery + access) →
 * 03 CONFIRM (payment + signature + submit). Replaces the legacy 4-step
 * `?new=1` modal wizard; reuses its draft persistence, validation gates, and
 * submit pipeline verbatim so the API / schema are untouched.
 */
export default function DealerPos({
  actingDealerId,
  actingDealerName,
  onExit,
}: {
  /** When set, the caller (a principal) is placing this order ON BEHALF OF this
   *  dealer — it owns the order. Undefined = the signed-in dealer places for
   *  themselves (the default, byte-identical to before). */
  actingDealerId?: string;
  actingDealerName?: string;
  /** Where "Exit" / ThankYou-close goes. Default: navigate to /dealer/orders. */
  onExit?: () => void;
} = {}) {
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

  // ── 0187 (Phase 8c) — the per-CART claimGroup correlation uuid. ONE per cart
  // submit (§6.3): every coded reward line shares it (the server enforces the
  // agreement) + it is threaded onto each `attrs.pwp.claimGroup`. Minted LAZILY
  // (review MINOR) on first read via getClaimGroup() — so a dormant / non-PWP cart
  // never runs crypto.randomUUID(); reset on startAnotherOrder / discardDraft so a
  // new cart gets a fresh group. Stored in a ref (no re-render) — the CartDrawer
  // reads it when a voucher is bound; the same value is on the bound lines' attrs
  // already at submit, so handleSubmit doesn't need to re-stamp it. */
  const claimGroupRef = useRef<string>("");
  const getClaimGroup = useCallback((): string => {
    if (!claimGroupRef.current) claimGroupRef.current = newClaimGroup();
    return claimGroupRef.current;
  }, []);

  const { effectiveDealerId, bodyDealerId } = resolveActingDealer(actingDealerId, dealerId);
  // useDealerSelf 403s for a principal (no own dealer) — skip it when acting.
  const dealerQ = useDealerSelf({ enabled: !actingDealerId });
  const outletsQ = useOutlets();
  const salespersonsQ = useSalespersons();
  const catalogQ = useCatalog();

  // When a principal places on behalf of a picked dealer, constrain the outlet +
  // salesperson choices to THAT dealer (the lists are RLS-read-all for internal
  // roles). A normal dealer already sees only their own, so this is a no-op there.
  const outlets = useMemo(() => {
    const all = outletsQ.data?.outlets ?? [];
    return actingDealerId ? all.filter((o) => o.dealerId === actingDealerId) : all;
  }, [outletsQ.data, actingDealerId]);
  const salespersons = useMemo(() => {
    const all = salespersonsQ.data?.salespersons ?? [];
    return actingDealerId ? all.filter((s) => s.dealerId === actingDealerId) : all;
  }, [salespersonsQ.data, actingDealerId]);

  // Refetch catalog once on mount so the dealer's locked unit_price is fresh
  // against principal updates (the legacy wizard refetched on Step 2 entry).
  useEffect(() => {
    void catalogQ.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 0187 (Phase 8c) — the PWP voucher reserve reconciler. ────────────────────
  // DORMANT-aware: the reserve traffic only exists when the catalog carries
  // ACTIVE pwp_rules. With 0 active rules `pwpActive` is false → the /mine query
  // is disabled AND the reconciler short-circuits, so a no-PWP cart makes ZERO
  // reserve calls (byte-identical). The voucher rail reads this RESERVED set.
  const pwpActive = useMemo(
    () => (catalogQ.data?.pwpRules ?? []).some((r) => r.active),
    [catalogQ.data],
  );
  const reservedCodesQ = usePwpCodesMine({ enabled: pwpActive && !submitted });
  const reservePwp = useReservePwpCode();
  const freePwp = useFreePwpCode();

  // The trigger lines currently in the cart (keyed by localId). A trigger is a
  // line whose sku matches an active rule's trigger scope (shared matcher). Empty
  // when nothing is configured.
  const triggerLines: PwpTriggerLine[] = useMemo(
    () => (pwpActive && catalogQ.data ? triggerLinesInCart(draft.lines, catalogQ.data) : []),
    [pwpActive, catalogQ.data, draft.lines],
  );

  // Debounced single-flight reconciler: diff the trigger set against the last
  // reconciled snapshot (key → qty). New trigger / qty-up → reserve; removed /
  // qty-down to 0 → free. Single-flight per cartLineKey via an in-flight ref, so
  // reserves stay sequential (the §3.1 idempotency holds). Best-effort — a missed
  // reserve just shows fewer codes in the rail; never blocks submit. */
  const lastReconciledRef = useRef<Map<string, number>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!pwpActive || submitted) return;
    const handle = window.setTimeout(() => {
      const prev = lastReconciledRef.current;
      const next = new Map(triggerLines.map((t) => [t.cartLineKey, t]));

      // Reserve new triggers + qty changes (sequential, single-flight per key).
      for (const t of triggerLines) {
        if (inFlightRef.current.has(t.cartLineKey)) continue;
        if (prev.get(t.cartLineKey) === t.qty) continue; // unchanged → no-op
        inFlightRef.current.add(t.cartLineKey);
        reservePwp.mutate(
          { cartLineKey: t.cartLineKey, sku: t.sku, qty: t.qty },
          {
            onSettled: () => {
              inFlightRef.current.delete(t.cartLineKey);
              lastReconciledRef.current.set(t.cartLineKey, t.qty);
            },
          },
        );
      }

      // Free removed triggers (a key we reconciled before that's gone now).
      for (const key of prev.keys()) {
        if (next.has(key)) continue;
        if (inFlightRef.current.has(key)) continue;
        inFlightRef.current.add(key);
        freePwp.mutate(key, {
          onSettled: () => {
            inFlightRef.current.delete(key);
            lastReconciledRef.current.delete(key);
          },
        });
      }
    }, 250);
    return () => window.clearTimeout(handle);
    // reservePwp / freePwp are stable mutation handles; depend on the trigger set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pwpActive, submitted, triggerLines]);

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
    // 0184 — delivery TRIP fee preview (same pure engine the server recomputes).
    // Dormant config (0/0) → 0, so totals stay byte-identical until rates are set.
    const delivery =
      deliveryFeePreview(draft.lines, catalogQ.data, {
        additionalFee: draft.additionalDeliveryFee,
        isCrossCategoryFollowup: Boolean((draft.crossCategorySourceSo ?? "").trim()),
      })?.total ?? 0;
    return lineSub + addonSub + stair + delivery;
  }, [draft, catalogQ.data]);

  const submitDisabled =
    !confirmReady || uploading || createOrder.isPending || !effectiveDealerId;

  /**
   * Submit pipeline (ported verbatim from the legacy wizard):
   *   1. Upload signature + (optional) payment slip dataURLs to Storage
   *   2. POST /api/orders with the composed CreateOrderInput
   *   3. clearDraft + render ThankYou; auto-proceed if ASAP
   */
  async function handleSubmit() {
    if (!confirmReady || !step3DateValid(draft, minLeadDays) || !effectiveDealerId || !draft.wizardSessionId)
      return;
    setSubmitError(null);
    try {
      setUploading(true);
      const signaturePath = await uploadDataUrl({
        dealerId: effectiveDealerId,
        wizardSessionId: draft.wizardSessionId,
        filename: "signature.png",
        dataUrl: draft.signature!,
      });
      let paymentSlipPath: string | null = null;
      if (draft.payment.slip) {
        paymentSlipPath = await uploadDataUrl({
          dealerId: effectiveDealerId,
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
        // Only an internal role (principal) sends a body dealerId; the API honors
        // it only when the JWT carries no dealer. A dealer omits it → JWT wins.
        ...(bodyDealerId ? { dealerId: bodyDealerId } : {}),
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
        // 0184 — the operator's two delivery-fee inputs. The server is
        // authoritative for the base + cross portions (it recomputes from fresh
        // config + rules and appends the fee as order_addons); the client only
        // supplies these two. Omitted when unset so non-POS callers / dormant
        // orders submit a byte-identical payload.
        ...(draft.additionalDeliveryFee && draft.additionalDeliveryFee > 0
          ? { additionalDeliveryFee: draft.additionalDeliveryFee }
          : {}),
        ...((draft.crossCategorySourceSo ?? "").trim()
          ? { crossCategorySourceSo: draft.crossCategorySourceSo!.trim() }
          : {}),
        // 0187 (Phase 8c) — the trigger cart-line keys whose RESERVED pwp_codes
        // belong to THIS submit, so the server's Confirm-pass can DELETE the
        // unclaimed RESERVED ones (the server also has a claim_group-derived
        // fallback sweep). Empty on a DORMANT / no-PWP cart — equal to the schema
        // default, so the server-side effect is byte-identical.
        pwpCartLineKeys: triggerLines.map((t) => t.cartLineKey),
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

  // 0187 — a new/cleared cart gets a fresh claimGroup + reconciler snapshot, so
  // the next order's vouchers never inherit the prior cart's correlation uuid.
  // Clear (not re-mint) — getClaimGroup() lazily mints a fresh uuid on the next read.
  function resetPwpReconciler() {
    claimGroupRef.current = "";
    lastReconciledRef.current = new Map();
    inFlightRef.current = new Set();
  }

  function startAnotherOrder() {
    setSubmitted(null);
    setSubmitError(null);
    setDraft(emptyDraft());
    setStep(1);
    setShowResume(false);
    resetPwpReconciler();
  }

  function discardDraft() {
    clearDraft();
    setDraft(emptyDraft());
    setStep(1);
    setShowResume(false);
    resetPwpReconciler();
  }

  function handleExit() {
    if (!submitted && draftHasContent(draft)) {
      const leave = window.confirm(
        "You have an unsaved order. Leave the POS? Your draft is saved and will be here when you return.",
      );
      if (!leave) return;
    }
    (onExit ?? (() => navigate("/dealer/orders")))();
  }

  const outletName = draft.outletId
    ? outlets.find((o) => o.id === draft.outletId)?.name
    : undefined;
  const contextLabel = outletName ?? actingDealerName ?? dealerQ.data?.name ?? "New sale";
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
                  (onExit ?? (() => navigate("/dealer/orders")))();
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
              pwpReservedCodes={reservedCodesQ.data?.codes ?? []}
              pwpClaimGroup={pwpActive ? getClaimGroup() : undefined}
            />
          </div>
        ) : step === 2 ? (
          <div key={2} className="animate-page-enter h-full overflow-auto">
            {outletsQ.data && salespersonsQ.data ? (
              <CustomerStep
                draft={draft}
                onChange={setDraft}
                outlets={outlets}
                salespersons={salespersons}
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
