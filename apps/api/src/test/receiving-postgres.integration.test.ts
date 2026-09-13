import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * RECEIVING ON A REAL, MULTI-CONNECTION POSTGRESQL RUNNING THE WHOLE CHAIN.
 *
 * `receiving-line-evidence.test.ts` proves 0493's SQL on PGlite — one
 * connection, the upstream tables stubbed. That cannot show what happens when
 * two operators act at the same moment, and it cannot show the doors 0426/0444
 * refusing a duplicate Unit or blocking a void, because those doors were cut
 * out of the harness. This file runs the committed doors themselves on a
 * database that replayed EVERY migration (`scripts/dry-run-migrations.mjs`),
 * from several connections at once.
 *
 * PREREQUISITE — a throwaway local PostgreSQL with the chain applied:
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs \
 *     --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- receiving-postgres
 *
 * Without `CARRES_TEST_DATABASE_URL` every case is SKIPPED and reported as
 * such — never as passed. The URL must be local; nothing here may reach a
 * shared project (the fixtures are written and deleted by the test).
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);

const U = {
  super: "aaaaaaaa-0000-4000-8000-000000000001", // Operations Superuser
  duty: "aaaaaaaa-0000-4000-8000-000000000002", // GRN duty holder (assigned mid-test)
  none: "aaaaaaaa-0000-4000-8000-000000000003", // operation, no duty
  wh: "aaaaaaaa-0000-4000-8000-000000000004", // warehouse role
};
const SUPPLIER = "aaaaaaaa-0000-4000-8000-0000000000e1";
const WH = "aaaaaaaa-0000-4000-8000-000000000c01";
const DEST = "aaaaaaaa-0000-4000-8000-000000000d01";
const BUCKET = "delivery-orders";
/* A Unit is a permanent record (`stock_unit_identity_permanence` refuses the
   delete), so every run mints its OWN Units and POs under a run tag; the
   receivings, claims and evidence rows are deleted, the Units stay behind in
   the throwaway database as ended lifecycles would. */
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const po = (n: number) => `PO-IT-${RUN}-${n}`;
const unitLine = (n: number) => `aaaaaaaa-0000-4000-8000-a01${HEX}000${n}`;
const qtyLine = (n: number) => `aaaaaaaa-0000-4000-8000-a02${HEX}000${n}`;
const unitId = (n: number, k: number) => `aaaaaaaa-0000-4000-8000-b0${HEX}${n}000${k}`;
const unitCode = (n: number, k: number) => `U${RUN}-90${n}-00${k}`;

type Client = pg.Client;
const open: Client[] = [];
async function connect(): Promise<Client> {
  const c = new pg.Client({ connectionString: URL });
  await c.connect();
  open.push(c);
  return c;
}
/** Impersonate a signed-in user the way PostgREST does — the claims GUC. */
async function actAs(c: Client, uid: string) {
  await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
}
function detailOf(e: unknown): string {
  return (e as { detail?: string })?.detail ?? "";
}
async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "NO REFUSAL";
  } catch (e) {
    return detailOf(e);
  }
}
const post = (
  c: Client,
  poId: string,
  doNo: string,
  lines: unknown,
  extras: unknown = null,
  saveKey: string | null = null,
) =>
  c.query(
    "select public.office_receive_post($1, $2, $3, null, $4::jsonb, null, null, null, $5::jsonb, $6::uuid) as r",
    [poId, doNo, `${poId}/do.jpg`, JSON.stringify(lines), extras === null ? null : JSON.stringify(extras), saveKey],
  );
const grnOf = async (c: Client, poId: string) =>
  (await c.query("select id, grn_no, status, posted_authority, posted_duty_holder, lines from warehouse_receipts where po_id = $1 and status = 'posted' order by posted_at desc limit 1", [poId])).rows[0];

