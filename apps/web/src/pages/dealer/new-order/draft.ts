import type { ComboDto } from "@carres/shared";
import { explodeCombo } from "@carres/shared";

/**
 * Wizard draft state — local UI shape, not the DB row.
 *
 * Persisted to sessionStorage on every change so a refresh, accidental tab
 * close, or sidebar misclick doesn't wipe 5 minutes of typing (per Phase 2B
 * eng-review D4 decision).
 *
 * Slice 2B.2 covers Step 1; 2B.3.b adds lines/addons; 2B.3.c adds Step 3 fields
 * (paid, payment, signature, termsAccepted, wizardSessionId).
 *
 * Emergency-contact fields are kept structured here (name + phone + relationship)
 * for editing convenience; the persisted DB column `customer_emergency` is a
 * single composed string built via `composeEmergency()` at submit time.
 */
/**
 * A single line item the wizard has staged. Mirrors the OrderLineInput shape
 * (camelCase, sku + qty + attrs + unitPrice) plus a transient `localId` used
 * for React keys + Remove targeting since real `id` lands only after the RPC
 * inserts the row. attrs may carry { color, gap } for bedframe or
 * { fabric_name, fabric_surcharge, fabric_tier } for sofa custom-with-fabric.
 */
export interface DraftLine {
  localId: string;
  sku: string;
  qty: number;
  attrs: Record<string, unknown> | null;
  unitPrice: number;
  /** Free-text label for the LineList row, e.g. "Carres Cloud · Queen" */
  label: string;
}

/**
 * Fresh local id for a staged line. Inlined here (NOT imported from
 * `configurators.tsx`) so this lower-level draft module never depends on a
 * React component file — same `crypto.randomUUID()`-with-JSDOM-guard pattern.
 */
function newLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Explode a fixed-set combo (套餐, migration 0177) into the component
 * `DraftLine`s the cart + submit pipeline already understand. PURE: no React,
 * no IO — delegates the price split to shared `explodeCombo` (integer-cents,
 * proportional to each component's selling price), then maps each exploded
 * line into a `DraftLine` carrying `attrs.combo_key` / `attrs.combo_label` so
 * the CartDrawer can group them under one "Remove combo".
 *
 * `lookup(sku)` supplies the SELLING price (for the split weight) + a human
 * label, both from the catalog index. A component SKU absent from the
 * (pos_active-filtered) catalog bundle returns `price: NaN`; `explodeCombo`
 * treats a non-finite price as 0 weight, so that component is priced 0 and the
 * remaining components absorb the combo price — the combo TOTAL still equals
 * `comboPrice`. Accepted v1 behaviour (the controller's carry-forward); we do
 * NOT try to fetch inactive sku prices here.
 *
 * `attrs` is EXACTLY `{ combo_key, combo_label }` — combo components are
 * concrete SKUs with no configurator options in v1.
 */
export function comboToDraftLines(
  combo: ComboDto,
  lookup: (sku: string) => { price: number; label: string },
): DraftLine[] {
  const exploded = explodeCombo(
    {
      comboKey: combo.comboKey,
      name: combo.name,
      comboPrice: combo.comboPrice,
      components: combo.components,
    },
    (sku) => lookup(sku).price,
  );
  return exploded.map((e) => ({
    localId: newLocalId(),
    sku: e.sku,
    qty: e.qty,
    attrs: { combo_key: e.comboKey, combo_label: e.comboLabel },
    unitPrice: e.unitPrice,
    label: lookup(e.sku).label || e.sku,
  }));
}

/** Addon staged on the order. Persisted as order_addons rows on submit.
 *
 * 2026-05-19 — disposal addons carry a size tag in `attrs`. The frontend
 * (Step2Products) enforces "size required" for any key starting with
 * `dispose-`; the create_order RPC just persists whatever is sent. */
export interface DraftAddon {
  key: string;       // matches addons.key
  qty: number;
  unitPrice: number; // snapshot at staging time
  name: string;      // for LineList rendering
  /** Free-form attrs jsonb. For disposal addons: { size: "King" } etc. */
  attrs?: { size?: string } | null;
}

/** Returns true if the addon is a disposal service (size tag required). */
export function isDisposalAddon(key: string): boolean {
  return key.startsWith("dispose-");
}

/** Size options keyed by disposal sub-kind. Mattress + Bedframe share one set
 *  per Loo 2026-05-19; Sofa uses its own seating-config sizes. */
export const DISPOSAL_SIZE_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  "dispose-mattress": ["King", "Queen", "Super Single", "Single"] as const,
  "dispose-bedframe": ["King", "Queen", "Super Single", "Single"] as const,
  "dispose-sofa":     ["2-seater", "3-seater", "L-shape"] as const,
};

/**
 * Slip / signature attachment cached in the wizard before upload. We keep the
 * full base64 dataUrl so refresh can restore the preview AND we can re-derive
 * a Blob for the eventual Storage upload (real File objects don't survive
 * JSON.stringify into sessionStorage).
 */
export interface DraftAttachment {
  name: string;     // user-visible filename
  size: number;     // bytes — for the "x KB" hint
  mime: string;     // image/png, image/jpeg, application/pdf
  dataUrl: string;  // base64 — preview + upload Blob source
}

/** Payment metadata captured in Step 3. method/approvalCode/installmentMonths
 *  are UI-side only (not persisted in 2B.3.c — see Phase 2D). slip is the
 *  bank/EDC slip the dealer attached. */
export interface DraftPayment {
  method: "online" | "credit" | "installment";
  approvalCode: string;
  installmentMonths: 6 | 12;
  slip: DraftAttachment | null;
}

export interface WizardDraft {
  outletId: string | null;
  salespersonId: string | null;
  customer: {
    name: string;
    phone: string;
    /** Composed string for legacy drafts only — new flow uses the structured
     *  fields below and composes via `composeAddress` at submit time. The
     *  schema/DB column stays `customer_address text` so this is what reaches
     *  the wire. */
    address: string;
    /** Cascading Malaysia address fields. State picks city dropdown, city
     *  picks postcode dropdown. Required when `addressUnknown` is false.
     *  addressLine2 is optional (unit / block / floor). */
    addressLine1: string;
    addressLine2: string;
    addressState: string;
    addressCity: string;
    addressPostcode: string;
    addressUnknown: boolean;
    billing: string;
    billingSame: boolean;
    emergencyName: string;
    emergencyPhone: string;
    emergencyRelationship: string;
    emergencyRelationshipOther: string;
  };
  delivery: {
    date: string;
    // Phase 11.1 (Loo) — salesperson-entered planned production-start
    // ("Proceed") date. Paired with `date` via the same `dateTbd` toggle
    // (both-or-neither). Must be on/before `date`. Empty string = not picked.
    proceedDate: string;
    dateTbd: boolean;
    floor: number;
    hasLift: boolean;
    // 2026-05-13 (Loo) — Dealer-picked count of items needing stair carry.
    // null = "auto = all items" (legacy behavior). Lets dealer charge for
    // partial coverage when only some of the lines go above the free floor.
    stairItems: number | null;
    // 2026-05-10 (Loo) — "As Fast As Possible" pill on Step1. When clicked,
    // sets date = today + 20 days and flips this flag. After successful
    // order create, the wizard auto-fires the Proceed mutation so the order
    // skips the manual Place→Proceed click. If Proceed conditions aren't
    // met (e.g. insufficient deposit), we surface the error and the order
    // stays in 'place' for the dealer to top up + manually proceed.
    asap?: boolean;
  };
  /** Step 2: products picked + addons toggled. Empty array = no products yet. */
  lines: DraftLine[];
  addons: DraftAddon[];
  /** Step 3 — payment received amount (≥0, ≤total). 50% of total = "Proceed"
   *  banner threshold; doesn't gate Submit (see Phase 2C). */
  paid: number;
  payment: DraftPayment;
  /** PNG dataURL captured by the signature canvas. Required to submit. */
  signature: string | null;
  /** T&C checkbox — must be true to submit. */
  termsAccepted: boolean;
  /** Stable folder UUID used for Storage paths
   *  (`orders-attachments/{dealerId}/{wizardSessionId}/...`).
   *  Generated lazily on Step 3 mount; persists across refresh + draft restore. */
  wizardSessionId: string | null;
}

export const DRAFT_STORAGE_KEY = "carres-order-draft";

export function emptyDraft(): WizardDraft {
  return {
    outletId: null,
    salespersonId: null,
    customer: {
      name: "",
      phone: "",
      address: "",
      addressLine1: "",
      addressLine2: "",
      addressState: "",
      addressCity: "",
      addressPostcode: "",
      addressUnknown: false,
      billing: "",
      billingSame: true,
      emergencyName: "",
      emergencyPhone: "",
      emergencyRelationship: "",
      emergencyRelationshipOther: "",
    },
    delivery: { date: "", proceedDate: "", dateTbd: false, floor: 1, hasLift: false, stairItems: null, asap: false },
    lines: [],
    addons: [],
    paid: 0,
    payment: {
      method: "online",
      approvalCode: "",
      installmentMonths: 6,
      slip: null,
    },
    signature: null,
    termsAccepted: false,
    wizardSessionId: null,
  };
}

export function saveDraft(draft: WizardDraft): void {
  try {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Quota or private mode — silently fail. Draft is still in React state for
    // this session; refresh resilience just won't work, no other consequence.
  }
}

export function loadDraft(): WizardDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WizardDraft>;
    // Shape guard — if structure drifted between deploys we just toss the draft
    // rather than render a half-broken form.
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.customer || !parsed.delivery) return null;
    // Backfill 2B.3 + structured-address fields for drafts saved before each
    // slice landed. We never delete the legacy `address` string; it just sits
    // unused once the structured fields exist.
    const empty = emptyDraft();
    const customer = {
      ...empty.customer,
      ...parsed.customer,
      addressLine1: parsed.customer.addressLine1 ?? empty.customer.addressLine1,
      addressLine2: parsed.customer.addressLine2 ?? empty.customer.addressLine2,
      addressState: parsed.customer.addressState ?? empty.customer.addressState,
      addressCity: parsed.customer.addressCity ?? empty.customer.addressCity,
      addressPostcode: parsed.customer.addressPostcode ?? empty.customer.addressPostcode,
    };
    // Only backfill the new stairItems field for old drafts; don't merge in
    // empty.delivery (that would inject defaults like asap=false the original
    // draft never had, breaking save/load round-trip equality).
    const delivery = {
      ...parsed.delivery,
      // Phase 11.1 — backfill proceedDate for drafts saved before this field
      // existed, so old in-flight drafts restore cleanly.
      proceedDate:
        typeof parsed.delivery.proceedDate === "string"
          ? parsed.delivery.proceedDate
          : "",
      stairItems:
        typeof parsed.delivery.stairItems === "number"
          ? parsed.delivery.stairItems
          : null,
    };
    return {
      ...(parsed as WizardDraft),
      customer,
      delivery,
      lines: parsed.lines ?? [],
      addons: parsed.addons ?? [],
      paid: typeof parsed.paid === "number" ? parsed.paid : empty.paid,
      payment: parsed.payment
        ? {
            method: parsed.payment.method ?? empty.payment.method,
            approvalCode: parsed.payment.approvalCode ?? empty.payment.approvalCode,
            installmentMonths:
              parsed.payment.installmentMonths === 12 ? 12 : empty.payment.installmentMonths,
            slip: parsed.payment.slip ?? null,
          }
        : empty.payment,
      signature: parsed.signature ?? empty.signature,
      termsAccepted: parsed.termsAccepted === true,
      wizardSessionId: parsed.wizardSessionId ?? empty.wizardSessionId,
    };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Ignore — sessionStorage write failures aren't actionable here.
  }
}

