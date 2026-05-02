/**
 * Wizard draft state — local UI shape, not the DB row.
 *
 * Persisted to sessionStorage on every change so a refresh, accidental tab
 * close, or sidebar misclick doesn't wipe 5 minutes of typing (per Phase 2B
 * eng-review D4 decision).
 *
 * Slice 2B.2 covers Step 1 fields only. 2B.3 will add lines / addons /
 * payment / signature / termsAccepted to this same shape.
 *
 * Emergency-contact fields are kept structured here (name + phone + relationship)
 * for editing convenience; the persisted DB column `customer_emergency` is a
 * single composed string built via `composeEmergency()` at submit time (2B.3).
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

export interface WizardDraft {
  outletId: string | null;
  salespersonId: string | null;
  customer: {
    name: string;
    phone: string;
    address: string;
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
    // Backfill 2B.3 fields for drafts saved before this slice landed.
    return {
      ...(parsed as WizardDraft),
      lines: parsed.lines ?? [],
      addons: parsed.addons ?? [],
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
  if (!c.addressUnknown && c.address.trim().length < 5) return false;
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
