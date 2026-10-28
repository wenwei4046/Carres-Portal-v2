import { z } from "zod";

/**
 * Reading a supplier's bill (Finance MASTER §3.2 "Bill scanning", Chew
 * 2026-10-03): the pages go to an AI model once, and what it reads only
 * PRE-FILLS a form a person then checks and saves. Nothing is written by the
 * reading itself, and nothing here ever guesses: a figure the model could not
 * read stays empty, and a supplier is matched by its name or not at all.
 *
 * Evidence, not specification: the Houzs reference (Part 5 §7) reads bills the
 * same way. This file is the one place the answer is cleaned (law D): the API
 * runs it on the model's answer, and its tests pin every rule.
 */

export const BILL_READ_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type BillReadMime = (typeof BILL_READ_MIME)[number];
/** Pages of one bill in one reading. */
export const BILL_READ_MAX_FILES = 8;
/** Per page, before base64. The model's own limit for one image is 5 MB, so a
 *  photo larger than that is refused by the model, not cut by us. */
export const BILL_READ_MAX_BYTES = 10 * 1024 * 1024;

const base64Max = Math.ceil(BILL_READ_MAX_BYTES / 3) * 4;

export const billReadInput = z
  .object({
    files: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(200),
            mime: z.enum(BILL_READ_MIME, { errorMap: () => ({ message: "Read a PDF or a photo (JPEG, PNG or WebP)." }) }),
            dataBase64: z
              .string()
              .min(1, "That file is empty.")
              .max(base64Max, "That file is too big to read. 10 MB at most.")
              .regex(/^[A-Za-z0-9+/]+={0,2}$/, "That file could not be read."),
          })
          .strict(),
      )
      .min(1, "Choose the bill to read.")
      .max(BILL_READ_MAX_FILES, `A bill is read with at most ${BILL_READ_MAX_FILES} pages.`),
  })
  .strict();
export type BillReadInput = z.infer<typeof billReadInput>;

export const BILL_DOCUMENT_KINDS = ["invoice", "receipt", "proforma", "quotation", "credit_note", "debit_note", "other"] as const;
export type BillDocumentKind = (typeof BILL_DOCUMENT_KINDS)[number];

export interface BillReadingLine {
  description: string;
  /** Ringgit (or the bill's currency), two decimals. */
  amount: number;
}

export interface BillReading {
  vendorName: string | null;
  vendorRegNo: string | null;
  documentKind: BillDocumentKind | null;
  invoiceNumber: string | null;
  /** YYYY-MM-DD */
  invoiceDate: string | null;
  dueDate: string | null;
  /** As printed, upper case: MYR, USD, RMB… */
  currency: string | null;
  total: number | null;
  lines: BillReadingLine[];
}

/** What the API answers: the reading, and the supplier it matched, if one. */
export interface BillReadAnswer {
  reading: BillReading;
  supplier: { id: string; name: string; kind: string | null; how: "exact" | "contains" } | null;
}

/** The instruction sent with the pages. Plain rules; the answer is one JSON object. */
export const BILL_READER_PROMPT = [
  "These files are the pages of ONE document a supplier sent to Carres, a furniture retailer in Malaysia.",
  "Read it and answer with ONE JSON object and nothing else, in exactly this shape:",
  '{"vendorName": string|null, "vendorRegNo": string|null, "documentKind": "invoice"|"receipt"|"proforma"|"quotation"|"credit_note"|"debit_note"|"other"|null, "invoiceNumber": string|null, "invoiceDate": "YYYY-MM-DD"|null, "dueDate": "YYYY-MM-DD"|null, "currency": string|null, "total": number|null, "lines": [{"description": string, "amount": number}]}',
  "Rules:",
  "- The vendor is the company that ISSUED the document, never the company it is addressed to (Carres).",
  "- A field you cannot read with confidence is null. Never estimate, never calculate a missing figure.",
  "- Dates printed as DD/MM/YYYY are day first (Malaysian order). Write them as YYYY-MM-DD.",
  "- Amounts are plain numbers with two decimals: no currency symbol, no thousands separator.",
  "- total is the amount payable printed on the document.",
  "- lines are the item lines only. Leave out sub total, total, tax summary, payment, tender, change and item count rows. A tax or delivery charge printed as its own line is a line.",
  "- Each line's amount is that line's total, not the unit price. A discount line is negative.",
  "- If the document has no item lines, lines is [].",
].join("\n");

// ── cleaning the model's answer ─────────────────────────────────────────────

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day as YYYY-MM-DD, or null. */
export function readDay(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = ISO_DAY.exec(v.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  if (y < 2000 || y > 2100) return null;
  return v.trim();
}

/** A finite amount rounded to the sen, or null. Accepts "1,234.50" and "RM 12". */
export function readAmount(v: unknown): number | null {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    const s = v.replace(/[,\s]/g, "").replace(/^(RM|MYR)/i, "");
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    n = Number(s);
  } else return null;
  if (!Number.isFinite(n) || Math.abs(n) >= 1e10) return null;
  return Math.round(n * 100) / 100;
}

