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
  Minus,
  PackageCheck,
  Paperclip,
  Pencil,
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
  type OrderAddon,
  type OrderLine,
  type ProductModelDto,
  type TopUpOrderInput,
  type UpdateOrderInput,
} from "@carres/shared";
import DownloadSalesOrderButton from "@/components/DownloadSalesOrderButton";
import MYAddressFields from "@/components/MYAddressFields";
import { composeAddress } from "@/data/malaysia-postcodes";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { addonSubtotal, floorSurcharge, lineSubtotal } from "@/lib/order-totals";
import {
  useAddOrderLines,
  useCancelOrderChangeRequest,
  useCatalog,
  useEditOrderAddon,
  useOrder,
  useOrderChangeRequests,
  useProceedOrder,
  useReplaceOrderLines,
  useSubmitOrderChangeRequest,
  useUpdateOrderChangeRequest,
  useTopUpOrder,
  useUnproceedOrder,
  useUpdateOrder,
} from "@/lib/queries";
import { groupSofaBuildLines, type SofaBuildGroupRow } from "@/lib/sofa-build-display";
import { newWizardSessionId, uploadAttachment } from "@/lib/storage";
import { newLocalId } from "../new-order/configurators";
import { composeDisposalSizeSummary, type DraftAddon, type DraftLine } from "../new-order/draft";
import { lineConfigBits } from "../new-order/special-addons-picker";
import AddProductOverlay from "./AddProductOverlay";
import { buildCatalogIndex } from "./catalog-index";
import { getOrderEditScope, todayMYISO } from "./order-edit-scope";
import { draftFromOrderLine, draftFromSofaGroup, orderLineEditKind } from "./order-line-edit";
import PosConfigurePage from "./PosConfigurePage";
import SofaConfigurePage from "./SofaConfigurePage";
import StripeCollectModal from "./StripeCollectModal";
import GuaranteeCoverStrip from "@/components/GuaranteeCoverStrip";

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

// lineConfigBits — the ONE-muted-line config formula — moved to
// special-addons-picker (0258 follow-up): the SO PDF prints the SAME line now.

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
  if (code === "pending_exists")
    return "A product change is already pending on this order — cancel it first.";
  if (code === "use_direct_add")
    return "This order can still take products directly — use Add product instead.";
  if (code && code.startsWith("pwp_"))
    return "This promo price isn't eligible on this order — reconfigure and retry.";
  if (code === "sofa_price_drift")
    return "The sofa price changed since this screen loaded — rebuild and retry.";
  if (code === "special_price_drift" || code === "options_price_drift")
    return "Prices changed since this screen loaded — reopen the product and reconfigure.";
  return e instanceof Error ? e.message : "Could not add the product.";
}

/** 0255 — line-EDIT failure copy. `downsell_blocked` keeps the server's
 *  message (it carries the real RM figures). */
