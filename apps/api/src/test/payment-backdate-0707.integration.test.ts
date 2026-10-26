import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0707 ON A REAL POSTGRESQL RUNNING THE MIGRATION CHAIN: a payment whose paid
 * date is more than 14 days back waits for the Payment Approver, and counts
 * only once it is approved.
 *
 * Everything runs inside ONE transaction that is rolled back at the end.
 * Identities are impersonated through the request-claims GUC as PostgREST sets it.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- payment-backdate-0707
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `dddddddd-0707-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const U = {
  recorder: uid("1"), // operation, keys the payment
  approver: uid("2"), // operation, holds payment_approver in Staff & Duties
  principal: uid("3"),
  stranger: uid("4"), // a JWT with no app_users row
  finance: uid("5"),
};
const DEALER = uid("d1");
const SALES = uid("d2");
const ORDER = uid("e1");

describe.skipIf(!URL)("a backdated payment waits for the Payment Approver (real PostgreSQL, 0707)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const actAs = (id: string | null) =>
    q("select set_config('request.jwt.claims', $1, false)", [id ? JSON.stringify({ sub: id, role: "authenticated" }) : ""]);
  async function attempt(sql: string, params: unknown[] = []): Promise<{ ok: true; value: any } | { ok: false; detail: string }> {
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
  let today = "";
  const daysAgo = (n: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const record = (amount: number, paidOn: string, key: string) =>
    attempt(
      `select public.payment_record($1, $2, $3::date, 'cash', 'payment', null, null, null, null, true, $4, false)`,
      [ORDER, amount, paidOn, `${key}-${RUN}`],
    );
  const decide = (id: string, approve: boolean, reason: string | null = null, ack = false) =>
    attempt("select public.payment_backdate_decide($1, $2, $3, $4)", [id, approve, reason, ack]);
  const paid = () => q("select coalesce(paid, 0)::numeric as p from orders where id = $1", [ORDER]).then((r) => Number(r.rows[0].p));
  const payments = () => q("select count(*)::int as n from order_payments where order_id = $1", [ORDER]).then((r) => r.rows[0].n as number);

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    today = (await q("select timezone('Asia/Kuala_Lumpur', now())::date::text as d")).rows[0].d;
    // the ledger is not what this suite tests: it starts after every date used here
    await q("update gl_config set go_live_on = timezone('Asia/Kuala_Lumpur', now())::date + 1 where id");
    for (const [id, role] of [[U.recorder, "operation"], [U.approver, "operation"], [U.principal, "principal"], [U.finance, "finance"]] as const) {
      const email = `it-bd-${role}-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [
        id, email, `IT ${role} ${id.slice(-4)}`, role,
      ]);
    }
    await q("insert into auth.users (id, email) values ($1, $2)", [U.stranger, `it-bd-stranger-${RUN}@carres.test`]);
    await q("update workspace_duty_covers set duty_key = 'payment_approver_parked_by_it' where duty_key = 'payment_approver'");
    await q("update workspace_duty_assignments set duty_key = 'payment_approver_parked_by_it' where duty_key = 'payment_approver'");
    await q(
      "insert into workspace_duty_assignments (duty_key, holder_id, effective_from) values ('payment_approver', $1, timezone('Asia/Kuala_Lumpur', now())::date - 7)",
      [U.approver],
    );
    await q("insert into dealers (id, name) values ($1, 'IT Dealer')", [DEALER]);
    await q("insert into salespersons (id, dealer_id, name) values ($1, $2, 'IT Salesperson')", [SALES, DEALER]);
    await q("insert into orders (id, dealer_id, salesperson_id, customer_name, customer_phone) values ($1, $2, $3, 'IT customer', '0100000000')", [ORDER, DEALER, SALES]);
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("a paid date 14 days back is recorded at once; 15 days back waits and counts nothing", async () => {
    await actAs(U.recorder);
    const fourteen = await record(10, daysAgo(14), "k14");
    expect(fourteen.ok && fourteen.value.pending_approval).toBeFalsy();
    expect(await paid()).toBe(10);

    const r = await record(25, daysAgo(15), "k15");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pending_approval).toBe(true);
    expect(r.value.request.status).toBe("waiting");
    expect(await paid()).toBe(10);
    expect(await payments()).toBe(1);
    expect(Number((await q("select count(*) from payment_allocations where order_id = $1", [ORDER])).rows[0].count)).toBe(1);

    // the same key again is the same request, not a second one
    const again = await record(25, daysAgo(15), "k15");
    expect(again.ok && again.value.request.id).toBe(r.value.request.id);
    expect(Number((await q("select count(*) from payment_backdate_requests where order_id = $1", [ORDER])).rows[0].count)).toBe(1);
  });

  it("only the Payment Approver or a principal decides, never the requester, and a refusal needs a reason", async () => {
    await actAs(U.recorder);
    const id = (await record(30, daysAgo(20), "kwho")) as { ok: true; value: any };
    expect(await decide(id.value.request.id, true)).toEqual({ ok: false, detail: "not_payment_approver" });
    await actAs(U.stranger);
    expect(await decide(id.value.request.id, true)).toEqual({ ok: false, detail: "role_not_admitted" });
    expect(await record(30, daysAgo(20), "kstranger")).toEqual({ ok: false, detail: "not_operation" });
    await actAs(U.approver);
    expect(await decide(id.value.request.id, false, "  ")).toEqual({ ok: false, detail: "reason_required" });
    const refused = await decide(id.value.request.id, false, "slip is from another order");
    expect(refused.ok && refused.value.request.status).toBe("refused");
    expect(await decide(id.value.request.id, true)).toEqual({ ok: false, detail: "already_decided" });

    // a principal records an old payment directly, as the Houzs backdate
    // right does (mfg-sales-orders.ts:3915): no request, the money counts now
    await actAs(U.principal);
    const before = await paid();
    const direct = (await record(40, daysAgo(30), "kown")) as { ok: true; value: any };
    expect(direct.value.pending_approval).toBeFalsy();
    expect(await paid()).toBe(before + 40);

    // finance records an old payment directly too. Follows Houzs
    // backdateRequestNotify.ts:5-8 per Weisiang's ruling (2026-10-22): clear
    // Carres rules, implement Houzs (YH 2026-10-26, Q14).
    await actAs(U.finance);
    const fin = (await record(35, daysAgo(30), "kfinance")) as { ok: true; value: any };
    expect(fin.value.pending_approval).toBeFalsy();
    expect(await paid()).toBe(before + 75);

    // the approver keying an old payment still asks, and cannot decide it
    await actAs(U.approver);
    const own = (await record(45, daysAgo(30), "kapprover")) as { ok: true; value: any };
    expect(own.value.pending_approval).toBe(true);
    expect(await decide(own.value.request.id, true)).toEqual({ ok: false, detail: "own_request" });

    // a principal login that is not a person (shared or system) is not the
    // Payment Approver, as in payment_record and payment_void
    await actAs(U.recorder);
    const other = (await record(35, daysAgo(25), "knotperson")) as { ok: true; value: any };
    await actAs(null);
    await q("update app_users set is_person = false where id = $1", [U.principal]);
    await actAs(U.principal);
    expect(await decide(other.value.request.id, true)).toEqual({ ok: false, detail: "not_payment_approver" });
    await actAs(null);
    await q("update app_users set is_person = true where id = $1", [U.principal]);
  });

  it("approve records the payment once, on its paid date, and a retry answers the same payment", async () => {
    const before = await paid();
    await actAs(U.recorder);
    const r = (await record(50, daysAgo(40), "kok")) as { ok: true; value: any };
    expect(await paid()).toBe(before);

    await actAs(U.approver);
    const ok = await decide(r.value.request.id, true);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.value.request.status).toBe("approved");
    expect(ok.value.payment.paid_on).toBe(daysAgo(40));
    expect(ok.value.payment.source_metadata.backdate_requested_by).toBe(U.recorder);
    expect(await paid()).toBe(before + 50);

    await actAs(U.recorder);
    const retry = await record(50, daysAgo(40), "kok");
    expect(retry.ok && retry.value.already).toBe(true);
    expect(await paid()).toBe(before + 50);
    expect(Number((await q("select count(*) from order_payments where idempotency_key = $1", [`kok-${RUN}`])).rows[0].count)).toBe(1);
  });

  it("a likely duplicate found on the day of approval must be acknowledged", async () => {
    await actAs(U.recorder);
    const first = (await record(70, daysAgo(50), "kdup1")) as { ok: true; value: any };
    const second = (await record(70, daysAgo(50), "kdup2")) as { ok: true; value: any };
    await actAs(U.approver);
    expect((await decide(first.value.request.id, true)).ok).toBe(true);
    expect(await decide(second.value.request.id, true)).toEqual({ ok: false, detail: "possible_duplicate_payment" });
    expect((await decide(second.value.request.id, true, null, true)).ok).toBe(true);
  });
});
