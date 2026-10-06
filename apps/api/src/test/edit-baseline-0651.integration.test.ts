import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { salesOrderEditBaseline } from "@carres/shared";

/**
 * 0651 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN — a whole-page
 * Sales Order commit carries the order the editor opened, and two editors
 * cannot silently overwrite one another (orders/MASTER §0.0, owner-approved
 * 2026-10-01: "conflict keeps the draft and exposes what changed").
 *
 * TWO CONNECTIONS, because the guarantee is about two people at once. The
 * fixtures are therefore COMMITTED (unique per run) to the throwaway database;
 * the URL must be local or every case is SKIPPED, never reported as passed.
 *
 *   LC_ALL=C node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> \
 *     pnpm --filter @carres/api test -- edit-baseline-0651
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = (Date.now() % 100000).toString(16).padStart(5, "0");
const uid = (tail: string) => `eeeeeeee-0651-4000-8000-${RUN}${tail.padStart(7, "0")}`;
const U = { ana: uid("1"), ben: uid("2"), finance: uid("3") };
const COMMIT = "select public.sales_order_commit_staff_change($1,$2::jsonb,$3,$4::jsonb,$5::jsonb,$6,$7::date,$8::jsonb,$9::uuid) as r";

type Outcome = { ok: true; value: Record<string, unknown> } | { ok: false; detail: string; code: string };

describe.skipIf(!URL || !LOCAL)("0651 · a commit carries the order the editor opened", () => {
  let setup: pg.Client; // committed fixtures and reads
  let ana: pg.Client;   // one editor
  let ben: pg.Client;   // her colleague
  let dealerId = "";
  let salespersonId = "";

  const actAs = (c: pg.Client, id: string) =>
    c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, role: "authenticated" })]);
  const one = async (sql: string, params: unknown[] = []) => (await setup.query(sql, params)).rows[0];

  /** What GET /:id answers as `editBaseline`: the rows as PostgREST serialises
   *  them (to_jsonb — numbers as JSON numbers) through the ONE shared builder,
   *  then the trip to the browser and back. */
  async function opened(orderId: string) {
    const o = await one("select to_jsonb(o) as o from orders o where id=$1", [orderId]);
    const l = await one("select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) as r from order_lines l where order_id=$1", [orderId]);
    const a = await one("select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) as r from order_addons a where order_id=$1", [orderId]);
    return JSON.parse(JSON.stringify(salesOrderEditBaseline(o.o, l.r, a.r)));
  }

  async function commit(c: pg.Client, orderId: string, args: {
    expected: unknown; action: "save" | "submit"; header?: unknown; proposed?: unknown; reason?: string;
    agreement?: unknown; replace?: string | null;
  }): Promise<Outcome> {
    try {
      const r = await c.query(COMMIT, [
        orderId, args.expected === undefined ? null : JSON.stringify(args.expected), args.action,
        args.header === undefined ? null : JSON.stringify(args.header),
        args.proposed === undefined ? null : JSON.stringify(args.proposed),
        args.reason ?? "test", null,
        args.agreement === undefined ? null : JSON.stringify(args.agreement), args.replace ?? null,
      ]);
      return { ok: true, value: r.rows[0].r };
    } catch (e) {
      const err = e as { detail?: string; code?: string; message: string };
      return { ok: false, detail: err.detail ?? err.message, code: err.code ?? "" };
    }
  }

  async function newOrder(over: { entry_data?: unknown; status?: string } = {}) {
    const o = await one(
      `insert into orders(dealer_id, salesperson_id, customer_name, customer_phone, customer_email, customer_birthday,
                          customer_emergency, status, proceed_date, delivery_date, delivery_floor, delivery_has_lift, entry_data, installment_months)
       values ($1,$2,'TEST CUSTOMER','0100000000','first@test.local','1990-01-02','Helper · 0111111111 · Parent',
               $3,'2026-09-17','2026-10-26',1,false,$4::jsonb,null) returning id`,
      [dealerId, salespersonId, over.status ?? "proceed_order", JSON.stringify(over.entry_data ?? { fields: { building_type: "Landed" } })],
    );
    await setup.query(
      `insert into order_lines(order_id, sku, qty, unit_price, attrs) values
         ($1,'TRION-Q',1,2749.50,'{"gap":"KIV","size":{"w":183,"l":190.5},"specials":[{"code":"Front Drawer"}]}'::jsonb),
         ($1,'MEMORY-FOAM-PILLOW-asd',2,220,null)`,
      [o.id],
    );
    await setup.query("insert into order_addons(order_id, addon_key, qty, unit_price, attrs) values ($1,'DELIVERY',1,250.00,null)", [o.id]);
    return o.id as string;
  }

  const phoneOf = async (id: string) => (await one("select customer_phone from orders where id=$1", [id])).customer_phone;
  const revisionsOf = async (id: string) => Number((await one("select count(*) as n from sales_order_revisions where order_id=$1", [id])).n);
  const liveRequests = async (id: string) =>
    (await setup.query("select id, status, customer_agreement_kind from sales_order_amendments where order_id=$1 order by submitted_at", [id])).rows;

  beforeAll(async () => {
    setup = new pg.Client({ connectionString: URL });
    ana = new pg.Client({ connectionString: URL });
    ben = new pg.Client({ connectionString: URL });
    await Promise.all([setup.connect(), ana.connect(), ben.connect()]);
    for (const [id, name, role] of [[U.ana, "Ana", "operation"], [U.ben, "Ben", "operation"], [U.finance, "Fin", "finance"]] as const) {
      await setup.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}-${RUN}@test.local`]);
      await setup.query("insert into app_users (id, email, name, role, status) values ($1,$2,$3,$4,'active')", [id, `${name}-${RUN}@test.local`, name, role]);
    }
    dealerId = (await one("select id from dealers limit 1")).id;
    salespersonId = (await one("insert into salespersons(dealer_id, name) values ($1,$2) returning id", [dealerId, `Seller ${RUN}`])).id;
    await actAs(ana, U.ana);
    await actAs(ben, U.ben);
  });

  afterAll(async () => {
    await Promise.all([setup, ana, ben].map((c) => c?.end().catch(() => {})));
  });

  it("the page's baseline IS the database's own copy — no false conflict, whatever the values", async () => {
    for (const entry of [{ fields: { building_type: "Landed", lift_note: "" } }, null, { fields: null }, { wizard: 1 }]) {
      const id = await newOrder({ entry_data: entry });
      const r = await one(
        "select public._sales_order_edit_baseline($1) = public._sales_order_edit_baseline_canonical($2::jsonb) as same",
        [id, JSON.stringify(await opened(id))],
      );
      expect(r.same).toBe(true);
    }
  });

  it("the same baseline commits: a correction is saved as before", async () => {
    const id = await newOrder();
    const before = await revisionsOf(id);
    const r = await commit(ana, id, { expected: await opened(id), action: "save", header: { customer_phone: "0122222222" }, reason: "New number" });
    expect(r.ok).toBe(true);
    expect(await phoneOf(id)).toBe("0122222222");
    expect(await revisionsOf(id)).toBeGreaterThan(before);
  });

  it("a colleague saved after Ana opened the page: Ana is refused and NOTHING of hers is written", async () => {
    const id = await newOrder();
    const anaOpened = await opened(id);
    const benOpened = await opened(id);
    expect((await commit(ben, id, { expected: benOpened, action: "save", header: { customer_address: "No 9 Jalan Baru" } })).ok).toBe(true);
    const revs = await revisionsOf(id);
    const r = await commit(ana, id, { expected: anaOpened, action: "save", header: { customer_phone: "0133333333" } });
    expect(r).toMatchObject({ ok: false, detail: "order_edit_stale" });
    expect(await phoneOf(id)).toBe("0100000000");
    expect((await one("select customer_address from orders where id=$1", [id])).customer_address).toBe("No 9 Jalan Baru");
    expect(await revisionsOf(id)).toBe(revs);
  });

  it("TWO CONNECTIONS AT ONCE: the second commit waits for the first, then is refused — never a silent overwrite", async () => {
    const id = await newOrder();
    const both = await opened(id);
    await ana.query("begin");
    expect((await commit(ana, id, { expected: both, action: "save", header: { customer_phone: "0144444444" } })).ok).toBe(true);
    let settled = false;
    const benTry = commit(ben, id, { expected: both, action: "save", header: { customer_email: "ben@test.local" } })
      .then((r) => { settled = true; return r; });
    await new Promise((res) => setTimeout(res, 400));
    expect(settled).toBe(false); // Ben waits on the order's lock
    await ana.query("commit");
    expect(await benTry).toMatchObject({ ok: false, detail: "order_edit_stale" });
    expect(await phoneOf(id)).toBe("0144444444");
    expect((await one("select customer_email from orders where id=$1", [id])).customer_email).toBe("first@test.local");
  });

  it("an unrelated order is not held up while another is being committed", async () => {
    const busy = await newOrder();
    const other = await newOrder();
    const otherOpened = await opened(other);
    await ana.query("begin");
    expect((await commit(ana, busy, { expected: await opened(busy), action: "save", header: { customer_phone: "0155555555" } })).ok).toBe(true);
    await ben.query("set statement_timeout = '2s'");
    const r = await commit(ben, other, { expected: otherOpened, action: "save", header: { customer_phone: "0166666666" } });
    await ben.query("reset statement_timeout");
    await ana.query("rollback");
    expect(r.ok).toBe(true);
    expect(await phoneOf(other)).toBe("0166666666");
    expect(await phoneOf(busy)).toBe("0100000000");
  });

  it("an amendment request computed from an older order is refused before it is sent", async () => {
    const id = await newOrder();
    const anaOpened = await opened(id);
    expect((await commit(ben, id, { expected: await opened(id), action: "save", header: { customer_name: "TEST CUSTOMER TAN" } })).ok).toBe(true);
    const r = await commit(ana, id, { expected: anaOpened, action: "submit", proposed: { delivery_date: "2026-11-02" }, reason: "Customer moved" });
    expect(r).toMatchObject({ ok: false, detail: "order_edit_stale" });
    expect(await liveRequests(id)).toEqual([]);
  });

  it("the same baseline sends the request; a refused agreement leaves the request recorded, as before", async () => {
    const id = await newOrder();
    const r = await commit(ana, id, {
      expected: await opened(id), action: "submit", proposed: { delivery_date: "2026-11-02" }, reason: "Customer moved",
      agreement: { kind: "original_agreement", reference: "Rev 999", detail: null },
    });
    expect(r.ok).toBe(true);
    expect((r as { value: Record<string, unknown> }).value).toMatchObject({ status: "submitted", agreement_recorded: false });
    expect(await liveRequests(id)).toEqual([expect.objectContaining({ status: "submitted", customer_agreement_kind: null })]);
    /* The order itself is unchanged until the request takes effect (0564). */
    const o = await one("select delivery_date::text as d from orders where id=$1", [id]);
    expect(o.d).toBe("2026-10-26");
  });

  it("a recorded agreement rides in the same transaction", async () => {
    const id = await newOrder();
    const r = await commit(ana, id, {
      expected: await opened(id), action: "submit", proposed: { delivery_date: "2026-11-09" }, reason: "Customer moved",
      agreement: { kind: "customer_confirmation", reference: "WhatsApp 6 Oct 10:15", detail: null },
    });
    expect((r as { value: Record<string, unknown> }).value).toMatchObject({ agreement_recorded: true });
    expect(await liveRequests(id)).toEqual([expect.objectContaining({ customer_agreement_kind: "customer_confirmation" })]);
  });

  it("proposing again over an out-of-date request withdraws it and sends the new one — and a refusal keeps the old one", async () => {
    const id = await newOrder();
    const first = await commit(ana, id, { expected: await opened(id), action: "submit", proposed: { delivery_date: "2026-11-02" } });
    const firstId = (first as { value: { id: string } }).value.id;
    /* The order moves under the request (a fixture write, as 0564's own test
       does), so the request is out of date. */
    await setup.query("update orders set delivery_date='2026-10-30' where id=$1", [id]);
    const staleCopy = { ...(await opened(id)), installment_months: 6 };
    const refused = await commit(ana, id, { expected: staleCopy, action: "submit", proposed: { delivery_date: "2026-11-16" }, replace: firstId });
    expect(refused).toMatchObject({ ok: false, detail: "order_edit_stale" });
    expect((await liveRequests(id)).map((a) => a.status)).toEqual(["submitted"]); // nothing was withdrawn
    const again = await commit(ana, id, { expected: await opened(id), action: "submit", proposed: { delivery_date: "2026-11-16" }, replace: firstId });
    expect(again.ok).toBe(true);
    expect((await liveRequests(id)).map((a) => a.status)).toEqual(["withdrawn", "submitted"]);
  });

  it("a commit that names no baseline is refused as changed", async () => {
    const id = await newOrder();
    expect(await commit(ana, id, { expected: undefined, action: "save", header: { customer_phone: "0177777777" } }))
      .toMatchObject({ ok: false, detail: "order_edit_stale" });
    expect(await phoneOf(id)).toBe("0100000000");
  });

  it("who may commit is unchanged: a role the writers refuse is refused here first", async () => {
    const id = await newOrder();
    const fin = new pg.Client({ connectionString: URL });
    await fin.connect();
    await actAs(fin, U.finance);
    const r = await commit(fin, id, { expected: await opened(id), action: "save", header: { customer_phone: "0188888888" } });
    await fin.end();
    expect(r).toMatchObject({ ok: false, code: "42501" });
    expect(await phoneOf(id)).toBe("0100000000");
  });
});
