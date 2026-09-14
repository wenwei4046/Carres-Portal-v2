/**
 * DELIVERY SETTINGS — the doors' inputs and the governed words (Delivery
 * MASTER §11, owner ruling 2026-09-13; migration 0488).
 *
 * One `Delivery` group in the Settings Workspace on the Warehouse Settings
 * grammar: readable rows, one `Save changes` per page, `Not configured` for a
 * value nobody has recorded, actor · time · old value · new value on every
 * change. No roster, no owner list, no duty calculation lives here.
 */
import { z } from "zod";
import { DELIVERY_CONTACT_PURPOSES } from "./delivery-contact";

export const DELIVERY_SETTINGS_SECTIONS = [
  { slug: "partners", label: "Logistics Partners" },
  { slug: "rules", label: "Delivery Rules" },
  { slug: "templates", label: "Message Templates" },
  { slug: "access", label: "Access" },
] as const;
export type DeliverySettingsSection = (typeof DELIVERY_SETTINGS_SECTIONS)[number]["slug"];

/** The partner object's sections (§11 · Logistics Partners). */
export const PARTNER_SECTIONS = [
  { slug: "details", label: "Partner details" },
  { slug: "coverage", label: "Coverage" },
  { slug: "schedule", label: "Schedule" },
  { slug: "handover", label: "Warehouses & handover points" },
  { slug: "fleet", label: "Drivers and Vehicles" },
  { slug: "services", label: "Services & charges" },
  { slug: "access", label: "Portal access" },
] as const;

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => trimmed(max).nullish();
const uuid = z.string().uuid();

export const partnerDetailsInput = z.object({
  partnerId: uuid,
  name: trimmed(120).min(1, "The partner name is required."),
  active: z.boolean(),
  customerPhone: optionalText(40),
  officeContact: optionalText(200),
  address: optionalText(400),
  whatsappGroupUrl: optionalText(400),
});
export type PartnerDetailsInput = z.infer<typeof partnerDetailsInput>;

export const partnerCoverageSchema = z.object({
  states: z.array(trimmed(60)).max(20),
  cities: z.array(trimmed(80)).max(200),
  postcodes: z.array(trimmed(12)).max(500),
  excluded: z.array(trimmed(120)).max(200),
});
export type PartnerCoverage = z.infer<typeof partnerCoverageSchema>;
export const EMPTY_COVERAGE: PartnerCoverage = { states: [], cities: [], postcodes: [], excluded: [] };

export const partnerCoverageInput = z.object({
  partnerId: uuid,
  coverage: partnerCoverageSchema.nullable(),
  kvDefault: z.boolean(),
});
export type PartnerCoverageInput = z.infer<typeof partnerCoverageInput>;

export const handoverPointSchema = z.object({
  name: trimmed(120).min(1),
  address: optionalText(400),
  /** `pickup` — the partner collects here; `transit` — a two-leg handover. */
  kind: z.enum(["pickup", "transit"]),
});
export type HandoverPoint = z.infer<typeof handoverPointSchema>;

export const partnerScheduleInput = z.object({
  partnerId: uuid,
  /** `HH:MM`, the latest booking time for next-day pickup. */
  cutoffTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
  handoverPoints: z.array(handoverPointSchema).max(20).nullable(),
});
export type PartnerScheduleInput = z.infer<typeof partnerScheduleInput>;

export const partnerServicesSchema = z.object({
  stairCarry: z.boolean(),
  dismantling: z.boolean(),
  disposal: z.boolean(),
  /** Free-text charge lines: `Stair carry · RM 30 per floor`. */
  charges: z.array(trimmed(160)).max(50),
});
export type PartnerServices = z.infer<typeof partnerServicesSchema>;
export const EMPTY_SERVICES: PartnerServices = {
  stairCarry: false,
  dismantling: false,
  disposal: false,
  charges: [],
};

export const partnerServicesInput = z.object({
  partnerId: uuid,
  services: partnerServicesSchema.nullable(),
});
export type PartnerServicesInput = z.infer<typeof partnerServicesInput>;

