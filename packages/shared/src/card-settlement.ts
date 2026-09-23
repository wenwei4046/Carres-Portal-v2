/**
 * Card settlement files (migration 0572): read a card company's CSV into sale
 * rows. Every row keeps its whole line and every column; nothing is dropped.
 *
 *   · Public Bank  one row per sale, net (Sett_amt) per row, MID and TID per row.
 *   · GHL          one row per sale, net per row, terminal per row, no approval code.
 *   · Maybank T41  sale rows with no net; the net is printed once per merchant
 *                  in the summary block, so it is read from the TOTAL line there.
 *   · Hong Leong   a secured PDF. Not read here.
 *
 * No sample carried a refund, void or chargeback, so their sign is not known:
 * such a row is refused, never guessed. The database refuses it again.
 *
 * PURE — no clock, no I/O.
 */

export const CARD_ACQUIRERS = ["PBB", "GHL", "MAYBANK"] as const;
export type CardAcquirer = (typeof CARD_ACQUIRERS)[number];
export const CARD_ACQUIRER_WORD: Record<CardAcquirer, string> = { PBB: "Public Bank", GHL: "GHL", MAYBANK: "Maybank" };

/** One sale row, as `card_settlement_import` takes it. */
export interface CardFileRow {
  line_no: number;
  raw_line: string;
  fields: Record<string, string>;
  txn_date: string;
  payout_date: string;
  merchant_id: string | null;
  terminal_id: string | null;
  approval_code: string | null;
  card_no: string | null;
  amount: number;
  net_amount: number | null;
}

/** Maybank's payout, printed once for the whole merchant. */
export interface CardFilePublished {
  merchant_id: string;
  report_date: string;
  gross: number;
  fee: number;
  net: number;
}

export type CardFileParse =
  | { ok: true; rows: CardFileRow[]; published: CardFilePublished | null }
  | { ok: false; message: string };

const notTheFile = (a: CardAcquirer) =>
  `This is not a ${CARD_ACQUIRER_WORD[a]} settlement file. Check the card company and the file.`;
const reversal = (n: number) =>
  `Row ${n} is a refund, void or chargeback. Carres does not import these until their sign is confirmed on a real one.`;
const unreadable = (n: number) => `Row ${n} could not be read. Import the file as it came from the card company.`;
const NO_SALES = "The file has no sales.";
const HAS_CREDITS = "This file has refunds or adjustments. Carres does not import these until their sign is confirmed on a real one.";
const TOTALS_OFF = "The file's totals do not add up. Import the file as it came from the card company.";

/** One CSV line into cells; a quoted cell may hold commas and doubled quotes. */
export function csvCells(line: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cell);
      cell = "";
    } else cell += ch;
  }
  out.push(cell);
  return out;
}

