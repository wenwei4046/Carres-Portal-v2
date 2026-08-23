import {
  cartHasGoods,
  composeEmergencyContact,
  EMERGENCY_RELATIONSHIP_OTHER,
  ORDER_ENTRY_TABS,
  resolveFormTab,
  resolvePaymentMethods,
  STRIPE_METHOD_KEY,
  type CatalogResponse,
  type FormFieldsConfig,
  type PaymentMethodConfig,
} from "@carres/shared";

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
  /** TRANSIENT (0185, free-item "Make free") — the line's REAL unit price parked
   *  while it's claimed free (its preview `unitPrice` is forced to 0). Dropped at
   *  submit (DealerPos sends only sku/qty/attrs/unitPrice), so it never reaches
   *  the wire; the server is authoritative for the freed price (forces 0). */
  origUnitPrice?: number;
}

/** Addon staged on the order. Persisted as order_addons rows on submit.
 *
 * 2026-05-19 — disposal addons carry a size tag in `attrs`. The frontend
 * enforces "size required" for disposal add-ons; the create_order RPC just
 * persists whatever is sent.
 *
 * 2026-07-21 (Loo) — qty > 1 may mix sizes (one Single + one Queen old
 * mattress): `sizes` holds ONE entry PER UNIT (length = qty) and is the
 * structured truth; `size` is kept as the composed human summary (e.g.
 * "Queen + Single") so every downstream reader of attrs.size — order detail,
 * cart drawer, SO PDF, ops — renders correctly without change. */
export interface DraftAddon {
  key: string;       // matches addons.key
  qty: number;
  unitPrice: number; // snapshot at staging time
  name: string;      // for LineList rendering
  /** 0242 — the addon's size list SNAPSHOT at staging time (from the catalog
   *  `addons.size_options` config; principal-editable in Order Add-ons).
   *  Non-empty = size required per unit. Absent on legacy drafts — the
   *  hardcoded DISPOSAL_SIZE_OPTIONS fallback covers those. */
  sizeOptions?: string[];
  /** Free-form attrs jsonb. For sized addons: { size, sizes } — see above. */
  attrs?: { size?: string; sizes?: string[] } | null;
}

/** LEGACY fallback size options keyed by disposal sub-kind (pre-0242 the size
 *  lists were hardcoded here; Mattress + Bedframe share one set per Loo
 *  2026-05-19). Since 0242 the authoritative list is `addons.size_options`
 *  (config, snapshotted onto DraftAddon.sizeOptions at staging) — this table
 *  only covers in-flight drafts staged before the cutover. */
export const DISPOSAL_SIZE_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  "dispose-mattress": ["King", "Queen", "Super Single", "Single"] as const,
  "dispose-bedframe": ["King", "Queen", "Super Single", "Single"] as const,
};

/** The size list this staged addon offers: the 0242 config snapshot first,
 *  the legacy hardcoded table as fallback. Empty = no size pick needed. */
export function addonSizeOptions(a: DraftAddon): readonly string[] {
  if (a.sizeOptions?.length) return a.sizeOptions;
  return DISPOSAL_SIZE_OPTIONS[a.key] ?? [];
}

/** True when the staged addon requires a size pick — i.e. it HAS a non-empty
 *  size list (0242 config-driven; an add-on with no list never gates). */
export function addonRequiresSize(a: DraftAddon): boolean {
  return addonSizeOptions(a).length > 0;
}

/** Per-unit size list for a disposal addon, normalized to length = qty.
 *  Reads the structured `sizes` array; a legacy draft carrying only the old
 *  single `size` seeds unit 1 with it. Missing tail units pad as "" (unpicked). */
export function disposalUnitSizes(a: DraftAddon): string[] {
  const base = a.attrs?.sizes ?? (a.attrs?.size ? [a.attrs.size] : []);
  const out: string[] = [];
  for (let i = 0; i < a.qty; i++) out.push(base[i] ?? "");
  return out;
}

/** Human summary of per-unit sizes for attrs.size (what documents/detail
 *  screens render): "Queen" · "Queen ×2" · "Queen + Single". Unpicked units
 *  are skipped; empty result = nothing picked yet. */
