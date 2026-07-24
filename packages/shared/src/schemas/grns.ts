import { z } from "zod";

/**
 * GRN (Goods Received Note) — schemas for list / detail / receive-with-grn.
 *
 * Backed by migration 0244 (grns + grn_lines tables + wrapper RPC
 * operation_receive_po_with_grn). Numbered per docNumber scheme (2026-07-19):
 * `GRN-DDMMYY-NNNN`, 4-digit tail hashed from the grn uuid.
 */

export const grnStatusSchema = z.enum(["draft", "confirmed"]);
export type GrnStatus = z.infer<typeof grnStatusSchema>;

export const grnLineSchema = z.object({
  id: z.string().uuid(),
  poLineId: z.string().uuid(),
  sku: z.string(),
  orderedQty: z.number().int(),
  qtyReceived: z.number().int().nonnegative(),
  qtyAccepted: z.number().int().nonnegative(),
  qtyRejected: z.number().int().nonnegative(),
  rejectionReason: z.string().nullable(),
});
export type GrnLine = z.infer<typeof grnLineSchema>;

export const grnSchema = z.object({
  id: z.string().uuid(),
  grnNumber: z.string(),
  poId: z.string(),
  supplierId: z.string().uuid().nullable(),
  supplierName: z.string().nullable(),
  warehouseId: z.string().uuid().nullable(),
  warehouseName: z.string().nullable(),
  doNumber: z.string().nullable(),
  doFilePath: z.string().nullable(),
  receivedBy: z.string().uuid().nullable(),
  receivedByName: z.string().nullable(),
  status: grnStatusSchema,
  notes: z.string().nullable(),
  receivedAt: z.string(),
  confirmedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  itemsCount: z.number().int().nonnegative().optional(),
  lines: z.array(grnLineSchema).optional(),
});
export type Grn = z.infer<typeof grnSchema>;

export const grnListResponseSchema = z.object({
  grns: z.array(grnSchema),
  total: z.number().int().nonnegative(),
});
export type GrnListResponse = z.infer<typeof grnListResponseSchema>;

// -----------------------------------------------------------------------------
// Receive-with-GRN — extends the receive body with per-line acc/rej/reason.
// Wire shape stays camelCase; the API reshapes to snake_case for the RPC.
// -----------------------------------------------------------------------------

export const receivePoWithGrnLineSchema = z
  .object({
    id: z.string().uuid(),               // po_line_id
    receivedQty: z.number().int().nonnegative(),   // NEW TOTAL (post-receive)
    deltaReceived: z.number().int().positive(),    // this-receive delta (Recv on the GRN)
    qtyAccepted: z.number().int().nonnegative(),
    qtyRejected: z.number().int().nonnegative(),
    rejectionReason: z.string().max(500).optional().nullable(),
  })
  .refine((l) => l.deltaReceived === l.qtyAccepted + l.qtyRejected, {
    message: "deltaReceived must equal qtyAccepted + qtyRejected",
    path: ["deltaReceived"],
  })
  .refine(
    (l) =>
      l.qtyRejected === 0 ||
      (typeof l.rejectionReason === "string" &&
        l.rejectionReason.trim().length > 0),
    {
      message: "rejectionReason required when qtyRejected > 0",
      path: ["rejectionReason"],
    },
  );

export const receivePoWithGrnInput = z.object({
  doNumber: z.string().min(3).max(120),
  doFilePath: z.string().min(1),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(receivePoWithGrnLineSchema).min(1),
});
export type ReceivePoWithGrnInput = z.infer<typeof receivePoWithGrnInput>;

export const receivePoWithGrnResult = z
  .object({
    po_id: z.string(),
    do_file_path: z.string(),
    do_number: z.string(),
    lines_updated: z.number().int(),
    threads_advanced: z.number().int(),
    po_status: z.string(),
    sup_status: z.string(),
    was_relocated: z.boolean(),
    grn_id: z.string().uuid(),
    grn_number: z.string(),
  })
  .passthrough();
export type ReceivePoWithGrnResult = z.infer<typeof receivePoWithGrnResult>;

// -----------------------------------------------------------------------------
// List filters
// -----------------------------------------------------------------------------

export const grnListQuerySchema = z.object({
  status: grnStatusSchema.optional(),
  supplierId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  receivedBy: z.string().uuid().optional(),
  poId: z.string().optional(),
  search: z.string().max(120).optional(),
  from: z.string().optional(),          // ISO date
  to: z.string().optional(),            // ISO date
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(15),
});
export type GrnListQuery = z.infer<typeof grnListQuerySchema>;
