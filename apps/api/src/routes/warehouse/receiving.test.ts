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
 * Warehouse routes use their scoped RPCs; other roles never reach the writers.
 * Confirmation transport tests do not substitute for real database authority tests.
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

  it("carries the arrival time captured at the count (0601)", async () => {
    const sb = makeSb({ data: { id: "r1" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req("/api/warehouse/receipts", "POST", await warehouseJwt(), {
      ...validBody,
      goodsReceivedTime: "2026-09-28T09:15:00+08:00",
    });
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith(
      "warehouse_submit_receipt",
      expect.objectContaining({ p_goods_received_time: "2026-09-28T09:15:00+08:00" }),
    );
  });

  it("still files the count, dated, on a database that does not take the time yet (0601 not applied)", async () => {
    const sb = makeSb({ data: { id: "r1" } });
    sb.rpc
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function public.warehouse_submit_receipt" } })
      .mockResolvedValueOnce({ data: { id: "r1" }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req("/api/warehouse/receipts", "POST", await warehouseJwt(), {
      ...validBody,
      goodsReceivedTime: "2026-09-28T00:30:00+08:00",
    });
    expect(res.status).toBe(201);
    const second = sb.rpc.mock.calls[1]![1] as Record<string, unknown>;
    expect(second).not.toHaveProperty("p_goods_received_time");
    expect(second.p_goods_received_at).toBe("2026-09-28");
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

const confirmationKey = "11111111-1111-4111-8111-111111111190";
describe("POST /api/warehouse/receipts/confirm", () => {
  it("preserves incomplete evidence and returns the engine's blockers without guessing zero or today", async () => {
    const blocked = { id: LINE, status: "draft", grn_no: null, revision: 0, blockers: [{ code: "receipt_quantity_unknown" }] };
    const sb = makeSb({ data: blocked });
    vi.mocked(userClient).mockReturnValue(sb as unknown as ReturnType<typeof userClient>);
    const res = await req("/api/warehouse/receipts/confirm", "POST", await warehouseJwt(), {
      saveKey: confirmationKey,
      report: { poId: null, doNumber: "", lines: [{ id: LINE, receivedNow: 1, damagedQty: null }] },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(blocked);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(sb.rpc.mock.calls[0]![0]).toBe("warehouse_confirm_receipt");
    // Check the actual serialised transport, where absent keys stay absent.
    const args = JSON.parse(JSON.stringify(sb.rpc.mock.calls[0]![1]));
    expect(args).toEqual({
      p_save_key: confirmationKey, p_receipt_id: null, p_revision: null,
      p_report: { po_id: null, do_number: "", lines: [{ id: LINE, received_now: 1, damaged_qty: null }] },
    });
  });

  it("carries a non-PO arrival and its exact Unit outcomes through the same confirmation door", async () => {
    const sb = makeSb({ data: { id: LINE, status: "posted", blockers: [] } });
    vi.mocked(userClient).mockReturnValue(sb as unknown as ReturnType<typeof userClient>);
    const res = await req("/api/warehouse/receipts/confirm", "POST", await warehouseJwt(), {
      saveKey: confirmationKey, report: {
        arrivalSourceId: LINE, actualSiteId: WH, handoverPerson: "Driver",
        arrivalUnits: [{ stockItemId: LINE, outcome: "received_with_issue", issueKind: "damaged" }],
      },
    });
    expect(res.status).toBe(200);
    const args = JSON.parse(JSON.stringify(sb.rpc.mock.calls[0]![1]));
    expect(args.p_report).toEqual({ arrival_source_id: LINE, actual_site_id: WH,
      handover_person: "Driver", arrival_units: [{ stock_item_id: LINE, outcome: "received_with_issue", issue_kind: "damaged" }],
    });
    expect(args.p_report).not.toHaveProperty("po_id");
  });

  it("passes caller identity for retries and exact revision for a correction", async () => {
    const sb = makeSb({ data: { id: LINE, status: "posted", grn_no: "GRN-261005-0001", revision: 2, blockers: [] } });
    vi.mocked(userClient).mockReturnValue(sb as unknown as ReturnType<typeof userClient>);
    const res = await req("/api/warehouse/receipts/confirm", "POST", await warehouseJwt(), {
      saveKey: confirmationKey, receiptId: LINE, revision: 1,
      report: { ...validBody, actualSiteId: WH, goodsReceivedTime: "2026-10-04T09:00:00+08:00" },
    });
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("warehouse_confirm_receipt", expect.objectContaining({
      p_save_key: confirmationKey, p_receipt_id: LINE, p_revision: 1,
      p_report: expect.objectContaining({ actual_site_id: WH, goods_received_time: "2026-10-04T09:00:00+08:00" }),
    }));
  });

  it.each([
    { report: {} },
    { saveKey: confirmationKey, receiptId: LINE, report: {} },
    { saveKey: confirmationKey, revision: 0, report: {} },
    { saveKey: confirmationKey, report: { postedBy: LINE } },
    { saveKey: confirmationKey, report: { lines: Array.from({ length: 501 }, () => ({ id: LINE })) } },
  ])("rejects malformed or authority-injecting input before any RPC", async (body) => {
    const sb = makeSb();
    vi.mocked(userClient).mockReturnValue(sb as unknown as ReturnType<typeof userClient>);
    const res = await req("/api/warehouse/receipts/confirm", "POST", await warehouseJwt(), body);
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it.each(["operation", "principal", "supplier", "dealer"])("refuses %s at the final-confirmation door", async (role) => {
    const sb = makeSb();
    vi.mocked(userClient).mockReturnValue(sb as unknown as ReturnType<typeof userClient>);
    const res = await req("/api/warehouse/receipts/confirm", "POST", await makeJwt(role), { saveKey: confirmationKey, report: {} });
    expect(res.status).toBe(403);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("does not fall back to queued receiving when the final-confirmation RPC is unavailable", async () => {
    const sb = makeSb({ error: { code: "PGRST202", message: "Could not find warehouse_confirm_receipt" } });
    vi.mocked(userClient).mockReturnValue(sb as unknown as ReturnType<typeof userClient>);
    const res = await req("/api/warehouse/receipts/confirm", "POST", await warehouseJwt(), { saveKey: confirmationKey, report: {} });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(sb.rpc.mock.calls[0]![0]).toBe("warehouse_confirm_receipt");
  });

  it("does not claim success when the engine returns no receipt", async () => {
    const sb = makeSb();
    vi.mocked(userClient).mockReturnValue(sb as unknown as ReturnType<typeof userClient>);
    const res = await req("/api/warehouse/receipts/confirm", "POST", await warehouseJwt(), { saveKey: confirmationKey, report: {} });
    expect(res.status).toBe(502);
  });
});

describe("Warehouse non-PO arrivals and source proof", () => {
  it("reads the actor-scoped arrival source RPC without accepting a Site override", async () => {
    const sb = makeSb({ data: [{ id: LINE, kind: "transfer", units: [] }] });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const response = await req(`/api/warehouse/arrivals?site=${WH}`, "GET", await warehouseJwt());
    expect(response.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("warehouse_incoming_arrivals");
    expect(await response.json()).toEqual({ arrivals: [{ id: LINE, kind: "transfer", units: [] }] });
  });
  it("does not present a missing source RPC result as an empty arrival list", async () => {
    const sb = makeSb();
    vi.mocked(userClient).mockReturnValue(sb as never);
    expect((await req("/api/warehouse/arrivals", "GET", await warehouseJwt())).status).toBe(502);
  });
  it("requires Warehouse role for the arrival source list", async () => {
    expect((await req("/api/warehouse/arrivals", "GET", await makeJwt("dealer"))).status).toBe(403);
    expect(userClient).not.toHaveBeenCalled();
  });
  function proofClient(allowed: boolean) {
    const storage = { createSignedUploadUrl: vi.fn().mockResolvedValue({ data: { token: "test-token" }, error: null }),
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://example.test/proof" }, error: null }) };
    const sb = { ...makeSb({ data: allowed }), storage: { from: vi.fn(() => storage) } };
    vi.mocked(userClient).mockReturnValue(sb as never);
    return { sb, storage };
  }
  it("signs a proof only after Site authority and keeps the actor in the path", async () => {
    const { sb, storage } = proofClient(true);
    const response = await req(`/api/warehouse/arrivals/${LINE}/proof`, "POST", await warehouseJwt(), { mime_type: "image/jpeg", size_bytes: 1024 });
    expect(response.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("warehouse_arrival_proof_allowed", { p_source_id: LINE, p_require_open: true });
    expect(sb.storage.from).toHaveBeenCalledWith("arrival-proofs");
    expect(storage.createSignedUploadUrl).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${LINE}/u1/[0-9a-f-]+\\.jpg$`)));
  });
  it("never signs a proof when Site authority refuses", async () => {
    const { storage } = proofClient(false);
    const response = await req(`/api/warehouse/arrivals/${LINE}/proof`, "POST", await warehouseJwt(), { mime_type: "image/jpeg", size_bytes: 1024 });
    expect(response.status).toBe(403);
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });
  it("rejects unsupported evidence before requesting authority or an upload token", async () => {
    const { sb, storage } = proofClient(true);
    const response = await req(`/api/warehouse/arrivals/${LINE}/proof`, "POST", await warehouseJwt(), { mime_type: "text/html", size_bytes: 1024 });
    expect(response.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });
  it("can read historical proof through current Site authority without reopening a cancelled source", async () => {
    const { sb, storage } = proofClient(true);
    const path = `${LINE}/u1/proof.jpg`;
    const response = await req(`/api/warehouse/arrivals/${LINE}/proof?path=${encodeURIComponent(path)}`, "GET", await warehouseJwt());
    expect(response.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("warehouse_arrival_proof_allowed", { p_source_id: LINE, p_require_open: false });
    expect(storage.createSignedUrl).toHaveBeenCalledWith(path, 3600);
  });
  it.each([`${WH}/u1/proof.jpg`, `${LINE}/../proof.jpg`])("refuses unrelated or invalid proof path %s", async (path) => {
    const { sb, storage } = proofClient(true);
    expect((await req(`/api/warehouse/arrivals/${LINE}/proof?path=${encodeURIComponent(path)}`, "GET", await warehouseJwt())).status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });
});