/** Proof required by result and goods type (§11 · Delivery Rules). */
export const proofRulesSchema = z.object({
  deliveredPhoto: z.boolean(),
  deliveredSignedDo: z.boolean(),
  failedPhoto: z.boolean(),
  partialSignedDo: z.boolean(),
});
export type ProofRules = z.infer<typeof proofRulesSchema>;
export const DEFAULT_PROOF_RULES: ProofRules = {
  deliveredPhoto: true,
  deliveredSignedDo: true,
  failedPhoto: false,
  partialSignedDo: true,
};

export const partnerRulesInput = z.object({
  partnerId: uuid,
  customerContactBy: z.enum(["partner", "operation"]),
  recordOnBehalfAllowed: z.boolean(),
  proofRules: proofRulesSchema.nullable(),
});
export type PartnerRulesInput = z.infer<typeof partnerRulesInput>;

export const partnerDriverInput = z.object({
  partnerId: uuid,
  driverId: uuid.nullish(),
  name: trimmed(120).min(1, "The driver name is required."),
  phone: optionalText(40),
  active: z.boolean().default(true),
});
export type PartnerDriverInput = z.infer<typeof partnerDriverInput>;

export const partnerVehicleInput = z.object({
  partnerId: uuid,
  vehicleId: uuid.nullish(),
  plate: trimmed(20).min(1, "The vehicle plate is required."),
  vehicleType: trimmed(60).min(1, "The vehicle type is required."),
  capacity: optionalText(60),
  driverName: optionalText(120),
  driverPhone: optionalText(40),
  active: z.boolean().default(true),
});
export type PartnerVehicleInput = z.infer<typeof partnerVehicleInput>;

/* ── Message Templates — the Payment library grammar, Delivery's purposes ── */
export const DELIVERY_TEMPLATE_PURPOSES = [
  "ask_partner_for_date",
  ...DELIVERY_CONTACT_PURPOSES.map((p) => p.key),
] as const;
export type DeliveryTemplatePurpose = (typeof DELIVERY_TEMPLATE_PURPOSES)[number];
export const DELIVERY_TEMPLATE_PURPOSE_WORD: Record<DeliveryTemplatePurpose, string> = {
  ask_partner_for_date: "Ask the partner for the delivery date",
  ...(Object.fromEntries(DELIVERY_CONTACT_PURPOSES.map((p) => [p.key, p.label])) as Record<
    Exclude<DeliveryTemplatePurpose, "ask_partner_for_date">,
    string
  >),
};
export const DELIVERY_TEMPLATE_CHANNELS = ["whatsapp", "email", "copy"] as const;
export type DeliveryTemplateChannel = (typeof DELIVERY_TEMPLATE_CHANNELS)[number];

export interface DeliveryTemplateRow {
  id: string;
  template_key: string;
  purpose: DeliveryTemplatePurpose;
  channel: DeliveryTemplateChannel;
  name: string;
  body: string;
  version: number;
  active: boolean;
  is_default: boolean;
  is_head: boolean;
  created_at: string;
}

export const deliveryTemplateSaveInput = z.object({
  templateKey: uuid.nullish(),
  purpose: z.enum(DELIVERY_TEMPLATE_PURPOSES),
  channel: z.enum(DELIVERY_TEMPLATE_CHANNELS).default("whatsapp"),
  name: trimmed(80).min(1, "The template name is required."),
  body: z.string().trim().min(1, "The template wording is required.").max(4000),
});
export const deliveryTemplateKeyInput = z.object({ templateKey: uuid });
export const deliveryTemplateActiveInput = z.object({ templateKey: uuid, active: z.boolean() });

/** The fields a Delivery template may carry; each fills itself from the row. */
export const DELIVERY_TEMPLATE_FIELDS = [
  "customer",
  "so",
  "address",
  "goods",
  "requested_date",
  "confirmed_date",
  "confirmed_time",
  "partner",
] as const;

/** The recorded change list a page shows — what · old · new · who · when. */
export interface DeliverySettingChangeRow {
  id: string;
  what: string;
  partner_id: string | null;
  old_value: unknown;
  new_value: unknown;
  actor_id: string | null;
  actor_name?: string | null;
  changed_at: string;
}