/**
 * Step 1 gate — matches proto/new-order.jsx canStep1 logic. Returns true when
 * the dealer has filled enough to advance to Step 2.
 *
 * Rules (mirror prototype):
 *   - Customer name ≥ 2 chars
 *   - Phone matches /^[0-9-+\s]{8,}/  (8+ chars, only digits/dash/plus/space)
 *   - Emergency name ≥ 2 chars + phone matches same
 *   - Emergency relationship picked AND ("Others" only valid with relOther ≥ 2)
 *   - Either addressUnknown OR address ≥ 5 chars
 *   - Either billingSame OR billing ≥ 5 chars
 *   - Either delivery.dateTbd OR delivery.date is set
 *   - outletId + salespersonId both set
 */
const PHONE_RE = /^[0-9-+\s]{8,}/;

export function step1Valid(d: WizardDraft): boolean {
  return step1FirstIssue(d) === null;
}

/**
 * Returns the first failing field's user-friendly label, or null if Step 1
 * is fully valid. Used by the wizard footer to surface "Continue 灰着" reasons
 * inline so dealers don't have to scroll the form hunting for the missing
 * field. Order matches the form's visual top-to-bottom layout.
 *
 * 2026-05-22 (Loo) — delivery date moved out of Step 1 into the new Step 3
 * because the date constraint depends on what's in the cart (mattress +
 * bedframe = today + 14 days, sofa = today + 21 days). See
 * `step3DateFirstIssue` for the new gate.
 */
