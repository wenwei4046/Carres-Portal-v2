import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import { Hono } from "hono";
import { authMiddleware, _setJwksForTesting } from "../../middleware/auth";
import stockRouter from "./stock";
import type { AppEnv } from "../../types";

/**
 * Unit Detail `⋮` — Report a problem · Make available for sale · Count again
 * (Stock MASTER §6 · §7; migration 0589).
 *
 * What these tests hold:
 *  1. Report a problem goes through ONE door, `stock_unit_report_problem`,
 *     carrying the Issue facts the shared arithmetic derives, the file paths
 *     as proof lines and the GRN Duty action — never a second Issue writer.
 *  2. A counted row is not a Unit: 404, nothing written.
 *  3. A door's business refusal answers 409 with its sentence, not 500.
 *  4. Count again completes the open Not found action through the Issue
 *     Tracker's one result door with the next dated look.
 */

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
vi.mock("../../lib/actor-names", () => ({ resolveActorNames: vi.fn(async () => new Map([["11111111-1111-1111-1111-000000000999", "Shasha"]])) }));
import { userClient } from "../../lib/supabase";

const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "u" };

function buildApp() {
  const app = new Hono<AppEnv>();
  app.onError((err, c) => {
    const status = (err as { status?: number }).status ?? 500;
    return c.json({ error: "server_error", message: err instanceof Error ? err.message : "Internal server error" }, status as 400 | 401 | 403 | 404 | 409 | 500);
  });
  const api = new Hono<AppEnv>();
  api.use("*", authMiddleware);
  api.route("/ops/stock", stockRouter);
  app.route("/api", api);
  return app;
}
const app = buildApp();
const jwt = () => signTestJwt("11111111-1111-1111-1111-000000000999", { email: "shasha@carres.test", app_metadata: { role: "operation" } });

function unitRow(over: Record<string, unknown> = {}) {
  return {
    id: "u-1", unit_code: "U1-000-082", sku: "JAGER-SS", warehouse_id: "wh-klang", site_name: "Carres Klang",
    status: "free", condition: "new", needs_repair: false, hold_reason: null, reserved_ref: null, sold_order_id: null,
    availability: "available", identity_scope: "unit", ...over,
  };
}

function fakeSb(opts: { unit?: Record<string, unknown> | null; issues?: unknown[]; rpc?: (name: string, args: Record<string, unknown>) => { data: unknown; error: unknown } }) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const sb = {
    from(table: string) {
      const c: Record<string, unknown> = {};
      const rows = table === "stock_unit_register_v" ? (opts.unit === null ? [] : [opts.unit ?? unitRow()])
        : table === "issues" ? (opts.issues ?? [])
        : table === "product_skus" ? [{ sku: "JAGER-SS", variant: "Super Single", product_models: { name: "Jager" } }]
        : [];
      for (const m of ["select", "ilike", "eq", "not", "order", "in"]) c[m] = () => c;
      c.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
      c.then = (res: (v: unknown) => unknown) => res({ data: rows, error: null });
      return c;
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return Promise.resolve(opts.rpc ? opts.rpc(name, args) : { data: null, error: null });
    },
  };
  return { sb, rpcCalls };
}

beforeEach(() => { useTestJwks(); vi.mocked(userClient).mockReset(); });
afterAll(() => _setJwksForTesting(null));

const body = { requestId: "5f6b8b6a-1c1e-4a1e-9a1e-1c1e4a1e9a1e", problem: "damaged", note: "Corner of the headboard is cracked", evidence: [{ path: "unit/u-1/a.jpg", kind: "photo" }], observedOn: "2026-09-26" };

