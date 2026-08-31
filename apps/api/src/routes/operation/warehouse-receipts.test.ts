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
import { adminClient, userClient } from "../../lib/supabase";

/**
 * R6 — /api/operation/warehouse-receipts (the ops half).
 *
 * The two claims under test: check-in goes through the ONE receive engine (this
 * router never books stock itself), and a send-back cannot happen without a
 * reason the warehouse can act on.
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
const USER = "00000000-0000-0000-0000-0000000000aa";
const RECEIPT = "22222222-2222-2222-2222-222222222222";
const LINE = "11111111-1111-1111-1111-111111111111";
const SESSION_INPUT = {
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
    receivedQty: 1,
    damagedQty: 0,
    wrongItemQty: 0,
    extraQty: 0,
    unitIds: ["id-abc123456"],
    damagedPhotos: [],
    wrongItemPhotos: [],
    extraEvidence: [],
    wrongItemReason: null,
  }],
};

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

type Result = { data: unknown; error: unknown };
type TableCfg = { list?: Result; count?: number };

function makeSb(
  tables: Record<string, TableCfg>,
  rpcResult: { data?: unknown; error?: unknown } = {},
) {
  const sb = {
    rpc: vi.fn().mockResolvedValue({
      data: rpcResult.data ?? null,
      error: rpcResult.error ?? null,
    }),
    from(table: string) {
      const cfg = tables[table] ?? {};
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const m of ["eq", "in", "order", "limit"]) builder[m] = vi.fn(chain);
      builder.select = vi.fn((_cols: string, opts?: { head?: boolean }) => {
        if (opts?.head) {
          // A head-count resolves straight to { count } — no rows.
          const headBuilder: Record<string, unknown> = {};
          headBuilder.eq = vi.fn(() => headBuilder);
          headBuilder.then = (resolve: (r: unknown) => unknown) =>
            Promise.resolve({ count: cfg.count ?? 0, error: null }).then(resolve);
          return headBuilder;
        }
        return builder;
      });
      builder.then = (
        resolve: (r: Result) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve(cfg.list ?? { data: [], error: null }).then(resolve, reject);
      return builder;
    },
  };
  return sb;
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
  vi.mocked(adminClient).mockReset();
  vi.mocked(adminClient).mockReturnValue({
    storage: {
      from: vi.fn(() => ({
        createSignedUrls: vi.fn(async () => ({ data: [], error: null })),
      })),
    },
  } as never);
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

const RECEIPT_ROW = {
  id: RECEIPT,
  po_id: "PO-1001",
  warehouse_id: WH,
  do_number: "DO-5512",
  do_file_path: "PO-1001/abc-do.jpg",
  note: null,
  status: "submitted",
  submitted_by: USER,
  submitted_at: "2026-07-27T02:00:00Z",
  reviewed_by: null,
  reviewed_at: null,
  return_reason: null,
  lines: [
    {
      id: "l1",
      sku: "MS01-K",
      received_now: 4,
      damaged_qty: 1,
      wrong_item_qty: 0,
      wrong_item_claim_type: null,
    },
  ],
};

function opsTables(row: Record<string, unknown> = RECEIPT_ROW) {
  return {
    warehouse_receipts: { list: { data: [row], error: null }, count: 1 },
    warehouses: { list: { data: [{ id: WH, name: "Carres Klang" }], error: null } },
    purchase_orders: {
      list: {
        data: [{ id: "PO-1001", supplier_id: "s1", suppliers: { name: "Ohana" } }],
        error: null,
      },
    },
    app_users: { list: { data: [{ id: USER, name: "Klang counter" }], error: null } },
  };
}

describe("who may review a warehouse count", () => {
  it("401 without Authorization", async () => {
    expect(
      (await req("/api/operation/warehouse-receipts", "GET", null)).status,
    ).toBe(401);
  });

  it("403 for the warehouse itself — it files, it does not approve", async () => {
    const jwt = await makeJwt("warehouse");
    const res = await req("/api/operation/warehouse-receipts", "GET", jwt);
    expect(res.status).toBe(403);
  });

  it("403 for a dealer", async () => {
    const jwt = await makeJwt("dealer");
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/check-in`,
      "POST",
      jwt,
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/operation/warehouse-receipts", () => {
  it("names the warehouse, the supplier and who counted, and says what arrived", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(opsTables()) as any);
    const res = await req(
      "/api/operation/warehouse-receipts",
      "GET",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      receipts: Array<Record<string, unknown>>;
      counts: { waiting: number };
    };
    expect(body.receipts[0]).toMatchObject({
      po_id: "PO-1001",
      warehouse_name: "Carres Klang",
      supplier_name: "Ohana",
      submitted_by_name: "Klang counter",
      summary: "4 good · 1 damaged",
      opens_claims: true,
    });
    expect(body.counts.waiting).toBe(1);
  });

  it("says a clean count opens no claims", async () => {
    const clean = {
      ...RECEIPT_ROW,
      lines: [
        {
          id: "l1",
          sku: "MS01-K",
          received_now: 4,
          damaged_qty: 0,
          wrong_item_qty: 0,
          wrong_item_claim_type: null,
        },
      ],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(opsTables(clean)) as any);
    const res = await req(
      "/api/operation/warehouse-receipts",
      "GET",
      await makeJwt("operation"),
    );
    const body = (await res.json()) as { receipts: Array<Record<string, unknown>> };
    expect(body.receipts[0].opens_claims).toBe(false);
    expect(body.receipts[0].summary).toBe("4 good");
  });

  it("defaults to the waiting queue, not the filing cabinet", async () => {
    const sb = makeSb(opsTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const spy = vi.spyOn(sb, "from");
    await req(
      "/api/operation/warehouse-receipts",
      "GET",
      await makeJwt("operation"),
    );
    // The first builder is the list query; its `.eq` must have narrowed to
    // submitted.
    const builder = spy.mock.results[0].value as { eq: ReturnType<typeof vi.fn> };
    expect(builder.eq).toHaveBeenCalledWith("status", "submitted");
  });

  it("honours ?status=all by not narrowing at all", async () => {
    const sb = makeSb(opsTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const spy = vi.spyOn(sb, "from");
    await req(
      "/api/operation/warehouse-receipts?status=all",
      "GET",
      await makeJwt("operation"),
    );
    const builder = spy.mock.results[0].value as { eq: ReturnType<typeof vi.fn> };
    expect(builder.eq).not.toHaveBeenCalled();
  });

  it("falls back to the waiting queue on a status nobody defined", async () => {
    const sb = makeSb(opsTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const spy = vi.spyOn(sb, "from");
    await req(
      "/api/operation/warehouse-receipts?status=whatever",
      "GET",
      await makeJwt("operation"),
    );
    const builder = spy.mock.results[0].value as { eq: ReturnType<typeof vi.fn> };
    expect(builder.eq).toHaveBeenCalledWith("status", "submitted");
  });
});

describe("POST /:id/check-in", () => {
  it("delegates to the one posting RPC with optimistic version", async () => {
    const sb = makeSb(opsTables(), {
      data: { receipt_id: RECEIPT, po_id: "PO-1001", status: "checked_in" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/check-in`,
      "POST",
      await makeJwt("operation"),
      { expectedVersion: 3 },
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledTimes(2);
    expect(sb.rpc).toHaveBeenCalledWith("post_receiving_session", {
      p_receipt_id: RECEIPT,
      p_expected_version: 3,
    });
    expect(sb.rpc).toHaveBeenCalledWith("record_receiving_continuation_failure", {
      p_receipt_id: RECEIPT,
      p_code: "reservation_continuation_failed",
      p_message: expect.any(String),
    });
    // "ops only reviews" — this router must never call the receive engine
    // directly, or there would be two receive paths to keep in step.
    expect(sb.rpc.mock.calls.map((c) => c[0])).not.toContain(
      "operation_receive_po_with_do",
    );
  });

  it("admits the principal like every other Operations surface", async () => {
    const sb = makeSb(opsTables(), { data: { status: "checked_in" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/check-in`,
      "POST",
      await makeJwt("principal"),
      { expectedVersion: 3 },
    );
    expect(res.status).toBe(200);
  });

  it("passes an already-reviewed refusal straight through", async () => {
    const sb = makeSb(opsTables(), {
      error: {
        code: "22023",
        message: "this receiving has already been reviewed",
        details: "receipt_not_open",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/check-in`,
      "POST",
      await makeJwt("operation"),
      { expectedVersion: 3 },
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await res.json())).toContain("already been reviewed");
  });
});

describe("POST /:id/send-back", () => {
  it("records the reason with the return", async () => {
    const sb = makeSb(opsTables(), { data: { status: "returned" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/send-back`,
      "POST",
      await makeJwt("operation"),
      { expectedVersion: 3, reason: "  DO photo is unreadable — send it again  " },
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("return_receiving_session", {
      p_receipt_id: RECEIPT,
      p_expected_version: 3,
      p_reason: "DO photo is unreadable — send it again",
    });
  });

  it("422 with no reason — a review that only approves is not a review", async () => {
    const sb = makeSb(opsTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    for (const body of [{}, { expectedVersion: 3, reason: "" }, { expectedVersion: 3, reason: "   " }]) {
      const res = await req(
        `/api/operation/warehouse-receipts/${RECEIPT}/send-back`,
        "POST",
        await makeJwt("operation"),
        body,
      );
      expect(res.status).toBe(422);
    }
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

describe("governed Receiving Session mutation doors", () => {
  it("creates a persistent Draft through the one save RPC", async () => {
    const sb = makeSb(opsTables(), { data: { receipt_id: RECEIPT, status: "draft", lock_version: 1 } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req("/api/operation/warehouse-receipts", "POST", await makeJwt("operation"), SESSION_INPUT);
    expect(res.status).toBe(201);
    expect(sb.rpc).toHaveBeenCalledWith("save_receiving_session", {
      p_receipt_id: null,
      p_expected_version: 0,
      p_payload: SESSION_INPUT,
    });
  });

  it("saves and submits the same session with expectedVersion on every mutation", async () => {
    const sb = makeSb(opsTables(), { data: { receipt_id: RECEIPT } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    await req(`/api/operation/warehouse-receipts/${RECEIPT}`, "PATCH", await makeJwt("operation"), {
      expectedVersion: 4,
      session: SESSION_INPUT,
    });
    expect(sb.rpc).toHaveBeenLastCalledWith("save_receiving_session", {
      p_receipt_id: RECEIPT,
      p_expected_version: 4,
      p_payload: SESSION_INPUT,
    });

    await req(`/api/operation/warehouse-receipts/${RECEIPT}/submit`, "POST", await makeJwt("operation"), {
      expectedVersion: 5,
    });
    expect(sb.rpc).toHaveBeenLastCalledWith("submit_receiving_session", {
      p_receipt_id: RECEIPT,
      p_expected_version: 5,
    });
  });

  it("never calls either retired direct receive writer", async () => {
    const sb = makeSb(opsTables(), { data: { receipt_id: RECEIPT } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    await req(`/api/operation/warehouse-receipts/${RECEIPT}/check-in`, "POST", await makeJwt("operation"), {
      expectedVersion: 3,
    });
    const called = sb.rpc.mock.calls.map((call) => call[0]);
    expect(called).not.toContain("operation_receive_po_with_do");
    expect(called).not.toContain("office_receive_post");
    expect(called).not.toContain("warehouse_receipt_check_in");
  });
});
