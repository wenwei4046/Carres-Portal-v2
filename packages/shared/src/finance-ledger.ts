/**
 * The Finance Ledger read surface — Journal · Trial Balance · Self-check.
 *
 * One home for the shapes the `/api/finance/ledger/*` routes return and for
 * the words those pages print. Every stored value (a source type, an account
 * kind, a party type, a self-check key) is translated HERE before it reaches
 * a screen — COPY-STANDARD "no internal enum on screen". The words are
 * proposed in `docs/COPY-STANDARD.md` under "Finance ledger words".
 *
 * Nothing in this file reads the database or posts anything. The ledger is
 * written only by `gl_post` / `gl_reverse` (0462, 0468).
 */

// ── shapes ───────────────────────────────────────────────────────────────────

/** One journal entry header, as the Journal lists it. */
export interface LedgerEntryRow {
  id: string;
  entry_no: string;
  entry_date: string;
  source_type: string;
  source_doc_no: string;
  narration: string | null;
  /** Always equal to `total_credit` — the table refuses anything else. */
  total_debit: number;
  total_credit: number;
  /** The ORIGINAL of a reversed pair: true once `gl_reverse` cancelled it. */
  reversed: boolean;
  /** Set on a reversal: the entry it cancels. */
  reverses: string | null;
  reverses_entry_no: string | null;
  /** Set on a reversed original: the reversal that cancelled it. */
  reversed_by: string | null;
  reversed_by_entry_no: string | null;
  created_at: string;
}

export interface LedgerEntriesPage {
  rows: LedgerEntryRow[];
  total: number;
}

export interface LedgerEntryLine {
  line_no: number;
  account_code: string;
  account_name: string | null;
  debit: number;
  credit: number;
  party_type: string | null;
  party_id: string | null;
  party_name: string | null;
  memo: string | null;
}

/** Another entry on the same source document — the rest of that document's story. */
export interface LedgerRelatedEntry {
  id: string;
  entry_no: string;
  entry_date: string;
  source_type: string;
  reversed: boolean;
}

export interface LedgerEntryDetail {
  entry: LedgerEntryRow;
  lines: LedgerEntryLine[];
  related: LedgerRelatedEntry[];
}

export interface LedgerAccount {
  code: string;
  name: string;
  kind: string;
  parent_code: string | null;
  is_control: boolean;
  control_for: string | null;
  is_active: boolean;
  /** A header groups other accounts and can never be posted to (0461, 0468). */
  is_header: boolean;
}

export interface LedgerChart {
  go_live_on: string | null;
  accounts: LedgerAccount[];
}

export interface TrialBalanceAccountRow {
  account_code: string;
  account_name: string;
  kind: string;
  is_control: boolean;
  is_active: boolean;
  /** Everything posted to the account up to the as-of day, both sides. */
  total_debit: number;
  total_credit: number;
  /** Debits minus credits for asset and expense, credits minus debits otherwise (0465). */
  natural_balance: number;
}

export interface TrialBalanceReport {
  /** `before_go_live`: the day asked for is earlier than the ledger's first day. */
  status: "ok" | "before_go_live";
  go_live_on: string;
  as_of: string;
  accounts: TrialBalanceAccountRow[];
  total_debit: number | null;
  total_credit: number | null;
  difference: number | null;
  balances: boolean | null;
}

export interface LedgerHealthRow {
  ordinal: number;
  check_key: string;
  check_label: string;
  status: string;
  count_value: number | null;
  amount_value: number | null;
  date_value: string | null;
}

/** A Self-check section that could not be read says so. It is never zeros. */
export type Checked<T> = ({ ok: true } & T) | { ok: false; message: string };

export interface ControlParty {
  party_type: string;
  party_id: string;
  party_name: string | null;
  natural_balance: number;
  line_count: number;
}

export interface ControlFinding {
  /** `no_party`: lines that name nobody. `wrong_party`: lines that name the
   *  other kind of party (a supplier on customer receivables). */
  kind: "no_party" | "wrong_party";
  party_type: string | null;
  party_name: string | null;
  total_debit: number;
  total_credit: number;
  line_count: number;
  /** At most 20, in entry-number order. */
  entry_nos: string[];
}

export interface ControlAccountCheck {
  account_code: string;
  account_name: string;
  kind: string;
  control_for: string | null;
  is_active: boolean;
  total_debit: number;
  total_credit: number;
  natural_balance: number;
  line_count: number;
  party_count: number;
  /** Parties whose balance is not zero, largest first (at most 50). */
  open_parties: ControlParty[];
  open_party_count: number;
  findings: ControlFinding[];
}

