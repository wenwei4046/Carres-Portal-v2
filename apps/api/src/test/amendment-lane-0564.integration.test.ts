import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0564 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN — the Sales
 * Order amendment lane, end to end, on a database nobody uses.
 *
 * Two rules meet here, and both are APPROVED / LOCKED (owner, 2026-09-22):
 *
 *   CUSTOMER AGREEMENT   "A change to the customer's actual agreement must
 *                         have a recorded, traceable basis for that customer's
 *                         acceptance before it takes effect... A manager's
 *                         statement or checkbox saying the customer agreed is
 *                         not sufficient by itself."
 *   THE WHOLE CHANGE     an approved amendment applies what was proposed - the
 *                         goods AND their configuration, the services, the
 *                         plan, the promised date and the header it was
 *                         computed from - as ONE new complete revision.
 *
 * Everything runs inside ONE transaction that is rolled back, so this writes
 * nothing that survives it, and it never touches production: the URL must be
 * local or every case is SKIPPED - reported as skipped, never as passed.
 *
 *   LC_ALL=C node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> \
 *     pnpm --filter @carres/api test -- amendment-lane-0564
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = (Date.now() % 100000).toString(16).padStart(5, "0");
const uid = (tail: string) => `dddddddd-0000-4000-8000-${RUN}${tail.padStart(7, "0")}`;
const U = { operation: uid("1"), principal: uid("2") };

