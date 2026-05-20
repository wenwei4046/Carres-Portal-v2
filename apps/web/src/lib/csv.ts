/**
 * Tiny CSV parser — RFC 4180 subset, handles quoted fields + embedded commas
 * + embedded newlines + escaped quotes ("" inside quoted). Returns array of
 * row objects keyed by the first row's column headers.
 *
 * Built fresh in apps/web/src/lib/csv.ts to avoid pulling papaparse (~14KB
 * minified) for a one-off use. Tests in csv.test.ts cover the edge cases.
 *
 * Loo Q5 (locked 2026-05-19): AutoCount exports CSV directly; portal accepts
 * CSV upload instead of xlsx. Bundle stays thin.
 */

export interface CsvParseError {
  row: number;
  col: number;
  message: string;
}

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
  errors: CsvParseError[];
}

/**
 * Parse a CSV text blob. Tolerant: trailing blank rows are dropped; rows
 * with fewer columns than the header pad with empty strings; rows with
 * more columns drop the excess and record a soft warning in `errors`.
 */
export function parseCsv(text: string): CsvParseResult {
  const errors: CsvParseError[] = [];

  // Normalise CRLF/CR → LF first so the state machine doesn't have to.
  const src = text.replace(/\r\n?/g, "\n");

  // Tokeniser: walks char-by-char, building cell strings, emitting row arrays
  // on unquoted newlines.
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let inQuotes = false;
  let lineNo = 1;
  let colNo = 1;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else if (ch === "\n") {
        cell += "\n"; // embedded newline inside quoted cell — preserve
        lineNo++;
        colNo = 1;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        if (cell === "") {
          inQuotes = true;
        } else {
          // Mid-cell quote with no opening — treat as literal but flag.
          cell += ch;
          errors.push({ row: lineNo, col: colNo, message: "stray quote inside unquoted cell" });
        }
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        cell = "";
        rows.push(row);
        row = [];
        lineNo++;
        colNo = 0;
      } else {
        cell += ch;
      }
    }
    colNo++;
  }
  // Flush trailing cell + row if last char wasn't a newline.
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Drop trailing empty rows (common from a trailing newline + Excel export).
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === "")) {
    rows.pop();
  }

  if (rows.length === 0) {
    return { headers: [], rows: [], errors };
  }

  // First row = headers; trim each so "  Ref. " → "Ref."
  const headers = rows[0].map((h) => h.trim());

  // Build row objects.
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const raw = rows[r];
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (raw[c] ?? "").trim();
    }
    if (raw.length > headers.length) {
      errors.push({
        row: r + 1,
        col: headers.length + 1,
        message: `row has ${raw.length} cols, header has ${headers.length} — extras dropped`,
      });
    }
    out.push(obj);
  }

  return { headers, rows: out, errors };
}

// --- AutoCount listing-specific column mapping ----------------------------

/**
 * Map an AutoCount-listing CSV row (whose column names mirror the xlsx
 * listing) to the `AutocountImportRow` shape the /api/orders/import
 * endpoint accepts. Returns null when the row has no usable Ref. (silent
 * skip — AutoCount sometimes exports blank trailing rows).
 *
 * Column names accepted (case-insensitive trim-tolerant):
 *   Ref.                      → ref
 *   Delivery Location         → deliveryLocation
 *   New- Delivery Date        → deliveryDate (parsed: serial int OR
 *                               ISO string OR "DD/MM/YYYY")
 *   Item Group                → itemGroup
 *   Qty                       → qty (parsed int, default 1)
 *   Detail Description        → detailDescription
 *   PO Doc No.                → poDocNo
 *   Debtor Name               → debtorName
 *   Phone                     → phone
 *   Delivery Address 1..4     → addr1..4
 *   Balance                   → balance
 */
export function listingRowToImportRow(
  rawRow: Record<string, string>,
): {
  ref: string;
  deliveryLocation: string | null;
  deliveryDate: string | null;
  itemGroup: string;
  qty: number;
  detailDescription: string;
  poDocNo: string | null;
  debtorName: string;
  phone: string | null;
  addr1: string | null;
  addr2: string | null;
  addr3: string | null;
  addr4: string | null;
  balance: string | null;
} | null {
  // Build a case-insensitive lookup (forgive minor header casing variance).
  const lc: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawRow)) {
    lc[k.trim().toLowerCase()] = v;
  }
  const get = (key: string) => (lc[key.toLowerCase()] ?? "").trim();
  const nullable = (key: string) => {
    const v = get(key);
    return v === "" ? null : v;
  };

  const ref = get("ref.") || get("ref");
  if (!ref) return null;

  const qtyRaw = get("qty");
  const qtyNum = qtyRaw ? Number(qtyRaw) : 1;
  const qty = Number.isFinite(qtyNum) && qtyNum > 0 ? Math.floor(qtyNum) : 1;

  const debtorName = get("debtor name") || get("debtorname");
  const itemGroup = get("item group") || get("itemgroup");
  const detailDescription = get("detail description") || get("detaildescription") || get("description");

  return {
    ref,
    deliveryLocation: nullable("delivery location"),
    deliveryDate: parseDeliveryDate(get("new- delivery date") || get("delivery date") || get("new-delivery date")),
    itemGroup,
    qty,
    detailDescription,
    poDocNo: nullable("po doc no.") || nullable("po doc no") || nullable("podocno"),
    debtorName,
    phone: nullable("phone"),
    addr1: nullable("delivery address 1") || nullable("addr1"),
    addr2: nullable("delivery address 2") || nullable("addr2"),
    addr3: nullable("delivery address 3") || nullable("addr3"),
    addr4: nullable("delivery address 4") || nullable("addr4"),
    balance: nullable("balance"),
  };
}

/**
 * AutoCount dates come in 3 flavours depending on Excel/CSV export settings:
 *   - Excel serial int (e.g. "46143" = 2026-05-19 + serial origin)
 *   - ISO "YYYY-MM-DD"
 *   - "DD/MM/YYYY" (Malaysian default Excel locale)
 * Returns ISO "YYYY-MM-DD" or null if unparseable / blank.
 */
function parseDeliveryDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO already?
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return s;

  // DD/MM/YYYY?
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${mm}-${dd}`;
  }

  // Excel serial int?
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    // Excel epoch is 1899-12-30 (accounting for the 1900 leap-year bug).
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + Math.round(n) * 86400000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }
  }

  return null;
}
