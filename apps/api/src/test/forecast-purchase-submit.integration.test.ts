import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";

/**
 * THE FORECAST PURCHASE SUBMIT DOOR ON A REAL POSTGRESQL RUNNING THE WHOLE
 * MIGRATION CHAIN (0695; Purchasing MASTER §9.14):
 *
 *   one press → one Manual Purchase Request, raised through the EXISTING
 *   whole-request door, still waiting for approval → a retry of the same
 *   press answers with the same request → a second person asking for the same
 *   size from an older read is refused → many people pressing at once make
 *   exactly one request.
 *
 * A browser that reads again before it sends cannot prove the last case: two
 * presses can both read "nothing in progress" and both write. Only the door's
 * own lock can. The control at the bottom shows the existing door alone does
 * NOT stop it, so the protection proven here is the forecast door's.
 *
 * The committed functions run as committed. Identities are impersonated
 * through the request-claims GUC exactly as PostgREST sets it.
 * PREREQUISITE — a throwaway local cluster with the chain:
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- forecast-purchase-submit
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `cccccccc-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const U = { a: uid("1"), b: uid("2") };
const WEEK = "2026-10-12";
const CROWD = 6;

type Client = pg.Client;
const open: Client[] = [];
async function connect(as?: string): Promise<Client> {
  const c = new pg.Client({ connectionString: URL });
  await c.connect();
  open.push(c);
  if (as) await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: as, role: "authenticated" })]);
  return c;
}
const detail = (e: unknown) => (e as { detail?: string })?.detail ?? "";
type Made = { replayed: boolean; requests: Array<{ id: string; req_no: string | null }> };

describe.skipIf(!URL)("Forecast Purchase is asked once through the request door (real PostgreSQL)", () => {
  let root: Client;
  let a: Client;
  let b: Client;
  let SKU = "";
  let DESTINATION = "";
  const made: string[] = [];

  const inProgress = (c: Client) =>
    c.query("select coalesce(sum(qty), 0)::int as n from public.purchasing_forecast_requests_in_progress() where sku = $1", [SKU])
      .then((r) => r.rows[0].n as number);
  const submit = async (c: Client, key: string, seen: number, qty = 1) => {
    const r = await c.query("select public.purchasing_submit_forecast_requests($1, $2::date, $3, $4::jsonb) as r", [
      key, WEEK, DESTINATION,
      JSON.stringify([{ required_by: "2026-12-31", requirement: `Forecast Purchase · week of ${WEEK}`, lines: [{ sku: SKU, qty, in_progress: seen }] }]),
    ]);
    const answer = r.rows[0].r as Made;
    for (const request of answer.requests) if (!made.includes(request.id)) made.push(request.id);
    return answer;
  };
  const marks = () =>
    root.query("select count(*)::int as n from forecast_purchase_requests where created_by = any($1)", [Object.values(U)])
      .then((r) => r.rows[0].n as number);

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    root = await connect();
    for (const [id, name, code] of [[U.a, "Forecast A", `CF${RUN}1`], [U.b, "Forecast B", `CF${RUN}2`]] as const) {
      const email = `it-forecast-${code.toLowerCase()}@carres.test`;
      await root.query("insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing", [id, email]);
      await root.query(
        "insert into app_users (id, email, name, role, status, staff_code, operations_superuser, is_person) values ($1, $2, $3, 'operation', 'active', $4, false, true) on conflict (id) do nothing",
        [id, email, name, code],
      );
    }
    DESTINATION = (await root.query("select id from purchasing_destinations where active order by name limit 1")).rows[0].id as string;
    a = await connect(U.a);
    b = await connect(U.b);
    /* A size the existing door can already buy: one a kept cluster has asked
       for before, else the first mattress size in the catalog. */
    SKU = ((await root.query(
      "select coalesce((select lines->0->>'sku' from forecast_purchase_requests order by created_at limit 1), (select s.sku from product_skus s join product_models m on m.id = s.model_id where m.category = 'mattress' and s.variant_kind = 'size' and s.discontinued_at is null and s.supplier_id is not null order by s.sku limit 1)) as sku",
    )).rows[0].sku as string) ?? "";
    if (!SKU) throw new Error("the replayed catalog has no mattress size to ask for");
  });

  afterAll(async () => {
    const q = (sql: string, params: unknown[] = []) => root.query(sql, params).catch(() => undefined);
    await q("delete from forecast_purchase_requests where created_by = any($1)", [Object.values(U)]);
    await q("delete from purchase_request_events where request_id = any($1)", [made]);
    await q("delete from purchase_demands where request_id = any($1)", [made]);
    await q("delete from purchase_requests where id = any($1)", [made]);
    await q("delete from app_users where id = any($1)", [Object.values(U)]);
    await q("delete from auth.users where id = any($1)", [Object.values(U)]);
    for (const c of open) await c.end().catch(() => undefined);
  });

  it("refuses a caller who is not signed in", async () => {
    const nobody = await connect();
    await expect(nobody.query("select * from public.purchasing_forecast_requests_in_progress()")).rejects.toThrow(/not permitted/);
  });

  it("one press makes one request that still waits for approval, and counts as in progress, never as stock", async () => {
    const before = await inProgress(a);
    const answer = await submit(a, randomUUID(), before, 2);
    expect(answer.replayed).toBe(false);
    expect(answer.requests).toHaveLength(1);
    const request = (await root.query(
      "select purpose, fulfilment_intent, approval_required, approved_at, created_by from purchase_requests where id = $1", [answer.requests[0].id],
    )).rows[0];
    expect(request).toMatchObject({ purpose: "ready_stock", fulfilment_intent: "additional_stock", approval_required: true, approved_at: null, created_by: U.a });
    expect(await inProgress(a)).toBe(before + 2);
    const mark = (await root.query("select forecast_week::text as week, lines from forecast_purchase_requests where request_id = $1", [answer.requests[0].id])).rows[0];
    expect(mark.week).toBe(WEEK);
    expect(mark.lines).toEqual([{ sku: SKU, qty: 2, in_progress: before }]);
  });

  it("a retry of the same press answers with the same request and writes nothing", async () => {
    const key = randomUUID();
    const before = await inProgress(a);
    const first = await submit(a, key, before);
    const count = await marks();
    /* The retry still carries what the FIRST read saw. It is answered, not judged again. */
    const again = await submit(a, key, before);
    expect(again.replayed).toBe(true);
    expect(again.requests).toEqual(first.requests);
    expect(await marks()).toBe(count);
    expect(await inProgress(a)).toBe(before + 1);
    const lookup = (await a.query("select public.purchasing_forecast_submission($1) as r", [key])).rows[0].r;
    expect(lookup).toEqual(first.requests);
  });

  it("another person's key is not theirs to replay", async () => {
    const key = randomUUID();
    await submit(a, key, await inProgress(a));
    expect((await b.query("select public.purchasing_forecast_submission($1) as r", [key])).rows[0].r ?? []).toEqual([]);
  });

  it("an ask worked out from an older read is refused by name and writes nothing", async () => {
    const stale = (await inProgress(b)) - 1;
    const count = await marks();
    let refused: unknown;
    try { await submit(b, randomUUID(), stale); } catch (e) { refused = e; }
    expect(detail(refused)).toBe("forecast_in_progress_changed");
    expect((refused as { hint?: string }).hint).toBe(SKU);
    expect(await marks()).toBe(count);
  });

  it(`${CROWD} people pressing at once make exactly one request`, async () => {
    const seen = await inProgress(a);
    const count = await marks();
    const crowd = await Promise.all(Array.from({ length: CROWD }, (_, i) => connect(i % 2 ? U.a : U.b)));
    const results = await Promise.allSettled(crowd.map((c) => submit(c, randomUUID(), seen)));
    const through = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(through).toHaveLength(1);
    expect(refused).toHaveLength(CROWD - 1);
    for (const r of refused) expect(detail(r.reason)).toBe("forecast_in_progress_changed");
    expect(await marks()).toBe(count + 1);
    expect(await inProgress(a)).toBe(seen + 1);
  });

  it("CONTROL: the existing request door alone lets every one of them through", async () => {
    const seen = await inProgress(a);
    const crowd = await Promise.all(Array.from({ length: CROWD }, () => connect(U.a)));
    const results = await Promise.allSettled(crowd.map((c) =>
      c.query(
        `select public.purchasing_create_request_with_lines(
           p_purpose => 'ready_stock', p_destination_id => $1, p_required_by => '2026-12-31'::date, p_why => 'control',
           p_lines => $2::jsonb, p_fulfilment_intent => 'additional_stock', p_purchase_requirement => 'control') as r`,
        [DESTINATION, JSON.stringify([{ sku: SKU, qty: 1, required_by: "2026-12-31" }])],
      ).then((r) => { const id = (r.rows[0].r as { id?: string })?.id; if (id) made.push(id); return r; }),
    ));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(CROWD);
    expect(await inProgress(a)).toBe(seen + CROWD);
  });
});
