import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));
import { adminClient, userClient } from "../../lib/supabase";

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

const DO_ROW = {
  id: "00000000-0000-0000-0000-0000000d0001",
  order_id: "00000000-0000-0000-0000-0000000a0001",
  do_number: "DO-180826-3035",
  issued_at: "2026-08-18T01:47:00Z",
  trip_groups: null,
  delivery_date: "2026-08-20",
  time_slot: "Afternoon (12pm–3pm)",
  logistics_partner: "NETS",
  voided_at: null,
  void_reason: null,
  orders: {
    id: "00000000-0000-0000-0000-0000000a0001",
    so: 1322,
    customer_name: "IT WALK SLICE2 AUTO",
    customer_address_city: "Klang",
    customer_address_state: "Selangor",
  },
};

const ATTEMPT_ROW = {
  do_number: "DO-180826-3035",
  result: "failed",
  reason_key: "customer_unreachable",
  recorded_at: "2026-08-20T09:00:00Z",
};

/**
 * A tiny thenable query builder: every chained method returns itself and it
 * resolves to the queue's next result, so the route's real chains
 * (select→order→limit / select→eq→maybeSingle / select→in) all work without
 * this mock knowing their exact shapes.
 */
function mockSb(
  results: Array<{ data?: unknown; error?: unknown }>,
  rpcResults: Array<{ data?: unknown; error?: unknown }> = [],
) {
  const queue = [...results];
  const from = vi.fn().mockImplementation(() => {
    const res = queue.shift() ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ["select", "eq", "in", "order", "limit", "maybeSingle"]) {
      chain[m] = vi.fn().mockImplementation(self);
    }
    (chain as { then: unknown }).then = (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown,
    ) =>
      Promise.resolve({ data: res.data ?? null, error: res.error ?? null }).then(
        resolve,
        reject,
      );
    return chain;
  });
  const rpcQueue = [...rpcResults];
  const rpc = vi.fn().mockImplementation(() => {
    const res = rpcQueue.shift() ?? { data: null, error: null };
    return Promise.resolve({ data: res.data ?? null, error: res.error ?? null });
  });
  vi.mocked(userClient).mockReturnValue({ from, rpc } as never);
  return { from, rpc };
}

