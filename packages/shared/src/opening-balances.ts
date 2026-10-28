/**
 * OPENING BALANCES — Finance's figures at go-live (migration 0705; Chew
 * 2026-10-21/22, docs/finance/MASTER.md §3.5 "Opening balances").
 *
 * A draft Finance saves and changes freely, in five tabs, posted once as ONE
 * ledger entry dated the day before go-live. This file holds the wire shapes,
 * the inputs the API takes, the two Excel paste readers and the arithmetic the
 * page shows (Law D: one place), in sen.
 *
 *   a party's difference   its total less its open items
 *   the draft's totals     Σ debits and Σ credits of every line it posts
 *   what 160-0000 holds    debits less credits; Post needs RM 0.00
 */
import { z } from "zod";
import { ledgerAccountCodeShape } from "./finance-ledger";

// ── the read ────────────────────────────────────────────────────────────────

export type OpeningPartyType = "CUSTOMER" | "OTHER" | "SUPPLIER";

export interface OpeningItemWire {
  id: string;
  doc_no: string;
  doc_date: string;
  due_date: string | null;
  amount: number | string;
}

export interface OpeningPartyWire {
  id: string;
  party_type: OpeningPartyType;
  party_id: string;
  name: string | null;
  account_code: string;
  account_name: string | null;
  total: number | string;
  items_total: number | string;
  difference: number | string;
  items: OpeningItemWire[];
}

export interface OpeningAccountWire {
  code: string;
  name: string;
  kind: string;
  special: string | null;
  debit: number | string;
  credit: number | string;
  /** False for a saved account that may no longer take an opening (retired, made a control account). */
  eligible: boolean;
}

export interface OpeningStockWire {
  unit_code: string;
  unit_id: string | null;
  found: boolean;
  sku: string | null;
  qty: number | null;
  unit_cost: number | string;
  value: number | string | null;
}

export interface OpeningDepositWire {
  id: string;
  order_ref: string;
  customer_ref: string | null;
  order_id: string | null;
  found: boolean;
  so: number | null;
  customer_name: string | null;
  delivered_at: string | null;
  account_code: string | null;
  amount: number | string;
}

export interface OpeningChoice { id: string; name: string | null; phone?: string | null; kind?: string | null }
export interface OpeningAccountChoice { code: string; name: string; control_for: string }

export interface OpeningAnswer {
  status: "draft" | "posted";
  go_live_on: string | null;
  entry_date: string | null;
  books_closed_through: string | null;
  entry: { id: string; entry_no: string } | null;
  posted_at: string | null;
  posted_by_name: string | null;
  updated_at: string;
  updated_by_name: string | null;
  last_reversed: { at: string; by_name: string | null; reason: string } | null;
  may_post: boolean;
  accounts: OpeningAccountWire[];
  parties: OpeningPartyWire[];
  stock: OpeningStockWire[];
  deposits: OpeningDepositWire[];
  totals: { debit: number | string; credit: number | string; lines: number };
  choices: {
    customers: OpeningChoice[];
    other_debtors: OpeningChoice[];
    suppliers: OpeningChoice[];
    debtor_accounts: OpeningAccountChoice[];
    supplier_accounts: OpeningAccountChoice[];
    default_accounts: Partial<Record<OpeningPartyType, string | null>>;
  };
}

/** `GET /finance/opening-balances/state`: what every report's caption needs. */
export interface OpeningState {
  status: "draft" | "posted";
  entry_date: string | null;
  entry_no: string | null;
}

// ── money in sen ────────────────────────────────────────────────────────────

export const OPENING_MAX_MONEY = 9_999_999_999.99;

/** A wire amount to sen; a figure that is not a number is refused, never read as zero. */
export function openingSen(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("An opening amount could not be read.");
  return Math.round(n * 100);
}

/** What 160-0000 would hold after Post: debits less credits. Zero is the only postable answer. */
export function openingDifference(totals: OpeningAnswer["totals"]): number {
  return (openingSen(totals.debit) - openingSen(totals.credit)) / 100;
}

/** A party whose open items do not add up to its total (Chew 2026-10-22: it may still post, with a remark). */
export function partyDiffers(p: Pick<OpeningPartyWire, "difference">): boolean {
  return openingSen(p.difference) !== 0;
}

/**
 * Typed money → ringgit, nothing (blank) or the reason it cannot be read.
 * `RM` and thousands commas are allowed; a minus only where `negative`.
 */
export function readOpeningAmount(typed: string, negative = false): { value: number | null; error?: string } {
  const t = typed.replace(/RM/gi, "").replace(/,/g, "").replace(/\s+/g, "");
  if (t === "") return { value: null };
  if (!(negative ? /^-?\d+(\.\d+)?$/ : /^\d+(\.\d+)?$/).test(t)) return { value: null, error: "Type the amount in numbers, like 1500.00." };
  const n = Number(t);
  if (Math.round(n * 100) / 100 !== n) return { value: null, error: "An amount has at most two decimals." };
  if (Math.abs(n) > OPENING_MAX_MONEY) return { value: null, error: "The amount is larger than the ledger can hold." };
  return { value: n };
}

// ── the inputs ──────────────────────────────────────────────────────────────

const was = z.string().datetime({ offset: true });
const money = z.number().finite().refine((v) => Math.abs(v) <= OPENING_MAX_MONEY, "The amount is larger than the ledger can hold.")
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "An amount has at most two decimals.")
  .transform((v) => Math.round(v * 100) / 100);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date.");

