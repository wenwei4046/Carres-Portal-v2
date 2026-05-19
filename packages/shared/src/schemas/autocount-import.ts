import { z } from "zod";

/**
 * AutoCount import contract — see docs/autocount-import-contract.md.
 *
 * The web/operation client parses the AutoCount Excel "listing" into JSON
 * rows (one row = one line item) and POSTs them here. The API groups rows by
 * `ref`, resolves each `detailDescription` against the SKU master, and calls
 * the `import_autocount_order` RPC once per order.
 *
 * One schema, two consumers — the operation panel and apps/api both validate
 * against this so the contract cannot drift.
 */

/** One raw row from the AutoCount listing (camelCase of the 14 sheet cols). */
export const autocountImportRowSchema = z.object({
  /** `Ref.` — order grouping key. May be combined: "TCF0282/CR1009". */
  ref: z.string().trim().min(1),
  /** `Delivery Location` — "City, State". Informational; folded into address. */
  deliveryLocation: z.string().trim().nullish(),
  /** `New- Delivery Date` — ISO date string. Client converts the Excel serial. */
  deliveryDate: z.string().trim().nullish(),
  /** `Item Group` — Mattress / Bed Fram / Sofa / Pillow / M.P / Service. */
  itemGroup: z.string().trim().min(1),
  /** `Qty` */
  qty: z.number().int().positive(),
  /** `Detail Description` — SKU match key (joined to SKU master `Description`). */
  detailDescription: z.string().trim().min(1),
  /** `PO Doc No.` — AutoCount PO number(s), preserved verbatim per line. */
  poDocNo: z.string().trim().nullish(),
  /** `Debtor Name` */
  debtorName: z.string().trim().min(1),
  /** `Phone` — kept raw; may hold two numbers split by "/". */
  phone: z.string().trim().nullish(),
  addr1: z.string().trim().nullish(),
  addr2: z.string().trim().nullish(),
  addr3: z.string().trim().nullish(),
  addr4: z.string().trim().nullish(),
  /** `Balance` — "RM3322 Paid" | "" | "RM<amount>". Parsed for paid amount. */
  balance: z.string().trim().nullish(),
});
export type AutocountImportRow = z.infer<typeof autocountImportRowSchema>;

/**
 * Batch payload. `dealerId` is the designated "house" dealer every imported
 * order attaches to (orders.dealer_id is NOT NULL). Operation supplies it;
 * it is config/master-data, not derived from the listing.
 */
export const autocountImportInput = z.object({
  dealerId: z.string().uuid(),
  sourceSystem: z.string().trim().min(1).default("autocount"),
  rows: z.array(autocountImportRowSchema).min(1).max(5000),
});
export type AutocountImportInput = z.infer<typeof autocountImportInput>;

/** Per-order result in the import report. No silent drops. */
export const autocountImportResultSchema = z.object({
  sourceRef: z.array(z.string()),
  /** RPC outcome, or 'error' when the order failed entirely. */
  result: z.enum(["created", "updated", "skipped_locked", "error"]),
  orderId: z.string().uuid().nullable(),
  so: z.number().int().nullable(),
  /** Lines whose core item (mattress/bedframe/sofa) failed SKU resolution. */
  unmatchedDescriptions: z.array(z.string()),
  error: z.string().nullable(),
});
export type AutocountImportResult = z.infer<typeof autocountImportResultSchema>;

export const autocountImportResponseSchema = z.object({
  ordersTotal: z.number().int(),
  created: z.number().int(),
  updated: z.number().int(),
  skippedLocked: z.number().int(),
  errored: z.number().int(),
  results: z.array(autocountImportResultSchema),
});
export type AutocountImportResponse = z.infer<typeof autocountImportResponseSchema>;
