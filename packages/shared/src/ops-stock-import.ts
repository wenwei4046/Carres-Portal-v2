import { z } from "zod";
import { excelSerialToISO } from "./stock-eta-import";
import { opsStockConditionSchema, type OpsStockCondition } from "./schemas/ops-stock";

/**
 * On Hand C+ P3 — parse the "Klg Warehouse" ready-stock sheet (single sheet
 * "Import Format") into ops_stock_items import rows. One sheet row = one
 * physical unit (Qty usually 1). Columns:
 *   DATE IN · CONDITION · PO · OLD REF · SKU · CATEGORY · QTY ·
 *   FREE/RESERVED · RESERVED REF NO · SUPPLIER · REMARK
 *
 * Pure + tested so the messy real-world values (trailing spaces, mixed case,
 * condition words leaking into OLD REF, Excel serial dates) normalise the same
 * way on the client preview and (in future) any server re-parse.
 */

/** One import row — the subset of ops_stock_items the sheet carries. */
export const opsStockImportRowSchema = z.object({
  sku: z.string().trim().min(1),
  condition: opsStockConditionSchema.default("new"),
  status: z.enum(["free", "reserved"]).default("free"),
  qty: z.coerce.number().int().min(1).max(200).default(1),
  reservedRef: z.string().trim().optional(),
  supplier: z.string().trim().optional(),
  poNo: z.string().trim().optional(),
  sourceRef: z.string().trim().optional(),
  dateIn: z.string().trim().optional(),
});
export type OpsStockImportRow = z.infer<typeof opsStockImportRowSchema>;

export const opsStockImportInputSchema = z.object({
  rows: z.array(opsStockImportRowSchema).min(1).max(5000),
  warehouseId: z.string().uuid().optional(),
});
export type OpsStockImportInput = z.infer<typeof opsStockImportInputSchema>;

/** Free-text condition (New / Exhibition / Old / Fair (used) / Refurbished /
 *  Damaged, any case, trailing space) → the ops_stock_items enum. Unknown →
 *  'new' (the safest default; it stays sellable, matches the "+ Add stock"
 *  default). */
export function normalizeStockCondition(raw: unknown): OpsStockCondition {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "new") return "new";
  if (s === "exhibition" || s === "display") return "exhibition";
  if (s === "old" || s.startsWith("fair") || s === "used") return "old";
  if (s.startsWith("refurb")) return "refurbished";
  if (s === "damaged" || s === "defective") return "damaged";
  return "new";
}

const CONDITION_WORDS = new Set([
  "new",
  "exhibition",
  "display",
  "old",
  "fair",
  "fair (used)",
  "used",
  "refurbished",
  "damaged",
]);

/** Case/space-insensitive column lookup (headers vary in casing + spacing). */
function pick(rec: Record<string, unknown>, header: string): unknown {
  const want = header.replace(/\s+/g, " ").trim().toUpperCase();
  for (const k of Object.keys(rec)) {
    if (k.replace(/\s+/g, " ").trim().toUpperCase() === want) return rec[k];
  }
  return undefined;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Map one raw sheet record → an import row. Returns `{ ok: false }` when the
 * row has no SKU (blank / separator rows). OLD REF that is really a leaked
 * condition word ("Exhibition") is dropped, not stored as a source ref.
 */
export function warehouseSheetRecordToImportRow(
  rec: Record<string, unknown>,
): { ok: true; row: OpsStockImportRow } | { ok: false } {
  const sku = str(pick(rec, "SKU"));
  if (!sku) return { ok: false };

  const status = /reserved/i.test(str(pick(rec, "FREE/RESERVED")))
    ? ("reserved" as const)
    : ("free" as const);

  const qtyRaw = Number(pick(rec, "QTY"));
  const qty = Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.floor(qtyRaw) : 1;

  const oldRef = str(pick(rec, "OLD REF"));
  const sourceRef =
    oldRef && !CONDITION_WORDS.has(oldRef.toLowerCase()) ? oldRef : undefined;

  const reservedRefRaw = str(pick(rec, "RESERVED REF NO"));
  const supplierRaw = str(pick(rec, "SUPPLIER"));
  const poRaw = str(pick(rec, "PO"));

  const dateCell = pick(rec, "DATE IN");
  let dateIn: string | undefined;
  if (typeof dateCell === "number") {
    dateIn = excelSerialToISO(dateCell) ?? undefined;
  } else {
    const ds = str(dateCell);
    dateIn = /^\d{4}-\d{2}-\d{2}$/.test(ds) ? ds : undefined;
  }

  return {
    ok: true,
    row: {
      sku,
      condition: normalizeStockCondition(pick(rec, "CONDITION")),
      status,
      qty,
      reservedRef: status === "reserved" && reservedRefRaw ? reservedRefRaw : undefined,
      supplier: supplierRaw || undefined,
      poNo: poRaw || undefined,
      sourceRef,
      dateIn,
    },
  };
}
