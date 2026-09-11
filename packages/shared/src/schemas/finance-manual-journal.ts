/**
 * The manual journal — POST /api/finance/manual-journals.
 *
 * The one ledger entry with no document behind it: an opening balance, a
 * correction. Principal only (ruling M). It is posted by `gl_manual_journal`
 * (migration 0462), which checks the caller itself, refuses any line on a
 * control account, draws the entry's `MJ-YYYYMM-NNNN` document number and hands
 * the lines to `gl_post`, which draws the `JE-YYYYMM-NNNN` entry number.
 *
 * These schemas catch typing mistakes before the round trip. The database
 * refuses the same things again, and it is the rule: the start date, the chart,
 * the control accounts and the balance are all checked there.
 *
 * PURE — no clock, no I/O.
 */
import { z } from "zod";

/** numeric(12,2), the ledger's money column (ruling N). */
export const MANUAL_JOURNAL_MAX_MONEY = 9_999_999_999.99;
export const MANUAL_JOURNAL_MAX_LINES = 100;

/** A real calendar day, written YYYY-MM-DD. */
function isCalendarDay(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const twoDecimals = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;

/** A typed amount: more than zero, at most two decimals. A third decimal is
 *  refused, never rounded — rounding would post a figure nobody typed. */
const journalAmount = z
  .number({ invalid_type_error: "Type the amount in numbers, like 1500.00." })
  .positive("The amount must be more than RM 0.00.")
  .max(MANUAL_JOURNAL_MAX_MONEY, "The amount is larger than the ledger can hold.")
  .refine(twoDecimals, "An amount has at most two decimals.");

export const manualJournalLineInput = z
  .object({
    account_code: z.string().regex(/^[0-9A-Za-z][0-9A-Za-z._-]{0,19}$/, "Choose an account on every line."),
    debit: journalAmount.nullable().optional(),
    credit: journalAmount.nullable().optional(),
    memo: z.string().trim().max(500, "A memo is at most 500 characters.").nullable().optional(),
  })
  .strict()
  .superRefine((line, ctx) => {
    const hasDebit = line.debit != null;
    const hasCredit = line.credit != null;
    if (hasDebit && hasCredit) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["credit"], message: "A line takes a debit or a credit, not both." });
    } else if (!hasDebit && !hasCredit) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["debit"], message: "Type a debit or a credit on every line." });
    }
  });
export type ManualJournalLineInput = z.infer<typeof manualJournalLineInput>;

export const manualJournalInput = z
  .object({
    entry_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the entry date.")
      .refine(isCalendarDay, "Choose the entry date."),
    narration: z.string().trim().min(1, "Type the narration.").max(500, "The narration is at most 500 characters."),
    lines: z
      .array(manualJournalLineInput)
      .min(2, "A journal entry needs at least two lines.")
      .max(MANUAL_JOURNAL_MAX_LINES, `A journal entry takes at most ${MANUAL_JOURNAL_MAX_LINES} lines.`),
  })
  .strict()
  .superRefine((entry, ctx) => {
    const t = manualJournalTotals(entry.lines);
    if (t.debit > MANUAL_JOURNAL_MAX_MONEY) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lines"], message: "The total is larger than the ledger can hold." });
    } else if (t.difference !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lines"], message: "Debits and credits must be equal." });
    }
  });
export type ManualJournalInput = z.infer<typeof manualJournalInput>;

/** What the route answers once the entry stands. `entry_no` and `doc_no` are
 *  null only if the entry posted and the read-back failed; `id` always opens it. */
export interface ManualJournalRecorded {
  id: string;
  entry_no: string | null;
  doc_no: string | null;
}

/**
 * Both sides added up in whole sen, so 0.1 + 0.2 is 0.30 and never
 * 0.30000000000000004. `difference` is debits less credits; `balanced` needs
 * both sides equal AND more than zero — an entry that moves nothing is not an
 * entry (`gl_post_zero_total`).
 */
export function manualJournalTotals(
  lines: ReadonlyArray<{ debit?: number | null; credit?: number | null }>,
): { debit: number; credit: number; difference: number; balanced: boolean } {
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    const d = Number(l.debit);
    const c = Number(l.credit);
    if (l.debit != null && Number.isFinite(d)) debit += Math.round(d * 100);
    if (l.credit != null && Number.isFinite(c)) credit += Math.round(c * 100);
  }
  return {
    debit: debit / 100,
    credit: credit / 100,
    difference: (debit - credit) / 100,
    balanced: debit === credit && debit > 0,
  };
}
