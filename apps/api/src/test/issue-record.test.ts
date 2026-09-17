import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { migration } from "./stock-register-database";

/**
 * HF-2 · AN ISSUE IS RECORDED WHOLE OR NOT AT ALL (0526).
 *
 * Atomicity and idempotency are database behaviours, so this runs real
 * PostgreSQL (PGlite) over the COMMITTED 0352 → 0454 → 0526 chain. Only the
 * upstream tables those files reference are fixtures. RLS is not exercised
 * here (PGlite runs as its superuser); the door is SECURITY INVOKER and changes
 * no policy.
 */

const ME = "11111111-1111-1111-1111-111111111111";
const REQUEST = "22222222-2222-2222-2222-222222222222";

async function issueDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create type public.app_role as enum ('operation','finance','principal','dealer');
    create table public.app_users (id uuid primary key, role public.app_role, status text default 'active');
    create function public.app_role() returns public.app_role language sql stable as
      $$ select role from public.app_users where id = auth.uid() and status = 'active' $$;
    create table public.ops_tasks (id uuid primary key, status text, updated_at timestamptz);
    create table public.service_notes (id uuid primary key);
    create table public.workspace_duty_assignments (id uuid primary key);
    insert into public.app_users values ('${ME}', 'operation', 'active');
  `);
  await db.exec(migration("0352_issue_tracker_accountability_memory_learning"));
  await db.exec(migration("0454_an_issue_action_has_one_identity_and_one_result"));
  await db.exec(migration("0526_an_issue_is_recorded_whole_or_not_at_all"));
  await db.exec(`select set_config('test.uid', '${ME}', false)`);
  return db;
}

const ISSUE = {
  problem_object: "item", observed_problem: "damaged", source_module: "sales_order",
  business_impact: "Delivery cannot continue", materiality: "routine", observed_on: "2026-09-16",
  affected_object: "Sofa", official_english: "Sofa was damaged.", found_by_kind: "me", found_by_name: "Yu Jun",
};
const LINKS = [{ kind: "sales_order", id: "SO-1319", label: "SO-1319" }];
const EVIDENCE = [{ kind: "photo", label: "1 photo" }];
const ACTION = {
  trigger: "Delivery cannot continue", ownerRule: "issue_triage_duty", action: "Send the issue proof and ask for acceptance",
  recipient: "Hookka", requiredResult: "Acceptance or rejection is recorded", dueOn: "2026-09-18",
};

function record(db: PGlite, request = REQUEST) {
  return db.query<{ r: { id: string; issue_no: string; replayed: boolean } }>(
    "select public.issue_record_issue($1, $2, $3, $4, $5) as r",
    [request, JSON.stringify(ISSUE), JSON.stringify(LINKS), JSON.stringify(EVIDENCE), JSON.stringify(ACTION)],
  );
}
async function count(db: PGlite, table: string) {
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`);
  return rows[0]!.n;
}

describe("issue_record_issue (0526)", () => {
  let db: PGlite;
  beforeEach(async () => { db = await issueDatabase(); });

  it("leaves no Issue behind when the proof cannot be written", async () => {
    await db.exec(`
      create function public.refuse_evidence() returns trigger language plpgsql as
        $$ begin raise exception 'evidence store unavailable'; end $$;
      create trigger refuse_evidence before insert on public.issue_evidence
        for each row execute function public.refuse_evidence();
    `);
    await expect(record(db)).rejects.toThrow(/evidence store unavailable/);
    expect(await count(db, "issues")).toBe(0);
    expect(await count(db, "issue_links")).toBe(0);
    expect(await count(db, "issue_actions")).toBe(0);
  });

  it("answers the same request with the Issue it already recorded", async () => {
    const first = (await record(db)).rows[0]!.r;
    const second = (await record(db)).rows[0]!.r;
    expect(second.id).toBe(first.id);
    expect(second.issue_no).toBe(first.issue_no);
    expect(second.replayed).toBe(true);
    expect(await count(db, "issues")).toBe(1);
    expect(await count(db, "issue_actions")).toBe(1);
    expect(await count(db, "issue_evidence")).toBe(1);
  });

  it("records an open Issue with exactly one action numbered 1", async () => {
    const { id } = (await record(db)).rows[0]!.r;
    const issue = await db.query<{ status: string }>("select status from public.issues where id = $1", [id]);
    expect(issue.rows[0]!.status).toBe("open");
    const actions = await db.query<{ sequence: number; status: string }>(
      "select sequence, status from public.issue_actions where issue_id = $1", [id]);
    expect(actions.rows).toEqual([{ sequence: 1, status: "open" }]);
  });

  it("refuses a caller without Operation access", async () => {
    await db.exec(`update public.app_users set role = 'dealer'`);
    await expect(record(db)).rejects.toMatchObject({ code: "42501" });
    expect(await count(db, "issues")).toBe(0);
  });
});
