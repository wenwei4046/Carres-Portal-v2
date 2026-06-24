import { z } from "zod";

import {
  productCategorySchema,
  variantKindSchema,
  type ProductCategory,
  type VariantKind,
} from "./schemas/catalog";

/**
 * SKU Import — the one mapper + schema shared by the staged-preview client
 * (apps/web ImportSkusDialog) and the server (POST /api/catalog/import-skus),
 * faithfully ported from the 2990s Products import (parseSkuCsv / batch-import).
 *
 * Carres divergence (Loo 2026-06-25): 2990s is a flat one-row-per-SKU table;
 * Carres splits product_models + product_skus, and its sku code
 * `{MODEL_KEY}-{variant}` (deriveSkuCode) is load-bearing for the order/PO/stock
 * joins. So import resolves/creates a MODEL per (category, model_key) first, then
 * a SKU under it — it never uses the free-form 2990s `code` column as identity.
 *
 * Faithful 2990s behaviour preserved: case-insensitive headers, money RM/comma
 * cleaning + numeric validation, and **blank cell = no value** (the server then
 * preserves the existing column on update / falls back to a default on insert —
 * so an export -> edit -> re-import round-trip can never zero a price).
 */

// ---------------------------------------------------------------------------
// Pure cell parsers (client preview + server share these via the mapper)
// ---------------------------------------------------------------------------

export interface MoneyParse {
  /** null = the cell was blank (no value); a number = a parsed amount. */
  value: number | null;
  /** true = the cell had content but was not a valid number. */
  error: boolean;
}

/** Parse a money cell: strip a leading `RM`, thousands commas + spaces, validate
 *  it's a non-negative decimal, round to 2dp. Blank => {null,false}. */
export function parseMoney(raw: string | undefined | null): MoneyParse {
  const s = (raw ?? "").trim();
  if (s === "") return { value: null, error: false };
  const cleaned = s.replace(/^RM\s*/i, "").replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return { value: null, error: true };
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { value: null, error: true };
  return { value: Math.round(n * 100) / 100, error: false };
}

/** Kebab-case a model name into a model_key (a-z 0-9 dash, 2-60). */
export function deriveModelKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** Case-insensitive category lookup over the 5 product categories. */
export function normalizeCategory(raw: string | undefined | null): ProductCategory | null {
  const s = (raw ?? "").trim().toLowerCase();
  const r = productCategorySchema.safeParse(s);
  return r.success ? r.data : null;
}

/** Variant kind: blank => undefined (NO value — so an update preserves the
 *  stored kind and an insert falls back to 'size'); a valid value => that kind;
 *  an unrecognised non-blank value => null (caller rejects the row). Returning
 *  undefined (not 'size') for a blank cell is what keeps blank = preserve: a
 *  file that omits the variant_kind column must never re-type an existing
 *  preset/part SKU to size. */
export function normalizeVariantKind(
  raw: string | undefined | null,
): VariantKind | null | undefined {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "") return undefined;
  const r = variantKindSchema.safeParse(s);
  return r.success ? r.data : null;
}

/** Largest money value an import accepts. product_skus.price is numeric(12,2);
 *  this generous RM cap keeps a typo from reaching the DB as a raw overflow. */
export const MAX_IMPORT_MONEY = 99_999_999.99;

/** Interpret a yes/no-ish cell. Blank or unrecognised => undefined (so the
 *  caller preserves the existing value / applies the default). */
export function parseBoolish(raw: string | undefined | null): boolean | undefined {
  const s = (raw ?? "").trim().toLowerCase();
  if (["yes", "true", "1", "active", "y", "on"].includes(s)) return true;
  if (["no", "false", "0", "inactive", "n", "off"].includes(s)) return false;
  return undefined;
}

// ---------------------------------------------------------------------------
// Row shape + the mapper (one record -> one validated import row, or a reason)
// ---------------------------------------------------------------------------

export interface SkuImportRow {
  /** Model display name (product_models.name on first create). */
  model: string;
  /** Resolved kebab key (explicit `model_key` column, else derived from model). */
  modelKey: string;
  category: ProductCategory;
  variant: string;
  /** Omitted when the variant_kind cell was blank — so an update preserves the
   *  stored kind and an insert defaults to 'size'. */
  variantKind?: VariantKind;
  /** Present only when the cell had a value (blank => omitted => preserve). */
  price?: number;
  cost?: number;
  description?: string;
  posActive?: boolean;
  /** Raw supplier slug or name; the server resolves it to supplier_id. */
  supplier?: string;
}

export type ImportRowResult =
  | { ok: true; row: SkuImportRow }
  | { ok: false; reason: string };

