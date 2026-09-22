import { Hono, type Context } from "hono";
import type { ZodError } from "zod";
import {
  departmentRpcArgs,
  ledgerAccountCodeShape,
  ledgerAccountLedgerQuery,
  ledgerAccountReorderInput,
  ledgerAccountUpdateInput,
  ledgerAsOfQuery,
  ledgerEntriesQuery,
  ledgerEntryRef,
  ledgerPeriodQuery,
} from "@carres/shared";
import {
  baseSourceType,
  isZeroMoney,
  type BooksCheck,
  type Checked,
  type ControlAccountCheck,
  type ControlParty,
  type LedgerAccount,
  type LedgerChart,
  type LedgerEntryDetail,
  type LedgerEntryLine,
  type LedgerEntryRow,
  type LedgerHealthRow,
  type LedgerRelatedEntry,
  type LedgerSelfCheck,
  type PayablesCheck,
  type ReceivablesCheck,
  type RentalCheck,
  type RentalMonthUnposted,
  type SupplierDifference,
  type TrialBalanceReport,
} from "@carres/shared/finance-ledger";
import { CUSTOMERS, SUPPLIERS } from "@carres/shared/tables";
import { requireFinance } from "../../lib/auth-guards";
import { IN_URL_MAX, mapPgError, parseJsonBody, readAllPages, tooManyRows } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";
import { todayIsoMYT } from "../../lib/delivery-order-issue";
import financeMoneyAccountsRouter from "./money-accounts";

/**
 * FINANCE LEDGER — the read-only Journal, Trial Balance and Self-check.
 *
 * Mounted at `/api/finance/ledger`. Every route is `requireFinance` (finance
 * and principal — the HTTP mirror of `gl_may_read()`) and reads through
 * `userClient`, so the ledger's own gates see the signed-in user: RLS on the
 * four `gl_*` tables and `gl_report_guard()` inside every report function.
 * Nothing here writes but the one account door. The ledger is written only by `gl_post` / `gl_reverse`.
 *
 *   GET /entries            the Journal, one page, newest first
 *   GET /entries/:ref       one entry (id or entry number) with its lines
 *   GET /accounts           the chart, and the day the ledger started
 *   PATCH /accounts/:code   one account's name and number (gl_account_update, 0550) — a new
 *                           number is carried to every row that names it, by `on update cascade`.
 *                           An account named on a document that has left Draft cannot be
 *                           renumbered: 0550's own ceiling, refused by the frozen-document
 *                           triggers as a 422/500, not by anything here.
 *   POST  /accounts/reorder move accounts within one heading (gl_accounts_reorder, 0557) —
 *                           writes sort_order only; a move never writes the number.
 *   GET /trial-balance      every account as it stood at the end of a day
 *   GET /account-ledger     one account, line by line
 *   GET /health             gl_ledger_health, always eleven rows
 *   GET /self-check         books · control accounts · receivables · payables · rental months · health
 *   GET /profit-and-loss    gl_profit_and_loss, passed through
 *   GET /balance-sheet      gl_balance_sheet, passed through
 *
 *   /money-accounts         the one list of cash, bank and holding accounts
 *                           (0512) — the only writer mounted here; see money-accounts.ts
 *
 * A read that fails is an error, never an empty answer: an empty Journal and
 * a Journal that could not be read must not look the same.
 */
const financeLedgerRouter = new Hono<AppEnv>();
financeLedgerRouter.route("/money-accounts", financeMoneyAccountsRouter);

type Sb = ReturnType<typeof userClient>;
type PgError = { code?: string; message?: string; details?: string };
type Json = Record<string, unknown>;

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
const cents = (n: number) => Math.round(n * 100) / 100;
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function queryOf(c: Context<AppEnv>) {
  return Object.fromEntries(new URL(c.req.url).searchParams);
}

function invalid(c: Context<AppEnv>, error: ZodError) {
  return c.json(
    { error: "invalid_query", code: "invalid_param", message: error.issues[0]?.message ?? "invalid query" },
    422,
  );
}

/**
 * The ledger's own refusals first, then the shared map. 55000 is
 * `gl_report_guard()` saying the ledger has no start date; 22004 / 22007 are
 * the report functions refusing a missing or backwards date. A 500 carries a
 * plain sentence, not the database's text.
 */
function ledgerError(c: Context<AppEnv>, error: PgError, what: string) {
  if (error.code === "55000") {
    return c.json({ error: "ledger_not_started", code: "ledger_not_started", message: "The ledger has no start date yet." }, 409);
  }
  if (error.code === "22004" || error.code === "22007" || error.code === "22008") {
    return c.json({ error: "invalid_param", code: "invalid_param", message: `${what} needs a valid date.` }, 422);
  }
  const mapped = mapPgError(error);
  if (mapped.status === 500) {
    return c.json({ ...mapped.body, message: `${what} could not be loaded. Try again.` }, 500);
  }
  return c.json(mapped.body, mapped.status);
}

