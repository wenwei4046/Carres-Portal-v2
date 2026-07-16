import { z } from "zod";

/**
 * 0219 — Order Entry configurability (Loo 2026-07-12).
 *
 * SO Maintenance is the config center for the POS "Open Sales Order" format:
 *   - PAYMENT METHODS are config-driven (operator can add/edit methods and
 *     per-method follow-up dropdowns, e.g. the bank list for Credit/Debit);
 *   - the CUSTOMER-step form (4 tabs: Customer / Address / Emergency /
 *     Target date) has per-field config: builtin fields can be toggled
 *     (enabled/required, where safe) and operator-defined CUSTOM fields can
 *     be added per tab.
 *
 * Like the 0174 grid config, the field UNIVERSE lives in code (the
 * POS_FORM_BUILTINS registry below) — the DB singleton stores only the
 * operator's lists/overrides, so an EMPTY config means "defaults apply" and
 * pre-0219 behavior is unchanged.
 */

// ---------------------------------------------------------------------------
// Payment methods
// ---------------------------------------------------------------------------

const KEBAB = /^[a-z0-9][a-z0-9-]*$/;

/** A follow-up dropdown asked after picking a method (e.g. Bank for credit). */
export const paymentFollowUpSchema = z
  .object({
    key: z.string().trim().min(1).max(40).regex(KEBAB, "key must be kebab-case"),
    label: z.string().trim().min(1).max(60),
    options: z.array(z.string().trim().min(1).max(60)).min(1).max(60),
    required: z.boolean(),
  })
  .strict();
export type PaymentFollowUp = z.infer<typeof paymentFollowUpSchema>;

export const paymentMethodConfigSchema = z
  .object({
    key: z.string().trim().min(1).max(40).regex(KEBAB, "key must be kebab-case"),
    label: z.string().trim().min(1).max(40),
    sublabel: z.string().trim().max(60),
    active: z.boolean(),
    /** Approval / reference code required before submit (finance reconciles
     *  with it). Cash defaults to false — there is no bank reference. */
    approvalCodeRequired: z.boolean(),
    followUps: z.array(paymentFollowUpSchema).max(3),
  })
  .strict();
export type PaymentMethodConfig = z.infer<typeof paymentMethodConfigSchema>;

/** Malaysian banks seeded as the Credit/Debit follow-up options. The operator
 *  edits the live list in SO Maintenance; this is only the code default. */
export const MY_BANKS: readonly string[] = [
  "Maybank",
  "CIMB Bank",
  "Public Bank",
  "RHB Bank",
  "Hong Leong Bank",
  "AmBank",
  "Bank Islam",
  "Bank Rakyat",
  "BSN",
  "Affin Bank",
  "Alliance Bank",
  "OCBC Bank",
  "UOB",
  "HSBC",
  "Standard Chartered",
];

/** Code defaults — what the POS offers when the config list is EMPTY.
 *  The pre-0219 trio plus Cash; Credit/Debit carries the bank follow-up. */
export const DEFAULT_PAYMENT_METHODS: PaymentMethodConfig[] = [
  {
    key: "online",
    label: "Online transfer",
    sublabel: "FPX / DuitNow",
    active: true,
    approvalCodeRequired: true,
    followUps: [],
  },
  {
    key: "credit",
    label: "Credit / Debit",
    sublabel: "Full payment",
    active: true,
    approvalCodeRequired: true,
    // Bank ships OPTIONAL in the code default so an older POS client (or an
    // in-flight order missing the answer) never 422s the moment the API
    // deploys — the operator flips `required` in the SO Maintenance editor.
    followUps: [{ key: "bank", label: "Bank", options: [...MY_BANKS], required: false }],
  },
  {
    key: "installment",
    label: "Installment",
    sublabel: "6 / 12 months",
    active: true,
    approvalCodeRequired: true,
    followUps: [],
  },
  {
    key: "cash",
    label: "Cash",
    sublabel: "Paid in store",
    active: true,
    approvalCodeRequired: false,
    followUps: [],
  },
];

/** The ACTIVE method list the POS renders + the server validates against:
 *  the configured list when non-empty, else the code defaults. */
/**
 * 0224 — Stripe online collection as a FIRST-CLASS wizard method (Loo
 * 2026-07-15: "后面全部只用这种 payment"). Deliberately NOT part of the
 * operator-editable order_entry_config list: its proof fields (reference =
 * PaymentIntent id, slip = Stripe hosted receipt) are system-generated, so
 * there is nothing for the operator to configure and nothing a config edit
 * should be able to break. Both gates (wizard step4Valid + the Hono create
 * route) special-case this key alongside the resolved config methods.
 */