async function call(path: string, role: string, init?: RequestInit) {
  const jwt = await makeJwt(role);
  return app.fetch(
    new Request(`http://t/api/operation/delivery-orders${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    }),
    env,
  );
}

describe("GET /api/operation/delivery-orders — the register", () => {
  it("returns the documents and their attempt facts for operation", async () => {
    mockSb([{ data: [DO_ROW] }, { data: [ATTEMPT_ROW] }]);
    const res = await call("", "operation");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      deliveryOrders: Array<{ do_number: string }>;
      attempts: Array<{ reason_key: string | null }>;
    };
    expect(body.deliveryOrders[0]?.do_number).toBe("DO-180826-3035");
    expect(body.attempts[0]?.reason_key).toBe("customer_unreachable");
  });

  it("refuses a role outside operation/principal", async () => {
    mockSb([]);
    const res = await call("", "supplier");
    expect([401, 403]).toContain(res.status);
  });

  it("computes nothing server-side — no owner, action or status field rides a row", async () => {
    mockSb([{ data: [DO_ROW] }, { data: [] }]);
    const res = await call("", "operation");
    const body = (await res.json()) as { deliveryOrders: Array<Record<string, unknown>> };
    const row = body.deliveryOrders[0]!;
    for (const banned of ["status", "owner", "action", "due"]) {
      expect(row).not.toHaveProperty(banned);
    }
  });
});

describe("GET /api/operation/delivery-orders/:id — the document", () => {
  it("resolves by the document's own number and returns its blocks' facts", async () => {
    const detailRow = {
      ...DO_ROW,
      orders: {
        ...DO_ROW.orders,
        customer_phone: "0123456789",
        customer_emergency: null,
        customer_address: "12 Jalan Test",
        do_file_path: null,
        do_uploaded_at: null,
        pod_signature_url: null,
        pod_signed_by: null,
        pod_signed_at: null,
        do_number: "DO-180826-3035",
        order_lines: [{ sku: "JAGER-SS", qty: 1 }],
      },
    };
    mockSb([
      { data: detailRow },
      { data: [ATTEMPT_ROW] }, // attempts
      { data: [] }, // loans
      { data: [] }, // handover events (0363)
      { data: [{ sku: "JAGER-SS", variant: "Jager Super Single" }] },
    ]);
    const res = await call("/DO-180826-3035", "operation");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      deliveryOrder: { do_number: string };
      lineDescriptions: Record<string, string>;
      loans: unknown[];
      handoverEvents: unknown[];
    };
    expect(body.deliveryOrder.do_number).toBe("DO-180826-3035");
    expect(body.lineDescriptions["JAGER-SS"]).toBe("Jager Super Single");
    expect(body.handoverEvents).toEqual([]);
  });

  it("answers 404 with words when the document does not exist", async () => {
    mockSb([{ data: null }]);
    const res = await call("/DO-000000-0000", "operation");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("not found");
  });
});

describe("POST /:id/handover — the §4 chain door (0363)", () => {
  const DO_ID = "00000000-0000-0000-0000-0000000d0001";

  it("refuses a role outside operation/principal", async () => {
    mockSb([]);
    const res = await call(`/${DO_ID}/handover`, "supplier", {
      method: "POST",
      body: JSON.stringify({ kind: "ready_for_handover" }),
    });
    expect([401, 403]).toContain(res.status);
  });

  it("records Ready for handover through the governed RPC — nothing is written directly", async () => {
    const { from, rpc } = mockSb([], [{ data: { id: "ev1", kind: "ready_for_handover" } }]);
    const res = await call(`/${DO_ID}/handover`, "operation", {
      method: "POST",
      body: JSON.stringify({ kind: "ready_for_handover" }),
    });
    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith(
      "delivery_handover_record",
      expect.objectContaining({ p_do_id: DO_ID, p_kind: "ready_for_handover" }),
    );
    // Ready needs no goods derivation — no table read happens at all.
    expect(from).not.toHaveBeenCalled();
  });

  it("derives the DEFAULT goods count from the document's own trip lines when the recorder omits it", async () => {
    const { rpc } = mockSb(
      [
        {
          data: {
            id: DO_ID,
            trip_groups: null,
            orders: { order_lines: [{ sku: "JAGER-SS", qty: 2 }] },
          },
        },
      ],
      [{ data: { id: "ev2", kind: "received_by_logistics" } }],
    );
    const res = await call(`/${DO_ID}/handover`, "operation", {
      method: "POST",
      body: JSON.stringify({ kind: "received_by_logistics" }),
    });
    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith(
      "delivery_handover_record",
      expect.objectContaining({
        p_kind: "received_by_logistics",
        p_goods: [{ sku: "JAGER-SS", qty: 2 }],
      }),
    );
  });

  it("a proof path outside this document's own prefix is refused — proof binds to the exact event", async () => {
    mockSb([]);
    const res = await call(`/${DO_ID}/handover`, "operation", {
      method: "POST",
      body: JSON.stringify({
        kind: "handed_over",
        receiverName: "Ahmad",
        goods: [{ sku: "JAGER-SS", qty: 1 }],
        proofPath: "handover/other-document/x.jpg",
      }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("does not belong to this delivery order");
  });

  it("the door's own refusals reach the operator in words (out-of-order chain)", async () => {
    const { rpc } = mockSb(
      [],
      [
        {
          error: {
            code: "P0001",
            message: "goods are handed over only after Ready for handover is recorded",
            details: "handover_out_of_order",
          },
        },
      ],
    );
    const res = await call(`/${DO_ID}/handover`, "operation", {
      method: "POST",
      body: JSON.stringify({
        kind: "handed_over",
        receiverName: "Ahmad",
        goods: [{ sku: "JAGER-SS", qty: 1 }],
        proofPath: `handover/${DO_ID}/proof.jpg`,
      }),
    });
    expect(rpc).toHaveBeenCalled();
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("handover_out_of_order");
  });
});

describe("POST /:id/handover-proof/sign-upload", () => {
  const DO_ID = "00000000-0000-0000-0000-0000000d0001";

  it("refuses a cancelled document — a cancelled document has no handover", async () => {
    mockSb([{ data: { id: DO_ID, voided_at: "2026-08-19T02:00:00Z" } }]);
    const res = await call(`/${DO_ID}/handover-proof/sign-upload`, "operation", {
      method: "POST",
      body: JSON.stringify({ mimeType: "image/jpeg", sizeBytes: 1024 }),
    });
    expect(res.status).toBe(409);
  });

  it("signs a server-generated key under this document's own handover/ prefix", async () => {
    mockSb([{ data: { id: DO_ID, voided_at: null } }]);
    const createSignedUploadUrl = vi
      .fn()
      .mockResolvedValue({ data: { token: "t", path: `handover/${DO_ID}/k.jpg` }, error: null });
    vi.mocked(adminClient).mockReturnValue({
      storage: { from: vi.fn().mockReturnValue({ createSignedUploadUrl }) },
    } as never);
    const res = await call(`/${DO_ID}/handover-proof/sign-upload`, "operation", {
      method: "POST",
      body: JSON.stringify({ mimeType: "image/jpeg", sizeBytes: 1024 }),
    });
    expect(res.status).toBe(200);
    const arg = createSignedUploadUrl.mock.calls[0]?.[0] as string;
    expect(arg.startsWith(`handover/${DO_ID}/`)).toBe(true);
    const body = (await res.json()) as { token: string; path: string };
    expect(body.token).toBe("t");
  });
});
