import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BUILDING_TYPE_OPTIONS,
  createOrderInputSchema,
  resolvePaymentMethods,
  type CreateOrderInput,
} from "@carres/shared";
import PageShell from "@/components/kit/PageShell";
import Panel from "@/components/kit/Panel";
import Input from "@/components/kit/Input";
import Select from "@/components/kit/Select";
import DatePicker from "@/components/kit/DatePicker";
import Checkbox from "@/components/kit/Checkbox";
import Button from "@/components/kit/Button";
import { FieldError } from "@/components/kit/FieldFrame";
import { composeAddress, MY_STATES } from "@/data/malaysia-postcodes";
import { useCatalog, useCreateOrder, useOutlets, useSalespersons } from "@/lib/queries";
import { newWizardSessionId, uploadDataUrl } from "@/lib/storage";
import SignaturePad from "../dealer/new-order/SignaturePad";

/**
 * New Sales Order — the office create page.
 *
 * OVERTURNED 2026-10-22 by Weisiang (Mr Lim, WhatsApp): office staff may create
 * Sales Orders (Houzs way). Jess's 2026-09-27 rule ("in the Sales Portal and
 * nowhere else") is kept for history in docs/orders/MASTER.md.
 *
 * ONE ENGINE. The page builds the Sales Portal's own body and posts it to
 * `POST /api/orders` → `create_order_from_sales_portal`, which already lets an
 * internal role place an order under a dealer it names. The dealer is the
 * picked outlet's dealer. Every rule the Sales Portal answers to (delivery
 * facts, dates, payment method, signature, terms) is the same rule here.
 *
 * ponytail: plain SKU lines only — no product configurator, bundles, PWP or
 * free gifts. Add the POS configurators when the office needs to key a
 * configured line.
 */

type Line = { key: string; sku: string; qty: string; unitPrice: string };

export type OfficeForm = {
  outletId: string;
  salespersonId: string;
  name: string;
  phone: string;
  emergencyName: string;
  emergencyPhone: string;
  line1: string;
  city: string;
  postcode: string;
  state: string;
  buildingType: string;
  floor: string;
  hasLift: "yes" | "no" | "";
  deliveryDate: string | null;
  proceedDate: string | null;
  lines: Line[];
  paymentMethod: string;
  approvalCode: string;
  followUps: Record<string, string>;
  paid: string;
  signature: string | null;
  termsAccepted: boolean;
};

let lineSeq = 0;
const newLine = (): Line => ({ key: `l${++lineSeq}`, sku: "", qty: "1", unitPrice: "" });

export function emptyOfficeForm(): OfficeForm {
  return {
    outletId: "", salespersonId: "", name: "", phone: "", emergencyName: "", emergencyPhone: "",
    line1: "", city: "", postcode: "", state: "", buildingType: "", floor: "1", hasLift: "",
    deliveryDate: null, proceedDate: null, lines: [newLine()], paymentMethod: "", approvalCode: "",
    followUps: {}, paid: "0", signature: null, termsAccepted: false,
  };
}

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

/** The Sales Portal body, built from the office form. Pure — tested alone. */
export function buildOfficeOrder(
  f: OfficeForm,
  ctx: { dealerId: string; signaturePath: string },
): CreateOrderInput {
  const lines = f.lines
    .filter((l) => l.sku)
    .map((l) => ({ sku: l.sku, qty: num(l.qty), attrs: null, unitPrice: num(l.unitPrice) }));
  const total = lines.reduce((s, l) => s + (l.qty || 0) * (l.unitPrice || 0), 0);
  const paid = num(f.paid) || 0;
  const address = f.line1.trim()
    ? composeAddress({ line1: f.line1, state: f.state, city: f.city.trim(), postcode: f.postcode.trim() })
    : null;
  const followUps = Object.fromEntries(Object.entries(f.followUps).filter(([, v]) => v));
  return {
    dealerId: ctx.dealerId,
    outletId: f.outletId,
    salespersonId: f.salespersonId,
    customer: {
      name: f.name.trim(),
      phone: f.phone.trim(),
      address,
      addressUnknown: false,
      billing: null,
      billingSame: true,
      emergency: [f.emergencyName.trim(), f.emergencyPhone.trim()].filter(Boolean).join(" · "),
      addressLine1: f.line1.trim() || null,
      addressCity: f.city.trim() || null,
      addressPostcode: f.postcode.trim() || null,
      addressState: f.state || null,
    },
    delivery: {
      date: f.deliveryDate,
      proceedDate: f.proceedDate,
      dateTbd: false,
      floor: Number(f.floor) || 0,
      hasLift: f.hasLift === "yes",
    },
    lines,
    addons: [],
    paid,
    signaturePath: ctx.signaturePath,
    paymentSlipPath: null,
    termsAccepted: f.termsAccepted as true,
    depositPct: total > 0 ? Math.min(100, Math.max(0, Math.round((paid / total) * 100))) : 0,
    paymentMethod: f.paymentMethod,
    approvalCode: f.approvalCode.trim() || null,
    installmentMonths: null,
    pwpCartLineKeys: [],
    entryData: {
      fields: { building_type: f.buildingType },
      ...(Object.keys(followUps).length ? { payment: followUps } : {}),
    },
  };
}