export const STRIPE_METHOD_KEY = "stripe";
export const STRIPE_PAYMENT_METHOD: PaymentMethodConfig = {
  key: STRIPE_METHOD_KEY,
  label: "Pay online",
  sublabel: "Stripe QR / link",
  active: true,
  approvalCodeRequired: false,
  followUps: [],
};

export function resolvePaymentMethods(
  cfg?: { paymentMethods?: PaymentMethodConfig[] | null } | null,
): PaymentMethodConfig[] {
  const configured = cfg?.paymentMethods ?? [];
  const src = configured.length > 0 ? configured : DEFAULT_PAYMENT_METHODS;
  return src.filter((m) => m.active);
}

// ---------------------------------------------------------------------------
// Form fields (the CUSTOMER step's 4 tabs)
// ---------------------------------------------------------------------------

export const ORDER_ENTRY_TABS = ["customer", "address", "emergency", "target"] as const;
export type OrderEntryTab = (typeof ORDER_ENTRY_TABS)[number];

export const customFieldTypeSchema = z.enum(["text", "select", "date", "number"]);
export type CustomFieldType = z.infer<typeof customFieldTypeSchema>;

export const customFieldSchema = z
  .object({
    key: z.string().trim().min(1).max(40).regex(KEBAB, "key must be kebab-case"),
    label: z.string().trim().min(1).max(60),
    type: customFieldTypeSchema,
    required: z.boolean(),
    /** Choices — only meaningful for type "select". */
    options: z.array(z.string().trim().min(1).max(60)).max(60),
  })
  .strict();
export type CustomField = z.infer<typeof customFieldSchema>;

export const builtinOverrideSchema = z
  .object({
    enabled: z.boolean().optional(),
    required: z.boolean().optional(),
  })
  .strict();
export type BuiltinOverride = z.infer<typeof builtinOverrideSchema>;

export const formTabConfigSchema = z
  .object({
    /** Keyed by POS_FORM_BUILTINS key. Overrides on LOCKED fields are ignored. */
    builtins: z.record(builtinOverrideSchema),
    custom: z.array(customFieldSchema).max(12),
  })
  .strict();
export type FormTabConfig = z.infer<typeof formTabConfigSchema>;

export const formFieldsConfigSchema = z
  .object({
    customer: formTabConfigSchema.optional(),
    address: formTabConfigSchema.optional(),
    emergency: formTabConfigSchema.optional(),
    target: formTabConfigSchema.optional(),
  })
  .strict();
export type FormFieldsConfig = z.infer<typeof formFieldsConfigSchema>;

// ---------------------------------------------------------------------------
// The whole config (row DTO + write input)
// ---------------------------------------------------------------------------

export const orderEntryConfigSchema = z
  .object({
    paymentMethods: z.array(paymentMethodConfigSchema).max(12),
    formFields: formFieldsConfigSchema,
  })
  .strict();
export type OrderEntryConfigDto = z.infer<typeof orderEntryConfigSchema>;

/** PUT body — full replace of both lists (the editor always saves the whole
 *  config; partial patches invite lost-update races between two operators). */
export const setOrderEntryConfigInput = orderEntryConfigSchema;
export type SetOrderEntryConfigInput = z.infer<typeof setOrderEntryConfigInput>;

// ---------------------------------------------------------------------------
// Builtin field registry — the UNIVERSE the editor shows (0174-style: code
// owns the catalog; the DB stores only overrides). `locked` fields are the
// structural spine (order identity / date engine) and can't be toggled.
// ---------------------------------------------------------------------------

export interface PosBuiltinField {
  tab: OrderEntryTab;
  key: string;
  label: string;
  /** Locked = always shown + validated exactly as today (no toggles). */
  locked: boolean;
  defaultEnabled: boolean;
  defaultRequired: boolean;
  /** Whether the editor may flip `required` (some fields are display-only). */
  requiredToggleable: boolean;
}