/** "2,498.00" or "2865.0000" into ringgit; null when it is not a whole sen. */
function money(s: string | undefined): number | null {
  const t = (s ?? "").replace(/[,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const sen = Number(t) * 100;
  return Math.abs(sen - Math.round(sen)) < 1e-6 ? Math.round(sen) / 100 : null;
}

function isoDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** DDMMYYYY (Public Bank), YYYY-MM-DD… (GHL), DD/MM/YY (Maybank). */
function date(s: string | undefined, shape: "ddmmyyyy" | "iso" | "dd/mm/yy"): string | null {
  const t = (s ?? "").trim();
  const m =
    shape === "ddmmyyyy" ? /^(\d{2})(\d{2})(\d{4})$/.exec(t)
    : shape === "iso" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
    : /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(t);
  if (!m) return null;
  if (shape === "iso") return isoDate(+m[1], +m[2], +m[3]);
  return isoDate(shape === "dd/mm/yy" ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
}

const sen = (n: number) => Math.round(n * 100);
const blankToNull = (s: string | undefined) => (s && s.trim() ? s.trim() : null);

function lines(text: string): string[] {
  return text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
}

/** A header-row file (Public Bank, GHL): the first line names every column. */
function tabular(
  acquirer: "PBB" | "GHL",
  text: string,
  need: string[],
  read: (f: Record<string, string>, n: number) => Omit<CardFileRow, "line_no" | "raw_line" | "fields"> | string,
): CardFileParse {
  const all = lines(text);
  const header = csvCells(all[0] ?? "").map((h) => h.trim());
  if (!need.every((h) => header.includes(h))) return { ok: false, message: notTheFile(acquirer) };
  const rows: CardFileRow[] = [];
  for (let i = 1; i < all.length; i++) {
    const raw = all[i];
    if (!raw.trim()) continue;
    const n = i + 1;
    const cells = csvCells(raw);
    if (cells.length !== header.length) return { ok: false, message: unreadable(n) };
    const fields = Object.fromEntries(header.map((h, j) => [h, cells[j]]));
    const row = read(fields, n);
    if (typeof row === "string") return { ok: false, message: row };
    rows.push({ ...row, line_no: n, raw_line: raw, fields });
  }
  return rows.length ? { ok: true, rows, published: null } : { ok: false, message: NO_SALES };
}

function publicBank(text: string): CardFileParse {
  const need = ["Sett_date", "Trans_date", "Card_no", "Trans_curr", "Trans_amt", "Sett_curr", "Sett_amt", "MID", "Approval_code", "Status", "TID"];
  return tabular("PBB", text, need, (f, n) => {
    const amount = money(f.Trans_amt);
    const net = money(f.Sett_amt);
    if (f.Status.trim() !== "PURCHASES" || (amount !== null && amount <= 0) || (net !== null && net < 0)) return reversal(n);
    const txn = date(f.Trans_date, "ddmmyyyy");
    const payout = date(f.Sett_date, "ddmmyyyy");
    const mid = blankToNull(f.MID);
    const tid = blankToNull(f.TID);
    if (amount === null || net === null || !txn || !payout || !mid || !tid) return unreadable(n);
    if (f.Trans_curr.trim() !== "MYR" || f.Sett_curr.trim() !== "MYR") return unreadable(n);
    return {
      txn_date: txn, payout_date: payout, merchant_id: mid, terminal_id: tid,
      approval_code: blankToNull(f.Approval_code), card_no: blankToNull(f.Card_no), amount, net_amount: net,
    };
  });
}

function ghl(text: string): CardFileParse {
  const need = ["tx_create_date", "tx_code_true", "terminal_id", "currency_code", "tx_amount", "merchant_mdr_amount", "net_amount"];
  return tabular("GHL", text, need, (f, n) => {
    const amount = money(f.tx_amount);
    const net = money(f.net_amount);
    if (f.tx_code_true.trim() !== "PAYMENT" || (amount !== null && amount <= 0) || (net !== null && net < 0)) return reversal(n);
    const txn = date(f.tx_create_date, "iso");
    const tid = blankToNull(f.terminal_id);
    if (amount === null || net === null || !txn || !tid || f.currency_code.trim() !== "MYR") return unreadable(n);
    return {
      txn_date: txn, payout_date: txn, merchant_id: null, terminal_id: tid,
      approval_code: null, card_no: null, amount, net_amount: net,
    };
  });
}

/**
 * Maybank T41: a report, not a table. Sale rows sit under the "Card Number"
 * header until "Total Amount"; the payout is the TOTAL line under the "Gross
 * Amt … Net Amount" header. "Total Credit Amount", the items withheld or
 * rejected, and the Amt (Dr) / Amt (Cr) block would carry refunds and
 * adjustments, and must be zero.
 */
function maybank(text: string): CardFileParse {
  const all = lines(text);
  let reportDate: string | null = null;
  let merchant: string | null = null;
  let header: string[] | null = null;
  let inSales = false;
  let block: string[] | null = null;
  let credits = 0;
  let held = false;
  let published: { gross: number | null; fee: number | null; net: number | null } | null = null;
  const rows: CardFileRow[] = [];

  for (let i = 0; i < all.length; i++) {
    const raw = all[i];
    const rawCells = csvCells(raw);
    const cells = rawCells.map((c) => c.trim());
    const n = i + 1;
    if (cells[0].startsWith("Report Date")) reportDate = date(cells[1], "dd/mm/yy");
    else if (cells[0] === "Merchant No.") merchant = blankToNull(cells[2]);
    else if (cells[0] === "Card Number") {
      header = cells;
      inSales = true;
    } else if (inSales && (cells[0] === "Total Amount" || !raw.trim())) inSales = false;
    else if (inSales && header) {
      const fields: Record<string, string> = {};
      header.forEach((h, j) => {
        if (h) fields[h] = rawCells[j] ?? "";
      });
      const amount = money(fields["Amount"]);
      if (amount !== null && amount <= 0) return { ok: false, message: reversal(n) };
      const txn = date(fields["Tran Date"], "dd/mm/yy");
      const tid = blankToNull(fields["Terminal No."]);
      if (amount === null || !txn || !tid) return { ok: false, message: unreadable(n) };
      rows.push({
        line_no: n, raw_line: raw, fields, txn_date: txn, payout_date: txn, merchant_id: merchant, terminal_id: tid,
        approval_code: blankToNull(fields["Auth Code"]), card_no: blankToNull(fields["Card Number"]), amount, net_amount: null,
      });
    } else if (cells[0] === "Total Credit Amount") credits += Math.abs(money(cells[2]) ?? 0);
    else if (cells[0] === "Items Withheld" || cells[0] === "Items Rejected") held = true;
    else if (held && cells[0] === "Total Amount") {
      credits += Math.abs(money(cells[2]) ?? 0) + Math.abs(money(cells[6]) ?? 0);
      held = false;
    }
    else if (cells.includes("Amt (Dr)") || cells.includes("Gross Amt")) block = cells;
    else if (cells[0] === "TOTAL" && block) {
      const at = (word: string) => money(cells[block!.indexOf(word)]);
      if (block.includes("Gross Amt")) published = { gross: at("Gross Amt"), fee: at("Disc. Amt"), net: at("Net Amount") };
      else credits += Math.abs(at("Amt (Dr)") ?? 0) + Math.abs(at("Amt (Cr)") ?? 0);
      block = null;
    }
  }

  if (!reportDate || !merchant || !header || !published) return { ok: false, message: notTheFile("MAYBANK") };
  if (credits !== 0) return { ok: false, message: HAS_CREDITS };
  if (!rows.length) return { ok: false, message: NO_SALES };
  const { gross, fee, net } = published;
  if (
    gross === null || fee === null || net === null ||
    rows.reduce((s, r) => s + sen(r.amount), 0) !== sen(gross) ||
    sen(gross) - sen(fee) !== sen(net)
  ) return { ok: false, message: TOTALS_OFF };
  for (const r of rows) {
    r.payout_date = reportDate;
    r.merchant_id = merchant;
  }
  return { ok: true, rows, published: { merchant_id: merchant, report_date: reportDate, gross, fee, net } };
}

/** Read one card company's file. A refused file says why in one sentence. */
export function parseCardFile(acquirer: CardAcquirer, text: string): CardFileParse {
  if (acquirer === "PBB") return publicBank(text);
  if (acquirer === "GHL") return ghl(text);
  return maybank(text);
}

// ── the review (card_settlement_review) ─────────────────────────────────────

export type CardMatchHow = "approval_code" | "amount_and_date" | "suggestion" | "by_hand";
export type CardSuggestionHow = "approval_code" | "code_other_amount" | "code_near" | "amount_and_date" | "amount_near_date";
export type CardPayoutStatus = "prepared" | "approved";

export interface CardSettlementDay {
  acquirer: CardAcquirer;
  payout_date: string;
  group_key: string;
  row_count: number;
  matched_count: number;
  gross: number;
  net: number;
  recorded: number | null;
  reference: string;
  payout_status: CardPayoutStatus | null;
  payout_move_no: string | null;
}

export interface CardSettlementRow {
  id: string;
  file_name: string;
  acquirer: CardAcquirer;
  line_no: number;
  txn_date: string;
  payout_date: string;
  group_key: string;
  merchant_id: string | null;
  terminal_id: string | null;
  approval_code: string | null;
  card_no: string | null;
  amount: number;
  net_amount: number | null;
  payment_id: string | null;
  matched_how: CardMatchHow | null;
  matched_at: string | null;
  suggestions: { payment_id: string; how: CardSuggestionHow; days_apart: number }[];
}

export interface CardSettlementPayment {
  id: string;
  amount: number;
  paid_on: string;
  reference: string | null;
  receipt_no: string | null;
  so: number | null;
  voided: boolean;
}

export interface CardSettlementReview {
  days: CardSettlementDay[];
  rows: CardSettlementRow[];
  payments: CardSettlementPayment[];
}

/** The rows of one day. */
export const dayKey = (r: Pick<CardSettlementDay, "acquirer" | "payout_date" | "group_key">) =>
  `${r.acquirer}|${r.payout_date}|${r.group_key}`;

/** A day may fill the card payout form once every row is matched and no payout is prepared yet. */
export function dayMayApprove(d: CardSettlementDay): boolean {
  return d.matched_count === d.row_count && d.payout_status === null;
}

/** What the card company kept: gross less what reached the bank, in sen. */
export function dayFee(d: Pick<CardSettlementDay, "gross" | "net">): number {
  return (sen(Number(d.gross)) - sen(Number(d.net))) / 100;
}
