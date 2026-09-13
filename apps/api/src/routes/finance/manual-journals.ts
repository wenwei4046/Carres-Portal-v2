import { Hono, type Context, type MiddlewareHandler } from "hono";
import {
  manualJournalInput,
  type ManualJournalRecorded,
} from "@carres/shared/schemas/finance-manual-journal";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * FINANCE · MANUAL JOURNAL — the one door that writes a ledger entry with no
 * document behind it: an opening balance, a correction.
 *
 * Mounted at `/api/finance/manual-journals`, above the `/finance` catch-all.
 * Kept apart from `ledger.ts` on purpose: that router only reads.
 *
 *   POST /    record one entry → 201 { id, entry_no, doc_no }
 *
 * PRINCIPAL ONLY (ruling M), twice: `requirePrincipal` here, and
 * `gl_manual_journal` (0462) raising 42501 for anyone `is_principal()` does not
 * name — it reads `app_users` through `auth.uid()`, so `userClient` forwarding
 * the caller's JWT is what makes that check see the person who pressed.
 *
 * The function draws the `MJ-YYYYMM-NNNN` document number and `gl_post` draws
 * the `JE-YYYYMM-NNNN` entry number.
 *
 * THE REQUEST KEY (0502). The form draws one uuid per entry and sends it as
 * `requestKey` on every press. It reaches `gl_manual_journal(…, p_request_key)`:
 * the same key with the same details returns the SAME entry id and posts
 * nothing; the same key with other details is refused (`idempotency_mismatch`).
 *
 * DEPLOY ORDER. This route ships before 0502 is applied. Until then the keyed
 * call is answered "function not found" (PGRST202 / 42883) — nothing ran — and
 * the route makes the old three-argument call instead, which posts every time.
 * So an unknown outcome may say "press again" only when this isolate has seen
 * the keyed function answer (`keyedJournalLive`); otherwise it keeps "check the
 * Journal first".
 *
 * Control accounts (receivables and payables) are refused by the database and
 * that refusal is kept: those balances move only through their own documents.
 */
const financeManualJournalsRouter = new Hono<AppEnv>();

type PgError = { code?: string; message?: string; details?: string };

const FORBIDDEN = "Only the principal may record a journal entry.";

/** Principal only — the HTTP mirror of the `is_principal()` check inside
 *  `gl_manual_journal`. Refused before any database call. */
const requirePrincipal: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.var.auth?.role !== "principal") {
    return c.json({ error: "forbidden", code: "forbidden", message: FORBIDDEN }, 403);
  }
  await next();
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 10 Sep 2026 — the date words every Carres page prints. Spelled by hand:
 *  the runtime's own `en-GB` short month is `Sept` on newer ICU data. */
function dayWords(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}

const beforeStart = (goLive: string) => `The ledger started on ${dayWords(goLive)}. Pick a day from then on.`;

/** A control account (receivables, payables, other debtors or creditors),
 *  said the way the person who picked it thinks of it. */
const CONTROL_ACCOUNT =
  "uses a customer, supplier or other party account. Those accounts move only through their own documents.";

/**
 * The database's refusals, by the DETAIL each one carries, as sentences a
 * person can act on. A refusal about one line names the line.
 */
