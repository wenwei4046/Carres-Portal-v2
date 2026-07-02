import { z } from "zod";

/**
 * Stock-ETA import — the one parser + matcher shared by the staged-preview client
 * (apps/web ImportStockEtaDialog) and the server (POST
 * /operation/orders/import-stock-eta). Jess maintains per-line Stock ETA (col AA)
 * and Stock Status (col Z) in his "Master N.xlsx" (sheet "Ops"); AutoCount orders
 * never carried these, so the order detail's Stock ETA box showed blank. This
 * ingests the sheet and fills each line's ETA.
 *
 * The join back to a portal order line is FUZZY on purpose (the sheet + the
 * AutoCount order carry the same product NAME + PO but with cosmetic drift — a
 * colour code like `/PC15` vs `/COL:…`, spacing, case). So we group by PO
 * (order_lines.source_po, which the detail already reads) and inside each PO
 * pick the order line with the best token overlap. A PO with one line matches
 * trivially; a multi-size PO disambiguates by the size/model tokens.
 */

// ---------------------------------------------------------------------------
// Pure cell parsers
// ---------------------------------------------------------------------------

/** Excel serial date → ISO `yyyy-mm-dd`, tz-safe (UTC math, date-only). Excel's
 *  epoch is 1899-12-30 (its 1900-leap-year bug puts serial 1 at 1900-01-01).
 *  Returns null for a non-positive / non-finite serial. */
export function excelSerialToISO(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const ms = Math.round(serial) * 86_400_000 + Date.UTC(1899, 11, 30);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Normalize a PO cell for matching: trim, drop all whitespace, upper-case, so
 *  " PO/2603-065" and "PO/2603-065" collapse to one key. */
export function normalizePoKey(po: string | undefined | null): string {
  return (po ?? "").replace(/\s+/g, "").toUpperCase();
}

/** A Stock-ETA cell can arrive as an Excel serial (raw xlsx read), an ISO date,
 *  or a d-Mon-yy display string. Normalize to ISO `yyyy-mm-dd`, or null if blank
 *  / unparseable. */
export function parseEtaCell(raw: string | number | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return excelSerialToISO(raw);
  const s = raw.trim();
  if (s === "") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already ISO
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToISO(Number(s)); // serial as text
  const t = Date.parse(s); // "20 Jun 2026" etc — best-effort
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

/** The per-line readiness a Master "Stock Status" (col Z) maps to. */
export type LineStockStatus = "ready" | "waiting" | "nopo";

/** Map a Master "Stock Status" cell to the portal's readiness vocab:
 *  Received → ready · Pending → waiting · No Stock / No PO → nopo. Anything else
 *  (or blank) → null (no status to import). */
export function normalizeMasterStockStatus(
  raw: string | undefined | null,
): LineStockStatus | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "") return null;
  if (s.startsWith("receiv")) return "ready";
  if (s.startsWith("pend")) return "waiting";
  if (s.startsWith("no stock") || s === "no po" || s === "nopo") return "nopo";
  return null;
}

/** Split a product name into match tokens: lower-case, break letter/digit runs
 *  ("1013Jager" → 1013, jager), drop tokens < 2 chars. Mirrors the stock-picker
 *  ranking so the importer and the panel "feel" the same. */
export function tokenizeName(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

// ---------------------------------------------------------------------------
// One raw Master row -> a validated import row (or a skip reason)
// ---------------------------------------------------------------------------

export interface StockEtaImportRow {
  /** order_lines.source_po to join on (e.g. "PO/2603-065"). */
  po: string;
  /** The Master "Item Detail" (product name) — disambiguates lines in the PO. */
  sku: string;
  /** ISO `yyyy-mm-dd` when the stock arrives; omitted for received/blank. */
  eta?: string;
  /** Readiness from the Master "Stock Status" col (Received/Pending/No Stock →
   *  ready/waiting/nopo); omitted when the cell is blank/unmapped. */
  stockStatus?: LineStockStatus;
}

export type StockRowResult =
  | { ok: true; row: StockEtaImportRow }
  | { ok: false; reason: string };

/** Map ONE raw Master "Ops" record (header => cell) to an import row. Header
 *  lookup is case-insensitive + trimmed. Requires a PO + Item Detail, and at
 *  least one of a Stock ETA (Pending lines) or a mappable Stock Status (Received
 *  → ready etc.) — a row with neither carries nothing to import. */
export function masterRecordToStockRow(
  rec: Record<string, string | number>,
): StockRowResult {
  const norm: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(rec)) norm[k.trim().toLowerCase()] = v;
  const str = (k: string) => String(norm[k] ?? "").trim();

  const po = str("po");
  const sku = str("item detail") || str("item");
  if (!po) return { ok: false, reason: "missing PO" };
  if (!sku) return { ok: false, reason: "missing Item Detail" };

  const eta = parseEtaCell(norm["stock eta"] as string | number | undefined);
  const stockStatus = normalizeMasterStockStatus(str("stock status"));
  if (!eta && !stockStatus) {
    return { ok: false, reason: "no Stock ETA or Status to import" };
  }

  const row: StockEtaImportRow = { po, sku };
  if (eta) row.eta = eta;
  if (stockStatus) row.stockStatus = stockStatus;
  return { ok: true, row };
}

