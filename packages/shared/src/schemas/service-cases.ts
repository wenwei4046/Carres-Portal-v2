import { z } from "zod";

/**
 * Service Cases (migration 0210) — the case / 病历 parent layer above Service
 * Notes (0140). A case classifies an issue (Case Type + Status, both config-
 * driven) and records the medical fields; a printable Service Note dispatch
 * order is generated under it (P2).
 *
 * Link key is orderId (permanent). refNo is an alias only (AutoCount Ref).
 */

// ── Config (data-driven Case Type / Status) ──────────────────────────────────

export const caseTypeSchema = z.object({
  id:        z.string().uuid(),
  code:      z.string(),
  label:     z.string(),
  sortOrder: z.number().int(),
  active:    z.boolean(),
});
export type CaseType = z.infer<typeof caseTypeSchema>;

export const caseStatusSchema = z.object({
  id:        z.string().uuid(),
  code:      z.string(),
  label:     z.string(),
  sortOrder: z.number().int(),
  active:    z.boolean(),
  isClosed:  z.boolean(),
});
export type CaseStatus = z.infer<typeof caseStatusSchema>;

export const serviceCaseConfigSchema = z.object({
  types:    z.array(caseTypeSchema),
  statuses: z.array(caseStatusSchema),
});
export type ServiceCaseConfig = z.infer<typeof serviceCaseConfigSchema>;

// ── The case record ──────────────────────────────────────────────────────────

export const serviceCaseSchema = z.object({
  id:                  z.string().uuid(),
  caseNo:              z.string(),
  orderId:             z.string().uuid().nullable(),
  refNo:               z.string().nullable(),
  customerName:        z.string(),
  customerPhone:       z.string().nullable(),
  customerAddress:     z.string().nullable(),
  caseTypeId:          z.string().uuid().nullable(),
  statusId:            z.string().uuid().nullable(),
  whatHappened:        z.string().nullable(),
  carresAction:        z.string().nullable(),
  whatAffected:        z.string().nullable(),
  incurredCharges:     z.string().nullable(),
  openedAt:            z.string(),
  sourceServiceNoteId: z.string().uuid().nullable(),
  createdBy:           z.string().uuid().nullable(),
  createdAt:           z.string(),
  updatedAt:           z.string(),

  // Joined display fields (from the config tables)
  caseTypeLabel:       z.string().nullable(),
  statusLabel:         z.string().nullable(),
  statusIsClosed:      z.boolean(),
});
export type ServiceCase = z.infer<typeof serviceCaseSchema>;

export const serviceCaseListResponseSchema = z.object({
  items: z.array(serviceCaseSchema),
  total: z.number().int(),
});
export type ServiceCaseListResponse = z.infer<typeof serviceCaseListResponseSchema>;

// ── Create / update inputs (one schema, two consumers) ───────────────────────

export const createServiceCaseInputSchema = z.object({
  orderId:         z.string().uuid().optional(),
  refNo:           z.string().trim().optional(),
  customerName:    z.string().min(1),
  customerPhone:   z.string().trim().optional(),
  customerAddress: z.string().trim().optional(),
  caseTypeId:      z.string().uuid().nullable().optional(),
  statusId:        z.string().uuid().nullable().optional(),
  whatHappened:    z.string().trim().optional(),
  carresAction:    z.string().trim().optional(),
  whatAffected:    z.string().trim().optional(),
  incurredCharges: z.string().trim().optional(),
  openedAt:        z.string().optional(),
});
export type CreateServiceCaseInput = z.infer<typeof createServiceCaseInputSchema>;

export const updateServiceCaseInputSchema = createServiceCaseInputSchema.partial();
export type UpdateServiceCaseInput = z.infer<typeof updateServiceCaseInputSchema>;

// ── Lookup (Ref No or Order ID → order autofill) ─────────────────────────────

/** One order line surfaced by the lookup (product/model, qty). */
export const caseLookupLineSchema = z.object({
  id:       z.string().uuid(),
  sku:      z.string(),
  qty:      z.number(),
  sourcePo: z.string().nullable(),
});

export const caseLookupOrderSchema = z.object({
  id:              z.string().uuid(),
  so:              z.string(),          // "SO-1147"
  refNos:          z.array(z.string()), // source_ref array (AutoCount Refs)
  customerName:    z.string(),
  customerPhone:   z.string().nullable(),
  customerAddress: z.string().nullable(),
  deliveryDate:    z.string().nullable(),
  lines:           z.array(caseLookupLineSchema),
});
export type CaseLookupOrder = z.infer<typeof caseLookupOrderSchema>;

/**
 * Lookup result.
 *  - order  : the single matched order (null when 0 or >1 matches)
 *  - matches: how many orders matched (0 = not found, >1 = ambiguous → manual)
 */
export const caseLookupResponseSchema = z.object({
  order:   caseLookupOrderSchema.nullable(),
  matches: z.number().int(),
});
export type CaseLookupResponse = z.infer<typeof caseLookupResponseSchema>;
