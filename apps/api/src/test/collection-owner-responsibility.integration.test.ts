import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * THE OWNERSHIP CHAIN ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN
 * (0487 · 0489 · 0495 · 0498 · 0499):
 *
 *   authoritative normal responsibility → stable collection owner → cover →
 *   the one context read every surface uses → handover history.
 *
 * The committed doors run as committed; identities are impersonated through
 * the request-claims GUC exactly as PostgREST sets it. PREREQUISITE — a
 * throwaway local cluster with the chain applied:
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
  shasha: uid("2"), // individual, CR9x5
  yujun: uid("3"), // individual, CR9x4
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
/** The Worker's contact write (recorded_by = the signed-in subject; the supplied owner is only the recorder candidate). */
const contact = (c: Client, order: string, recorder: string, opts: { person?: "customer" | "partner"; partner?: string | null; at?: string } = {}) =>
  c.query(
    `insert into ops_delivery_contacts (order_id, leg, purpose_key, channel, contacted_person, contact_owner_user_id, contacted_at, result_key, on_behalf_of_partner_id, recorded_by)
     values ($1, 0, 'confirm_delivery_date', 'call', $2, $3, coalesce($4::timestamptz, now()), 'confirmed', $5, $3)
     returning contact_owner_user_id, acting_user_id, owner_basis, recorded_by, on_behalf_of_partner_id`,
    [order, opts.person ?? "customer", recorder, opts.at ?? null, opts.partner ?? null],
  ).then((r) => r.rows[0]);
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
  });

  afterAll(async () => {
    for (const c of open) if (c !== root) await c.end().catch(() => undefined);
    const q = (sql: string, params: unknown[] = []) => root.query(sql, params).catch(() => undefined);
    const orders = Object.values(ORDER);
    await q("delete from payment_collection_owners where order_id = any($1)", [orders]);
    await q("delete from ops_delivery_contacts where order_id = any($1)", [orders]);
    await q("delete from workspace_duty_covers where normal_user_id = any($1) or acting_user_id = any($1)", [Object.values(U)]);
    await q("delete from workspace_duty_assignments where holder_id = any($1)", [Object.values(U)]);
    await q("delete from orders where id = any($1)", [orders]);
    await q("delete from salespersons where id = $1", [SALES]);
    await q("delete from dealers where id = $1", [DEALER]);
    await q("delete from app_users where id = any($1)", [Object.values(U)]);
    await q("delete from auth.users where id = any($1)", [Object.values(U)]);
    await root.end();
  }, 30000);

  it("a shared login records evidence but never becomes the owner: with no Delivery Duty holder the record is kept, its owner unresolved, and nothing is established", async () => {
    // park any seeded delivery_duty rota so "nobody holds" is real
    await root.query("update workspace_duty_assignments set duty_key = 'delivery_duty__parked_by_it' where duty_key = 'delivery_duty'");
    const row = await contact(root, ORDER.a, U.shared);
    expect(row).toMatchObject({ contact_owner_user_id: null, acting_user_id: null, owner_basis: "unresolved", recorded_by: U.shared });
    const op = await connect();
    await actAs(op, U.shared);
    const r = await establish(op, [ORDER.a], TODAY);
    expect(r).toMatchObject({ established: 0, unresolved: 1, contacts_not_qualifying: 1 });
    expect(await context(op, [ORDER.a], TODAY)).toEqual([]);
    await op.end();
  });

  it("the configured Delivery Duty NORMAL holder is the responsible person for a contact the shared login records; Payment establishes the same person", async () => {
    await root.query("insert into workspace_duty_assignments (duty_key, holder_id, effective_from) values ('delivery_duty', $1, $2::date - 7)", [U.shasha, TODAY]);
    const row = await contact(root, ORDER.a, U.shared, { at: `${TODAY}T02:00:00Z` });
    expect(row).toMatchObject({ contact_owner_user_id: U.shasha, acting_user_id: U.shasha, owner_basis: "delivery_duty", recorded_by: U.shared });
    const op = await connect();
    await actAs(op, U.shared);
    const r = await establish(op, [ORDER.a], TODAY);
    expect(r).toMatchObject({ established: 1, established_from_contact: 1, unresolved: 0 });
    const ctx = await context(op, [ORDER.a], TODAY);
    expect(ctx[0]).toMatchObject({ normal_user_id: U.shasha, acting_user_id: U.shasha, is_cover: false, source: "established" });
    expect(String(ctx[0]!.history && (ctx[0]!.history as Array<{ reason: string }>)[0]!.reason)).toMatch(/responsible person recorded on this order/);
    // idempotent: a later day, a later contact by someone else, a reload — the owner does not rotate
    await contact(root, ORDER.a, U.yujun, { at: `${TODAY}T05:00:00Z` });
    const again = await establish(op, [ORDER.a], "2026-09-20");
    expect(again).toMatchObject({ established: 0, kept: 1 });
    expect((await context(op, [ORDER.a], "2026-09-20"))[0]).toMatchObject({ normal_user_id: U.shasha });
    await op.end();
  });

  it("cover: the buddy acts, the normal owner is preserved on the contact AND in Payment, and work returns when the cover ends", async () => {
    await root.query(
      "insert into workspace_duty_covers (duty_key, normal_user_id, acting_user_id, starts_on, ends_on, reason) values ('delivery_duty', $1, $2, $3::date, $3::date + 3, 'leave')",
      [U.shasha, U.yujun, TODAY],
    );
    // the cover records the contact herself — she acts, she is not the owner
    const row = await contact(root, ORDER.b, U.yujun, { at: `${TODAY}T03:00:00Z`, person: "partner", partner: null });
    expect(row).toMatchObject({ contact_owner_user_id: U.shasha, acting_user_id: U.yujun, owner_basis: "delivery_duty", recorded_by: U.yujun });
    const op = await connect();
    await actAs(op, U.yujun);
    await establish(op, [ORDER.b], TODAY);
    const during = (await context(op, [ORDER.b], TODAY))[0]!;
    expect(during).toMatchObject({ normal_user_id: U.shasha, cover_user_id: U.yujun, acting_user_id: U.yujun, is_cover: true });
    const after = (await context(op, [ORDER.b], "2026-09-20"))[0]!;
    expect(after).toMatchObject({ normal_user_id: U.shasha, acting_user_id: U.shasha, is_cover: false });
    await op.end();
  });

  it("an individual who makes the first contact when nobody holds Delivery Duty takes responsibility; a cover in the same position does not", async () => {
    await root.query("update workspace_duty_assignments set duty_key = 'delivery_duty__parked_by_it' where duty_key = 'delivery_duty'");
    // Yu Jun is covering Shasha this week — her contact must not make her the owner
    const covered = await contact(root, ORDER.c, U.yujun, { at: `${TODAY}T04:00:00Z` });
    expect(covered).toMatchObject({ contact_owner_user_id: null, owner_basis: "unresolved" });
    // a day after the cover ends, her own contact establishes her
    const own = await contact(root, ORDER.c, U.yujun, { at: `2026-09-19T04:00:00Z` });
    expect(own).toMatchObject({ contact_owner_user_id: U.yujun, acting_user_id: U.yujun, owner_basis: "recorder" });
    const op = await connect();
    await actAs(op, U.shared);
    const r = await establish(op, [ORDER.c], "2026-09-19");
    expect(r).toMatchObject({ established_from_contact: 1 });
    expect((await context(op, [ORDER.c], "2026-09-19"))[0]).toMatchObject({ normal_user_id: U.yujun });
    // and a later contact on that order by the shared login is owned by the established person, basis collection_owner
    const later = await contact(root, ORDER.c, U.shared, { at: `2026-09-21T04:00:00Z` });
    expect(later).toMatchObject({ contact_owner_user_id: U.yujun, owner_basis: "collection_owner", recorded_by: U.shared });
    await op.end();
    await root.query("update workspace_duty_assignments set duty_key = 'delivery_duty' where duty_key = 'delivery_duty__parked_by_it' and holder_id = $1", [U.shasha]);
  });

  it("partner provenance rides with the record and never changes who is responsible", async () => {
    const partner = (await root.query("select id from delivery_partners limit 1")).rows[0]?.id as string | undefined;
    const row = await contact(root, ORDER.a, U.shared, { person: "partner", partner: partner ?? null, at: `2026-09-22T04:00:00Z` });
    expect(row).toMatchObject({ contact_owner_user_id: U.shasha, owner_basis: "collection_owner", recorded_by: U.shared, on_behalf_of_partner_id: partner ?? null });
  });

  it("a formal handover appends the new owner with its evidence; the history keeps both rows and a later contact follows the new owner", async () => {
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
    const row = await contact(root, ORDER.a, U.shared, { at: `2026-09-24T04:00:00Z` });
    expect(row).toMatchObject({ contact_owner_user_id: U.yujun, owner_basis: "collection_owner" });
    // an ordinary operation account cannot hand over
    const op = await connect();
    await actAs(op, U.shasha);
    expect(await refusal(op.query("select public.payment_collection_owner_handover($1, $2, 'not mine to give', $3::date)", [ORDER.a, U.shasha, "2026-09-25"]))).not.toBe("NO REFUSAL");
    await op.end();
    await pr.end();
  });

  it("an order with no contact and a holder is established from the holder; the shared login supplied as owner is never written as one", async () => {
    const op = await connect();
    await actAs(op, U.shared);
    const r = await establish(op, [ORDER.d], TODAY);
    expect(r).toMatchObject({ established_from_duty: 1 });
    expect((await context(op, [ORDER.d], TODAY))[0]).toMatchObject({ normal_user_id: U.shasha });
    const owners = await root.query("select count(*)::int as n from ops_delivery_contacts where contact_owner_user_id = $1 or (contact_owner_user_id is not null and contact_owner_user_id in (select id from app_users where staff_code is null))", [U.shared]);
    expect(owners.rows[0].n).toBe(0);
    await op.end();
  });
});