describe.skipIf(!URL || !LOCAL)("0564 · the amendment carries the whole change, and only on recorded agreement", () => {
  let db: pg.Client;
  let orderId = "";
  let lineA = "";
  let lineB = "";
  let addonA = "";
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const actAs = (id: string | null) =>
    q("select set_config('request.jwt.claims', $1, false)", [id ? JSON.stringify({ sub: id, role: "authenticated" }) : ""]);
  const one = async (sql: string, params: unknown[] = []) => (await q(sql, params)).rows[0];
  /* `date` comes back as a Date at LOCAL midnight, so `toISOString` would move
     it a day west of Kuala Lumpur. Read the calendar day it actually is. */
  const ymd = (d: unknown) => (d instanceof Date ? d.toLocaleDateString("en-CA") : String(d).slice(0, 10));

  /** A call inside a savepoint: a refusal comes back as its detail code and
   *  nothing it wrote survives. */
  async function attempt(sql: string, params: unknown[] = []): Promise<{ ok: true; value: unknown } | { ok: false; detail: string }> {
    await q("savepoint s");
    try {
      const r = await q(sql, params);
      return { ok: true, value: r.rows[0] ? Object.values(r.rows[0])[0] : null };
    } catch (e) {
      await q("rollback to savepoint s");
      return { ok: false, detail: (e as { detail?: string }).detail ?? (e as Error).message };
    }
  }

  beforeAll(async () => {
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    for (const [id, email, name, role] of [
      [U.operation, "op@test.local", "Op", "operation"],
      [U.principal, "pr@test.local", "Pr", "principal"],
    ] as const) {
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status) values ($1,$2,$3,$4,'active')", [id, email, name, role]);
    }
    const dealer = await one("select id from dealers limit 1");
    /* A service on an order must exist in the catalogue (`order_addons.addon_key`
       -> `addons.key`), which is what makes "the complete service set" a real
       set rather than free text. */
    await q("insert into addons(key, name, price) values ('dispose-mattress','Dispose old mattress',80) on conflict do nothing");
    /* An order names who sold it (0296) - the constraint is the point, so the
       fixture satisfies it rather than working around it. */
    const sp = await one("insert into salespersons(dealer_id, name) values ($1,'Test Seller') returning id", [dealer.id]);
    const order = await one(
      `insert into orders(dealer_id, salesperson_id, customer_name, customer_phone, status, proceed_date, delivery_date, delivery_floor, delivery_has_lift)
       values ($1,$2,'TEST CUSTOMER','0100000000','proceed_order','2026-09-17','2026-10-26',1,false) returning id`,
      [dealer.id, sp.id],
    );
    orderId = order.id;
    lineA = (await one(
      `insert into order_lines(order_id, sku, qty, unit_price, attrs) values ($1,'TRION-Q',1,2749,'{"gap":"KIV"}'::jsonb) returning id`,
      [orderId],
    )).id;
    lineB = (await one(
      `insert into order_lines(order_id, sku, qty, unit_price) values ($1,'MEMORY-FOAM-PILLOW-asd',2,220) returning id`,
      [orderId],
    )).id;
    addonA = (await one(
      `insert into order_addons(order_id, addon_key, qty, unit_price) values ($1,'DELIVERY',1,250) returning id`,
      [orderId],
    )).id;
    await actAs(U.operation);
  });

  afterAll(async () => {
    if (db) {
      await q("rollback").catch(() => {});
      await db.end().catch(() => {});
    }
  });

  const proposal = () => ({
    header: { customer_phone: "0199999999", proceed_date: "2026-09-20" },
    base_header: { customer_phone: "0100000000", proceed_date: "2026-09-17" },
    lines: [
      { id: lineA, sku: "TRION-Q", qty: 1, unit_price: 2749, attrs: { gap: '6"' } },
      { id: lineB, sku: "MEMORY-FOAM-PILLOW-asd", qty: 1, unit_price: 220 },
    ],
    addons: [
      { id: addonA, addon_key: "DELIVERY", qty: 1, unit_price: 250 },
      { addon_key: "dispose-mattress", qty: 2, unit_price: 80 },
    ],
    delivery_date: "2026-11-02",
    installment_months: 12,
  });

  /** Mints a version the way the product does, and returns its number. */
  async function mintRevision(): Promise<number> {
    await actAs(U.operation);
    /* Inside its own savepoint: a refusal here (a live request already exists)
       must not poison the transaction every later case runs in. */
    await attempt("select public.sales_order_submit_amendment($1,'{\"delivery_date\":\"2026-12-01\"}'::jsonb,'mint a version',null)", [orderId]);
    const r = await one("select max(revision) as r from sales_order_revisions where order_id=$1", [orderId]);
    return Number(r.r);
  }

  async function submit(p: unknown = proposal()) {
    await actAs(U.operation);
    const r = await one("select public.sales_order_submit_amendment($1,$2::jsonb,$3,null) as a", [orderId, JSON.stringify(p), "Customer called"]);
    return r.a as { id: string; base_revision: number };
  }

  it("a submitted request changes NOTHING on the order", async () => {
    const a = await submit();
    expect(a.id).toBeTruthy();
    const o = await one("select customer_phone, proceed_date, delivery_date, installment_months from orders where id=$1", [orderId]);
    expect(o.customer_phone).toBe("0100000000");
    expect(ymd(o.delivery_date)).toBe("2026-10-26");
    expect(o.installment_months).toBeNull();
    const lines = await q("select qty from order_lines where order_id=$1 order by unit_price desc", [orderId]);
    expect(lines.rows.map((r) => r.qty)).toEqual([1, 2]);
  });

  it("APPROVE is refused while nothing on record shows the customer agreed", async () => {
    const a = await one("select id from sales_order_amendments where order_id=$1 and status='submitted'", [orderId]);
    await actAs(U.principal);
    const r = await attempt("select public.sales_order_decide_amendment($1,'approve','ok')", [a.id]);
    expect(r).toMatchObject({ ok: false, detail: "customer_agreement_required" });
  });

  it("a KIND with no pointer outside the record is refused — there is no tick box", async () => {
    const a = await one("select id from sales_order_amendments where order_id=$1 and status='submitted'", [orderId]);
    await actAs(U.operation);
    expect(await attempt("select public.sales_order_record_amendment_agreement($1,'customer_confirmation','  ')", [a.id]))
      .toMatchObject({ ok: false, detail: "agreement_reference_required" });
    expect(await attempt("select public.sales_order_record_amendment_agreement($1,'manager_said_so','anything')", [a.id]))
      .toMatchObject({ ok: false, detail: "agreement_kind_invalid" });
  });

  it("`original_agreement` must name a revision of THIS order", async () => {
    const a = await one("select id from sales_order_amendments where order_id=$1 and status='submitted'", [orderId]);
    await actAs(U.operation);
    expect(await attempt("select public.sales_order_record_amendment_agreement($1,'original_agreement','Rev 94')", [a.id]))
      .toMatchObject({ ok: false, detail: "agreement_revision_not_found" });
  });

  it("evidence recorded against DIFFERENT terms does not cover these ones", async () => {
    const a = await one("select id from sales_order_amendments where order_id=$1 and status='submitted'", [orderId]);
    await actAs(U.operation);
    await q("select public.sales_order_record_amendment_agreement($1,'customer_confirmation','WhatsApp 22 Sep 09:40')", [a.id]);
    /* No door edits a proposal after submit today; the guard is STRUCTURAL, so
       the terms are moved here directly to prove it fires. */
    await q("savepoint moved");
    await q("update sales_order_amendments set proposed_snapshot = proposed_snapshot || '{\"installment_months\":24}'::jsonb where id=$1", [a.id]);
    await actAs(U.principal);
    expect(await attempt("select public.sales_order_decide_amendment($1,'approve','ok')", [a.id]))
      .toMatchObject({ ok: false, detail: "customer_agreement_stale" });
    await q("rollback to savepoint moved");
  });

  it("a header value that MOVED since the proposal makes it stale, never a silent overwrite", async () => {
    const a = await one("select id from sales_order_amendments where order_id=$1 and status='submitted'", [orderId]);
    await q("savepoint moved_header");
    await q("update orders set customer_phone='0177777777' where id=$1", [orderId]);
    await actAs(U.principal);
    expect(await attempt("select public.sales_order_decide_amendment($1,'approve','ok')", [a.id]))
      .toMatchObject({ ok: false, detail: "amendment_stale" });
    await q("rollback to savepoint moved_header");
  });

  it("APPROVED, it applies the WHOLE change as one new revision", async () => {
    const a = await one("select id, base_revision from sales_order_amendments where order_id=$1 and status='submitted'", [orderId]);
    await actAs(U.principal);
    const out = await one("select public.sales_order_decide_amendment($1,'approve','Agreed by the customer') as r", [a.id]);
    expect(out.r.status).toBe("applied");

    const o = await one("select customer_phone, proceed_date, delivery_date, installment_months from orders where id=$1", [orderId]);
    expect(o.customer_phone).toBe("0199999999");                       // the header rode along
    expect(ymd(o.proceed_date)).toBe("2026-09-20");  // a recorded proceed date moves ONLY here
    expect(ymd(o.delivery_date)).toBe("2026-11-02"); // the promise
    expect(o.installment_months).toBe(12);                             // the plan

    const pillow = await one("select qty from order_lines where id=$1", [lineB]);
    expect(pillow.qty).toBe(1);                                        // the quantity
    const trion = await one("select attrs from order_lines where id=$1", [lineA]);
    expect(trion.attrs).toMatchObject({ gap: '6"' });                  // AND its configuration

    const addons = await q("select addon_key, qty from order_addons where order_id=$1 order by addon_key", [orderId]);
    expect(addons.rows).toEqual([                                      // the complete service set
      { addon_key: "DELIVERY", qty: 1 },
      { addon_key: "dispose-mattress", qty: 2 },
    ]);

    const rev = await one("select max(revision) as r from sales_order_revisions where order_id=$1", [orderId]);
    expect(Number(rev.r)).toBeGreaterThan(Number(a.base_revision));
    const hist = await one(
      "select metadata from order_history where order_id=$1 and metadata->>'kind'='amendment_applied' order by occurred_at desc limit 1",
      [orderId],
    );
    expect(hist.metadata.agreement_kind).toBe("customer_confirmation");
    expect(hist.metadata.agreement_reference).toBe("WhatsApp 22 Sep 09:40");
  });

  it("a recorded proceed date still refuses to move through the direct save", async () => {
    await actAs(U.operation);
    const r = await attempt("select public.sales_order_save_revision($1,'{\"proceed_date\":\"2026-09-25\"}'::jsonb,null,null)", [orderId]);
    expect(r).toMatchObject({ ok: false, detail: "proceed_date_recorded" });
  });

  it("a live request can be withdrawn, and the next proposal is no longer blocked", async () => {
    const live = await submit({ delivery_date: "2026-11-09" });
    await actAs(U.operation);
    expect(await attempt("select public.sales_order_submit_amendment($1,'{\"delivery_date\":\"2026-11-16\"}'::jsonb,'again',null)", [orderId]))
      .toMatchObject({ ok: false, detail: "amendment_exists" });
    await q("select public.sales_order_withdraw_amendment($1,'Out of date - proposed again')", [live.id]);
    const again = await attempt("select public.sales_order_submit_amendment($1,'{\"delivery_date\":\"2026-11-16\"}'::jsonb,'again',null)", [orderId]);
    expect(again.ok).toBe(true);
  });

  it("REJECT needs no customer agreement — refusing a change asks the customer nothing", async () => {
    const a = await one("select id from sales_order_amendments where order_id=$1 and status='submitted'", [orderId]);
    await actAs(U.principal);
    const r = await attempt("select public.sales_order_decide_amendment($1,'reject','Not this time')", [a.id]);
    expect(r.ok).toBe(true);
  });

  /* ── 0565 · AN ISSUED VERSION KEEPS ITS DOCUMENT ───────────────────────── */
  it("records the file a version was issued as — once, and never again", async () => {
    await actAs(U.operation);
    /* Self-sufficient: mint a version here rather than leaning on the order
       the cases above left behind, so this proves the recorder and nothing else. */
    const n = await mintRevision();
    const key = `sales-orders/${orderId}/rev-${n}.pdf`;
    const first = await attempt("select public.sales_order_record_revision_document($1,$2,$3,$4)", [orderId, n, key, 51234]);
    expect(first.ok ? "ok" : `refused: ${(first as { detail: string }).detail}`).toBe("ok");
    /* ⭐ BESIDE THE VERSION, NEVER ON IT. `sales_order_revisions` is immutable
       (`sales_order_revisions_no_rewrite`), which is how the first draft of
       0565 was caught: it tried to add a column to that row. */
    const row = await one("select path, stored_at, bytes from sales_order_revision_documents where order_id=$1 and revision=$2", [orderId, n]);
    expect(row.path).toBe(key);
    expect(row.stored_at).toBeTruthy();
    expect(row.bytes).toBe(51234);
    /* ⭐ IMMUTABLE. What the customer was shown does not change afterwards. */
    const again = await attempt("select public.sales_order_record_revision_document($1,$2,$3,null)", [orderId, n, key]);
    expect(again).toMatchObject({ ok: false, detail: "document_already_stored" });
  });

  it("refuses a path that belongs to another version, so a file cannot be misfiled", async () => {
    await actAs(U.operation);
    const n = await mintRevision();
    expect(await attempt("select public.sales_order_record_revision_document($1,$2,$3,null)", [orderId, n, `sales-orders/${orderId}/rev-99.pdf`]))
      .toMatchObject({ ok: false, detail: "document_path_mismatch" });
    expect(await attempt("select public.sales_order_record_revision_document($1,$2,'   ',null)", [orderId, n]))
      .toMatchObject({ ok: false, detail: "document_path_required" });
  });

  it("a legacy version keeps NULL — which is what makes it the reconstruction case", async () => {
    /* Rev 1 was minted long before any document was kept — exactly the shape
       of every version that existed before this release. */
    const row = await one(
      `select (select count(*)::int from sales_order_revisions where order_id=$1)                    as versions,
              (select count(*)::int from sales_order_revision_documents where order_id=$1)           as kept,
              (select count(*)::int from sales_order_revision_documents where order_id=$1 and revision=1) as rev1_kept`,
      [orderId],
    );
    expect(row.versions).toBeGreaterThan(row.kept);   // some version kept nothing
    expect(row.rev1_kept).toBe(0);                    // and the original is one of them
  });
});
