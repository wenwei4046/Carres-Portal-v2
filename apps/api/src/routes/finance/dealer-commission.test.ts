import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = { SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "" };

async function get(path: string, role = "finance") {
  const jwt = await signTestJwt("11111111-1111-1111-1111-000000000001", { email: `${role}@x`, app_metadata: { role } });
  return app.fetch(new Request(`http://t/api/finance/dealer-commission${path}`, { headers: { Authorization: `Bearer ${jwt}` } }), env);
}

async function send(path: string, method: string, body?: unknown, role = "finance") {
  const jwt = await signTestJwt("11111111-1111-1111-1111-000000000001", { email: `${role}@x`, app_metadata: { role } });
  return app.fetch(new Request(`http://t/api/finance/dealer-commission${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
}

const MODEL = "22222222-2222-4222-8222-222222222222";
const DEALER = "33333333-3333-4333-8333-333333333333";

beforeEach(() => { useTestJwks(); vi.mocked(userClient).mockReset(); });
afterAll(() => _setJwksForTesting(null));

describe("/api/finance/dealer-commission", () => {
  it("reads the month's source with the first day of the month", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { orders: [] }, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    expect((await get("?month=2026-09")).status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("dealer_commission_source", { p_month: "2026-09-01" });
  });

  it("refuses operation and a missing month", async () => {
    expect((await get("?month=2026-09", "operation")).status).toBe(403);
    expect((await get("")).status).toBe(400);
  });

  // 0661 — the dated rates and switches.
  it("reads the rules through their read", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { rules: [] }, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    expect((await get("/rules")).status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("dealer_commission_rules_read");
    expect((await get("/rules", "operation")).status).toBe(403);
  });

  it.each([
    [{ kind: "standard", rate: 25, startsOn: "2026-11-01" },
      { p_kind: "standard", p_dealer_id: null, p_model_id: null, p_category: null, p_rate: 25, p_is_on: null }],
    [{ kind: "dealer", dealerId: DEALER, rate: 22, startsOn: "2026-11-01", memo: "Dealer memo" },
      { p_kind: "dealer", p_dealer_id: DEALER, p_model_id: null, p_rate: 22, p_memo: "Dealer memo" }],
    [{ kind: "product", modelId: MODEL, rate: 20, startsOn: "2026-11-01" },
      { p_kind: "product", p_model_id: MODEL, p_rate: 20, p_is_on: null }],
    [{ kind: "promotion", modelId: MODEL, isOn: true, points: 5, startsOn: "2026-11-01" },
      { p_kind: "promotion", p_model_id: MODEL, p_rate: 5, p_is_on: true }],
    [{ kind: "promotion", modelId: MODEL, isOn: false, points: 5, startsOn: "2026-12-01" },
      { p_kind: "promotion", p_model_id: MODEL, p_rate: null, p_is_on: false }],
    [{ kind: "category", category: "accessory", isOn: false, startsOn: "2027-01-01" },
      { p_kind: "category", p_category: "accessory", p_rate: null, p_is_on: false }],
  ])("adds %o through the add door", async (body, args) => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { id: "r1" }, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await send("/rules", "POST", body);
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith("dealer_commission_rule_add",
      expect.objectContaining({ ...args, p_starts_on: body.startsOn }));
  });

  it("refuses a rule of the wrong shape before the database, and keeps the database's sentence", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "There is already one for this from 1 Nov 2026. Remove it first.", details: "already_on_that_day" } }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    expect((await send("/rules", "POST", { kind: "standard", rate: 120, startsOn: "2026-11-01" })).status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
    const res = await send("/rules", "POST", { kind: "standard", rate: 25, startsOn: "2026-11-01" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await res.json())).toContain("There is already one for this from 1 Nov 2026");
  });

  it("removes a rule by its id, and refuses one that is not an id", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { id: MODEL, already: false }, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    expect((await send(`/rules/${MODEL}`, "DELETE")).status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("dealer_commission_rule_remove", { p_id: MODEL });
    expect((await send("/rules/not-an-id", "DELETE")).status).toBe(404);
  });

  it("the undated rate doors are gone", async () => {
    expect((await send("/settings", "PUT", { defaultRate: 30 })).status).toBe(404);
    expect((await send(`/rates/${MODEL}`, "PUT", { rate: 20 })).status).toBe(404);
  });
});
