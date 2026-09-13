import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * THE OWNERSHIP CHAIN ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN
 * (0487 · 0489 · 0495 · 0498 · 0499):
 *
 *   authoritative normal responsibility → stable collection owner → cover →
 *   the one context read every surface uses → handover history.
 *
 * The committed doors run as committed. The contact writer is emulated the
 * way the Worker writes it (0499 `recordContact`): the normal and acting
 * persons come from `delivery_responsible_operation`, `recorded_by` is the
 * signed-in subject, `on_behalf_of_partner_id` is partner provenance.
 * Identities are impersonated through the request-claims GUC exactly as
 * PostgREST sets it. PREREQUISITE — a throwaway local cluster with the chain:
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- collection-owner-responsibility
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `bbbbbbbb-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const U = {
  shared: uid("1"), // the shared Operations role login — superuser, no staff_code
  shasha: uid("2"), // individual
  yujun: uid("3"), // individual
  principal: uid("4"), // principal — may hand over
};
const DEALER = uid("d1");
const SALES = uid("d2");
const ORDER = { a: uid("a1"), b: uid("a2"), c: uid("a3"), d: uid("a4") };

type Client = pg.Client;
const open: Client[] = [];
async function connect(): Promise<Client> {
  const c = new pg.Client({ connectionString: URL });
  await c.connect();
  open.push(c);
  return c;
}
async function actAs(c: Client, id: string) {
  await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, role: "authenticated" })]);
}
const detail = (e: unknown) => (e as { detail?: string })?.detail ?? "";
async function refusal(p: Promise<unknown>) {
  try { await p; return "NO REFUSAL"; } catch (e) { return detail(e); }
}
type Who = { normal_user_id: string | null; acting_user_id: string | null; source: string; is_cover: boolean };
const responsibility = (c: Client, order: string, on: string) =>
  c.query("select public.delivery_responsible_operation($1, $2::date) as r", [order, on]).then((r) => r.rows[0].r as Who);
/** The Worker's write (0499 recordContact): the pair from the read, the recorder as signed in. */
async function contact(c: Client, order: string, recorder: string, on: string, opts: { person?: "customer" | "partner"; partner?: string | null } = {}) {
  const who = await responsibility(c, order, on);
  const r = await c.query(
    `insert into ops_delivery_contacts (order_id, leg, purpose_key, channel, contacted_person, contact_owner_user_id, acting_user_id, contacted_at, result_key, on_behalf_of_partner_id, recorded_by)
     values ($1, 0, 'confirm_delivery_date', 'call', $2, $3, $4, ($5::date + interval '4 hours'), 'confirmed', $6, $7)
     returning contact_owner_user_id, acting_user_id, recorded_by, on_behalf_of_partner_id`,
    [order, opts.person ?? "customer", who.normal_user_id, who.acting_user_id, on, opts.partner ?? null, recorder],
  );
  return { ...r.rows[0], source: who.source };
}
const establish = (c: Client, orders: string[], on: string) =>
  c.query("select public.payment_collection_owner_establish($1::uuid[], $2::date) as r", [orders, on]).then((r) => r.rows[0].r);
const context = (c: Client, orders: string[], on: string) =>
  c.query("select public.payment_collection_owner_context($1::uuid[], $2::date) as r", [orders, on]).then((r) => r.rows[0].r as Array<Record<string, unknown>>);

describe.skipIf(!URL)("customer responsibility → collection owner → cover → context → handover (real PostgreSQL)", () => {
  let root: Client;
  const TODAY = "2026-09-14";

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    root = await connect();
    const q = (sql: string, params: unknown[] = []) => root.query(sql, params);
    const people: Array<[string, string, string, string | null, boolean, string]> = [
      [U.shared, "Operations (shared)", "operation", null, true, `it-shared-${RUN}@carres.test`],
      [U.shasha, "Shasha", "operation", `CR9${RUN % 10}5`, false, `it-shasha-${RUN}@carres.test`],
      [U.yujun, "Yu Jun", "operation", `CR9${RUN % 10}4`, false, `it-yujun-${RUN}@carres.test`],
      [U.principal, "Principal", "principal", `CR9${RUN % 10}1`, false, `it-principal-${RUN}@carres.test`],
    ];
    for (const [id, name, role, code, superuser, email] of people) {
      await q("insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing", [id, email]);
      await q(
        "insert into app_users (id, email, name, role, status, staff_code, operations_superuser) values ($1, $2, $3, $4, 'active', $5, $6) on conflict (id) do nothing",
        [id, email, name, role, code, superuser],
      );
    }
    await q("insert into dealers (id, name) values ($1, 'IT Dealer') on conflict (id) do nothing", [DEALER]);
    await q("insert into salespersons (id, dealer_id, name) values ($1, $2, 'IT Salesperson') on conflict (id) do nothing", [SALES, DEALER]);
    for (const [key, id] of Object.entries(ORDER)) {
      await q("insert into orders (id, dealer_id, salesperson_id, customer_name, customer_phone) values ($1, $2, $3, $4, '0100000000') on conflict (id) do nothing", [id, DEALER, SALES, `IT customer ${key} ${RUN}`]);
    }
    // the read is internal-only: every call below runs as a signed-in person
    await actAs(root, U.shared);
    // park any seeded delivery_duty rota so "nobody holds" is real
    await q("update workspace_duty_assignments set duty_key = 'delivery_duty__parked_by_it' where duty_key = 'delivery_duty'");
  });

  afterAll(async () => {
    for (const c of open) if (c !== root) await c.end().catch(() => undefined);
    const q = (sql: string, params: unknown[] = []) => root.query(sql, params).catch(() => undefined);
    const orders = Object.values(ORDER);
    await q("delete from payment_collection_owners where order_id = any($1)", [orders]);
    await q("delete from ops_delivery_contacts where order_id = any($1)", [orders]);
    await q("delete from workspace_duty_covers where normal_user_id = any($1) or acting_user_id = any($1)", [Object.values(U)]);
    await q("delete from workspace_duty_assignments where holder_id = any($1)", [Object.values(U)]);
    await q("update workspace_duty_assignments set duty_key = 'delivery_duty' where duty_key = 'delivery_duty__parked_by_it'");
    await q("delete from orders where id = any($1)", [orders]);
    await q("delete from salespersons where id = $1", [SALES]);
    await q("delete from dealers where id = $1", [DEALER]);
    await q("delete from app_users where id = any($1)", [Object.values(U)]);
    await q("delete from auth.users where id = any($1)", [Object.values(U)]);
    await root.end();
  }, 30000);

  it("a shared login records evidence but never becomes the owner: with nobody holding Delivery Duty the record lands with no owner and nothing is established", async () => {
    const row = await contact(root, ORDER.a, U.shared, TODAY);
    expect(row).toMatchObject({ contact_owner_user_id: null, acting_user_id: null, recorded_by: U.shared, source: "not_assigned" });
    const r = await establish(root, [ORDER.a], TODAY);
    expect(r).toMatchObject({ established: 0, unresolved: 1 });
    expect(await context(root, [ORDER.a], TODAY)).toEqual([]);
  });

  it("the configured Delivery Duty NORMAL holder is the responsible person on a contact the shared login records; Payment establishes that same person and never rotates it", async () => {
    await root.query("insert into workspace_duty_assignments (duty_key, holder_id, effective_from) values ('delivery_duty', $1, $2::date - 7)", [U.shasha, TODAY]);
    const row = await contact(root, ORDER.a, U.shared, TODAY);
    expect(row).toMatchObject({ contact_owner_user_id: U.shasha, acting_user_id: U.shasha, recorded_by: U.shared, source: "delivery_duty" });
    const r = await establish(root, [ORDER.a], TODAY);
    expect(r).toMatchObject({ established: 1, established_from_contact: 1, unresolved: 0 });
    const ctx = await context(root, [ORDER.a], TODAY);
    expect(ctx[0]).toMatchObject({ normal_user_id: U.shasha, acting_user_id: U.shasha, is_cover: false, source: "established" });
    // a later day, a later contact by someone else, a duty rotation, a reload — the owner does not rotate
    await root.query("update workspace_duty_assignments set effective_until = $1::date where holder_id = $2 and duty_key = 'delivery_duty'", ["2026-09-18", U.shasha]);
    await root.query("insert into workspace_duty_assignments (duty_key, holder_id, effective_from) values ('delivery_duty', $1, '2026-09-19')", [U.yujun]);
    await contact(root, ORDER.a, U.yujun, "2026-09-20");
    expect(await establish(root, [ORDER.a], "2026-09-20")).toMatchObject({ established: 0, kept: 1 });
    expect((await context(root, [ORDER.a], "2026-09-20"))[0]).toMatchObject({ normal_user_id: U.shasha });
    expect(await responsibility(root, ORDER.a, "2026-09-20")).toMatchObject({ normal_user_id: U.shasha, source: "established" });
  });

  it("cover: the buddy acts, the normal owner is preserved on the contact AND in Payment, and work returns when the cover ends", async () => {
    await root.query(
      "insert into workspace_duty_covers (duty_key, normal_user_id, acting_user_id, starts_on, ends_on, reason) values ('delivery_duty', $1, $2, $3::date, $3::date + 3, 'leave')",
      [U.shasha, U.yujun, TODAY],
    );
    // the cover records the contact herself — she acts, she is not the owner
    const row = await contact(root, ORDER.b, U.yujun, TODAY, { person: "partner" });
    expect(row).toMatchObject({ contact_owner_user_id: U.shasha, acting_user_id: U.yujun, recorded_by: U.yujun, source: "delivery_duty" });
    await establish(root, [ORDER.b], TODAY);
    expect((await context(root, [ORDER.b], TODAY))[0]).toMatchObject({ normal_user_id: U.shasha, cover_user_id: U.yujun, acting_user_id: U.yujun, is_cover: true });
    expect((await context(root, [ORDER.b], "2026-09-18"))[0]).toMatchObject({ normal_user_id: U.shasha, acting_user_id: U.shasha, is_cover: false });
    expect(await responsibility(root, ORDER.b, "2026-09-18")).toMatchObject({ normal_user_id: U.shasha, acting_user_id: U.shasha, is_cover: false });
  });

  it("an individual's own contact establishes her; a cover's contact in the same week never does — she is acting, never responsible", async () => {
    // Yu Jun holds the duty from 2026-09-19 (see above): her own contact on the 20th names her
    const own = await contact(root, ORDER.c, U.yujun, "2026-09-20");
    expect(own).toMatchObject({ contact_owner_user_id: U.yujun, acting_user_id: U.yujun, source: "delivery_duty" });
    expect(await establish(root, [ORDER.c], "2026-09-20")).toMatchObject({ established_from_contact: 1 });
    expect((await context(root, [ORDER.c], "2026-09-20"))[0]).toMatchObject({ normal_user_id: U.yujun });
    // a later contact by the shared login follows the established owner
    const later = await contact(root, ORDER.c, U.shared, "2026-09-21");
    expect(later).toMatchObject({ contact_owner_user_id: U.yujun, recorded_by: U.shared, source: "established" });
    // and on ORDER.b (owner Shasha) the cover's contact during the cover week is acting only
    const during = await contact(root, ORDER.b, U.yujun, "2026-09-15");
    expect(during).toMatchObject({ contact_owner_user_id: U.shasha, acting_user_id: U.yujun, source: "established" });
  });

  it("partner provenance rides with the record and never changes who is responsible", async () => {
    const partner = (await root.query("select id from delivery_partners limit 1")).rows[0]?.id as string | undefined;
    const row = await contact(root, ORDER.a, U.shared, "2026-09-22", { person: "partner", partner: partner ?? null });
    expect(row).toMatchObject({ contact_owner_user_id: U.shasha, recorded_by: U.shared, on_behalf_of_partner_id: partner ?? null });
  });

  it("a formal handover appends the new owner with its evidence; the history keeps both rows, Delivery's read follows, and an ordinary account cannot hand over", async () => {
    const pr = await connect();
    await actAs(pr, U.principal);
    expect(await refusal(pr.query("select public.payment_collection_owner_handover($1, $2, 'x', $3::date)", [ORDER.a, U.yujun, "2026-09-23"]))).toBe("reason_required");
    await pr.query("select public.payment_collection_owner_handover($1, $2, 'Shasha moves to Purchasing', $3::date)", [ORDER.a, U.yujun, "2026-09-23"]);
    const ctx = (await context(pr, [ORDER.a], "2026-09-23"))[0]!;
    expect(ctx).toMatchObject({ normal_user_id: U.yujun, source: "handover" });
    const history = ctx.history as Array<{ source: string; owner_user_id: string; previous_owner_user_id: string | null; changed_by: string | null }>;
    expect(history.map((h) => [h.source, h.owner_user_id, h.previous_owner_user_id, h.changed_by])).toEqual([
      ["established", U.shasha, null, null],
      ["handover", U.yujun, U.shasha, U.principal],
    ]);
    expect(await responsibility(root, ORDER.a, "2026-09-24")).toMatchObject({ normal_user_id: U.yujun, source: "handover" });
    const row = await contact(root, ORDER.a, U.shared, "2026-09-24");
    expect(row).toMatchObject({ contact_owner_user_id: U.yujun, recorded_by: U.shared });
    const op = await connect();
    await actAs(op, U.shasha);
    expect(await refusal(op.query("select public.payment_collection_owner_handover($1, $2, 'not mine to give', $3::date)", [ORDER.a, U.shasha, "2026-09-25"]))).not.toBe("NO REFUSAL");
    await op.end();
    await pr.end();
  });

  it("an order with no contact is established from the day's normal holder, and no contact anywhere names a shared login as owner", async () => {
    expect(await establish(root, [ORDER.d], "2026-09-20")).toMatchObject({ established_from_duty: 1 });
    expect((await context(root, [ORDER.d], "2026-09-20"))[0]).toMatchObject({ normal_user_id: U.yujun });
    const owners = await root.query(
      "select count(*)::int as n from ops_delivery_contacts c join app_users u on u.id = c.contact_owner_user_id where c.order_id = any($1) and u.staff_code is null",
      [Object.values(ORDER)],
    );
    expect(owners.rows[0].n).toBe(0);
  });
});
