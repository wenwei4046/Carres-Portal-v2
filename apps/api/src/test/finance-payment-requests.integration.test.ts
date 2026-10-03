import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { paymentRequestStage, type PaymentRequestRow } from "@carres/shared/payment-requests";

/**
 * 0645 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: staff ask
 * Finance to pay a bill (Chew 2026-10-03, docs/finance/MASTER.md §3.3). The
 * boss allows a member of Operation; they raise a request with the bill;
 * Finance answers it with a voucher; the stage follows the voucher; a
 * cancelled answer goes back to Finance; a returned request comes back.
 *
 * One transaction, rolled back at the end. Names are invented.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- finance-payment-requests
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `abababab-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { boss: uid("1"), finance: uid("2"), aina: uid("3"), boon: uid("4") };

describe.skipIf(!URL)("payment requests (real PostgreSQL, 0645)", () => {
  let db: pg.Client;
  let requestId = "";
  let voucherId = "";
  let expense = "";
  let bank = "";
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
  const raise = (as: string, payee = "Bayview Properties") => {
    return actAs(as).then(() => attempt(
      "select public.payment_request_save(null, $1, 3500.00, 'October rent, PJ showroom', null, null, 'Maybank', '514012345678', 'Bayview Properties Sdn Bhd', 'BV-1007', date '2026-10-01') as id",
      [payee]));
  };
  const doc = async (as: string) => {
    await actAs(as);
    return (await q("select public.payment_request_document($1) as d", [requestId])).rows[0].d as {
      request: PaymentRequestRow; can: Record<string, boolean>;
    };
  };
  const attachBill = async (as: string) => {
    const path = `${requestId}/${(await q("select gen_random_uuid() as id")).rows[0].id}.pdf`;
    await q("insert into storage.objects (bucket_id, name) values ('payment-request-files', $1)", [path]);
    await actAs(as);
    return attempt("select public.payment_request_file_add($1, $2, 'bv-1007.pdf', 'application/pdf', 1024)", [requestId, path]);
  };

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    for (const [id, role, name] of [[U.boss, "principal", "IT Boss"], [U.finance, "finance", "IT Finance"],
                                     [U.aina, "operation", "IT Aina"], [U.boon, "operation", "IT Boon"]] as const) {
      const email = `it-prq-${role}-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, name, role]);
    }
    await q("update gl_config set go_live_on = coalesce(go_live_on, date '2026-01-01') where id");
    const acct = (await q(`
      select (select a.code from gl_accounts a where a.is_active and not a.is_control and a.kind = 'EXPENSE'
                and not public.ap_account_is_money(a.code) and not a.is_heading order by a.code limit 1) as expense,
             (select m.account_code from gl_money_accounts m where m.money_kind = 'BANK' and m.is_active order by m.account_code limit 1) as bank`)).rows[0];
    ({ expense, bank } = acct);
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("Finance or the boss allows a member of Operation to ask (0648); Finance may always ask", async () => {
    expect(await raise(U.aina)).toEqual({ ok: false, detail: "not_allowed_to_request" });
    // A member of Operation cannot allow anyone, not even with a grant of their own.
    await actAs(U.boon);
    expect(await attempt("select public.finance_request_grant_set($1, true)", [U.aina])).toEqual({ ok: false, detail: "may_not_grant" });
    await actAs(U.finance);
    expect((await q("select public.payment_request_me() as m")).rows[0].m).toMatchObject({ finance: true, may_grant: true });
    expect((await attempt("select public.finance_request_grant_set($1, true)", [U.aina])).ok).toBe(true);
    expect(await attempt("select public.finance_request_grant_set($1, true)", [U.finance])).toEqual({ ok: false, detail: "not_grantable" });
    // The boss still may, and each act names who did it.
    await actAs(U.boss);
    expect((await attempt("select public.finance_request_grant_set($1, true)", [U.boon])).ok).toBe(true);
    expect((await attempt("select public.finance_request_grant_set($1, false)", [U.boon])).ok).toBe(true);
    expect((await q("select granted_by, revoked_by from finance_request_grants where user_id = $1", [U.boon])).rows)
      .toEqual([{ granted_by: U.boss, revoked_by: U.boss }]);
    expect((await q("select granted_by from finance_request_grants where user_id = $1 and revoked_at is null", [U.aina])).rows)
      .toEqual([{ granted_by: U.finance }]);
    await actAs(U.finance);
    const list = (await q("select public.finance_request_grant_list() as l")).rows[0].l as Array<{ user_id: string; allowed: boolean }>;
    expect(list.find((x) => x.user_id === U.aina)?.allowed).toBe(true);
    expect(list.find((x) => x.user_id === U.boon)?.allowed).toBe(false);
    await actAs(U.aina);
    expect((await q("select public.payment_request_me() as m")).rows[0].m).toEqual({ may_request: true, finance: false, boss: false, may_grant: false });
  });

  it("the person allowed raises a request with a number; nobody else of Operation can open it", async () => {
    const saved = await raise(U.aina);
    expect(saved.ok, JSON.stringify(saved)).toBe(true);
    requestId = (saved as { value: string }).value;
    const d = await doc(U.aina);
    expect(d.request).toMatchObject({ status: "submitted", payee_name: "Bayview Properties", bill_no: "BV-1007", file_count: 0 });
    expect(d.request.request_no).toMatch(/^PRQ/);
    expect(d.can).toMatchObject({ edit: true, withdraw: true, add_file: true, return: false, answer: false });
    await actAs(U.boon);
    expect(await attempt("select public.payment_request_document($1)", [requestId])).toEqual({ ok: false, detail: "request_missing" });
    expect(await attempt("select public.payment_request_withdraw($1)", [requestId])).toEqual({ ok: false, detail: "request_missing" });
    await actAs(U.aina);
    expect((await q("select jsonb_array_length(public.payment_request_register(true)) as n")).rows[0].n).toBe(1);
  });

  it("Finance cannot answer until the bill is attached", async () => {
    await actAs(U.finance);
    voucherId = (await q(`select public.payment_voucher_save_draft(null, 'DIRECT', null, 'Bayview Properties', current_date, $1,
        jsonb_build_array(jsonb_build_object('account_code', $2::text, 'description', 'October rent', 'amount', 3500, 'department_type', 'OFFICE')),
        '[]'::jsonb, 'BANK_TRANSFER', null, 'Payment request') as id`, [bank, expense])).rows[0].id;
    expect(await attempt("select public.payment_request_answer($1, $2, null)", [requestId, voucherId]))
      .toEqual({ ok: false, detail: "request_no_bill" });
    const attached = await attachBill(U.aina);
    expect(attached.ok, JSON.stringify(attached)).toBe(true);
    expect((await doc(U.finance)).can).toMatchObject({ return: true, answer: true });
  });

  it("answered by a voucher, the stage follows the voucher and the request is locked", async () => {
    await actAs(U.finance);
    expect((await attempt("select public.payment_request_answer($1, $2, null)", [requestId, voucherId])).ok).toBe(true);
    const d = await doc(U.aina);
    expect(paymentRequestStage(d.request)).toBe("preparing");
    expect(d.can).toMatchObject({ edit: false, withdraw: false });
    await actAs(U.aina);
    expect(await attempt("select public.payment_request_withdraw($1)", [requestId])).toEqual({ ok: false, detail: "request_answered" });
    await actAs(U.finance);
    expect(await attempt("select public.payment_request_return($1, 'x')", [requestId])).toEqual({ ok: false, detail: "request_not_returnable" });
  });

  it("a cancelled voucher sends it back to Finance, who returns it; the requester changes it and it goes back", async () => {
    await actAs(U.finance);
    expect((await attempt("select public.payment_voucher_cancel($1, 'Wrong account')", [voucherId])).ok).toBe(true);
    expect(paymentRequestStage((await doc(U.aina)).request)).toBe("answer_cancelled");
    await actAs(U.finance);
    expect(await attempt("select public.payment_request_return($1, $2)", [requestId, "\t"])).toEqual({ ok: false, detail: "note_missing" });
    expect((await attempt("select public.payment_request_return($1, 'Attach the official invoice, not the quotation')", [requestId])).ok).toBe(true);
    let d = await doc(U.aina);
    expect(d.request).toMatchObject({ status: "returned", return_note: "Attach the official invoice, not the quotation" });
    expect(d.can.edit).toBe(true);
    await actAs(U.aina);
    expect((await attempt(
      "select public.payment_request_save($1, 'Bayview Properties', 3500.00, 'October rent, PJ showroom', null, 'Official invoice attached')", [requestId])).ok).toBe(true);
    d = await doc(U.aina);
    expect(d.request.status).toBe("submitted");
    await actAs(U.aina);
    const events = (await q("select public.payment_request_document($1) -> 'events' as e", [requestId])).rows[0].e as Array<{ action: string }>;
    expect(events.map((e) => e.action)).toEqual(["submitted", "file_added", "answered", "returned", "resubmitted"]);
  });

  it("a withdrawn request takes no answer and no file", async () => {
    await actAs(U.aina);
    expect((await attempt("select public.payment_request_withdraw($1)", [requestId])).ok).toBe(true);
    expect((await q("select public.payment_request_may_attach($1) as v", [requestId])).rows[0].v).toBe(false);
    await actAs(U.finance);
    expect(await attempt("select public.payment_request_answer($1, $2, null)", [requestId, voucherId])).toEqual({ ok: false, detail: "request_closed" });
  });

  it("taking the permission back stops new requests, and the old ones stay readable", async () => {
    await actAs(U.boss);
    expect((await attempt("select public.finance_request_grant_set($1, false)", [U.aina])).ok).toBe(true);
    expect(await raise(U.aina)).toEqual({ ok: false, detail: "not_allowed_to_request" });
    expect((await doc(U.aina)).request.status).toBe("withdrawn");
    const grants = (await q("select count(*)::int as n from finance_request_grants where user_id = $1", [U.aina])).rows[0].n;
    expect(grants).toBe(1); // the grant is kept, taken back, never deleted
  });
});
