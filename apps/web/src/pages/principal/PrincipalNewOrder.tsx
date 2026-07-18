import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type {
  Order,
  ProductModelDto,
  ProductSkuDto,
  RawCreateOrderInput,
} from "@carres/shared";
import { rm } from "@/lib/format-currency";
import { composeAddress } from "@/data/malaysia-postcodes";
import { extensionForMime, uploadDataUrl } from "@/lib/storage";
import {
  useCatalog,
  useOutlets,
  usePrincipalDealers,
  useRawCreateOrder,
  useSalespersons,
} from "@/lib/queries";
import {
  RAW_DRAFT_STORAGE_KEY,
  clearDraft,
  composeEmergency,
  emptyDraft,
  loadDraft,
  saveDraft,
  type DraftLine,
  type WizardDraft,
} from "../dealer/new-order/draft";
import { newLocalId } from "../dealer/new-order/configurators";
import Step3SignaturePayment from "../dealer/new-order/Step3SignaturePayment";
import CustomerStep from "../dealer/pos/CustomerStep";
import OrderSummaryRail from "../dealer/pos/OrderSummaryRail";
import PosConfigurePage from "../dealer/pos/PosConfigurePage";
import SofaConfigurePage from "../dealer/pos/SofaConfigurePage";
import ConfigureDrawer from "../dealer/pos/ConfigureDrawer";
import { buildCatalogIndex } from "../dealer/pos/catalog-index";
import { lineEditTarget } from "../dealer/pos/cart";

/**
 * MAINTAIN → New Order — the RAW Sales Order creator, rebuilt 2026-07-18 (Loo)
 * as a POS-STRUCTURE-PARITY flow. Same three steps as the POS Create Order —
 *   01 ITEMS    → SKU-search-first product entry (the ONLY part that differs
 *                 from the POS: type a SKU, the product's OWN configure page
 *                 opens with the variant preselected, so the spec fields —
 *                 fabric / divan / gap / leg height / specials — follow the
 *                 product). Lines stay price-EDITABLE + custom lines allowed.
 *   02 CUSTOMER → the POS CustomerStep VERBATIM (dealer pick, outlet /
 *                 salesperson, name autocomplete, demographics, MY address,
 *                 emergency, target date + add-ons) — with raw dates (no
 *                 lead-time floor, past dates OK, empty = TBD).
 *   03 CONFIRM  → the POS payment + signature layout, everything OPTIONAL
 *                 ("fill it if you have it") — no Stripe, no delivery-engine
 *                 inputs.
 * Submits via POST /api/orders/raw (extended): specs (line attrs), add-ons and
 * the full customer block persist; NO POS engine runs (PWP / free-gift /
 * delivery stay off — that is the point of the raw door).
 */

type Step = 1 | 2 | 3;

/** Raw drafts start with NO payment method picked (POS defaults "online" —
 *  here payment is optional, absence must be representable). */
function rawEmptyDraft(): WizardDraft {
  const d = emptyDraft();
  return { ...d, payment: { ...d.payment, method: "" } };
}

