import { z } from "zod";

export const ARRIVAL_SOURCE_TYPES = [
  ["supplier-delivery", "Supplier delivery"],
  ["transfer", "Transfer"],
  ["customer-return", "Customer Return"],
  ["failed-delivery-return", "Failed Delivery return"],
  ["repair-return", "Return from repair"],
  ["supplier-replacement", "Supplier replacement"],
] as const;
export type ArrivalSourceType = (typeof ARRIVAL_SOURCE_TYPES)[number][0];
export const movementKind = z.enum([
  "transfer",
  "customer-return",
  "failed-delivery-return",
  "repair-return",
  "supplier-replacement",
]);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Enter a valid date",
  );
const words = z.string().trim().min(1).max(2000);
const exactUnits = z
  .array(z.string().uuid())
  .min(1)
  .max(200)
  .refine((v) => new Set(v).size === v.length, "Scan each Unit once");
export const COLLECTION_CONDITIONS = [
  ["no_stain", "No stain"],
  ["no_liquid_odour", "No liquid or odour"],
  ["no_pests", "No pest evidence"],
  ["sanitary", "No saliva or unsanitary condition"],
  ["no_tear_burn_cut", "No tear, burn or cut"],
  ["no_customer_damage", "No customer damage"],
  ["correct_item", "Correct item"],
  ["safe_wrapped", "Safe and wrapped for transport"],
] as const;
const caseApprovalInput = z
  .object({
    approved: z.literal(true),
    note: words,
    evidence_paths: z.array(words).min(1),
    photo_date: date,
    condition_required: z.boolean(),
    passed_conditions: z.array(z.string()),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.condition_required &&
      COLLECTION_CONDITIONS.some(([k]) => !v.passed_conditions.includes(k))
    )
      c.addIssue({
        code: "custom",
        message:
          "Collection cannot be approved while a condition check has failed or is missing",
      });
  });
export const arrivalSourceCreateInput = z
  .object({
    id: z.string().uuid(),
    kind: movementKind,
    claim_id: z.string().uuid().nullable(),
    case_id: z.string().uuid().nullable(),
    case_approval: caseApprovalInput.optional(),
    from_site_id: z.string().uuid().nullable(),
    to_site_id: z.string().uuid(),
    party_id: z.string().uuid(),
    expected_date: date,
    collection_date: date.nullable(),
    unit_ids: exactUnits,
    reason: words,
    sales_order_ref: z.string().trim().max(100).nullable().optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.case_id && !v.case_approval)
      c.addIssue({
        code: "custom",
        message: "Record the Case remedy approval and evidence first",
      });
    if (v.kind === "repair-return" && !v.from_site_id)
      c.addIssue({ code: "custom", message: "Choose the repair origin Site" });
    if (
      v.kind === "transfer" &&
      (!v.from_site_id || v.from_site_id === v.to_site_id)
    )
      c.addIssue({ code: "custom", message: "Choose two different Sites" });
    if (
      (v.kind === "supplier-replacement" && !v.claim_id) ||
      (v.kind === "repair-return" && !v.claim_id && !v.case_id)
    )
      c.addIssue({
        code: "custom",
        message: "Open the authorised Supplier Claim first",
      });
    if (
      (v.kind === "customer-return" || v.kind === "failed-delivery-return") &&
      !v.case_id
    )
      c.addIssue({
        code: "custom",
        message: "Open the source Service Case first",
      });
    if (v.collection_date && v.collection_date > v.expected_date)
      c.addIssue({
        code: "custom",
        message: "Arrival cannot be before collection",
      });
  });
export const arrivalHandoverInput = z
  .object({
    key: z.string().uuid(),
    kind: z.enum(["collected", "carrier_received", "collection_refused"]),
    unit_ids: exactUnits,
    party_id: z.string().uuid(),
    person: words,
    occurred_at: z.string().datetime({ offset: true }),
    evidence: words,
    collection_review: z
      .object({
        passed_conditions: z.array(z.string()),
        evidence_paths: z.array(words).min(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export const arrivalPlanChangeInput = z
  .object({
    expected_date: date,
    collection_date: date.nullable(),
    reason: words,
  })
  .strict()
  .refine(
    (v) => !v.collection_date || v.collection_date <= v.expected_date,
    "Arrival cannot be before collection",
  );
export const arrivalCancelInput = z.object({ reason: words }).strict();
export const arrivalReceivingInput = z
  .object({
    key: z.string().uuid(),
    goods_received_at: date,
    actual_site_id: z.string().uuid(),
    holder_party_id: z.string().uuid(),
    handover_person: words,
    do_number: z.string().trim().min(3).max(2000),
    do_file_path: words,
    note: z.string().trim().max(2000),
    units: z
      .array(
        z
          .object({
            stock_item_id: z.string().uuid(),
            outcome: z.enum([
              "received",
              "received_with_issue",
              "not_received",
            ]),
            issue_kind: z.enum(["damaged", "wrong_item"]).nullable(),
            note: z.string().trim().max(2000),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict()
  .superRefine((v, c) => {
    if (new Set(v.units.map((u) => u.stock_item_id)).size !== v.units.length)
      c.addIssue({ code: "custom", message: "Scan each Unit once" });
    if (!v.units.some((u) => u.outcome !== "not_received"))
      c.addIssue({
        code: "custom",
        message: "Record at least one received Unit",
      });
    for (const u of v.units)
      if ((u.outcome === "received_with_issue") !== (u.issue_kind !== null))
        c.addIssue({
          code: "custom",
          message: "Record the issue only for a Unit received with issue",
        });
  });
export interface ArrivalSource {
  id: string;
  source_no: string;
  kind: Exclude<ArrivalSourceType, "supplier-delivery">;
  claim_id: string | null;
  case_id: string | null;
  from_site_id: string | null;
  to_site_id: string;
  party_id: string;
  expected_date: string;
  collection_date: string | null;
  reason: string;
  cancelled_at: string | null;
  created_at: string;
  case_approval?: { condition_required: boolean; note: string } | null;
}
export interface ArrivalSourceUnit {
  source_id: string;
  stock_item_id: string;
  replaces_item_id: string | null;
}

/** Evidence comparison only. Missing confirmation never changes a Unit holder. */
export function arrivalHandoverDifferences(
  units: Array<{ id: string; outcome: string }>,
  events: Array<{ kind: string; unit_ids: string[] }>,
) {
  const origin = new Set(
    events.filter((e) => e.kind === "collected").flatMap((e) => e.unit_ids),
  );
  const carrier = new Set(
    events
      .filter((e) => e.kind === "carrier_received")
      .flatMap((e) => e.unit_ids),
  );
  return units.flatMap((u) => {
    const seen =
      origin.has(u.id) ||
      carrier.has(u.id) ||
      u.outcome === "received" ||
      u.outcome === "received_with_issue";
    return seen && (!origin.has(u.id) || !carrier.has(u.id))
      ? [
          {
            unitId: u.id,
            originMissing: !origin.has(u.id),
            carrierMissing: !carrier.has(u.id),
          },
        ]
      : [];
  });
}
