import { z } from "zod";

/** Section A — Logistics instructions */
export const snSectionASchema = z.object({
  task:            z.string().default(""),
  deliverDate:     z.string().nullable().default(null),
  logisticCompany: z.string().nullable().default(null),
  note:            z.string().nullable().default(null),
});
export type SnSectionA = z.infer<typeof snSectionASchema>;

/** Section B — Supplier instructions */
export const snSectionBSchema = z.object({
  task:         z.string().default(""),
  deliverDate:  z.string().nullable().default(null),
  supplierName: z.string().nullable().default(null),
  note:         z.string().nullable().default(null),
});
export type SnSectionB = z.infer<typeof snSectionBSchema>;

/** Section C — Warehouse notes */
export const snSectionCSchema = z.object({
  note1: z.string().nullable().default(null),
  note2: z.string().nullable().default(null),
});
export type SnSectionC = z.infer<typeof snSectionCSchema>;

/** One product line within an SN */
export const snItemSchema = z.object({
  id:     z.string().uuid().optional(),
  no:     z.number().int().min(1),
  item:   z.string().min(1),
  poNo:   z.string().nullable().default(null),
  qty:    z.number().int().min(1).default(1),
  remark: z.string().nullable().default(null),
});
export type SnItem = z.infer<typeof snItemSchema>;

export const SN_STAGES = ["collected", "with_supplier", "supplier_done", "scheduled"] as const;
export type SnStage = typeof SN_STAGES[number];

export const SN_STAGE_LABELS: Record<SnStage, string> = {
  collected:      "Collected",
  with_supplier:  "With Supplier",
  supplier_done:  "Supplier Done",
  scheduled:      "Scheduled",
};

export const SN_STAGE_NEXT: Record<SnStage, SnStage | null> = {
  collected:      "with_supplier",
  with_supplier:  "supplier_done",
  supplier_done:  "scheduled",
  scheduled:      null,
};

/** Full SN document returned by the API */
export const serviceNoteSchema = z.object({
  id:              z.string().uuid(),
  snNo:            z.string(),
  customerName:    z.string(),
  customerPhone:   z.string().nullable(),
  refNo:           z.string().nullable(),
  customerAddress: z.string().nullable(),
  orderId:         z.string().uuid().nullable(),
  category:        z.string().nullable(),
  type:            z.string().nullable(),
  requestDate:     z.string(),
  deadline:        z.string().nullable(),
  deliveredDate:   z.string().nullable(),
  whatHappened:    z.string().nullable(),
  sectionA:        snSectionASchema.nullable(),
  sectionB:        snSectionBSchema.nullable(),
  sectionC:        snSectionCSchema.nullable(),
  photos:          z.array(z.string()),
  status:          z.enum(["ongoing", "closed"]),
  currentStage:    z.enum(SN_STAGES).default("collected"),
  createdBy:       z.string().uuid().nullable(),
  createdAt:       z.string(),
  updatedAt:       z.string(),
  items:           z.array(snItemSchema),
});
export type ServiceNote = z.infer<typeof serviceNoteSchema>;

/** Lightweight version for list views (no items array) */
export const serviceNoteListItemSchema = serviceNoteSchema.omit({ items: true });
export type ServiceNoteListItem = z.infer<typeof serviceNoteListItemSchema>;

export const serviceNoteListResponseSchema = z.object({
  items: z.array(serviceNoteListItemSchema),
  total: z.number().int(),
});
export type ServiceNoteListResponse = z.infer<typeof serviceNoteListResponseSchema>;

/** POST /api/ops/service-notes */
export const createServiceNoteInputSchema = z.object({
  customerName:    z.string().min(1),
  customerPhone:   z.string().trim().optional(),
  refNo:           z.string().trim().optional(),
  customerAddress: z.string().trim().optional(),
  orderId:         z.string().uuid().optional(),
  category:        z.string().trim().optional(),
  type:            z.string().trim().optional(),
  requestDate:     z.string().optional(),
  deadline:        z.string().nullable().optional(),
  whatHappened:    z.string().trim().optional(),
  sectionA:        snSectionASchema.nullable().optional(),
  sectionB:        snSectionBSchema.nullable().optional(),
  sectionC:        snSectionCSchema.nullable().optional(),
  items:           z.array(snItemSchema).optional(),
});
export type CreateServiceNoteInput = z.infer<typeof createServiceNoteInputSchema>;

/** PATCH /api/ops/service-notes/:id */
export const updateServiceNoteInputSchema = createServiceNoteInputSchema.partial().extend({
  deliveredDate: z.string().nullable().optional(),
  status:        z.enum(["ongoing", "closed"]).optional(),
  currentStage:  z.enum(SN_STAGES).optional(),
});
export type UpdateServiceNoteInput = z.infer<typeof updateServiceNoteInputSchema>;

// ── Display helpers (static, used in both API and web) ───────────────────────

export const SN_CATEGORIES = [
  "Sofa",
  "Mattress",
  "Bedframe",
  "Dining",
  "Coffee Table",
  "Other",
] as const;

export const SN_TYPES = [
  "Manufacturing Defect",
  "100-Day Exchange",
  "Warranty Claim",
  "Damaged in Delivery",
  "Wrong Item",
  "Repair",
  "Internal / SOP",
  "Other",
] as const;

export const SN_LOGISTICS = [
  "NETS",
  "TSDD",
  "AL",
  "HOUZS",
  "Other",
] as const;
