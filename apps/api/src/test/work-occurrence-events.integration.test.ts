import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0581 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: the Work
 * lifecycle ledger `work_occurrence_events` (owner rulings 2026-09-24).
 *
 *   request_sent    internal staff only; moves Work to Waiting, never completes it
 *   reply_received  only while Waiting
 *   completed       the service role only (the module's completion fact); terminal
 *   every row       append-only; contact_kind is one of four; kind and id travel together
 *
 * Everything runs inside ONE transaction that is rolled back at the end.
 * PREREQUISITE — a throwaway local cluster with the chain:
 *
 *   LC_ALL=en_US.UTF-8 node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- work-occurrence-events
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `eeeeeeee-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const U = { operation: uid("1"), supplier: uid("2"), dealer: uid("3") };
const CUSTOMER = uid("c1");
const OCC = `orders:it-${HEX}:ask_delivery_date`;
const OTHER = `orders:it-${HEX}:other_rule`;

describe.skipIf(!URL)("the Work lifecycle ledger (real PostgreSQL, 0581)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  /** One call in a savepoint: a refusal comes back as its detail or code. */
  async function attempt(sql: string, params: unknown[] = []): Promise<string> {
    await q("savepoint s");
    try {
      await q(sql, params);
      await q("release savepoint s");
      return "ok";
    } catch (e) {
      await q("rollback to savepoint s");
      const err = e as { detail?: string; code?: string; message: string };
      return err.detail && !err.detail.includes(" ") ? err.detail : err.code ?? err.message;
    }
  }
  const as = async (who: string | "service_role") => {
    await q("reset role");
    if (who === "service_role") {
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
      return;
    }
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const nextWorkingDay = "(select d::date from generate_series((timezone('Asia/Kuala_Lumpur', now()))::date + 1, (timezone('Asia/Kuala_Lumpur', now()))::date + 7, interval '1 day') d where extract(isodow from d) < 6 limit 1)";
  const send = (occ: string, key: string, kind: string | null = "customer", id: string | null = CUSTOMER, due = nextWorkingDay) =>
    attempt(`select public.work_record_request_sent($1, 'whatsapp', $2, $3::uuid, ${due}, 'v1', $4)`, [occ, kind, id, key]);
  const reply = (occ: string, key: string) =>
    attempt("select public.work_record_reply_received($1, 'whatsapp', 'customer', $2::uuid, 'v1', $3)", [occ, CUSTOMER, key]);
  const complete = (occ: string, key: string) =>
    attempt("select public.work_record_completed($1, $2::uuid, now(), date '2026-09-17', 'SO-1318', 'SO-1318 delivery date', 'v2', $3)", [occ, U.operation, key]);

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    for (const [id, role] of [[U.operation, "operation"], [U.supplier, "supplier"], [U.dealer, "dealer"]] as const) {
      const email = `it-work-${role}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [
        id, email, `IT ${role}`, role,
      ]);
    }
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback");
    await db.end();
  });

  it("refuses a send from anyone who is not internal staff", async () => {
    await as(U.supplier);
    expect(await send(OCC, `k-sup-${HEX}`)).toBe("forbidden");
    await as(U.dealer);
    expect(await send(OCC, `k-dea-${HEX}`)).toBe("forbidden");
  });

  it("records a send by the signed-in person, and a replay of the same key is the same row", async () => {
    await as(U.operation);
    expect(await send(OCC, `k-send-${HEX}`)).toBe("ok");
    const first = await q("select public.work_record_request_sent($1, 'whatsapp', 'customer', $2::uuid, " + nextWorkingDay + ", 'v1', $3) as id", [OCC, CUSTOMER, `k-send-${HEX}`]);
    const rows = await q("select id, actor_id, event from work_occurrence_events where occurrence_id = $1", [OCC]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].id).toBe(first.rows[0].id);
    expect(rows.rows[0].actor_id).toBe(U.operation);
    expect(await reply(OCC, `k-send-${HEX}`)).toBe("work_event_key_reused");
  });

  it("refuses a reply due date in the past or on a weekend", async () => {
    await as(U.operation);
    expect(await send(OTHER, `k-past-${HEX}`, "customer", CUSTOMER, "((timezone('Asia/Kuala_Lumpur', now()))::date - 1)")).toBe("reply_due_not_a_working_day");
    const saturday = "(select d::date from generate_series((timezone('Asia/Kuala_Lumpur', now()))::date, (timezone('Asia/Kuala_Lumpur', now()))::date + 7, interval '1 day') d where extract(isodow from d) = 6 limit 1)";
    expect(await send(OTHER, `k-sat-${HEX}`, "customer", CUSTOMER, saturday)).toBe("reply_due_not_a_working_day");
  });

  it("allows only the four contact kinds, and a kind always travels with its id", async () => {
    await as(U.operation);
    expect(await send(OTHER, `k-kind-${HEX}`, "staff", CUSTOMER)).toBe("23514");
    expect(await send(OTHER, `k-half-${HEX}`, "customer", null)).toBe("23514");
    expect(await send(OTHER, `k-none-${HEX}`, null, null)).toBe("ok");
  });

  it("a reply needs a waiting occurrence", async () => {
    await as(U.operation);
    expect(await reply(`orders:it-${HEX}:never_sent`, `k-r0-${HEX}`)).toBe("work_occurrence_not_waiting");
    expect(await reply(OCC, `k-r1-${HEX}`)).toBe("ok");
    expect(await reply(OCC, `k-r2-${HEX}`)).toBe("work_occurrence_not_waiting");
  });

  it("only the service role completes, once, and a completed occurrence takes nothing more", async () => {
    // A signed-in person may not even call the completion door.
    await as(U.operation);
    expect(await complete(OCC, `k-c0-${HEX}`)).toBe("42501");
    await as("service_role");
    expect(await complete(OCC, `k-c1-${HEX}`)).toBe("ok");
    expect(await complete(OCC, `k-c2-${HEX}`)).toBe("work_occurrence_completed");
    await as(U.operation);
    expect(await send(OCC, `k-after-${HEX}`)).toBe("work_occurrence_completed");
    const done = await q("select actor_id, to_char(action_on, 'YYYY-MM-DD') as action_on, object_label, result_reference, channel, contact_kind from work_occurrence_events where occurrence_id = $1 and event = 'completed'", [OCC]);
    expect(done.rows).toEqual([{ actor_id: U.operation, action_on: "2026-09-17", object_label: "SO-1318", result_reference: "SO-1318 delivery date", channel: null, contact_kind: null }]);
  });

  it("a completion must name its document; the Work date may be absent (No working date)", async () => {
    await as("service_role");
    const noLabel = `orders:it-${HEX}:no_label`;
    expect(await attempt("select public.work_record_completed($1, null, now(), date '2026-09-17', null, 'r', 'v', $2)", [noLabel, `k-nl-${HEX}`])).toBe("23514");
    const noDate = `orders:it-${HEX}:no_date`;
    expect(await attempt("select public.work_record_completed($1, null, now(), null, 'SO-1319', 'r', 'v', $2)", [noDate, `k-nd-${HEX}`])).toBe("ok");
  });

  it("only a completion carries the Work date and the document reference", async () => {
    await q("reset role");
    const occ = `orders:it-${HEX}:facts_only`;
    expect(await attempt("insert into work_occurrence_events (occurrence_id, event, actor_id, channel, reply_due_on, source_version, idempotency_key, object_label) values ($1, 'request_sent', $2::uuid, 'phone', current_date + 1, 'v', $3, 'SO-1')", [occ, U.operation, `k-fo-${HEX}`])).toBe("23514");
    expect(await attempt("insert into work_occurrence_events (occurrence_id, event, actor_id, source_version, idempotency_key, action_on) values ($1, 'reply_received', $2::uuid, 'v', $3, current_date)", [occ, U.operation, `k-fo2-${HEX}`])).toBe("23514");
  });

  it("the completion facts are immutable with the history", async () => {
    await q("reset role");
    expect(await attempt("update work_occurrence_events set action_on = date '2026-01-01', object_label = 'SO-9' where occurrence_id = $1 and event = 'completed'", [OCC])).toBe("work_event_append_only");
  });

  it("is append-only for every role, and no client writes the table directly", async () => {
    await q("reset role");
    expect(await attempt("update work_occurrence_events set source_version = 'x' where occurrence_id = $1", [OCC])).toBe("work_event_append_only");
    expect(await attempt("delete from work_occurrence_events where occurrence_id = $1", [OCC])).toBe("work_event_append_only");
    await as(U.operation);
    expect(await attempt("insert into work_occurrence_events (occurrence_id, event, source_version, idempotency_key) values ($1, 'completed', 'v', $2)", [OTHER, `k-raw-${HEX}`])).toBe("42501");
  });

  it("internal staff read the history; a supplier reads none of it", async () => {
    await as(U.operation);
    const mine = await q("select count(*)::int as n from work_occurrence_events where occurrence_id = $1", [OCC]);
    expect(mine.rows[0].n).toBe(3);
    await as(U.supplier);
    const theirs = await q("select count(*)::int as n from work_occurrence_events where occurrence_id = $1", [OCC]);
    expect(theirs.rows[0].n).toBe(0);
  });
});
