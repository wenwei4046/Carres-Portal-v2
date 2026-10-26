import type { FabricTier } from "@carres/shared";

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
}

const COLUMNS = ["fabric_code", "series", "description", "supplier_code", "sofa_tier", "bedframe_tier", "active"] as const;

const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function buildFabricCsv(rows: FabricCsvRow[]): string {
  const lines = rows.map((r) =>
    [r.fabricCode, r.series, r.description, r.supplierCode, r.sofaTier, r.bedframeTier, r.active ? "yes" : "no"]
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
  const rows = current.map((r) => ({ ...r }));
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
