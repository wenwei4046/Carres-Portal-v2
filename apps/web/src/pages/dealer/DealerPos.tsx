import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bookmark, ListOrdered, Lock, LogOut, ShoppingBag, Users } from "lucide-react";
import { toast } from "sonner";
import type { CreateOrderInput, Order, PwpDiscoverDto, PwpDiscoverResponse } from "@carres/shared";
import { maxLeadDaysFor, resolvePaymentMethods, STRIPE_METHOD_KEY } from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { composeAddress } from "@/data/malaysia-postcodes";
import { draftTotals } from "@/lib/order-totals";
import { rm } from "@/lib/format-currency";
import { useAuth } from "@/lib/auth";
import { useStaffSession } from "@/lib/staff";
import StaffManagePage from "./staff/StaffManagePage";
import StaffSwitchChip from "./staff/StaffSwitchChip";
import {
  useCancelOrder,
  useCatalog,
  useCreateOrder,
  useDealerSelf,
  useFreePwpCode,
  useOrder,
  useOutlets,
  usePrincipalDealers,
  useProceedOrder,
  usePwpAvailableForPhone,
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
  step1Valid,
  step2Valid,
  step3DateValid,
  step4Valid,
} from "./new-order/draft";
import Step3SignaturePayment from "./new-order/Step3SignaturePayment";
import ThankYou from "./new-order/ThankYou";
import StripeCollectModal from "./pos/StripeCollectModal";
import CatalogStep from "./pos/CatalogStep";
import CustomerStep from "./pos/CustomerStep";
import OrderStatusPage from "./pos/OrderStatusPage";
import OrderSummaryRail from "./pos/OrderSummaryRail";
import QuotesDrawer from "./pos/QuotesDrawer";
import { quoteToDraftLines, type SavedQuote } from "./pos/quotes";
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
  /** Principal on-behalf only: where "Exit" / ThankYou-close goes. Dealer-side
   *  (undefined, POS-only since 2026-07-19) the corner control LOCKS the
   *  register instead and ThankYou's "View orders" opens the in-POS board. */
  onExit?: () => void;
} = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // Which CUSTOMER sub-step to open on: 0 (Customer form) when arriving from
  // the cart, 3 (Target date) when backing out of the CONFIRM step — Back
  // returns to the previous SCREEN, not the start of the wizard (Loo 2026-07-12).
  const [customerSubStep, setCustomerSubStep] = useState<0 | 3>(0);
  const [draft, setDraft] = useState<WizardDraft>(() => {
    const d = loadDraft() ?? emptyDraft();
    // The ASAP pill was removed 2026-07-12 — neutralize a stale flag from an
    // older saved draft so the hidden auto-proceed / 50%-deposit gate can't
    // fire with no UI showing why.
    return d.delivery.asap ? { ...d, delivery: { ...d.delivery, asap: false } } : d;
  });
  const [submitted, setSubmitted] = useState<Order | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // 0224 — Stripe pay-BEFORE-create (Loo 2026-07-15: "没有给完钱不可以开单"):
  // "Complete order" mints a pending order + immediately shows the QR; the
  // wizard only reaches ThankYou once the payment records (or the dealer
  // explicitly keeps the order for a WhatsApp'd link). The pending pointer
  // lives on the DRAFT so a refresh resumes the same order's QR instead of
  // minting a duplicate SO.
  const [stripeCollectAmount, setStripeCollectAmount] = useState<number | null>(null);
  const [stripeCollected, setStripeCollected] = useState(0);
  const [stripePaidPending, setStripePaidPending] = useState(0);
  const stripePendingOrderRef = useRef<Order | null>(null);
  const stripePending = draft.stripePending ?? null;
  // Resume-after-refresh fallback: the created Order object is gone, refetch it.
  const stripePendingOrderQ = useOrder(stripePending?.orderId ?? "", {
    enabled: !!stripePending && !stripePendingOrderRef.current,
  });
  const cancelPendingOrder = useCancelOrder(stripePending?.orderId ?? "");
  const [uploading, setUploading] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [quotesOpen, setQuotesOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);

  const dealerId = useAuth((s) => s.dealerId);
  const role = useAuth((s) => s.role);
  const userEmail = useAuth((s) => s.user?.email ?? "");
  // 0233 — the PIN-verified staff member (null for principal on-behalf / dormant
  // stores). When present the top-bar chip becomes a "换人 / switch" button.
  const staffMember = useStaffSession((s) => s.staff);
  const clearStaffToken = useStaffSession((s) => s.clearToken);
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

  // Trap the browser Back button inside the POS flow: on the Customer (2) or
  // Confirm (3) step, Back returns to the Catalog (step 1) instead of leaving
  // the POS entirely (Loo 2026-07-06 — it was jumping back to the portal). One
  // guard history entry is armed the first time we leave step 1, so 2↔3 moves
  // don't pollute history.
  const posBackGuardRef = useRef(false);
  useEffect(() => {
    if (submitted || step === 1) {
      posBackGuardRef.current = false;
      return;
    }
    if (!posBackGuardRef.current) {
      window.history.pushState(null, "");
      posBackGuardRef.current = true;
    }
    const onPopState = () => {
      posBackGuardRef.current = false;
      setStep(1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [step, submitted]);

  // Forgot-PIN owner-mode reauth (StaffGate) lands here with {openStaff: true}
  // — open the Staff & PINs overlay directly (the back-office Settings page it
  // used to open is gone), then clear the state so a refresh doesn't reopen it.
  useEffect(() => {
    if ((location.state as { openStaff?: boolean } | null)?.openStaff) {
      setTeamOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  // POS-parity (2990s) — an INTERNAL operator (principal, no JWT dealer) who
  // wasn't handed an acting dealer by the caller picks the dealer IN-FLOW at
  // the CUSTOMER step; the pick lives on the draft so it survives refresh.
  // Dealer-side logins (JWT dealer present) never pick — their dealer wins.
  const internalPicksDealer = !actingDealerId && !dealerId;
  const effectiveActingId =
    actingDealerId ?? (internalPicksDealer ? draft.actingDealerId ?? undefined : undefined);
  const effectiveActingName =
    actingDealerName ?? (internalPicksDealer ? draft.actingDealerName ?? undefined : undefined);

  const { effectiveDealerId, bodyDealerId } = resolveActingDealer(effectiveActingId, dealerId);
  // useDealerSelf 403s for a principal (no own dealer) — only dealer-side JWTs ask.
  const dealerQ = useDealerSelf({ enabled: !!dealerId });
  const outletsQ = useOutlets();
  const salespersonsQ = useSalespersons();
  const catalogQ = useCatalog();

  // The in-flow dealer choices (ACTIVE dealers only — matches the live status
  // gate). Only fetched for an internal operator; dealers never hit this route.
  const principalDealersQ = usePrincipalDealers({}, { enabled: internalPicksDealer });
  const pickableDealers = useMemo(
    () =>
      (principalDealersQ.data?.dealers ?? [])
        .filter((d) => d.status === "active")
        .map((d) => ({ id: d.id, name: d.name })),
    [principalDealersQ.data],
  );

  // When an internal operator places on behalf of a picked dealer, constrain the
  // outlet + salesperson choices to THAT dealer (the lists are RLS-read-all for
  // internal roles). A normal dealer already sees only their own, so this is a
  // no-op there. Unpicked internal → empty lists (the CUSTOMER step blocks on
  // the dealer card first).
  const outlets = useMemo(() => {
    const all = outletsQ.data?.outlets ?? [];
    if (!internalPicksDealer && !actingDealerId) return all;
    return effectiveActingId ? all.filter((o) => o.dealerId === effectiveActingId) : [];
  }, [outletsQ.data, internalPicksDealer, actingDealerId, effectiveActingId]);
  const salespersons = useMemo(() => {
    const all = salespersonsQ.data?.salespersons ?? [];
    if (!internalPicksDealer && !actingDealerId) return all;
    return effectiveActingId ? all.filter((s) => s.dealerId === effectiveActingId) : [];
  }, [salespersonsQ.data, internalPicksDealer, actingDealerId, effectiveActingId]);

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

  // ── 0188 (Phase 8d) — cross-order voucher DISCOVERY (auto-suggest by phone). ──
  // The customer's phone is captured at the CUSTOMER step; the cart's cross-order
  // affordance auto-suggests AVAILABLE carry-forward vouchers bound to that phone.
  // Gated on (PWP active AND a phone is present) so a DORMANT / phone-less cart
  // makes ZERO discovery traffic. The stripped (no-PII) DTO; the server computes
  // the phone match. The cross-order claim is re-validated server-side at Confirm.
  const customerPhone = draft.customer.phone.trim();
  const customerName = draft.customer.name.trim();
  const pwpAvailableQ = usePwpAvailableForPhone(
    { phone: customerPhone, name: customerName },
    { enabled: pwpActive && !submitted && customerPhone.length > 0 },
  );

  // Manual voucher-code lookup (the salesperson types / scans a number). Imperative
  // (not a hook) — it fires only on Apply. Returns the stripped discovery DTO (with
  // the server-computed phoneMatches) or null. The phone is included so the server
  // can answer the binding without the client ever seeing the stored phone.
  const lookupVoucherCode = useCallback(
    async (code: string): Promise<PwpDiscoverDto | null> => {
      const trimmed = code.trim();
      if (!trimmed) return null;
      const params = new URLSearchParams();
      params.set("code", trimmed);
      if (customerPhone) params.set("phone", customerPhone);
      if (customerName) params.set("name", customerName); // 0204 — name binding
      const res = await apiFetch<PwpDiscoverResponse>(
        `/api/pwp-codes/available?${params.toString()}`,
      );
      return res.vouchers.find((v) => v.code === trimmed) ?? null;
    },
    [customerPhone, customerName],
  );

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
  const lastReconciledRef = useRef<Map<string, string>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!pwpActive || submitted) return;
    const handle = window.setTimeout(() => {
      const prev = lastReconciledRef.current;
      const next = new Map(triggerLines.map((t) => [t.cartLineKey, t]));

      // Reserve new triggers + qty/reward-flag changes (sequential, single-flight
      // per key). The diff key includes `rewardLine` so marking a trigger line as
      // a reward re-reconciles it (the server then trims its promo reservations),
      // and the sku + built compartments so an in-place cart-line EDIT (Loo
      // 2026-07-12 — same localId, different product/build) re-reserves too.
      for (const t of triggerLines) {
        if (inFlightRef.current.has(t.cartLineKey)) continue;
        const diffKey = `${t.sku}:${t.qty}:${t.rewardLine}:${(t.builtCompartments ?? []).join("+")}`;
        if (prev.get(t.cartLineKey) === diffKey) continue; // unchanged → no-op
        inFlightRef.current.add(t.cartLineKey);
        reservePwp.mutate(
          {
            cartLineKey: t.cartLineKey,
            sku: t.sku,
            qty: t.qty,
            rewardLine: t.rewardLine,
            // A sofa build's module codes — combo-scope trigger matching.
            ...(t.builtCompartments?.length ? { builtCompartments: t.builtCompartments } : {}),
          },
          {
            onSettled: () => {
              inFlightRef.current.delete(t.cartLineKey);
              lastReconciledRef.current.set(t.cartLineKey, diffKey);
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
  // An internal operator must have picked the acting dealer before advancing.
  // step2Valid re-checked here too: the Target-date sub-step now hosts the
  // order add-ons picker, so a disposal add-on picked there must have its size
  // before CONFIRM (the cart drawer's gate alone no longer covers it).
  // 0219 — the customer-form + payment gates are CONFIG-AWARE (order_entry_config
  // rides the catalog bundle; absent → code defaults = pre-0219 behavior + cash).
  const entryFormCfg = catalogQ.data?.orderEntryConfig?.formFields ?? null;
  const paymentMethods = useMemo(
    () => resolvePaymentMethods(catalogQ.data?.orderEntryConfig),
    [catalogQ.data],
  );
  const customerReady = useMemo(
    () =>
      !!effectiveDealerId &&
      step1Valid(draft, entryFormCfg) &&
      step2Valid(draft) &&
      step3DateValid(draft, minLeadDays),
    [draft, minLeadDays, effectiveDealerId, entryFormCfg],
  );
  const confirmReady = useMemo(
    () => step4Valid(draft, paymentMethods) && asapDepositOk,
    [draft, asapDepositOk, paymentMethods],
  );

  // Footer total (shown on step 3) — the shared draftTotals grand, so this bar,
  // the Step-3 recap, and the OrderSummaryRail always show the SAME number.
  // (The old hand-rolled stair math here also ignored the dealer-picked
  // delivery.stairItems count — draftTotals applies it.)
  const footerTotal = useMemo(
    () => (catalogQ.data ? draftTotals(draft, catalogQ.data).grand : 0),
    [draft, catalogQ.data],
  );

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

      // 0224 — Stripe online collection: the order is created with paid 0
      // (the customer hasn't paid yet — draft.paid is the amount the ThankYou
      // screen's QR / link will collect; the 0223 RPC moves orders.paid only
      // when Stripe confirms the money).
      const isStripe = draft.payment.method === STRIPE_METHOD_KEY;
      const paidAtCreate = isStripe ? 0 : draft.paid;

      const lineSub = draft.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
      const addonSub = draft.addons.reduce((s, a) => s + a.unitPrice * a.qty, 0);
      const totalForPct = lineSub + addonSub; // Stair excluded — matches preview math.
      const depositPct = totalForPct > 0 ? Math.round((paidAtCreate / totalForPct) * 100) : 0;

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
          // 0230 — the structured parts the wizard collected, persisted
          // alongside the composed string so the detail drawer's cascading
          // picker can repopulate. Wiped when address is deferred.
          addressLine1: draft.customer.addressUnknown ? null : draft.customer.addressLine1.trim() || null,
          addressLine2: draft.customer.addressUnknown ? null : draft.customer.addressLine2.trim() || null,
          addressState: draft.customer.addressUnknown ? null : draft.customer.addressState || null,
          addressCity: draft.customer.addressUnknown ? null : draft.customer.addressCity || null,
          addressPostcode: draft.customer.addressUnknown ? null : draft.customer.addressPostcode || null,
          billing: draft.customer.billingSame ? null : draft.customer.billing,
          billingSame: draft.customer.billingSame,
          emergency: composeEmergency(draft.customer),
          // 0200 — POS-parity demographics (POS-required via step1 gate;
          // trimmed-empty → null keeps the wire shape lenient).
          email: draft.customer.email.trim() || null,
          race: draft.customer.race || null,
          gender: draft.customer.gender || null,
          birthday: draft.customer.birthday || null,
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
        paid: paidAtCreate,
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
        // 0219 — POS entry extras: the payment follow-up answers (e.g. the
        // Credit/Debit bank) + custom form-field values. Omitted entirely when
        // both are empty so a default-config order submits a byte-identical
        // payload.
        ...(() => {
          const payment = Object.fromEntries(
            Object.entries(draft.payment.followUps ?? {}).filter(([, v]) => v.trim()),
          );
          const fields = Object.fromEntries(
            Object.entries(draft.customer.custom ?? {}).filter(([, v]) => v.trim()),
          );
          const hasPayment = Object.keys(payment).length > 0;
          const hasFields = Object.keys(fields).length > 0;
          return hasPayment || hasFields
            ? {
                entryData: {
                  ...(hasPayment ? { payment } : {}),
                  ...(hasFields ? { fields } : {}),
                },
              }
            : {};
        })(),
      };

      const created = await createOrder.mutateAsync(input);

      if (isStripe) {
        // Pay-BEFORE-create: hold on the CONFIRM step with the QR up; the
        // wizard reaches ThankYou only when the payment records (or the
        // dealer explicitly keeps the order for a WhatsApp'd link). The
        // pending pointer persists on the draft so a refresh resumes THIS
        // order's QR instead of minting a duplicate SO.
        stripePendingOrderRef.current = created;
        setDraft((d) => ({
          ...d,
          stripePending: { orderId: created.id, so: created.so, amount: draft.paid },
        }));
        return;
      }

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

  // ── 0224 Stripe pay-before-create handlers ──────────────────────────────
  const stripePendingOrder = stripePendingOrderRef.current ?? stripePendingOrderQ.data ?? null;

  // Tap-to-QR (Loo 2026-07-15): tapping the "Pay online" card auto-submits the
  // moment the draft state (method write included) has committed — the QR is
  // the very next thing on screen. Not ready → say exactly what's missing and
  // leave the method selected (the footer button finishes the job).
  const [stripeAutoFire, setStripeAutoFire] = useState(false);
  useEffect(() => {
    if (!stripeAutoFire) return;
    if (draft.payment.method !== STRIPE_METHOD_KEY) return;
    setStripeAutoFire(false);
    if (stripePending || uploading || createOrder.isPending) return;
    if (draft.paid <= 0) {
      toast.info("Pick the amount to collect first — 50% / Full / Custom above.");
      return;
    }
    if (!draft.signature || !draft.signature.startsWith("data:image/")) {
      toast.info("Customer signs first, then the QR opens.");
      return;
    }
    if (!draft.termsAccepted) {
      toast.info("Tick the T&C box, then the QR opens.");
      return;
    }
    if (!confirmReady || !step3DateValid(draft, minLeadDays) || !effectiveDealerId) {
      toast.info("Complete the remaining fields, then tap Collect & complete.");
      return;
    }
    void handleSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripeAutoFire, draft, confirmReady, stripePending, uploading, minLeadDays, effectiveDealerId]);

  /** Leave the pending state for ThankYou — 'paid' (money recorded) or 'keep'
   *  (dealer keeps the order + the 24h link for a remote customer). */
  function stripeFinalize(kind: "paid" | "keep") {
    const sp = stripePending;
    const order = stripePendingOrder;
    if (!sp || !order) return;
    clearDraft();
    setDraft((d) => ({ ...d, stripePending: null }));
    stripePendingOrderRef.current = null;
    if (kind === "paid") {
      setStripeCollected(stripePaidPending || sp.amount);
      setStripeCollectAmount(null);
    } else {
      setStripeCollected(0);
      setStripeCollectAmount(sp.amount); // ThankYou keeps a "Collect online" button
    }
    setStripePaidPending(0);
    setSubmitted(order);
  }

  /** The strict path (Loo: no unpaid orders) — void the pending order and
   *  return to editing; the draft is untouched so a retry re-submits. */
  async function stripeVoidPending() {
    const sp = stripePending;
    if (!sp) return;
    if (
      !window.confirm(
        `Void order CO-${sp.so}? The customer hasn't paid — the order is cancelled and you return to editing.`,
      )
    )
      return;
    try {
      await cancelPendingOrder.mutateAsync({ reason: "Stripe payment not completed at handover" });
      toast.info(`Order CO-${sp.so} voided — nothing was charged.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not void the order");
      return;
    }
    stripePendingOrderRef.current = null;
    setDraft((d) => ({ ...d, stripePending: null }));
  }

  function handleStripeModalClose() {
    if (stripePaidPending > 0) return stripeFinalize("paid");
    if (
      window.confirm(
        "Customer hasn't paid yet.\n\nOK — keep the order and finish (the payment link stays valid for 24h; collect from My orders).\nCancel — stay on the QR.",
      )
    ) {
      stripeFinalize("keep");
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
    setStripeCollectAmount(null);
    setStripeCollected(0);
    setStripePaidPending(0);
    setDraft(emptyDraft());
    setStep(1);
    resetPwpReconciler();
  }

  // Load a saved quote — REPLACES the cart (a quote is a snapshot). Keeps the
  // typed customer unless the quote carries a real label/phone.
  function handleLoadQuote(q: SavedQuote) {
    if (
      draftHasContent(draft) &&
      !window.confirm("Replace the current cart with this quote? Unsaved cart lines are lost.")
    ) {
      return;
    }
    setDraft((d) => ({
      ...d,
      lines: quoteToDraftLines(q),
      addons: q.addons,
      customer: {
        ...d.customer,
        name: q.label && q.label !== "Unnamed quote" ? q.label : d.customer.name,
        phone: q.phone || d.customer.phone,
      },
    }));
    setQuotesOpen(false);
    setStep(1);
    toast.success("Quote loaded to cart");
  }

  // In-flow dealer pick (internal operator only). Switching dealers resets the
  // outlet + salesperson — those rows belong to the previous dealer.
  function pickDealer(id: string, name: string) {
    setDraft((d) => ({
      ...d,
      actingDealerId: id,
      actingDealerName: name,
      outletId: null,
      salespersonId: null,
    }));
  }

  function handleExit() {
    if (!onExit) {
      // Dealer-side (Loo 2026-07-19, POS-only): the back-office is gone, so the
      // corner control LOCKS the register — StaffGate drops to the PIN screen.
      // Non-destructive: the draft persists and restores on the next unlock.
      clearStaffToken();
      return;
    }
    if (!submitted && draftHasContent(draft)) {
      const leave = window.confirm(
        "You have an unsaved order. Leave the POS? Your draft is saved and will be here when you return.",
      );
      if (!leave) return;
    }
    onExit();
  }

  const outletName = draft.outletId
    ? outlets.find((o) => o.id === draft.outletId)?.name
    : undefined;
  const contextLabel = outletName ?? effectiveActingName ?? dealerQ.data?.name ?? "New sale";
  const itemCount = cartItemCount(draft.lines);
  const cartTotal = cartTotalExStair(draft.lines, draft.addons);

  // Topbar staff chip (2990s parity: avatar + name + role).
  const displayName = dealerQ.data?.name ?? (userEmail ? userEmail.split("@")[0] : "Staff");
  const initials = (dealerQ.data?.name || userEmail || "··").slice(0, 2).toUpperCase();
  const roleLabel = (role ?? "dealer").replace(/_/g, " ");

  const STEPS: Array<{ n: 1 | 2 | 3; label: string }> = [
    { n: 1, label: "Cart" },
    { n: 2, label: "Customer" },
    { n: 3, label: "Confirmed" },
  ];

  return (
    <div
      className="pos-proto fixed inset-0 z-40 flex flex-col"
      style={{ background: "var(--pos-bg)" }}
    >
      {/* Top bar — prototype .pos-topbar (Loo's Claude Design 2026-07-04). */}
      <header className="pos-topbar" style={{ height: 56, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <span className="pos-wordmark">CARRES</span>
          <span
            className="pos-topbar__crumb"
            style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            POS · {contextLabel}
          </span>
        </div>

        <div className="pos-topbar__center">
          {!submitted &&
            STEPS.map((s, i) => {
              const clickable = s.n < step;
              return (
                <button
                  key={s.n}
                  type="button"
                  onClick={() => clickable && setStep(s.n)}
                  disabled={!clickable && s.n !== step}
                  aria-current={step === s.n ? "step" : undefined}
                  data-testid={`pos-step-${s.n}`}
                  className={`pos-topbar__step ${step === s.n ? "is-active" : ""}`}
                  style={{ cursor: clickable ? "pointer" : "default" }}
                >
                  <span style={{ opacity: 0.55, marginRight: 6 }}>0{i + 1}</span>
                  {s.label}
                </button>
              );
            })}
        </div>

        <div className="pos-topbar__right">
          <button
            type="button"
            onClick={() => setQuotesOpen(true)}
            className="topbar-pill"
            aria-label="Saved quotes"
            data-testid="pos-topbar-quotes"
          >
            <Bookmark size={13} strokeWidth={1.75} />
            <span>Quotes</span>
          </button>
          {/* Every role gets the in-POS Order Status board (PIN-gated) — the
              principal's board scopes to the dealer they're acting for (all
              dealers until one is picked). The portal Orders trace tab still
              exists for deep oversight. */}
          <button
            type="button"
            onClick={() => setStatusOpen(true)}
            className="topbar-pill"
            aria-label="My orders"
            data-testid="pos-topbar-my-orders"
          >
            <ListOrdered size={13} strokeWidth={1.75} />
            <span>My orders</span>
          </button>
          {/* Staff management (Loo 2026-07-19) — the store owner / manager adds
              their team right from the POS; salesperson-tier sees no button. */}
          {staffMember && staffMember.tier !== "salesperson" && (
            <button
              type="button"
              onClick={() => setTeamOpen(true)}
              className="topbar-pill"
              aria-label="Manage staff"
              title="Manage staff"
              data-testid="pos-topbar-staff-manage"
            >
              <Users size={13} strokeWidth={1.75} />
              <span>Staff</span>
            </button>
          )}
          {!submitted && itemCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setCartOpen(true);
              }}
              className="pos-topbar__count"
              data-testid="pos-topbar-cart"
            >
              <ShoppingBag size={13} strokeWidth={1.75} />
              {itemCount} item{itemCount === 1 ? "" : "s"} · {rm(cartTotal)}
            </button>
          )}
          {staffMember ? (
            <StaffSwitchChip />
          ) : (
            <Link
              to="/me"
              title="Profile · Sign out"
              data-testid="pos-topbar-staff"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <span className="pos-staff-chip">
                <span className="pos-staff-chip__avatar">{initials}</span>
                <span>
                  {displayName}
                  <span className="pos-staff-chip__role" style={{ display: "block" }}>
                    {roleLabel}
                  </span>
                </span>
              </span>
            </Link>
          )}
          {/* Principal on-behalf: exit back to the portal. Dealer-side: LOCK
              the register (Loo 2026-07-19 — it used to jump to the deleted
              back-office). Hidden when there's neither (unlinked salesperson —
              nothing to lock; sign-out lives on the /me chip). */}
          {(onExit || staffMember) && (
            <button
              type="button"
              onClick={handleExit}
              className="icon-btn"
              aria-label={onExit ? "Exit POS" : "Lock POS"}
              title={onExit ? "Exit POS" : "锁定 · Lock POS"}
              data-testid="pos-exit"
            >
              {onExit ? (
                <LogOut size={18} strokeWidth={1.75} />
              ) : (
                <Lock size={18} strokeWidth={1.75} />
              )}
            </button>
          )}
        </div>
      </header>

      {/* No resume banner (Loo 2026-07-11): an unsaved draft silently restores
          into the cart — "Clear cart" in the drawer covers starting fresh. */}

      {/* Body */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {submitted ? (
          <div className="page-shell h-full overflow-hidden">
            <ThankYou
              order={submitted}
              catalog={catalogQ.data ?? null}
              stripeCollectAmount={stripeCollectAmount}
              stripeCollectedAmount={stripeCollected}
              onNewOrder={startAnotherOrder}
              onClose={() => {
                clearDraft();
                // POS-only (2026-07-19): "View orders" opens the in-POS board;
                // the principal on-behalf keeps its portal exit.
                if (onExit) onExit();
                else setStatusOpen(true);
              }}
            />
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
              onProceed={() => {
                setCustomerSubStep(0);
                setStep(2);
              }}
              cartOpen={cartOpen}
              onCartOpenChange={setCartOpen}
              pwpReservedCodes={reservedCodesQ.data?.codes ?? []}
              pwpClaimGroup={pwpActive ? getClaimGroup() : undefined}
              customerPhone={pwpActive ? customerPhone : undefined}
              pwpAvailableVouchers={pwpAvailableQ.data?.vouchers ?? []}
              onApplyVoucherCode={pwpActive ? lookupVoucherCode : undefined}
            />
          </div>
        ) : step === 2 ? (
          <div key={2} className="page-shell h-full overflow-hidden">
            {outletsQ.data && salespersonsQ.data ? (
              <CustomerStep
                draft={draft}
                onChange={setDraft}
                outlets={outlets}
                salespersons={salespersons}
                catalog={catalogQ.data}
                minLeadDays={minLeadDays}
                initialSubStep={customerSubStep}
                onBackToCart={() => setStep(1)}
                onProceed={() => customerReady && setStep(3)}
                dealerPick={
                  internalPicksDealer
                    ? {
                        dealers: pickableDealers,
                        loading: principalDealersQ.isLoading,
                        value: draft.actingDealerId ?? null,
                        onPick: pickDealer,
                      }
                    : undefined
                }
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
          /* 03 — Confirm & pay, prototype .handover Phase 2 layout: left = phase
             banner + the existing payment/signature form; right = summary rail. */
          <div key={3} className="page-shell h-full overflow-hidden">
            <div className="handover">
              <div className="handover__left">
                <div className="handover__title-row">
                  <div>
                    <span className="phase-banner">
                      <span className="phase-banner__dot" />
                      Phase 2 of 2 · Confirm &amp; pay
                    </span>
                    <h1 className="handover__title">Confirm &amp; payment</h1>
                  </div>
                </div>
                <p className="handover__sub">
                  Record payment, then capture the customer signature to complete the order.
                </p>
                <Step3SignaturePayment
                  draft={draft}
                  onChange={setDraft}
                  catalog={catalogQ.data}
                  onStripeTap={() => setStripeAutoFire(true)}
                />
              </div>
              <OrderSummaryRail draft={draft} catalog={catalogQ.data} />
            </div>
          </div>
        )}
      </main>

      {quotesOpen && (
        <QuotesDrawer
          catalog={catalogQ.data}
          onLoad={handleLoadQuote}
          onClose={() => setQuotesOpen(false)}
        />
      )}

      {statusOpen && (
        <OrderStatusPage dealerId={effectiveActingId} onClose={() => setStatusOpen(false)} />
      )}

      {teamOpen && <StaffManagePage onClose={() => setTeamOpen(false)} />}

      {/* Footer — step 3 only (step 1 advances via the cart; step 2's wizard
          owns its own Back/Next). Prototype-styled bar: ghost Back · Total ·
          primary Complete order. */}
      {!submitted && step === 3 && (
        <footer
          className="shrink-0"
          style={{
            borderTop: "1px solid var(--line)",
            background: "var(--pos-panel)",
            padding: "12px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {submitError && (
            <p
              style={{
                fontSize: 12,
                color: "var(--c-burnt)",
                background: "color-mix(in oklab, var(--c-orange) 8%, transparent)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: "6px 12px",
              }}
            >
              {submitError}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <button
              type="button"
              onClick={() => {
                // Back = the PREVIOUS screen (Target date sub-step), not the
                // first Customer form (Loo 2026-07-12).
                setCustomerSubStep(3);
                setStep(2);
              }}
              className="btn btn--ghost"
              disabled={uploading || createOrder.isPending}
            >
              ← Back
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
                Total{" "}
                <span
                  style={{
                    fontFamily: "var(--font-num)",
                    fontWeight: 900,
                    fontSize: 18,
                    color: "var(--c-burnt)",
                  }}
                >
                  {rm(footerTotal)}
                </span>
              </span>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitDisabled}
                className="btn btn--primary btn--lg"
                data-testid="pos-complete-order"
              >
                {uploading
                  ? "Uploading…"
                  : createOrder.isPending
                    ? "Submitting…"
                    : draft.payment.method === STRIPE_METHOD_KEY
                      ? `Collect RM ${draft.paid.toLocaleString()} & complete`
                      : "Complete order"}
              </button>
            </div>
          </div>
        </footer>
      )}

      {/* 0224 — Stripe pay-before-create: the QR holds the wizard on CONFIRM
          until the payment records (or the dealer keeps / voids the pending
          order). Survives refresh via draft.stripePending. */}
      {stripePending && !submitted && (
        <StripeCollectModal
          orderId={stripePending.orderId}
          so={stripePending.so}
          total={stripePending.amount}
          paid={0}
          initialAmount={stripePending.amount}
          lockAmount
          customerName={draft.customer.name}
          customerPhone={draft.customer.phone || null}
          onPaid={(amt) => setStripePaidPending(amt)}
          onVoidOrder={stripeVoidPending}
          onClose={handleStripeModalClose}
        />
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
