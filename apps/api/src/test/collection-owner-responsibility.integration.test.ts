import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * THE OWNERSHIP CHAIN ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN
 * (0487 · 0489 · 0495 · 0498 · 0499 · 0504):
 *
 *   the Sales Order is dealt to an individual → that individual is the
 *   responsible Operation person → the collection owner → cover when she is
 *   away → the one context read every surface uses → handover history.
 *
 * 0504 replaced the two inferences this file used to prove. Contact history
 * and the Delivery Duty holder are NOT owner sources any more (owner ruling
 * 2026-09-13); the owner is the person the order was DEALT to, and the cases
 * below prove both halves — what now resolves, and what is now refused.
 *
 * The committed doors run as committed. The contact writer is emulated the
 * way the Worker writes it (`recordContact`): the normal and acting persons
 * come from `delivery_responsible_operation`, `recorded_by` is the signed-in
 * subject, `on_behalf_of_partner_id` is partner provenance. Identities are
 * impersonated through the request-claims GUC exactly as PostgREST sets it.
 * PREREQUISITE — a throwaway local cluster with the chain:
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
  shared: uid("1"), // the shared Operations role login — superuser, NO staff_code
  shasha: uid("2"), // individual
  yujun: uid("3"), // individual
  principal: uid("4"), // principal — may hand over
};
const DEALER = uid("d1");
const SALES = uid("d2");
const ORDER = { a: uid("a1"), b: uid("a2"), c: uid("a3"), d: uid("a4"), e: uid("a5") };

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
type Who = {
  normal_user_id: string | null; acting_user_id: string | null;
  source: string; is_cover: boolean; cover_reason: string | null;
};
const responsibility = (c: Client, order: string, on: string) =>
  c.query("select public.delivery_responsible_operation($1, $2::date) as r", [order, on]).then((r) => r.rows[0].r as Who);
/** The Worker's write (`recordContact`): the pair from the read, the recorder as signed in. */
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

