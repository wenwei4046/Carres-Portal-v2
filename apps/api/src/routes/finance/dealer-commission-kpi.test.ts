import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

/**
 * 0665 — the KPI allowance rules Finance keeps (rules 8.1–8.3), and a
 * renovation rebate whose total is filled in later (7.3).
 */
const env = { SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "" };
const RULE = "00000000-0000-4000-8000-0000000000c1";
const GRT = "00000000-0000-4000-8000-0000000000c2";
const DEALER = "00000000-0000-4000-8000-000000000d01";

async function call(path: string, opts: { role?: string; method?: string; body?: unknown } = {}) {
  const role = opts.role ?? "finance";
  const jwt = await signTestJwt("11111111-1111-1111-1111-000000000001", { email: `${role}@x`, app_metadata: { role } });
  return app.fetch(new Request(`http://t/api/finance/dealer-commission${path}`, {
    method: opts.method ?? "GET",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  }), env);
}

function stub(data: unknown = { ok: true }) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const sb = { rpc: vi.fn().mockResolvedValue({ data, error: null }), from: vi.fn(() => ({ upsert })) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(sb as any);
  return { sb, upsert };
}

beforeEach(() => { useTestJwks(); vi.mocked(userClient).mockReset(); });
afterAll(() => _setJwksForTesting(null));

const body = {
  startsOn: "2026-07-22", modelId: GRT, perUnit: 10, period: "month",
  tiers: [{ units: 5, bonus: 50 }, { units: 20, bonus: 300 }], memo: "Memo",
};

describe("the KPI allowance rules (0665)", () => {
  it("reads, adds and removes through the doors", async () => {
    const { sb } = stub({ id: RULE });
    expect((await call("/kpi-rules")).status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("dealer_kpi_rules_read");
    expect((await call("/kpi-rules", { method: "POST", body })).status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith("dealer_kpi_rule_add", {
      p_starts_on: "2026-07-22", p_model_id: GRT, p_per_unit: 10,
      p_tiers: body.tiers, p_period: "month", p_memo: "Memo",
    });
    expect((await call(`/kpi-rules/${RULE}`, { method: "DELETE" })).status).toBe(200);
    expect(sb.rpc).toHaveBeenLastCalledWith("dealer_kpi_rule_remove", { p_id: RULE });
    expect((await call("/kpi-rules/not-an-id", { method: "DELETE" })).status).toBe(404);
  });

  it("refuses half a sen, a tier of no guarantees, another period, and anyone but Finance", async () => {
    const { sb } = stub();
    expect((await call("/kpi-rules", { method: "POST", body: { ...body, perUnit: 10.005 } })).status).toBe(422);
    expect((await call("/kpi-rules", { method: "POST", body: { ...body, tiers: [{ units: 0, bonus: 1 }] } })).status).toBe(422);
    expect((await call("/kpi-rules", { method: "POST", body: { ...body, period: "week" } })).status).toBe(422);
    expect((await call("/kpi-rules", { role: "operation" })).status).toBe(403);
    expect((await call("/kpi-rules", { method: "POST", role: "operation", body })).status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

describe("a renovation rebate whose total is filled in later (7.3)", () => {
  it("saves a rebate with no total", async () => {
    const { upsert } = stub();
    const res = await call(`/quotas/${DEALER}`, { method: "PUT", body: { quota: null, rebateRate: 5, startsOn: "2026-10-01" } });
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({ dealer_id: DEALER, quota: null, rebate_rate: 5, starts_on: "2026-10-01" });
  });
});
