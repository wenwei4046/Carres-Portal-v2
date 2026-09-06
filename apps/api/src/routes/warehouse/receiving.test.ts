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
  poId: "PO-1001",
  doNumber: "DO-5512",
  doFilePath: "PO-1001/abc-do.jpg",
  lines: [{ id: LINE, receivedNow: 4 }],
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
  it("wraps the RPC's array so the payload can grow a sibling key later", async () => {
    const sb = makeSb({ data: [{ id: "r1", po_id: "PO-1001", claims: [] }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req("/api/warehouse/receipts", "GET", await warehouseJwt());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      receipts: [{ id: "r1", po_id: "PO-1001", claims: [] }],
    });
    expect(sb.rpc).toHaveBeenCalledWith("warehouse_my_receipts");
  });
});

describe("POST /api/warehouse/receipts", () => {
  it("files the count through warehouse_submit_receipt and answers 201", async () => {
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
    // 0426 — an absent arrivalEvidence/extraLines/units degrades to [] at the
    // RPC, never to null/undefined (jsonb parameters read arrays).
    expect(sb.rpc).toHaveBeenCalledWith("warehouse_submit_receipt", {
      p_po_id: "PO-1001",
      p_do_number: "DO-5512",
      p_do_file_path: "PO-1001/abc-do.jpg",
      p_note: null,
      p_arrival_evidence: [],
      p_extra_lines: [],
      p_lines: [
        {
          id: LINE,
          received_now: 4,
          damaged_qty: 0,
          wrong_item_qty: 0,
          wrong_item_claim_type: null,
          damaged_photos: [],
          wrong_item_photos: [],
          units: [],
        },
      ],
    });
  });

  it("maps arrival evidence, extra lines and per-unit outcomes onto the RPC (0426)", async () => {
    const sb = makeSb({ data: { id: "r1" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const res = await req("/api/warehouse/receipts", "POST", await warehouseJwt(), {
      ...validBody,
      arrivalEvidence: [
        { path: "PO-1001/arrival-1.jpg", kind: "photo" },
        { path: "PO-1001/arrival-2.mp4", kind: "video" },
      ],
      extraLines: [{ sku: "EXTRA-SKU", qty: 2, note: "not on the PO" }],
      lines: [
        {
          id: LINE,
          receivedNow: 1,
          damagedQty: 1,
          damagedPhotos: ["PO-1001/x-claim.jpg"],
          units: [
            { unitCode: "U-260904-0001", outcome: "received" },
            {
              unitCode: "U-260904-0002",
              outcome: "received_with_issue",
              issueKind: "damaged",
              note: "corner crushed",
            },
            { unitCode: "U-260904-0003", outcome: "not_received" },
          ],
        },
      ],
    });
    expect(res.status).toBe(201);

    const args = sb.rpc.mock.calls[0][1] as {
      p_arrival_evidence: unknown;
      p_extra_lines: unknown;
      p_lines: Array<Record<string, unknown>>;
    };
    expect(args.p_arrival_evidence).toEqual([
      { path: "PO-1001/arrival-1.jpg", kind: "photo" },
      { path: "PO-1001/arrival-2.mp4", kind: "video" },
    ]);
    expect(args.p_extra_lines).toEqual([
      { sku: "EXTRA-SKU", qty: 2, note: "not on the PO" },
    ]);
    // camelCase in, snake_case out — and a missing issueKind/note becomes
    // null, never undefined (jsonb drops undefined keys silently).
    expect(args.p_lines[0].units).toEqual([
      {
        unit_code: "U-260904-0001",
        outcome: "received",
        issue_kind: null,
        note: null,
      },
      {
        unit_code: "U-260904-0002",
        outcome: "received_with_issue",
        issue_kind: "damaged",
        note: "corner crushed",
      },
      {
        unit_code: "U-260904-0003",
        outcome: "not_received",
        issue_kind: null,
        note: null,
      },
    ]);
  });

  it("422 on a unit outcome outside the governed three", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb() as any);
    const res = await req("/api/warehouse/receipts", "POST", await warehouseJwt(), {
      ...validBody,
      lines: [
        {
          id: LINE,
          receivedNow: 1,
          units: [{ unitCode: "U-260904-0001", outcome: "lost" }],
        },
      ],
    });
    expect(res.status).toBe(422);
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
      note: "  pallet 3 crushed  ",
      lines: [
        {
          id: LINE,
          receivedNow: 1,
          damagedQty: 2,
          damagedPhotos: ["PO-1001/x-claim.jpg"],
          wrongItemQty: 1,
          wrongItemClaimType: "wrong_sku",
          wrongItemPhotos: ["PO-1001/y-claim.jpg"],
        },
      ],
    });

    const args = sb.rpc.mock.calls[0][1] as {
      p_note: string;
      p_lines: Array<Record<string, unknown>>;
    };
    expect(args.p_note).toBe("pallet 3 crushed");
    expect(args.p_lines[0].damaged_photos).toEqual(["PO-1001/x-claim.jpg"]);
    expect(args.p_lines[0].wrong_item_photos).toEqual(["PO-1001/y-claim.jpg"]);
    expect(args.p_lines[0].wrong_item_claim_type).toBe("wrong_sku");
  });

  it("422 on a DO number the RPC would refuse anyway", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb() as any);
    const res = await req("/api/warehouse/receipts", "POST", await warehouseJwt(), {
      ...validBody,
      doNumber: "DO",
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