export interface ReceivablesCheck {
  account_code: string | null;
  /** False when a part of either side could not be counted — then the
   *  difference is not a finding by itself; the reasons are. */
  comparable: boolean;
  ledger_started: boolean;
  ledger_total: number;
  documents_total: number;
  difference: number;
  unposted_invoice_count: number;
  unposted_invoice_amount: number;
  storage_uncollected: number;
  pre_go_live_open_count: number;
  pre_go_live_open_amount: number;
}

export interface SupplierDifference {
  supplier_id: string;
  supplier_name: string | null;
  ledger_owing: number;
  bills_owing: number;
  difference: number;
}

export interface PayablesCheck {
  /** The supplier accounts on the liability side the comparison sums. */
  account_codes: string[];
  ledger_total: number;
  bills_total: number;
  difference: number;
  /** Suppliers whose ledger and bills disagree (at most 50, largest first). */
  suppliers: SupplierDifference[];
  supplier_difference_count: number;
}

export interface BooksCheck {
  total_debit: number;
  total_credit: number;
  difference: number;
  entry_count: number;
  line_count: number;
  header_mismatch_count: number;
  balanced: boolean;
}

/** A rental month collected since the ledger started that has no active
 *  ledger entry (`gl_rental_payments_unposted`). */
export interface RentalMonthUnposted {
  agreement_no: string;
  seq: number;
  paid_on: string;
  paid_amount: number;
  /** The number its ledger entry would carry — `RA-1003-M07`. */
  doc_no: string;
}

export interface RentalCheck {
  /** At most 50, oldest payment first. */
  months: RentalMonthUnposted[];
  month_count: number;
  amount: number;
}

export interface LedgerSelfCheck {
  checked_at: string;
  go_live_on: string | null;
  books: Checked<BooksCheck>;
  controls: Checked<{ accounts: ControlAccountCheck[] }>;
  receivables: Checked<ReceivablesCheck>;
  payables: Checked<PayablesCheck>;
  rentals: Checked<RentalCheck>;
  health: Checked<{ rows: LedgerHealthRow[] }>;
}

// ── words: sources, kinds, parties, documents ───────────────────────────────

const REVERSAL_SUFFIX = "_REVERSAL";

/** Every source a posting function writes today (0462–0466, and the rental
 *  collection's `RENTAL_PAYMENT`). A new source is ONE row here; until it has
 *  one it prints `Other entry`, never its key. */
export const LEDGER_SOURCE_WORDS: Readonly<Record<string, string>> = {
  SALES_INVOICE: "Sales invoice",
  CUSTOMER_PAYMENT: "Customer payment",
  SUPPLIER_BILL: "Supplier bill",
  SUPPLIER_PAYMENT: "Supplier payment",
  PAYMENT_VOUCHER: "Payment voucher",
  OTHER_DEBTOR_INVOICE: "Other debtor invoice",
  OTHER_RECEIPT: "Other receipt",
  RENTAL_PAYMENT: "Rental payment",
  SUPPLIER_MONEY_BACK: "Supplier money back",
  MONEY_TRANSFER: "Bank transfer",
  CARD_PAYOUT: "Card payout",
  BANK_CHARGE: "Bank charge",
  BANK_CREDIT: "Bank credit",
  MANUAL: "Manual journal",
};

export function isReversalSource(sourceType: string): boolean {
  return sourceType.endsWith(REVERSAL_SUFFIX);
}

/** The source a reversal belongs to — `SUPPLIER_BILL_REVERSAL` → `SUPPLIER_BILL`. */
export function baseSourceType(sourceType: string): string {
  return isReversalSource(sourceType)
    ? sourceType.slice(0, -REVERSAL_SUFFIX.length)
    : sourceType;
}

/** `Supplier bill` · `Supplier bill reversal` · `Other entry`. */
export function ledgerSourceWord(sourceType: string): string {
  const base = LEDGER_SOURCE_WORDS[baseSourceType(sourceType)] ?? "Other entry";
  return isReversalSource(sourceType) ? `${base} reversal` : base;
}

export const LEDGER_KIND_WORDS: Readonly<Record<string, string>> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
};

/** The chart as a tree: every account right after its parent, siblings by
 *  code, each with its depth (0 = top). An account whose parent is not in the
 *  list sits at the top. */
