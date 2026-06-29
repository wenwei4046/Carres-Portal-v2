import type { ProductModelDto, ProductSkuDto } from "@carres/shared";

import { parseCsv } from "./csv";

/**
 * SKU export / file-read helpers for the SKU Master Import/Export buttons
 * (2990s Products parity Phase 1). The IMPORT mapping + validation lives in
 * `@carres/shared` (csvRecordToImportRow) so the staged preview and the server
 * agree; this module is just the browser I/O: build the export CSV, trigger a
 * download, and turn a CSV/XLSX file into header-keyed records the shared mapper
 * can consume.
 *
 * XLSX support is lazy: `xlsx` is only `import()`ed when an .xlsx/.xls file is
 * actually dropped, so it ships as its own chunk and never inflates the main
 * bundle (keeps the open bundle-size CF from getting worse).
 */

// The round-trippable column set. Order mirrors the import template; `sku` is the
// derived code, emitted for reference and ignored on re-import.
export const SKU_EXPORT_COLUMNS = [
  "model",
  "model_key",
  "category",
  "variant",
  "variant_kind",
  "price",
  "cost",
  "description",
  "pos_active",
  "sku",
] as const;

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface ExportSkuRow {
  sku: ProductSkuDto;
  model: ProductModelDto | undefined;
}

/**
 * Build the export CSV text for a set of SKUs. price 0 + cost null serialise as
 * BLANK (Carres treats them as "not set"), so an export -> edit -> re-import
 * round-trip preserves an unpriced SKU as unpriced (no pricing intent => an
 * operation user can round-trip structure without tripping the principal lock).
 */
export function buildSkuExportCsv(rows: ExportSkuRow[]): string {
  const lines = [SKU_EXPORT_COLUMNS.join(",")];
  for (const { sku, model } of rows) {
    const rec: Record<(typeof SKU_EXPORT_COLUMNS)[number], unknown> = {
      model: model?.name ?? "",
      model_key: model?.modelKey ?? "",
      category: model?.category ?? "",
      variant: sku.variant,
      variant_kind: sku.variantKind,
      price: sku.price > 0 ? sku.price : "",
      cost: sku.cost ?? "",
      description: sku.description ?? "",
      pos_active: sku.posActive === false ? "no" : "yes",
      sku: sku.sku,
    };
    lines.push(SKU_EXPORT_COLUMNS.map((c) => csvCell(rec[c])).join(","));
  }
  return lines.join("\n");
}

/** Trigger a client-side CSV download. */
export function downloadCsv(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Header-key a 2D string grid (row 0 = headers) into record objects. Blank rows
 *  are dropped; cells are trimmed; header case is preserved (the shared mapper
 *  lowercases on lookup, so matching stays case-insensitive). */
function gridToRecords(grid: string[][]): Record<string, string>[] {
  if (grid.length < 1) return [];
  const header = (grid[0] ?? []).map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    if (!cells || cells.every((c) => c.trim() === "")) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c];
      if (!key) continue;
      obj[key] = (cells[c] ?? "").trim();
    }
    out.push(obj);
  }
  return out;
}

/** Parse an .xlsx/.xls file (first sheet) into header-keyed records. Lazy-loads
 *  the xlsx library so it never touches the main bundle. */
export async function readXlsxToRecords(file: File): Promise<Record<string, string>[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstName = wb.SheetNames[0];
  const sheet = firstName ? wb.Sheets[firstName] : undefined;
  if (!sheet) return [];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  const grid = aoa
    .map((r) => (Array.isArray(r) ? r.map((cell) => String(cell ?? "")) : []))
    .filter((r) => r.some((cell) => cell.trim().length > 0));
  return gridToRecords(grid);
}

/** Read a CSV or XLSX file into header-keyed records, dispatching on extension. */
export async function readFileToRecords(file: File): Promise<Record<string, string>[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return readXlsxToRecords(file);
  }
  const text = await file.text();
  return parseCsv(text).rows;
}
