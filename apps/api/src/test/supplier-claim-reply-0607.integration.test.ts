import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0607 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN — Supplier Claim
 * reply recording (Purchasing MASTER §9.5, owner approval 2026-09-25):
 *
 *   reply     answer + scope (whole claim / these Units) + supplier's date +
 *             evidence (file or phone) + note for Reject / Other agreement
 *   scope     a whole-claim answer names no Unit; `These Units` only this claim's
 *   early     a reply before any ask is contact evidence; the ask makes it formal
 *   append    a second answer appends and supersedes; the first stays
 *   send      `Claim sent to supplier` lands in document_sends as supplier_claim
 *   snapshot  the ask copies the reply timing onto the claim; a later Settings
 *             change never moves that claim's dates
 *   legacy    the scope-less 0291 door is closed to signed-in callers
 *
 *   LC_ALL=en_US.UTF-8 node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- supplier-claim-reply-0607
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `fffffff7-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const OP = uid("2");
const DEALER = uid("4");
const SUPPLIER = uid("51");
const WH = uid("61");
const PO = `PO-IT-${HEX}`;
const ASKED = uid("81");
const EARLY = uid("82");
const OTHER = uid("83");
const TIMED = uid("84");
const UNIT_A = uid("b1");
const UNIT_B = uid("b2");
const UNIT_OTHER = uid("b3");
const FILE = { path: `supplier_claim_reply/${ASKED}/it-${HEX}.jpg`, kind: "photo" };

type Result = { ok: true; row: Record<string, unknown> } | { ok: false; why: string; detail: string };

describe.skipIf(!URL)("Supplier Claim reply recording (real PostgreSQL, 0607)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  async function attempt(sql: string, params: unknown[] = []): Promise<Result> {
    await q("savepoint s");
    try {
      const r = await q(sql, params);
      await q("release savepoint s");
      return { ok: true, row: (r.rows[0] ?? {}) as Record<string, unknown> };
    } catch (e) {
      await q("rollback to savepoint s");
      const err = e as { message: string; detail?: string };
      return { ok: false, why: err.message, detail: err.detail ?? "" };
    }
  }
  const as = async (who: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    await q("set local role authenticated");
  };
  const reply = (claim: string, over: Record<string, unknown> = {}) => {
    const a = { response: "replacement", scope: "claim", units: [] as string[], date: null as string | null, note: null as string | null, evidence: [FILE] as unknown[], spoke: null as string | null, at: null as string | null, ...over };
    return attempt(
      "select public.supplier_claim_record_reply($1, $2, $3, $4::uuid[], $5::date, $6, $7::jsonb, $8, $9::timestamptz) as r",
      [claim, a.response, a.scope, a.units, a.date, a.note, JSON.stringify(a.evidence), a.spoke, a.at],
    );
  };
  const claimRow = async (id: string) =>
    (await q("select supplier_response, supplier_response_note, supplier_response_reply_id, requested_action, responded_by from supplier_claims where id = $1", [id])).rows[0];

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    await q("set local session_replication_role = replica");
    for (const [id, role] of [[OP, "operation"], [DEALER, "dealer"]] as const) {
      const email = `it-0607-${id.slice(-7)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [id, email, `IT ${role}`, role]);
    }
    await q("insert into suppliers (id, name, kind, slug) values ($1, $2, (select enum_range(null::supplier_kind))[1], $3)", [SUPPLIER, `IT Hooka ${HEX}`, `it-sc-${HEX}`]);
    await q("insert into warehouses (id, name, kind) values ($1, $2, 'own')", [WH, `IT WH ${HEX}`]);
    await q("insert into purchase_orders (id, supplier_id, warehouse_id) values ($1, $2, $3)", [PO, SUPPLIER, WH]);
    for (const [id, no, asked] of [[ASKED, `SC-IT1-${HEX}`, true], [EARLY, `SC-IT2-${HEX}`, false], [OTHER, `SC-IT3-${HEX}`, true], [TIMED, `SC-IT4-${HEX}`, false]] as const) {
      await q(
        `insert into supplier_claims (id, claim_no, po_id, supplier_id, sku, product_category, claim_type, qty, photos, requested_action, requested_at)
         values ($1, $2, $6, $3, 'IT-SKU', 'other', 'damaged', 2, '[{"path":"claims/it.jpg"}]'::jsonb, $4, $5)`,
        [id, no, SUPPLIER, asked ? "replace" : null, asked ? new Date().toISOString() : null, PO],
      );
    }
    for (const [id, claim, n] of [[UNIT_A, ASKED, 101], [UNIT_B, ASKED, 102], [UNIT_OTHER, OTHER, 103]] as const) {
      await q(
        "insert into ops_stock_items (id, sku, warehouse_id, status, unit_code, hold_claim_id, hold_reason, held_at, identity_scope, qty) values ($1, 'IT-SKU', $2, 'on_hold', $3, $4, 'damaged', now(), 'unit', 1)",
        [id, WH, `U9${RUN}-${n}-001`, claim],
      );
    }
    await q("set local session_replication_role = origin");
  });

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("refuses a dealer; the gate is Operation", async () => {
    await as(DEALER);
    const r = await reply(ASKED);
    expect(r.ok).toBe(false);
  });

  it("refuses a reply with no evidence at all, and a half phone answer", async () => {
    await as(OP);
    const none = await reply(ASKED, { evidence: [] });
    expect(none.ok ? "" : none.detail).toBe("evidence_required");
    const half = await reply(ASKED, { evidence: [], spoke: "Mr Tan" });
    expect(half.ok ? "" : half.detail).toBe("phone_incomplete");
  });

  it("requires the note for Reject and Other agreement", async () => {
    await as(OP);
    const r = await reply(ASKED, { response: "reject" });
    expect(r.ok ? "" : r.detail).toBe("response_note_required");
  });

  it("keeps scope honest: a whole-claim answer names no Unit; These Units needs this claim's own Units", async () => {
    await as(OP);
    const mixed = await reply(ASKED, { scope: "claim", units: [UNIT_A] });
    expect(mixed.ok ? "" : mixed.detail).toBe("scope_units_mismatch");
    const empty = await reply(ASKED, { scope: "units", units: [] });
    expect(empty.ok ? "" : empty.detail).toBe("units_required");
    const foreign = await reply(ASKED, { scope: "units", units: [UNIT_OTHER] });
    expect(foreign.ok ? "" : foreign.detail).toBe("unit_not_on_claim");
  });

  it("refuses an evidence path that is not a supplier-reply upload", async () => {
    await as(OP);
    const r = await reply(ASKED, { evidence: [{ path: "issue/x/y.jpg", kind: "photo" }] });
    expect(r.ok ? "" : r.detail).toBe("evidence_invalid");
  });

  it("records a whole-claim reply with its date and evidence; the claim reads it, the recorder is kept", async () => {
    await as(OP);
    const r = await reply(ASKED, { date: "2026-10-05" });
    expect(r.ok ? "" : r.why).toBe("");
    await q("reset role");
    const claim = await claimRow(ASKED);
    expect(claim.supplier_response).toBe("replacement");
    expect(claim.responded_by).toBe(OP);
    const row = (await q("select scope, unit_ids, supplier_date::text d, formal_at is not null formal, recorded_by from supplier_claim_replies where id = $1", [claim.supplier_response_reply_id])).rows[0];
    expect(row).toMatchObject({ scope: "claim", unit_ids: [], d: "2026-10-05", formal: true, recorded_by: OP });
  });

  it("appends a later answer for exact Units by phone and supersedes, keeping the first", async () => {
    await as(OP);
    const r = await reply(ASKED, { response: "repair", scope: "units", units: [UNIT_A], evidence: [], spoke: "Mr Tan", at: "2026-09-29T10:00:00+08:00" });
    expect(r.ok).toBe(true);
    await q("reset role");
    expect((await claimRow(ASKED)).supplier_response).toBe("repair");
    const rows = (await q("select response, scope from supplier_claim_replies where claim_id = $1 order by recorded_at, id", [ASKED])).rows;
    expect(rows.map((x) => x.response).sort()).toEqual(["repair", "replacement"]);
  });

  it("stores a reply before any ask as contact evidence; the ask makes it the formal reply", async () => {
    await as(OP);
    const r = await reply(EARLY, { response: "other_agreement", note: "Supplier offers a new cushion only" });
    expect(r.ok && (r.row.r as { formal: boolean }).formal).toBe(false);
    await q("reset role");
    expect((await claimRow(EARLY)).supplier_response).toBeNull();
    await as(OP);
    const ask = await attempt("select public.supplier_claim_record_request($1, 'repair', null) as r", [EARLY]);
    expect(ask.ok && (ask.row.r as { reply_promoted: boolean }).reply_promoted).toBe(true);
    await q("reset role");
    const claim = await claimRow(EARLY);
    expect(claim.supplier_response).toBe("other_agreement");
    expect(claim.supplier_response_note).toBe("Supplier offers a new cushion only");
  });

  it("records Claim sent to supplier in document_sends, and refuses a send with no recipient", async () => {
    await as(OP);
    const bad = await attempt("select public.supplier_claim_record_send($1, 'whatsapp', '  ', null) as r", [OTHER]);
    expect(bad.ok ? "" : bad.detail).toBe("recipient_required");
    const ok = await attempt("select public.supplier_claim_record_send($1, 'whatsapp', 'Hooka Mr Tan', null) as r", [OTHER]);
    expect(ok.ok).toBe(true);
    await q("reset role");
    const sent = (await q("select document_kind, version, channel, sent_by from document_sends where document_id = $1", [OTHER])).rows;
    expect(sent).toEqual([{ document_kind: "supplier_claim", version: 1, channel: "whatsapp", sent_by: OP }]);
  });

  it("snapshots the reply timing with the ask: 2 and 2 while Settings has no columns", async () => {
    await as(OP);
    const ask = await attempt("select public.supplier_claim_record_request($1, 'replace', null) as r", [TIMED]);
    expect(ask.ok ? "" : (ask as { why: string }).why).toBe("");
    await q("reset role");
    const row = (await q("select reply_waiting_days w, escalation_extra_days e from supplier_claims where id = $1", [TIMED])).rows[0];
    expect(row).toEqual({ w: 2, e: 2 });
  });

  it("reads 0606's Settings columns by name, and a later Settings change never moves an asked claim", async () => {
    await q("reset role");
    // Stand in for the Settings lane's 0606 inside this rolled-back transaction.
    await q("alter table purchasing_settings add column if not exists claim_reply_waiting_days int not null default 2, add column if not exists claim_escalation_extra_days int not null default 2");
    await q("update purchasing_settings set claim_reply_waiting_days = 3, claim_escalation_extra_days = 4");
    await as(OP);
    const ask = await attempt("select public.supplier_claim_record_request($1, 'repair', null) as r", [TIMED]);
    expect(ask.ok ? "" : (ask as { why: string }).why).toBe("");
    await q("reset role");
    await q("update purchasing_settings set claim_reply_waiting_days = 9, claim_escalation_extra_days = 9");
    const row = (await q("select reply_waiting_days w, escalation_extra_days e from supplier_claims where id = $1", [TIMED])).rows[0];
    expect(row).toEqual({ w: 3, e: 4 });
  });

  it("closes the scope-less legacy door to signed-in callers", async () => {
    await as(OP);
    const r = await attempt("select public.supplier_claim_record_response($1, 'repair', null) as r", [OTHER]);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.why).toMatch(/permission denied/);
  });
});