/** Trimmed text on one line, at most `max` characters; empty is null. */
export function readText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s === "" ? null : s.slice(0, max);
}

/** Rows a till or an invoice prints under the items, which are not costs. */
const FOOTER_ROWS = new Set([
  "subtotal", "sub total", "total", "grand total", "net total", "nett total", "total amount", "total amount due",
  "amount due", "amount payable", "total payable", "balance due", "total due", "total rm", "total myr",
  "tender", "tendered", "change", "cash", "cash tendered", "cash received", "paid", "amount paid",
  "item count", "items", "total items", "total item", "total qty", "total quantity",
]);

/** True for a footer row: a total, tender, change or count — never a cost. A
 *  rounding row is a footer row only when it is zero. */
export function isFooterRow(description: string, amount: number): boolean {
  const key = description.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (FOOTER_ROWS.has(key)) return true;
  return /^rounding( adj(ustment)?)?$/.test(key) && amount === 0;
}

/** At most this many lines are pre-filled; a bill takes 300 (0477). */
export const BILL_READ_MAX_LINES = 300;

/**
 * The model's answer as a BillReading, or null when it is not an object.
 * Every field is checked on its own; one unreadable field never spoils the rest.
 */
export function cleanBillReading(raw: unknown): BillReading | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const kind = typeof r.documentKind === "string" && (BILL_DOCUMENT_KINDS as readonly string[]).includes(r.documentKind)
    ? (r.documentKind as BillDocumentKind) : null;
  // A Malaysian bill prints RM; the code is MYR. Anything else must already be
  // a three-letter code: never cut a word down to look like one.
  const printed = readText(r.currency, 20)?.toUpperCase() ?? null;
  const currency = printed === "RM" ? "MYR" : printed;
  const lines: BillReadingLine[] = [];
  if (Array.isArray(r.lines)) {
    for (const item of r.lines) {
      if (lines.length >= BILL_READ_MAX_LINES) break;
      if (item === null || typeof item !== "object") continue;
      const l = item as Record<string, unknown>;
      const description = readText(l.description, 200);
      const amount = readAmount(l.amount);
      if (description === null || amount === null || amount === 0) continue;
      if (isFooterRow(description, amount)) continue;
      lines.push({ description, amount });
    }
  }
  return {
    vendorName: readText(r.vendorName, 200),
    vendorRegNo: readText(r.vendorRegNo, 60),
    documentKind: kind,
    invoiceNumber: readText(r.invoiceNumber, 60),
    invoiceDate: readDay(r.invoiceDate),
    dueDate: readDay(r.dueDate),
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    total: readAmount(r.total),
    lines,
  };
}

/** The first JSON object in the model's text, fenced or not; null if none parses. */
export function parseModelJson(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** The lines add up to the printed total, to the sen. Null when either is missing. */
export function linesMatchTotal(reading: BillReading): boolean | null {
  if (reading.total === null || reading.lines.length === 0) return null;
  const sum = reading.lines.reduce((s, l) => s + Math.round(l.amount * 100), 0);
  return sum === Math.round(reading.total * 100);
}

// ── which supplier sent it ──────────────────────────────────────────────────

const COMPANY_WORDS = /\b(SDN|BHD|S\/B|SB|PLT|BERHAD|ENTERPRISES?|TRADING|CO|COMPANY|LTD|LIMITED|INDUSTRIES|INDUSTRY|MANUFACTURING|MFG|M)\b/g;

/** A company name with case, punctuation and company-type words taken away. */
export function normalizeVendor(name: string): string {
  return name
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/S\/B/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(COMPANY_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The one supplier whose name is the printed vendor's, or contains it, or is
 * contained in it. Two candidates, or none, is no match: never a guess.
 */
export function matchSupplier<T extends { id: string; name: string }>(
  vendorName: string | null,
  suppliers: readonly T[],
): { supplier: T; how: "exact" | "contains" } | null {
  if (!vendorName) return null;
  const printed = normalizeVendor(vendorName);
  if (printed.length < 3) return null;
  const named = suppliers.map((s) => ({ s, n: normalizeVendor(s.name) })).filter((x) => x.n.length >= 3);
  const exact = named.filter((x) => x.n === printed);
  if (exact.length === 1) return { supplier: exact[0]!.s, how: "exact" };
  if (exact.length > 1) return null;
  const contains = named.filter((x) => x.n.includes(printed) || printed.includes(x.n));
  return contains.length === 1 ? { supplier: contains[0]!.s, how: "contains" } : null;
}