export function step1FirstIssue(d: WizardDraft): string | null {
  const c = d.customer;
  if (!d.outletId)        return "Sale info — pick an Outlet";
  if (!d.salespersonId)   return "Sale info — pick a Salesperson";
  if (c.name.trim().length < 2)   return "Customer — full name (≥2 chars)";
  if (!PHONE_RE.test(c.phone))    return "Customer — phone (≥8 digits)";
  if (c.emergencyName.trim().length < 2)   return "Emergency Contact — name";
  if (!PHONE_RE.test(c.emergencyPhone))    return "Emergency Contact — phone";
  if (!c.emergencyRelationship)            return "Emergency Contact — relationship";
  if (c.emergencyRelationship === "__OTHER__" && c.emergencyRelationshipOther.trim().length < 2) {
    return "Emergency Contact — describe the 'Other' relationship";
  }
  if (!c.addressUnknown) {
    if (c.addressLine1.trim().length < 5)   return "Address — Line 1 (≥5 chars), or tick 'Unknown'";
    if (!c.addressState)                    return "Address — State, or tick 'Unknown'";
    if (!c.addressCity)                     return "Address — City, or tick 'Unknown'";
    if (!c.addressPostcode)                 return "Address — Postcode, or tick 'Unknown'";
  }
  if (!c.billingSame && c.billing.trim().length < 5) return "Billing — fill billing address, or tick 'Same as delivery'";
  return null;
}

/**
 * Step 2 gate — at least one line must be staged AND every selected disposal
 * addon must have a size picked. Lines.length > 0 mirrors the proto; the
 * disposal-size check was added 2026-05-19 so partners pick up the right
 * size of old furniture.
 */
export function step2Valid(d: WizardDraft): boolean {
  if (d.lines.length === 0) return false;
  for (const a of d.addons) {
    if (isDisposalAddon(a.key) && !a.attrs?.size) return false;
  }
  return true;
}

/** Returns the first failing disposal addon's display label, or null when
 *  every disposal has a size. Used by the wizard footer to surface a
 *  specific reason rather than a generic "Continue" disabled state. */
export function step2FirstDisposalIssue(d: WizardDraft): string | null {
  for (const a of d.addons) {
    if (isDisposalAddon(a.key) && !a.attrs?.size) {
      return `${a.name} — pick a size`;
    }
  }
  return null;
}

/**
 * Step 3 gate — 2026-05-22 (Loo). Dedicated to the delivery date now that
 * it's been split out of Step 1. The caller passes `minLeadDays` (computed
 * from the cart's categories — see shared `maxLeadDaysFor`) so this module
 * stays catalog-agnostic.
 *
 *   - TBD is accepted (order parks in Place until a real date is entered)
 *   - Otherwise the picked date must be on/after today + minLeadDays
 */
export function step3DateValid(d: WizardDraft, minLeadDays: number, today: Date = new Date()): boolean {
  return step3DateFirstIssue(d, minLeadDays, today) === null;
}

