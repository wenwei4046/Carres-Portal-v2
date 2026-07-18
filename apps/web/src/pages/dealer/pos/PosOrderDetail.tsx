import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Circle,
  Info,
  PackageCheck,
  Paperclip,
  Plus,
  QrCode,
  Save,
  X,
} from "lucide-react";
import {
  PROCEED_BLOCKER_LABEL,
  isProceedBlockerCode,
  maxLeadDaysFor,
  minDeliveryDateISO,
  resolvePaymentMethods,
  type Order,
  type OrderLine,
  type TopUpOrderInput,
  type UpdateOrderInput,
} from "@carres/shared";
import MYAddressFields from "@/components/MYAddressFields";
import { composeAddress } from "@/data/malaysia-postcodes";
import { ApiError } from "@/lib/api";
import { addonSubtotal, floorSurcharge, lineSubtotal } from "@/lib/order-totals";
import {
  useAddOrderLines,
  useCatalog,
  useOrder,
  useProceedOrder,
  useTopUpOrder,
  useUnproceedOrder,
  useUpdateOrder,
} from "@/lib/queries";
import { groupSofaBuildLines } from "@/lib/sofa-build-display";
import { newWizardSessionId, uploadAttachment } from "@/lib/storage";
import type { DraftLine } from "../new-order/draft";
import AddProductOverlay from "./AddProductOverlay";
import { getOrderEditScope, todayMYISO } from "./order-edit-scope";
import StripeCollectModal from "./StripeCollectModal";

/**
 * PosOrderDetail — the POS-native order detail drawer for the My-orders board
 * (design: docs/superpowers/plans/2026-07-14-pos-order-detail.md §4; layout
 * contract: prototype/pos-order-status.jsx OrderDetail; behaviour contract:
 * the 2990s OrderStatus drawer — Loo wants the 2990s rules copied 1:1).
 *
 * Edit gating (order-edit-scope §1):
 *   place lane   — customer + address + dates editable, record payment,
 *                  5-chip checklist gates "Move to Proceed".
 *   proceed lane — customer + address + payment ONLY (dates + items locked);
 *                  "Move to Order placed" while ops hasn't started and the
 *                  proceed date hasn't passed (un-proceed does NOT close the
 *                  drawer — the refetched order flips it into placed mode).
 *   delivered    — fully read-only, info strip.
 *
 * Items are read-only in every lane (Carres has no order_lines write path —
 * design §7). Save sends a DIFF-ONLY UpdateOrderInput (EditOrderModal pattern).
 */

interface Props {
  id: string;
  staffName: string | null;
  onClose: () => void;
}

/** 0184 — delivery trip-fee addons appended by the Hono recompute (same
 *  labels DealerOrderDetail uses). */
const DELIVERY_ADDON_LABELS: Record<string, string> = {
  DELIVERY: "Delivery fee",
  DELIVERY_CROSS: "Cross-category delivery",
  DELIVERY_ADD: "Additional delivery fee",
};

/** Locale-proof RM grouping (comma thousands, no decimals) — same as the
 *  board's rmGroup (kept local to avoid an import cycle with OrderStatusPage). */
function rm(n: number): string {
  return Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function daysAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return diff <= 0 ? "today" : `${diff}d ago`;
}

/** 0185/0187 — free / voucher line tag (mirrors DealerOrderDetail's
 *  freeLineTag + the PWP marker). GWP + Free item render "FREE" as price. */
function lineTag(attrs: OrderLine["attrs"]): "GWP" | "Free item" | "PWP" | null {
  if (!attrs) return null;
  if (attrs.free_gift) return "GWP";
  if (attrs.free_item) return "Free item";
  if (attrs.pwp) return "PWP";
  return null;
}

function errCode(e: unknown): string | null {
  if (e instanceof ApiError) {
    const body = e.body as { code?: unknown } | null;
    if (body && typeof body.code === "string") return body.code;
  }
  return null;
}

function saveErrorCopy(e: unknown): string {
  const code = errCode(e);
  if (code === "proceed_locked_fields")
    return "Dates are locked after Proceed — move the order back to Order placed to edit them.";
  if (code === "wrong_status") return "Order can no longer be edited — refresh and retry.";
  if (code === "no_changes") return "No fields changed.";
  return e instanceof Error ? e.message : "Request failed.";
}

function proceedErrorCopy(e: unknown): string {
  const code = errCode(e);
  if (code && isProceedBlockerCode(code)) return PROCEED_BLOCKER_LABEL[code];
  return e instanceof Error ? e.message : "Request failed.";
}