function replaceErrorCopy(e: unknown): string {
  const code = errCode(e);
  if (code === "downsell_blocked")
    return e instanceof Error && e.message
      ? e.message
      : "The new configuration is below the original price — edits can only upgrade the order.";
  if (code === "wrong_status")
    return "Products can only be edited while the order is in Order placed.";
  if (code === "line_not_editable") return "Free, promo and bundle items can't be edited.";
  if (code === "promo_entitlement_broken")
    return (
      "This item backs a promo or printed voucher on this order — the new configuration " +
      "would no longer qualify for it. Cancel the promo with HQ first."
    );
  if (code === "line_not_found")
    return "The item is no longer on this order — refresh and retry.";
  if (code === "partial_sofa_group")
    return "This sofa must be edited as a whole build — refresh and retry.";
  if (code === "mixed_category_lines")
    return "Sofa can't mix with mattress / bed frame in one order.";
  if (code === "unknown_or_inactive_sku")
    return "This product is no longer available — refresh and retry.";
  if (code === "sofa_price_drift")
    return "The sofa price changed since this screen loaded — rebuild and retry.";
  if (code === "special_price_drift" || code === "options_price_drift")
    return "Prices changed since this screen loaded — reopen the product and reconfigure.";
  return e instanceof Error ? e.message : "Could not update the product.";
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
  // 2026-07-19 (Loo, BD portal) — internal roles get the order's audit
  // history inline (order_history already rides GET /api/orders/:id). Store
  // logins keep the drawer exactly as before.
  const viewerRole = useAuth((s) => s.role);
  const internalViewer =
    viewerRole === "principal" ||
    viewerRole === "operation" ||
    viewerRole === "finance" ||
    viewerRole === "bd";

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
  // 0255 — line EDIT (Loo 2026-07-25): the pencil re-opens the item's
  // configure surface seeded with its stored configuration; Save replaces
  // the row(s) server-side, up-sell only. 0257 — the SAME pencil works on
  // the proceed lane, where Save files a replace_lines change request
  // (HQ approves) instead of writing directly; `targetLines` is the display
  // snapshot the operator's old→new approval view renders.
  const replaceMut = useReplaceOrderLines(id);
  const [editing, setEditing] = useState<{
    kind: "bed_mattress" | "sofa_build";
    model: ProductModelDto;
    draft: DraftLine;
    targetIds: string[];
    targetLines: Array<{ id?: string; sku: string; qty: number; unitPrice?: number; label?: string }>;
    oldTotal: number;
  } | null>(null);
  // 0258 — service add-on edit (qty + per-unit sizes): place lane applies
  // directly; the proceed lane files an edit_addon change request.
  const editAddonMut = useEditOrderAddon(id);
  const [addonEditing, setAddonEditing] = useState<{
    id: string;
    name: string;
    oldQty: number;
    oldSize: string | null;
    qty: number;
    sizes: string[];
    sizeOptions: string[];
  } | null>(null);
  const [addonErr, setAddonErr] = useState<string | null>(null);
  const editIndex = useMemo(
    () =>
      catalog
        ? buildCatalogIndex(catalog, catalog.fabricTierConfig, catalog.modelFabricTierOverrides)
        : null,
    [catalog],
  );
  // PWP-preview context inside the configure surface = the order's OTHER
  // rows (the edited row excluded — CatalogStep's edit convention).
  const editCartLines = useMemo<DraftLine[]>(() => {
    if (!editing) return [];
    const excluded = new Set(editing.targetIds);
    return (order?.lines ?? [])
      .filter((l) => !(l.id && excluded.has(l.id)))
      .map((l) => ({
        localId: l.id ?? newLocalId(),
        sku: l.sku,
        qty: l.qty,
        attrs: l.attrs,
        unitPrice: l.unitPrice,
        label: l.sku,
      }));
  }, [editing, order?.lines]);
  // 0233 — P3 proceed-lane submission + pending banner.
  const changeReqQ = useOrderChangeRequests(id);
  const submitChangeMut = useSubmitOrderChangeRequest(id);
  const cancelChangeMut = useCancelOrderChangeRequest(id);
  const updateChangeMut = useUpdateOrderChangeRequest(id);
  // 0234 — View request modal + edit-in-place mode for the overlay.
  const [viewChangeOpen, setViewChangeOpen] = useState(false);
  const [editingChange, setEditingChange] = useState(false);
  const changeRequests = changeReqQ.data?.requests ?? [];
  const pendingChange = changeRequests.find((r) => r.status === "pending") ?? null;
  const lastRejected = changeRequests.find((r) => r.status === "rejected") ?? null;

  async function handleSubmitChange(line: DraftLine) {
    setAddErr(null);
    try {
      // The preview unitPrice + label ride along for the operator's approval
      // view; the approval re-prices everything fresh server-side.
      await submitChangeMut.mutateAsync({
        kind: "add_lines",
        lines: [
          {
            sku: line.sku,
            qty: line.qty,
            attrs: line.attrs ?? null,
            unitPrice: line.unitPrice,
            label: line.label,
          },
        ],
        addons: [],
      });
      setAddOpen(false);
    } catch (e) {
      setAddErr(addErrorCopy(e));
    }
  }

  /** 0257 — service add-ons picked in the overlay's Services tab. Place lane
   *  applies directly; the proceed lane files (or edits) an add_lines change
   *  request — same doors as products, same one-pending rule. */
  async function handleAddServices(addons: DraftAddon[]) {
    setAddErr(null);
    const payloadAddons = addons.map((a) => ({
      addonKey: a.key,
      qty: a.qty,
      attrs: a.attrs ?? null,
      unitPrice: a.unitPrice,
      label: a.name,
    }));
    try {
      if (scope?.canAddProduct) {
        await addLinesMut.mutateAsync({ lines: [], addons: payloadAddons });
      } else if (editingChange && pendingChange) {
        await updateChangeMut.mutateAsync({
          requestId: pendingChange.id,
          input: { kind: "add_lines", lines: [], addons: payloadAddons },
        });
        setEditingChange(false);
      } else {
        await submitChangeMut.mutateAsync({ kind: "add_lines", lines: [], addons: payloadAddons });
      }
      setAddOpen(false);
    } catch (e) {
      setAddErr(addErrorCopy(e));
    }
  }

  async function handleCancelChange() {
    if (!pendingChange) return;
    setAddErr(null);
    try {
      await cancelChangeMut.mutateAsync(pendingChange.id);
      setViewChangeOpen(false);
    } catch (e) {
      setAddErr(addErrorCopy(e));
    }
  }

  /** 0234 — Edit-in-place: the overlay's pick REPLACES the pending payload. */
  async function handleEditChange(line: DraftLine) {
    if (!pendingChange) return;
    setAddErr(null);
    try {
      await updateChangeMut.mutateAsync({
        requestId: pendingChange.id,
        input: {
          kind: "add_lines",
          lines: [
            {
              sku: line.sku,
              qty: line.qty,
              attrs: line.attrs ?? null,
              unitPrice: line.unitPrice,
              label: line.label,
            },
          ],
          addons: [],
        },
      });
      setAddOpen(false);
      setEditingChange(false);
    } catch (e) {
      setAddErr(addErrorCopy(e));
    }
  }

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
        addons: [],
      });
      setAddOpen(false);
    } catch (e) {
      setAddErr(addErrorCopy(e));
    }
  }

  // ── 0255 line EDIT (0257: same pencil on the proceed lane → submission) ───
  function startEditLine(line: OrderLine) {
    if (!catalog || !line.id) return;
    const kind = orderLineEditKind(line, catalog);
    if (!kind) return;
    const sku = catalog.skus.find((s) => s.sku === line.sku);
    const model = sku ? catalog.models.find((m) => m.id === sku.modelId) : undefined;
    if (!model) return;
    setAddErr(null);
    setEditing({
      kind,
      model,
      draft: draftFromOrderLine(line),
      targetIds: [line.id],
      targetLines: [
        {
          id: line.id,
          sku: line.sku,
          qty: line.qty,
          unitPrice: line.unitPrice,
          label: [model.name, sku?.variant].filter(Boolean).join(" · "),
        },
      ],
      oldTotal: line.unitPrice * line.qty,
    });
  }

  function startEditGroup(row: SofaBuildGroupRow) {
    if (!catalog || !row.lines.every((l) => l.id)) return;
    const draft = draftFromSofaGroup(row, catalog);
    if (!draft) return;
    const sku = catalog.skus.find((s) => s.sku === draft.sku);
    const model = sku ? catalog.models.find((m) => m.id === sku.modelId) : undefined;
    if (!model) return;
    setAddErr(null);
    setEditing({
      kind: "sofa_build",
      model,
      draft,
      targetIds: row.lines.map((l) => l.id as string),
      targetLines: row.lines.map((l) => ({
        id: l.id as string,
        sku: l.sku,
        qty: l.qty,
        unitPrice: l.unitPrice,
        label: `${model.name} · ${row.spec}`,
      })),
      oldTotal: row.totalPrice,
    });
  }

  async function handleReplace(newLine: DraftLine) {
    if (!editing) return;
    const target = editing;
    setEditing(null);
    // Client precheck of THE rule (server re-enforces): edits only up-sell.
    const newTotal = newLine.unitPrice * newLine.qty;
    if (newTotal < target.oldTotal) {
      setAddErr(
        `The new configuration totals RM ${rm(newTotal)}, below the original ` +
          `RM ${rm(target.oldTotal)} — edits can only upgrade the order.`,
      );
      return;
    }
    const isBuild = Boolean((newLine.attrs as Record<string, unknown> | null)?.sofa_build);
    setAddErr(null);
    // 0257 — proceed lane: the same pencil files a replace_lines change
    // request (HQ approves → the server applies through the SAME replace
    // pipeline). The preview unitPrice + label always ride for the operator's
    // old→new view; on a BUILD they also feed the drift gate at approval.
    if (scope?.editableProceed) {
      try {
        await submitChangeMut.mutateAsync({
          kind: "replace_lines",
          targetLineIds: target.targetIds,
          targetLines: target.targetLines,
          line: {
            sku: newLine.sku,
            qty: newLine.qty,
            attrs: newLine.attrs ?? null,
            unitPrice: newLine.unitPrice,
            label: newLine.label,
          },
        });
      } catch (e) {
        setAddErr(addErrorCopy(e));
      }
      return;
    }
    try {
      // sku/qty/attrs go up — the client preview price stays local (server
      // catalog authority) EXCEPT on a sofa BUILD, whose preview unitPrice
      // feeds the server drift gate (same contract as add).
      await replaceMut.mutateAsync({
        targetLineIds: target.targetIds,
        line: {
          sku: newLine.sku,
          qty: newLine.qty,
          attrs: newLine.attrs ?? null,
          ...(isBuild ? { unitPrice: newLine.unitPrice } : {}),
        },
      });
    } catch (e) {
      setAddErr(replaceErrorCopy(e));
    }
  }

  // ── 0258 SERVICE add-on edit (qty + per-unit sizes; DELIVERY* locked) ─────
  function startEditAddon(a: OrderAddon, label: string) {
    if (!a.id) return;
    const cfg = catalog?.addons.find((x) => x.key === a.addonKey);
    const sizeOptions = cfg?.sizeOptions ?? [];
    const attrs = (a.attrs ?? {}) as { sizes?: unknown; size?: unknown };
    const rawSizes = Array.isArray(attrs.sizes)
      ? (attrs.sizes as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
    const sizes =
      sizeOptions.length > 0
        ? Array.from({ length: a.qty }, (_, i) =>
            rawSizes[i] ?? (a.qty === 1 && typeof attrs.size === "string" ? attrs.size : ""),
          )
        : [];
    setAddonErr(null);
    setAddonEditing({
      id: a.id,
      name: label,
      oldQty: a.qty,
      oldSize: typeof attrs.size === "string" ? attrs.size : null,
      qty: a.qty,
      sizes,
      sizeOptions,
    });
  }

  async function handleSaveAddon() {
    if (!addonEditing) return;
    const t = addonEditing;
    const needSizes = t.sizeOptions.length > 0;
    if (needSizes && (t.sizes.length !== t.qty || t.sizes.some((s) => !s))) return;
    const attrs = needSizes
      ? { sizes: t.sizes, size: composeDisposalSizeSummary(t.sizes) || undefined }
      : null;
    setAddonErr(null);
    try {
      if (scope?.editableProceed) {
        // Proceed lane — files an edit_addon change request (HQ approves).
        await submitChangeMut.mutateAsync({
          kind: "edit_addon",
          targetAddonId: t.id,
          qty: t.qty,
          attrs,
          label: t.name,
          oldQty: t.oldQty,
          oldSize: t.oldSize,
        });
      } else {
        await editAddonMut.mutateAsync({ addonId: t.id, input: { qty: t.qty, attrs } });
      }
      setAddonEditing(null);
    } catch (e) {
      setAddonErr(addErrorCopy(e));
    }
  }

  // Escape closes; body scroll locked while open (2990s parity).
  //
  // Is a screen open ON TOP of this drawer right now? `editing` holds the
  // configure screen's data, or null when it is closed; `stripeOpen` is the
  // Stripe modal. Both of those close themselves on Escape, so the drawer must
  // not also close — one Escape, one layer.
  //
  // It cannot be left to the child to stop us: the browser reaches `document`
  // (us) BEFORE `window` (the configure screens), so we always go first.
  // Full reasoning: docs/carry-forwards.md, entry
  // `escape-closes-every-layer-of-the-pos-order-drawer`.
  //
  // Do NOT add `addOpen` / `addonEditing` / `viewChangeOpen` here. They have no
  // Escape of their own, so gating on them leaves Escape doing NOTHING.
  const nestedSurfaceOpen = editing !== null || stripeOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !nestedSurfaceOpen) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, nestedSurfaceOpen]);

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
    return maxLeadDaysFor([...cats], catalog.earliestSellDays ?? 0);
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
  /** Building type (Loo 2026-07-19) — wizard-keyed, rides entry_data.fields.
   *  Read-only here: `set_order_address` doesn't carry entry_data. */
  const buildingType = (() => {
    const f = (order?.entryData as { fields?: Record<string, unknown> } | null)?.fields;
    const v = f?.["building_type"];
    return typeof v === "string" && v.trim() ? v : null;
  })();
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
      const sessionId = newWizardSessionId();
      let photoPaths: string[] = [];
      if (slip) {
        setUploading(true);
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
        idempotencyKey: sessionId,
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

  // 2026-07-25 (Loo) — every lane's footer ends with the customer-facing
  // Sales Order doc (same PDF the ThankYou page offers). The button hides
  // itself for partner/supplier; neither reaches this board, so the fallback
  // role only covers the pre-hydration frame.
  const viewSoBtn = (
    <div className="os-detail__cta" style={{ marginTop: 10 }}>
      <DownloadSalesOrderButton
        variant="pos"
        orderId={order.id}
        so={order.so}
        role={viewerRole ?? "dealer"}
      />
    </div>
  );

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
            {/* 2026-07-25 (Loo) — the official document number, not the 2990s
                `#` code: matches the Sales Order PDF + every ERP surface. */}
            <div className="os-detail__title">SO-{order.so}</div>
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
                  // 0255 — the pencil shows only when the group can round-trip
                  // (geometry stamps intact, no promo markers). 0257 — it also
                  // shows on the proceed lane (files a change request there;
                  // hidden while one is already pending).
                  const editable =
                    (scope.editablePlaced || (scope.editableProceed && !pendingChange)) &&
                    !!catalog &&
                    row.lines.every((l) => l.id) &&
                    draftFromSofaGroup(row, catalog) !== null;
                  return (
                    <div
                      key={row.buildKey}
                      className="os-item"
                      style={editable ? { gridTemplateColumns: "48px 1fr auto auto auto" } : undefined}
                    >
                      <div
                        className="os-item__photo"
                        style={model?.photoUrl ? { backgroundImage: `url(${model.photoUrl})` } : undefined}
                      >
                        {!model?.photoUrl && <span style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--fg-muted)" }}>▦</span>}
                      </div>
                      <div className="os-item__body">
                        <div className="os-item__name">{model?.name ?? "Sofa"}</div>
                        <div className="os-item__detail">{row.spec}</div>
                      </div>
                      <div className="os-item__qty">×{row.qty}</div>
                      <div className="os-item__price">
                        <sup>RM</sup>
                        {rm(row.totalPrice)}
                      </div>
                      {editable && (
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => startEditGroup(row)}
                          aria-label="Edit sofa build"
                          data-testid="pos-od-edit-build"
                        >
                          <Pencil size={16} strokeWidth={1.75} />
                        </button>
                      )}
                    </div>
                  );
                }
                const line = row.line;
                const { sku, model } = skuMeta(line.sku);
                const tag = lineTag(line.attrs);
                const detail = [sku?.variant, ...lineConfigBits(line.attrs), tag]
                  .filter(Boolean)
                  .join(" · ");
                const free = tag === "GWP" || tag === "Free item";
                // 0255 — pencil on configurator-backed rows (mattress/bedframe);
                // free/promo/bundle rows stay pencil-less. 0257 — the proceed
                // lane gets the same pencil (change request; hidden while one
                // is pending).
                const editable =
                  (scope.editablePlaced || (scope.editableProceed && !pendingChange)) &&
                  !!catalog &&
                  !!line.id &&
                  orderLineEditKind(line, catalog) !== null;
                return (
                  <div
                    key={line.id ?? i}
                    className="os-item"
                    style={editable ? { gridTemplateColumns: "48px 1fr auto auto auto" } : undefined}
                  >
                    <div
                      className="os-item__photo"
                      style={model?.photoUrl ? { backgroundImage: `url(${model.photoUrl})` } : undefined}
                    >
                      {!model?.photoUrl && <span style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--fg-muted)" }}>▦</span>}
                    </div>
                    <div className="os-item__body">
                      <div className="os-item__name">{model?.name ?? line.sku}</div>
                      {detail && <div className="os-item__detail">{detail}</div>}
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
                    {editable && (
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => startEditLine(line)}
                        aria-label="Edit item"
                        data-testid="pos-od-edit-line"
                      >
                        <Pencil size={16} strokeWidth={1.75} />
                      </button>
                    )}
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
                // 0258 — service add-ons get the pencil too (Loo: "service
                // sku need to be editable as well"); DELIVERY* rows are
                // server-computed and stay locked.
                const editable =
                  (scope.editablePlaced || (scope.editableProceed && !pendingChange)) &&
                  !DELIVERY_ADDON_LABELS[a.addonKey] &&
                  !!a.id;
                return (
                  <div
                    key={a.id}
                    className="os-item"
                    style={editable ? { gridTemplateColumns: "48px 1fr auto auto auto" } : undefined}
                  >
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
                    {editable && (
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => startEditAddon(a, label)}
                        aria-label={`Edit ${label}`}
                        data-testid="pos-od-edit-addon"
                      >
                        <Pencil size={16} strokeWidth={1.75} />
                      </button>
                    )}
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
            {/* 0233 — P3: proceed-lane submission (HQ approves before it
                lands) + the pending banner / rejection note. */}
            {scope.canSubmitLineChange && !pendingChange && (
              <div className="os-detail__cta" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setAddErr(null);
                    setAddOpen(true);
                  }}
                  data-testid="pos-od-submit-change"
                >
                  <Plus size={16} />
                  Submit product change
                </button>
              </div>
            )}
            {pendingChange && (
              <div
                style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}
                data-testid="pos-od-change-pending"
              >
                <span className="t-tiny" style={{ color: "var(--fg-muted)" }}>
                  {pendingChange.kind === "replace_lines"
                    ? "Item change pending HQ approval"
                    : pendingChange.kind === "edit_addon"
                      ? "Add-on change pending HQ approval"
                      : `Product change pending HQ approval · ${
                          (pendingChange.payload.lines ?? []).length +
                          (pendingChange.payload.addons ?? []).length
                        } item(s)`}
                </span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setViewChangeOpen(true)}
                  data-testid="pos-od-change-view"
                >
                  View request
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={cancelChangeMut.isPending}
                  onClick={handleCancelChange}
                  data-testid="pos-od-change-cancel"
                >
                  {cancelChangeMut.isPending ? "Cancelling…" : "Cancel request"}
                </button>
              </div>
            )}
            {!pendingChange && lastRejected?.decisionNote && (
              <p
                className="t-tiny"
                style={{ color: "var(--fg-muted)", marginTop: 8 }}
                data-testid="pos-od-change-rejected"
              >
                Last product change rejected · {lastRejected.decisionNote}
              </p>
            )}
            {replaceMut.isPending && (
              <p className="t-tiny" style={{ color: "var(--fg-muted)", marginTop: 8 }}>
                Updating item…
              </p>
            )}
            {addErr && !addOpen && !editing && (
              <div className="os-detail__err" style={{ marginTop: 8 }} data-testid="pos-od-items-err">
                {addErr}
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
            {/* 0261-0263 — the guarantee this customer bought, if any. Silent
                when there is none, so an ordinary order is unchanged. */}
            <GuaranteeCoverStrip orderId={order.id} />
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
            {buildingType && (
              <p
                className="t-tiny"
                style={{ color: "var(--fg-muted)", marginTop: 8 }}
                data-testid="pos-od-building-type"
              >
                Building type: {buildingType}
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

          {/* History — internal roles only (audit trail per SO). Newest first. */}
          {internalViewer && (order.history ?? []).length > 0 && (
            <section className="os-section" data-testid="pos-od-history">
              <h4 className="os-section__title">
                History <span>{(order.history ?? []).length} events</span>
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[...(order.history ?? [])]
                  .sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""))
                  .map((h) => (
                    <div key={h.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span
                        aria-hidden
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: "var(--c-orange)",
                          marginTop: 5,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>{h.text}</div>
                        <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 1 }}>
                          {new Date(h.occurredAt).toLocaleString("en-MY", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                          {h.byRole ? ` · ${h.byRole}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          )}
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
            {viewSoBtn}
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
              {viewSoBtn}
            </div>
          ) : (
            <div className="os-detail__foot" data-testid="pos-od-foot-locked">
              <div className="os-detail__foot--info">
                <Info size={16} strokeWidth={1.75} />
                Locked · HQ operation handling
              </div>
              {viewSoBtn}
            </div>
          ))}

        {scope.isDeliveredLane && (
          <div className="os-detail__foot" data-testid="pos-od-foot-delivered">
            <div className="os-detail__foot--info">
              <PackageCheck size={16} strokeWidth={1.75} />
              Delivered · managed in backend portal.
            </div>
            {viewSoBtn}
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

        {/* 0255 — line EDIT: the item's configure surface, seeded from its
            stored configuration (editLine), full-screen over the drawer (same
            z-nesting trick as AddProductOverlay). onAdd REPLACES the row(s)
            server-side; up-sell only. */}
        {editing && catalog && editIndex && (
          <div className="fixed inset-0 z-[110]" data-testid="pos-od-edit-surface">
            {editing.kind === "bed_mattress" ? (
              <PosConfigurePage
                key={editing.draft.localId}
                model={editing.model}
                meta={editIndex.meta.get(editing.model.id)}
                skus={editIndex.skusByModel.get(editing.model.id) ?? []}
                specialAddons={catalog.specialAddons}
                optionPools={catalog.optionPools}
                fabrics={catalog.fabrics}
                fabricTierConfig={catalog.fabricTierConfig}
                modelFabricTierOverrides={catalog.modelFabricTierOverrides}
                catalog={catalog}
                cartLines={editCartLines}
                editLine={editing.draft}
                onAdd={handleReplace}
                onClose={() => setEditing(null)}
              />
            ) : (
              <SofaConfigurePage
                key={editing.draft.localId}
                model={editing.model}
                meta={editIndex.meta.get(editing.model.id)}
                skus={editIndex.skusByModel.get(editing.model.id) ?? []}
                fabrics={editIndex.fabricsByModel.get(editing.model.id) ?? []}
                masterFabrics={catalog.fabrics}
                optionPools={catalog.optionPools}
                fabricTierConfig={catalog.fabricTierConfig}
                modelFabricTierOverrides={catalog.modelFabricTierOverrides}
                sofaCompartments={catalog.sofaCompartments ?? []}
                modelCompartments={(catalog.modelSofaCompartments ?? []).filter(
                  (mc) => mc.modelId === editing.model.id,
                )}
                sofaCombos={catalog.sofaCombos ?? []}
                catalog={catalog}
                cartLines={editCartLines}
                editLine={editing.draft}
                onAdd={handleReplace}
                onClose={() => setEditing(null)}
              />
            )}
          </div>
        )}

        {addOpen && catalog && (
          <AddProductOverlay
            order={order}
            catalog={catalog}
            busy={addLinesMut.isPending || submitChangeMut.isPending || updateChangeMut.isPending}
            error={addErr}
            onPick={
              scope.canAddProduct
                ? handleAddProduct
                : editingChange
                  ? handleEditChange
                  : handleSubmitChange
            }
            onPickServices={handleAddServices}
            serviceCta={scope.canAddProduct ? "Add to order" : "Submit for approval"}
            onClose={() => {
              setAddOpen(false);
              setEditingChange(false);
            }}
          />
        )}

        {/* 0258 — service add-on edit modal (qty + per-unit sizes). */}
        {addonEditing && (
          <div
            className="fixed inset-0 z-[120] grid place-items-center bg-base-900/55 p-4"
            onClick={() => setAddonEditing(null)}
            data-testid="pos-od-addon-modal"
          >
            <div
              className="w-full max-w-[400px] bg-white rounded-md shadow-md p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="kicker mb-1">Edit add-on</p>
              <h3 className="t-h4 mb-3">{addonEditing.name}</h3>
              <div className="flex items-center justify-between mb-1">
                <span className="t-small text-base-600">Quantity</span>
                <div className="flex items-center gap-1 border border-base-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    disabled={addonEditing.qty <= addonEditing.oldQty}
                    onClick={() =>
                      setAddonEditing((p) => {
                        if (!p) return p;
                        const qty = Math.max(p.oldQty, p.qty - 1);
                        return {
                          ...p,
                          qty,
                          sizes: p.sizeOptions.length > 0 ? p.sizes.slice(0, qty) : p.sizes,
                        };
                      })
                    }
                    className="w-8 h-8 flex items-center justify-center hover:bg-hovertint disabled:opacity-40"
                    aria-label="Decrease quantity"
                    data-testid="pos-od-addon-minus"
                  >
                    <Minus size={13} strokeWidth={2} />
                  </button>
                  <span className="font-mono text-[13px] w-6 text-center">{addonEditing.qty}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setAddonEditing((p) => {
                        if (!p) return p;
                        const qty = Math.min(99, p.qty + 1);
                        const sizes = p.sizeOptions.length > 0 ? [...p.sizes] : p.sizes;
                        if (p.sizeOptions.length > 0) {
                          while (sizes.length < qty) sizes.push("");
                        }
                        return { ...p, qty, sizes };
                      })
                    }
                    className="w-8 h-8 flex items-center justify-center hover:bg-hovertint"
                    aria-label="Increase quantity"
                    data-testid="pos-od-addon-plus"
                  >
                    <Plus size={13} strokeWidth={2} />
                  </button>
                </div>
              </div>
              <p className="t-tiny text-base-500 mb-3">
                Quantity can only stay or increase — reductions go through HQ.
              </p>
              {addonEditing.sizeOptions.length > 0 && (
                <div className="flex flex-col gap-1.5 mb-3">
                  {addonEditing.sizes.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="kicker text-base-400 flex-shrink-0 w-12">
                        {addonEditing.qty > 1 ? `Size ${i + 1}` : "Size"}
                      </span>
                      <select
                        value={s}
                        onChange={(e) =>
                          setAddonEditing((p) => {
                            if (!p) return p;
                            const sizes = [...p.sizes];
                            sizes[i] = e.target.value;
                            return { ...p, sizes };
                          })
                        }
                        aria-label={`${addonEditing.name} size${
                          addonEditing.qty > 1 ? ` (item ${i + 1})` : ""
                        }`}
                        className={`flex-1 h-8 px-2 rounded-lg border text-[12px] bg-white outline-none focus:border-primary ${
                          s ? "border-base-200" : "border-destructive/60"
                        }`}
                      >
                        <option value="">Select size…</option>
                        {addonEditing.sizeOptions.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
              {addonErr && (
                <p className="t-tiny text-danger mb-2" data-testid="pos-od-addon-err">
                  {addonErr}
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setAddonEditing(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={
                    editAddonMut.isPending ||
                    submitChangeMut.isPending ||
                    (addonEditing.sizeOptions.length > 0 && addonEditing.sizes.some((s) => !s))
                  }
                  onClick={handleSaveAddon}
                  data-testid="pos-od-addon-save"
                >
                  {scope.editableProceed ? "Submit for approval" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 0234 — View request: the submitted lines + edit/cancel actions. */}
        {viewChangeOpen && pendingChange && (
          <div
            className="fixed inset-0 z-[120] grid place-items-center bg-base-900/55 p-4"
            onClick={() => setViewChangeOpen(false)}
            data-testid="pos-od-change-modal"
          >
            <div
              className="w-full max-w-[440px] bg-white rounded-md shadow-md p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="kicker mb-1">
                {pendingChange.kind === "replace_lines"
                  ? "Item change · pending HQ approval"
                  : pendingChange.kind === "edit_addon"
                    ? "Add-on change · pending HQ approval"
                    : "Product change · pending HQ approval"}
              </p>
              {pendingChange.kind === "edit_addon" ? (
                <div data-testid="pos-od-change-editaddon">
                  <div className="flex items-center justify-between t-small text-base-500 py-1 line-through">
                    <span>
                      {(pendingChange.payload.label as string | undefined) ?? "Add-on"} ×
                      {pendingChange.payload.oldQty ?? "?"}
                      {pendingChange.payload.oldSize ? ` · ${pendingChange.payload.oldSize}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between t-small text-base-800 py-1">
                    <span>
                      → ×{pendingChange.payload.qty ?? "?"}
                      {typeof (pendingChange.payload.attrs as { size?: unknown } | null | undefined)
                        ?.size === "string"
                        ? ` · ${(pendingChange.payload.attrs as { size: string }).size}`
                        : ""}
                    </span>
                  </div>
                </div>
              ) : pendingChange.kind === "replace_lines" ? (
                <div data-testid="pos-od-change-replace">
                  {((pendingChange.payload.targetLines ?? []) as Array<{
                    sku?: string;
                    qty?: number;
                    unitPrice?: number;
                    label?: string;
                  }>).map((l, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between t-small text-base-500 py-1 line-through"
                    >
                      <span>
                        {l.label ?? l.sku} ×{l.qty ?? 1}
                      </span>
                      {typeof l.unitPrice === "number" && (
                        <span className="font-mono">RM {l.unitPrice.toLocaleString()}</span>
                      )}
                    </div>
                  ))}
                  {(() => {
                    const nl = (pendingChange.payload.line ?? {}) as {
                      sku?: string;
                      qty?: number;
                      unitPrice?: number;
                      label?: string;
                    };
                    return (
                      <div className="flex items-center justify-between t-small text-base-800 py-1">
                        <span>
                          → {nl.label ?? nl.sku} ×{nl.qty ?? 1}
                        </span>
                        {typeof nl.unitPrice === "number" && (
                          <span className="font-mono text-base-600">
                            ≈ RM {nl.unitPrice.toLocaleString()}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                ([
                  ...((pendingChange.payload.lines ?? []) as Array<{
                    sku?: string;
                    qty?: number;
                    unitPrice?: number;
                    label?: string;
                  }>),
                  ...((pendingChange.payload.addons ?? []) as Array<{
                    addonKey?: string;
                    qty?: number;
                    unitPrice?: number;
                    label?: string;
                  }>),
                ]).map((l, i) => (
                  <div key={i} className="flex items-center justify-between t-small text-base-800 py-1">
                    <span>
                      {l.label ?? ("sku" in l ? l.sku : (l as { addonKey?: string }).addonKey)} ×
                      {l.qty ?? 1}
                    </span>
                    {typeof l.unitPrice === "number" && (
                      <span className="font-mono text-base-600">
                        ≈ RM {l.unitPrice.toLocaleString()}
                      </span>
                    )}
                  </div>
                ))
              )}
              <p className="t-tiny text-base-500 mt-1">
                Submitted {new Date(pendingChange.requestedAt).toLocaleString()} · final prices
                re-derive from the live catalog at approval.
              </p>
              <div className="flex gap-2 justify-end mt-4">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setViewChangeOpen(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={cancelChangeMut.isPending}
                  onClick={handleCancelChange}
                >
                  Cancel request
                </button>
                {/* 0257/0258 — item/add-on changes edit by cancel + re-pencil
                    (the overlay can't seed them); only add requests edit
                    in place. */}
                {pendingChange.kind === "add_lines" && (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => {
                      setViewChangeOpen(false);
                      setEditingChange(true);
                      setAddErr(null);
                      setAddOpen(true);
                    }}
                    data-testid="pos-od-change-edit"
                  >
                    Edit request
                  </button>
                )}
              </div>
            </div>
          </div>
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