function failed(c: Context<AppEnv>, what: string) {
  return c.json({ error: "rpc_failed", code: "rpc_failed", message: `${what} could not be loaded. Try again.` }, 500);
}

// ── the Journal ──────────────────────────────────────────────────────────────

/** An entry's own columns — nothing embedded. `reverses` and `reversed_by`
 *  point back into `gl_entries` itself, and PostgREST will not embed a table
 *  in itself through a foreign-key hint ("To disambiguate recursive
 *  relationships, PostgREST requires Computed Relationships" — its docs). The
 *  hinted embed failed every read: production answered 500 to the Journal and
 *  to an entry number that does not exist. The linked numbers are read
 *  separately, by `linkedEntryNumbers`. */
const ENTRY_COLUMNS =
  "id,entry_no,entry_date,source_type,source_doc_no,narration,total_debit,total_credit," +
  "reversed,reverses,reversed_by,created_at";

/** Ids per linked-number read — keeps the `in (…)` list well inside a URL. */
const LINK_SLICE = 100;

/** The one sentence the Journal refuses a department filter with. */
const TOO_MANY_DEPARTMENT_ENTRIES = "There are too many entries in this department to list here.";

/**
 * The entry number of every entry these rows point at, through `reverses` or
 * `reversed_by`. Fail closed like `readAllPages`: a slice that cannot be read
 * is an error for the whole answer, never a reversal shown without its link.
 */
async function linkedEntryNumbers(sb: Sb, rows: Json[]): Promise<{ numbers: Map<string, string> } | { error: PgError }> {
  const ids = [...new Set(rows
    .flatMap((r) => [r.reverses, r.reversed_by])
    .filter((v): v is string => typeof v === "string"))];
  const numbers = new Map<string, string>();
  for (let i = 0; i < ids.length; i += LINK_SLICE) {
    const { data, error } = await sb.from("gl_entries").select("id,entry_no").in("id", ids.slice(i, i + LINK_SLICE));
    if (error) return { error };
    for (const r of (data ?? []) as Json[]) {
      if (typeof r.id === "string" && typeof r.entry_no === "string") numbers.set(r.id, r.entry_no);
    }
  }
  return { numbers };
}

function toEntryRow(r: Json, numbers: Map<string, string>): LedgerEntryRow {
  const reverses = (r.reverses as string | null) ?? null;
  const reversedBy = (r.reversed_by as string | null) ?? null;
  return {
    id: String(r.id),
    entry_no: String(r.entry_no),
    entry_date: String(r.entry_date),
    source_type: String(r.source_type),
    source_doc_no: String(r.source_doc_no),
    narration: (r.narration as string | null) ?? null,
    total_debit: num(r.total_debit),
    total_credit: num(r.total_credit),
    reversed: r.reversed === true,
    reverses,
    reverses_entry_no: reverses ? (numbers.get(reverses) ?? null) : null,
    reversed_by: reversedBy,
    reversed_by_entry_no: reversedBy ? (numbers.get(reversedBy) ?? null) : null,
    created_at: String(r.created_at),
  };
}