/** 0231/0232 — add-product failure copy, keyed on the route/RPC error codes. */
function addErrorCopy(e: unknown): string {
  const code = errCode(e);
  if (code === "mixed_category_lines")
    return "Sofa can't mix with mattress / bed frame in one order.";
  if (code === "wrong_status")
    return "Products can only be added while the order is in Order placed.";
  if (code === "unknown_or_inactive_sku")
    return "This product is no longer available — refresh and retry.";
  if (code === "pwp_voucher_add_not_supported")
    return "Voucher codes can't be redeemed on an added line — place a new order to use the voucher.";
  if (code && code.startsWith("pwp_"))
    return "This promo price isn't eligible on this order — reconfigure and retry.";
  if (code === "sofa_price_drift")
    return "The sofa price changed since this screen loaded — rebuild and retry.";
  if (code === "special_price_drift" || code === "options_price_drift")
    return "Prices changed since this screen loaded — reopen the product and reconfigure.";
  return e instanceof Error ? e.message : "Could not add the product.";
}

function unproceedErrorCopy(e: unknown): string {
  const code = errCode(e);
  if (code === "wrong_stage")
    return "HQ operation has already started on this order — it can't be moved back.";
  if (code === "proceed_date_passed")
    return "The proceed date has passed — this order can't be moved back.";
  if (code === "wrong_status") return "Order is no longer in Proceed — refresh and retry.";
  return e instanceof Error ? e.message : "Request failed.";
}

interface Edited {
  name: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  addressState: string;
  addressCity: string;
  addressPostcode: string;
  deliveryDate: string;
  proceedDate: string;
}

function seedEdited(o: Order): Edited {
  // 0230 — the stored structured parts seed the cascading picker (same form
  // as the wizard). A legacy composed-only order seeds Line 1 with the whole
  // saved string so nothing is lost; picking State/City/Postcode on the next
  // edit upgrades it to the structured format.
  const hasParts = !!(
    o.customer.addressLine1 &&
    o.customer.addressState &&
    o.customer.addressCity &&
    o.customer.addressPostcode
  );
  return {
    name: o.customer.name,
    phone: o.customer.phone ?? "",
    email: o.customer.email ?? "",
    addressLine1: hasParts ? (o.customer.addressLine1 ?? "") : (o.customer.address ?? ""),
    addressLine2: hasParts ? (o.customer.addressLine2 ?? "") : "",
    addressState: hasParts ? (o.customer.addressState ?? "") : "",
    addressCity: hasParts ? (o.customer.addressCity ?? "") : "",
    addressPostcode: hasParts ? (o.customer.addressPostcode ?? "") : "",
    deliveryDate: o.delivery.date ?? "",
    proceedDate: o.delivery.proceedDate ?? "",
  };
}

interface SlipSlot {
  file: File;
  dataUrl: string;
}

