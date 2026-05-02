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
 * { fabric_name, fabric_surcharge } for sofa custom-with-fabric.
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

/** Addon staged on the order. Persisted as order_addons rows on submit. */
export interface DraftAddon {
  key: string;       // matches addons.key
  qty: number;
  unitPrice: number; // snapshot at staging time
  name: string;      // for LineList rendering
}

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
     *  picks postcode dropdown. Required when `addressUnknown` is false. */
    addressLine1: string;
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
    dateTbd: boolean;
    floor: number;
    hasLift: boolean;
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
    delivery: { date: "", dateTbd: false, floor: 1, hasLift: false },
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
      addressState: parsed.customer.addressState ?? empty.customer.addressState,
      addressCity: parsed.customer.addressCity ?? empty.customer.addressCity,
      addressPostcode: parsed.customer.addressPostcode ?? empty.customer.addressPostcode,
    };
    return {
      ...(parsed as WizardDraft),
      customer,
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
  const c = d.customer;
  if (c.name.trim().length < 2) return false;
  if (!PHONE_RE.test(c.phone)) return false;
  if (c.emergencyName.trim().length < 2) return false;
  if (!PHONE_RE.test(c.emergencyPhone)) return false;
  if (!c.emergencyRelationship) return false;
  if (c.emergencyRelationship === "__OTHER__" && c.emergencyRelationshipOther.trim().length < 2) {
    return false;
  }
  // Structured address: when not unknown, require Line 1 (≥5 chars) + the
  // three cascading dropdowns (state → city → postcode) to all be picked.
  if (!c.addressUnknown) {
    if (c.addressLine1.trim().length < 5) return false;
    if (!c.addressState) return false;
    if (!c.addressCity) return false;
    if (!c.addressPostcode) return false;
  }
  if (!c.billingSame && c.billing.trim().length < 5) return false;
  if (!d.delivery.dateTbd && !d.delivery.date) return false;
  if (!d.outletId) return false;
  if (!d.salespersonId) return false;
  return true;
}

/**
 * Step 2 gate — at least one line must be staged. Addons alone don't count
 * (mirrors proto: lines.length > 0 check). The Continue button calls this.
 */
export function step2Valid(d: WizardDraft): boolean {
  return d.lines.length > 0;
}

/**
 * Step 3 / Submit gate — every business-required field is set.
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
 */
export function step3Valid(d: WizardDraft): boolean {
  if (!d.signature || !d.signature.startsWith("data:image/")) return false;
  if (!d.termsAccepted) return false;
  if (!d.payment.slip) return false;
  if (d.payment.method !== "online") {
    if (d.payment.approvalCode.trim().length < 3) return false;
  }
  if (d.payment.method === "installment") {
    if (d.payment.installmentMonths !== 6 && d.payment.installmentMonths !== 12) return false;
  }
  if (!Number.isFinite(d.paid) || d.paid < 0) return false;
  return true;
}

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
