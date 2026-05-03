import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string, dealerId: string | null = null) {
  return new SignJWT({
    email: `${role}@carres.com`,
    app_metadata: { role, ...(dealerId ? { dealer_id: dealerId } : {}) },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

type ChainCall = { method: string; args: unknown[] };
type ListMock = {
  rows: unknown[];
  calls: ChainCall[];
};

/**
 * Mocks the PostgREST chain for the approvals list route:
 *   sb.from('approvals').select('*').order('created_at',…).eq(…).eq(…).neq(…)
 *
 * The chain terminates by being awaited (`then` resolves with `{data, error}`),
 * so we record every method call into `calls` for later assertion and finally
 * resolve with `rows`.
 */
function buildListMock(rows: unknown[]): { sb: unknown; mock: ListMock } {
  const calls: ChainCall[] = [];
  const chain: Record<string, unknown> = {};
  chain.select = (...args: unknown[]) => {
    calls.push({ method: "select", args });
    return chain;
  };
  chain.order = (...args: unknown[]) => {
    calls.push({ method: "order", args });
    return chain;
  };
  chain.eq = (...args: unknown[]) => {
    calls.push({ method: "eq", args });
    return chain;
  };
  chain.neq = (...args: unknown[]) => {
    calls.push({ method: "neq", args });
    return chain;
  };
  chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: rows, error: null });

  const sb = {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return chain;
    },
  };
  return { sb, mock: { rows, calls } };
}

/**
 * Mocks the .rpc('approval_decide', …) call. Captures invocation args and
 * returns either the success row or a fabricated PostgrestError-shape on
 * `rpcError`.
 */
function buildRpcMock(opts: {
  result?: unknown;
  rpcError?: { code?: string; message?: string; details?: string };
}): { sb: unknown; calls: Array<{ name: string; args: unknown }> } {
  const calls: Array<{ name: string; args: unknown }> = [];
  const sb = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      return { data: opts.result ?? null, error: null };
    },
  };
  return { sb, calls };
}

beforeAll(async () => {
  const kp = await generateKeyPair("ES256", { extractable: true });
  signKey = kp.privateKey;
  publicJwk = await exportJWK(kp.publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
});

beforeEach(() => {
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

describe("GET /api/approvals", () => {
  it("200 — lists pending approvals (default), excludes discount via .neq", async () => {
    const rows = [
      { id: "a1", kind: "refund", status: "pending", title: "Refund · RM 100", actor: "F", created_at: "2026-05-03T00:00:00Z" },
      { id: "a2", kind: "new_dealer", status: "pending", title: "New dealer · BedHouse JB", actor: "HQ · Sara", created_at: "2026-05-02T00:00:00Z" },
    ];
    const { sb, mock } = buildListMock(rows);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/approvals", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { approvals: typeof rows };
    expect(body.approvals).toHaveLength(2);
    expect(body.approvals.every((a) => a.status === "pending")).toBe(true);
    expect(body.approvals.every((a) => a.kind !== "discount")).toBe(true);
    // Default status='pending' got applied as .eq, and discount was excluded via .neq
    expect(mock.calls).toContainEqual({ method: "eq", args: ["status", "pending"] });
    expect(mock.calls).toContainEqual({ method: "neq", args: ["kind", "discount"] });
  });

  it("200 — filter status=approved applies eq('status','approved')", async () => {
    const rows = [
      { id: "a3", kind: "refund", status: "approved", title: "Refund · RM 50", actor: "F", created_at: "2026-05-01T00:00:00Z" },
    ];
    const { sb, mock } = buildListMock(rows);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/approvals?status=approved", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { approvals: typeof rows };
    expect(body.approvals.every((a) => a.status === "approved")).toBe(true);
    expect(mock.calls).toContainEqual({ method: "eq", args: ["status", "approved"] });
  });

  it("200 — status=all skips the .eq('status', …) filter", async () => {
    const { sb, mock } = buildListMock([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/approvals?status=all", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    expect(mock.calls.find((c) => c.method === "eq" && (c.args as unknown[])[0] === "status")).toBeUndefined();
  });

  it("403 for dealer (no Supabase round-trip)", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("dealer", "00000000-0000-0000-0000-000000000d01");
    const res = await app.fetch(
      new Request("http://t/api/approvals", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("POST /api/approvals/:id/decide", () => {
  const APPROVAL_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("200 — approves a pending refund and returns updated approval row", async () => {
    const { sb, calls } = buildRpcMock({
      result: {
        id: APPROVAL_ID,
        kind: "refund",
        status: "approved",
        title: "Refund · RM 100",
        decision_note: "looks good",
        decided_at: "2026-05-03T01:00:00Z",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/approvals/${APPROVAL_ID}/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved", note: "looks good" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { approval: { status: string; decision_note: string } };
    expect(body.approval.status).toBe("approved");
    expect(body.approval.decision_note).toBe("looks good");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("approval_decide");
    expect(calls[0]?.args).toEqual({
      p_id: APPROVAL_ID,
      p_status: "approved",
      p_note: "looks good",
    });
  });

  it("422 — invalid input (empty body has no status)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/approvals/${APPROVAL_ID}/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error).toBe("invalid_input");
    expect(body.code).toBe("invalid_param");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("403 for dealer — rpc not called", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer", "00000000-0000-0000-0000-000000000d01");
    const res = await app.fetch(
      new Request(`http://t/api/approvals/${APPROVAL_ID}/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
