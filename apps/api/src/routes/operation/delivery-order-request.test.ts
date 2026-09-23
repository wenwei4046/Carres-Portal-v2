/**
 * 0571 · POST /api/operation/orders/:id/delivery-order/request — money owed
 * WARNS. The first press sends no body and gets 409 with the amount; the same
 * request with `confirm_owed` passes that amount to the one issuing path.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(() => ({})), adminClient: vi.fn(() => ({})) }));
vi.mock("../../lib/delivery-order-issue", async (orig) => ({
  ...(await orig<typeof import("../../lib/delivery-order-issue")>()),
  attemptDeliveryOrderIssue: vi.fn(),
}));
import { attemptDeliveryOrderIssue } from "../../lib/delivery-order-issue";

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};
const ORDER_ID = "00000000-0000-0000-0000-00000000010a";
const URL = `http://t/api/operation/orders/${ORDER_ID}/delivery-order/request`;
const WARNING = "RM 1,050.50 is still outstanding. Confirm to issue the delivery order anyway.";

async function post(body?: unknown) {
  const jwt = await signTestJwt("u1", { email: "operation@x", app_metadata: { role: "operation" } });
  return app.fetch(
    new Request(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(attemptDeliveryOrderIssue).mockReset();
});
afterAll(() => _setJwksForTesting(null));

describe("POST /:id/delivery-order/request — 0571 money owed warns", () => {
  it("no body: 409 with the warning and the amount, and nothing confirmed", async () => {
    vi.mocked(attemptDeliveryOrderIssue).mockResolvedValue({ outcome: "owed", owed: 1050.5, message: WARNING });
    const res = await post();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "delivery_money_owed",
      code: "delivery_money_owed",
      message: WARNING,
      owed: 1050.5,
    });
    expect(attemptDeliveryOrderIssue).toHaveBeenCalledWith(expect.anything(), ORDER_ID, {
      waitBookingConfirm: false,
      confirmOwed: undefined,
    });
  });

  it("confirm_owed: the amount reaches the issuing path and the document issues", async () => {
    vi.mocked(attemptDeliveryOrderIssue).mockResolvedValue({ outcome: "issued", doNumber: "DO-230926-0001" });
    const res = await post({ confirm_owed: 1050.5 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ order: { id: ORDER_ID, do_number: "DO-230926-0001" }, issued: true });
    expect(attemptDeliveryOrderIssue).toHaveBeenCalledWith(expect.anything(), ORDER_ID, {
      waitBookingConfirm: false,
      confirmOwed: 1050.5,
    });
  });

  it("a confirmation that is not a positive amount is refused before any issue", async () => {
    for (const bad of [{ confirm_owed: -1 }, { confirm_owed: "1050.50" }, { confirm_owed: 1, extra: true }]) {
      const res = await post(bad);
      expect(res.status).toBe(400);
    }
    expect(attemptDeliveryOrderIssue).not.toHaveBeenCalled();
  });
});