const REFUSALS: Record<string, { status: 403 | 409 | 422; message: string; perLine?: boolean }> = {
  gl_manual_journal_forbidden:        { status: 403, message: FORBIDDEN },
  gl_manual_journal_entry_date_null:  { status: 422, message: "Choose the entry date." },
  gl_post_entry_date_null:            { status: 422, message: "Choose the entry date." },
  gl_manual_journal_narration_blank:  { status: 422, message: "Type the narration." },
  gl_manual_journal_lines_not_array:  { status: 422, message: "The lines could not be read. Check them and try again." },
  gl_post_lines_not_array:            { status: 422, message: "The lines could not be read. Check them and try again." },
  gl_manual_journal_line_not_object:  { status: 422, message: "could not be read. Check it and try again.", perLine: true },
  gl_post_line_not_object:            { status: 422, message: "could not be read. Check it and try again.", perLine: true },
  gl_manual_journal_control_account:  { status: 422, message: CONTROL_ACCOUNT, perLine: true },
  gl_post_control_account_needs_party:{ status: 422, message: CONTROL_ACCOUNT, perLine: true },
  gl_post_party_type_wrong_side:      { status: 422, message: CONTROL_ACCOUNT, perLine: true },
  gl_post_no_go_live:                 { status: 409, message: "The ledger has no start date yet." },
  gl_post_too_few_lines:              { status: 422, message: "A journal entry needs at least two lines." },
  gl_post_line_account_code_blank:    { status: 422, message: "has no account. Choose one.", perLine: true },
  gl_post_account_unknown:            { status: 422, message: "names an account that is not in the chart.", perLine: true },
  gl_post_account_inactive:           { status: 422, message: "names an account that is no longer in use.", perLine: true },
  gl_post_account_is_header:          { status: 422, message: "names a heading account. Choose an account under it.", perLine: true },
  gl_post_line_debit_not_number:      { status: 422, message: "needs its amount in numbers.", perLine: true },
  gl_post_line_credit_not_number:     { status: 422, message: "needs its amount in numbers.", perLine: true },
  gl_post_line_negative:              { status: 422, message: "has an amount below RM 0.00. Put it on the other side instead.", perLine: true },
  gl_post_line_two_sided:             { status: 422, message: "has a debit and a credit. A line takes one of them, not both.", perLine: true },
  gl_post_line_empty:                 { status: 422, message: "has no debit and no credit.", perLine: true },
  gl_post_out_of_balance:             { status: 422, message: "Debits and credits must be equal." },
  gl_post_zero_total:                 { status: 422, message: "The entry adds up to RM 0.00." },
};

/** The call went out and no database answer came back (a gateway page, a
 *  dropped connection): the entry may stand. Without a live request key,
 *  never "try again" — a second press is a second entry. */
const OUTCOME_UNKNOWN = "The answer did not come back. Check the Journal for this entry before you record it again.";
/** The same, when the press carried a request key the database is known to
 *  honour: a second press returns the first entry, or records it once. */
const OUTCOME_UNKNOWN_KEYED = "The answer did not come back. Press Record journal entry again. This entry is never recorded twice.";

/** True once this isolate has seen `gl_manual_journal(…, p_request_key)`
 *  answer — a result or a refusal of its own, anything but "not found". A
 *  migration is never unapplied, so it is never set back. Exported for tests. */
let keyedJournalLive = false;
export const _resetKeyedJournalLiveForTesting = () => { keyedJournalLive = false; };

const outcomeUnknown = (c: Context<AppEnv>, retrySafe = false) =>
  c.json({
    error: "outcome_unknown",
    code: "outcome_unknown",
    message: retrySafe ? OUTCOME_UNKNOWN_KEYED : OUTCOME_UNKNOWN,
    retry_safe: retrySafe,
  }, 503);

/** "Function not found": PostgREST's schema cache has no such signature
 *  (PGRST202), or Postgres itself has none (42883). Nothing ran. */
const isMissingFunction = (error: PgError | null) =>
  error?.code === "PGRST202" || error?.code === "42883";

