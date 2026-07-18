import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type {
  Order,
  ProductModelDto,
  ProductSkuDto,
  RawCreateOrderInput,
} from "@carres/shared";
import { ORDER_ENTRY_TABS, resolveFormTab, resolvePaymentMethods } from "@carres/shared";
import { rm } from "@/lib/format-currency";
import { composeAddress } from "@/data/malaysia-postcodes";
import MYAddressFields from "@/components/MYAddressFields";
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
import { RELATIONSHIPS } from "../dealer/pos/customer-autofill";
import PosConfigurePage from "../dealer/pos/PosConfigurePage";
import SofaConfigurePage from "../dealer/pos/SofaConfigurePage";
import { buildCatalogIndex } from "../dealer/pos/catalog-index";
import { lineEditTarget } from "../dealer/pos/cart";
import RawLineOptions from "./RawLineOptions";

/**
 * MAINTAIN → New Order — the RAW Sales Order creator, remade 2026-07-18 as a
 * SINGLE-PAGE key-in form (Loo: "我要的是从最 raw 的 data 这样子 key in，保持
 * 最大的权限，什么东西都可以改" — the 2990s Backend "New Sales Order" shape,
 * NOT the POS step wizard). Every section sits on one scrolling page, nothing
 * gates anything:
 *   CUSTOMER · ORDER INFO (+ configured custom fields) · EMERGENCY CONTACT ·
 *   DELIVERY ADDRESS (MY cascade + billing) · LINE ITEMS · PAYMENT
 * Line items are pick-or-type comboboxes IN the row (2990s parity): picking an
 * item fills the row DIRECTLY — it never jumps into the product-option page
 * (Loo 2026-07-18). Specs stay OPTIONAL via the row's ✎ (opens the product's
 * own configurator prefilled — fabric / divan / gap / leg / specials — and
 * writes back to the row); free text stays a custom "OTHERS" line. Prices,
 * dates (past OK, empty = TBD), qty — all stay editable, always. Submits via
 * POST /api/orders/raw; the only requirements are dealer + customer name +
 * ≥1 line (the server's own floor).
 */

/** Raw drafts start with NO payment method picked (payment optional here). */
function rawEmptyDraft(): WizardDraft {
  const d = emptyDraft();
  return { ...d, payment: { ...d.payment, method: "" } };
}

const INPUT_CLASS =
  "w-full rounded-md border border-base-300 bg-white px-3 py-2 t-body outline-none focus:border-primary";
const INPUT_DISABLED =
  "w-full rounded-md border border-base-200 bg-base-50 text-base-400 px-3 py-2 t-body cursor-not-allowed";