/** `PUT /finance/opening-balances/accounts`: the whole tab at once. */
export const openingAccountsInput = z.object({
  lines: z.array(z.object({
    account_code: z.string().regex(ledgerAccountCodeShape, "That account is not in the chart."),
    debit: money.nullable().optional(),
    credit: money.nullable().optional(),
  }).strict()).max(2000),
  was,
}).strict();
export type OpeningAccountsInput = z.infer<typeof openingAccountsInput>;

/** `POST /finance/opening-balances/parties`: one party with its open items. `id` changes a row already on the list. */
export const openingPartyInput = z.object({
  id: z.string().uuid().nullable(),
  party_type: z.enum(["CUSTOMER", "OTHER", "SUPPLIER"]),
  party_id: z.string().uuid("Choose the party."),
  account_code: z.string().regex(ledgerAccountCodeShape, "Choose the party's account."),
  total: money,
  items: z.array(z.object({
    doc_no: z.string().trim().min(1, "Type the document number.").max(60),
    doc_date: isoDay,
    due_date: isoDay.nullable(),
    amount: money,
  }).strict()).max(500),
  was,
}).strict();
export type OpeningPartyInput = z.infer<typeof openingPartyInput>;

export const openingRemoveInput = z.object({ was }).strict();

/** `PUT /finance/opening-balances/stock`: the whole tab at once. */
export const openingStockInput = z.object({
  rows: z.array(z.object({ unit_code: z.string().trim().min(1).max(80), unit_cost: money }).strict()).max(10000),
  was,
}).strict();
export type OpeningStockInput = z.infer<typeof openingStockInput>;

/** `PUT /finance/opening-balances/deposits`: the whole tab at once. */
export const openingDepositsInput = z.object({
  rows: z.array(z.object({
    order_ref: z.string().trim().min(1).max(40),
    customer_ref: z.string().max(200).nullable().optional(),
    amount: money,
  }).strict()).max(5000),
  was,
}).strict();
export type OpeningDepositsInput = z.infer<typeof openingDepositsInput>;

export const openingPostInput = z.object({ was }).strict();
export const openingReverseInput = z.object({ reason: z.string().trim().min(1, "Type the reason.").max(500) }).strict();

// ── pasted from Excel ───────────────────────────────────────────────────────

export interface PasteProblem { line: number; text: string; reason: string }

/** One pasted line as cells. Excel copies with tabs; a line with no tab is read as comma separated. */
function cellsOf(line: string): string[] {
  return (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim());
}

/** Lines that hold something, numbered as pasted. */
function linesOf(text: string): Array<{ line: number; text: string }> {
  return text.split(/\r?\n/).map((t, i) => ({ line: i + 1, text: t })).filter((l) => l.text.trim() !== "");
}

/**
 * The Stock tab's paste: two columns, Unit and cost. A first line whose cost
 * is not a number is read as the column names and skipped. A line that cannot
 * be read is named, never guessed.
 */
export function readStockPaste(text: string): { rows: Array<{ unit_code: string; unit_cost: number }>; problems: PasteProblem[] } {
  const rows: Array<{ unit_code: string; unit_cost: number }> = [];
  const problems: PasteProblem[] = [];
  for (const [i, l] of linesOf(text).entries()) {
    const tabbed = l.text.includes("\t");
    const cells = cellsOf(l.text);
    // Comma separated: the first comma ends the Unit; the rest is the cost.
    const unit = cells[0] ?? "";
    const costText = tabbed ? (cells[1] ?? "") : cells.slice(1).join("");
    const cost = readOpeningAmount(costText);
    if (i === 0 && (cost.error || cost.value === null) && !/\d/.test(costText)) continue;
    if (!unit) problems.push({ line: l.line, text: l.text, reason: "No Unit." });
    else if (cost.value === null) problems.push({ line: l.line, text: l.text, reason: cost.error ?? "No cost." });
    else rows.push({ unit_code: unit, unit_cost: cost.value });
  }
  return { rows, problems };
}

/**
 * The Customer deposits tab's paste: `SO No, amount`, or `Customer, SO No,
 * amount` as Chew keeps it. The customer as pasted is kept beside the order's
 * own, so a mismatch shows; the order decides who the customer is.
 */
export function readDepositPaste(text: string): {
  rows: Array<{ order_ref: string; customer_ref: string | null; amount: number }>;
  problems: PasteProblem[];
} {
  const rows: Array<{ order_ref: string; customer_ref: string | null; amount: number }> = [];
  const problems: PasteProblem[] = [];
  for (const [i, l] of linesOf(text).entries()) {
    const cells = cellsOf(l.text).filter((c, k, all) => c !== "" || k < all.length - 1);
    const three = cells.length >= 3;
    const customer = three ? cells[0]! : null;
    const order = (three ? cells[1] : cells[0]) ?? "";
    const amountText = (three ? cells.slice(2) : cells.slice(1)).join(l.text.includes("\t") ? " " : "");
    const amount = readOpeningAmount(amountText);
    if (i === 0 && amount.value === null && !/\d/.test(amountText)) continue;
    if (!order) problems.push({ line: l.line, text: l.text, reason: "No SO No." });
    else if (amount.value === null || amount.value === 0) problems.push({ line: l.line, text: l.text, reason: amount.error ?? "No deposit." });
    else rows.push({ order_ref: order, customer_ref: customer || null, amount: amount.value });
  }
  return { rows, problems };
}

/** Pasted rows over the tab's rows: a Unit or an order already listed takes the pasted figure; the rest are added. */
export function mergeByKey<T>(current: readonly T[], pasted: readonly T[], key: (r: T) => string): T[] {
  const out = new Map<string, T>();
  for (const r of current) out.set(key(r).toUpperCase(), r);
  for (const r of pasted) out.set(key(r).toUpperCase(), r);
  return [...out.values()];
}