export function chartTree(accounts: readonly LedgerAccount[]): Array<LedgerAccount & { depth: number }> {
  const sorted = [...accounts].sort((x, y) => x.code.localeCompare(y.code));
  const codes = new Set(sorted.map((a) => a.code));
  const parentOf = (a: LedgerAccount) => (a.parent_code && codes.has(a.parent_code) ? a.parent_code : null);
  // ponytail: O(n²) over a chart of a few dozen accounts; index by parent if it ever grows past a thousand.
  const walk = (parent: string | null, depth: number): Array<LedgerAccount & { depth: number }> =>
    sorted.filter((a) => parentOf(a) === parent).flatMap((a) => [{ ...a, depth }, ...walk(a.code, depth + 1)]);
  return walk(null, 0);
}

export function ledgerKindWord(kind: string | null | undefined): string {
  return (kind && LEDGER_KIND_WORDS[kind]) || "Other account";
}

const PARTY_WORDS: Readonly<Record<string, { one: string; many: string }>> = {
  CUSTOMER: { one: "Customer", many: "customers" },
  SUPPLIER: { one: "Supplier", many: "suppliers" },
};

export function ledgerPartyWord(partyType: string | null | undefined): string {
  return (partyType && PARTY_WORDS[partyType]?.one) || "Other party";
}

export function ledgerPartyPlural(partyType: string | null | undefined): string {
  return (partyType && PARTY_WORDS[partyType]?.many) || "other parties";
}

/** An entry's side of a reversed pair, as the Journal's `Reversal` column
 *  filters it. The database word for an ordinary entry never reaches the
 *  screen: an entry nobody reversed is `Not reversed`. */
export function ledgerReversalKind(row: Pick<LedgerEntryRow, "reversed" | "reverses">): "Not reversed" | "Reversed" | "Reversal" {
  if (row.reversed) return "Reversed";
  if (row.reverses) return "Reversal";
  return "Not reversed";
}

/** The entry on the other side of a reversed pair, so each half can open the
 *  other. Null for an entry nobody reversed. */
export function ledgerReversalPartner(
  row: Pick<LedgerEntryRow, "reversed" | "reverses" | "reverses_entry_no" | "reversed_by_entry_no">,
): { word: "Reversed by" | "Reverses"; entryNo: string | null } | null {
  if (row.reversed) return { word: "Reversed by", entryNo: row.reversed_by_entry_no };
  if (row.reverses) return { word: "Reverses", entryNo: row.reverses_entry_no };
  return null;
}

/** `Reversed by JE-202609-0005` · `Reverses JE-202609-0004` · `Not reversed`. */
export function ledgerReversalText(
  row: Pick<LedgerEntryRow, "reversed" | "reverses" | "reverses_entry_no" | "reversed_by_entry_no">,
): string {
  const partner = ledgerReversalPartner(row);
  if (!partner) return "Not reversed";
  return `${partner.word} ${partner.entryNo ?? "an entry that could not be read"}`;
}

/** The Journal deep link. Every page that prints an entry number links here. */
export function ledgerEntryHref(entryNo: string): string {
  return `/finance/ledger?entry=${encodeURIComponent(entryNo)}`;
}

/** The Journal narrowed to one account over a period — the Trial Balance's
 *  way into how an account's balance was built. */
export function ledgerAccountHref(accountCode: string, from: string | null, to: string | null): string {
  const q = new URLSearchParams({ account: accountCode });
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  return `/finance/ledger?${q.toString()}`;
}

/** A document number that is really a row id — a payment recorded without a
 *  receipt number posts under its uuid (0463). Printed as words, never the id. */
export function isRowIdDocNo(docNo: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(docNo);
}

export function ledgerDocWord(docNo: string): string {
  return isRowIdDocNo(docNo) ? "No document number" : docNo;
}

/** Cents, so `0.1 + 0.2` never reads as a finding. */
export function isZeroMoney(n: number): boolean {
  return Math.round(n * 100) === 0;
}

// ── words: the Self-check ───────────────────────────────────────────────────

type Money = (n: number) => string;
type DateWord = (iso: string) => string;

/** One sentence per finding, and the plain line a clean section prints. */
export interface SectionVerdict {
  findings: string[];
  /** Facts that explain the numbers but are not problems. */
  notes: string[];
  clean: string;
}

export function booksVerdict(b: BooksCheck, money: Money): SectionVerdict {
  const findings: string[] = [];
  if (!isZeroMoney(b.difference)) findings.push(`Debits and credits differ by ${money(Math.abs(b.difference))}.`);
  if (b.header_mismatch_count > 0) {
    findings.push(`${b.header_mismatch_count} ${b.header_mismatch_count === 1 ? "entry has a total" : "entries have totals"} its own lines do not add up to.`);
  }
  return { findings, notes: [], clean: `Debits equal credits: ${money(b.total_debit)} on each side.` };
}

