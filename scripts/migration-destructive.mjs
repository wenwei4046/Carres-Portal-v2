/**
 * What the migration gate calls DESTRUCTIVE SQL, as a pure module so the
 * shipped gate and its regression test read one definition
 * (scripts/check-migrations.mjs runs at import and cannot be called).
 *
 * The guard exists to stop a migration from destroying production data WHILE
 * IT APPLIES. A bare `drop table` / `truncate` / `delete from` at migration
 * level fails, and so does one inside a `do $$ … $$` block, which IS executed
 * on apply.
 */

/**
 * A dollar-quoted body is CODE THIS MIGRATION DEFINES, not SQL it runs.
 *
 * A `delete from` inside `create function … $$ … $$` does nothing at apply
 * time: it is the application's own statement, guarded by its own role checks,
 * floors and transaction, and it runs when a user acts.
 *
 * Without this, the guard forbids ever AMENDING an RPC that prunes rows — and
 * the repository already ships several (`sales_order_save_revision` since 0340,
 * `sales_order_create` since 0327, the purchasing and rental writers).
 */
export function stripFunctionBodies(sql) {
  return sql
    .replace(/\bdo\s+\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1?\$/gi, (m) => m)
    .replace(
      /\bcreate\s+(?:or\s+replace\s+)?function\b[\s\S]*?\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1?\$/gi,
      "create function <body omitted>",
    );
}

/**
 * A FUNCTION REWRITE IS A FUNCTION DEFINITION TOO.
 *
 * Since 0675 a migration that changes one line of a live function does it with
 * a helper, `pg_temp.migNNNN_rewrite(fn, $old$ … $old$, $new$ … $new$)`: the
 * helper reads the function's live definition, replaces the one snippet and
 * executes the result, which is always a `create or replace function`. The two
 * snippets are text of that function's body, exactly like a body this guard
 * already sets aside. Measured 2026-10-10 on 0681: the voucher's own
 * `delete from public.payment_voucher_allocations where voucher_id = v_id;`
 * (a draft's lines are replaced whole, as since 0477) sat inside a `$old$`
 * snippet and was read as data being destroyed on apply.
 *
 * Only a whole rewrite call is set aside — the helper's name, then its `$old$`
 * and `$new$` snippets up to the closing parenthesis. A bare statement before
 * or after the call, or a `$new$` string anywhere else, is still scanned.
 */
export function stripRewriteCalls(sql) {
  return sql.replace(
    /\bpg_temp\.mig[0-9a-z_]*_rewrite\s*\([\s\S]*?\$old\$[\s\S]*?\$old\$\s*,\s*\$new\$[\s\S]*?\$new\$\s*\)/gi,
    "pg_temp.rewrite(<function text omitted>)",
  );
}

/**
 * A COMMENT EXECUTES NOTHING, so the guard must not read one.
 *
 * Measured 2026-08-20: migration 0367 was blocked by the sentence "it revoked
 * INSERT/UPDATE/ DELETE from `authenticated`" in its own header — prose
 * EXPLAINING a revoke, matched as `delete from`.
 */
export function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/**
 * REVOKING A PRIVILEGE IS NOT USING IT.
 *
 * TRUNCATE is matched only where it is a statement VERB — at the start of a
 * statement — so `revoke`/`grant` lists do not trip it (0367).
 */
export const DESTRUCTIVE = [
  /\bdrop\s+(table|schema|column)\b/i,
  /(^|;)\s*truncate\b/i,
  /\bdelete\s+from\b/i,
];

export function isDestructiveSql(sql) {
  const scanned = stripComments(stripRewriteCalls(stripFunctionBodies(sql)));
  return DESTRUCTIVE.some((re) => re.test(scanned));
}
