import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import { Hono } from "hono";
import { authMiddleware, _setJwksForTesting } from "../../middleware/auth";
import stockRouter from "./stock";
import type { AppEnv } from "../../types";

/**
 * Outbound `Return to supplier` — the supplier collects exact Units of a
 * Purchase Return (Stock MASTER §12.8, Purchasing §9.6; migration 0612).
 *
 * What these tests hold:
 *  1. The pickup goes through ONE door, `stock_record_supplier_return_pickup`,
 *     with the exact Units, the collector, the actual time and the proof as
 *     sent — the route adds nothing and decides nothing.
 *  2. A body with no proof, no collector or no Unit is refused before any door.
 *  3. A door's business refusal is 422 with its sentence; a replay is 200.
 *  4. The listing shows only returns with a Unit still to collect.
 *
 * The door's own behaviour (partial pickup, replay, per-Unit claim check,
 * custody move, append-only) was proven on a replayed production schema
 * 2026-09-29; see the PR.
 */

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "u" };

function buildApp() {
  const app = new Hono<AppEnv>();
  app.onError((err, c) => {
    const status = (err as { status?: number }).status ?? 500;
    return c.json({ error: "server_error", message: err instanceof Error ? err.message : "Internal server error" }, status as 400 | 403 | 404 | 409 | 422 | 500);
  });
  const api = new Hono<AppEnv>();
  api.use("*", authMiddleware);
  api.route("/ops/stock", stockRouter);
  app.route("/api", api);
  return app;
}
const app = buildApp();
const jwt = (role = "operation") => signTestJwt("11111111-1111-1111-1111-000000000999", { email: "shasha@carres.test", app_metadata: { role } });

const PR = "33333333-0612-0000-0000-000000000001";
const U1 = "22222222-0612-0000-0000-000000000001";
const U2 = "22222222-0612-0000-0000-000000000002";

function fakeSb(opts: {
  rows?: Record<string, unknown[]>;
  rpc?: (name: string, args: Record<string, unknown>) => { data: unknown; error: unknown };
}) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const sb = {
    from(table: string) {
      const rows = opts.rows?.[table] ?? [];
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "not"]) c[m] = () => c;
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

const body = {
  requestId: "5f6b8b6a-1c1e-4a1e-9a1e-1c1e4a1e9a1e",
  unitIds: [U1, U2],
  collectorName: "Ah Kow (Nice Future driver)",
  pickedUpAt: "2026-09-29T09:30:00+08:00",
  proof: [{ path: "purchase_return/abc/1.jpg", kind: "photo" }],
  note: "Lorry WXY 1234",
};

async function post(payload: unknown) {
  return app.request(`/api/ops/stock/supplier-returns/${PR}/pickup`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await jwt()}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  }, env);
}

beforeEach(() => { useTestJwks(); vi.mocked(userClient).mockReset(); });
afterAll(() => _setJwksForTesting(null));

