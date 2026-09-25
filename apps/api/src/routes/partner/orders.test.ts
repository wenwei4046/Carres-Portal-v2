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

const PARTNER_ID = "11111111-1111-1111-1111-111111111111";
const ORDER_ID   = "22222222-2222-2222-2222-222222222222";

async function makeJwt(role: string, partnerId?: string) {
  return signTestJwt("33333333-3333-3333-3333-333333333333", { email: `${role}@x`, app_metadata: { role, partner_id: partnerId } });
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

// =============================================================================
// /api/partner/orders/:id/accept — lp_accept_order RPC wrapper.
// Migration 0147 (item h, 2026-05-23).
// =============================================================================
describe("POST /api/partner/orders/:id/accept", () => {
  it("returns 200 and forwards p_order_id to lp_accept_order RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { order_id: ORDER_ID, so: 4001, partner_accepted_at: new Date().toISOString() },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);

    const jwt = await makeJwt("partner", PARTNER_ID);
    const res = await app.fetch(
      new Request(`http://t/api/partner/orders/${ORDER_ID}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("lp_accept_order", { p_order_id: ORDER_ID });
  });

  it("returns 422 when body has extra keys (strict zod)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);

    const jwt = await makeJwt("partner", PARTNER_ID);
    const res = await app.fetch(
      new Request(`http://t/api/partner/orders/${ORDER_ID}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ unexpected: "field" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 403 for non-partner role", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/partner/orders/${ORDER_ID}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 403 for partner with no partner_id on JWT", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);

    const jwt = await makeJwt("partner"); // no partnerId
    const res = await app.fetch(
      new Request(`http://t/api/partner/orders/${ORDER_ID}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps RPC 22023 wrong-stage style errors through mapPgError", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", message: "order is in rejected state", details: "order_rejected" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);

    const jwt = await makeJwt("partner", PARTNER_ID);
    const res = await app.fetch(
      new Request(`http://t/api/partner/orders/${ORDER_ID}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// =============================================================================
// /api/partner/orders/:id/reject — lp_reject_order RPC wrapper.
// =============================================================================
describe("POST /api/partner/orders/:id/reject", () => {
  it("returns 200 and forwards p_order_id + p_reason", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        order_id: ORDER_ID,
        so: 4001,
        partner_rejected_at: new Date().toISOString(),
        partner_rejected_reason: "out of capacity",
      },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);

    const jwt = await makeJwt("partner", PARTNER_ID);
    const res = await app.fetch(
      new Request(`http://t/api/partner/orders/${ORDER_ID}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "out of capacity" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("lp_reject_order", {
      p_order_id: ORDER_ID,
      p_reason: "out of capacity",
    });
  });

  it("returns 422 when reason is missing (zod required)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);

    const jwt = await makeJwt("partner", PARTNER_ID);
    const res = await app.fetch(
      new Request(`http://t/api/partner/orders/${ORDER_ID}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 422 when reason is empty / whitespace-only", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);

    const jwt = await makeJwt("partner", PARTNER_ID);
    const res = await app.fetch(
      new Request(`http://t/api/partner/orders/${ORDER_ID}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "   " }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 422 when reason exceeds 500 chars", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);

    const jwt = await makeJwt("partner", PARTNER_ID);
    const res = await app.fetch(
      new Request(`http://t/api/partner/orders/${ORDER_ID}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "a".repeat(501) }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 403 for non-partner role", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/partner/orders/${ORDER_ID}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "x" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
