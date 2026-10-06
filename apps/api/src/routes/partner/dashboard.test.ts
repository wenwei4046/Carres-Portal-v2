import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};

async function makeJwt(role: string, partnerId?: string) {
  return signTestJwt("11111111-1111-1111-1111-000000000001", { email: `${role}@x`, app_metadata: { role, partner_id: partnerId } });
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

describe("GET /api/partner/dashboard", () => {
  it("returns KPI counts for the authenticated LP", async () => {
    const sb = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              { id: "po1", sup_status: "pickup_assigned" },
              { id: "po2", sup_status: "picked_up" },
              { id: "po3", sup_status: "delivered" },
            ],
            error: null,
          }),
        }),
      })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", "11111111-1111-1111-1111-aaaaaaaaaaaa");
    const res = await app.fetch(
      new Request("http://t/api/partner/dashboard", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, number>;
    expect(body.assigned).toBe(1);
    expect(body.in_transit).toBe(1);
    expect(body.delivered).toBe(1);
    expect(body.total).toBe(3);
  });

  it("rejects non-partner with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/partner/dashboard", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
