import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

/**
 * R6 — /api/warehouse/* (the third external portal).
 *
 * What these tests are really about: the warehouse's surface is THREE RPCs and
 * nothing else, and a login that is not a scoped warehouse never reaches them.
 */

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};
const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;

const WH = "00000000-0000-0000-0000-000000000c03";
const LINE = "11111111-1111-1111-1111-111111111111";

async function makeJwt(
  role: string,
  appMeta: Record<string, unknown> = {},
): Promise<string> {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role, ...appMeta } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

const warehouseJwt = () => makeJwt("warehouse", { warehouse_id: WH });

function makeSb(rpcResult: { data?: unknown; error?: unknown } = {}) {
  return {
    rpc: vi.fn().mockResolvedValue({
      data: rpcResult.data ?? null,
      error: rpcResult.error ?? null,
    }),
  };
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

function req(path: string, method: string, jwt: string | null, body?: unknown) {
  return app.fetch(
    new Request(`http://t${path}`, {
      method,
      headers: {
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    env,
  );
}

const validBody = {
  sourceKind: "purchase_order",
  sourceId: "PO-1001",
  expectedVersion: 2,
  supplierDoNo: "DO-5512",
  signedDoPath: "PO-1001/abc-do.jpg",
  goodsReceivedAt: "2026-08-31T02:00:00.000Z",
  note: null,
  lines: [{
    poLineId: LINE,
    sku: "MS01-K",
    receivedQty: 4,
    damagedQty: 0,
    wrongItemQty: 0,
    extraQty: 0,
    unitIds: ["id-aaa000001", "id-aaa000002", "id-aaa000003", "id-aaa000004"],
    damagedPhotos: [],
    wrongItemPhotos: [],
    extraEvidence: [],
    wrongItemReason: null,
  }],
};

describe("who may reach the warehouse portal", () => {
  it("401 without Authorization", async () => {
    expect((await req("/api/warehouse/incoming", "GET", null)).status).toBe(401);
  });

  it("403 for every other role — including the principal", async () => {
    for (const role of ["operation", "principal", "supplier", "partner", "dealer"]) {
      const jwt = await makeJwt(role);
      const res = await req("/api/warehouse/incoming", "GET", jwt);
      expect(res.status, `${role} must not reach the warehouse portal`).toBe(403);
    }
  });

  it("403 when the warehouse login carries no warehouse", async () => {
    const jwt = await makeJwt("warehouse");
    const res = await req("/api/warehouse/incoming", "GET", jwt);
    expect(res.status).toBe(403);
  });

  it("guards the write door the same way", async () => {
    const jwt = await makeJwt("operation");
    const res = await req("/api/warehouse/receipts", "POST", jwt, validBody);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/warehouse/incoming", () => {
  it("returns what the RPC says, and calls no other query", async () => {
    const sb = makeSb({
      data: {
        warehouse: { id: WH, name: "Carres Klang" },
        pos: [{ po_id: "PO-1001", lines: [] }],
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const res = await req("/api/warehouse/incoming", "GET", await warehouseJwt());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      warehouse: { name: "Carres Klang" },
      pos: [{ po_id: "PO-1001" }],
    });
    expect(sb.rpc).toHaveBeenCalledWith("warehouse_incoming_pos");
    expect(sb.rpc).toHaveBeenCalledTimes(1);
  });

  it("degrades to an empty shape rather than null when the RPC answers nothing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb({ data: null }) as any);
    const res = await req("/api/warehouse/incoming", "GET", await warehouseJwt());
    expect(await res.json()).toEqual({ warehouse: null, pos: [] });
  });
});

describe("GET /api/warehouse/receipts", () => {
  it("returns one bounded history page with a stable next cursor", async () => {
    const sb = makeSb({ data: {
      receipts: [{ id: "r1", po_id: "PO-1001", claims: [] }],
      next: { before: "2026-08-31T02:00:00Z", beforeId: "11111111-1111-1111-1111-111111111111" },
    } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req("/api/warehouse/receipts", "GET", await warehouseJwt());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      receipts: [{ id: "r1", po_id: "PO-1001", claims: [] }],
      nextCursor: { before: "2026-08-31T02:00:00Z", beforeId: "11111111-1111-1111-1111-111111111111" },
    });
    expect(sb.rpc).toHaveBeenCalledWith("warehouse_my_receipts", {
      p_limit: 50,
      p_before: null,
      p_before_id: null,
      p_exact: null,
    });
  });

  it("passes exact PO, Receiving Session or GRN lookup without client-side filtering", async () => {
    const sb = makeSb({ data: { receipts: [], next: null } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      "/api/warehouse/receipts?exact=GRN-20260831-0042&limit=25&before=2026-08-31T02%3A00%3A00Z&beforeId=11111111-1111-1111-1111-111111111111",
      "GET",
      await warehouseJwt(),
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("warehouse_my_receipts", {
      p_limit: 25,
      p_before: "2026-08-31T02:00:00Z",
      p_before_id: "11111111-1111-1111-1111-111111111111",
      p_exact: "GRN-20260831-0042",
    });
  });
});

describe("POST /api/warehouse/receipts", () => {
  it("atomically saves and submits the same governed session and answers 201", async () => {
    const sb = makeSb({ data: { id: "r1", po_id: "PO-1001", status: "submitted" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const res = await req(
      "/api/warehouse/receipts",
      "POST",
      await warehouseJwt(),
      validBody,
    );
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith("save_and_submit_receiving_session", {
      p_receipt_id: null,
      p_expected_version: 0,
      p_payload: validBody,
    });
    expect(sb.rpc).toHaveBeenCalledTimes(1);
  });

  it("reopens a returned session and atomically saves and resubmits that exact version", async () => {
    const sb = makeSb({ data: { receipt_id: "r1", status: "submitted", lock_version: 5 } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      "/api/warehouse/receipts/r1",
      "PATCH",
      await warehouseJwt(),
      { expectedVersion: 4, session: validBody },
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("save_and_submit_receiving_session", {
      p_receipt_id: "r1",
      p_expected_version: 4,
      p_payload: validBody,
    });
    expect(sb.rpc).toHaveBeenCalledTimes(1);
  });

  it("never calls the receive engine — a submission moves no goods", async () => {
    const sb = makeSb({ data: { id: "r1" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    await req("/api/warehouse/receipts", "POST", await warehouseJwt(), validBody);
    const called = sb.rpc.mock.calls.map((c) => c[0]);
    expect(called).not.toContain("operation_receive_po_with_do");
    expect(called).not.toContain("warehouse_receipt_check_in");
  });

  it("sends claim photos as plain storage keys, which is what 0288 reads", async () => {
    const sb = makeSb({ data: { id: "r1" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    await req("/api/warehouse/receipts", "POST", await warehouseJwt(), {
      ...validBody,
      note: "pallet 3 crushed",
      lines: [
        {
          ...validBody.lines[0],
          receivedQty: 1,
          damagedQty: 2,
          damagedPhotos: ["PO-1001/x-claim.jpg"],
          wrongItemQty: 1,
          wrongItemReason: "wrong sku",
          wrongItemPhotos: ["PO-1001/y-claim.jpg"],
          unitIds: ["id-aaa000001", "id-aaa000002", "id-aaa000003", "id-aaa000004"],
        },
      ],
    });

    const args = sb.rpc.mock.calls[0][1] as {
      p_payload: typeof validBody;
    };
    expect(args.p_payload.note).toBe("pallet 3 crushed");
    expect(args.p_payload.lines[0].damagedPhotos).toEqual(["PO-1001/x-claim.jpg"]);
    expect(args.p_payload.lines[0].wrongItemPhotos).toEqual(["PO-1001/y-claim.jpg"]);
    expect(args.p_payload.lines[0].wrongItemReason).toBe("wrong sku");
  });

  it("422 on a DO number the RPC would refuse anyway", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb() as any);
    const res = await req("/api/warehouse/receipts", "POST", await warehouseJwt(), {
      ...validBody,
      supplierDoNo: "DO",
    });
    expect(res.status).toBe(422);
  });

  it("422 with no lines at all", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb() as any);
    const res = await req("/api/warehouse/receipts", "POST", await warehouseJwt(), {
      ...validBody,
      lines: [],
    });
    expect(res.status).toBe(422);
  });

  it("passes the RPC's own refusal through instead of inventing one", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(
      makeSb({
        error: {
          code: "P0001",
          message: "a receiving for PO-1001 is already waiting for Carres",
          details: "receipt_already_open",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    );
    const res = await req(
      "/api/warehouse/receipts",
      "POST",
      await warehouseJwt(),
      validBody,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await res.json())).toContain("already waiting");
  });
});
