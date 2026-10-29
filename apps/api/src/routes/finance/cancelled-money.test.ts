import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = { SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "" };

function stubRpc(result: { data: unknown; error: unknown }) {
  const sb = { rpc: vi.fn().mockResolvedValue(result) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(sb as any);
  return sb;
}

async function get(role: string, method = "GET") {
  const jwt = await signTestJwt("11111111-1111-1111-1111-000000000001", { email: `${role}@x`, app_metadata: { role } });
  return app.fetch(
    new Request("http://t/api/finance/cancelled-money", { method, headers: { Authorization: `Bearer ${jwt}` } }),
    env,
  );
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

describe("/api/finance/cancelled-money", () => {
  it("refuses operation before the database", async () => {
    const sb = stubRpc({ data: [], error: null });
    expect((await get("operation")).status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("returns the one read function's rows to finance", async () => {
    const rows = [{ order_id: "o1", so: 7, customer_name: "Amy", paid: 500, refunded: 100, held: 400, cancelled_at: "2026-10-01T00:00:00Z" }];
    const sb = stubRpc({ data: rows, error: null });
    const res = await get("finance");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rows);
    expect(sb.rpc).toHaveBeenCalledWith("finance_cancelled_orders_holding_money");
  });

  it("has no write door", async () => {
    const sb = stubRpc({ data: [], error: null });
    expect((await get("finance", "POST")).status).toBeGreaterThanOrEqual(400);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});