export const POS_FORM_BUILTINS: readonly PosBuiltinField[] = [
  // — Customer —
  { tab: "customer", key: "outlet", label: "Outlet", locked: true, defaultEnabled: true, defaultRequired: true, requiredToggleable: false },
  { tab: "customer", key: "salesperson", label: "Salesperson", locked: true, defaultEnabled: true, defaultRequired: true, requiredToggleable: false },
  { tab: "customer", key: "name", label: "Full name", locked: true, defaultEnabled: true, defaultRequired: true, requiredToggleable: false },
  { tab: "customer", key: "phone", label: "Phone", locked: true, defaultEnabled: true, defaultRequired: true, requiredToggleable: false },
  { tab: "customer", key: "email", label: "Email", locked: false, defaultEnabled: true, defaultRequired: true, requiredToggleable: true },
  { tab: "customer", key: "customerType", label: "Customer type (auto)", locked: false, defaultEnabled: true, defaultRequired: false, requiredToggleable: false },
  { tab: "customer", key: "race", label: "Race", locked: false, defaultEnabled: true, defaultRequired: true, requiredToggleable: true },
  { tab: "customer", key: "gender", label: "Gender", locked: false, defaultEnabled: true, defaultRequired: true, requiredToggleable: true },
  { tab: "customer", key: "birthday", label: "Birthday", locked: false, defaultEnabled: true, defaultRequired: true, requiredToggleable: true },
  // — Address — (the structured MY address + billing block is interlocked
  //   with "fill in later" / "billing same" logic → locked; customs only)
  { tab: "address", key: "address", label: "Delivery address (MY cascading)", locked: true, defaultEnabled: true, defaultRequired: true, requiredToggleable: false },
  { tab: "address", key: "billing", label: "Billing address", locked: true, defaultEnabled: true, defaultRequired: true, requiredToggleable: false },
  // — Emergency — one toggleable BLOCK (name + relationship + phone)
  { tab: "emergency", key: "emergency", label: "Emergency contact (name · relationship · phone)", locked: false, defaultEnabled: true, defaultRequired: true, requiredToggleable: true },
  // — Target date —
  { tab: "target", key: "deliveryDate", label: "Delivery date", locked: true, defaultEnabled: true, defaultRequired: true, requiredToggleable: false },
  // proceedDate is LOCKED: create_order + the ops production engine require it
  // whenever the delivery date is set (Phase 11.1) — relaxing it client-side
  // would only produce server 422s.
  { tab: "target", key: "proceedDate", label: "Proceed date · production start", locked: true, defaultEnabled: true, defaultRequired: true, requiredToggleable: false },
  { tab: "target", key: "stairCarry", label: "Delivery access (floor / lift / stair carry)", locked: true, defaultEnabled: true, defaultRequired: true, requiredToggleable: false },
  { tab: "target", key: "orderAddons", label: "Order add-ons", locked: true, defaultEnabled: true, defaultRequired: false, requiredToggleable: false },
];

export interface ResolvedBuiltin {
  key: string;
  label: string;
  locked: boolean;
  enabled: boolean;
  required: boolean;
  requiredToggleable: boolean;
}

export interface ResolvedFormTab {
  builtins: Record<string, ResolvedBuiltin>;
  custom: CustomField[];
}

/** Merge the operator's overrides over the builtin defaults for one tab.
 *  Locked fields ignore overrides entirely; a `required: true` never applies
 *  to a disabled field. Custom fields pass through (schema-validated at
 *  write time). */
export function resolveFormTab(
  cfg: FormFieldsConfig | null | undefined,
  tab: OrderEntryTab,
): ResolvedFormTab {
  const tabCfg = cfg?.[tab];
  const builtins: Record<string, ResolvedBuiltin> = {};
  for (const f of POS_FORM_BUILTINS) {
    if (f.tab !== tab) continue;
    const ov = f.locked ? undefined : tabCfg?.builtins?.[f.key];
    const enabled = ov?.enabled ?? f.defaultEnabled;
    const required =
      !enabled ? false : f.requiredToggleable ? (ov?.required ?? f.defaultRequired) : f.defaultRequired;
    builtins[f.key] = {
      key: f.key,
      label: f.label,
      locked: f.locked,
      enabled,
      required,
      requiredToggleable: f.requiredToggleable,
    };
  }
  return { builtins, custom: tabCfg?.custom ?? [] };
}

/** All custom fields across the 4 tabs (for submit assembly + server caps). */
export function allCustomFields(cfg: FormFieldsConfig | null | undefined): CustomField[] {
  if (!cfg) return [];
  return ORDER_ENTRY_TABS.flatMap((t) => cfg[t]?.custom ?? []);
}

/** LENIENT row→DTO parse for the `order_entry_config` singleton: hand-edited
 *  or older-shape jsonb degrades to the code defaults instead of 500ing the
 *  catalog bundle. */
export function parseOrderEntryConfigRow(
  row: { payment_methods?: unknown; form_fields?: unknown } | null | undefined,
): OrderEntryConfigDto {
  const pm = z.array(paymentMethodConfigSchema).safeParse(row?.payment_methods);
  const ff = formFieldsConfigSchema.safeParse(row?.form_fields);
  return {
    paymentMethods: pm.success ? pm.data : [],
    formFields: ff.success ? ff.data : {},
  };
}