function journalError(c: Context<AppEnv>, error: PgError, goLive: string | null, retrySafe: boolean) {
  // A database refusal always carries a five-character SQLSTATE.
  if (!/^[0-9A-Z]{5}$/.test(error.code ?? "")) return outcomeUnknown(c, retrySafe);
  if (error.details === "idempotency_mismatch") {
    const entryNo = /already recorded as (JE-[0-9A-Za-z-]+)/.exec(error.message ?? "")?.[1];
    return c.json({
      error: "rule_violation", code: "idempotency_mismatch",
      message: `This entry was already recorded${entryNo ? ` as ${entryNo}` : ""} before it was changed. Open it in the Journal. To record another, start a New journal entry.`,
    }, 409);
  }
  const known = error.details ? REFUSALS[error.details] : undefined;
  if (known) {
    let message = known.message;
    if (known.perLine) {
      const line = /\bline (\d+)\b/.exec(error.message ?? "")?.[1];
      message = line ? `Line ${line} ${known.message}` : `A line ${known.message}`;
    }
    return c.json({ error: known.status === 403 ? "forbidden" : "rule_violation", code: error.details, message }, known.status);
  }
  if (error.details === "gl_post_entry_date_before_go_live") {
    const at = /go-live date (\d{4}-\d{2}-\d{2})/.exec(error.message ?? "")?.[1] ?? goLive;
    return c.json({
      error: "rule_violation", code: error.details,
      message: at ? beforeStart(at) : "The entry date is before the ledger started.",
    }, 422);
  }
  // No DETAIL of ours: a permission the database itself refused, an amount
  // too large for numeric(12,2), or something that broke.
  if (error.code === "42501") {
    return c.json({ error: "forbidden", code: "forbidden", message: FORBIDDEN }, 403);
  }
  if (error.code === "22003") {
    return c.json({ error: "invalid_param", code: "invalid_param", message: "The total is larger than the ledger can hold." }, 422);
  }
  const mapped = mapPgError(error);
  if (mapped.status === 500) {
    return c.json({ ...mapped.body, message: "The journal entry could not be recorded. Try again." }, 500);
  }
  return c.json({ ...mapped.body, message: "The journal entry was refused. Check it and try again." }, mapped.status);
}

financeManualJournalsRouter.post("/", requirePrincipal, async (c) => {
  const body = await parseJsonBody(c, manualJournalInput);
  if (!body.ok) return c.json(body.body, body.status);
  const input = body.data;
  const sb = userClient(c.env, c.var.auth.jwt);

  // The start date, checked here first so the refusal can name the day. The
  // database checks it again inside gl_post; a failed read simply leaves the
  // check to it.
  const config = await sb.from("gl_config").select("go_live_on").limit(1).maybeSingle();
  const goLive = config.error ? null : ((config.data as { go_live_on?: string | null } | null)?.go_live_on ?? null);
  if (goLive && input.entry_date < goLive) {
    return c.json({ error: "invalid_param", code: "gl_post_entry_date_before_go_live", message: beforeStart(goLive) }, 422);
  }

  const args = {
    p_entry_date: input.entry_date,
    p_narration: input.narration,
    p_lines: input.lines.map((l) => ({
      account_code: l.account_code,
      debit: l.debit ?? null,
      credit: l.credit ?? null,
      memo: l.memo ? l.memo : null,
    })),
  };

  // With a key, the keyed function; before 0502 is applied it is not found —
  // nothing ran — and the old call is made instead. Only "not found" falls
  // back: any other answer came from the keyed function itself.
  let result = input.requestKey
    ? await sb.rpc("gl_manual_journal", { ...args, p_request_key: input.requestKey })
    : await sb.rpc("gl_manual_journal", args);
  let keyed = Boolean(input.requestKey);
  if (keyed && isMissingFunction(result.error)) {
    keyed = false;
    result = await sb.rpc("gl_manual_journal", args);
  } else if (keyed && (result.error === null || /^[0-9A-Z]{5}$/.test(result.error.code ?? ""))) {
    keyedJournalLive = true;
  }
  const retrySafe = keyed && keyedJournalLive;

  const { data, error } = result;
  if (error) return journalError(c, error, goLive, retrySafe);
  const id = typeof data === "string" ? data : null;
  if (!id) return outcomeUnknown(c, retrySafe);

  // The entry stands from here on. A failed read-back must not look like a
  // failed entry — a person told "it failed" presses again and posts twice —
  // so it answers 201 with the id, which opens the entry just as well.
  const read = await sb.from("gl_entries").select("entry_no,source_doc_no").eq("id", id).maybeSingle();
  const row = read.error ? null : (read.data as { entry_no?: string | null; source_doc_no?: string | null } | null);
  const recorded: ManualJournalRecorded = {
    id,
    entry_no: row?.entry_no ?? null,
    doc_no: row?.source_doc_no ?? null,
  };
  return c.json(recorded, 201);
});

export default financeManualJournalsRouter;
