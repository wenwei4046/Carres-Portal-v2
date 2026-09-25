import { rm } from "@/lib/format-currency";

/**
 * The words the Bills and Payment Vouchers pages print (migration 0477).
 *
 * Every stored value that reaches the screen goes through one of these maps,
 * so a raw status or code (`draft`, `SUPPLIER_BILLS`, `BANK_TRANSFER`) never
 * does. A value the map does not know reads `Not known`, never itself. New
 * words are listed in docs/COPY-STANDARD.md under "Finance ledger words —
 * PROPOSAL, awaiting owner review".
 */

export const BILL_STATUS_WORD: Record<string, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

export const VOUCHER_STATUS_WORD: Record<string, string> = {
  draft: "Draft",
  prepared: "Prepared",
  checked: "Checked",
  approved: "Approved",
  cancelled: "Cancelled",
};

export const VOUCHER_PURPOSE_WORD: Record<string, string> = {
  SUPPLIER_BILLS: "Pay supplier bills",
  DIRECT: "Direct payment",
};

export const PAY_METHOD_WORD: Record<string, string> = {
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  CASH: "Cash",
  OTHER: "Other",
};

export const EVENT_WORD: Record<string, string> = {
  created: "Created",
  edited: "Changed",
  confirmed: "Confirmed",
  prepared: "Prepared",
  checked: "Checked",
  approved: "Approved",
  rejected: "Returned to draft",
  cancelled: "Cancelled",
  file_added: "File added",
  // Supplier advances (migration 0485).
  advance_applied: "Advance applied",
  advance_taken_off: "Advance taken off",
  money_back: "Money back recorded",
  money_back_cancelled: "Money back cancelled",
};

/** One knock-off of an advance against a bill (migration 0485). */
export const ADVANCE_APPLICATION_STATUS_WORD: Record<string, string> = {
  applied: "Applied",
  cancelled: "Taken off",
};

/** Money a supplier sent back out of an advance (migration 0485). */
export const MONEY_BACK_STATUS_WORD: Record<string, string> = {
  posted: "Recorded",
  voided: "Cancelled",
};

export function word(map: Record<string, string>, key: string | null | undefined): string {
  if (key == null || key === "") return "Not known";
  return map[key] ?? "Not known";
}

export function creditorKindWord(kind: string | null | undefined): string {
  if (kind == null) return "Not known";
  return kind === "other_creditor" ? "Other creditor" : "Supplier";
}

/** A number from the wire (Postgres numeric arrives as a number or a string). */
export function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Money for the screen. An absent or unreadable figure is a dash, never RM 0.00. */
export function money(v: number | string | null | undefined): string {
  const n = num(v);
  return n === null ? "—" : rm(n);
}

/** Round to the cent — the database stores numeric(12,2). */
export function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The price on the supplier's invoice against the PO's price: a flag, never a block. */
export function priceDiffWord(diff: number | null): string {
  if (diff === null) return "No PO price";
  if (Math.abs(diff) < 0.005) return "Same as PO price";
  return diff > 0 ? `${rm(diff)} above PO price` : `${rm(-diff)} below PO price`;
}

/** A bill's Price Check: how many of its lines differ from the PO price. The
 *  Bills register and the voucher's bill list say it the same way. */
export function priceCheckWord(r: { price_flags: number; grn_nos: string | null }): string {
  if (r.price_flags > 0) return `${r.price_flags} ${r.price_flags === 1 ? "line differs" : "lines differ"} from PO`;
  return r.grn_nos ? "Matches PO" : "No PO price";
}

/** Refusals the database words for a developer, re-worded for the operator.
 *  Everything else keeps the database's own sentence, which is already
 *  written for the person at the desk. */
const REFUSAL_WORD: Record<string, string> = {
  not_finance: "Only Finance can do this.",
  not_finance_approver: "Only a finance approver can do this.",
  not_internal: "Only Finance can see this.",
  voucher_cancelled: "This payment voucher is cancelled. Nothing more can change on it.",
  forbidden: "You are not allowed to do this.",
};

export function refusal(e: unknown): string {
  const body = (e as { body?: { code?: string } } | null)?.body;
  const code = body && typeof body === "object" ? body.code : undefined;
  if (code && REFUSAL_WORD[code]) return REFUSAL_WORD[code];
  const msg = (e as Error | null)?.message;
  return msg && msg.trim() !== "" ? msg : "That did not work. Try again.";
}