/**
 * Map ONE raw CSV/XLSX record (header => cell) to a validated import row.
 * Header matching is case-insensitive + trimmed, so it works regardless of the
 * parser that produced the record. A `sku` column (emitted by export) is ignored
 * — import always derives its own code from (model_key, variant).
 */
export function csvRecordToImportRow(rec: Record<string, string>): ImportRowResult {
  const norm: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    norm[k.trim().toLowerCase()] = (v ?? "").trim();
  }
  const get = (k: string) => norm[k] ?? "";

  const model = get("model");
  const categoryRaw = get("category");
  const variant = get("variant");
  if (!model) return { ok: false, reason: "missing model" };
  if (!categoryRaw) return { ok: false, reason: "missing category" };
  if (!variant) return { ok: false, reason: "missing variant" };
  if (model.length < 2 || model.length > 80) {
    return { ok: false, reason: `model name must be 2-80 chars (got ${model.length})` };
  }
  if (variant.length > 60) {
    return { ok: false, reason: `variant too long (max 60): "${variant}"` };
  }

  const category = normalizeCategory(categoryRaw);
  if (!category) return { ok: false, reason: `invalid category "${categoryRaw}"` };

  const modelKeyRaw = get("model_key");
  const modelKey = modelKeyRaw ? modelKeyRaw.toLowerCase() : deriveModelKey(model);
  if (!/^[a-z0-9-]{2,60}$/.test(modelKey)) {
    return { ok: false, reason: `bad model_key "${modelKey}" (need a-z 0-9 dash, 2-60)` };
  }

  const variantKind = normalizeVariantKind(get("variant_kind"));
  if (variantKind === null) {
    return { ok: false, reason: `invalid variant_kind "${get("variant_kind")}" (use size/preset/part)` };
  }

  const priceP = parseMoney(get("price"));
  if (priceP.error) return { ok: false, reason: `price "${get("price")}" is not a number` };
  if (priceP.value !== null && priceP.value > MAX_IMPORT_MONEY) {
    return { ok: false, reason: `price ${priceP.value} exceeds the maximum (${MAX_IMPORT_MONEY})` };
  }
  const costP = parseMoney(get("cost"));
  if (costP.error) return { ok: false, reason: `cost "${get("cost")}" is not a number` };
  if (costP.value !== null && costP.value > MAX_IMPORT_MONEY) {
    return { ok: false, reason: `cost ${costP.value} exceeds the maximum (${MAX_IMPORT_MONEY})` };
  }

  const description = get("description");
  if (description.length > 200) {
    return { ok: false, reason: "description too long (max 200)" };
  }

  const row: SkuImportRow = { model, modelKey, category, variant };
  if (variantKind !== undefined) row.variantKind = variantKind;
  if (priceP.value !== null) row.price = priceP.value;
  if (costP.value !== null) row.cost = costP.value;
  if (description) row.description = description;
  const posActive = parseBoolish(get("pos_active"));
  if (posActive !== undefined) row.posActive = posActive;
  const supplier = get("supplier");
  if (supplier) row.supplier = supplier;

  return { ok: true, row };
}

// ---------------------------------------------------------------------------
// Server zod — re-validates the rows the client mapper produced.
// Constraints MUST mirror csvRecordToImportRow + the catalog create inputs.
// ---------------------------------------------------------------------------

export const skuImportRowSchema = z
  .object({
    model: z.string().trim().min(2).max(80),
    modelKey: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/),
    category: productCategorySchema,
    variant: z.string().trim().min(1).max(60),
    variantKind: variantKindSchema.optional(),
    price: z.number().nonnegative().max(MAX_IMPORT_MONEY).optional(),
    cost: z.number().nonnegative().max(MAX_IMPORT_MONEY).optional(),
    description: z.string().trim().max(200).optional(),
    posActive: z.boolean().optional(),
    supplier: z.string().trim().min(1).max(80).optional(),
  })
  .strict();
export type SkuImportRowParsed = z.infer<typeof skuImportRowSchema>;

export const skuImportInput = z
  .object({
    rows: z.array(skuImportRowSchema).min(1).max(500),
  })
  .strict();
export type SkuImportInput = z.infer<typeof skuImportInput>;

export interface SkuImportFailure {
  /** 1-based row number in the submitted batch. */
  row: number;
  /** A human key for the row (sku code or model/variant) to spot it in the file. */
  key: string;
  reason: string;
}

export interface SkuImportResult {
  upserted: number;
  createdModels: number;
  failed: number;
  failures: SkuImportFailure[];
}

/** Whether a batch carries any pricing intent (=> principal-only on the server). */
export function hasPricingIntent(rows: Pick<SkuImportRow, "price" | "cost">[]): boolean {
  return rows.some((r) => typeof r.price === "number" || typeof r.cost === "number");
}