describe("POST /supplier-returns/:id/pickup", () => {
  it("records the pickup through the one 0612 door with exactly what was sent", async () => {
    const { sb, rpcCalls } = fakeSb({ rpc: () => ({ data: { handover_id: "h-1", pr_no: "PR-T0612", units: 2, open_units: 1, total_units: 3, replayed: false }, error: null }) });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ handoverId: "h-1", units: 2, openUnits: 1, totalUnits: 3, replayed: false });
    expect(rpcCalls).toEqual([{
      name: "stock_record_supplier_return_pickup",
      args: {
        p_request_id: body.requestId,
        p_purchase_return_id: PR,
        p_unit_ids: [U1, U2],
        p_collector_name: "Ah Kow (Nice Future driver)",
        p_picked_up_at: "2026-09-29T09:30:00+08:00",
        p_evidence: [{ path: "purchase_return/abc/1.jpg", kind: "photo" }],
        p_note: "Lorry WXY 1234",
      },
    }]);
  });

  it("answers a replay of the same request with 200 and records nothing new", async () => {
    const { sb } = fakeSb({ rpc: () => ({ data: { handover_id: "h-1", units: 2, open_units: 1, total_units: 3, replayed: true }, error: null }) });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ handoverId: "h-1", replayed: true });
  });

  it.each([
    ["no proof", { ...body, proof: [] }],
    ["no collector", { ...body, collectorName: " " }],
    ["no Unit", { ...body, unitIds: [] }],
    ["a time with no offset", { ...body, pickedUpAt: "2026-09-29 09:30" }],
    ["a proof that is not a photo, video or PDF", { ...body, proof: [{ path: "x", kind: "note" }] }],
  ])("refuses %s before any door is opened", async (_label, payload) => {
    const { sb, rpcCalls } = fakeSb({});
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(payload);
    expect(res.status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it("passes the door's business refusal through as 422 with its sentence", async () => {
    const { sb } = fakeSb({ rpc: () => ({ data: null, error: { code: "P0001", message: "Unit U1-912-001 on PR-T0612 was already picked up", details: "already_picked_up" } }) });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await post(body);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ message: "Unit U1-912-001 on PR-T0612 was already picked up" });
  });

  it("refuses a request id another person already used", async () => {
    const { sb } = fakeSb({ rpc: () => ({ data: null, error: { code: "23505", message: "request id already used" } }) });
    vi.mocked(userClient).mockReturnValue(sb as never);
    expect((await post(body)).status).toBe(409);
  });

  it("answers 404 for a return id that is not an id", async () => {
    const { sb, rpcCalls } = fakeSb({});
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.request("/api/ops/stock/supplier-returns/not-an-id/pickup", {
      method: "POST", headers: { Authorization: `Bearer ${await jwt()}`, "content-type": "application/json" }, body: JSON.stringify(body),
    }, env);
    expect(res.status).toBe(404);
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses a caller who is not Operation", async () => {
    const { sb, rpcCalls } = fakeSb({});
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.request(`/api/ops/stock/supplier-returns/${PR}/pickup`, {
      method: "POST", headers: { Authorization: `Bearer ${await jwt("dealer")}`, "content-type": "application/json" }, body: JSON.stringify(body),
    }, env);
    expect(res.status).toBe(403);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("GET /supplier-returns", () => {
  it("lists only returns with a Unit still to collect, earliest Confirmed Pickup first", async () => {
    const { sb } = fakeSb({
      rows: {
        purchase_return_units: [
          { purchase_return_id: "pr-done", stock_item_id: "a", unit_code: "U1-900-001", item: "Forte · King", item_spec: null, pickup_location: "Carres Klang", return_to: "Nice Future, Kajang", actual_pickup_date: "2026-09-28T02:00:00Z", collected_by_name: "Ah Kow" },
          { purchase_return_id: "pr-late", stock_item_id: "b", unit_code: "U1-900-002", item: "Sonic · Queen", item_spec: null, pickup_location: "Carres Klang", return_to: "Nice Future, Kajang", actual_pickup_date: null, collected_by_name: null },
          { purchase_return_id: "pr-soon", stock_item_id: "c", unit_code: "U1-900-003", item: "Cody · King", item_spec: null, pickup_location: "PJ Showroom", return_to: "Hookka, Muar", actual_pickup_date: "2026-09-28T02:00:00Z", collected_by_name: "Lim" },
          { purchase_return_id: "pr-soon", stock_item_id: "d", unit_code: "U1-900-004", item: "Cody · King", item_spec: null, pickup_location: "PJ Showroom", return_to: "Hookka, Muar", actual_pickup_date: null, collected_by_name: null },
        ],
        purchase_returns: [
          { id: "pr-late", pr_no: "PR-0002", pr_doc_date: "2026-09-20", confirmed_pickup_date: "2026-10-03", supplier_id: "s-nf" },
          { id: "pr-soon", pr_no: "PR-0003", pr_doc_date: "2026-09-21", confirmed_pickup_date: "2026-09-30", supplier_id: "s-hk" },
        ],
        suppliers: [{ id: "s-nf", name: "Nice Future" }, { id: "s-hk", name: "Hookka Industries" }],
      },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await app.request("/api/ops/stock/supplier-returns", { headers: { Authorization: `Bearer ${await jwt()}` } }, env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { returns: Array<{ prNo: string; supplier: string; units: Array<{ unitCode: string; actualPickupDate: string | null }> }> };
    expect(json.returns.map((r) => r.prNo)).toEqual(["PR-0003", "PR-0002"]);
    expect(json.returns[0]).toMatchObject({ supplier: "Hookka Industries", confirmedPickupDate: "2026-09-30" });
    // A partly collected return keeps every Unit, so the screen can say which are still open.
    expect(json.returns[0]!.units.map((u) => [u.unitCode, u.actualPickupDate])).toEqual([["U1-900-003", "2026-09-28T02:00:00Z"], ["U1-900-004", null]]);
  });
});