export function composeDisposalSizeSummary(sizes: string[]): string {
  const counts = new Map<string, number>();
  for (const s of sizes) {
    if (!s) continue;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([s, n]) => (n > 1 ? `${s} ×${n}` : s))
    .join(" + ");
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

/** Payment metadata captured in Step 3. slip is the bank/EDC slip the dealer
 *  attached. 0219 — `method` is any configured method key (config-driven;
 *  e.g. "cash"), and `followUps` holds the method's follow-up dropdown
 *  answers keyed by followUp key (e.g. { bank: "Maybank" }). */
export interface DraftPayment {
  method: string;
  approvalCode: string;
  installmentMonths: 6 | 12;
  slip: DraftAttachment | null;
  followUps?: Record<string, string>;
}

export interface WizardDraft {
  /** POS-parity (2990s) — an INTERNAL operator (principal) picks the dealer the
   *  order belongs to in-flow at the CUSTOMER step. Dealer-side logins never
   *  set these (their JWT dealer wins; the fields stay null). Optional so
   *  drafts saved before this field existed restore cleanly. */
  actingDealerId?: string | null;
  actingDealerName?: string | null;
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
    /** Building type of the delivery address (Loo 2026-07-19 — landed / condo
     *  / apartment / office / retail / other). Optional; rides to the server
     *  in `entry_data.fields.building_type` (no orders column). */
    buildingType: string;
    billing: string;
    billingSame: boolean;
    /** Structured billing parts (Loo 2026-07-18 — the raw New Order keys the
     *  billing address with the SAME MY cascade as delivery). Composed into
     *  the single `billing` string at submit (`customer_billing` stays text).
     *  Since 2026-07-19 the POS wizard keys billing with the same cascade too
     *  (the free-text box is gone). Defaults "" — old drafts restore cleanly
     *  via the emptyDraft spread in loadDraft. */
    billingLine1: string;
    billingLine2: string;
    billingState: string;
    billingCity: string;
    billingPostcode: string;
    emergencyName: string;
    emergencyPhone: string;
    emergencyRelationship: string;
    emergencyRelationshipOther: string;
    /** 0200 — POS-parity demographics (2990s customer step). POS-required
     *  (step1 gate), server-lenient. Stored as strings; "" = not filled. */
    email: string;
    race: string;
    gender: string;
    birthday: string;
    /** 0219 — operator-configured CUSTOM form-field values, keyed by the
     *  configured field key (all 4 tabs share one bag — keys are unique per
     *  config). Optional so pre-0219 drafts restore cleanly. */
    custom?: Record<string, string>;
  };
  delivery: {
    date: string;
    // Phase 11.1 (Loo) — salesperson-entered planned production-start
    // ("Proceed") date. Paired with `date` (both-or-neither) and must be
    // on/before it. Empty string = not picked.
    proceedDate: string;
    /** ⛔ RETIRED 2026-08-15 (Jess) — nothing sets this to `true` any more.
     *  The field stays in the shape so `CreateOrderInput` keeps its wire
     *  contract and old sessionStorage drafts still parse; `loadDraft`
     *  normalises it to `false` on restore. */
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
  /** 0184 (2990s parity Phase 6) — the operator's free-form additional delivery
   *  fee (RM, ≥0) entered in the CONFIRM step. Threaded into CreateOrderInput;
   *  the server is authoritative for the base + cross portions. Optional so old
   *  in-flight drafts (saved before this field existed) restore cleanly. */
  additionalDeliveryFee?: number;
  /** 0184 — the customer's earlier SO this order is a cross-category follow-up
   *  of ("" = none). Validated server-side before booking. */
  crossCategorySourceSo?: string;
  /** 0224 — Stripe pay-before-create: the pending (still-unpaid) order minted
   *  when the dealer tapped "Collect & complete order". Persisted so a refresh
   *  resumes the SAME order's QR instead of minting a duplicate SO. Cleared on
   *  payment success or explicit cancel. */
  stripePending?: { orderId: string; so: number; amount: number } | null;
}

export const DRAFT_STORAGE_KEY = "carres-order-draft";
/** Maintain → New Order keeps its own sessionStorage slot — a raw draft in
 *  progress must never clobber (or restore into) the POS cart draft. */
export const RAW_DRAFT_STORAGE_KEY = "carres-raw-order-draft";

export function emptyDraft(): WizardDraft {
  return {
    actingDealerId: null,
    actingDealerName: null,
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
      buildingType: "",
      billing: "",
      billingSame: true,
      billingLine1: "",
      billingLine2: "",
      billingState: "",
      billingCity: "",
      billingPostcode: "",
      emergencyName: "",
      emergencyPhone: "",
      emergencyRelationship: "",
      emergencyRelationshipOther: "",
      email: "",
      race: "",
      gender: "",
      birthday: "",
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
    additionalDeliveryFee: 0,
    crossCategorySourceSo: "",
  };
}

export function saveDraft(draft: WizardDraft, storageKey: string = DRAFT_STORAGE_KEY): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(draft));
  } catch {
    // Quota or private mode — silently fail. Draft is still in React state for
    // this session; refresh resilience just won't work, no other consequence.
  }
}