describe.skipIf(!URL)("the order's assigned person → collection owner → cover → context → handover (real PostgreSQL)", () => {
  let root: Client;
  /** Presence and automatic cover are facts about TODAY, so the clock is the
   *  machine's — MYT, like every date in the portal. */
  let TODAY = "";
  const plus = (days: number) => {
    const d = new Date(`${TODAY}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  /** Deal an order the way the sweep does (assigned_by null = system) or the
   *  way management does (assigned_by set). */
  const deal = (order: string, to: string | null, by: string | null = null) =>
    root.query(
      `insert into ops_order_control (order_id, assigned_staff, assigned_by, assigned_at)
       values ($1, $2, $3, now())
       on conflict (order_id) do update
         set assigned_staff = excluded.assigned_staff, assigned_by = excluded.assigned_by, assigned_at = excluded.assigned_at`,
      [order, to, by],
    );
  const assignedStaff = (order: string) =>
    root.query("select assigned_staff from ops_order_control where order_id = $1", [order])
      .then((r) => (r.rows[0]?.assigned_staff as string | null) ?? null);

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    root = await connect();
    const q = (sql: string, params: unknown[] = []) => root.query(sql, params);
    TODAY = (await q("select (timezone('Asia/Kuala_Lumpur', now()))::date::text as d")).rows[0].d as string;
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
    // Both individuals are in the assignment pool and have opened the portal
    // today, so presence never depends on the hour the suite happens to run.
    for (const id of [U.shasha, U.yujun]) {
      await q("insert into ops_staff_settings (user_id, available) values ($1, true) on conflict (user_id) do update set available = true", [id]);
      await q("update app_users set last_seen_at = now() where id = $1", [id]);
    }
    await q("insert into dealers (id, name) values ($1, 'IT Dealer') on conflict (id) do nothing", [DEALER]);
    await q("insert into salespersons (id, dealer_id, name) values ($1, $2, 'IT Salesperson') on conflict (id) do nothing", [SALES, DEALER]);
    for (const [key, id] of Object.entries(ORDER)) {
      await q("insert into orders (id, dealer_id, salesperson_id, customer_name, customer_phone) values ($1, $2, $3, $4, '0100000000') on conflict (id) do nothing", [id, DEALER, SALES, `IT customer ${key} ${RUN}`]);
    }
    // the read is internal-only: every call below runs as a signed-in person
    await actAs(root, U.shared);
    // park any seeded delivery_duty rota so the duty genuinely has no holder
    await q("update workspace_duty_assignments set duty_key = 'delivery_duty__parked_by_it' where duty_key = 'delivery_duty'");
  });

  afterAll(async () => {
    for (const c of open) if (c !== root) await c.end().catch(() => undefined);
    const q = (sql: string, params: unknown[] = []) => root.query(sql, params).catch(() => undefined);
    const orders = Object.values(ORDER);
    await q("delete from ops_delivery_contacts where order_id = any($1)", [orders]);
    await q("delete from ops_order_control where order_id = any($1)", [orders]);
    await q("delete from payment_collection_owners where order_id = any($1)", [orders]);
    await q("delete from workspace_duty_covers where normal_user_id = any($1) or acting_user_id = any($1)", [Object.values(U)]);
    await q("delete from workspace_duty_assignments where holder_id = any($1)", [Object.values(U)]);
    await q("update workspace_duty_assignments set duty_key = 'delivery_duty' where duty_key = 'delivery_duty__parked_by_it'");
    await q("delete from orders where id = any($1)", [orders]);
    await q("delete from salespersons where id = $1", [SALES]);
    await q("delete from dealers where id = $1", [DEALER]);
    await q("delete from ops_staff_settings where user_id = any($1)", [Object.values(U)]);
    await q("delete from app_users where id = any($1)", [Object.values(U)]);
    await q("delete from auth.users where id = any($1)", [Object.values(U)]);
    await root.end();
  }, 30000);

  it("an order nobody was dealt to has no responsible person: the shared login records evidence and establishes nobody", async () => {
    const row = await contact(root, ORDER.a, U.shared, TODAY);
    expect(row).toMatchObject({ contact_owner_user_id: null, acting_user_id: null, recorded_by: U.shared, source: "not_assigned" });
    expect(await establish(root, [ORDER.a], TODAY)).toMatchObject({ established: 0, unresolved: 1 });
    expect(await context(root, [ORDER.a], TODAY)).toEqual([]);
  });

  it("the Delivery Duty holder is NOT an owner source — configuring one changes nothing (owner ruling 2026-09-13)", async () => {
    await root.query("insert into workspace_duty_assignments (duty_key, holder_id, effective_from) values ('delivery_duty', $1, $2::date - 7)", [U.yujun, TODAY]);
    expect(await responsibility(root, ORDER.a, TODAY)).toMatchObject({ normal_user_id: null, source: "not_assigned" });
    expect(await establish(root, [ORDER.a], TODAY)).toMatchObject({ established: 0, unresolved: 1 });
  });

  it("contact history is NOT an owner source — a contact naming a person establishes nobody", async () => {
    // write the inference the old law made: a real individual on the contact
    await root.query(
      `insert into ops_delivery_contacts (order_id, leg, purpose_key, channel, contacted_person, contact_owner_user_id, contacted_at, result_key, recorded_by)
       values ($1, 0, 'confirm_delivery_date', 'call', 'customer', $2, now(), 'confirmed', $3)`,
      [ORDER.b, U.shasha, U.shared],
    );
    expect(await responsibility(root, ORDER.b, TODAY)).toMatchObject({ normal_user_id: null, source: "not_assigned" });
    expect(await establish(root, [ORDER.b], TODAY)).toMatchObject({ established: 0, unresolved: 1 });
  });

  it("a shared login may stand in the assignment column and still never owns", async () => {
    await deal(ORDER.c, U.shared);
    expect(await responsibility(root, ORDER.c, TODAY)).toMatchObject({ normal_user_id: null, source: "not_assigned" });
    expect(await establish(root, [ORDER.c], TODAY)).toMatchObject({ established: 0, unresolved: 1 });
    expect(await context(root, [ORDER.c], TODAY)).toEqual([]);
  });

  it("the individual the order was DEALT to is the responsible person, the deal is recorded in the ledger, and the shared login stays the recorder", async () => {
    await deal(ORDER.a, U.shasha);
    expect(await responsibility(root, ORDER.a, TODAY)).toMatchObject({
      normal_user_id: U.shasha, acting_user_id: U.shasha, is_cover: false, source: "established",
    });
    const row = await contact(root, ORDER.a, U.shared, TODAY);
    expect(row).toMatchObject({ contact_owner_user_id: U.shasha, acting_user_id: U.shasha, recorded_by: U.shared });
    // the deal itself wrote the append-only ledger, so Payment has nothing to establish
    expect(await establish(root, [ORDER.a], TODAY)).toMatchObject({ established: 0, kept: 1, unresolved: 0 });
    const ctx = (await context(root, [ORDER.a], TODAY))[0]!;
    expect(ctx).toMatchObject({ normal_user_id: U.shasha, acting_user_id: U.shasha, is_cover: false, source: "established" });
    const history = ctx.history as Array<{ source: string; owner_user_id: string; changed_by: string | null }>;
    expect(history.map((h) => [h.source, h.owner_user_id, h.changed_by])).toEqual([["established", U.shasha, null]]);
  });

  it("an order dealt before the ledger existed is established by Payment from the same read", async () => {
    await deal(ORDER.d, U.yujun);
    // an order assigned before 0504 has no ledger row at all
    await root.query("delete from payment_collection_owners where order_id = $1", [ORDER.d]);
    expect(await responsibility(root, ORDER.d, TODAY)).toMatchObject({ normal_user_id: U.yujun, source: "assigned" });
    expect((await context(root, [ORDER.d], TODAY))[0]).toMatchObject({ normal_user_id: U.yujun, source: "assigned" });
    expect(await establish(root, [ORDER.d], TODAY)).toMatchObject({ established: 1, unresolved: 0 });
    expect(await responsibility(root, ORDER.d, TODAY)).toMatchObject({ normal_user_id: U.yujun, source: "established" });
  });

  it("cover: the buddy acts, the normal owner is preserved on the contact AND in Payment, and work returns when the cover ends", async () => {
    await root.query(
      "insert into workspace_duty_covers (duty_key, normal_user_id, acting_user_id, starts_on, ends_on, reason) values ('delivery_duty', $1, $2, $3::date, $3::date + 3, 'leave')",
      [U.shasha, U.yujun, TODAY],
    );
    const row = await contact(root, ORDER.a, U.yujun, TODAY, { person: "partner" });
    expect(row).toMatchObject({ contact_owner_user_id: U.shasha, acting_user_id: U.yujun, recorded_by: U.yujun });
    expect((await context(root, [ORDER.a], TODAY))[0]).toMatchObject({
      normal_user_id: U.shasha, cover_user_id: U.yujun, acting_user_id: U.yujun, is_cover: true,
    });
    expect(await responsibility(root, ORDER.a, plus(4))).toMatchObject({
      normal_user_id: U.shasha, acting_user_id: U.shasha, is_cover: false,
    });
    // the cover never moved the order
    expect(await assignedStaff(ORDER.a)).toBe(U.shasha);
    await root.query("delete from workspace_duty_covers where normal_user_id = $1", [U.shasha]);
  });

  it("away today is COVER, never a reassignment: the least-loaded person who is in acts, and the order does not move", async () => {
    await root.query("update ops_staff_settings set available = false where user_id = $1", [U.shasha]);
    const who = await responsibility(root, ORDER.a, TODAY);
    expect(who).toMatchObject({
      normal_user_id: U.shasha, acting_user_id: U.yujun, is_cover: true, cover_reason: "away_today",
    });
    expect(await assignedStaff(ORDER.a)).toBe(U.shasha);
    // a past day is never re-guessed from today's presence
    expect(await responsibility(root, ORDER.a, plus(-3))).toMatchObject({ is_cover: false });
    await root.query("update ops_staff_settings set available = true where user_id = $1", [U.shasha]);
    expect(await responsibility(root, ORDER.a, TODAY)).toMatchObject({ acting_user_id: U.shasha, is_cover: false });
  });

  it("the owner does not rotate: a later day, a later contact by someone else and a re-run of establish all keep her", async () => {
    const later = await contact(root, ORDER.a, U.yujun, plus(6));
    expect(later).toMatchObject({ contact_owner_user_id: U.shasha, recorded_by: U.yujun });
    expect(await establish(root, [ORDER.a], plus(6))).toMatchObject({ established: 0, kept: 1 });
    expect((await context(root, [ORDER.a], plus(6)))[0]).toMatchObject({ normal_user_id: U.shasha });
  });

  it("a management reassignment appends a handover with who changed it, and the responsible person follows", async () => {
    await deal(ORDER.a, U.yujun, U.principal);
    expect(await responsibility(root, ORDER.a, TODAY)).toMatchObject({ normal_user_id: U.yujun, source: "handover" });
    const ctx = (await context(root, [ORDER.a], TODAY))[0]!;
    const history = ctx.history as Array<{ source: string; owner_user_id: string; previous_owner_user_id: string | null; changed_by: string | null }>;
    expect(history.map((h) => [h.source, h.owner_user_id, h.previous_owner_user_id, h.changed_by])).toEqual([
      ["established", U.shasha, null, null],
      ["handover", U.yujun, U.shasha, U.principal],
    ]);
    // put her back for the formal-handover case below
    await deal(ORDER.a, U.shasha, U.principal);
  });

  it("a formal handover carries its evidence, moves the ASSIGNMENT with it, refuses a shared account, and refuses an ordinary caller", async () => {
    const pr = await connect();
    await actAs(pr, U.principal);
    expect(await refusal(pr.query("select public.payment_collection_owner_handover($1, $2, 'x', $3::date)", [ORDER.a, U.yujun, plus(9)]))).toBe("reason_required");
    expect(await refusal(pr.query("select public.payment_collection_owner_handover($1, $2, 'the shared login cannot own', $3::date)", [ORDER.a, U.shared, plus(9)]))).toBe("new_owner_not_individual");

    await pr.query("select public.payment_collection_owner_handover($1, $2, 'Shasha moves to Purchasing', $3::date)", [ORDER.a, U.yujun, plus(9)]);
    const ctx = (await context(pr, [ORDER.a], plus(9)))[0]!;
    expect(ctx).toMatchObject({ normal_user_id: U.yujun, source: "handover" });
    // the Sales Order and the collection desk name the same person
    expect(await assignedStaff(ORDER.a)).toBe(U.yujun);
    const history = ctx.history as Array<{ source: string; owner_user_id: string }>;
    expect(history.at(-1)).toMatchObject({ source: "handover", owner_user_id: U.yujun, reason: "Shasha moves to Purchasing" });
    const row = await contact(root, ORDER.a, U.shared, plus(10));
    expect(row).toMatchObject({ contact_owner_user_id: U.yujun, recorded_by: U.shared });

    const op = await connect();
    await actAs(op, U.shasha);
    expect(await refusal(op.query("select public.payment_collection_owner_handover($1, $2, 'not mine to give', $3::date)", [ORDER.a, U.shasha, plus(11)]))).not.toBe("NO REFUSAL");
    await op.end();
    await pr.end();
  });

  it("two ledger rows written in ONE transaction still order: the handover leaves ONE new row and the read answers the NEW owner", async () => {
    // 🔴 FOUND BY THE ROLLED-BACK PRODUCTION PROBE, 2026-09-14. `changed_at`
    // was `now()` — the TRANSACTION's start — so two rows for one order written
    // inside a single transaction carried the same instant and
    // `order by effective_from desc, changed_at desc` could return either. The
    // probe deals an order and hands it over in one transaction and saw both
    // symptoms: the handover wrote a DUPLICATE row (its own current-owner
    // lookup found the older one) and the read still answered the previous
    // owner. The application calls each door in its own transaction, so it was
    // not reachable through the API — but a ledger whose clock does not advance
    // is not ordered, and any future door that writes twice would inherit it.
    // The ledger now stamps `clock_timestamp()`; this case holds it there.
    const pr = await connect();
    await actAs(pr, U.principal);
    await pr.query("begin");
    await pr.query(
      `insert into ops_order_control (order_id, assigned_staff, assigned_by, assigned_at)
       values ($1, $2, null, now())
       on conflict (order_id) do update set assigned_staff = excluded.assigned_staff,
         assigned_by = excluded.assigned_by, assigned_at = excluded.assigned_at`,
      [ORDER.c, U.shasha],
    );
    await pr.query("select public.payment_collection_owner_handover($1, $2, 'same transaction handover', null)", [ORDER.c, U.yujun]);
    const rows = (await pr.query(
      "select source, owner_user_id from payment_collection_owners where order_id = $1 order by changed_at", [ORDER.c],
    )).rows as Array<{ source: string; owner_user_id: string }>;
    const who = (await pr.query("select public.delivery_responsible_operation($1, null) as r", [ORDER.c])).rows[0].r as Who;
    const assigned = (await pr.query("select assigned_staff from ops_order_control where order_id = $1", [ORDER.c])).rows[0].assigned_staff as string;
    await pr.query("commit");
    await pr.end();

    expect(rows.map((r) => [r.source, r.owner_user_id])).toEqual([
      ["established", U.shasha],
      ["handover", U.yujun],
    ]);
    expect(who).toMatchObject({ normal_user_id: U.yujun, source: "handover" });
    expect(assigned).toBe(U.yujun);
  });

  it("a handover on an order that was never assigned creates the assignment and exactly one ledger row", async () => {
    // The handover writes ops_order_control, which carries five other triggers
    // (updated_at, the storage-model guard, the booking stage, the delay stamp,
    // the change log). The INSERT branch — an order with no control row at all —
    // is the one the rolled-back production probe could not reach, because every
    // production order already has one.
    const pr = await connect();
    await actAs(pr, U.principal);
    // ORDER.e is touched by nothing else, so it genuinely has no control row
    expect((await root.query("select count(*)::int as n from ops_order_control where order_id = $1", [ORDER.e])).rows[0].n).toBe(0);
    await pr.query("select public.payment_collection_owner_handover($1, $2, 'first owner named by hand', null)", [ORDER.e, U.shasha]);
    await pr.end();
    expect(await assignedStaff(ORDER.e)).toBe(U.shasha);
    expect(await responsibility(root, ORDER.e, TODAY)).toMatchObject({ normal_user_id: U.shasha, source: "handover" });
    expect((await root.query("select count(*)::int as n from payment_collection_owners where order_id = $1", [ORDER.e])).rows[0].n).toBe(1);
  });

  it("no contact anywhere names a shared login as the responsible person", async () => {
    const owners = await root.query(
      "select count(*)::int as n from ops_delivery_contacts c join app_users u on u.id = c.contact_owner_user_id where c.order_id = any($1) and u.staff_code is null",
      [Object.values(ORDER)],
    );
    expect(owners.rows[0].n).toBe(0);
  });
});
