import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
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
const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000001")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
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

const ORDER_ID = "00000000-0000-0000-0000-0000000fe001";
const EXC_ID = "00000000-0000-0000-0000-0000000fe002";

const OPEN_ROW = {
  id: EXC_ID,
  order_id: ORDER_ID,
  status: "open",
  reason: "Chargeback under investigation",
  opened_at: "2026-08-16T02:00:00Z",
  cleared_at: null,
  clear_evidence: null,
};

/** Mocks the RPC surface and the one read this router makes. */
function mockSb(opts: {
  rpcRow?: unknown;
  rpcErr?: { code: string; message: string } | null;
  listRows?: unknown[];
  listErr?: { code: string; message: string } | null;
} = {}) {
  const rpc = vi.fn().mockResolvedValue({
    data: opts.rpcRow ?? OPEN_ROW,
    error: opts.rpcErr ?? null,
  });
  const order = vi
    .fn()
    .mockResolvedValue({ data: opts.listRows ?? [OPEN_ROW], error: opts.listErr ?? null });
  const from = vi.fn().mockReturnValue({
    select: () => ({ eq: () => ({ order }) }),
  });
  vi.mocked(userClient).mockReturnValue({ rpc, from } as never);
  return { rpc, from };
}

async function call(
  path: string,
  role: string,
  init: { method?: string; body?: unknown } = {},
) {
  const jwt = await makeJwt(role);
  return app.fetch(
    new Request(`http://t/api/finance/exceptions${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    }),
    env,
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ⭐ FINANCE, AND ONLY FINANCE. The middleware is the readable refusal; the RPC
 * refuses again in the database. This block covers the first.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("only Finance may write", () => {
  it("refuses an operation user opening an exception", async () => {
    mockSb();
    const res = await call("/open", "operation", {
      method: "POST",
      body: { orderId: ORDER_ID, reason: "Chargeback" },
    });
    expect(res.status).toBe(403);
  });

  it("refuses an operation user clearing one", async () => {
    mockSb();
    const res = await call(`/${EXC_ID}/clear`, "operation", {
      method: "POST",
      body: { evidence: "Bank confirmed" },
    });
    expect(res.status).toBe(403);
  });

  it("refuses a dealer outright", async () => {
    mockSb();
    const res = await call("/open", "dealer", {
      method: "POST",
      body: { orderId: ORDER_ID, reason: "Chargeback" },
    });
    expect(res.status).toBe(403);
  });

  it("admits finance", async () => {
    const { rpc } = mockSb();
    const res = await call("/open", "finance", {
      method: "POST",
      body: { orderId: ORDER_ID, reason: "Chargeback under investigation" },
    });
    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("finance_exception_open", {
      p_order_id: ORDER_ID,
      p_reason: "Chargeback under investigation",
    });
  });

  it("admits principal — the go-live fallback, same as every finance route", async () => {
    mockSb();
    const res = await call("/open", "principal", {
      method: "POST",
      body: { orderId: ORDER_ID, reason: "Chargeback under investigation" },
    });
    expect(res.status).toBe(201);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * THE READ IS WIDER THAN THE WRITE — the route canvas has to show WHY.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("any internal role may read", () => {
  it("lets operation read the exceptions on an order", async () => {
    mockSb({ listRows: [OPEN_ROW] });
    const res = await call(`/${ORDER_ID}`, "operation");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([OPEN_ROW]);
  });

  it("returns an empty list rather than an error when nothing is held", async () => {
    mockSb({ listRows: [] });
    const res = await call(`/${ORDER_ID}`, "finance");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * EVIDENCE IS REQUIRED TO CLEAR — refused before it reaches the database.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("clearing costs evidence", () => {
  it("refuses a blank evidence string", async () => {
    const { rpc } = mockSb();
    const res = await call(`/${EXC_ID}/clear`, "finance", {
      method: "POST",
      body: { evidence: "   " },
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a missing evidence field", async () => {
    const { rpc } = mockSb();
    const res = await call(`/${EXC_ID}/clear`, "finance", { method: "POST", body: {} });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("clears with evidence, and passes it through untouched", async () => {
    const { rpc } = mockSb({
      rpcRow: { ...OPEN_ROW, status: "cleared", clear_evidence: "Bank confirmed — ref 8821" },
    });
    const res = await call(`/${EXC_ID}/clear`, "finance", {
      method: "POST",
      body: { evidence: "Bank confirmed — ref 8821" },
    });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("finance_exception_clear", {
      p_id: EXC_ID,
      p_evidence: "Bank confirmed — ref 8821",
    });
  });

  it("⭐ Slice 2 — the clear is a gate flip: the response carries the auto-issue result, fail-soft", async () => {
    /* The cleared row names its order, so the route hands it to the SYSTEM's
       delivery-order issue (owner ruling 2026-08-16, rule 12). This mock has
       no bookable context, so the courtesy MISSES — and the clear must still
       succeed with `autoDeliveryOrder: null`, because an automatic step never
       turns a successful clear into an error. */
    mockSb({
      rpcRow: { ...OPEN_ROW, status: "cleared", clear_evidence: "Bank confirmed — ref 8821" },
    });
    const res = await call(`/${EXC_ID}/clear`, "finance", {
      method: "POST",
      body: { evidence: "Bank confirmed — ref 8821" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; autoDeliveryOrder: string | null };
    expect(body.status).toBe("cleared");
    expect(body.autoDeliveryOrder).toBeNull();
  });
});

describe("opening costs a reason", () => {
  it("refuses a blank reason", async () => {
    const { rpc } = mockSb();
    const res = await call("/open", "finance", {
      method: "POST",
      body: { orderId: ORDER_ID, reason: "  " },
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses an orderId that is not a uuid", async () => {
    const { rpc } = mockSb();
    const res = await call("/open", "finance", {
      method: "POST",
      body: { orderId: "SO-1318", reason: "Chargeback" },
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * THE DATABASE HAS THE LAST WORD — its refusals reach the caller intact.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("the RPC's own refusals survive the route", () => {
  it("passes the database role refusal through rather than swallowing it", async () => {
    mockSb({ rpcErr: { code: "42501", message: "forbidden: only finance can open" } });
    const res = await call("/open", "principal", {
      method: "POST",
      body: { orderId: ORDER_ID, reason: "Chargeback" },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("passes a double-clear refusal through", async () => {
    mockSb({ rpcErr: { code: "P0001", message: "this finance exception is already cleared" } });
    const res = await call(`/${EXC_ID}/clear`, "finance", {
      method: "POST",
      body: { evidence: "Bank confirmed" },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