financeLedgerRouter.get("/entries", requireFinance, async (c) => {
  const parsed = ledgerEntriesQuery.safeParse(queryOf(c));
  if (!parsed.success) return invalid(c, parsed.error);
  const { from, to, account, source, q, offset, limit, departmentType, departmentId } = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);

  // An account narrows to the entries with at least one line on it. `!inner`
  // makes the embedded filter a filter on the entries, and the count follows.
  const embeds = [account ? "gl_entry_lines!inner(account_code)" : null].filter(Boolean);

  // 0540: a sales invoice, a customer payment and a rental collection take
  // their department at read time from the order, so it lives in
  // gl_line_departments and not on the line. Read that view ONCE for the
  // entries it matches. Not as an embedded computed relationship: PostgREST
  // rebuilds the whole view per parent row and the read never returns.
  //
  // TWO ceilings, and the first version of this (PR #1495) had neither. Its
  // comment claimed the Journal's page cap held the list; that cap bounds the
  // ENTRIES page, not this read.
  //   1 · the read itself — unbounded, so past 1000 view rows the entries of
  //       the lines that never came back silently vanished from the Journal.
  //       Paged now, and refused rather than cut short.
  //   2 · the id list — every id is spelt into the `.in()` URL below, so the
  //       list cannot be chunked (the count and the page come from ONE query)
  //       and is capped instead.
  let deptEntries: string[] | null = null;
  if (departmentType) {
    // `line_id` is the view's unique column: paging on a non-unique order can
    // miss or repeat a row across two pages.
    const read = await readAllPages<{ entry_id: string }>((a, b) => {
      let d = sb.from("gl_line_departments").select("entry_id").eq("department_type", departmentType);
      if (departmentId) d = d.eq("department_id", departmentId);
      return d.order("line_id", { ascending: true }).range(a, b);
    });
    if ("error" in read) return ledgerError(c, read.error, "The journal");
    if (!("rows" in read)) return tooManyRows(c, TOO_MANY_DEPARTMENT_ENTRIES);
    deptEntries = [...new Set(read.rows.map((r) => String(r.entry_id)))];
    if (deptEntries.length > IN_URL_MAX) return tooManyRows(c, TOO_MANY_DEPARTMENT_ENTRIES);
  }
  let req = sb
    .from("gl_entries")
    .select([ENTRY_COLUMNS, ...embeds].join(","), { count: "exact" })
    .eq("posted", true);
  if (account) req = req.eq("gl_entry_lines.account_code", account);
  if (deptEntries) req = req.in("id", deptEntries);
  if (from) req = req.gte("entry_date", from);
  if (to) req = req.lte("entry_date", to);
  if (source) req = req.eq("source_type", source);
  if (q) req = req.or(`entry_no.ilike.*${q}*,source_doc_no.ilike.*${q}*`);

  const { data, error, count } = await req
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return ledgerError(c, error, "The journal");
  if (!Array.isArray(data) || count == null) return failed(c, "The journal");
  const rows = data as unknown as Json[];
  const linked = await linkedEntryNumbers(sb, rows);
  if ("error" in linked) return ledgerError(c, linked.error, "The journal");
  return c.json({ rows: rows.map((r) => toEntryRow(r, linked.numbers)), total: count });
});