export default function PosOrderDetail({ id, staffName, onClose }: Props) {
  const orderQ = useOrder(id);
  const catalogQ = useCatalog();
  const order = orderQ.data;
  const catalog = catalogQ.data;

  // ── local edit state (2990s: seeded from the order, resync ONLY on id
  //    change — never on a background refetch of the same order) ────────────
  const [edited, setEdited] = useState<Edited | null>(null);
  const seededId = useRef<string | null>(null);
  useEffect(() => {
    if (order && seededId.current !== order.id) {
      seededId.current = order.id;
      setEdited(seedEdited(order));
    }
  }, [order]);

  // ── record-payment form state ─────────────────────────────────────────────
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<TopUpOrderInput["method"]>("cash");
  // 0230 — the manual-payment chips mirror checkout: the ACTIVE configured
  // methods from order_entry_config (code defaults when empty). Stripe is NOT
  // a chip — it stays the dedicated "Collect online" button above the divider.
  const payMethods = useMemo(
    () => resolvePaymentMethods(catalog?.orderEntryConfig),
    [catalog?.orderEntryConfig],
  );
  // Keep the selected chip valid against the configured list (e.g. the
  // operator removed "cash", or the catalog loads after mount).
  useEffect(() => {
    if (payMethods.length > 0 && !payMethods.some((m) => m.key === method)) {
      setMethod(payMethods[0].key);
    }
  }, [payMethods, method]);
  // 0223 — Stripe collect-online modal (QR / WhatsApp link).
  const [stripeOpen, setStripeOpen] = useState(false);
  const [approvalCode, setApprovalCode] = useState("");
  const [slip, setSlip] = useState<SlipSlot | null>(null);
  const [uploading, setUploading] = useState(false);

  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [proceedErr, setProceedErr] = useState<string | null>(null);
  const [unproceedErr, setUnproceedErr] = useState<string | null>(null);
  const [payErr, setPayErr] = useState<string | null>(null);

  const updateMut = useUpdateOrder(id);
  const topUpMut = useTopUpOrder(id);
  const proceedMut = useProceedOrder();
  const unproceedMut = useUnproceedOrder(id);
  // 0231 — add-product P1 (place lane only; server prices from the catalog).
  const addLinesMut = useAddOrderLines(id);
  const [addOpen, setAddOpen] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  async function handleAddProduct(line: DraftLine) {
    setAddErr(null);
    try {
      // sku/qty/attrs go up — the client preview price stays local (server
      // catalog authority) EXCEPT on a sofa BUILD line, whose preview
      // unitPrice feeds the server drift gate (±0.5%, create-route contract).
      const isBuild = Boolean((line.attrs as Record<string, unknown> | null)?.sofa_build);
      await addLinesMut.mutateAsync({
        lines: [
          {
            sku: line.sku,
            qty: line.qty,
            attrs: line.attrs ?? null,
            ...(isBuild ? { unitPrice: line.unitPrice } : {}),
          },
        ],
      });
      setAddOpen(false);
    } catch (e) {
      setAddErr(addErrorCopy(e));
    }
  }

  // Escape closes; body scroll locked while open (2990s parity).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // ── totals (order-totals — line + addon + stair carry) ───────────────────
  const lineSub = order ? lineSubtotal(order) : 0;
  const addonSub = order ? addonSubtotal(order) : 0;
  const stair = order && catalog ? floorSurcharge(order, catalog.floorConfig) : 0;
  const total = lineSub + addonSub + stair;
  const paid = order?.paid ?? 0;
  const outstanding = Math.max(0, total - paid);

  // Prefill the record-payment amount with the outstanding balance (2990s:
  // effect keyed on order id + paid ONLY, so each recorded payment re-seeds it
  // but a late-loading catalog total can't clobber a hand-typed amount).
  useEffect(() => {
    setAmount(outstanding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.paid]);

  const todayMY = todayMYISO();
  const scope = order
    ? getOrderEditScope(
        {
          status: order.status,
          operationStage: order.operationStage,
          sourceSystem: order.sourceSystem,
          proceedDate: order.delivery.proceedDate,
        },
        todayMY,
      )
    : null;

  // ── lead-time floor for the delivery date (same as EditOrderModal) ────────
  const minLeadDays = useMemo(() => {
    if (!catalog || !order?.lines) return 0;
    const cats = new Set<string>();
    for (const line of order.lines) {
      const sku = catalog.skus.find((s) => s.sku === line.sku);
      if (!sku) continue;
      const model = catalog.models.find((m) => m.id === sku.modelId);
      if (model) cats.add(model.category);
    }
    return maxLeadDaysFor([...cats]);
  }, [catalog, order?.lines]);
  const minDate = useMemo(() => minDeliveryDateISO(minLeadDays), [minLeadDays]);

  // ── conditions (computed from the EDITED values, 2990s parity) ────────────
  const paidOk = total > 0 && paid / total >= 0.5;
  // 2990s paidPct rule (Loo 2026-06-09): never round UP to 100 while a
  // balance remains.
  const pct = total <= 0 ? 0 : paid >= total ? 100 : Math.min(99, Math.floor((paid / total) * 100));
  const customerInfoOk = !!(edited?.name.trim() && edited?.phone.trim() && edited?.email.trim());
  // 0230 — structured address gating (wizard rules: Line 1 ≥5 chars + the
  // full State/City/Postcode cascade). An UNTOUCHED legacy order (composed
  // string, no parts) stays "Set"; once the picker is touched the full
  // cascade is required before the address saves.
  const seed = order ? seedEdited(order) : null;
  const structuredComplete = !!(
    edited &&
    edited.addressLine1.trim().length >= 5 &&
    edited.addressState &&
    edited.addressCity &&
    edited.addressPostcode
  );
  const addressDirty = !!(
    edited &&
    seed &&
    (edited.addressLine1 !== seed.addressLine1 ||
      edited.addressLine2 !== seed.addressLine2 ||
      edited.addressState !== seed.addressState ||
      edited.addressCity !== seed.addressCity ||
      edited.addressPostcode !== seed.addressPostcode)
  );
  const addressEmpty = !!(
    edited &&
    !edited.addressLine1.trim() &&
    !edited.addressLine2.trim() &&
    !edited.addressState &&
    !edited.addressCity &&
    !edited.addressPostcode
  );
  /** Order saved before 0230 (or by a flat writer): composed string without
   *  the structured parts — Line 1 was seeded with the whole string. */
  const legacyFallback = !!(
    order?.customer.address &&
    !(
      order.customer.addressLine1 &&
      order.customer.addressState &&
      order.customer.addressCity &&
      order.customer.addressPostcode
    )
  );
  const addressOk =
    structuredComplete || (!addressDirty && !!(order?.customer.address ?? "").trim());
  const dateOk = !!edited?.deliveryDate;
  const proceedDateOk = !!edited?.proceedDate;
  const allOk = customerInfoOk && addressOk && dateOk && paidOk && proceedDateOk;

  // ── diff-only save payload (EditOrderModal pattern) ───────────────────────
  function buildPayload(): UpdateOrderInput {
    if (!order || !edited || !scope) return {};
    const customer: NonNullable<UpdateOrderInput["customer"]> = {};
    // Name + phone are required on every order (server rejects blanks) — a
    // blanked field is omitted from the patch instead of 400-ing the save.
    if (edited.name !== order.customer.name && edited.name.trim() !== "")
      customer.name = edited.name.trim();
    if (edited.phone !== (order.customer.phone ?? "") && edited.phone.trim() !== "")
      customer.phone = edited.phone.trim();
    if (edited.email !== (order.customer.email ?? "")) customer.email = edited.email.trim() || null;
    // 0230 — the address saves as the full structured set + its composition
    // (the RPC keeps both representations in lockstep). A PARTIAL cascade is
    // never saved (the pill shows Missing); clearing every field clears the
    // address back to addressUnknown.
    if (addressDirty && structuredComplete) {
      customer.address = composeAddress({
        line1: edited.addressLine1,
        line2: edited.addressLine2,
        state: edited.addressState,
        city: edited.addressCity,
        postcode: edited.addressPostcode,
      });
      customer.addressLine1 = edited.addressLine1.trim();
      customer.addressLine2 = edited.addressLine2.trim() || null;
      customer.addressState = edited.addressState;
      customer.addressCity = edited.addressCity;
      customer.addressPostcode = edited.addressPostcode;
      if (order.customer.addressUnknown) customer.addressUnknown = false;
    } else if (addressDirty && addressEmpty) {
      customer.address = null;
      customer.addressLine1 = null;
      customer.addressLine2 = null;
      customer.addressState = null;
      customer.addressCity = null;
      customer.addressPostcode = null;
      if (!order.customer.addressUnknown) customer.addressUnknown = true;
    }
    const delivery: NonNullable<UpdateOrderInput["delivery"]> = {};
    if (scope.editablePlaced) {
      // Proceed-lane date inputs are disabled, so the patch never carries them.
      if (edited.deliveryDate !== (order.delivery.date ?? ""))
        delivery.date = edited.deliveryDate || null;
      if (edited.proceedDate !== (order.delivery.proceedDate ?? ""))
        delivery.proceedDate = edited.proceedDate || null;
      // Clearing both date fields flips the order back to TBD (design §4.5).
      const newTbd = !edited.deliveryDate && !edited.proceedDate;
      if (newTbd !== order.delivery.dateTbd) delivery.dateTbd = newTbd;
    }
    const out: UpdateOrderInput = {};
    if (Object.keys(customer).length > 0) out.customer = customer;
    if (Object.keys(delivery).length > 0) out.delivery = delivery;
    return out;
  }
  const payload = buildPayload();
  const dirty = !!payload.customer || !!payload.delivery;
  const busy = updateMut.isPending || proceedMut.isPending || unproceedMut.isPending;

  async function handleSave() {
    if (!dirty || busy) return;
    setSaveErr(null);
    try {
      await updateMut.mutateAsync(payload);
    } catch (e) {
      setSaveErr(saveErrorCopy(e));
    }
  }

  async function handleProceed() {
    if (!order || !allOk || busy) return;
    setSaveErr(null);
    setProceedErr(null);
    if (dirty) {
      try {
        await updateMut.mutateAsync(payload);
      } catch (e) {
        setSaveErr(saveErrorCopy(e));
        return;
      }
    }
    try {
      await proceedMut.mutateAsync(order.id);
      onClose();
    } catch (e) {
      setProceedErr(proceedErrorCopy(e));
    }
  }

  async function handleUnproceed() {
    if (busy) return;
    setUnproceedErr(null);
    try {
      // Success deliberately does NOT close — the refetched order flips the
      // same open drawer into placed mode (2990s parity).
      await unproceedMut.mutateAsync();
    } catch (e) {
      setUnproceedErr(unproceedErrorCopy(e));
    }
  }

  // ── record payment ────────────────────────────────────────────────────────
  // Proof rule — 0230 config-driven: a method whose config demands an approval
  // code demands the slip with it (finance reconciles both together). Unknown
  // key (config still loading) falls back to the 2990s non-cash heuristic.
  const methodCfg = payMethods.find((m) => m.key === method);
  const slipRequired =
    amount > 0 && (methodCfg ? methodCfg.approvalCodeRequired : method !== "cash");
  const canRecord =
    !!order &&
    amount > 0 &&
    amount <= outstanding &&
    (!slipRequired || (!!slip && approvalCode.trim() !== "")) &&
    !uploading &&
    !topUpMut.isPending;

  function handleSlipFile(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => setSlip({ file: f, dataUrl: String(ev.target?.result ?? "") });
    reader.readAsDataURL(f);
  }

  async function handleRecordPayment() {
    if (!order || !canRecord) return;
    setPayErr(null);
    try {
      let photoPaths: string[] = [];
      if (slip) {
        setUploading(true);
        const sessionId = newWizardSessionId();
        const ext = slip.file.type === "image/png" ? "png" : "jpg";
        photoPaths = [
          await uploadAttachment({
            dealerId: order.dealerId,
            wizardSessionId: `topup-${sessionId}`,
            filename: `receipt-1.${ext}`,
            blob: slip.file,
          }),
        ];
        setUploading(false);
      }
      const methodLabel = payMethods.find((m) => m.key === method)?.label ?? method;
      await topUpMut.mutateAsync({
        amount,
        method,
        methodLabel,
        reference: approvalCode.trim() || null,
        note: null,
        date: todayMY,
        photoPaths,
      });
      // Reset the form; the amount re-seeds from the refetched paid.
      setApprovalCode("");
      setSlip(null);
    } catch (e) {
      setUploading(false);
      setPayErr(e instanceof Error ? e.message : "Could not record payment");
    }
  }

  // ── loading / error shell ─────────────────────────────────────────────────
  if (!order || !edited || !scope) {
    return (
      <div className="os-detail-overlay" onClick={onClose} data-testid="pos-od-overlay">
        <aside className="os-detail" onClick={(e) => e.stopPropagation()}>
          <div className="os-detail__body">
            <p>{orderQ.isError ? "Couldn't load this order — close and retry." : "Loading…"}</p>
          </div>
        </aside>
      </div>
    );
  }

  const laneLabel = scope.isDeliveredLane
    ? "Delivered"
    : scope.editablePlaced
      ? "Order placed"
      : "Proceed";

  const rows = groupSofaBuildLines(order.lines ?? []);
  const pieces = rows.reduce((s, r) => s + (r.kind === "line" ? r.line.qty : 1), 0);

  function skuMeta(skuCode: string) {
    const sku = catalog?.skus.find((s) => s.sku === skuCode);
    const model = sku ? catalog?.models.find((m) => m.id === sku.modelId) : undefined;
    return { sku, model };
  }

  function set<K extends keyof Edited>(key: K, value: Edited[K]) {
    setEdited((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  return (
    <div className="os-detail-overlay" onClick={onClose} data-testid="pos-od-overlay">
      <aside className="os-detail" onClick={(e) => e.stopPropagation()} data-testid="pos-order-detail">
        {/* Head */}
        <div className="os-detail__head">
          <div>
            <div className="os-detail__eyebrow">Order · {laneLabel}</div>
            <div className="os-detail__title">#{order.so}</div>
            <div className="os-detail__sub">
              {order.customer.name || "Walk-in"} · placed {daysAgo(order.placedAt)} by{" "}
              {staffName ?? "—"}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close" data-testid="pos-od-close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="os-detail__body">
          {/* Items — read-only in every lane (design §7) */}
          <section className="os-section">
            <h4 className="os-section__title">
              Items <span>{pieces} pieces</span>
            </h4>
            <div className="os-items">
              {rows.map((row, i) => {
                if (row.kind === "sofa_build") {
                  const { model } = skuMeta(row.lines[0]?.sku ?? "");
                  return (
                    <div key={row.buildKey} className="os-item">
                      <div
                        className="os-item__photo"
                        style={model?.photoUrl ? { backgroundImage: `url(${model.photoUrl})` } : undefined}
                      >
                        {!model?.photoUrl && <span style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--fg-muted)" }}>▦</span>}
                      </div>
                      <div className="os-item__body">
                        <div className="os-item__name">{model?.name ?? "Sofa"}</div>
                        <div className="os-item__detail">{row.summary}</div>
                      </div>
                      <div className="os-item__qty">×{row.qty}</div>
                      <div className="os-item__price">
                        <sup>RM</sup>
                        {rm(row.totalPrice)}
                      </div>
                    </div>
                  );
                }
                const line = row.line;
                const { sku, model } = skuMeta(line.sku);
                const tag = lineTag(line.attrs);
                const free = tag === "GWP" || tag === "Free item";
                return (
                  <div key={line.id ?? i} className="os-item">
                    <div
                      className="os-item__photo"
                      style={model?.photoUrl ? { backgroundImage: `url(${model.photoUrl})` } : undefined}
                    >
                      {!model?.photoUrl && <span style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--fg-muted)" }}>▦</span>}
                    </div>
                    <div className="os-item__body">
                      <div className="os-item__name">{model?.name ?? line.sku}</div>
                      <div className="os-item__detail">
                        {[sku?.variant, line.sku].filter(Boolean).join(" · ")}
                        {tag ? ` · ${tag}` : ""}
                      </div>
                    </div>
                    <div className="os-item__qty">×{line.qty}</div>
                    <div className="os-item__price">
                      {free ? (
                        "FREE"
                      ) : (
                        <>
                          <sup>RM</sup>
                          {rm(line.unitPrice * line.qty)}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {(order.addons ?? []).map((a) => {
                const label =
                  DELIVERY_ADDON_LABELS[a.addonKey] ??
                  catalog?.addons.find((x) => x.key === a.addonKey)?.name ??
                  a.addonKey;
                const size =
                  typeof a.attrs === "object" && a.attrs !== null && typeof (a.attrs as { size?: unknown }).size === "string"
                    ? ((a.attrs as { size: string }).size)
                    : null;
                return (
                  <div key={a.id} className="os-item">
                    <div className="os-item__photo">
                      <span style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--fg-muted)" }}>+</span>
                    </div>
                    <div className="os-item__body">
                      <div className="os-item__name">{label}</div>
                      {size && <div className="os-item__detail">{size}</div>}
                    </div>
                    <div className="os-item__qty">×{a.qty}</div>
                    <div className="os-item__price">
                      <sup>RM</sup>
                      {rm(a.unitPrice * a.qty)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="os-items__total">
              <span>Subtotal</span>
              <span>
                <sup>RM</sup>
                {rm(lineSub)}
              </span>
            </div>
            {addonSub > 0 && (
              <div className="os-items__total">
                <span>Add-ons</span>
                <span>
                  <sup>RM</sup>
                  {rm(addonSub)}
                </span>
              </div>
            )}
            {stair > 0 && (
              <div className="os-items__total">
                <span>Stair carry</span>
                <span>
                  <sup>RM</sup>
                  {rm(stair)}
                </span>
              </div>
            )}
            <div className="os-items__total">
              <span>Total</span>
              <span>
                <sup>RM</sup>
                {rm(total)}
              </span>
            </div>
            {/* 0231 — add-product P1: place lane only; the proceed lane gets
                the P3 submission flow instead. */}
            {scope.canAddProduct && (
              <div className="os-detail__cta" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setAddErr(null);
                    setAddOpen(true);
                  }}
                  data-testid="pos-od-add-product"
                >
                  <Plus size={16} />
                  Add product
                </button>
              </div>
            )}
          </section>

          {/* Customer */}
          <section className="os-section">
            <h4 className="os-section__title">
              Customer
              {customerInfoOk ? (
                <span className="os-tick">
                  <Check size={11} strokeWidth={2.5} />
                  Complete
                </span>
              ) : (
                <span className="os-tick is-bad">
                  <AlertTriangle size={11} strokeWidth={2.5} />
                  Incomplete
                </span>
              )}
            </h4>
            <div className="os-grid">
              <label className="os-field">
                <span>Full name</span>
                <input
                  value={edited.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Customer's full name"
                  disabled={!scope.canEditDetails}
                  data-testid="pos-od-name"
                />
              </label>
              <label className="os-field">
                <span>Phone</span>
                <input
                  value={edited.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="012-3456789"
                  disabled={!scope.canEditDetails}
                  data-testid="pos-od-phone"
                />
              </label>
              <label className="os-field os-field--span">
                <span>Email</span>
                <input
                  value={edited.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="customer@example.com"
                  disabled={!scope.canEditDetails}
                  data-testid="pos-od-email"
                />
              </label>
            </div>
          </section>

          {/* Delivery */}
          <section className="os-section">
            <h4 className="os-section__title">
              Delivery
              {addressOk && dateOk ? (
                <span className="os-tick">
                  <Check size={11} strokeWidth={2.5} />
                  Set
                </span>
              ) : (
                <span className="os-tick is-bad">
                  <AlertTriangle size={11} strokeWidth={2.5} />
                  Missing
                </span>
              )}
            </h4>
            {/* 0230 — same cascading MY address picker as the wizard (the two
                forms are ONE format now). Legacy composed-only orders seed
                Line 1 with the saved string. */}
            <fieldset
              disabled={!scope.canEditDetails}
              style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
              data-testid="pos-od-address-fields"
            >
              <MYAddressFields
                data={{
                  addressLine1: edited.addressLine1,
                  addressLine2: edited.addressLine2,
                  addressState: edited.addressState,
                  addressCity: edited.addressCity,
                  addressPostcode: edited.addressPostcode,
                }}
                onChange={(patch) => setEdited((prev) => (prev ? { ...prev, ...patch } : prev))}
              />
            </fieldset>
            {legacyFallback && !addressDirty && (
              <p className="t-tiny" style={{ color: "var(--fg-muted)", marginTop: 8 }}>
                Saved as free text — pick State / City / Postcode to upgrade it to the
                structured format.
              </p>
            )}
            <div className="os-grid" style={{ marginTop: 12 }}>
              <label className="os-field">
                <span>Delivery date</span>
                <input
                  type="date"
                  value={edited.deliveryDate}
                  min={minLeadDays > 0 ? minDate : undefined}
                  onChange={(e) => set("deliveryDate", e.target.value)}
                  disabled={!scope.editablePlaced}
                  data-testid="pos-od-ddate"
                />
              </label>
              <label className="os-field">
                <span>Proceed date</span>
                <input
                  type="date"
                  value={edited.proceedDate}
                  min={todayMY}
                  max={edited.deliveryDate || undefined}
                  onChange={(e) => set("proceedDate", e.target.value)}
                  disabled={!scope.editablePlaced || !paidOk}
                  data-testid="pos-od-pdate"
                />
                {scope.editablePlaced && !paidOk && (
                  <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
                    Set the proceed date once ≥50% of the total is paid.
                  </span>
                )}
              </label>
            </div>
          </section>

          {/* Payment */}
          <section className="os-section">
            <h4 className="os-section__title">
              Payment
              {paidOk ? (
                <span className="os-tick">
                  <Check size={11} strokeWidth={2.5} />
                  ≥ 50% paid
                </span>
              ) : (
                <span className="os-tick is-bad">
                  <AlertTriangle size={11} strokeWidth={2.5} />
                  Below 50%
                </span>
              )}
            </h4>
            <div className="os-pay">
              <div className="os-pay__row">
                <span>Paid so far</span>
                <span>
                  <sup>RM</sup>
                  {rm(paid)} <em>/ {rm(total)}</em>
                </span>
              </div>
              <div className="os-pay__bar">
                <span className="os-pay__bar-fill" style={{ width: pct + "%" }}></span>
                <span className="os-pay__bar-mark" title="50% threshold"></span>
              </div>
              <div className="os-pay__legend">
                <span>{pct}% collected</span>
                <span>Threshold · 50%</span>
              </div>

              {scope.canEditDetails && outstanding > 0 && (
                <div
                  style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}
                  data-testid="pos-od-payform"
                >
                  <div className="os-detail__cta">
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => setStripeOpen(true)}
                      data-testid="pos-od-collect-online"
                    >
                      <QrCode size={16} />
                      Collect online — QR / link
                    </button>
                  </div>
                  <div className="os-stripe__divider">or record a manual payment</div>
                  <div className="os-field">
                    <span>Payment method</span>
                    <div className="os-paychips">
                      {payMethods.map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          className={`os-paychip ${method === m.key ? "is-on" : ""}`}
                          onClick={() => setMethod(m.key)}
                          data-testid={`pos-od-method-${m.key}`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="os-field">
                    <span>Record additional payment (RM)</span>
                    <input
                      type="number"
                      min={0}
                      max={outstanding}
                      value={amount || ""}
                      placeholder="0"
                      onChange={(e) =>
                        setAmount(Math.min(outstanding, Math.max(0, parseFloat(e.target.value) || 0)))
                      }
                      data-testid="pos-od-pay-amount"
                    />
                  </label>
                  <label className="os-field">
                    <span>Approval code</span>
                    <input
                      type="text"
                      placeholder="e.g. AC-7821934"
                      value={approvalCode}
                      onChange={(e) => setApprovalCode(e.target.value)}
                      data-testid="pos-od-pay-code"
                    />
                  </label>
                  <div className="os-field">
                    <span>Payment slip{slipRequired ? " *" : ""}</span>
                    {slip ? (
                      <div className="os-slip">
                        <img src={slip.dataUrl} alt="Payment slip" />
                        <button
                          className="os-slip__remove"
                          onClick={() => setSlip(null)}
                          aria-label="Remove"
                          type="button"
                        >
                          <X size={14} />
                        </button>
                        <span className="os-slip__badge">
                          <CheckCircle2 size={12} />
                          Attached
                        </span>
                      </div>
                    ) : (
                      <div className="os-slip__actions">
                        <label className="os-slip__btn">
                          <Paperclip size={16} />
                          <span>Attach file</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              handleSlipFile(e.target.files);
                              e.target.value = "";
                            }}
                            data-testid="pos-od-slip-file"
                          />
                        </label>
                        <label className="os-slip__btn os-slip__btn--cam">
                          <Camera size={16} />
                          <span>Open camera</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => {
                              handleSlipFile(e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                  {payErr && <div className="os-detail__err">Payment failed: {payErr}</div>}
                  <div className="os-detail__cta">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={!canRecord}
                      onClick={handleRecordPayment}
                      data-testid="pos-od-record"
                    >
                      {uploading
                        ? "Uploading…"
                        : topUpMut.isPending
                          ? "Recording…"
                          : "Record payment"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        {scope.editablePlaced && (
          <div className="os-detail__foot" data-testid="pos-od-foot-place">
            <div className="os-checklist" data-testid="pos-od-checklist">
              <ChecklistChip ok={customerInfoOk} label="Customer info" />
              <ChecklistChip ok={addressOk} label="Delivery address" />
              <ChecklistChip ok={dateOk} label="Delivery date" />
              <ChecklistChip ok={paidOk} label="≥ 50% paid" />
              <ChecklistChip ok={proceedDateOk} label="Proceed date" />
            </div>
            {saveErr && <div className="os-detail__err">Save failed: {saveErr}</div>}
            {proceedErr && <div className="os-detail__err">Proceed failed: {proceedErr}</div>}
            <div className="os-detail__cta">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!dirty || busy}
                onClick={handleSave}
                data-testid="pos-od-save"
              >
                <Save size={16} />
                {updateMut.isPending ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!allOk || busy}
                onClick={handleProceed}
                data-testid="pos-od-proceed"
              >
                Move to Proceed
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {scope.editableProceed &&
          (scope.canUnproceed || dirty || saveErr || unproceedErr ? (
            <div className="os-detail__foot" data-testid="pos-od-foot-proceed">
              {saveErr && <div className="os-detail__err">Save failed: {saveErr}</div>}
              {unproceedErr && (
                <div className="os-detail__err">Couldn&rsquo;t move back: {unproceedErr}</div>
              )}
              <div className="os-detail__cta">
                {scope.canUnproceed && (
                  <span className="os-detail__hint">
                    Move back to edit · only before the proceed date
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={!dirty || busy}
                  onClick={handleSave}
                  data-testid="pos-od-save"
                >
                  <Save size={16} />
                  {updateMut.isPending ? "Saving…" : "Save changes"}
                </button>
                {scope.canUnproceed && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={handleUnproceed}
                    data-testid="pos-od-unproceed"
                  >
                    <ArrowLeft size={16} />
                    {unproceedMut.isPending ? "Moving…" : "Move to Order placed"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="os-detail__foot os-detail__foot--info" data-testid="pos-od-foot-locked">
              <Info size={16} strokeWidth={1.75} />
              Locked · HQ operation handling
            </div>
          ))}

        {scope.isDeliveredLane && (
          <div className="os-detail__foot os-detail__foot--info" data-testid="pos-od-foot-delivered">
            <PackageCheck size={16} strokeWidth={1.75} />
            Delivered · managed in backend portal.
          </div>
        )}

        {stripeOpen && (
          <StripeCollectModal
            orderId={order.id}
            so={order.so}
            total={total}
            paid={paid}
            customerName={order.customer.name}
            customerPhone={order.customer.phone ?? null}
            onClose={() => setStripeOpen(false)}
          />
        )}

        {addOpen && catalog && (
          <AddProductOverlay
            order={order}
            catalog={catalog}
            busy={addLinesMut.isPending}
            error={addErr}
            onPick={handleAddProduct}
            onClose={() => setAddOpen(false)}
          />
        )}
      </aside>
    </div>
  );
}

function ChecklistChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`os-check ${ok ? "is-ok" : ""}`}>
      {ok ? <Check size={16} strokeWidth={2.25} /> : <Circle size={16} strokeWidth={2} />}
      {label}
    </span>
  );
}