export function step3DateFirstIssue(
  d: WizardDraft,
  minLeadDays: number,
  today: Date = new Date(),
): string | null {
  if (d.delivery.dateTbd) return null;
  if (!d.delivery.date) return "Delivery — pick a date, or tick 'Confirm later'";
  if (minLeadDays > 0) {
    const min = new Date(today);
    min.setDate(min.getDate() + minLeadDays);
    const picked = new Date(d.delivery.date);
    if (picked < new Date(min.toISOString().slice(0, 10))) {
      return `Delivery — earliest date is ${min.toISOString().slice(0, 10)} (${minLeadDays}-day lead time)`;
    }
  }
  // Phase 11.1 (Loo) — the salesperson must ALSO commit a proceed
  // (production-start) date whenever a delivery date is set. It can't be in the
  // past and can't be after the delivery date (you don't start building after
  // you've promised delivery). TBD orders skip this (handled by the early
  // return above) — both dates get filled in later via the confirm-date flow.
  if (!d.delivery.proceedDate) {
    return "Proceed date — pick when production should start, or tick 'Confirm later'";
  }
  const todayIso = today.toISOString().slice(0, 10);
  if (d.delivery.proceedDate < todayIso) {
    return `Proceed date — can't be in the past (earliest ${todayIso})`;
  }
  if (d.delivery.proceedDate > d.delivery.date) {
    return "Proceed date — must be on or before the delivery date";
  }
  return null;
}

/**
 * Step 4 / Submit gate — every business-required field is set.
 *
 * Rules (mirror proto/new-order-step3 paymentMethodOk + signature/T&C check):
 *   - signature is a non-empty PNG dataURL
 *   - termsAccepted is literal true
 *   - payment slip is attached (all three methods need one — see proto
 *     `paymentMethodOk` ternary)
 *   - if method !== "online": approvalCode trimmed length ≥ 3
 *   - if method === "installment": installmentMonths is 6 or 12 (default 6 is fine)
 *   - paid is a finite number ≥ 0 (50% threshold is a preview banner, not a
 *     hard gate per Phase 2B → Place→Proceed transition lives in Phase 2C)
 *
 * 2026-05-22 (Loo) — renamed from step3Valid when the wizard added a new
 * step 3 for delivery date. Body unchanged.
 */
export function step4Valid(d: WizardDraft): boolean {
  if (!d.signature || !d.signature.startsWith("data:image/")) return false;
  if (!d.termsAccepted) return false;
  if (!d.payment.slip) return false;
  // 2026-05-10 (Loo) — approval code / reference number is REQUIRED for
  // every payment method, including online bank transfer. Without it the
  // accountant can't reconcile the deposit against the bank statement and
  // the order sits unprocessed. Was previously gated only on
  // method !== 'online' and online was let through with just a slip.
  if (d.payment.approvalCode.trim().length < 3) return false;
  if (d.payment.method === "installment") {
    if (d.payment.installmentMonths !== 6 && d.payment.installmentMonths !== 12) return false;
  }
  if (!Number.isFinite(d.paid) || d.paid < 0) return false;
  return true;
}

/** @deprecated 2026-05-22 (Loo) — renamed to `step4Valid` after the wizard
 *  added a dedicated step 3 for delivery date. Alias kept until the test
 *  files and DealerNewOrder.tsx are updated. Remove once no consumer
 *  references it. */
export const step3Valid = step4Valid;

/** Convert a base64 dataURL into a Blob for upload. Throws on malformed input. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, encoded] = dataUrl.split(",");
  if (!header || !encoded) throw new Error("Invalid dataURL");
  const mimeMatch = /data:([^;]+);base64/.exec(header);
  const mime = mimeMatch?.[1] ?? "application/octet-stream";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Compose emergency contact into the single string the DB column holds.
 * "Alice · 012-3456789 · Spouse" or with "__OTHER__" → uses `relOther` instead.
 * Used at submit time (2B.3); also handy for the "billing same as delivery"
 * preview in Step 1.
 */
export function composeEmergency(c: WizardDraft["customer"]): string {
  const rel =
    c.emergencyRelationship === "__OTHER__"
      ? c.emergencyRelationshipOther.trim()
      : c.emergencyRelationship;
  return [c.emergencyName.trim(), c.emergencyPhone.trim(), rel].filter(Boolean).join(" · ");
}