financeLedgerRouter.get("/entries/:ref", requireFinance, async (c) => {
  const parsed = ledgerEntryRef.safeParse(c.req.param("ref"));
  if (!parsed.success) return invalid(c, parsed.error);
  const ref = parsed.data;
  const byId = UUID_RE.test(ref);
  const sb = userClient(c.env, c.var.auth.jwt);

  const head = await sb
    .from("gl_entries")
    .select(ENTRY_COLUMNS)
    .eq(byId ? "id" : "entry_no", byId ? ref : ref.toUpperCase())
    .eq("posted", true)
    .maybeSingle();
  if (head.error) return ledgerError(c, head.error, "This entry");
  if (!head.data) {
    return c.json({ error: "not_found", code: "not_found", message: "No entry has that number." }, 404);
  }
  const headRow = head.data as unknown as Json;
  const linked = await linkedEntryNumbers(sb, [headRow]);
  if ("error" in linked) return ledgerError(c, linked.error, "This entry");
  const entry = toEntryRow(headRow, linked.numbers);
  const base = baseSourceType(entry.source_type);

  const [lines, related] = await Promise.all([
    sb.from("gl_entry_lines")
      .select("line_no,account_code,debit,credit,party_type,party_id,memo,gl_accounts(name)")
      .eq("entry_id", entry.id)
      .order("line_no", { ascending: true }),
    // The same document under the same source family: the original, its
    // reversal, and a re-posting after a reversal all share the number.
    sb.from("gl_entries")
      .select("id,entry_no,entry_date,source_type,reversed")
      .eq("source_doc_no", entry.source_doc_no)
      .in("source_type", [base, `${base}_REVERSAL`])
      .eq("posted", true)
      .neq("id", entry.id)
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(50),
  ]);
  if (lines.error) return ledgerError(c, lines.error, "This entry");
  if (related.error) return ledgerError(c, related.error, "This entry");
  const lineRows = (lines.data ?? []) as Json[];

  // Party names, for the two party kinds the ledger knows. A name that cannot
  // be read comes back null and the page says so — it never guesses. (Who
  // made the entry is not read: `app_users` shows finance only its own row,
  // so every other person would read as "not recorded", which is untrue. The
  // source document carries its own history.)
  const idsOf = (kind: string) => [...new Set(lineRows
    .filter((l) => l.party_type === kind && typeof l.party_id === "string")
    .map((l) => l.party_id as string))];
  const customerIds = idsOf("CUSTOMER");
  const supplierIds = idsOf("SUPPLIER");
  const [customers, suppliers] = await Promise.all([
    customerIds.length ? sb.from(CUSTOMERS).select("id,name").in("id", customerIds) : Promise.resolve({ data: [], error: null }),
    supplierIds.length ? sb.from(SUPPLIERS).select("id,name").in("id", supplierIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const names = new Map<string, string>();
  for (const r of [...((customers.data ?? []) as Json[]), ...((suppliers.data ?? []) as Json[])]) {
    if (typeof r.id === "string" && typeof r.name === "string") names.set(r.id, r.name);
  }

  const detail: LedgerEntryDetail = {
    entry,
    lines: lineRows.map((l): LedgerEntryLine => ({
      line_no: num(l.line_no),
      account_code: String(l.account_code),
      account_name: one(l.gl_accounts as { name: string } | null)?.name ?? null,
      debit: num(l.debit),
      credit: num(l.credit),
      party_type: (l.party_type as string | null) ?? null,
      party_id: (l.party_id as string | null) ?? null,
      party_name: typeof l.party_id === "string" ? (names.get(l.party_id) ?? null) : null,
      memo: (l.memo as string | null) ?? null,
    })),
    related: ((related.data ?? []) as Json[]).map((r): LedgerRelatedEntry => ({
      id: String(r.id),
      entry_no: String(r.entry_no),
      entry_date: String(r.entry_date),
      source_type: String(r.source_type),
      reversed: r.reversed === true,
    })),
  };
  return c.json(detail);
});

// ── the chart ────────────────────────────────────────────────────────────────

async function readChart(sb: Sb): Promise<{ chart: LedgerChart } | { error: PgError }> {
  const [accounts, config] = await Promise.all([
    // 0557: the order Finance dragged, then the code. sort_order is 0 on every
    // account nobody has dragged, so the tiebreak keeps the by-code order.
    sb.from("gl_accounts")
      .select("code,name,kind,parent_code,is_control,control_for,is_active,sort_order")
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
    sb.from("gl_config").select("go_live_on").limit(1).maybeSingle(),
  ]);
  if (accounts.error) return { error: accounts.error };
  if (config.error) return { error: config.error };
  const rows = (accounts.data ?? []) as Json[];
  // A header is derived, never declared (0461): any account another row names
  // as its parent.
  const parents = new Set(rows.map((r) => r.parent_code).filter((p): p is string => typeof p === "string"));
  return {
    chart: {
      go_live_on: (config.data as { go_live_on?: string | null } | null)?.go_live_on ?? null,
      accounts: rows.map((r): LedgerAccount => ({
        code: String(r.code),
        name: String(r.name),
        kind: String(r.kind),
        parent_code: (r.parent_code as string | null) ?? null,
        is_control: r.is_control === true,
        control_for: (r.control_for as string | null) ?? null,
        is_active: r.is_active === true,
        is_header: parents.has(String(r.code)),
        sort_order: Number(r.sort_order ?? 0),
      })),
    },
  };
}

// 0540: the finance departments, for every Department filter and line picker.
financeLedgerRouter.get("/departments", requireFinance, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("fin_departments");
  if (error) return ledgerError(c, error, "The department list");
  return c.json({ rows: Array.isArray(data) ? data : [] });
});

financeLedgerRouter.get("/accounts", requireFinance, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const read = await readChart(sb);
  if ("error" in read) return ledgerError(c, read.error, "The chart of accounts");
  return c.json(read.chart);
});

/**
 * 0550's refusals each carry a DETAIL tag, and the sentence the user must read
 * is the function's own message — `mapPgError` already answers with that
 * message and the status the tag deserves:
 *
 *   not_finance    42501 → 403   Only Finance changes the chart of accounts.
 *   account_missing P0002 → 404  That account is not in the chart.
 *   name_missing   22023 → 422   Type the account name.
 *   name_too_long  22023 → 422   Keep the name to 60 characters.
 *   name_exists    22023 → 422   An account named X is already in the chart.
 *   code_shape     22023 → 422   A number is four digits, or three digits, …
 *   code_exists    22023 → 422   An account numbered X is already in the chart.
 *
 * What is added here is the tag itself, forwarded as `code` — the same
 * passthrough money-moves.ts and payables.ts do — so the modal can put the
 * sentence under the field it is about instead of at the foot of the form.
 * A 500 keeps `rpc_failed`: a tag on a break is not a refusal.
 */
function accountError(c: Context<AppEnv>, error: PgError) {
  const m = mapPgError(error);
  if (error.details && m.status !== 500) return c.json({ ...m.body, code: error.details }, m.status);
  return c.json(m.body, m.status);
}

financeLedgerRouter.patch("/accounts/:code", requireFinance, async (c) => {
  const code = c.req.param("code");
  // Both shapes 0550 accepts, not just four digits — an account renumbered to
  // 100-0001 must still be reachable by its own path.
  if (!ledgerAccountCodeShape.test(code)) {
    return c.json({ error: "not_found", code: "not_found", message: "That account is not in the chart." }, 404);
  }
  const body = await parseJsonBody(c, ledgerAccountUpdateInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  // No number given means the number stays; the function reads null as "keep".
  const { data, error } = await sb.rpc("gl_account_update", {
    p_code: code,
    p_name: body.data.name,
    p_new_code: body.data.code ?? null,
  });
  if (error) return accountError(c, error);
  // The answer is the number the account now carries, which is the new one.
  return c.json({ code: data as string });
});

/**
 * Move accounts inside one heading (0557). POST, not PATCH on a code: the thing
 * being changed is the HEADING's order, not any one account. No account code,
 * name, kind or parent is written — `gl_accounts_reorder` writes sort_order and
 * nothing else.
 *
 * The body carries BOTH orders and this route forwards both untouched. The
 * database compares `was` against the order stored right now and answers 40001
 * → 409 when somebody else moved first; the screen shows that sentence and
 * re-reads the chart.
 */
financeLedgerRouter.post("/accounts/reorder", requireFinance, async (c) => {
  const body = await parseJsonBody(c, ledgerAccountReorderInput);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("gl_accounts_reorder", {
    p_parent_code: body.data.parentCode,
    p_was: body.data.was,
    p_now: body.data.now,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ moved: Number(data ?? 0) });
});

// ── the trial balance ────────────────────────────────────────────────────────

financeLedgerRouter.get("/trial-balance", requireFinance, async (c) => {
  const parsed = ledgerAsOfQuery.safeParse(queryOf(c));
  if (!parsed.success) return invalid(c, parsed.error);
  const asOf = parsed.data.asOf ?? todayIsoMYT();
  const sb = userClient(c.env, c.var.auth.jwt);

  const [tb, chart] = await Promise.all([sb.rpc("gl_trial_balance", { p_as_of: asOf, ...departmentRpcArgs(parsed.data) }), readChart(sb)]);
  if (tb.error) return ledgerError(c, tb.error, "The trial balance");
  if ("error" in chart) return ledgerError(c, chart.error, "The trial balance");
  const rows = (Array.isArray(tb.data) ? tb.data : []) as Json[];
  const first = rows[0];
  // The function always answers with rows; none at all means it broke.
  if (!first) return failed(c, "The trial balance");

  if (first.report_status === "BEFORE_GO_LIVE") {
    const report: TrialBalanceReport = {
      status: "before_go_live", go_live_on: String(first.go_live_on), as_of: String(first.as_of),
      accounts: [], total_debit: null, total_credit: null, difference: null, balances: null,
    };
    return c.json(report);
  }
  const total = rows.find((r) => r.row_kind === "TOTAL");
  if (!total) return failed(c, "The trial balance");
  // Headers can never be posted to (0468), so their rows are always zero and
  // only repeat what the kind grouping already says.
  const headers = new Set(chart.chart.accounts.filter((a) => a.is_header).map((a) => a.code));
  const report: TrialBalanceReport = {
    status: "ok",
    go_live_on: String(first.go_live_on),
    as_of: String(first.as_of),
    accounts: rows
      .filter((r) => r.row_kind === "ACCOUNT" && !headers.has(String(r.account_code)))
      .map((r) => ({
        account_code: String(r.account_code),
        account_name: String(r.account_name),
        kind: String(r.kind),
        is_control: r.is_control === true,
        is_active: r.is_active === true,
        total_debit: num(r.total_debit),
        total_credit: num(r.total_credit),
        natural_balance: num(r.natural_balance),
      })),
    total_debit: num(total.total_debit),
    total_credit: num(total.total_credit),
    difference: cents(num(total.total_debit) - num(total.total_credit)),
    balances: total.balances === true,
  };
  return c.json(report);
});

// ── one account, line by line ───────────────────────────────────────────────

financeLedgerRouter.get("/account-ledger", requireFinance, async (c) => {
  const parsed = ledgerAccountLedgerQuery.safeParse(queryOf(c));
  if (!parsed.success) return invalid(c, parsed.error);
  const { account, from, to } = parsed.data;
  const dept = departmentRpcArgs(parsed.data);
  const sb = userClient(c.env, c.var.auth.jwt);
  const read = await readAllPages((a, b) => sb
    .rpc("gl_account_ledger", { p_account_code: account, p_from: from, p_to: to, ...dept })
    .order("ordinal", { ascending: true })
    .range(a, b));
  if ("tooMany" in read) {
    return c.json({ error: "invalid_param", code: "too_many_rows", message: "Choose a shorter period for this account." }, 422);
  }
  if ("error" in read) return ledgerError(c, read.error, "The account ledger");
  const first = read.rows[0];
  if (!first) return failed(c, "The account ledger");
  return c.json({
    status: String(first.report_status),
    go_live_on: String(first.go_live_on),
    account_code: (first.account_code as string | null) ?? account,
    account_name: (first.account_name as string | null) ?? null,
    kind: (first.kind as string | null) ?? null,
    rows: read.rows.map((r) => ({
      ordinal: num(r.ordinal),
      row_kind: String(r.row_kind),
      entry_date: (r.entry_date as string | null) ?? null,
      entry_no: (r.entry_no as string | null) ?? null,
      source_type: (r.source_type as string | null) ?? null,
      source_doc_no: (r.source_doc_no as string | null) ?? null,
      narration: (r.narration as string | null) ?? null,
      memo: (r.memo as string | null) ?? null,
      party_type: (r.party_type as string | null) ?? null,
      party_id: (r.party_id as string | null) ?? null,
      debit: numOrNull(r.debit),
      credit: numOrNull(r.credit),
      running_balance: numOrNull(r.running_balance),
    })),
  });
});

// ── health and the self-check ───────────────────────────────────────────────

function toHealthRows(data: unknown): LedgerHealthRow[] {
  return ((Array.isArray(data) ? data : []) as Json[]).map((r) => ({
    ordinal: num(r.ordinal),
    check_key: String(r.check_key),
    check_label: String(r.check_label),
    status: String(r.status),
    count_value: numOrNull(r.count_value),
    amount_value: numOrNull(r.amount_value),
    date_value: (r.date_value as string | null) ?? null,
  }));
}

financeLedgerRouter.get("/health", requireFinance, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("gl_ledger_health");
  if (error) return ledgerError(c, error, "The ledger checks");
  const rows = toHealthRows(data);
  // Always eleven rows by contract; none means the function broke, not that
  // the ledger is healthy.
  if (rows.length === 0) return failed(c, "The ledger checks");
  return c.json({ rows });
});

const sectionError = (what: string, error: PgError): { ok: false; message: string } => ({
  ok: false,
  message: error.code === "55000"
    ? "The ledger has no start date yet."
    : `${what} could not be checked. Try again.`,
});

/** Split every control account into the parties who make it up (0479). */
function toControls(rows: Json[]): ControlAccountCheck[] {
  const accounts = new Map<string, ControlAccountCheck>();
  const open = new Map<string, ControlParty[]>();
  for (const r of rows) {
    const code = String(r.account_code);
    if (r.row_kind === "ACCOUNT") {
      accounts.set(code, {
        account_code: code,
        account_name: String(r.account_name),
        kind: String(r.kind),
        control_for: (r.control_for as string | null) ?? null,
        is_active: r.is_active === true,
        total_debit: num(r.total_debit),
        total_credit: num(r.total_credit),
        natural_balance: num(r.natural_balance),
        line_count: num(r.line_count),
        party_count: 0,
        open_parties: [],
        open_party_count: 0,
        findings: [],
      });
      open.set(code, []);
    }
  }
  for (const r of rows) {
    const account = accounts.get(String(r.account_code));
    if (!account) continue;
    const entryNos = Array.isArray(r.entry_nos) ? (r.entry_nos as string[]) : [];
    if (r.row_kind === "NO_PARTY") {
      account.findings.push({
        kind: "no_party", party_type: null, party_name: null,
        total_debit: num(r.total_debit), total_credit: num(r.total_credit),
        line_count: num(r.line_count), entry_nos: entryNos,
      });
    } else if (r.row_kind === "PARTY") {
      account.party_count += 1;
      if (r.party_matches !== true) {
        account.findings.push({
          kind: "wrong_party", party_type: (r.party_type as string | null) ?? null,
          party_name: (r.party_name as string | null) ?? null,
          total_debit: num(r.total_debit), total_credit: num(r.total_credit),
          line_count: num(r.line_count), entry_nos: entryNos,
        });
      }
      if (!isZeroMoney(num(r.natural_balance))) {
        open.get(account.account_code)!.push({
          party_type: String(r.party_type),
          party_id: String(r.party_id),
          party_name: (r.party_name as string | null) ?? null,
          natural_balance: num(r.natural_balance),
          line_count: num(r.line_count),
        });
      }
    }
  }
  for (const account of accounts.values()) {
    const parties = open.get(account.account_code)!;
    parties.sort((a, b) => Math.abs(b.natural_balance) - Math.abs(a.natural_balance));
    account.open_party_count = parties.length;
    account.open_parties = parties.slice(0, 50);
  }
  return [...accounts.values()];
}

/**
 * Accounts payable, two ways. The ledger side sums every supplier on the
 * liability-side supplier control accounts (read from the chart, so a second
 * payables account joins with no code change). The document side is
 * `ap_outstanding.net_owing` — confirmed bills less what paid them, less the
 * advance paid and not yet used (0484). An approved advance debits the same
 * control, so `balance_owing` alone would name every supplier with an advance.
 * `balance_owing` is the fallback for a server without 0484. A supplier whose
 * two figures differ is named.
 */
function toPayables(controlRows: Json[], apRows: Json[]): PayablesCheck {
  const accountCodes = controlRows
    .filter((r) => r.row_kind === "ACCOUNT" && r.kind === "LIABILITY" && r.control_for === "SUPPLIER")
    .map((r) => String(r.account_code));
  const ledger = new Map<string, { name: string | null; owing: number }>();
  for (const r of controlRows) {
    if (r.row_kind !== "PARTY" || r.party_type !== "SUPPLIER") continue;
    if (!accountCodes.includes(String(r.account_code))) continue;
    const id = String(r.party_id);
    const before = ledger.get(id);
    ledger.set(id, {
      name: (r.party_name as string | null) ?? before?.name ?? null,
      owing: cents((before?.owing ?? 0) + num(r.natural_balance)),
    });
  }
  const bills = new Map<string, { name: string | null; owing: number }>();
  for (const r of apRows) {
    bills.set(String(r.supplier_id), {
      name: (r.supplier_name as string | null) ?? null,
      owing: num(r.net_owing ?? r.balance_owing),
    });
  }
  const differences: SupplierDifference[] = [];
  for (const id of new Set([...ledger.keys(), ...bills.keys()])) {
    const l = ledger.get(id)?.owing ?? 0;
    const b = bills.get(id)?.owing ?? 0;
    if (isZeroMoney(l - b)) continue;
    differences.push({
      supplier_id: id,
      supplier_name: bills.get(id)?.name ?? ledger.get(id)?.name ?? null,
      ledger_owing: l,
      bills_owing: b,
      difference: cents(l - b),
    });
  }
  differences.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  const ledgerTotal = cents([...ledger.values()].reduce((s, v) => s + v.owing, 0));
  const billsTotal = cents([...bills.values()].reduce((s, v) => s + v.owing, 0));
  return {
    account_codes: accountCodes,
    ledger_total: ledgerTotal,
    bills_total: billsTotal,
    difference: cents(ledgerTotal - billsTotal),
    suppliers: differences.slice(0, 50),
    supplier_difference_count: differences.length,
  };
}

function toReceivables(r: Json): ReceivablesCheck {
  return {
    account_code: (r.ar_account_code as string | null) ?? null,
    comparable: r.comparable === true,
    ledger_started: r.go_live_on != null,
    ledger_total: num(r.ledger_ar_balance),
    documents_total: num(r.operational_ar_balance),
    difference: num(r.difference),
    unposted_invoice_count: num(r.unposted_invoice_count),
    unposted_invoice_amount: num(r.unposted_invoice_amount),
    storage_uncollected: num(r.storage_recognised_uncollected),
    pre_go_live_open_count: num(r.pre_go_live_open_count),
    pre_go_live_open_amount: num(r.pre_go_live_open_amount),
  };
}

function toRentals(rows: Json[]): RentalCheck {
  const months = rows.map((r): RentalMonthUnposted => ({
    agreement_no: String(r.agreement_no),
    seq: num(r.seq),
    paid_on: String(r.paid_on),
    paid_amount: num(r.paid_amount),
    doc_no: String(r.doc_no),
  }));
  return {
    months: months.slice(0, 50),
    month_count: months.length,
    amount: cents(months.reduce((s, m) => s + m.paid_amount, 0)),
  };
}

/** The rental read arrives with the rental posting migration. A server that
 *  does not have it yet says so plainly instead of "try again", which would
 *  never help. */
function rentalsError(error: PgError): { ok: false; message: string } {
  if (error.code === "PGRST202" || error.code === "42883") {
    return { ok: false, message: "Rental months are not checked on this server yet." };
  }
  return sectionError("Rental months", error);
}

function toBooks(r: Json): BooksCheck {
  return {
    total_debit: num(r.total_debit),
    total_credit: num(r.total_credit),
    difference: num(r.difference),
    entry_count: num(r.entry_count),
    line_count: num(r.line_count),
    header_mismatch_count: num(r.header_mismatch_count),
    balanced: r.balanced === true,
  };
}

financeLedgerRouter.get("/self-check", requireFinance, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const [books, health, controls, ar, ap, rentals] = await Promise.all([
    sb.rpc("gl_trial_balance_check"),
    sb.rpc("gl_ledger_health"),
    readAllPages((a, b) => sb
      .rpc("gl_control_party_balances")
      .order("account_code", { ascending: true })
      .order("row_kind", { ascending: true })
      .order("party_type", { ascending: true })
      .order("party_id", { ascending: true })
      .range(a, b)),
    sb.rpc("gl_receivables_reconcile"),
    readAllPages((a, b) => sb
      .rpc("ap_outstanding")
      .order("supplier_id", { ascending: true })
      .range(a, b)),
    // Rental months collected with no ledger entry. Empty is healthy.
    readAllPages((a, b) => sb
      .rpc("gl_rental_payments_unposted")
      .order("paid_on", { ascending: true })
      .order("billing_id", { ascending: true })
      .range(a, b), 5),
  ]);

  // A refusal is the caller's answer, not a section's: finance and principal
  // pass requireFinance, and the ledger's own gate agrees or the whole page is
  // refused rather than shown as a wall of "not checked".
  const refusals = [books.error, health.error, ar.error, "error" in controls ? controls.error : null,
    "error" in ap ? ap.error : null, "error" in rentals ? rentals.error : null];
  if (refusals.some((e) => e?.code === "42501")) {
    return c.json({ error: "forbidden", code: "forbidden", message: "Only Finance and the Principal may read the ledger." }, 403);
  }

  const booksRow = one((books.data ?? null) as Json | Json[] | null);
  const arRow = one((ar.data ?? null) as Json | Json[] | null);
  const healthRows = toHealthRows(health.data);
  const controlsResult: Checked<{ accounts: ControlAccountCheck[] }> = "rows" in controls
    ? { ok: true, accounts: toControls(controls.rows) }
    : "tooMany" in controls
      ? { ok: false, message: "There are too many customers and suppliers to check here." }
      : sectionError("The control accounts", controls.error);
  const payables: Checked<PayablesCheck> = !("rows" in controls)
    ? { ok: false, message: "Supplier payables could not be checked because the control accounts were not read." }
    : "rows" in ap
      ? { ok: true, ...toPayables(controls.rows, ap.rows) }
      : "tooMany" in ap
        ? { ok: false, message: "There are too many suppliers to check here." }
        : sectionError("Supplier payables", ap.error);

  const report: LedgerSelfCheck = {
    checked_at: new Date().toISOString(),
    go_live_on: (healthRows.find((r) => r.check_key === "go_live_on")?.date_value)
      ?? ((booksRow?.go_live_on as string | null | undefined) ?? null),
    books: books.error ? sectionError("The books", books.error)
      : booksRow ? { ok: true, ...toBooks(booksRow) }
      : { ok: false, message: "The books could not be checked. Try again." },
    controls: controlsResult,
    receivables: ar.error ? sectionError("Customer receivables", ar.error)
      : arRow ? { ok: true, ...toReceivables(arRow) }
      : { ok: false, message: "Customer receivables could not be checked. Try again." },
    payables,
    rentals: "rows" in rentals ? { ok: true, ...toRentals(rentals.rows) }
      : "tooMany" in rentals ? { ok: false, message: "Too many rental months have no ledger entry to list here." }
      : rentalsError(rentals.error),
    health: health.error ? sectionError("The ledger checks", health.error)
      : healthRows.length ? { ok: true, rows: healthRows }
      : { ok: false, message: "The ledger checks could not be read. Try again." },
  };
  return c.json(report);
});

// ── the two statements, passed through ──────────────────────────────────────

financeLedgerRouter.get("/profit-and-loss", requireFinance, async (c) => {
  const parsed = ledgerPeriodQuery.safeParse(queryOf(c));
  if (!parsed.success) return invalid(c, parsed.error);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("gl_profit_and_loss", { p_from: parsed.data.from, p_to: parsed.data.to, ...departmentRpcArgs(parsed.data) });
  if (error) return ledgerError(c, error, "The profit and loss");
  if (!Array.isArray(data) || data.length === 0) return failed(c, "The profit and loss");
  return c.json({ rows: data });
});

financeLedgerRouter.get("/balance-sheet", requireFinance, async (c) => {
  const parsed = ledgerAsOfQuery.safeParse(queryOf(c));
  if (!parsed.success) return invalid(c, parsed.error);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("gl_balance_sheet", { p_as_of: parsed.data.asOf ?? todayIsoMYT(), ...departmentRpcArgs(parsed.data) });
  if (error) return ledgerError(c, error, "The balance sheet");
  if (!Array.isArray(data) || data.length === 0) return failed(c, "The balance sheet");
  return c.json({ rows: data });
});

export default financeLedgerRouter;