export function receivablesVerdict(r: ReceivablesCheck, money: Money): SectionVerdict {
  const findings: string[] = [];
  const notes: string[] = [];
  if (!r.ledger_started) findings.push("The ledger has no start date, so nothing can be compared.");
  if (r.account_code === null) findings.push("The chart cannot name one customer account for money owed.");
  if (r.unposted_invoice_count > 0) {
    findings.push(`${r.unposted_invoice_count} ${r.unposted_invoice_count === 1 ? "invoice" : "invoices"} issued since the ledger started ${r.unposted_invoice_count === 1 ? "has" : "have"} no ledger entry: ${money(r.unposted_invoice_amount)}.`);
  }
  if (!isZeroMoney(r.storage_uncollected)) {
    findings.push(`${money(r.storage_uncollected)} of storage money was collected without reducing what customers owe in the ledger.`);
  }
  if (r.comparable && !isZeroMoney(r.difference)) {
    findings.push(`The ledger says ${owedWords("customers", r.ledger_total, money)}. Invoices less payments say ${owedWords("customers", r.documents_total, money)}. Difference ${money(Math.abs(r.difference))}.`);
  }
  if (r.pre_go_live_open_count > 0) {
    notes.push(`${r.pre_go_live_open_count} ${r.pre_go_live_open_count === 1 ? "invoice" : "invoices"} worth ${money(r.pre_go_live_open_amount)} ${r.pre_go_live_open_count === 1 ? "was" : "were"} issued before the ledger started. The ledger does not hold ${r.pre_go_live_open_count === 1 ? "it" : "them"}.`);
  }
  return { findings, notes, clean: `The ledger and invoices less payments agree: ${owedWords("customers", r.ledger_total, money)}.` };
}

export function payablesVerdict(p: PayablesCheck, money: Money): SectionVerdict {
  const findings: string[] = [];
  if (p.account_codes.length === 0) findings.push("The chart has no supplier account for money owed.");
  if (!isZeroMoney(p.difference)) {
    findings.push(`The ledger says ${owedWords("suppliers", p.ledger_total, money)}. Bills less payments say ${owedWords("suppliers", p.bills_total, money)}. Difference ${money(Math.abs(p.difference))}.`);
  }
  if (p.supplier_difference_count > 0) {
    findings.push(`${p.supplier_difference_count} ${p.supplier_difference_count === 1 ? "supplier does" : "suppliers do"} not agree.`);
  }
  return { findings, notes: [], clean: `The ledger and bills less payments agree: ${owedWords("suppliers", p.ledger_total, money)}.` };
}

/** Who owes whom on a control account. An asset control is money owed TO
 *  Carres; a liability control is money Carres owes. A balance on the
 *  unexpected side turns the sentence round rather than printing a minus. */
export function controlBalanceSentence(kind: string, controlFor: string | null, naturalBalance: number, money: Money): string {
  if (isZeroMoney(naturalBalance)) return "Nothing is owed either way.";
  const who = ledgerPartyPlural(controlFor);
  const Who = who.charAt(0).toUpperCase() + who.slice(1);
  const owedToCarres = kind === "LIABILITY" ? naturalBalance < 0 : naturalBalance > 0;
  const amount = money(Math.abs(naturalBalance));
  return owedToCarres ? `${Who} owe Carres ${amount}.` : `Carres owes ${who} ${amount}.`;
}

/** One owed figure in words. Below zero turns it round, never a minus:
 *  customers paid before their invoice, or Carres paid a supplier ahead. */
function owedWords(party: "customers" | "suppliers", n: number, money: Money): string {
  const round = n < 0 && !isZeroMoney(n);
  const amount = money(Math.abs(n));
  if (party === "customers") return round ? `Carres owes customers ${amount}` : `customers owe ${amount}`;
  return round ? `suppliers owe Carres ${amount}` : `Carres owes suppliers ${amount}`;
}

/** `RM 5.00` when the lines sit on one side; both sides named when they do not. */
function linesAmount(debit: number, credit: number, money: Money): string {
  if (isZeroMoney(credit)) return money(debit);
  if (isZeroMoney(debit)) return money(credit);
  return `${money(debit)} debit and ${money(credit)} credit`;
}