export default function PrincipalNewOrder() {
  const navigate = useNavigate();
  const dealersQ = usePrincipalDealers();
  const outletsQ = useOutlets();
  const salespersonsQ = useSalespersons();
  // Admin bundle — the FULL catalog (deactivated + unpriced + discontinued
  // included): raw entry must reach every sku the business ever sold.
  const catalogQ = useCatalog({ admin: true });
  const createRaw = useRawCreateOrder();

  const [draft, setDraft] = useState<WizardDraft>(() => {
    const d = loadDraft(RAW_DRAFT_STORAGE_KEY) ?? rawEmptyDraft();
    // The form always shows at least one line row ready to key into.
    return d.lines.length > 0
      ? d
      : { ...d, lines: [{ localId: newLocalId(), sku: "", qty: 1, attrs: null, unitPrice: 0, label: "" }] };
  });
  const [submitted, setSubmitted] = useState<Order | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** ✎ — the row whose product configurator is open. OPTIONAL and explicit:
   *  picking an item never jumps anywhere (Loo 2026-07-18); the configurator
   *  only opens from the row's ✎ button, prefilled from the stored line. */
  const [editRowId, setEditRowId] = useState<string | null>(null);
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

  // 0219 — the Order Entry config drives which optional builtins render +
  // which operator-defined custom fields appear. Raw form: `enabled` respected,
  // `required` ignored — nothing gates on this page.
  const formCfg = catalog?.orderEntryConfig?.formFields ?? null;
  const custB = resolveFormTab(formCfg, "customer").builtins;
  const emergencyEnabled = resolveFormTab(formCfg, "emergency").builtins["emergency"]?.enabled;
  const customFields = useMemo(
    () => ORDER_ENTRY_TABS.flatMap((tab) => resolveFormTab(formCfg, tab).custom),
    [formCfg],
  );
  const paymentMethods = useMemo(
    () => resolvePaymentMethods(catalog?.orderEntryConfig),
    [catalog],
  );

  const dealers = useMemo(
    () => (dealersQ.data?.dealers ?? []).filter((d) => d.status === "active"),
    [dealersQ.data],
  );
  const dealerId = draft.actingDealerId ?? "";
  const outlets = useMemo(
    () => (outletsQ.data?.outlets ?? []).filter((o) => o.dealerId === dealerId),
    [outletsQ.data, dealerId],
  );
  const salespersons = useMemo(
    () => (salespersonsQ.data?.salespersons ?? []).filter((s) => s.dealerId === dealerId),
    [salespersonsQ.data, dealerId],
  );

  const c = draft.customer;
  function setC(patch: Partial<WizardDraft["customer"]>) {
    setDraft((d) => ({ ...d, customer: { ...d.customer, ...patch } }));
  }
  function setDelivery(patch: Partial<WizardDraft["delivery"]>) {
    setDraft((d) => ({ ...d, delivery: { ...d.delivery, ...patch } }));
  }
  function setCustom(key: string, value: string) {
    setDraft((d) => ({
      ...d,
      customer: { ...d.customer, custom: { ...(d.customer.custom ?? {}), [key]: value } },
    }));
  }
  function setPay(patch: Partial<WizardDraft["payment"]>) {
    setDraft((d) => ({ ...d, payment: { ...d.payment, ...patch } }));
  }

  // ── Line rows ─────────────────────────────────────────────────────────────
  function patchLine(localId: string, patch: Partial<DraftLine>) {
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.localId === localId ? { ...l, ...patch } : l)),
    }));
  }
  function removeLine(localId: string) {
    setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.localId !== localId) }));
  }
  function addEmptyLine() {
    setDraft((d) => ({
      ...d,
      lines: [
        ...d.lines,
        { localId: newLocalId(), sku: "", qty: 1, attrs: null, unitPrice: 0, label: "" },
      ],
    }));
  }
  /** Replace a row's content with a configurator-emitted line, keeping the
   *  row's stable localId. */
  function fillRow(rowId: string, line: DraftLine) {
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.localId === rowId ? { ...line, localId: rowId } : l)),
    }));
  }

  /** A row's catalog pick fills the row DIRECTLY — sku, display label and
   *  catalog price (still editable). It NEVER jumps into the product-option
   *  page (Loo 2026-07-18); specs stay optional via the row's ✎ afterwards.
   *  A typed remark survives the pick. */
  function pickSkuForRow(rowId: string, sku: ProductSkuDto) {
    const model = modelById.get(sku.modelId);
    const prev = draft.lines.find((l) => l.localId === rowId);
    const prevAttrs = (prev?.attrs ?? {}) as Record<string, unknown>;
    const remark = typeof prevAttrs.remark === "string" ? prevAttrs.remark : "";
    fillRow(rowId, {
      localId: rowId,
      sku: sku.sku,
      qty: prev?.qty ?? 1,
      attrs: remark ? { remark } : null,
      unitPrice: sku.price ?? 0,
      label: model ? `${model.name} · ${sku.variant}` : sku.variant,
    });
  }

  /** Rows the operator actually keyed (a fully-empty row is ignored). */
  const activeLines = useMemo(
    () => draft.lines.filter((l) => l.sku.trim().length > 0),
    [draft.lines],
  );
  const subtotal = activeLines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const paidPct = subtotal > 0 ? Math.round((draft.paid / subtotal) * 100) : 0;

  const canCreate =
    !!dealerId &&
    c.name.trim().length > 0 &&
    activeLines.length > 0 &&
    activeLines.every((l) => l.qty > 0 && l.unitPrice >= 0) &&
    !createRaw.isPending;

  // ── Submit — the extended raw door ────────────────────────────────────────
  async function handleCreate() {
    if (!canCreate) return;
    setSubmitError(null);
    try {
      const composedAddress = composeAddress({
        line1: c.addressLine1,
        line2: c.addressLine2,
        state: c.addressState,
        city: c.addressCity,
        postcode: c.addressPostcode,
      });
      const fields = Object.fromEntries(
        Object.entries(c.custom ?? {}).filter(([, v]) => v.trim()),
      );
      const input: RawCreateOrderInput = {
        dealerId,
        outletId: draft.outletId,
        salespersonId: draft.salespersonId,
        customer: {
          name: c.name.trim(),
          phone: c.phone.trim() || null,
          address: c.addressUnknown ? null : composedAddress || c.address.trim() || null,
          addressUnknown: c.addressUnknown,
          // 0230 — structured parts ride alongside the composed string.
          addressLine1: c.addressUnknown ? null : c.addressLine1.trim() || null,
          addressLine2: c.addressUnknown ? null : c.addressLine2.trim() || null,
          addressState: c.addressUnknown ? null : c.addressState || null,
          addressCity: c.addressUnknown ? null : c.addressCity || null,
          addressPostcode: c.addressUnknown ? null : c.addressPostcode || null,
          billing: c.billingSame ? null : c.billing.trim() || null,
          billingSame: c.billingSame,
          emergency: composeEmergency(c) || null,
          email: c.email.trim() || null,
          race: c.race || null,
          gender: c.gender || null,
          birthday: c.birthday || null,
        },
        // Raw dates: empty = TBD, past allowed, saved exactly as entered.
        deliveryDate: draft.delivery.date || null,
        proceedDate: draft.delivery.proceedDate || null,
        deliveryFloor: draft.delivery.floor,
        deliveryHasLift: draft.delivery.hasLift,
        deliveryStairItems: draft.delivery.stairItems,
        lines: activeLines.map((l) => ({
          sku: l.sku.trim(),
          qty: l.qty,
          unitPrice: l.unitPrice,
          attrs: l.attrs,
        })),
        addons: [],
        paid: draft.paid,
        paymentMethod: draft.payment.method || null,
        approvalCode: draft.payment.approvalCode.trim() || null,
        installmentMonths:
          draft.payment.method === "installment" ? draft.payment.installmentMonths : null,
        ...(Object.keys(fields).length > 0 ? { entryData: { fields } } : {}),
      };
      const order = await createRaw.mutateAsync(input);
      clearDraft(RAW_DRAFT_STORAGE_KEY);
      setSubmitted(order);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Order creation failed");
    }
  }

  function startAnother() {
    setSubmitted(null);
    setSubmitError(null);
    setPriceDrafts({});
    const d = rawEmptyDraft();
    setDraft({
      ...d,
      lines: [{ localId: newLocalId(), sku: "", qty: 1, attrs: null, unitPrice: 0, label: "" }],
    });
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

  // ── ✎ configure overlay (OPTIONAL — specs follow the product) ─────────────
  const overlay = (() => {
    if (!editRowId || !catalog || !index) return null;
    const row = draft.lines.find((l) => l.localId === editRowId);
    const sku = row ? skuByCode.get(row.sku) : undefined;
    const model = sku ? modelById.get(sku.modelId) : undefined;
    if (!row || !model) return null;
    const close = () => setEditRowId(null);
    const emit = (line: DraftLine) => fillRow(editRowId, line);
    if (model.category === "mattress" || model.category === "bedframe") {
      return (
        <PosConfigurePage
          key={editRowId}
          model={model}
          meta={index.meta.get(model.id)}
          skus={index.skusByModel.get(model.id) ?? []}
          specialAddons={catalog.specialAddons}
          optionPools={catalog.optionPools}
          fabrics={catalog.fabrics}
          fabricTierConfig={catalog.fabricTierConfig}
          modelFabricTierOverrides={catalog.modelFabricTierOverrides}
          editLine={row}
          onAdd={emit}
          onClose={close}
        />
      );
    }
    if (model.category === "sofa" && lineEditTarget(row, catalog) === "sofa_build") {
      return (
        <SofaConfigurePage
          key={editRowId}
          model={model}
          meta={index.meta.get(model.id)}
          skus={index.skusByModel.get(model.id) ?? []}
          fabrics={index.fabricsByModel.get(model.id) ?? []}
          masterFabrics={catalog.fabrics}
          optionPools={catalog.optionPools}
          fabricTierConfig={catalog.fabricTierConfig}
          modelFabricTierOverrides={catalog.modelFabricTierOverrides}
          sofaCompartments={catalog.sofaCompartments ?? []}
          modelCompartments={(catalog.modelSofaCompartments ?? []).filter(
            (mc) => mc.modelId === model.id,
          )}
          sofaCombos={catalog.sofaCombos ?? []}
          editLine={row}
          onAdd={emit}
          onClose={close}
        />
      );
    }
    return null;
  })();

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-6">
      <header>
        <p className="t-micro text-base-400">Maintain · New order</p>
        <h1 className="t-h2 mt-1">New Sales Order</h1>
        <p className="t-small text-base-500 mt-1">
          Raw creation — no POS gates. Every line, price and date is saved exactly as you
          enter it.
        </p>
      </header>

      {/* ── Sale info ── */}
      <Section title="Sale info">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Dealer *">
            <select
              value={dealerId}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  actingDealerId: e.target.value || null,
                  actingDealerName:
                    dealers.find((x) => x.id === e.target.value)?.name ?? null,
                  outletId: null,
                  salespersonId: null,
                }))
              }
              data-testid="raw-dealer"
              className={INPUT_CLASS}
            >
              <option value="">{dealersQ.isLoading ? "Loading…" : "Select a dealer…"}</option>
              {dealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Outlet">
            <select
              value={draft.outletId ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, outletId: e.target.value || null }))}
              disabled={!dealerId}
              className={dealerId ? INPUT_CLASS : INPUT_DISABLED}
            >
              <option value="">— optional —</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Salesperson">
            <select
              value={draft.salespersonId ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, salespersonId: e.target.value || null }))
              }
              disabled={!dealerId}
              className={dealerId ? INPUT_CLASS : INPUT_DISABLED}
            >
              <option value="">— optional —</option>
              {salespersons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      {/* ── Customer ── */}
      <Section title="Customer">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name *">
            <input
              type="text"
              value={c.name}
              onChange={(e) => setC({ name: e.target.value })}
              data-testid="raw-customer-name"
              placeholder="e.g. Tan Mei Ling"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              value={c.phone}
              onChange={(e) => setC({ phone: e.target.value })}
              placeholder="012-3456789"
              className={INPUT_CLASS}
            />
          </Field>
          {custB["email"]?.enabled && (
            <Field label="Email">
              <input
                type="email"
                value={c.email}
                onChange={(e) => setC({ email: e.target.value })}
                placeholder="customer@example.com"
                className={INPUT_CLASS}
              />
            </Field>
          )}
          {custB["race"]?.enabled && (
            <Field label="Race">
              <select
                value={c.race}
                onChange={(e) => setC({ race: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">—</option>
                {["Malay", "Chinese", "Indian", "Other"].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {custB["gender"]?.enabled && (
            <Field label="Gender">
              <select
                value={c.gender}
                onChange={(e) => setC({ gender: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">—</option>
                {["Female", "Male"].map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {custB["birthday"]?.enabled && (
            <Field label="Birthday">
              <input
                type="date"
                value={c.birthday}
                onChange={(e) => setC({ birthday: e.target.value })}
                className={INPUT_CLASS}
              />
            </Field>
          )}
        </div>
      </Section>

      {/* ── Order info ── */}
      <Section title="Order info">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Delivery date" hint="Any date — leave empty = TBD. No lead-time floor.">
            <input
              type="date"
              value={draft.delivery.date}
              onChange={(e) => setDelivery({ date: e.target.value, dateTbd: false })}
              data-testid="raw-delivery-date"
              className={INPUT_CLASS}
            />
          </Field>
          <Field
            label="Proceed date · production start"
            hint="Optional — saved only when a delivery date is set."
          >
            <input
              type="date"
              value={draft.delivery.proceedDate}
              onChange={(e) => setDelivery({ proceedDate: e.target.value })}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Delivery floor" hint="Stair-carry fee derives from floor config downstream.">
            <input
              type="number"
              min={1}
              value={draft.delivery.floor}
              onChange={(e) =>
                setDelivery({ floor: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
              }
              className={INPUT_CLASS}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Has lift">
              <label className="inline-flex items-center gap-2 py-2.5 cursor-pointer t-body">
                <input
                  type="checkbox"
                  checked={draft.delivery.hasLift}
                  onChange={(e) => setDelivery({ hasLift: e.target.checked })}
                  className="w-4 h-4"
                />
                Lift access
              </label>
            </Field>
            <Field label="Stair items" hint="Empty = all items">
              <input
                type="number"
                min={0}
                value={draft.delivery.stairItems ?? ""}
                onChange={(e) =>
                  setDelivery({
                    stairItems:
                      e.target.value === ""
                        ? null
                        : Math.max(0, Math.floor(Number(e.target.value) || 0)),
                  })
                }
                className={INPUT_CLASS}
              />
            </Field>
          </div>
          {customFields.map((f) => (
            <Field key={f.key} label={f.label}>
              {f.type === "select" ? (
                <select
                  value={c.custom?.[f.key] ?? ""}
                  onChange={(e) => setCustom(f.key, e.target.value)}
                  className={INPUT_CLASS}
                  data-testid={`raw-custom-${f.key}`}
                >
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                  value={c.custom?.[f.key] ?? ""}
                  onChange={(e) => setCustom(f.key, e.target.value)}
                  className={INPUT_CLASS}
                  data-testid={`raw-custom-${f.key}`}
                />
              )}
            </Field>
          ))}
        </div>
      </Section>

      {/* ── Emergency contact ── */}
      {emergencyEnabled && (
        <Section
          title="Emergency contact"
          hint="Used only if we cannot reach the customer on delivery day"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Contact name">
              <input
                type="text"
                value={c.emergencyName}
                onChange={(e) => setC({ emergencyName: e.target.value })}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Relationship">
              <select
                value={c.emergencyRelationship}
                onChange={(e) =>
                  setC({
                    emergencyRelationship: e.target.value,
                    emergencyRelationshipOther:
                      e.target.value === "__OTHER__" ? c.emergencyRelationshipOther : "",
                  })
                }
                className={INPUT_CLASS}
              >
                <option value="">—</option>
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
                <option value="__OTHER__">Others</option>
              </select>
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={c.emergencyPhone}
                onChange={(e) => setC({ emergencyPhone: e.target.value })}
                className={INPUT_CLASS}
              />
            </Field>
            {c.emergencyRelationship === "__OTHER__" && (
              <Field label="Specify relationship">
                <input
                  type="text"
                  value={c.emergencyRelationshipOther}
                  onChange={(e) => setC({ emergencyRelationshipOther: e.target.value })}
                  className={INPUT_CLASS}
                />
              </Field>
            )}
          </div>
        </Section>
      )}

      {/* ── Delivery address ── */}
      <Section title="Delivery address">
        <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={c.addressUnknown}
            onChange={(e) =>
              setC({
                addressUnknown: e.target.checked,
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
            className="mt-0.5 w-4 h-4"
          />
          <span>
            <span className="t-body font-semibold block">Fill in address later</span>
            <span className="t-tiny text-base-500">
              Customer hasn't confirmed the delivery address yet.
            </span>
          </span>
        </label>
        {!c.addressUnknown && (
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
        )}
        <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
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
            className="mt-0.5 w-4 h-4"
          />
          <span className="t-body">Billing address same as delivery</span>
        </label>
        {!c.billingSame && (
          <div className="mt-3">
            <Field label="Billing address">
              <textarea
                rows={2}
                value={c.billing}
                onChange={(e) => setC({ billing: e.target.value })}
                className={INPUT_CLASS}
              />
            </Field>
          </div>
        )}
      </Section>

      {/* ── Line items ── */}
      <Section
        title={`Line items (${activeLines.length})`}
        hint="Pick from catalog or type free text — specs follow the product; every price stays editable"
      >
        <div className="flex flex-col gap-2">
          <div className="hidden sm:grid grid-cols-[24px_1fr_180px_70px_110px_100px_64px] gap-2 px-1">
            <span />
            <span className="t-micro text-base-400">Product — pick or type</span>
            <span className="t-micro text-base-400">Remarks</span>
            <span className="t-micro text-base-400">Qty</span>
            <span className="t-micro text-base-400">Unit price</span>
            <span className="t-micro text-base-400 text-right">Total</span>
            <span />
          </div>
          {draft.lines.map((l, i) => {
            const isCatalogLine = skuByCode.has(l.sku);
            const priceStr = priceDrafts[l.localId] ?? String(l.unitPrice);
            const attrs = (l.attrs ?? {}) as Record<string, unknown>;
            const remark = typeof attrs.remark === "string" ? attrs.remark : "";
            const editable = catalog ? lineEditTarget(l, catalog) !== null : false;
            const rowSku = skuByCode.get(l.sku);
            const rowModel = rowSku ? modelById.get(rowSku.modelId) : undefined;
            return (
              <div
                key={l.localId}
                data-testid={`raw-line-${l.localId}`}
                className="border border-base-200 rounded-md p-2 bg-white"
              >
              <div className="grid sm:grid-cols-[24px_1fr_180px_70px_110px_100px_64px] grid-cols-2 gap-2 items-start">
                <span className="t-tiny text-base-400 pt-2.5 text-center">{i + 1}</span>
                <div className="min-w-0">
                  <RowSkuPicker
                    line={l}
                    catalog={catalogQ.data ?? null}
                    modelById={modelById}
                    onType={(text) =>
                      // Typing over a pick resets the product identity but a
                      // typed remark survives.
                      patchLine(l.localId, {
                        sku: text,
                        label: "",
                        attrs: remark ? { remark } : null,
                      })
                    }
                    onPick={(sku) => pickSkuForRow(l.localId, sku)}
                  />
                  {l.label && (
                    <p className="t-tiny text-base-500 mt-1 px-1 truncate">{l.label}</p>
                  )}
                  {!isCatalogLine && l.sku.trim().length > 0 && (
                    <span className="t-micro text-warning px-1">OTHERS · custom line</span>
                  )}
                </div>
                <input
                  type="text"
                  value={remark}
                  placeholder="Type remarks…"
                  aria-label="Line remarks"
                  onChange={(e) => {
                    const v = e.target.value;
                    const next: Record<string, unknown> = { ...attrs };
                    if (v.trim()) next.remark = v;
                    else delete next.remark;
                    patchLine(l.localId, {
                      attrs: Object.keys(next).length > 0 ? next : null,
                    });
                  }}
                  className="rounded-md border border-base-300 bg-white px-2.5 py-1.5 t-small outline-none focus:border-primary"
                />
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
                  className="rounded-md border border-base-300 bg-white px-2.5 py-1.5 t-body outline-none focus:border-primary"
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
                    if (Number.isFinite(n) && n >= 0) patchLine(l.localId, { unitPrice: n });
                  }}
                  onBlur={() =>
                    setPriceDrafts((p) => {
                      const { [l.localId]: _drop, ...rest } = p;
                      return rest;
                    })
                  }
                  className="rounded-md border border-base-300 bg-white px-2.5 py-1.5 font-mono text-[13px] outline-none focus:border-primary"
                />
                <span className="font-mono text-[13px] text-right pt-2">
                  {rm(l.unitPrice * l.qty)}
                </span>
                <span className="flex gap-1 pt-1">
                  {editable && (
                    <button
                      type="button"
                      onClick={() => setEditRowId(l.localId)}
                      aria-label="Edit specs"
                      title="Optional — open the product configurator for specs"
                      data-testid={`raw-edit-${l.localId}`}
                      className="grid place-items-center w-7 h-7 rounded-md text-base-400 hover:text-base-800 hover:bg-base-100"
                    >
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeLine(l.localId)}
                    aria-label="Remove line"
                    className="grid place-items-center w-7 h-7 rounded-md text-base-400 hover:text-destructive hover:bg-destructive/5"
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </span>
              </div>
              {/* Inline variants — options come OUT under the row when the
                  picked product has any (2990s SOFA VARIANTS parity). */}
              {rowSku && rowModel && catalog && (
                <RawLineOptions
                  line={l}
                  model={rowModel}
                  sku={rowSku}
                  catalog={catalog}
                  onPatch={(patch) => {
                    // A panel change re-derives the suggested price — drop any
                    // in-progress manual price string so the row shows it.
                    setPriceDrafts((p) => {
                      const { [l.localId]: _drop, ...rest } = p;
                      return rest;
                    });
                    patchLine(l.localId, patch);
                  }}
                />
              )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={addEmptyLine}
            data-testid="raw-add-line"
            className="border border-dashed border-base-300 rounded-md py-2.5 t-small text-primary hover:bg-base-50 inline-flex items-center justify-center gap-1.5"
          >
            <Plus size={14} strokeWidth={1.75} />
            Add line item
          </button>
          <p className="text-right t-body">
            Subtotal <span className="font-mono font-semibold">{rm(subtotal)}</span>
          </p>
        </div>
      </Section>

      {/* ── Payment ── */}
      <Section
        title="Payment"
        hint="Optional — record the deposit taken at order time; later payments go through Finance / top-up"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Paid (RM)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={draft.paid || ""}
              placeholder="0.00"
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  paid: Math.max(0, Number.parseFloat(e.target.value) || 0),
                }))
              }
              data-testid="raw-paid"
              className={`${INPUT_CLASS} font-mono`}
            />
          </Field>
          <Field label="Payment method">
            <select
              value={draft.payment.method}
              onChange={(e) => setPay({ method: e.target.value, followUps: {} })}
              data-testid="raw-payment-method"
              className={INPUT_CLASS}
            >
              <option value="">— not recorded —</option>
              {paymentMethods.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Approval / reference code">
            <input
              type="text"
              value={draft.payment.approvalCode}
              onChange={(e) =>
                setPay({
                  approvalCode: e.target.value.replace(/[^0-9A-Za-z-]/g, "").toUpperCase(),
                })
              }
              placeholder="e.g. FT2026050012345"
              className={`${INPUT_CLASS} font-mono`}
            />
          </Field>
          {draft.payment.method === "installment" && (
            <Field label="Installment plan">
              <select
                value={draft.payment.installmentMonths}
                onChange={(e) =>
                  setPay({ installmentMonths: Number(e.target.value) === 12 ? 12 : 6 })
                }
                className={INPUT_CLASS}
              >
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
              </select>
            </Field>
          )}
        </div>
        {draft.paid > 0 && subtotal > 0 && (
          <p className="t-small text-base-600 mt-3">
            Deposit {paidPct}% · Balance{" "}
            <span className="font-mono">{rm(Math.max(0, subtotal - draft.paid))}</span>
          </p>
        )}
      </Section>

      {/* ── Footer ── */}
      {submitError && (
        <p
          className="text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded px-3 py-2"
          data-testid="raw-submit-error"
        >
          {submitError}
        </p>
      )}
      <div className="flex items-center justify-between pb-10">
        <span className="t-body text-base-700">
          Total <span className="font-mono font-semibold text-base-900">{rm(subtotal)}</span>
          {draft.paid > 0 && (
            <span className="t-small text-base-500 ml-3">
              Paid {rm(draft.paid)}
              {subtotal > 0 && ` · ${paidPct}%`}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={!canCreate}
          data-testid="raw-submit"
          className="btn-hero disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createRaw.isPending ? "Creating…" : "Create order →"}
        </button>
      </div>

      {overlay}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Row combobox — pick from catalog or type free text (2990s line-item parity)
// -----------------------------------------------------------------------------

function RowSkuPicker({
  line,
  catalog,
  modelById,
  onType,
  onPick,
}: {
  line: DraftLine;
  catalog: { skus: ProductSkuDto[] } | null;
  modelById: Map<string, ProductModelDto>;
  onType: (text: string) => void;
  onPick: (sku: ProductSkuDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const q = line.sku.trim().toLowerCase();
  const results = useMemo(() => {
    if (!open || !q || !catalog) return [];
    return catalog.skus
      .filter((s) => {
        const model = modelById.get(s.modelId);
        return (
          s.sku.toLowerCase().includes(q) ||
          (model?.name.toLowerCase().includes(q) ?? false) ||
          (s.variant?.toLowerCase().includes(q) ?? false)
        );
      })
      .slice(0, 8);
  }, [open, q, catalog, modelById]);

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={line.sku}
        placeholder="Click to pick or type to filter…"
        aria-label="Product SKU or description"
        data-testid={`raw-sku-${line.localId}`}
        onChange={(e) => {
          onType(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        autoComplete="off"
        className="w-full rounded-md border border-base-300 bg-white px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-primary"
      />
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full min-w-[320px] bg-white border border-base-200 rounded-lg shadow-md overflow-hidden">
          {results.map((s) => {
            const model = modelById.get(s.modelId);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  data-testid={`raw-pick-${s.sku}`}
                  // mousedown (not click) — must beat the input's blur.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setOpen(false);
                    onPick(s);
                  }}
                  className="w-full flex items-baseline gap-2.5 px-3 py-2 text-left hover:bg-base-50"
                >
                  <span className="font-mono text-[12px] shrink-0">{s.sku}</span>
                  <span className="t-tiny text-base-500 truncate flex-1">
                    {[model?.name, s.variant].filter(Boolean).join(" · ")}
                  </span>
                  {s.posActive === false && (
                    <span className="t-micro text-warning shrink-0">POS off</span>
                  )}
                  <span className="font-mono text-[12px] text-base-600 shrink-0">
                    {rm(s.price ?? 0)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Section / Field atoms (v17 card language — same as the rest of the portal)
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
    <section className="bg-card border border-base-200 rounded-lg shadow-sm p-6">
      <div className="flex items-baseline justify-between mb-4 gap-4">
        <h2 className="t-h4">{title}</h2>
        {hint && <p className="t-tiny text-base-500 text-right">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="t-tiny uppercase tracking-wide text-base-500">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="t-tiny text-base-400 mt-1 block">{hint}</span>}
    </label>
  );
}
