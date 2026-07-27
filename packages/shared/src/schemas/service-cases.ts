import { z } from "zod";
import {
  CASE_ISSUE_KEYS,
  CASE_PRODUCT_CATEGORY_KEYS,
  CASE_REPORTER_KEYS,
  CASE_USABLE_KEYS,
  CASE_WANT_KEYS,
} from "../service-case-intake";
import {
  CASE_EVIDENCE_MIME_TYPES,
  CASE_EVIDENCE_SLOT_KEYS,
} from "../service-case-evidence";

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

// ── Evidence (S2, migration 0289) ────────────────────────────────────────────

/**
 * One filed piece of evidence. `at` / `by` / `byRole` are stamped by the SERVER,
 * never sent by a client — the card's "every file is stamped who-uploaded +
 * when" is only worth anything if the stamp cannot be authored by the uploader.
 * (0289's CHECK makes them structurally non-optional in the row as well.)
 *
 * `slot` is a plain string rather than the slot enum on the READ side: a file
 * filed under a slot key that is later retired must still be visible in the case
 * view, not vanish from the ledger.
 */
export const caseEvidenceEntrySchema = z.object({
  slot:   z.string(),
  path:   z.string(),
  kind:   z.enum(["photo", "video"]),
  at:     z.string(),
  by:     z.string(),
  byRole: z.string(),
});
export type CaseEvidenceEntry = z.infer<typeof caseEvidenceEntrySchema>;

/** The ledger read, with a short-lived signed URL per file. `url` is null when
 *  signing failed — the row still says a file exists rather than pretending the
 *  evidence was never taken. */
export const caseEvidenceListResponseSchema = z.object({
  evidence: z.array(caseEvidenceEntrySchema.extend({ url: z.string().nullable() })),
});
export type CaseEvidenceListResponse = z.infer<typeof caseEvidenceListResponseSchema>;

/**
 * Ask for a signed upload URL. Exactly ONE of `draftId` / `caseId`:
 *   - draftId — the wizard, before the case exists. "No evidence, no case" means
 *     the files must be uploadable BEFORE there is a case to hang them on.
 *   - caseId  — an existing case gaining a file later (the customer sends the
 *     photo the next day).
 * The server builds the object key from whichever it gets; the client can
 * neither pick nor overwrite a path.
 */
export const signCaseEvidenceUploadInputSchema = z
  .object({
    draftId:  z.string().uuid().optional(),
    caseId:   z.string().uuid().optional(),
    slot:     z.enum(CASE_EVIDENCE_SLOT_KEYS),
    mimeType: z.enum(CASE_EVIDENCE_MIME_TYPES),
  })
  .refine((v) => !!v.draftId !== !!v.caseId, {
    message: "Give exactly one of draftId or caseId",
  });
export type SignCaseEvidenceUploadInput = z.infer<typeof signCaseEvidenceUploadInputSchema>;

export const signCaseEvidenceUploadResponseSchema = z.object({
  token: z.string(),
  path:  z.string(),
});
export type SignCaseEvidenceUploadResponse = z.infer<typeof signCaseEvidenceUploadResponseSchema>;

/**
 * What the client hands back once the bytes are in the bucket.
 *
 * Just the slot and the path. `at` / `by` / `byRole` are stamped by the server,
 * and `kind` is DERIVED from the slot registry rather than sent — a client that
 * could declare its own kind could file a photo as the video the checklist asked
 * for and satisfy the count while proving nothing. (The mime type is checked
 * against the slot at sign-upload time, before any bytes move.)
 */
export const caseEvidenceUploadedSchema = z.object({
  slot: z.enum(CASE_EVIDENCE_SLOT_KEYS),
  path: z.string().min(1),
});
export type CaseEvidenceUploaded = z.infer<typeof caseEvidenceUploadedSchema>;

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

  /**
   * J2 — the linked order's SO number, joined from `orders`. orderId is the
   * permanent key but it is a uuid: nothing on screen can say WHICH order
   * without this, so the case→order link had no label to render.
   *
   * OPTIONAL, not just nullable, and the two mean different things:
   *   - absent    → an older Worker that predates J2 (a newer web build must
   *                 degrade to "no link shown", never crash)
   *   - null      → the case genuinely has no linked order
   */
  so:                  z.number().int().nullable().optional(),

  /**
   * S1 — the guided intake (migration 0285). The wizard's five answers, stored
   * as keys instead of prose. All OPTIONAL for the same reason `so` is: a web
   * build newer than the Worker must degrade to "the wizard block is not
   * shown", never crash. `null` means a case filed before the wizard existed
   * (or through the edit modal, which still writes prose only).
   *
   * `priority` is READ-ONLY here — a generated column in the database. Staff
   * never pick it and no client may send it; it follows `usable` by law.
   */
  reportedBy:      z.enum(CASE_REPORTER_KEYS).nullable().optional(),
  orderLineId:     z.string().uuid().nullable().optional(),
  productSku:      z.string().nullable().optional(),
  productCategory: z.enum(CASE_PRODUCT_CATEGORY_KEYS).nullable().optional(),
  issueType:       z.enum(CASE_ISSUE_KEYS).nullable().optional(),
  usable:          z.enum(CASE_USABLE_KEYS).nullable().optional(),
  priority:        z.enum(["low", "normal", "high"]).nullable().optional(),
  customerWants:   z.array(z.enum(CASE_WANT_KEYS)).optional(),

  /**
   * S2 — the evidence ledger (migration 0289). Every file the case was filed
   * with, stamped with WHO uploaded it and WHEN. Optional for the same
   * degrade-don't-crash reason as the S1 fields above.
   */
  evidence:        z.array(caseEvidenceEntrySchema).optional(),
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

  // S1 — the wizard's answers. `priority` is deliberately ABSENT: it is a
  // generated column, so there is no input for it to arrive through.
  reportedBy:      z.enum(CASE_REPORTER_KEYS).optional(),
  orderLineId:     z.string().uuid().optional(),
  productSku:      z.string().trim().optional(),
  productCategory: z.enum(CASE_PRODUCT_CATEGORY_KEYS).optional(),
  issueType:       z.enum(CASE_ISSUE_KEYS).optional(),
  usable:          z.enum(CASE_USABLE_KEYS).optional(),
  customerWants:   z.array(z.enum(CASE_WANT_KEYS)).optional(),

  /**
   * S2 — the evidence uploaded against `draftId` before this case existed. The
   * server checks every path really sits under that draft's own prefix, then
   * checks the files satisfy `issueType`'s required checklist and REFUSES the
   * create if they do not. A disabled button is not "impossible"; this is.
   */
  draftId:         z.string().uuid().optional(),
  evidence:        z.array(caseEvidenceUploadedSchema).optional(),
});
export type CreateServiceCaseInput = z.infer<typeof createServiceCaseInputSchema>;

/**
 * Update deliberately DROPS `evidence` / `draftId`: the ledger is append-only
 * through its own endpoint, so a PATCH can neither replace the evidence nor
 * quietly delete it. (`.omit` before `.partial()` — a partial of a schema that
 * still has the field would let it through as optional.)
 */
export const updateServiceCaseInputSchema = createServiceCaseInputSchema
  .omit({ evidence: true, draftId: true })
  .partial();
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