describe("POST /register/:unitCode/report-problem", () => {
  it("writes the Issue and the protective control through the one 0588 door", async () => {
    const { sb, rpcCalls } = fakeSb({ rpc: () => ({ data: { id: "issue-1", issue_no: "IS-0009", official_english: "…", replayed: false, protection: "held" }, error: null }) });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.request("/api/ops/stock/register/U1-000-082/report-problem", { method: "POST", headers: { Authorization: `Bearer ${await jwt()}`, "content-type": "application/json" }, body: JSON.stringify(body) }, env);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ issueId: "issue-1", issueNo: "IS-0009", protection: "held", action: { ownerRule: "grn_duty", action: "Check the damage on U1-000-082 and record the result", recipient: "Carres Klang" } });
    expect(rpcCalls).toHaveLength(1);
    const call = rpcCalls[0]!;
    expect(call.name).toBe("stock_unit_report_problem");
    expect(call.args).toMatchObject({ p_request_id: body.requestId, p_item_id: "u-1", p_observed: "damaged" });
    expect(call.args.p_issue).toMatchObject({ problem_object: "item", observed_problem: "damaged", source_module: "warehouse", found_by_kind: "warehouse", found_by_name: "Shasha", observed_on: "2026-09-26", affected_object: "Unit U1-000-082 · Jager · Super Single · JAGER-SS", optional_detail: body.note });
    expect(call.args.p_links).toEqual([{ kind: "unit", id: "u-1", label: "U1-000-082" }]);
    expect(call.args.p_evidence).toEqual([{ kind: "photo", label: "unit/u-1/a.jpg" }]);
    expect(String((call.args.p_issue as { official_english: string }).official_english)).toContain("was damaged when Warehouse checked U1-000-082 on 26 Sept 2026");
  });

  it("links the reserved Sales Order too, so Sales sees the risk", async () => {
    const { sb, rpcCalls } = fakeSb({ unit: unitRow({ status: "reserved", availability: "reserved", reserved_ref: "SO2609-4827", sold_order_id: "order-1" }), rpc: () => ({ data: { id: "i", issue_no: "IS-1", official_english: "…", replayed: false, protection: "reserved_at_risk" }, error: null }) });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.request("/api/ops/stock/register/U1-000-082/report-problem", { method: "POST", headers: { Authorization: `Bearer ${await jwt()}`, "content-type": "application/json" }, body: JSON.stringify(body) }, env);
    expect(res.status).toBe(201);
    expect(rpcCalls[0]!.args.p_links).toEqual([{ kind: "unit", id: "u-1", label: "U1-000-082" }, { kind: "sales_order", id: "order-1", label: "SO2609-4827" }]);
    expect(rpcCalls[0]!.args.p_issue).toMatchObject({ business_impact: "Sales Order SO2609-4827 is at risk" });
  });

  it("refuses a counted row — nothing is written", async () => {
    const { sb, rpcCalls } = fakeSb({ unit: unitRow({ identity_scope: "quantity", unit_code: "QTY-000000001" }) });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.request("/api/ops/stock/register/QTY-000000001/report-problem", { method: "POST", headers: { Authorization: `Bearer ${await jwt()}`, "content-type": "application/json" }, body: JSON.stringify(body) }, env);
    expect(res.status).toBe(404);
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses a report with no proof before any door is opened", async () => {
    const { sb, rpcCalls } = fakeSb({});
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.request("/api/ops/stock/register/U1-000-082/report-problem", { method: "POST", headers: { Authorization: `Bearer ${await jwt()}`, "content-type": "application/json" }, body: JSON.stringify({ ...body, evidence: [] }) }, env);
    expect(res.status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("POST /register/:unitCode/make-available", () => {
  it("answers a door's business refusal as 409 with its sentence", async () => {
    const { sb } = fakeSb({ rpc: () => ({ data: null, error: { code: "P0001", message: "a reported problem on this Unit is still open", details: "problem_open" } }) });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.request("/api/ops/stock/register/U1-000-082/make-available", { method: "POST", headers: { Authorization: `Bearer ${await jwt()}`, "content-type": "application/json" }, body: "{}" }, env);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ message: "a reported problem on this Unit is still open" });
  });

  it("returns the door's answer when the Unit comes back", async () => {
    const { sb, rpcCalls } = fakeSb({ rpc: () => ({ data: { item_id: "u-1", status: "free", availability: "available" }, error: null }) });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.request("/api/ops/stock/register/U1-000-082/make-available", { method: "POST", headers: { Authorization: `Bearer ${await jwt()}`, "content-type": "application/json" }, body: "{}" }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ item_id: "u-1", status: "free", availability: "available" });
    expect(rpcCalls[0]).toEqual({ name: "stock_unit_make_available", args: { p_item_id: "u-1" } });
  });
});

describe("POST /register/:unitCode/count-again", () => {
  const issue = { id: "issue-1", issue_no: "IS-0007", status: "open", observed_problem: "missing", official_english: "…", observed_on: "2026-09-25", issue_links: [{ object_kind: "unit", object_id: "u-1" }], issue_actions: [{ id: "act-1", status: "open", trigger: "t", owner_rule: "grn_duty", action: "Look for U1-000-082 at Carres Klang and scan it again", recipient: "Carres Klang", required_result: "r", due_on: "2026-09-26" }] };

  it("completes the open Not found action through the Issue result door with the next dated look", async () => {
    const { sb, rpcCalls } = fakeSb({ issues: [issue], rpc: () => ({ data: { ok: true }, error: null }) });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.request("/api/ops/stock/register/U1-000-082/count-again", { method: "POST", headers: { Authorization: `Bearer ${await jwt()}`, "content-type": "application/json" }, body: "{}" }, env);
    expect(res.status).toBe(200);
    expect(rpcCalls[0]!.name).toBe("issue_record_action_result");
    expect(rpcCalls[0]!.args).toMatchObject({ p_issue_id: "issue-1", p_action_id: "act-1", p_result_code: "answer_recorded", p_result: "Count again requested" });
    expect(rpcCalls[0]!.args.p_next_action).toMatchObject({ ownerRule: "grn_duty", action: "Look for U1-000-082 at Carres Klang and scan it again", recipient: "Carres Klang" });
  });

  it("refuses when no open Not found report names the Unit", async () => {
    const { sb, rpcCalls } = fakeSb({ issues: [{ ...issue, observed_problem: "damaged" }] });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.request("/api/ops/stock/register/U1-000-082/count-again", { method: "POST", headers: { Authorization: `Bearer ${await jwt()}`, "content-type": "application/json" }, body: "{}" }, env);
    expect(res.status).toBe(409);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("GET /register/:unitCode/issues", () => {
  it("reads the open Issues that name this Unit with their current action", async () => {
    const { sb } = fakeSb({ issues: [{ id: "issue-1", issue_no: "IS-0007", status: "open", observed_problem: "missing", official_english: "…", observed_on: "2026-09-25", issue_links: [], issue_actions: [{ id: "act-0", status: "completed", trigger: "t", owner_rule: "grn_duty", action: "old", recipient: "x", required_result: "r", due_on: "2026-09-24" }, { id: "act-1", status: "open", trigger: "t", owner_rule: "grn_duty", action: "Look for U1-000-082 at Carres Klang and scan it again", recipient: "Carres Klang", required_result: "r", due_on: "2026-09-26" }] }] });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.request("/api/ops/stock/register/U1-000-082/issues", { headers: { Authorization: `Bearer ${await jwt()}` } }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ issues: [{ id: "issue-1", issueNo: "IS-0007", status: "open", observedProblem: "missing", officialEnglish: "…", observedOn: "2026-09-25", currentAction: { id: "act-1", trigger: "t", ownerRule: "grn_duty", action: "Look for U1-000-082 at Carres Klang and scan it again", recipient: "Carres Klang", requiredResult: "r", dueOn: "2026-09-26" } }] });
  });
});
