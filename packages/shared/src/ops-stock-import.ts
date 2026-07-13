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
  // A bulk accessory line can be large (the Klg sheet has pillow lines at 555,
  // protector lines at 319) — this is the record's quantity, NOT a serialize
  // count, so the cap is generous.
  qty: z.coerce.number().int().min(1).max(100_000).default(1),
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

// =====================================================================
// Idempotent import — count-based reconciliation
// =====================================================================
//
// The Klg Warehouse sheet has NO per-unit id, and genuinely-identical units
// recur (e.g. the same display bedframe listed 3× with a blank OLD REF + blank
// PO). So dedup CANNOT be "skip if this key was seen" — that would merge those
// 3 real units into 1. Nor can it key on OLD REF alone (usually blank → every
// blank-ref row looked "new" → re-import duplicated them: the actual bug).
//
// Instead we reconcile by COUNT per stable physical-identity key: the sheet
// declares N rows for a key, the pool is brought to exactly N. First import
// inserts all N; a re-import of the same sheet inserts max(0, N − already-in)
// = 0. Idempotent AND preserves legitimate multiplicity.

/** The subset of a stock record that identifies the PHYSICAL unit for dedup.
 *  Deliberately EXCLUDES:
 *   - status + reservedRef — a unit is the same unit whether free or reserved;
 *     including them would re-import a unit that got reserved after the sheet
 *     was cut.
 *   - qty — a bulk line is ONE record carrying its count.
 *   - dateIn (DATE IN) — the most volatile, hand-keyed field; a corrected date
 *     between exports must NOT make a re-import look like a new unit. Genuine
 *     receipts are already distinguished by PO/ref, and the count-based
 *     reconcile preserves multiplicity without needing the date.
 *  `dateIn` is still accepted (and ignored) so callers can pass a whole record. */
export interface StockUnitKeyParts {
  sku: string;
  condition: string;
  poNo?: string | null;
  sourceRef?: string | null;
  supplier?: string | null;
  dateIn?: string | null;
}

const KEY_SEP = "\u0001";

/** Stable, case/space-insensitive composite natural key. */
export function stockUnitKey(u: StockUnitKeyParts): string {
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  return [
    norm(u.sku),
    norm(u.condition),
    norm(u.poNo),
    norm(u.sourceRef),
    norm(u.supplier),
  ].join(KEY_SEP);
}

export interface StockImportReconcileResult {
  /** The desired rows that are NOT yet represented in the pool — insert these. */
  toInsert: OpsStockImportRow[];
  /** Count of `toInsert`. */
  toAddCount: number;
  /** Desired rows already represented (skipped as duplicates). */
  alreadyInCount: number;
  /** Total desired rows in the sheet. */
  desiredCount: number;
}

/**
 * Count-based reconciliation. `existing` is the current pool (each row counts
 * as one occurrence of its key, regardless of its qty/status). Returns the
 * rows to insert so the pool ends up holding exactly as many of each key as the
 * sheet declares — never fewer (add-only: it never removes/updates existing
 * rows, matching the shipped import contract).
 */
export function reconcileStockImport(
  desired: OpsStockImportRow[],
  existing: StockUnitKeyParts[],
): StockImportReconcileResult {
  const remaining = new Map<string, number>();
  for (const e of existing) {
    const k = stockUnitKey(e);
    remaining.set(k, (remaining.get(k) ?? 0) + 1);
  }
  const toInsert: OpsStockImportRow[] = [];
  let alreadyIn = 0;
  for (const row of desired) {
    const k = stockUnitKey(row);
    const left = remaining.get(k) ?? 0;
    if (left > 0) {
      remaining.set(k, left - 1);
      alreadyIn += 1;
    } else {
      toInsert.push(row);
    }
  }
  return {
    toInsert,
    toAddCount: toInsert.length,
    alreadyInCount: alreadyIn,
    desiredCount: desired.length,
  };
}
