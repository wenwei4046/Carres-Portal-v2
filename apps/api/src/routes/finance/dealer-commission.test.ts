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
});
