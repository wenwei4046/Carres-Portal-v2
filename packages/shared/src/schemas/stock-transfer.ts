import { z } from "zod";
import { STOCK_TRANSFER_PURPOSES } from "../stock-transfer";

/**
 * The three governed Transfer doors + the cancel door (0365, Warehouse
 * Blueprint item 8 slice 1). One schema for the Worker and the web.
 *
 *   Request transfer  ·  Confirm collection  ·  Confirm arrival
 *   Cancel transfer   — pre-collection only
 *
 * The door input carries only what the RECORDER supplies. The transfer number,
 * the unit set stamped on each event, the duty checks and both sites' rollups
 * are server-side — they are deliberately absent here.
 */

const PURPOSE_KEYS = STOCK_TRANSFER_PURPOSES.map((p) => p.key) as [
  string,
  ...string[],
];

/** POST /api/operation/stock-transfers */
export const requestStockTransferInput = z
  .object({
    fromWarehouseId: z.string().uuid(),
    toWarehouseId: z.string().uuid(),
    /** The EXACT units that travel — never an SKU quantity. */
    unitIds: z.array(z.string().uuid()).min(1).max(200),
    purpose: z.enum(PURPOSE_KEYS),
    expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Required for `sales_order`, forbidden otherwise — the reserved-unit rule. */
    salesOrderRef: z.string().trim().min(1).max(60).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((v) => v.fromWarehouseId !== v.toWarehouseId, {
    message: "That is a move inside one site, not a transfer",
    path: ["toWarehouseId"],
  })
  .refine((v) => (v.purpose === "sales_order") === (v.salesOrderRef !== undefined), {
    message: "A transfer for a sales order names that order, and only that purpose may",
    path: ["salesOrderRef"],
  });
export type RequestStockTransferInput = z.infer<typeof requestStockTransferInput>;

/** POST /api/operation/stock-transfers/:id/collect */
export const collectStockTransferInput = z
  .object({
    /** Who carried the goods, when the portal knows — never invented. */
    carrier: z.string().trim().min(1).max(120).optional(),
    /** Who took them from the origin. */
    handoverTo: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export type CollectStockTransferInput = z.infer<typeof collectStockTransferInput>;

/** POST /api/operation/stock-transfers/:id/arrive */
export const arriveStockTransferInput = z
  .object({
    /** An arrival names the person who actually received the goods. */
    receivedByName: z.string().trim().min(1).max(120),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export type ArriveStockTransferInput = z.infer<typeof arriveStockTransferInput>;

/** POST /api/operation/stock-transfers/:id/cancel — refused after collection. */
export const cancelStockTransferInput = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export type CancelStockTransferInput = z.infer<typeof cancelStockTransferInput>;
