import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0529 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: bank transfers
 * and card payouts. Same harness as finance-approver-role.integration.test.ts:
 * one transaction, rolled back; identities through the request-claims GUC.
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- money-moves
 *
 * Without the URL every case is SKIPPED.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `dddddddd-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { preparer: uid("1"), other: uid("2"), principal: uid("3"), operation: uid("4") };
const POS = uid("a1");

describe.skipIf(!URL)("money moves (real PostgreSQL, 0529)", () => {
  let db: pg.Client;
  let onDate = "";
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const actAs = (id: string | null) =>
    q("select set_config('request.jwt.claims', $1, false)", [id ? JSON.stringify({ sub: id, role: "authenticated" }) : ""]);
  async function attempt(sql: string, params: unknown[] = []): Promise<{ ok: true; value: unknown } | { ok: false; detail: string }> {
    await q("savepoint s");
    try {
      const r = await q(sql, params);
      await q("release savepoint s");
      return { ok: true, value: r.rows[0] ? Object.values(r.rows[0])[0] : null };
    } catch (e) {
      await q("rollback to savepoint s");
      return { ok: false, detail: (e as { detail?: string }).detail ?? (e as Error).message };
    }
  }
  const create = (kind: string, from: string, to: string, amount: number, fee = 0) =>
    attempt("select public.gl_money_move_create($1, $2::date, $3, $4, $5, $6) as id", [kind, onDate, from, to, amount, fee]);
  const linesOf = async (id: string) =>
    (
      await q(
        `select l.account_code, l.debit::float as debit, l.credit::float as credit
           from gl_money_moves m join gl_entry_lines l on l.entry_id = m.gl_entry_id
          where m.id = $1 order by l.account_code`,
        [id],
      )
    ).rows;

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    onDate = (await q("select greatest(timezone('Asia/Kuala_Lumpur', now())::date, (select go_live_on from gl_config where id))::text as d")).rows[0].d;
    await q("insert into org_positions (id, name, band) values ($1, $2, 'executive')", [POS, `IT mm ${RUN}`]);
    const people: Array<[string, string, string | null]> = [
      [U.preparer, "finance", POS],
      [U.other, "finance", POS],
      [U.principal, "principal", null],
      [U.operation, "operation", POS],
    ];
    for (const [id, role, position] of people) {
      const email = `it-mm-${role}-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, position_id) values ($1, $2, $3, $4, 'active', $5)", [
        id, email, `IT ${role} ${id.slice(-4)}`, role, position,
      ]);
    }
    // 0533: a principal approves only as a person, not as a shared login.
    await q("update app_users set is_person = true where id = $1", [U.principal]);
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("only Finance prepares", async () => {
    await actAs(U.operation);
    expect(await create("TRANSFER", "1121", "1123", 10)).toEqual({ ok: false, detail: "not_finance" });
    await actAs(null);
    expect(await create("TRANSFER", "1121", "1123", 10)).toEqual({ ok: false, detail: "not_finance" });
  });

  it("refuses the wrong accounts and amounts", async () => {
    await actAs(U.preparer);
    expect(await create("TRANSFER", "1131", "1123", 10)).toEqual({ ok: false, detail: "from_account_refused" });
    expect(await create("TRANSFER", "1121", "1121", 10)).toEqual({ ok: false, detail: "same_account" });
    expect(await create("TRANSFER", "1121", "1123", 10, 1)).toEqual({ ok: false, detail: "fee_on_transfer" });
    expect(await create("TRANSFER", "1121", "2110", 10)).toEqual({ ok: false, detail: "to_account_refused" });
    expect(await create("CARD_PAYOUT", "1121", "1123", 10)).toEqual({ ok: false, detail: "from_account_refused" });
    expect(await create("CARD_PAYOUT", "1132", "1110", 10)).toEqual({ ok: false, detail: "to_account_refused" });
    expect(await create("CARD_PAYOUT", "1132", "1123", 10.005)).toEqual({ ok: false, detail: "amount_invalid" });
    expect(await create("CARD_PAYOUT", "1132", "1123", 10, -1)).toEqual({ ok: false, detail: "fee_invalid" });
  });

  it("a transfer posts only on approval, by someone else: Dr to, Cr from", async () => {
    await actAs(U.preparer);
    const made = await create("TRANSFER", "1121", "1123", 500);
    expect(made.ok).toBe(true);
    const id = (made as { value: string }).value;
    const row = (await q("select move_no, gl_entry_id from gl_money_moves where id = $1", [id])).rows[0];
    expect(row.move_no).toMatch(/^MM-\d{8}-\d{4}$/);
    expect(row.gl_entry_id).toBeNull();

    expect(await attempt("select public.gl_money_move_approve($1)", [id])).toEqual({ ok: false, detail: "not_finance_approver" });
    await actAs(U.other);
    expect(await attempt("select public.gl_money_move_approve($1)", [id])).toEqual({ ok: false, detail: "not_finance_approver" });

    await actAs(U.principal);
    expect((await attempt("select public.gl_money_move_approve($1)", [id])).ok).toBe(true);
    expect(await linesOf(id)).toEqual([
      { account_code: "1121", debit: 0, credit: 500 },
      { account_code: "1123", debit: 500, credit: 0 },
    ]);
    expect(await attempt("select public.gl_money_move_approve($1)", [id])).toEqual({ ok: false, detail: "money_move_not_prepared" });
  });

  it("the preparer cannot approve, even as the principal", async () => {
    await actAs(U.principal);
    const id = ((await create("TRANSFER", "1110", "1121", 20)) as { value: string }).value;
    expect(await attempt("select public.gl_money_move_approve($1)", [id])).toEqual({ ok: false, detail: "preparer_cannot_approve" });
  });

  it("a card payout posts Dr bank net, Dr 6500 fee, Cr holding gross; reversing posts it back", async () => {
    await actAs(U.preparer);
    const id = ((await create("CARD_PAYOUT", "1132", "1123", 97.5, 2.5)) as { value: string }).value;
    await actAs(U.principal);
    const entry = (await attempt("select public.gl_money_move_approve($1)", [id])) as { ok: true; value: string };
    expect(entry.ok).toBe(true);
    expect(await linesOf(id)).toEqual([
      { account_code: "1123", debit: 97.5, credit: 0 },
      { account_code: "1132", debit: 0, credit: 100 },
      { account_code: "6500", debit: 2.5, credit: 0 },
    ]);
    const src = await q("select source_type from gl_entries where id = $1", [entry.value]);
    expect(src.rows[0].source_type).toBe("CARD_PAYOUT");

    // finance without the approver duty may not reverse a posted move
    await actAs(U.preparer);
    expect(await attempt("select public.gl_money_move_reverse($1, 'wrong bank')", [id])).toEqual({ ok: false, detail: "not_finance_approver" });
    await actAs(U.principal);
    expect(await attempt("select public.gl_money_move_reverse($1, ' ')", [id])).toEqual({ ok: false, detail: "reason_missing" });
    expect((await attempt("select public.gl_money_move_reverse($1, 'wrong bank')", [id])).ok).toBe(true);
    const after = await q(
      `select m.status, (select sum(l.debit - l.credit)::float from gl_entry_lines l
                           where l.entry_id in (m.gl_entry_id, m.reversal_entry_id) and l.account_code = '1132') as holding
         from gl_money_moves m where m.id = $1`,
      [id],
    );
    expect(after.rows[0]).toEqual({ status: "reversed", holding: 0 });
    expect(await attempt("select public.gl_money_move_reverse($1, 'again')", [id])).toEqual({ ok: false, detail: "money_move_ended" });
  });

  it("a bank charge posts Dr 6500, Cr bank; a bank credit Dr bank, Cr 4900 (0537)", async () => {
    await actAs(U.preparer);
    expect(await create("BANK_CHARGE", "1131", "6500", 1)).toEqual({ ok: false, detail: "from_account_refused" });
    expect(await create("BANK_CHARGE", "1121", "6100", 1)).toEqual({ ok: false, detail: "to_account_refused" });
    expect(await create("BANK_CHARGE", "1121", "6500", 1, 0.5)).toEqual({ ok: false, detail: "fee_on_transfer" });
    expect(await create("BANK_CREDIT", "4000", "1121", 1)).toEqual({ ok: false, detail: "from_account_refused" });
    expect(await create("BANK_CREDIT", "4900", "1110", 1)).toEqual({ ok: false, detail: "to_account_refused" });
    const charge = ((await create("BANK_CHARGE", "1121", "6500", 0.5)) as { value: string }).value;
    const credit = ((await create("BANK_CREDIT", "4900", "1123", 3.21)) as { value: string }).value;
    await actAs(U.principal);
    const entry = (await attempt("select public.gl_money_move_approve($1)", [charge])) as { ok: true; value: string };
    expect(entry.ok).toBe(true);
    expect((await attempt("select public.gl_money_move_approve($1)", [credit])).ok).toBe(true);
    expect(await linesOf(charge)).toEqual([
      { account_code: "1121", debit: 0, credit: 0.5 },
      { account_code: "6500", debit: 0.5, credit: 0 },
    ]);
    expect(await linesOf(credit)).toEqual([
      { account_code: "1123", debit: 3.21, credit: 0 },
      { account_code: "4900", debit: 0, credit: 3.21 },
    ]);
    expect((await q("select source_type from gl_entries where id = $1", [entry.value])).rows[0].source_type).toBe("BANK_CHARGE");
    expect((await attempt("select public.gl_money_move_reverse($1, 'bank refunded it')", [charge])).ok).toBe(true);
  });

  it("a prepared move is cancelled by Finance with nothing posted, and is never deleted or edited", async () => {
    await actAs(U.preparer);
    const id = ((await create("TRANSFER", "1121", "1123", 5)) as { value: string }).value;
    expect((await attempt("select public.gl_money_move_reverse($1, 'typed twice')", [id])).ok).toBe(true);
    const row = (await q("select status, reversal_entry_id, gl_entry_id from gl_money_moves where id = $1", [id])).rows[0];
    expect(row).toEqual({ status: "cancelled", reversal_entry_id: null, gl_entry_id: null });
    expect(await attempt("delete from gl_money_moves where id = $1", [id])).toEqual({ ok: false, detail: "no_delete" });
    expect(await attempt("update gl_money_moves set amount = 6 where id = $1", [id])).toEqual({ ok: false, detail: "money_move_locked" });
  });

  it("the table is closed to direct writes and anon", async () => {
    const r = await q(`select has_table_privilege('authenticated', 'public.gl_money_moves', 'insert') as ins,
                              has_function_privilege('anon', 'public.gl_money_move_list()', 'execute') as anon_list`);
    expect(r.rows[0]).toEqual({ ins: false, anon_list: false });
  });
});