export function controlVerdict(a: ControlAccountCheck, money: Money): SectionVerdict {
  const findings = a.findings.map((f) => {
    const lines = `${f.line_count} ${f.line_count === 1 ? "line" : "lines"} for ${linesAmount(f.total_debit, f.total_credit, money)}`;
    const verb = f.line_count === 1 ? "names" : "name";
    if (f.kind === "no_party") return `${lines} ${verb} nobody.`;
    const party = ledgerPartyWord(f.party_type).toLowerCase();
    const article = /^[aeiou]/.test(party) ? "an" : "a";
    const named = f.party_name ? `${article} ${party}, ${f.party_name},` : `${article} ${party}`;
    return `${lines} ${verb} ${named} on an account for ${ledgerPartyPlural(a.control_for)}.`;
  });
  const clean = a.line_count === 0
    ? "This account has no entries yet."
    : `Every line names who it belongs to. ${controlBalanceSentence(a.kind, a.control_for, a.natural_balance, money)}`;
  return { findings, notes: [], clean };
}

export function rentalsVerdict(r: RentalCheck, money: Money): SectionVerdict {
  const findings = r.month_count > 0
    ? [`${r.month_count} rental ${r.month_count === 1 ? "month was" : "months were"} collected with no ledger entry: ${money(r.amount)}.`]
    : [];
  return { findings, notes: [], clean: "Every rental month collected since the ledger started has its entry." };
}

/**
 * The eleven `gl_ledger_health` checks (0465, 0469), in plain words. The SQL
 * `detail` text names tables and columns, so it never reaches the screen;
 * each sentence is composed here from the row's own numbers. A key this map
 * does not know prints `Other ledger check`, never its key or its label.
 */
export function healthCheckWords(
  row: LedgerHealthRow,
  money: Money,
  date: DateWord,
): { title: string; sentence: string; verdict: "clean" | "finding" | "info" } {
  const n = row.count_value ?? 0;
  const failed = row.status === "FAIL";
  const verdict = failed ? "finding" : row.status === "INFO" ? "info" : "clean";
  switch (row.check_key) {
    case "overall":
      return { title: "All checks", verdict,
        sentence: failed ? `${n} of 7 checks found a problem.` : "All 7 checks are clean." };
    case "debits_equal_credits":
      return { title: "Debits equal credits", verdict,
        sentence: failed ? `Debits and credits differ by ${money(Math.abs(row.amount_value ?? 0))}.` : "Every debit has an equal credit." };
    case "entry_header_matches_lines":
      return { title: "Every entry adds up", verdict,
        sentence: failed ? `${n} ${n === 1 ? "entry has a total" : "entries have totals"} its own lines do not add up to.` : "Every entry's total equals its lines." };
    case "lines_on_unknown_account":
      return { title: "Every line names a real account", verdict,
        sentence: failed ? `${n} ${n === 1 ? "line names" : "lines name"} an account that is not in the chart.` : "No line names a missing account." };
    case "control_line_missing_party":
      return { title: "Customer and supplier lines name who", verdict,
        sentence: failed ? `${n} ${n === 1 ? "line" : "lines"} on a customer or supplier account ${n === 1 ? "names" : "name"} nobody.` : "Every customer and supplier line names who it belongs to." };
    case "entry_before_go_live":
      return { title: "Nothing before the ledger started", verdict,
        sentence: failed ? `${n} ${n === 1 ? "entry is" : "entries are"} dated before the ledger started.` : "No entry is dated before the ledger started." };
    case "entry_without_lines":
      return { title: "No empty entry", verdict,
        sentence: failed ? `${n} ${n === 1 ? "entry has" : "entries have"} no lines.` : "Every entry has lines." };
    case "go_live_on":
      return { title: "Ledger start", verdict,
        sentence: row.date_value ? `The ledger started on ${date(row.date_value)}. It holds no opening balances.` : "The ledger has no start date." };
    case "posted_entry_count":
      return { title: "Entries", verdict,
        sentence: `${n} ${n === 1 ? "entry" : "entries"} in the ledger. A reversed entry and its reversal both count.` };
    case "earliest_entry_date":
      return { title: "First entry", verdict,
        sentence: row.date_value ? `The first entry is dated ${date(row.date_value)}.` : "The ledger has no entries yet." };
    case "latest_entry_date":
      return { title: "Last entry", verdict,
        sentence: row.date_value ? `The last entry is dated ${date(row.date_value)}.` : "The ledger has no entries yet." };
    default:
      // The function's own label is database English; an undeclared check
      // prints a plain title, never its key or its label.
      return { title: "Other ledger check", verdict, sentence: failed ? "This check found a problem." : "This check is clean." };
  }
}