export function loadDraft(storageKey: string = DRAFT_STORAGE_KEY): WizardDraft | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
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
      // ⛔ 2026-08-15 (Jess) — "Confirm later" is retired. A draft saved from
      // the old wizard may still carry `dateTbd: true`; restoring it as-is
      // would put the salesperson in front of a disabled picker with no way
      // to clear it, and the create door would refuse the submit. Normalise
      // on restore: the date fields keep whatever was typed, the retired flag
      // does not survive.
      dateTbd: false,
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
            followUps: parsed.payment.followUps ?? {},
          }
        : empty.payment,
      signature: parsed.signature ?? empty.signature,
      termsAccepted: parsed.termsAccepted === true,
      wizardSessionId: parsed.wizardSessionId ?? empty.wizardSessionId,
      // Valid pointer restores; anything else collapses to undefined (which
      // toEqual/JSON both treat as absent — pre-0224 drafts roundtrip clean).
      stripePending:
        parsed.stripePending &&
        typeof parsed.stripePending.orderId === "string" &&
        typeof parsed.stripePending.amount === "number"
          ? (parsed.stripePending as WizardDraft["stripePending"])
          : undefined,
    };
  } catch {
    return null;
  }
}

export function clearDraft(storageKey: string = DRAFT_STORAGE_KEY): void {
  try {
    sessionStorage.removeItem(storageKey);
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
 *   - Either billingSame OR the billing MY cascade complete (Line 1 ≥ 5 chars
 *     + state + city + postcode — same rule as delivery)
 *   - Either delivery.dateTbd OR delivery.date is set
 *   - outletId + salespersonId both set
 */
const PHONE_RE = /^[0-9-+\s]{8,}/;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

export function step1Valid(d: WizardDraft, formCfg?: FormFieldsConfig | null): boolean {
  return step1FirstIssue(d, formCfg) === null;
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
export function step1FirstIssue(
  d: WizardDraft,
  formCfg?: FormFieldsConfig | null,
): string | null {
  const c = d.customer;
  // 0219 — the customer/emergency builtin fields are config-toggleable (SO
  // Maintenance "Order Entry" editor). Absent config → defaults = the exact
  // pre-0219 gates. Locked fields (outlet/salesperson/name/phone/address)
  // always apply.
  const cust = resolveFormTab(formCfg ?? null, "customer").builtins;
  const emg = resolveFormTab(formCfg ?? null, "emergency").builtins["emergency"];
  if (!d.outletId)        return "Sale info — pick an Outlet";
  if (!d.salespersonId)   return "Sale info — pick a Salesperson";
  if (c.name.trim().length < 2)   return "Customer — full name (≥2 chars)";
  if (!PHONE_RE.test(c.phone))    return "Customer — phone (≥8 digits)";
  // 0200 — POS-parity demographics (2990s: POS-required, server-lenient).
  // Required per config; a NON-required but filled email still needs a valid shape.
  if (cust["email"]?.required && !EMAIL_RE.test(c.email.trim())) return "Customer — email";
  if (cust["email"]?.enabled && !cust["email"]?.required && c.email.trim() && !EMAIL_RE.test(c.email.trim())) {
    return "Customer — email (invalid format)";
  }
  if (cust["race"]?.required && !c.race)         return "Customer — race";
  if (cust["gender"]?.required && !c.gender)     return "Customer — gender";
  if (cust["birthday"]?.required && !c.birthday) return "Customer — birthday";
  if (emg?.required) {
    if (c.emergencyName.trim().length < 2)   return "Emergency Contact — name";
    if (!PHONE_RE.test(c.emergencyPhone))    return "Emergency Contact — phone";
    if (!c.emergencyRelationship)            return "Emergency Contact — relationship";
    if (c.emergencyRelationship === "__OTHER__" && c.emergencyRelationshipOther.trim().length < 2) {
      return "Emergency Contact — describe the 'Other' relationship";
    }
  }
  if (!c.addressUnknown) {
    if (c.addressLine1.trim().length < 5)   return "Address — Line 1 (≥5 chars), or tick 'Unknown'";
    if (!c.addressState)                    return "Address — State, or tick 'Unknown'";
    if (!c.addressCity)                     return "Address — City, or tick 'Unknown'";
    if (!c.addressPostcode)                 return "Address — Postcode, or tick 'Unknown'";
    /* 2026-08-21 (Jess) — building type is DELIVERY's fact: stairs, lift
     * access and van parking all hang off it, and Operations was chasing the
     * shop for it after the sale. The office door began refusing a create
     * without it the same day; this is the POS half, and it sits INSIDE the
     * address branch for the same reason the office one does — an address
     * nobody has yet cannot be asked what kind of building it is. */
    if (!c.buildingType)                    return "Address — Building type, or tick 'Unknown'";
  }
  // 2026-07-19 (Loo) — billing keys in with the SAME MY cascade as delivery,
  // so the gate mirrors the delivery rules field-for-field.
  if (!c.billingSame) {
    if (c.billingLine1.trim().length < 5) return "Billing — Line 1 (≥5 chars), or tick 'Same as delivery'";
    if (!c.billingState)                  return "Billing — State, or tick 'Same as delivery'";
    if (!c.billingCity)                   return "Billing — City, or tick 'Same as delivery'";
    if (!c.billingPostcode)               return "Billing — Postcode, or tick 'Same as delivery'";
  }
  // 0219 — operator-defined REQUIRED custom fields (all 4 tabs share the
  // d.customer.custom bag; target-tab customs gate here too so the shell's
  // customerReady covers everything before CONFIRM).
  for (const tab of ORDER_ENTRY_TABS) {
    for (const f of resolveFormTab(formCfg ?? null, tab).custom) {
      if (f.required && !(c.custom?.[f.key] ?? "").trim()) {
        return `${f.label} — required`;
      }
    }
  }
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
    // 2026-07-21 — EVERY unit needs its own size (qty 2 may be Queen + Single).
    // 0242 — which add-ons gate is config-driven (addons.size_options).
    if (addonRequiresSize(a) && disposalUnitSizes(a).some((s) => !s)) return false;
  }
  return true;
}

/**
 * ⛔ A SALES ORDER MUST CONTAIN GOODS — owner ruling 2026-08-15.
 *
 * `docs/guarantee/MASTER.md` already gates one category this way (*"a
 * guarantee only sells attached to the item it covers"*); the ruling
 * generalises it to the whole cart. A service with no product on the same
 * order is not a sale — it is a Service Case, and it belongs to the Service
 * channel.
 *
 * **Positive recognition only** (the same rule `line-category.ts` applies to
 * accessories): a SKU the catalog cannot resolve counts as GOODS, so a
 * not-yet-catalogued line never blocks a real sale. With no catalog in hand
 * the gate is silent — the create door re-runs it against the catalog and is
 * the authority.
 *
 * Returns the reason, or `null` when the cart is sellable.
 */
export function cartGoodsIssue(
  d: WizardDraft,
  catalog?: CatalogResponse | null,
): string | null {
  if (!catalog || d.lines.length === 0) return null;
  const categoryBySku = new Map<string, string>();
  const modelById = new Map(catalog.models.map((m) => [m.id, m]));
  for (const s of catalog.skus) {
    const category = modelById.get(s.modelId)?.category;
    if (category) categoryBySku.set(s.sku, category);
  }
  if (cartHasGoods(d.lines.map((l) => categoryBySku.get(l.sku)))) return null;
  return "This order has no product — add the product this service belongs to";
}

/** Returns the first failing sized addon's display label, or null when
 *  every sized-addon unit has a size. Used by the wizard footer to surface a
 *  specific reason rather than a generic "Continue" disabled state. */
export function step2FirstDisposalIssue(d: WizardDraft): string | null {
  for (const a of d.addons) {
    if (!addonRequiresSize(a)) continue;
    const sizes = disposalUnitSizes(a);
    const missing = sizes.filter((s) => !s).length;
    if (missing > 0) {
      return a.qty > 1
        ? `${a.name} — pick a size for each of the ${a.qty} items`
        : `${a.name} — pick a size`;
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
 * ⛔ 2026-08-15 (Jess) — **the date is mandatory.** "Confirm later" is retired:
 * if the date is not confirmed with the customer, Operation must not receive
 * the order. The picked date must still be on/after today + minLeadDays.
 */
export function step3DateValid(d: WizardDraft, minLeadDays: number, today: Date = new Date()): boolean {
  return step3DateFirstIssue(d, minLeadDays, today) === null;
}

export function step3DateFirstIssue(
  d: WizardDraft,
  minLeadDays: number,
  today: Date = new Date(),
): string | null {
  if (!d.delivery.date) {
    return "Delivery date — ask the customer for the date, then pick it";
  }
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
  // you've promised delivery).
  if (!d.delivery.proceedDate) {
    return "Proceed date — pick the day production should start";
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
/**
 * The CONFIRM gate for a RENTAL cart (Loo 2026-07-26, 0276).
 *
 * `step4Valid` demands a payment slip or a Stripe amount, because an ordinary
 * order must be part-paid before it is accepted. A rental collects NOTHING at
 * signing — month 1 is charged by Stripe only after finance approves the credit
 * — so that gate made the rental lane impossible to finish: the Complete button
 * stayed disabled with no visible reason. This is the same gate minus the money.
 *
 * What it still demands is the part that matters: the SIGNATURE and the accepted
 * terms. Those are not a formality here — they ARE the rental agreement Loo said
 * must exist before an order does ("no signature, no order"), and they are what
 * gets stamped onto `rental_agreements.signed_*`.
 */
export function step4ValidRental(d: WizardDraft): boolean {
  if (!d.signature || !d.signature.startsWith("data:image/")) return false;
  if (!d.termsAccepted) return false;
  return true;
}

export function step4Valid(d: WizardDraft, methods?: PaymentMethodConfig[]): boolean {
  if (!d.signature || !d.signature.startsWith("data:image/")) return false;
  if (!d.termsAccepted) return false;
  // 0224 — Stripe online collection: proof is system-generated (PaymentIntent
  // reference + Stripe hosted receipt), so no slip / approval code / follow-ups.
  // The amount to collect must be > 0 — it becomes the Checkout link the
  // ThankYou screen opens; the order itself submits with paid 0.
  if (d.payment.method === STRIPE_METHOD_KEY) {
    return Number.isFinite(d.paid) && d.paid > 0;
  }
  if (!d.payment.slip) return false;
  // 0219 — payment gates are CONFIG-DRIVEN. The method must be one of the
  // resolved ACTIVE methods (caller passes the catalog's list; absent →
  // code defaults incl. cash). Approval code (Loo 2026-05-10, finance
  // reconciliation) is required per the method's approvalCodeRequired flag —
  // cash defaults to exempt; every required follow-up (e.g. the Credit/Debit
  // bank) must be answered.
  const resolved = methods ?? resolvePaymentMethods(null);
  const method = resolved.find((m) => m.key === d.payment.method);
  if (!method) return false;
  if (method.approvalCodeRequired && d.payment.approvalCode.trim().length < 3) return false;
  for (const fu of method.followUps) {
    if (fu.required && !(d.payment.followUps?.[fu.key] ?? "").trim()) return false;
  }
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
    c.emergencyRelationship === EMERGENCY_RELATIONSHIP_OTHER
      ? c.emergencyRelationshipOther.trim()
      : c.emergencyRelationship;
  /* The codec lives in `@carres/shared` since 2026-08-15 — the Sales Order
     object page edits the same column as three fields and must write it the
     same way (ownership Law D). */
  return composeEmergencyContact({
    name: c.emergencyName,
    phone: c.emergencyPhone,
    relationship: rel,
  });
}
