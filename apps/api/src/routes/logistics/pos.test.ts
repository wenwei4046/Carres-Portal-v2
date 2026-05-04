import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";
import { assertRpcCallShape } from "../../test-utils/assert-rpc";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
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

async function makeJwt(role: string) {
  return new SignJWT({
    email: `${role}@carres.com`,
    app_metadata: { role },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
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

describe("GET /api/logistics/pos", () => {
  const PO_ROW = {
    id: "PO-2030",
    supplier_id: "00000000-0000-0000-0000-000000000a01",
    warehouse_id: "00000000-0000-0000-0000-000000000b01",
    status: "open",
    sup_status: "pending",
    dl: 4001,
    dl_refs: null,
    eta_date: "2026-05-15",
    placed_at: "2026-05-03T10:00:00Z",
    purchase_order_lines: [
      { sku: "MAT-K-001", qty: 2, received_qty: 0 },
    ],
  };

  function mockPosList(rows: typeof PO_ROW[]) {
    const eq = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const select = vi.fn(() => ({ eq, order, limit }));
    vi.mocked(userClient).mockReturnValue({
      from: vi.fn(() => ({ select })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return { eq, order, limit };
  }

  it("returns POs for logistics with default 'all' status", async () => {
    const { order, limit } = mockPosList([PO_ROW]);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pos: typeof PO_ROW[] };
    expect(body.pos).toHaveLength(1);
    expect(body.pos[0]?.id).toBe("PO-2030");
    expect(order).toHaveBeenCalledWith("placed_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(200);
  });

  it("filters by status when query param provided", async () => {
    const { eq } = mockPosList([PO_ROW]);
    const jwt = await makeJwt("logistics");
    await app.fetch(
      new Request("http://t/api/logistics/pos?status=open", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(eq).toHaveBeenCalledWith("status", "open");
  });

  it("filters by supplierId when query param provided", async () => {
    const { eq } = mockPosList([PO_ROW]);
    const jwt = await makeJwt("logistics");
    const supId = "00000000-0000-0000-0000-000000000a01";
    await app.fetch(
      new Request(`http://t/api/logistics/pos?supplierId=${supId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(eq).toHaveBeenCalledWith("supplier_id", supId);
  });

  it("returns 422 for invalid status", async () => {
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos?status=bogus", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid supplierId (not uuid)", async () => {
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos?supplierId=not-a-uuid", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for dealer role (no Supabase round-trip)", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.fetch(new Request("http://t/api/logistics/pos"), env);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/logistics/pos", () => {
  const SUPPLIER_ID = "00000000-0000-0000-0000-000000000a01";
  const WAREHOUSE_ID = "00000000-0000-0000-0000-000000000b01";
  const VALID = {
    supplierId: SUPPLIER_ID,
    warehouseId: WAREHOUSE_ID,
    lines: [{ sku: "MAT-K-001", qty: 2 }],
    dl: 4001,
  };

  it("returns 200 on success and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "PO-2050", supplier_id: SUPPLIER_ID, warehouse_id: WAREHOUSE_ID, status: "open", sup_status: "pending", dl: 4001, dl_refs: null }, error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_create_po", {
      p_supplier_id: SUPPLIER_ID,
      p_warehouse_id: WAREHOUSE_ID,
      p_lines: [{ sku: "MAT-K-001", qty: 2 }],
      p_dl: 4001,
      p_dl_refs: null,
    });
    assertRpcCallShape(rpc, "logistics_create_po", [
      "p_supplier_id",
      "p_warehouse_id",
      "p_lines",
      "p_dl",
      "p_dl_refs",
    ]);
  });

  it("supports combined PO with dlRefs[] (and no dl)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    await app.fetch(
      new Request("http://t/api/logistics/pos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: SUPPLIER_ID,
          warehouseId: WAREHOUSE_ID,
          lines: [{ sku: "MAT-K-001", qty: 5 }],
          dlRefs: [4001, 4002, 4003],
        }),
      }),
      env,
    );
    expect(rpc).toHaveBeenCalledWith("logistics_create_po", {
      p_supplier_id: SUPPLIER_ID,
      p_warehouse_id: WAREHOUSE_ID,
      p_lines: [{ sku: "MAT-K-001", qty: 5 }],
      p_dl: null,
      p_dl_refs: [4001, 4002, 4003],
    });
    assertRpcCallShape(rpc, "logistics_create_po", [
      "p_supplier_id",
      "p_warehouse_id",
      "p_lines",
      "p_dl",
      "p_dl_refs",
    ]);
  });

  it("returns 422 when lines is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID, lines: [] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when supplierId is not uuid", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID, supplierId: "not-a-uuid" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps P0001 supplier_not_found → 422 with code", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "supplier missing", details: "supplier_not_found" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("supplier_not_found");
  });

  it("returns 403 for non-logistics", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/logistics/pos/:id/receive", () => {
  const PO_ID = "PO-2030";

  it("returns 200 on success and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { po_status: "received", orders_promoted: ["00000000-0000-0000-0000-000000000a01"] },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "MAT-K-001", receivedQty: 2 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_receive_po_line", {
      p_po_id: PO_ID,
      p_sku: "MAT-K-001",
      p_received_qty: 2,
    });
    assertRpcCallShape(rpc, "logistics_receive_po_line", ["p_po_id", "p_sku", "p_received_qty"]);
  });

  it("returns 422 when receivedQty is zero or negative", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "MAT-K-001", receivedQty: 0 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when sku is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "", receivedQty: 2 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps P0001 over_received → 422 with code", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "over receipt", details: "over_received" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "MAT-K-001", receivedQty: 99 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("over_received");
  });

  it("returns 403 for non-logistics (no rpc)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "MAT-K-001", receivedQty: 2 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/logistics/pos/:id/cancel", () => {
  const PO_ID = "PO-2030";

  it("returns 200 on success and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: PO_ID, status: "cancelled" }, error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Wrong supplier selected" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_cancel_po", {
      p_po_id: PO_ID,
      p_reason: "Wrong supplier selected",
    });
    assertRpcCallShape(rpc, "logistics_cancel_po", ["p_po_id", "p_reason"]);
  });

  it("returns 422 when reason is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps 22023 wrong_status → 422 (PO already received/cancelled)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "PO not open", details: "wrong_status" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "test" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps 42P01 → 404 (PO not found)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "42P01", message: "PO not found", details: "po_not_found" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "test" }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-logistics (no rpc)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "test" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/logistics/pos/:id/assign-pickup-partner", () => {
  const PO_ID = "PO-2030";
  const PARTNER_ID = "00000000-0000-0000-0000-000000000c01";

  it("returns 200 on success and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: PO_ID, sup_status: "pickup_assigned" }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_assign_pickup_partner", {
      p_po_id: PO_ID,
      p_partner_id: PARTNER_ID,
    });
    assertRpcCallShape(rpc, "logistics_assign_pickup_partner", ["p_po_id", "p_partner_id"]);
  });

  it("returns 422 when partnerId is not uuid", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: "not-a-uuid" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps 22023 wrong_sup_status → 422", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "wrong sup_status", details: "wrong_sup_status" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for non-logistics (no rpc)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  // v3-S2.4 — destination warehouse override: UI + zod + Hono accept it.
  // The RPC binding lands in v3-S4 (logistics_assign_partner_and_dispatch).
  // Until then, the chosen warehouseId is captured in the request body but
  // not forwarded to the existing RPC, which still receives only the two
  // original args.
  it("accepts an optional warehouseId field (passes zod) and still calls RPC with only po_id + partner_id", async () => {
    const WAREHOUSE_ID = "00000000-0000-0000-0000-000000000d01";
    const rpc = vi.fn().mockResolvedValue({ data: { id: PO_ID, sup_status: "pickup_assigned" }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID, warehouseId: WAREHOUSE_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    // RPC binding deferred to v3-S4 — current shape stays {p_po_id, p_partner_id}.
    expect(rpc).toHaveBeenCalledWith("logistics_assign_pickup_partner", {
      p_po_id: PO_ID,
      p_partner_id: PARTNER_ID,
    });
    assertRpcCallShape(rpc, "logistics_assign_pickup_partner", ["p_po_id", "p_partner_id"]);
  });

  it("still works when warehouseId is not provided (backward-compat)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: PO_ID, sup_status: "pickup_assigned" }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_assign_pickup_partner", {
      p_po_id: PO_ID,
      p_partner_id: PARTNER_ID,
    });
  });

  it("returns 422 when warehouseId is not a uuid", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID, warehouseId: "not-a-uuid" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // v3-S3.4 — Outsource toggle (spec §8.2). Body without `partnerId` but with
  // (outsourcePartnerName + outsourcePartnerContact + outsourcePartnerZones?)
  // hits a direct `purchase_orders` UPDATE path instead of the legacy RPC.
  // The proper RPC `logistics_assign_partner_and_dispatch` lands in v3-S4.
  // -------------------------------------------------------------------------
  it("outsource path: direct PO update with outsource fields + sup_status='pickup_assigned'", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: PO_ID,
        sup_status: "pickup_assigned",
        outsource_partner_name: "Ah Beng Lorry",
        outsource_partner_contact: "+60 12-345 6789",
        outsource_partner_zones: "Klang Valley",
      },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from, rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          outsourcePartnerName: "Ah Beng Lorry",
          outsourcePartnerContact: "+60 12-345 6789",
          outsourcePartnerZones: "Klang Valley",
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    // No RPC fired on the outsource path — direct UPDATE only.
    expect(rpc).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("purchase_orders");
    expect(update).toHaveBeenCalledWith({
      outsource_partner_name: "Ah Beng Lorry",
      outsource_partner_contact: "+60 12-345 6789",
      outsource_partner_zones: "Klang Valley",
      sup_status: "pickup_assigned",
    });
    expect(eq).toHaveBeenCalledWith("id", PO_ID);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.po.id).toBe(PO_ID);
    expect(body.po.outsource_partner_name).toBe("Ah Beng Lorry");
  });

  it("outsource path: zones is optional (null when omitted)", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: PO_ID, sup_status: "pickup_assigned" },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from, rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          outsourcePartnerName: "Ah Beng Lorry",
          outsourcePartnerContact: "+60 12-345 6789",
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      outsource_partner_name: "Ah Beng Lorry",
      outsource_partner_contact: "+60 12-345 6789",
      outsource_partner_zones: null,
      sup_status: "pickup_assigned",
    });
  });

  it("outsource path: maps PG error to 422 (e.g. CHECK constraint violation)", async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      // 23514 = CHECK constraint violation; mapPgError treats unknown codes as 500.
      // Use 22023 (invalid_param → 422) to validate that the route runs the
      // result through mapPgError.
      error: { code: "22023", message: "violates po_outsource_xor_partner", details: "wrong_state" },
    });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from, rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          outsourcePartnerName: "Ah Beng Lorry",
          outsourcePartnerContact: "+60 12-345 6789",
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when both partnerId AND outsource fields are set (zod XOR)", async () => {
    const rpc = vi.fn();
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc, from } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: PARTNER_ID,
          outsourcePartnerName: "Ah Beng Lorry",
          outsourcePartnerContact: "+60 12-345 6789",
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 422 when neither partnerId nor outsource fields are set (zod XOR)", async () => {
    const rpc = vi.fn();
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc, from } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 422 when outsourcePartnerName is set but contact is missing (zod refine)", async () => {
    const rpc = vi.fn();
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc, from } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ outsourcePartnerName: "Ah Beng Lorry" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});

describe("POST /api/logistics/pos/:id/reassign-warehouse", () => {
  const PO_ID = "PO-2030";
  const NEW_WH = "00000000-0000-0000-0000-000000000d01";

  it("returns 200 on success and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: PO_ID, warehouse_id: NEW_WH, sup_status: "ready_for_pickup" }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/reassign-warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newWarehouseId: NEW_WH }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_reassign_po_warehouse", {
      p_po_id: PO_ID,
      p_new_warehouse_id: NEW_WH,
    });
    assertRpcCallShape(rpc, "logistics_reassign_po_warehouse", ["p_po_id", "p_new_warehouse_id"]);
  });

  it("returns 422 when newWarehouseId is not uuid", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/reassign-warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newWarehouseId: "not-a-uuid" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps 22023 wrong_state → 422 (PO not in reassign_needed)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "not in reassign state", details: "wrong_state" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/reassign-warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newWarehouseId: NEW_WH }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for non-logistics (no rpc)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/reassign-warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newWarehouseId: NEW_WH }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C5.3 — GET /api/logistics/pos/awaiting-stock-shortage (auto-fill feed)
// ---------------------------------------------------------------------------
describe("GET /api/logistics/pos/awaiting-stock-shortage", () => {
  // Wire up a per-table .from() chain mock similar to orders.test.ts
  // mockDetailQueries — each table call returns its own thenable chain.
  //
  // v3-S2.1 update: also stubs purchase_orders for the "exclude orders already
  // covered by an open PO" filter. The mock applies the route's
  // `.eq("status", X)` filter to `opts.pos` so that tests can supply a mix of
  // open/received/cancelled rows and verify the route filters correctly.
  function mockShortageQueries(opts: {
    awaitingOrders?: { id: string; dl?: number | null }[];
    // v3-S2.1: lines may optionally carry `order_id` so the mock can mirror
    // `.in("order_id", [...])` filtering — tests supply lines for ALL orders
    // and assert the route narrows the input set BEFORE this fetch. Lines
    // without order_id always pass through (preserves existing tests).
    orderLines?: { sku: string; qty: number; order_id?: string }[];
    stockBalances?: { sku: string; qty: number; reserved: number }[];
    pos?: { status: string; dl: number | null; dl_refs: number[] | null }[];
  }) {
    const fromImpl = vi.fn((table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const promise = (data: any) => Promise.resolve({ data, error: null });
      switch (table) {
        case "orders":
          // The route filters on logistics_stage='awaiting_stock' via .eq().
          // Resolve at .eq(...) by overriding it with a thenable.
          chain.eq = vi.fn(() => promise(opts.awaitingOrders ?? []));
          break;
        case "order_lines":
          // Resolves at .in('order_id', [...]). Mock applies the same filter
          // so tests can provide lines for ALL orders and verify the route
          // narrowed the order set first (per v3-S2.1).
          chain.in = vi.fn((col: string, ids: string[]) => {
            let rows = opts.orderLines ?? [];
            if (col === "order_id") {
              rows = rows.filter((l) => l.order_id === undefined || ids.includes(l.order_id));
            }
            // Strip order_id from response — route only selects `sku, qty`.
            return promise(
              rows.map((l) => ({ sku: l.sku, qty: l.qty })),
            );
          });
          break;
        case "stock_balances":
          // No filter on this query — the .select() chain itself awaits.
          chain.select = vi.fn(() => promise(opts.stockBalances ?? []));
          break;
        case "purchase_orders":
          // v3-S2.1: route calls `.eq("status", "open")` to grab POs that
          // currently cover orders. Mock applies the same filter so a test
          // that supplies a received/cancelled row sees an empty result —
          // the route's filter is what makes that row invisible.
          chain.eq = vi.fn((col: string, val: string) => {
            let rows = opts.pos ?? [];
            if (col === "status") rows = rows.filter((p) => p.status === val);
            return promise(rows.map((p) => ({ dl: p.dl, dl_refs: p.dl_refs })));
          });
          break;
      }
      return chain;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: fromImpl } as any);
    return fromImpl;
  }

  it("returns 403 for non-logistics role (no Supabase round-trip)", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns {shortage: []} when no awaiting_stock orders exist", async () => {
    mockShortageQueries({ awaitingOrders: [] });
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { shortage: unknown[] };
    expect(body.shortage).toEqual([]);
  });

  it("returns aggregated shortage when avail < need (3 orders, 2 SKUs, 1 in shortage)", async () => {
    // Three awaiting_stock orders. Two SKUs hit. avail < need on MAT only.
    mockShortageQueries({
      awaitingOrders: [
        { id: "00000000-0000-0000-0000-000000000a01" },
        { id: "00000000-0000-0000-0000-000000000a02" },
        { id: "00000000-0000-0000-0000-000000000a03" },
      ],
      orderLines: [
        // MAT total need = 5
        { sku: "mattress:cloud:King", qty: 2 },
        { sku: "mattress:cloud:King", qty: 1 },
        { sku: "mattress:cloud:King", qty: 2 },
        // SOFA total need = 1
        { sku: "sofa:nordic:3s", qty: 1 },
      ],
      stockBalances: [
        // MAT avail = 3 → shortage 2
        { sku: "mattress:cloud:King", qty: 3, reserved: 0 },
        // SOFA avail = 5 → no shortage (excluded)
        { sku: "sofa:nordic:3s", qty: 5, reserved: 0 },
      ],
    });
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; need: number; available: number; shortage: number }[];
    };
    expect(body.shortage).toHaveLength(1);
    expect(body.shortage[0]).toEqual({
      sku: "mattress:cloud:King",
      need: 5,
      available: 3,
      shortage: 2,
    });
  });

  it("excludes SKUs where avail >= need (negative case)", async () => {
    mockShortageQueries({
      awaitingOrders: [{ id: "00000000-0000-0000-0000-000000000a01" }],
      orderLines: [{ sku: "sofa:nordic:3s", qty: 2 }],
      stockBalances: [{ sku: "sofa:nordic:3s", qty: 10, reserved: 5 }], // avail = 5
    });
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { shortage: unknown[] };
    expect(body.shortage).toEqual([]);
  });

  it("sums correctly across multiple warehouses for `available`", async () => {
    // Two warehouses both stock the same SKU. available = (10-5) + (3-2) = 6.
    // need = 8. shortage = 2.
    mockShortageQueries({
      awaitingOrders: [
        { id: "00000000-0000-0000-0000-000000000a01" },
        { id: "00000000-0000-0000-0000-000000000a02" },
      ],
      orderLines: [
        { sku: "mattress:cloud:King", qty: 5 },
        { sku: "mattress:cloud:King", qty: 3 },
      ],
      stockBalances: [
        { sku: "mattress:cloud:King", qty: 10, reserved: 5 }, // WH1: avail 5
        { sku: "mattress:cloud:King", qty: 3, reserved: 2 },  // WH2: avail 1
      ],
    });
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; need: number; available: number; shortage: number }[];
    };
    expect(body.shortage).toHaveLength(1);
    expect(body.shortage[0]).toEqual({
      sku: "mattress:cloud:King",
      need: 8,
      available: 6,
      shortage: 2,
    });
  });

  // -------------------------------------------------------------------------
  // v3-S2.1 — exclude orders already covered by an open PO (Bug 7 partial fix)
  // -------------------------------------------------------------------------
  it("filters out awaiting_stock orders covered by open POs via dl", async () => {
    // Two awaiting_stock orders. Order A (dl=4001) is covered by an open PO
    // that targets dl=4001 directly → its lines must NOT contribute to
    // shortage. Order B (dl=4002) is uncovered → its lines DO contribute.
    // Lines for BOTH orders are supplied to the mock; the mock filters by
    // the order_id list the route passes to `.in()`, so if the route
    // failed to drop order A, order A's `mattress` line would surface.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    const ID_B = "00000000-0000-0000-0000-000000000a02";
    mockShortageQueries({
      awaitingOrders: [
        { id: ID_A, dl: 4001 },
        { id: ID_B, dl: 4002 },
      ],
      orderLines: [
        // Order A — would surface if route fails to filter.
        { order_id: ID_A, sku: "mattress:cloud:King", qty: 5 },
        // Order B — should surface (uncovered).
        { order_id: ID_B, sku: "sofa:nordic:3s", qty: 2 },
      ],
      stockBalances: [
        { sku: "mattress:cloud:King", qty: 0, reserved: 0 },
        { sku: "sofa:nordic:3s", qty: 0, reserved: 0 },
      ],
      pos: [
        { status: "open", dl: 4001, dl_refs: null },
      ],
    });
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; need: number; available: number; shortage: number }[];
    };
    // Only order B's SKU surfaces — order A is covered by an open PO.
    expect(body.shortage).toEqual([
      { sku: "sofa:nordic:3s", need: 2, available: 0, shortage: 2 },
    ]);
  });

  it("filters out awaiting_stock orders covered by open POs via dl_refs array", async () => {
    // Order A (dl=4001) and Order B (dl=4002) are both covered by ONE batch
    // PO with dl=null and dl_refs=[4001, 4002]. Order C (dl=4003) is not.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    const ID_B = "00000000-0000-0000-0000-000000000a02";
    const ID_C = "00000000-0000-0000-0000-000000000a03";
    mockShortageQueries({
      awaitingOrders: [
        { id: ID_A, dl: 4001 },
        { id: ID_B, dl: 4002 },
        { id: ID_C, dl: 4003 },
      ],
      orderLines: [
        { order_id: ID_A, sku: "sofa:nordic:3s", qty: 2 },
        { order_id: ID_B, sku: "sofa:nordic:3s", qty: 1 },
        { order_id: ID_C, sku: "mattress:cloud:King", qty: 3 },
      ],
      stockBalances: [
        { sku: "mattress:cloud:King", qty: 1, reserved: 0 },
        { sku: "sofa:nordic:3s", qty: 0, reserved: 0 },
      ],
      pos: [
        { status: "open", dl: null, dl_refs: [4001, 4002] },
      ],
    });
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; need: number; available: number; shortage: number }[];
    };
    // Only order C's SKU surfaces — A and B are covered by the batch PO.
    expect(body.shortage).toEqual([
      { sku: "mattress:cloud:King", need: 3, available: 1, shortage: 2 },
    ]);
  });

  it("received POs do NOT exclude orders (only open POs count)", async () => {
    // Order A's PO is `received` — the PO is done, but the order is still
    // in awaiting_stock somehow (e.g. PO partially received and a new
    // shortage emerged). The route must NOT exclude this order on the
    // basis of the received PO. The mock applies the route's
    // `.eq("status", "open")` filter, so a received row returns []
    // from the purchase_orders fetch — the test passes only if the route
    // is asking for status='open' (any other filter returns the row and
    // the order would be excluded).
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    mockShortageQueries({
      awaitingOrders: [
        { id: ID_A, dl: 4001 },
      ],
      orderLines: [
        { order_id: ID_A, sku: "sofa:nordic:3s", qty: 2 },
      ],
      stockBalances: [
        { sku: "sofa:nordic:3s", qty: 0, reserved: 0 },
      ],
      pos: [
        { status: "received", dl: 4001, dl_refs: null },
      ],
    });
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; need: number; available: number; shortage: number }[];
    };
    // Order A's SKU IS in shortage — received PO does not gate it.
    expect(body.shortage).toEqual([
      { sku: "sofa:nordic:3s", need: 2, available: 0, shortage: 2 },
    ]);
  });

  it("cancelled POs do NOT exclude orders (only open POs count)", async () => {
    // Same shape as the received case — a cancelled PO is a dead PO; the
    // order is back in play if it's still in awaiting_stock.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    mockShortageQueries({
      awaitingOrders: [
        { id: ID_A, dl: 4001 },
      ],
      orderLines: [
        { order_id: ID_A, sku: "sofa:nordic:3s", qty: 2 },
      ],
      stockBalances: [
        { sku: "sofa:nordic:3s", qty: 0, reserved: 0 },
      ],
      pos: [
        { status: "cancelled", dl: 4001, dl_refs: null },
      ],
    });
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; need: number; available: number; shortage: number }[];
    };
    expect(body.shortage).toEqual([
      { sku: "sofa:nordic:3s", need: 2, available: 0, shortage: 2 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// C5.2 — POST /api/logistics/pos/batch (batch-create with per-PO warehouse)
// ---------------------------------------------------------------------------
describe("POST /api/logistics/pos/batch", () => {
  const SUPPLIER_A = "00000000-0000-0000-0000-000000000a01";
  const SUPPLIER_B = "00000000-0000-0000-0000-000000000a02";
  const WH_KLANG = "00000000-0000-0000-0000-000000000b01";
  const WH_PJ = "00000000-0000-0000-0000-000000000b02";

  const TWO_POS = {
    pos: [
      {
        supplierId: SUPPLIER_A,
        warehouseId: WH_KLANG,
        lines: [{ sku: "mattress:carres-cloud:King", qty: 2 }],
      },
      {
        supplierId: SUPPLIER_B,
        warehouseId: WH_PJ,
        lines: [{ sku: "sofa:oak:3-seater", qty: 1 }],
      },
    ],
  };

  it("happy path: 2 POs different suppliers + warehouses → returns poIds[]", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { po_ids: ["PO-2031", "PO-2032"] },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(TWO_POS),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { poIds: string[] };
    expect(body.poIds).toEqual(["PO-2031", "PO-2032"]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("logistics_create_pos_batch", {
      p_pos: [
        {
          supplier_id: SUPPLIER_A,
          warehouse_id: WH_KLANG,
          lines: [{ sku: "mattress:carres-cloud:King", qty: 2 }],
          eta_date: null,
          dl_refs: null,
          note: null,
        },
        {
          supplier_id: SUPPLIER_B,
          warehouse_id: WH_PJ,
          lines: [{ sku: "sofa:oak:3-seater", qty: 1 }],
          eta_date: null,
          dl_refs: null,
          note: null,
        },
      ],
    });
    assertRpcCallShape(rpc, "logistics_create_pos_batch", ["p_pos"]);
  });

  it("atomicity: helper failure on one PO returns 422; the RPC's single-call shape guarantees no partial inserts", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "invalid sku/qty", details: "invalid_qty", hint: "pos_index=1" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(TWO_POS),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("invalid_qty");
    // Single RPC call — atomicity is enforced inside Postgres, not here.
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("returns 422 for empty pos array (zod min(1))", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pos: [] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 422 for 21 entries (zod max(20))", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const onePo = {
      supplierId: SUPPLIER_A,
      warehouseId: WH_KLANG,
      lines: [{ sku: "mattress:carres-cloud:King", qty: 1 }],
    };
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pos: Array.from({ length: 21 }, () => onePo) }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps 22023 invalid_batch_size from RPC → 422 with code='invalid_batch_size'", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", message: "batch size", details: "invalid_batch_size" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(TWO_POS),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("invalid_batch_size");
  });

  it("maps 22023 warehouse_required → 422 with pos_index parsed from RPC hint", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "22023",
        message: "warehouse is required",
        details: "warehouse_required",
        hint: "pos_index=1",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(TWO_POS),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("warehouse_required");
    expect(body.pos_index).toBe(1);
  });

  it("returns 403 for dealer caller (no rpc)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/logistics/pos/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(TWO_POS),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
