import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

/**
 * 0533 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN — S2-D,
 * owner rulings (Jess, 2026-09-18):
 *
 *   1 jess@carres.com is a personal management identity, role `principal`.
 *   2 principal@carres.com never holds, covers, assigns or executes a duty.
 *   3 The migration bootstraps Jess once as the first Purchasing Approver.
 *   4 Nobody decides a Manual Purchase they raised.
 *   5 Shasha and Yu Jun never hold or cover Purchasing Approver.
 *   6 Holder away with no cover → the approval waits; never Operation.
 *   7 Nobody assigns a duty to themself — principal included.
 *
 * The migration file itself is executed inside the test transaction (its own
 * begin/commit stripped) against rows shaped like production, so the
 * bootstrap is proven where it matters: with a Jess who is `operation`
 * before and `principal` after. Everything is rolled back at the end.
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- personal-approver-identity
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `abababab-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const MIGRATION = readFileSync(
  resolve(
    __dirname,
    "../../../../supabase/migrations/0533_a_duty_belongs_to_a_person_and_jess_approves_purchases.sql",
  ),
  "utf8",
)
  .split("\n")
  .filter((l) => !/^\s*(begin|commit);\s*$/i.test(l))
  .join("\n");

const U = {
  jess: uid("1"),
  shared: uid("2"), // principal@carres.com — the shared owner login
  shasha: uid("3"),
  yujun: uid("4"),
  manager: uid("5"), // an Operation person whose position carries ops_manager
  other: uid("6"), // someone who held purchasing_approver before (history case)
};
const DUTY = `it_s2d_${HEX}`;

describe.skipIf(!URL)("personal approver identity + Purchasing Approver bootstrap (real PostgreSQL, 0533)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  async function attempt(sql: string, params: unknown[] = []): Promise<string> {
    await q("savepoint s");
    try {
      await q(sql, params);
      await q("release savepoint s");
      return "ok";
    } catch (e) {
      await q("rollback to savepoint s");
      return (e as { detail?: string }).detail || (e as Error).message;
    }
  }
  const as = (id: string) =>
    q("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: id, role: "authenticated" }),
    ]);
  const asMigration = () => q("select set_config('request.jwt.claims', '', false)");
  const assign = (duty: string, holder: string, from = "2030-01-01") =>
    attempt("select public.workspace_assign_duty($1, $2::uuid, $3::date, null)", [duty, holder, from]);
  const cover = (duty: string, acting: string, from = "2030-02-01", until = "2030-02-05") =>
    attempt("select public.workspace_cover_duty($1, $2::uuid, $3::date, $4::date, 'Annual leave')", [
      duty, acting, from, until,
    ]);
  const decide = (requestId: string, decision = "approve") =>
    attempt("select public.purchasing_decide_request($1::uuid, $2, $3)", [
      requestId, decision, decision === "approve" ? null : "Not needed",
    ]);
  const approverAssignments = async () =>
    (
      await q(
        "select holder_id, effective_from::text, assigned_by, note from workspace_duty_assignments where duty_key = 'purchasing_approver' order by created_at",
      )
    ).rows as Array<{ holder_id: string; effective_from: string; assigned_by: string | null; note: string }>;
  let destinationId = "";
  async function request(createdBy: string): Promise<string> {
    const r = await q(
      "insert into purchase_requests (purpose, destination_id, approval_required, created_by, submitted_at) values ('office', $1, true, $2, now()) returning id",
      [destinationId, createdBy],
    );
    return r.rows[0].id as string;
  }

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await asMigration();
    // Production's shape (2026-09-18): Jess is `operation` in the database
    // with a principal token; the shared owner login is principal WITH a
    // staff code; nothing marks a person yet.
    const people: Array<[string, string, string, string, string]> = [
      [U.jess, "jess@carres.com", "operation", "Jess", `S2DJ${HEX}`],
      [U.shared, "principal@carres.com", "principal", "principal", `S2DP${HEX}`],
      [U.shasha, `shasha-${HEX}@carres.test`, "operation", "Shasha", `S2DS${HEX}`],
      [U.yujun, `yujun-${HEX}@carres.test`, "operation", "Yu Jun", `S2DY${HEX}`],
      [U.manager, `manager-${HEX}@carres.test`, "operation", "Manager", `S2DM${HEX}`],
      [U.other, `other-${HEX}@carres.test`, "principal", "Other", `S2DO${HEX}`],
    ];
    for (const [id, email, role, name, code] of people) {
      await q("insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)", [
        id, email, JSON.stringify({ role: email === "jess@carres.com" ? "principal" : role }),
      ]);
      await q(
        "insert into app_users (id, email, name, role, status, staff_code) values ($1, $2, $3, $4, 'active', $5)",
        [id, email, name, role, code],
      );
    }
    // Shasha and Yu Jun are people (the migration marks production's by
    // email; these fixtures carry test emails, so mark them the same way a
    // People/HR creation would).
    await q("update app_users set is_person = true where id = any($1::uuid[])", [
      [U.shasha, U.yujun, U.manager, U.other],
    ]);
    const pos = await q(
      "insert into org_positions (name, band) values ($1, 'manager') returning id",
      [`S2D manager ${HEX}`],
    );
    await q("insert into org_position_duties (position_id, duty_key) values ($1, 'ops_manager')", [
      pos.rows[0].id,
    ]);
    await q("update app_users set position_id = $1 where id = $2", [pos.rows[0].id, U.manager]);
    const dest = await q("select id from purchasing_destinations order by name limit 1");
    destinationId = dest.rows[0].id as string;
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("bootstrap is a no-op when Purchasing Approver already has history", async () => {
    await q("savepoint history");
    await q(
      "insert into workspace_duty_assignments (duty_key, holder_id, effective_from, effective_until) values ('purchasing_approver', $1, '2026-01-01', '2026-01-31')",
      [U.other],
    );
    await q(MIGRATION);
    const rows = await approverAssignments();
    expect(rows).toHaveLength(1);
    expect(rows[0].holder_id).toBe(U.other);
    await q("rollback to savepoint history");
    expect(await approverAssignments()).toHaveLength(0);
  });

  it("makes Jess a principal PERSON, cites the ruling, and bootstraps her once with assigned_by NULL", async () => {
    await q(MIGRATION);
    const jess = (await q("select role::text, is_person from app_users where id = $1", [U.jess])).rows[0];
    expect(jess).toEqual({ role: "principal", is_person: true });
    const token = (await q("select raw_app_meta_data->>'role' as r from auth.users where id = $1", [U.jess])).rows[0];
    expect(token.r).toBe("principal");
    const shared = (await q("select is_person from app_users where id = $1", [U.shared])).rows[0];
    expect(shared.is_person).toBe(false);

    const rows = await approverAssignments();
    expect(rows).toEqual([
      {
        holder_id: U.jess,
        effective_from: "2026-09-18",
        assigned_by: null,
        note: "Bootstrap — owner ruling 2026-09-18 (no second Principal person)",
      },
    ]);
    const audit = await q(
      "select actor_text, action from audit_log where actor_text like 'migration 0533%' order by occurred_at",
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      "Jess role changed from operation to principal — owner ruling 2026-09-18 (personal management identity)",
      "Assigned purchasing_approver to Jess from 18 Sep 2026 — bootstrap, owner ruling 2026-09-18 (no second Principal person)",
    ]);

    // Re-run: nothing changes.
    await q(MIGRATION);
    expect(await approverAssignments()).toHaveLength(1);
    const again = await q("select count(*)::int as n from audit_log where actor_text like 'migration 0533%'");
    expect(again.rows[0].n).toBe(2);
    expect((await q("select count(*)::int as n from workspace_duty_covers where duty_key = 'purchasing_approver'")).rows[0].n).toBe(0);
  });

  it("the shared owner login cannot mark itself a person", async () => {
    await as(U.shared);
    expect(await attempt("update app_users set is_person = true where id = $1", [U.shared])).toBe(
      "person_marker_governed",
    );
    await as(U.jess);
    expect(await attempt("update app_users set is_person = false where id = $1", [U.shasha])).toBe(
      "person_marker_governed",
    );
  });

  it("the shared owner login is refused as holder, cover, assigner and executor — though it has a staff_code", async () => {
    await as(U.jess);
    expect(await assign(DUTY, U.shared)).toBe("invalid_holder");
    expect(await assign(DUTY, U.shasha)).toBe("ok");
    expect(await cover(DUTY, U.shared)).toBe("invalid_cover");

    await as(U.shared);
    expect(await assign(DUTY, U.yujun, "2030-03-01")).toBe("duty assignments are set by the manager");
    expect(await cover(DUTY, U.yujun)).toBe("duty assignments are set by the manager");
    // Executor: deciding a purchase, issuing a PO, posting a GRN.
    const req = await request(U.shasha);
    expect(await decide(req)).toBe("not_purchase_approver");
    expect((await q("select public.is_operations_superuser($1) as s", [U.shared])).rows[0].s).toBe(false);
    // Purchasing MASTER §5.3: Jess stays an Operations Superuser as a principal PERSON.
    expect((await q("select public.is_operations_superuser($1) as s", [U.jess])).rows[0].s).toBe(true);
    expect((await q("select public.workspace_is_person($1) as p", [U.shared])).rows[0].p).toBe(false);
  });

  it("nobody assigns or covers themself — principal and operation alike", async () => {
    await as(U.jess);
    expect(await assign(DUTY, U.jess, "2030-04-01")).toBe("self_assignment_refused");
    await as(U.manager);
    expect(await assign(DUTY, U.manager, "2030-04-01")).toBe("self_assignment_refused");
    expect(await cover(DUTY, U.manager)).toBe("self_assignment_refused");
  });

  it("Shasha and Yu Jun are refused as Purchasing Approver holder and cover", async () => {
    await as(U.manager);
    expect(await assign("purchasing_approver", U.shasha, "2030-05-01")).toBe("invalid_holder");
    expect(await assign("purchasing_approver", U.yujun, "2030-05-01")).toBe("invalid_holder");
    expect(await cover("purchasing_approver", U.shasha, "2030-05-02", "2030-05-03")).toBe("invalid_cover");
    expect(await cover("purchasing_approver", U.yujun, "2030-05-02", "2030-05-03")).toBe("invalid_cover");
    // The pickers offer the Principal person only.
    const picker = await q("select id from public.workspace_duty_staff(array['principal'])");
    expect(picker.rows.map((r) => r.id)).toContain(U.jess);
    expect(picker.rows.map((r) => r.id)).not.toContain(U.shared);
  });

  it("the requester cannot decide their own Manual Purchase; Jess decides Shasha's", async () => {
    const own = await request(U.jess);
    await as(U.jess);
    expect(await decide(own)).toBe("own_request");
    expect(await decide(own, "refuse")).toBe("own_request");
    const shashas = await request(U.shasha);
    expect(await decide(shashas)).toBe("ok");
  });

  it("the principal role no longer raises a Manual Purchase", async () => {
    await as(U.jess);
    expect(
      await attempt("select public.purchasing_create_request('office', $1::uuid, null, null, null, null, null)", [
        destinationId,
      ]),
    ).toBe("not permitted");
  });

  it("Jess away with no cover: the approval waits — the operations manager and Operation are refused", async () => {
    const req = await request(U.shasha);
    await as(U.manager);
    expect(await decide(req)).toBe("not_purchase_approver");
    await as(U.yujun);
    expect(await decide(req)).toBe("not_purchase_approver");
    const r = (await q("select public.workspace_resolve_duty('purchasing_approver') as r")).rows[0].r;
    expect(r.actor_user_id).toBe(U.jess);
  });

  it("unheld Purchasing Approver answers `Nobody holds Purchasing Approver.` — no fallback rung", async () => {
    await q("savepoint unheld");
    await asMigration();
    await q("update workspace_duty_assignments set effective_from = '2099-01-01' where duty_key = 'purchasing_approver'");
    const req = await request(U.shasha);
    await as(U.manager);
    expect(await decide(req)).toBe("no_purchase_approver");
    await as(U.jess);
    expect(await decide(req)).toBe("no_purchase_approver");
    await q("rollback to savepoint unheld");
  });
});
