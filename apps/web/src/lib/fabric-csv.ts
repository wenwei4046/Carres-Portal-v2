import { FABRIC_STOCK_KEYS, type FabricTier } from "@carres/shared";

/**
 * Fabric master Export CSV / Import (CSV or Excel) for the Fabrics panel.
 *
 * Follows Houzs frontend/src/pages/scm-v2/FabricTracking.tsx:66-87 and
 * frontend/src/vendor/scm/lib/fabric-csv.ts:84-156 per Weisiang's ruling
 * (2026-10-22): clear Carres rules, implement Houzs. Houzs bulk-upserts by
 * fabric code and only the columns present in the file overwrite; blank cells
 * keep what is there. Here the merge lands in the Edit draft, so the principal
 * sees the result and presses Save (the existing batch save + history).
 */

export interface FabricCsvRow {
  fabricCode: string;
  series: string;
  description: string;
  supplierCode: string;
  sofaTier: FabricTier;
  bedframeTier: FabricTier;
  active: boolean;
  /** Houzs stock columns (sen / days). Absent = not loaded or not changed. */
  stock?: Partial<Record<StockKey, number>>;
}

type StockKey = (typeof FABRIC_STOCK_KEYS)[number];
/** priceSen → price_sen: the same header names as Houzs fabric-csv.ts:42-53. */
const stockCol = (k: StockKey) => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

const COLUMNS = [
  "fabric_code", "series", "description", "supplier_code", "sofa_tier", "bedframe_tier", "active",
  ...FABRIC_STOCK_KEYS.map(stockCol),
];

const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function buildFabricCsv(rows: FabricCsvRow[]): string {
  const lines = rows.map((r) =>
    [
      r.fabricCode, r.series, r.description, r.supplierCode, r.sofaTier, r.bedframeTier, r.active ? "yes" : "no",
      ...FABRIC_STOCK_KEYS.map((k) => (r.stock?.[k] === undefined ? "" : String(r.stock[k]))),
    ]
      .map(cell)
      .join(","),
  );
  return [COLUMNS.join(","), ...lines].join("\n");
}

/** "PRICE_2", "Price 2" or "2" → PRICE_2; anything else → null (an error). */
function parseTier(v: string): FabricTier | null {
  const m = /^(?:price[\s_]*)?([123])$/i.exec(v.trim());
  return m ? (`PRICE_${m[1]}` as FabricTier) : null;
}

function parseActive(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (["yes", "y", "true", "1", "active"].includes(s)) return true;
  if (["no", "n", "false", "0", "retired", "inactive"].includes(s)) return false;
  return null;
}

export interface FabricImportResult {
  rows: FabricCsvRow[];
  added: number;
  updated: number;
  errors: string[];
}

/** Merge header-keyed records into `current` by fabric code (upsert). */
export function mergeFabricImport(current: FabricCsvRow[], records: Record<string, string>[]): FabricImportResult {
  const rows: FabricCsvRow[] = current.map((r) => (r.stock ? { ...r, stock: { ...r.stock } } : { ...r }));
  const byCode = new Map(rows.map((r) => [r.fabricCode.trim().toUpperCase(), r]));
  const errors: string[] = [];
  let added = 0;
  let updated = 0;

  records.forEach((raw, i) => {
    const rec: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) rec[k.trim().toLowerCase().replace(/\s+/g, "_")] = (v ?? "").trim();
    const line = i + 2; // header is line 1
    const code = rec.fabric_code ?? rec.code ?? "";
    if (!code) {
      errors.push(`Line ${line}: fabric code is blank.`);
      return;
    }
    const tiers: Partial<Pick<FabricCsvRow, "sofaTier" | "bedframeTier">> = {};
    for (const [col, field] of [["sofa_tier", "sofaTier"], ["bedframe_tier", "bedframeTier"]] as const) {
      if (!rec[col]) continue;
      const t = parseTier(rec[col]);
      if (!t) {
        errors.push(`Line ${line}: ${col} "${rec[col]}" is not Price 1, 2 or 3.`);
        return;
      }
      tiers[field] = t;
    }
    // Houzs fabric-tracking.ts:300-308: whole numbers, a decimal is cut, a
    // non-number refuses the row. Blank keeps the stored value.
    const stock: Partial<Record<StockKey, number>> = {};
    for (const k of FABRIC_STOCK_KEYS) {
      const v = rec[stockCol(k)];
      if (!v) continue;
      const n = Number(v.replace(/,/g, ""));
      if (!Number.isFinite(n)) {
        errors.push(`Line ${line}: ${stockCol(k)} "${v}" is not a number.`);
        return;
      }
      stock[k] = Math.trunc(n);
    }
    let active: boolean | undefined;
    if (rec.active) {
      const a = parseActive(rec.active);
      if (a === null) {
        errors.push(`Line ${line}: active "${rec.active}" is not yes or no.`);
        return;
      }
      active = a;
    }
    const existing = byCode.get(code.toUpperCase());
    const row: FabricCsvRow = existing ?? {
      fabricCode: code,
      series: "",
      description: "",
      supplierCode: "",
      sofaTier: "PRICE_2",
      bedframeTier: "PRICE_2",
      active: true,
    };
    if (rec.series) row.series = rec.series;
    if (rec.description) row.description = rec.description;
    if (rec.supplier_code) row.supplierCode = rec.supplier_code;
    Object.assign(row, tiers);
    if (active !== undefined) row.active = active;
    if (Object.keys(stock).length > 0) row.stock = { ...row.stock, ...stock };
    if (existing) {
      updated++;
    } else {
      rows.push(row);
      byCode.set(code.toUpperCase(), row);
      added++;
    }
  });

  return { rows, added, updated, errors };
}