export default function PrincipalNewOrder() {
  const navigate = useNavigate();
  const dealersQ = usePrincipalDealers();
  const outletsQ = useOutlets();
  const salespersonsQ = useSalespersons();
  // Admin bundle — the FULL catalog (deactivated + unpriced + discontinued
  // models included): raw entry must reach every sku the business ever sold.
  const catalogQ = useCatalog({ admin: true });
  const createRaw = useRawCreateOrder();

  const [step, setStep] = useState<Step>(1);
  const [customerSubStep, setCustomerSubStep] = useState<0 | 3>(0);
  const [draft, setDraft] = useState<WizardDraft>(
    () => loadDraft(RAW_DRAFT_STORAGE_KEY) ?? rawEmptyDraft(),
  );
  const [submitted, setSubmitted] = useState<Order | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  /** Configure surface to open: a model + (optionally) the picked sku. */
  const [configure, setConfigure] = useState<{ modelId: string; skuId: string | null } | null>(
    null,
  );
  const [editingLine, setEditingLine] = useState<DraftLine | null>(null);
  /** In-progress unit-price edit strings keyed by localId, so partial input
   *  ("2.") doesn't fight the numeric DraftLine value. */
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  // Auto-save the raw draft (own sessionStorage slot — never the POS cart's).
  useEffect(() => {
    if (submitted) return;
    saveDraft(draft, RAW_DRAFT_STORAGE_KEY);
  }, [draft, submitted]);

  const catalog = catalogQ.data ?? null;
  const index = useMemo(
    () =>
      catalog
        ? buildCatalogIndex(catalog, catalog.fabricTierConfig, catalog.modelFabricTierOverrides)
        : null,
    [catalog],
  );
  const modelById = useMemo(
    () => new Map((catalog?.models ?? []).map((m) => [m.id, m])),
    [catalog],
  );
  const skuByCode = useMemo(
    () => new Map((catalog?.skus ?? []).map((s) => [s.sku, s])),
    [catalog],
  );

  // In-flow dealer pick (the POS CustomerStep dealer card — principal has no
  // JWT dealer). Outlet + salesperson lists follow the picked dealer.
  const pickableDealers = useMemo(
    () =>
      (dealersQ.data?.dealers ?? [])
        .filter((d) => d.status === "active")
        .map((d) => ({ id: d.id, name: d.name })),
    [dealersQ.data],
  );
  const actingDealerId = draft.actingDealerId ?? null;
  const outlets = useMemo(
    () =>
      actingDealerId
        ? (outletsQ.data?.outlets ?? []).filter((o) => o.dealerId === actingDealerId)
        : [],
    [outletsQ.data, actingDealerId],
  );
  const salespersons = useMemo(
    () =>
      actingDealerId
        ? (salespersonsQ.data?.salespersons ?? []).filter((s) => s.dealerId === actingDealerId)
        : [],
    [salespersonsQ.data, actingDealerId],
  );

  function pickDealer(id: string, name: string) {
    setDraft((d) => ({
      ...d,
      actingDealerId: id,
      actingDealerName: name,
      outletId: null,
      salespersonId: null,
    }));
  }

  // ── Items — SKU search over the FULL admin bundle ─────────────────────────
  const pickerResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q || !catalog) return [];
    return catalog.skus
      .filter((s) => {
        const model = modelById.get(s.modelId);
        return (
          s.sku.toLowerCase().includes(q) ||
          (model?.name.toLowerCase().includes(q) ?? false) ||
          (s.variant?.toLowerCase().includes(q) ?? false)
        );
      })
      .slice(0, 10);
  }, [pickerQuery, catalog, modelById]);

  function addLine(line: DraftLine) {
    setDraft((d) => ({ ...d, lines: [...d.lines, line] }));
  }

  function replaceEditedLine(line: DraftLine) {
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.localId === line.localId ? line : l)),
    }));
  }

  /** A search hit opens the SAME configure surface the POS card would — with
   *  the variant preselected — so the spec fields follow the product. Models
   *  without spec fields (service / orphan skus) add a plain editable row. */
  function openForSku(sku: ProductSkuDto) {
    setPickerQuery("");
    const model = modelById.get(sku.modelId);
    if (!model || model.category === "service") {
      addLine({
        localId: newLocalId(),
        sku: sku.sku,
        qty: 1,
        attrs: null,
        unitPrice: sku.price ?? 0,
        label: model ? `${model.name} · ${sku.variant}` : sku.variant,
      });
      return;
    }
    setConfigure({ modelId: model.id, skuId: sku.id });
  }

  function patchLine(localId: string, patch: Partial<DraftLine>) {
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.localId === localId ? { ...l, ...patch } : l)),
    }));
  }

  function removeLine(localId: string) {
    setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.localId !== localId) }));
  }

  function addCustomLine() {
    addLine({ localId: newLocalId(), sku: "", qty: 1, attrs: null, unitPrice: 0, label: "" });
  }

  const linesValid =
    draft.lines.length > 0 &&
    draft.lines.every((l) => l.sku.trim().length > 0 && l.qty > 0 && l.unitPrice >= 0);

  const total =
    draft.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0) +
    draft.addons.reduce((s, a) => s + a.unitPrice * a.qty, 0);

  const canCreate =
    !!actingDealerId &&
    draft.customer.name.trim().length >= 2 &&
    linesValid &&
    !createRaw.isPending &&
    !uploading;

  // ── Submit — the extended raw door ────────────────────────────────────────
  async function handleCreate() {
    if (!canCreate || !actingDealerId) return;
    setSubmitError(null);
    try {
      // Signature / slip are OPTIONAL here — upload only what was captured.
      let signaturePath: string | null = null;
      let paymentSlipPath: string | null = null;
      if (draft.wizardSessionId && (draft.signature || draft.payment.slip)) {
        setUploading(true);
        if (draft.signature) {
          signaturePath = await uploadDataUrl({
            dealerId: actingDealerId,
            wizardSessionId: draft.wizardSessionId,
            filename: "signature.png",
            dataUrl: draft.signature,
          });
        }
        if (draft.payment.slip) {
          paymentSlipPath = await uploadDataUrl({
            dealerId: actingDealerId,
            wizardSessionId: draft.wizardSessionId,
            filename: `payment-slip.${extensionForMime(draft.payment.slip.mime)}`,
            dataUrl: draft.payment.slip.dataUrl,
          });
        }
        setUploading(false);
      }

      const composedAddress = composeAddress({
        line1: draft.customer.addressLine1,
        line2: draft.customer.addressLine2,
        state: draft.customer.addressState,
        city: draft.customer.addressCity,
        postcode: draft.customer.addressPostcode,
      });
      const followUps = Object.fromEntries(
        Object.entries(draft.payment.followUps ?? {}).filter(([, v]) => v.trim()),
      );
      const customFields = Object.fromEntries(
        Object.entries(draft.customer.custom ?? {}).filter(([, v]) => v.trim()),
      );
      const hasEntryData = Object.keys(followUps).length > 0 || Object.keys(customFields).length > 0;

      const input: RawCreateOrderInput = {
        dealerId: actingDealerId,
        outletId: draft.outletId,
        salespersonId: draft.salespersonId,
        customer: {
          name: draft.customer.name.trim(),
          phone: draft.customer.phone.trim() || null,
          address: draft.customer.addressUnknown
            ? null
            : composedAddress || draft.customer.address.trim() || null,
          addressUnknown: draft.customer.addressUnknown,
          billing: draft.customer.billingSame ? null : draft.customer.billing.trim() || null,
          billingSame: draft.customer.billingSame,
          emergency: composeEmergency(draft.customer) || null,
          email: draft.customer.email.trim() || null,
          race: draft.customer.race || null,
          gender: draft.customer.gender || null,
          birthday: draft.customer.birthday || null,
        },
        deliveryDate: draft.delivery.dateTbd ? null : draft.delivery.date || null,
        proceedDate: draft.delivery.dateTbd ? null : draft.delivery.proceedDate || null,
        deliveryFloor: draft.delivery.floor,
        deliveryHasLift: draft.delivery.hasLift,
        deliveryStairItems: draft.delivery.stairItems,
        lines: draft.lines.map((l) => ({
          sku: l.sku.trim(),
          qty: l.qty,
          unitPrice: l.unitPrice,
          attrs: l.attrs,
        })),
        addons: draft.addons.map((a) => ({
          addonKey: a.key,
          qty: a.qty,
          unitPrice: a.unitPrice,
          attrs: a.attrs ?? null,
        })),
        paid: draft.paid,
        paymentMethod: draft.payment.method || null,
        approvalCode: draft.payment.approvalCode.trim() || null,
        installmentMonths:
          draft.payment.method === "installment" ? draft.payment.installmentMonths : null,
        signaturePath,
        paymentSlipPath,
        termsAccepted: draft.termsAccepted,
        ...(hasEntryData
          ? {
              entryData: {
                ...(Object.keys(followUps).length > 0 ? { payment: followUps } : {}),
                ...(Object.keys(customFields).length > 0 ? { fields: customFields } : {}),
              },
            }
          : {}),
      };

      const order = await createRaw.mutateAsync(input);
      clearDraft(RAW_DRAFT_STORAGE_KEY);
      setSubmitted(order);
    } catch (err) {
      setUploading(false);
      setSubmitError(err instanceof Error ? err.message : "Order creation failed");
    }
  }

  function startAnother() {
    setSubmitted(null);
    setSubmitError(null);
    setDraft(rawEmptyDraft());
    setPickerQuery("");
    setPriceDrafts({});
    setStep(1);
  }

  // ── Submitted card ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-full grid place-items-center p-8">
        <div className="w-full max-w-md bg-card border border-base-200 rounded-lg shadow-sm p-7 text-center">
          <p className="t-micro text-base-400">Maintain · New order</p>
          <h1 className="t-h2 mt-1">Order SO-{submitted.so} created</h1>
          <p className="t-small text-base-500 mt-2">
            {submitted.customer.name} · {submitted.lines?.length ?? 0} line
            {(submitted.lines?.length ?? 0) === 1 ? "" : "s"} · saved exactly as entered.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button type="button" className="btn-secondary" onClick={() => navigate("/operation/orders")}>
              View orders
            </button>
            <button type="button" className="btn-primary" onClick={startAnother}>
              Create another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Configure overlay routing (same surfaces as the POS CatalogStep) ──────
  const overlay = (() => {
    if (!catalog || !index) return null;
    const editSku = editingLine ? skuByCode.get(editingLine.sku) : null;
    const editModel = editSku ? modelById.get(editSku.modelId) ?? null : null;
    const activeModel: ProductModelDto | null = editingLine
      ? editModel
      : configure
        ? modelById.get(configure.modelId) ?? null
        : null;
    if (!activeModel) return null;
    const editing = editingLine ?? undefined;
    const emitLine = editing ? replaceEditedLine : addLine;
    const closeConfigure = () => {
      setConfigure(null);
      setEditingLine(null);
    };
    const offered = (catalog.modelSofaCompartments ?? []).filter(
      (mc) => mc.modelId === activeModel.id,
    );
    const initialSkuId = editing ? undefined : configure?.skuId ?? undefined;
    // NOTE: no `catalog`/PWP props on these mounts — the raw door runs no PWP
    // engine, so the voucher rail stays hidden by construction.
    if (activeModel.category === "mattress" || activeModel.category === "bedframe") {
      return (
        <PosConfigurePage
          key={editing?.localId ?? activeModel.id}
          model={activeModel}
          meta={index.meta.get(activeModel.id)}
          skus={index.skusByModel.get(activeModel.id) ?? []}
          specialAddons={catalog.specialAddons}
          optionPools={catalog.optionPools}
          fabrics={catalog.fabrics}
          fabricTierConfig={catalog.fabricTierConfig}
          modelFabricTierOverrides={catalog.modelFabricTierOverrides}
          editLine={editing}
          initialSkuId={initialSkuId}
          onAdd={emitLine}
          onClose={closeConfigure}
        />
      );
    }
    if (
      activeModel.category === "sofa" &&
      (offered.length > 0 ||
        Boolean(editing && lineEditTarget(editing, catalog) === "sofa_build"))
    ) {
      return (
        <SofaConfigurePage
          key={editing?.localId ?? activeModel.id}
          model={activeModel}
          meta={index.meta.get(activeModel.id)}
          skus={index.skusByModel.get(activeModel.id) ?? []}
          fabrics={index.fabricsByModel.get(activeModel.id) ?? []}
          masterFabrics={catalog.fabrics}
          optionPools={catalog.optionPools}
          fabricTierConfig={catalog.fabricTierConfig}
          modelFabricTierOverrides={catalog.modelFabricTierOverrides}
          sofaCompartments={catalog.sofaCompartments ?? []}
          modelCompartments={offered}
          sofaCombos={catalog.sofaCombos ?? []}
          editLine={editing}
          onAdd={emitLine}
          onClose={closeConfigure}
        />
      );
    }
    if (editing) return null;
    return (
      <ConfigureDrawer
        model={activeModel}
        meta={index.meta.get(activeModel.id)}
        skus={index.skusByModel.get(activeModel.id) ?? []}
        fabrics={index.fabricsByModel.get(activeModel.id) ?? []}
        fabricTierConfig={catalog.fabricTierConfig}
        modelFabricTierOverrides={catalog.modelFabricTierOverrides}
        sofaCompartments={catalog.sofaCompartments}
        modelSofaCompartments={catalog.modelSofaCompartments}
        sofaCombos={catalog.sofaCombos}
        specialAddons={catalog.specialAddons}
        initialSkuId={initialSkuId}
        onAdd={addLine}
        onClose={closeConfigure}
      />
    );
  })();

  const STEPS: Array<{ n: Step; label: string }> = [
    { n: 1, label: "Items" },
    { n: 2, label: "Customer" },
    { n: 3, label: "Confirm" },
  ];

  return (
    <div
      className="pos-proto flex flex-col"
      style={{ height: "100vh", background: "var(--pos-bg)" }}
    >
      {/* Top bar — POS-parity step strip, portal-shell edition (no wordmark /
          staff chip: the PortalSidebar is already beside this page). */}
      <header className="pos-topbar" style={{ height: 56, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <span className="pos-topbar__crumb" style={{ borderLeft: "none", paddingLeft: 0, marginLeft: 0 }}>
            Maintain · New Sales Order
          </span>
          <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>
            Raw creation — no POS gates; saved exactly as entered
          </span>
        </div>
        <div className="pos-topbar__center">
          {STEPS.map((s, i) => {
            const clickable = s.n < step;
            return (
              <button
                key={s.n}
                type="button"
                onClick={() => clickable && setStep(s.n)}
                disabled={!clickable && s.n !== step}
                aria-current={step === s.n ? "step" : undefined}
                data-testid={`raw-step-${s.n}`}
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
          {draft.lines.length > 0 && (
            <span className="pos-topbar__count" data-testid="raw-topbar-count">
              {draft.lines.length} line{draft.lines.length === 1 ? "" : "s"} · {rm(total)}
            </span>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {!catalog ? (
          <div className="h-full grid place-items-center">
            <p className="text-sm text-muted-foreground">
              {catalogQ.error
                ? `Couldn't load catalog: ${(catalogQ.error as Error).message}`
                : "Loading catalog…"}
            </p>
          </div>
        ) : step === 1 ? (
          <div key={1} className="page-shell h-full overflow-hidden">
            <div className="handover">
              <div className="handover__left">
                <div className="handover__title-row">
                  <div>
                    <span className="phase-banner">
                      <span className="phase-banner__dot" />
                      Step 1 of 3 · Items
                    </span>
                    <h1 className="handover__title">Search SKU</h1>
                  </div>
                </div>
                <p className="handover__sub">
                  Type a SKU, model or variant — picking a product opens its configure page
                  (specs follow the product). Prices stay editable; free-text custom lines
                  allowed.
                </p>

                {/* SKU search */}
                <div style={{ position: "relative", marginBottom: 22 }}>
                  <Search
                    size={15}
                    strokeWidth={1.75}
                    style={{
                      position: "absolute",
                      left: 14,
                      top: 13,
                      color: "var(--fg-muted)",
                      pointerEvents: "none",
                    }}
                  />
                  <input
                    type="search"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Search SKU / model / variant… (includes deactivated + unpriced)"
                    data-testid="raw-picker"
                    style={{
                      width: "100%",
                      padding: "10px 14px 10px 38px",
                      borderRadius: 999,
                      border: "1.5px solid var(--line)",
                      background: "var(--pos-panel)",
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                  {pickerResults.length > 0 && (
                    <ul
                      style={{
                        position: "absolute",
                        zIndex: 10,
                        marginTop: 4,
                        width: "100%",
                        background: "var(--pos-panel)",
                        border: "1px solid var(--line)",
                        borderRadius: 12,
                        boxShadow: "0 12px 32px rgba(34,31,32,0.12)",
                        overflow: "hidden",
                        listStyle: "none",
                        padding: 0,
                      }}
                    >
                      {pickerResults.map((s) => {
                        const model = modelById.get(s.modelId);
                        return (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => openForSku(s)}
                              data-testid={`raw-pick-${s.sku}`}
                              style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "baseline",
                                gap: 12,
                                padding: "9px 14px",
                                textAlign: "left",
                                fontSize: 13,
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.background = "var(--pos-rail)")
                              }
                              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                            >
                              <span
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 12,
                                  flexShrink: 0,
                                }}
                              >
                                {s.sku}
                              </span>
                              <span
                                style={{
                                  color: "var(--fg-muted)",
                                  fontSize: 12,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  flex: 1,
                                }}
                              >
                                {[model?.name, s.variant].filter(Boolean).join(" · ")}
                              </span>
                              {s.posActive === false && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    color: "var(--c-burnt)",
                                    flexShrink: 0,
                                  }}
                                >
                                  POS off
                                </span>
                              )}
                              <span
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 12,
                                  color: "var(--fg-muted)",
                                  flexShrink: 0,
                                }}
                              >
                                {rm(s.price ?? 0)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Items list — editable qty / price rows */}
                {draft.lines.length === 0 ? (
                  <p
                    style={{
                      textAlign: "center",
                      fontSize: 13,
                      color: "var(--fg-muted)",
                      padding: "36px 0",
                    }}
                  >
                    No items yet — search the catalog above, or add a custom line.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {draft.lines.map((l) => {
                      const isCatalogLine = skuByCode.has(l.sku);
                      const editTarget = lineEditTarget(l, catalog);
                      const priceStr = priceDrafts[l.localId] ?? String(l.unitPrice);
                      return (
                        <div
                          key={l.localId}
                          data-testid={`raw-line-${l.localId}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 74px 120px 96px auto",
                            gap: 10,
                            alignItems: "center",
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: "1px solid var(--line)",
                            background: "var(--pos-panel)",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            {isCatalogLine ? (
                              <>
                                <div
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {l.label || l.sku}
                                </div>
                                <div
                                  style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: 11,
                                    color: "var(--fg-muted)",
                                  }}
                                >
                                  {l.sku}
                                </div>
                              </>
                            ) : (
                              <input
                                type="text"
                                value={l.sku}
                                onChange={(e) => patchLine(l.localId, { sku: e.target.value })}
                                placeholder="SKU or free-text description"
                                aria-label="Custom line description"
                                style={{
                                  width: "100%",
                                  padding: "7px 10px",
                                  borderRadius: 8,
                                  border: "1.5px solid var(--line)",
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 12,
                                  background: "var(--pos-panel)",
                                  outline: "none",
                                }}
                              />
                            )}
                          </div>
                          <input
                            type="number"
                            min={1}
                            value={l.qty}
                            aria-label="Quantity"
                            onChange={(e) =>
                              patchLine(l.localId, {
                                qty: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                              })
                            }
                            style={{
                              padding: "7px 10px",
                              borderRadius: 8,
                              border: "1.5px solid var(--line)",
                              fontSize: 13,
                              background: "var(--pos-panel)",
                              outline: "none",
                            }}
                          />
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={priceStr}
                            aria-label="Unit price (RM)"
                            onChange={(e) => {
                              const v = e.target.value;
                              setPriceDrafts((p) => ({ ...p, [l.localId]: v }));
                              const n = Number.parseFloat(v);
                              if (Number.isFinite(n) && n >= 0) {
                                patchLine(l.localId, { unitPrice: n });
                              }
                            }}
                            onBlur={() =>
                              setPriceDrafts((p) => {
                                const { [l.localId]: _drop, ...rest } = p;
                                return rest;
                              })
                            }
                            style={{
                              padding: "7px 10px",
                              borderRadius: 8,
                              border: "1.5px solid var(--line)",
                              fontFamily: "var(--font-mono)",
                              fontSize: 13,
                              background: "var(--pos-panel)",
                              outline: "none",
                            }}
                          />
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 13,
                              textAlign: "right",
                            }}
                          >
                            {rm(l.unitPrice * l.qty)}
                          </span>
                          <span style={{ display: "flex", gap: 4 }}>
                            {editTarget && (
                              <button
                                type="button"
                                onClick={() => setEditingLine(l)}
                                aria-label="Edit configuration"
                                title="Re-open the configurator"
                                data-testid={`raw-edit-${l.localId}`}
                                style={{
                                  width: 30,
                                  height: 30,
                                  display: "grid",
                                  placeItems: "center",
                                  borderRadius: 8,
                                  color: "var(--fg-muted)",
                                }}
                              >
                                <Pencil size={14} strokeWidth={1.75} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeLine(l.localId)}
                              aria-label="Remove line"
                              style={{
                                width: 30,
                                height: 30,
                                display: "grid",
                                placeItems: "center",
                                borderRadius: 8,
                                color: "var(--fg-muted)",
                              }}
                            >
                              <Trash2 size={14} strokeWidth={1.75} />
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ marginTop: 14 }}>
                  <button type="button" className="btn btn--ghost" onClick={addCustomLine}>
                    <Plus size={14} strokeWidth={1.75} />
                    Custom line
                  </button>
                </div>

                {/* Footer nav — mirror CustomerStep's ghost/primary bar */}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 32,
                    paddingTop: 20,
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="btn btn--primary btn--lg"
                    disabled={!linesValid}
                    onClick={() => {
                      setCustomerSubStep(0);
                      setStep(2);
                    }}
                    data-testid="raw-items-next"
                  >
                    Next · Customer info
                    <ArrowRight size={14} strokeWidth={1.75} />
                  </button>
                </div>
              </div>

              {/* Right: the SAME live summary rail the POS shows */}
              <OrderSummaryRail draft={draft} catalog={catalog} />
            </div>
          </div>
        ) : step === 2 ? (
          <div key={2} className="page-shell h-full overflow-hidden">
            {outletsQ.data && salespersonsQ.data ? (
              <CustomerStep
                draft={draft}
                onChange={setDraft}
                outlets={outlets}
                salespersons={salespersons}
                catalog={catalog}
                minLeadDays={0}
                rawDates
                initialSubStep={customerSubStep}
                onBackToCart={() => setStep(1)}
                onProceed={() => setStep(3)}
                dealerPick={{
                  dealers: pickableDealers,
                  loading: dealersQ.isLoading,
                  value: draft.actingDealerId ?? null,
                  onPick: pickDealer,
                }}
              />
            ) : (
              <div className="h-full grid place-items-center">
                <p className="text-sm text-muted-foreground">
                  {outletsQ.error || salespersonsQ.error
                    ? `Couldn't load outlets/salespersons: ${
                        (outletsQ.error ?? salespersonsQ.error)?.message
                      }`
                    : "Loading outlets + salespersons…"}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div key={3} className="page-shell h-full overflow-hidden">
            <div className="handover">
              <div className="handover__left">
                <div className="handover__title-row">
                  <div>
                    <span className="phase-banner">
                      <span className="phase-banner__dot" />
                      Step 3 of 3 · Confirm
                    </span>
                    <h1 className="handover__title">Confirm &amp; payment</h1>
                  </div>
                </div>
                <p className="handover__sub">
                  Internal entry — payment, slip and signature are all optional. Record
                  whatever you have; the order is saved exactly as entered.
                </p>
                <Step3SignaturePayment
                  draft={draft}
                  onChange={setDraft}
                  catalog={catalog}
                  rawMode
                />
              </div>
              <OrderSummaryRail draft={draft} catalog={catalog} />
            </div>
          </div>
        )}
      </main>

      {/* Footer — step 3 only (steps 1/2 own their Next buttons) */}
      {step === 3 && (
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
              data-testid="raw-submit-error"
            >
              {submitError}
            </p>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <button
              type="button"
              className="btn btn--ghost"
              disabled={uploading || createRaw.isPending}
              onClick={() => {
                setCustomerSubStep(3);
                setStep(2);
              }}
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
                  {rm(total)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!canCreate}
                className="btn btn--primary btn--lg"
                data-testid="raw-submit"
              >
                {uploading
                  ? "Uploading…"
                  : createRaw.isPending
                    ? "Creating…"
                    : "Create order →"}
              </button>
            </div>
          </div>
        </footer>
      )}

      {overlay}
    </div>
  );
}
