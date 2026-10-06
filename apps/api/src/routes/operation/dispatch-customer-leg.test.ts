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

async function makeJwt(role: string) {
  return signTestJwt("u1", { email: `${role}@x`, app_metadata: { role } });
}

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

const LP_ID = "00000000-0000-0000-0000-0000000001f1";
const THREAD_ID = "00000000-0000-0000-0000-0000000200a1";

describe("POST /api/operation/pos/dispatch-customer-leg", () => {
  it("Force=true → calls RPC with p_thread_id + p_force_dispatch=true", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { mode: "force" }, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/dispatch-customer-leg", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: THREAD_ID,
          partnerId: LP_ID,
          confirmDeliveryDate: "2026-05-20",
          forceDispatch: true,
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("operation_dispatch_customer_leg", {
      p_thread_id: THREAD_ID,
      p_partner_id: LP_ID,
      p_confirm_delivery_date: "2026-05-20",
      p_force_dispatch: true,
    });
  });

  it("RFD path: forceDispatch defaults to false", async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { mode: "rfd" }, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/dispatch-customer-leg", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID, partnerId: LP_ID, confirmDeliveryDate: "2026-05-20" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("operation_dispatch_customer_leg", {
      p_thread_id: THREAD_ID,
      p_partner_id: LP_ID,
      p_confirm_delivery_date: "2026-05-20",
      p_force_dispatch: false,
    });
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/dispatch-customer-leg", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID, partnerId: LP_ID, confirmDeliveryDate: "2026-05-20" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("rejects non-uuid threadId with 422", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/dispatch-customer-leg", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: "PO-200",
          partnerId: LP_ID,
          confirmDeliveryDate: "2026-05-20",
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("rejects missing partnerId with 422", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/dispatch-customer-leg", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID, confirmDeliveryDate: "2026-05-20" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("rejects partner role with 403", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("partner");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/dispatch-customer-leg", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID, partnerId: LP_ID, confirmDeliveryDate: "2026-05-20" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("admits principal role (carry-forward route-mount-middleware-leak fix)", async () => {
    // Pre-fix this returned 403 because operationPosRouter's blanket
    // `use("*", ...)` middleware leaked across siblings; the post-fix per-route
    // requireOperation guard on operationPosRouter no longer touches this
    // sibling, so the inline allowlist `["operation","principal"]` is the gate.
    const sb = { rpc: vi.fn().mockResolvedValue({ data: { mode: "rfd" }, error: null }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/dispatch-customer-leg", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID, partnerId: LP_ID, confirmDeliveryDate: "2026-05-20" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("operation_dispatch_customer_leg", expect.any(Object));
  });

  it("rejects invalid confirmDeliveryDate format with 422", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/dispatch-customer-leg", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: THREAD_ID,
          partnerId: LP_ID,
          confirmDeliveryDate: "20-05-2026",
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});