// ---------------------------------------------------------------------------
// Pure matcher — join import rows to portal order lines by PO + token overlap
// ---------------------------------------------------------------------------

export interface OrderLineRef {
  orderId: string;
  /** The exact order_lines.sku — this becomes the line_etas jsonb KEY, so the
   *  order detail's `line_etas[l.sku]` resolves. */
  sku: string;
  sourcePo: string | null;
}

export interface StockEtaMatch {
  orderId: string;
  sku: string;
  eta?: string;
  stockStatus?: LineStockStatus;
}

export interface StockMatchOutcome {
  matched: StockEtaMatch[];
  /** Import rows that found no order line (with a short why). */
  unmatched: { po: string; sku: string; reason: string }[];
}

/**
 * Join each import row to an order line: group order lines by PO key, then inside
 * the row's PO pick the line with the highest token overlap with the row's name
 * (ties → the first). A PO not present in any order → unmatched; a PO present but
 * with zero token overlap on every line → unmatched (never guess a wrong line).
 * A pure function so it's unit-tested without a DB.
 */
export function matchStockRows(
  rows: StockEtaImportRow[],
  lines: OrderLineRef[],
): StockMatchOutcome {
  const byPo = new Map<string, OrderLineRef[]>();
  for (const l of lines) {
    if (!l.sourcePo) continue;
    const k = normalizePoKey(l.sourcePo);
    (byPo.get(k) ?? byPo.set(k, []).get(k)!).push(l);
  }

  const matched: StockEtaMatch[] = [];
  const unmatched: { po: string; sku: string; reason: string }[] = [];

  for (const r of rows) {
    if (!r.eta && !r.stockStatus) continue;
    const candidates = byPo.get(normalizePoKey(r.po));
    if (!candidates || candidates.length === 0) {
      unmatched.push({ po: r.po, sku: r.sku, reason: "PO not found in any order" });
      continue;
    }
    const want = new Set(tokenizeName(r.sku));
    let best: OrderLineRef | null = null;
    let bestScore = -1;
    for (const c of candidates) {
      let score = 0;
      for (const t of tokenizeName(c.sku)) if (want.has(t)) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    // A single-line PO matches even at score 0 (no ambiguity); a multi-line PO
    // needs at least one shared token so we don't stamp the wrong size.
    if (best && (candidates.length === 1 || bestScore > 0)) {
      const m: StockEtaMatch = { orderId: best.orderId, sku: best.sku };
      if (r.eta) m.eta = r.eta;
      if (r.stockStatus) m.stockStatus = r.stockStatus;
      matched.push(m);
    } else {
      unmatched.push({ po: r.po, sku: r.sku, reason: "no matching line in PO" });
    }
  }

  return { matched, unmatched };
}

// ---------------------------------------------------------------------------
// Server zod — re-validates the rows the client mapper produced.
// ---------------------------------------------------------------------------

export const stockEtaImportRowSchema = z
  .object({
    po: z.string().trim().min(1).max(60),
    sku: z.string().trim().min(1).max(200),
    eta: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "eta must be yyyy-mm-dd")
      .optional(),
    stockStatus: z.enum(["ready", "waiting", "nopo"]).optional(),
  })
  .strict();
export type StockEtaImportRowParsed = z.infer<typeof stockEtaImportRowSchema>;

export const stockEtaImportInput = z
  .object({
    rows: z.array(stockEtaImportRowSchema).min(1).max(2000),
    /** Preview only — compute + return counts, write nothing. */
    dryRun: z.boolean().optional(),
  })
  .strict();
export type StockEtaImportInput = z.infer<typeof stockEtaImportInput>;

export interface StockEtaImportResult {
  /** Import rows matched to an order line. */
  matched: number;
  /** Import rows with no matching order line. */
  unmatched: number;
  /** Distinct orders whose line_etas were (or would be) written. */
  orders: number;
  /** Line ETAs actually written (0 on a dry run). */
  written: number;
  /** A short sample of unmatched rows, to spot a bad PO/name in the sheet. */
  sampleUnmatched: { po: string; sku: string; reason: string }[];
  dryRun: boolean;
}
