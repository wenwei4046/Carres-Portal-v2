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

const THREAD_ID = "00000000-0000-0000-0000-00000000a001";

describe("POST /api/operation/orders/resume-dispatch", () => {
  it("calls operation_resume_dispatch_from_waiting RPC with p_thread_id", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { thread_id: THREAD_ID, operation_stage: "ready_to_dispatch", po_status_changed: true },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/orders/resume-dispatch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith(
      "operation_resume_dispatch_from_waiting",
      { p_thread_id: THREAD_ID },
    );
  });

  it("maps SQLSTATE 22023 (wrong stage) to 422", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "22023", message: "thread is not in waiting" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/orders/resume-dispatch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects dealer with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/operation/orders/resume-dispatch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("admits principal role (carry-forward route-mount-middleware-leak fix)", async () => {
    // Pre-fix this returned 403 because operationOrdersRouter's blanket
    // `use("*", ...)` middleware leaked across siblings. Inline allowlist
    // here is ["operation","principal"]; the post-fix per-route
    // requireOperation guard on operationOrdersRouter no longer leaks.
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: { thread_id: THREAD_ID, operation_stage: "ready_to_dispatch" }, error: null }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/operation/orders/resume-dispatch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: THREAD_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("operation_resume_dispatch_from_waiting", { p_thread_id: THREAD_ID });
  });

  it("rejects non-uuid threadId with 422", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/orders/resume-dispatch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: "4001" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("rejects missing threadId with 422", async () => {
    const sb = { rpc: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/orders/resume-dispatch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});