describe.skipIf(!URL)("receiving doors on a real multi-connection PostgreSQL (full chain)", () => {
  let root: Client;

  beforeAll(async () => {
    if (!LOCAL) throw new Error(`CARRES_TEST_DATABASE_URL must point at localhost (got ${URL.replace(/:[^:@/]+@/, ":***@")})`);
    root = await connect();
    await wipeFixtures(); // an earlier aborted run leaves nothing behind
    const q = (sql: string, params: unknown[] = []) => root.query(sql, params);
    // ── the source side ─────────────────────────────────────────────────────
    await q("insert into suppliers (id, name, kind, slug) values ($1, 'IT Factory', 'own_logistics', 'it-factory') on conflict (id) do nothing", [SUPPLIER]);
    await q("insert into warehouses (id, name, kind) values ($1, 'IT Klang', 'own') on conflict (id) do nothing", [WH]);
    // ── identities (a warehouse account must name its warehouse) ────────────
    for (const [key, id] of Object.entries(U)) {
      await q("insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing", [id, `it-${key}@carres.test`]);
      await q(
        "insert into app_users (id, email, name, role, status, operations_superuser, warehouse_id) values ($1, $2, $3, $4, 'active', $5, $6) on conflict (id) do nothing",
        [id, `it-${key}@carres.test`, `IT ${key}`, key === "wh" ? "warehouse" : "operation", key === "super", key === "wh" ? WH : null],
      );
    }
    await q("insert into purchasing_destinations (id, name, warehouse_id) values ($1, 'IT Klang', $2) on conflict (id) do nothing", [DEST, WH]);
    await q("insert into storage.buckets (id, name) values ($1, $1) on conflict (id) do nothing", [BUCKET]);
    for (let n = 1; n <= 5; n++) {
      await q(
        "insert into purchase_orders (id, supplier_id, warehouse_id, status, placed_at, destination_id, is_consignment, version) values ($1, $2, $3, 'open', now() - interval '2 days', $4, false, 1) on conflict (id) do nothing",
        [po(n), SUPPLIER, WH, DEST],
      );
      await q(
        "insert into purchase_order_lines (id, po_id, sku, qty, received_qty, damaged_qty, wrong_item_qty, identity_mode) values ($1, $2, 'mattress:it-model:King', 2, 0, 0, 0, 'exact_unit'), ($3, $2, 'pillow:it-std:Std', 3, 0, 0, 0, 'quantity') on conflict (id) do nothing",
        [unitLine(n), po(n), qtyLine(n)],
      );
      for (const k of [1, 2]) {
        await q(
          "insert into ops_stock_items (id, sku, warehouse_id, status, condition, qty, identity_scope, unit_code, po_no, po_line_id, ownership) values ($1, 'mattress:it-model:King', $2, 'incoming', 'new', 1, 'unit', $3, $4, $5, 'carres_owned') on conflict (id) do nothing",
          [unitId(n, k), WH, unitCode(n, k), po(n), unitLine(n)],
        );
      }
      // the files the media law will look for
      for (const name of ["dmg-1.jpg", "dmg-2.jpg", "dmg-3.jpg", "dmg-4.jpg", "dmg-1.mp4", "extra-1.jpg"]) {
        await q("insert into storage.objects (bucket_id, name) values ($1, $2) on conflict do nothing", [BUCKET, `${po(n)}/${name}`]);
      }
    }
  });

  async function wipeFixtures() {
    const q = (sql: string, params: unknown[] = []) => root.query(sql, params).catch(() => undefined);
    const pos = [1, 2, 3, 4, 5].map(po);
    await q("delete from receiving_line_evidence where receipt_id in (select id from warehouse_receipts where po_id = any($1))", [pos]);
    await q("delete from receiving_events where receipt_id in (select id from warehouse_receipts where po_id = any($1))", [pos]);
    await q("delete from receiving_unit_results where receipt_id in (select id from warehouse_receipts where po_id = any($1))", [pos]);
    await q("delete from supplier_claims where po_id = any($1)", [pos]);
    await q("delete from warehouse_receipts where po_id = any($1)", [pos]);
    await q("delete from purchase_order_lines where po_id = any($1)", [pos]);
    await q("delete from purchase_orders where id = any($1)", [pos]);
    await q("delete from storage.objects where bucket_id = $1 and (name like $2 or name like $3)", [BUCKET, `PO-IT-${RUN}-%`, "PO-IT-%"]);
    await q("delete from workspace_duty_assignments where holder_id = any($1)", [Object.values(U)]);
    await q("delete from purchasing_destinations where id = $1", [DEST]);
    await q("delete from warehouses where id = $1", [WH]);
    await q("delete from suppliers where id = $1", [SUPPLIER]);
    await q("delete from app_users where id = any($1)", [Object.values(U)]);
    await q("delete from auth.users where id = any($1)", [Object.values(U)]);
    await q("update workspace_duty_assignments set duty_key = 'grn_duty' where duty_key = 'grn_duty__parked_by_it'");
  }

  afterAll(async () => {
    if (!root) return;
    // a case that died mid-transaction must not hold the cleanup's locks
    for (const c of open) if (c !== root) await c.end().catch(() => undefined);
    await wipeFixtures();
    await root.end();
  }, 30000);

  it("posts a receiving end to end, and refuses the same Unit a second time — in one submission and across receivings", async () => {
    const c = await connect();
    await actAs(c, U.super);
    // scanned twice inside ONE count
    expect(
      await refusal(
        post(c, po(1), "DO-IT-1A", [
          { id: unitLine(1), units: [{ unit_code: unitCode(1, 1), outcome: "received" }, { unit_code: unitCode(1, 1), outcome: "received" }] },
        ]),
      ),
    ).toBe("unit_scanned_twice");
    // a real posting: one exact Unit received, one not yet, one pillow by quantity
    const r = await post(c, po(1), "DO-IT-1", [
      { id: unitLine(1), units: [{ unit_code: unitCode(1, 1), outcome: "received" }, { unit_code: unitCode(1, 2), outcome: "not_received" }] },
      { id: qtyLine(1), received_now: 1 },
    ]);
    const grn = await grnOf(c, po(1));
    expect(r.rows[0].r.status).toBe("posted");
    expect(grn.grn_no).toMatch(/^GRN-\d{8}-\d{4}$/);
    const u = await c.query("select unit_code, status from ops_stock_items where po_no = $1 and identity_scope = 'unit' order by unit_code", [po(1)]);
    expect(u.rows.map((x) => `${x.unit_code}:${x.status}`)).toEqual([`${unitCode(1, 1)}:free`, `${unitCode(1, 2)}:incoming`]);
    // the SAME Unit on a later receiving of the same PO
    expect(
      await refusal(post(c, po(1), "DO-IT-1B", [{ id: unitLine(1), units: [{ unit_code: unitCode(1, 1), outcome: "received" }] }])),
    ).toBe("unit_already_received");
    // and a Unit that belongs to another PO
    expect(
      await refusal(post(c, po(1), "DO-IT-1C", [{ id: unitLine(1), units: [{ unit_code: unitCode(2, 1), outcome: "received" }] }])),
    ).toBe("unit_not_on_this_po");
    await c.end();
  });

  it("two operators posting the same Unit at the same moment: the second waits on the PO row and is refused after the first commits", async () => {
    const a = await connect();
    const b = await connect();
    await actAs(a, U.super);
    await actAs(b, U.super);
    await a.query("begin");
    await b.query("begin");
    const first = await post(a, po(2), "DO-IT-2A", [{ id: unitLine(2), units: [{ unit_code: unitCode(2, 1), outcome: "received" }, { unit_code: unitCode(2, 2), outcome: "not_received" }] }]);
    expect(first.rows[0].r.status).toBe("posted");
    let settled = false;
    const second = post(b, po(2), "DO-IT-2B", [{ id: unitLine(2), units: [{ unit_code: unitCode(2, 1), outcome: "received" }] }]).then(
      (v) => { settled = true; return v; },
      (e) => { settled = true; throw e; },
    );
    await new Promise((r) => setTimeout(r, 400));
    expect(settled).toBe(false); // B is blocked on `select … for update` of the PO, not racing past it
    await a.query("commit");
    expect(await refusal(second)).toBe("unit_already_received");
    await b.query("rollback");
    const grns = await a.query("select count(*)::int as n from warehouse_receipts where po_id = $1 and status = 'posted'", [po(2)]);
    expect(grns.rows[0].n).toBe(1);
    await a.end();
    await b.end();
  });

  it("a damaged Unit opens a supplier claim, and that claim blocks the void by name", async () => {
    const c = await connect();
    await actAs(c, U.super);
    await post(c, po(3), "DO-IT-3", [
      { id: unitLine(3), units: [{ unit_code: unitCode(3, 1), outcome: "received_with_issue", issue_kind: "damaged" }, { unit_code: unitCode(3, 2), outcome: "received" }], damaged_photos: [`${po(3)}/dmg-1.jpg`] },
    ]);
    const grn = await grnOf(c, po(3));
    const claims = await c.query("select claim_type, qty from supplier_claims where po_id = $1", [po(3)]);
    expect(claims.rows.length).toBeGreaterThan(0);
    // the projection trigger turned the posting's photo into a row of the evidence record
    const ev = await c.query("select exception_type, line_key, media_kind, path, source from receiving_line_evidence where receipt_id = $1", [grn.id]);
    expect(ev.rows).toEqual([{ exception_type: "damaged", line_key: unitLine(3), media_kind: "photo", path: `${po(3)}/dmg-1.jpg`, source: "posting" }]);
    expect(await refusal(c.query("select public.receiving_void($1, 'test')", [grn.id]))).toBe("claims_block_void");
    await c.end();
  });

  it("two operators appending evidence to the same GRN at once both persist; the same file twice is one row, the loser told it added nothing", async () => {
    const a = await connect();
    const b = await connect();
    await actAs(a, U.super);
    await actAs(b, U.super);
    const grn = await grnOf(a, po(3));
    const entry = (name: string) => JSON.stringify([{ line_key: unitLine(3), exception_type: "damaged", kind: "photo", path: `${po(3)}/${name}` }]);
    const add = (c: Client, name: string) => c.query("select public.receiving_line_evidence_add($1, $2::jsonb, 'walk') as r", [grn.id, entry(name)]);
    // Different files, interleaved inside open transactions. The door locks
    // the receiving row (`for update`), so the second operator WAITS for the
    // first to commit — and then their append still lands: serialised, never
    // lost, never an array rebuilt over the other's write.
    await a.query("begin");
    await b.query("begin");
    const ra = await add(a, "dmg-2.jpg");
    let settledB = false;
    const pendingB = add(b, "dmg-3.jpg").then((v) => { settledB = true; return v; });
    await new Promise((r) => setTimeout(r, 400));
    expect(settledB).toBe(false);
    await a.query("commit");
    const rb = await pendingB;
    await b.query("commit");
    expect(ra.rows[0].r.added).toBe(1);
    expect(rb.rows[0].r.added).toBe(1);
    // the same file from two connections — the second waits, then adds nothing
    await a.query("begin");
    const first = await add(a, "dmg-4.jpg");
    expect(first.rows[0].r.added).toBe(1);
    let settled = false;
    const second = add(b, "dmg-4.jpg").then((v) => { settled = true; return v; });
    await new Promise((r) => setTimeout(r, 400));
    expect(settled).toBe(false);
    await a.query("commit");
    const dup = await second;
    expect(dup.rows[0].r.added).toBe(0);
    const rows = await a.query("select path, source from receiving_line_evidence where receipt_id = $1 order by path", [grn.id]);
    expect(rows.rows).toEqual([
      { path: `${po(3)}/dmg-1.jpg`, source: "posting" },
      { path: `${po(3)}/dmg-2.jpg`, source: "amend" },
      { path: `${po(3)}/dmg-3.jpg`, source: "amend" },
      { path: `${po(3)}/dmg-4.jpg`, source: "amend" },
    ]);
    const events = await a.query("select count(*)::int as n from receiving_events where receipt_id = $1 and event = 'amended' and payload->>'kind' = 'line_evidence'", [grn.id]);
    expect(events.rows[0].n).toBe(3); // one per append that added something; the no-op wrote no event
    // a video for the same line, and a path that is not in the bucket
    const v = await add(a, "dmg-1.mp4").catch((e) => e);
    expect(detailOf(v)).toBe("evidence_kind_mismatch");
    const video = await a.query("select public.receiving_line_evidence_add($1, $2::jsonb, null) as r", [grn.id, JSON.stringify([{ line_key: unitLine(3), exception_type: "damaged", kind: "video", path: `${po(3)}/dmg-1.mp4` }])]);
    expect(video.rows[0].r.added).toBe(1);
    expect(await refusal(a.query("select public.receiving_line_evidence_add($1, $2::jsonb, null)", [grn.id, JSON.stringify([{ line_key: unitLine(3), exception_type: "damaged", kind: "photo", path: `${po(3)}/not-there.jpg` }])]))).toBe("evidence_object_missing");
    // a line with no wrong item on this GRN
    expect(await refusal(a.query("select public.receiving_line_evidence_add($1, $2::jsonb, null)", [grn.id, JSON.stringify([{ line_key: unitLine(3), exception_type: "wrong_item", kind: "photo", path: `${po(3)}/dmg-2.jpg` }])]))).toBe("evidence_exception_zero");
    await a.end();
    await b.end();
  }, 20000);

  it("a Unit that moved on blocks the void; a clean receiving voids and gives the Units and the PO line back", async () => {
    const c = await connect();
    await actAs(c, U.super);
    await post(c, po(4), "DO-IT-4", [{ id: unitLine(4), units: [{ unit_code: unitCode(4, 1), outcome: "received" }, { unit_code: unitCode(4, 2), outcome: "received" }] }]);
    const grn4 = await grnOf(c, po(4));
    await c.query("update ops_stock_items set status = 'reserved', reserved_ref = 'SO-IT-1' where id = $1", [unitId(4, 1)]);
    expect(await refusal(c.query("select public.receiving_void($1, 'test')", [grn4.id]))).toBe("units_block_void");
    // the clean one from the first case
    const grn1 = await grnOf(c, po(1));
    await c.query("select public.receiving_void($1, 'walk: counted the wrong DO')", [grn1.id]);
    const after = await c.query("select status, void_reason, grn_no from warehouse_receipts where id = $1", [grn1.id]);
    expect(after.rows[0]).toMatchObject({ status: "voided", void_reason: "walk: counted the wrong DO", grn_no: grn1.grn_no });
    const units = await c.query("select status from ops_stock_items where id = $1", [unitId(1, 1)]);
    expect(units.rows[0].status).toBe("incoming");
    const line = await c.query("select received_qty from purchase_order_lines where id = $1", [unitLine(1)]);
    expect(line.rows[0].received_qty).toBe(0);
    expect(await refusal(c.query("select public.receiving_void($1, '')", [grn4.id]))).toBe("void_reason_required");
    await c.end();
  });

  it("the duty gate end to end: nobody assigned → refused by name; a holder assigned → only the holder or a superuser may save, and the trio is stamped", async () => {
    const c = await connect();
    await actAs(c, U.none);
    const lines = [{ id: unitLine(5), units: [{ unit_code: unitCode(5, 1), outcome: "received" }, { unit_code: unitCode(5, 2), outcome: "not_received" }] }];
    // the replayed chain seeds a GRN duty rota; park it so "nobody holds GRN duty" is real
    await root.query("update workspace_duty_assignments set duty_key = 'grn_duty__parked_by_it' where duty_key = 'grn_duty'");
    expect((await root.query("select public.workspace_resolve_duty('grn_duty', null) ->> 'source' as s")).rows[0].s).toBe("not_assigned");
    expect(await refusal(post(c, po(5), "DO-IT-5", lines))).toBe("no_grn_duty_holder");
    await root.query("insert into workspace_duty_assignments (duty_key, holder_id, effective_from) values ('grn_duty', $1, current_date - 1)", [U.duty]);
    expect(await refusal(post(c, po(5), "DO-IT-5", lines))).toBe("not_grn_duty");
    await actAs(c, U.duty);
    await post(c, po(5), "DO-IT-5", lines);
    const grn = await grnOf(c, po(5));
    expect(grn.posted_duty_holder).toBe(U.duty);
    expect(grn.posted_authority).toBeTruthy();
    await c.end();
  });

  it("a signed-in client reads the evidence under RLS and cannot write it; a warehouse account sees none of it", async () => {
    const c = await connect();
    const grn = await grnOf(c, po(3));
    await c.query("set role authenticated");
    await actAs(c, U.super);
    const mine = await c.query("select count(*)::int as n from receiving_line_evidence where receipt_id = $1", [grn.id]);
    expect(mine.rows[0].n).toBe(5);
    const denied = await c.query("insert into receiving_line_evidence (receipt_id, exception_type, line_key, media_kind, path) values ($1, 'damaged', $2, 'photo', 'x.jpg')", [grn.id, unitLine(3)]).catch((e) => e);
    expect((denied as { code?: string }).code).toBe("42501");
    await actAs(c, U.wh);
    const theirs = await c.query("select count(*)::int as n from receiving_line_evidence where receipt_id = $1", [grn.id]);
    expect(theirs.rows[0].n).toBe(0);
    await c.query("reset role");
    await c.end();
  });
});