/** A readable sentence for the first thing the engine would refuse. */
function firstIssue(body: CreateOrderInput, f: OfficeForm): string | null {
  if (!f.outletId) return "Pick the outlet the order is placed under.";
  if (!f.salespersonId) return "Pick the salesperson who sold it.";
  if (body.lines.length === 0) return "An order needs at least one item.";
  if (body.lines.some((l) => !Number.isInteger(l.qty) || l.qty < 1)) return "Qty must be at least 1.";
  if (body.lines.some((l) => Number.isNaN(l.unitPrice) || l.unitPrice < 0)) return "Unit price must be 0 or more.";
  if (!f.paymentMethod) return "Pick the payment method.";
  if (!f.signature) return "The customer signs before the order is created.";
  if (!f.termsAccepted) return "The customer accepts the terms before the order is created.";
  const parsed = createOrderInputSchema.safeParse(body);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  return issue.message === "Required" || issue.code !== "custom"
    ? `Check ${issue.path.join(" ").replace(/([A-Z])/g, " $1").toLowerCase()}.`
    : issue.message;
}

export default function OperationNewSalesOrder() {
  const navigate = useNavigate();
  const [f, setF] = useState<OfficeForm>(emptyOfficeForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionId] = useState(newWizardSessionId);
  const set = <K extends keyof OfficeForm>(k: K, v: OfficeForm[K]) => setF((p) => ({ ...p, [k]: v }));

  const outletsQ = useOutlets();
  const salespersonsQ = useSalespersons(f.outletId || undefined, { enabled: Boolean(f.outletId) });
  const catalogQ = useCatalog();
  const create = useCreateOrder();

  const outlets = outletsQ.data?.outlets ?? [];
  const dealerId = outlets.find((o) => o.id === f.outletId)?.dealerId ?? "";
  const salespersons = (salespersonsQ.data?.salespersons ?? []).filter((s) => s.active);
  const methods = useMemo(() => resolvePaymentMethods(catalogQ.data?.orderEntryConfig ?? null), [catalogQ.data]);
  const method = methods.find((m) => m.key === f.paymentMethod);
  const skuOptions = useMemo(() => {
    const models = new Map((catalogQ.data?.models ?? []).map((m) => [m.id, m.name]));
    return (catalogQ.data?.skus ?? [])
      .filter((s) => s.posActive !== false && !s.discontinuedAt)
      .map((s) => ({ value: s.sku, label: `${s.sku} · ${models.get(s.modelId) ?? ""} ${s.variant}`.trim(), price: s.price }));
  }, [catalogQ.data]);

  const setLine = (key: string, patch: Partial<Line>) =>
    setF((p) => ({ ...p, lines: p.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  async function submit() {
    setError(null);
    const issue = firstIssue(buildOfficeOrder(f, { dealerId, signaturePath: "pending" }), f);
    if (issue) return setError(issue);
    setBusy(true);
    try {
      const signaturePath = await uploadDataUrl({ dealerId, wizardSessionId: sessionId, filename: "signature.png", dataUrl: f.signature! });
      const order = await create.mutateAsync(buildOfficeOrder(f, { dealerId, signaturePath }));
      navigate(`/operation/orders/so/${order.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The order could not be created. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      variant="detail"
      title="New Sales Order"
      titleRight={
        <>
          <Button variant="neutral" onClick={() => navigate("/operation/orders")} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon="confirm" loading={busy} onClick={() => void submit()}>Create order</Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto" data-testid="new-sales-order-page">
        {error && <FieldError testId="new-sales-order-error">{error}</FieldError>}

        <Panel title="Placed by">
          <div className="grid gap-3 min-[768px]:grid-cols-2">
            <Select id="nso-outlet" label="Outlet" required value={f.outletId || undefined}
              onValueChange={(v) => setF((p) => ({ ...p, outletId: v, salespersonId: "" }))}
              options={outlets.map((o) => ({ value: o.id, label: o.name }))} />
            <Select id="nso-salesperson" label="Salesperson" required disabled={!f.outletId} value={f.salespersonId || undefined}
              onValueChange={(v) => set("salespersonId", v)}
              options={salespersons.map((s) => ({ value: s.id, label: s.name }))} />
          </div>
        </Panel>

        <Panel title="Customer">
          <div className="grid gap-3 min-[768px]:grid-cols-2">
            <Input id="nso-name" label="Customer name" required value={f.name} onChange={(e) => set("name", e.target.value)} />
            <Input id="nso-phone" label="Phone" type="tel" required value={f.phone} onChange={(e) => set("phone", e.target.value)} />
            <Input id="nso-emergency-name" label="Emergency contact name" required value={f.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} />
            <Input id="nso-emergency-phone" label="Emergency contact phone" type="tel" value={f.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} />
          </div>
        </Panel>

        <Panel title="Delivery">
          <div className="grid gap-3 min-[768px]:grid-cols-2">
            <Input id="nso-address" label="Address" required value={f.line1} onChange={(e) => set("line1", e.target.value)} />
            <Input id="nso-city" label="City" value={f.city} onChange={(e) => set("city", e.target.value)} />
            <Input id="nso-postcode" label="Postcode" value={f.postcode} onChange={(e) => set("postcode", e.target.value)} />
            <Select id="nso-state" label="State" required value={f.state || undefined} onValueChange={(v) => set("state", v)}
              options={MY_STATES.map((s) => ({ value: s, label: s }))} />
            <Select id="nso-building" label="Building type" required value={f.buildingType || undefined} onValueChange={(v) => set("buildingType", v)}
              options={BUILDING_TYPE_OPTIONS.map((b) => ({ value: b, label: b }))} />
            <Input id="nso-floor" label="Floor" type="number" min={1} required value={f.floor} onChange={(e) => set("floor", e.target.value)} />
            <Select id="nso-lift" label="Lift" required value={f.hasLift || undefined} onValueChange={(v) => set("hasLift", v as "yes" | "no")}
              options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
            <DatePicker id="nso-delivery-date" label="Delivery date" required value={f.deliveryDate} onChange={(v) => set("deliveryDate", v)} />
            <DatePicker id="nso-proceed-date" label="Planned production start" required value={f.proceedDate} onChange={(v) => set("proceedDate", v)} />
          </div>
        </Panel>

        <Panel title={`Items (${f.lines.length})`} right={<Button size="sm" icon="add" onClick={() => set("lines", [...f.lines, newLine()])}>Add item</Button>}>
          <div className="flex flex-col gap-3">
            {f.lines.map((l, i) => (
              <div key={l.key} className="grid items-end gap-3 min-[768px]:grid-cols-[minmax(0,1fr)_96px_160px_auto]">
                <Select id={`nso-sku-${l.key}`} label="Item" value={l.sku || undefined} options={skuOptions}
                  onValueChange={(v) => setLine(l.key, { sku: v, unitPrice: String(skuOptions.find((o) => o.value === v)?.price ?? "") })} />
                <Input id={`nso-qty-${l.key}`} label="Qty" type="number" min={1} value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                <Input id={`nso-price-${l.key}`} label="Unit price (RM)" type="number" min={0} value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} />
                <Button iconOnly icon="delete" aria-label={`Remove item ${i + 1}`} disabled={f.lines.length === 1}
                  onClick={() => set("lines", f.lines.filter((x) => x.key !== l.key))} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Payment">
          <div className="grid gap-3 min-[768px]:grid-cols-2">
            <Select id="nso-method" label="Payment method" required value={f.paymentMethod || undefined}
              onValueChange={(v) => setF((p) => ({ ...p, paymentMethod: v, followUps: {} }))}
              options={methods.map((m) => ({ value: m.key, label: m.label }))} />
            <Input id="nso-paid" label="Deposit paid (RM)" type="number" min={0} value={f.paid} onChange={(e) => set("paid", e.target.value)} />
            {method?.approvalCodeRequired && (
              <Input id="nso-approval" label="Reference code" required value={f.approvalCode} onChange={(e) => set("approvalCode", e.target.value)} />
            )}
            {method?.followUps.map((fu) => (
              <Select key={fu.key} id={`nso-fu-${fu.key}`} label={fu.label} required={fu.required} value={f.followUps[fu.key] || undefined}
                onValueChange={(v) => set("followUps", { ...f.followUps, [fu.key]: v })}
                options={fu.options.map((o) => ({ value: o, label: o }))} />
            ))}
          </div>
        </Panel>

        <Panel title="Customer signature">
          <div className="flex flex-col gap-3">
            <SignaturePad value={f.signature} onChange={(v) => set("signature", v)} />
            <Checkbox id="nso-terms" label="The customer accepted the Sales Order terms" checked={f.termsAccepted} onCheckedChange={(v) => set("termsAccepted", v)} />
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
