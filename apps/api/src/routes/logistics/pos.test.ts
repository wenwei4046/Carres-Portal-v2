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
  // T25/T26 (migration 0055/0055b): every PO line now requires cost +
  // costSource on input — zod schema enforces non-NULL at the api edge,
  // RPC validates again for defense-in-depth (raises 22023
  // DETAIL='cost_required' if missing).
  const VALID = {
    supplierId: SUPPLIER_ID,
    warehouseId: WAREHOUSE_ID,
    lines: [{ sku: "MAT-K-001", qty: 2, cost: 1500, costSource: "hand_entered" as const }],
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
      // T29: per-line `costSource` is reshaped to snake_case `cost_source` at
      // the API edge before handing to the RPC (matches DB JSONB convention).
      // 0073 cascade picker: each line carries an `attrs` jsonb (NULL for
      // mattress + legacy callers; bedframe/sofa get filled by the FE).
      p_lines: [{ sku: "MAT-K-001", qty: 2, cost: 1500, cost_source: "hand_entered", attrs: null }],
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
          lines: [{ sku: "MAT-K-001", qty: 5, cost: 1500, costSource: "hand_entered" }],
          dlRefs: [4001, 4002, 4003],
        }),
      }),
      env,
    );
    expect(rpc).toHaveBeenCalledWith("logistics_create_po", {
      p_supplier_id: SUPPLIER_ID,
      p_warehouse_id: WAREHOUSE_ID,
      // T29: per-line `costSource` reshaped to snake_case `cost_source` at API edge.
      // 0073 cascade picker: attrs jsonb (NULL for mattress + legacy lines).
      p_lines: [{ sku: "MAT-K-001", qty: 5, cost: 1500, cost_source: "hand_entered", attrs: null }],
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

  // v3-active.1 (migration 0037): logistics_create_po now calls
  // _v3_claim_threads_for_po after the PO insert. If a concurrent transaction
  // already claimed one of the matching threads, the helper raises 40001
  // (serialization_failure). mapPgError surfaces it as 409 Conflict.
  it("maps 40001 concurrent_claim → 409 conflict", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "40001",
        message: "concurrent_claim: 1 thread(s) already claimed",
        details: "concurrent_claim",
        hint:
          "Another logistics user has already issued a PO for these threads. Refresh and try again.",
      },
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
    expect(res.status).toBe(409);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("concurrent_claim");
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
  const VALID_BODY = {
    doNumber: "DO-5210",
    doFilePath: `${PO_ID}/abc-DO-5210.pdf`,
    lines: [{ sku: "MAT-K-001", receivedQty: 2 }],
  };

  it("returns 200 on success and calls v3 RPC with snake_case-reshaped lines", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        po_id: PO_ID,
        do_file_path: VALID_BODY.doFilePath,
        do_number: VALID_BODY.doNumber,
        lines_updated: 1,
        threads_advanced: 0,
        po_status: "received",
        sup_status: "delivered",
        was_relocated: false,
      },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID_BODY),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_receive_po_with_do", {
      p_po_id: PO_ID,
      p_do_file_path: VALID_BODY.doFilePath,
      p_do_number: VALID_BODY.doNumber,
      // jsonb payload uses snake_case received_qty (RPC reads
      // v_line->>'received_qty' at 0045:688). camelCase → snake_case
      // reshape happens at the route boundary.
      p_lines: [{ sku: "MAT-K-001", received_qty: 2 }],
    });
    assertRpcCallShape(rpc, "logistics_receive_po_with_do", [
      "p_po_id",
      "p_do_file_path",
      "p_do_number",
      "p_lines",
    ]);
  });

  it("returns 422 when receivedQty is negative", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...VALID_BODY,
          lines: [{ sku: "MAT-K-001", receivedQty: -1 }],
        }),
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
        body: JSON.stringify({
          ...VALID_BODY,
          lines: [{ sku: "", receivedQty: 2 }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when doNumber is too short", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_BODY, doNumber: "DO" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when lines is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_BODY, lines: [] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps P0001 over_received → 422 with code", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "over receipt", details: "over_received" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...VALID_BODY,
          lines: [{ sku: "MAT-K-001", receivedQty: 99 }],
        }),
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
        body: JSON.stringify(VALID_BODY),
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
  const WAREHOUSE_ID = "00000000-0000-0000-0000-000000000d01";

  // v3-S4.4 — both partner AND outsource paths now hit the unified RPC
  // `logistics_assign_partner_and_dispatch`. The 6-arg shape (p_po_id +
  // p_partner_id + p_outsource_name + p_outsource_contact + p_outsource_zones
  // + p_warehouse_override_id) is asserted on every successful call. The XOR
  // refine in zod catches both/neither at the FE boundary; the new RPC
  // re-checks at the DB layer and raises 22023 + detail='partner_or_outsource_xor'
  // which maps to 422 + code='invalid_xor'. The pre-v3-S4 direct
  // `purchase_orders` UPDATE branch is gone — RLS-bounded UPDATE skipped
  // po_history + audit_log writes (carry-forward `phase-4-v3-outsource-audit-gap`).
  const RPC_KEYS = [
    "p_po_id",
    "p_partner_id",
    "p_outsource_name",
    "p_outsource_contact",
    "p_outsource_zones",
    "p_warehouse_override_id",
  ];

  it("partner path: 200 + RPC called with full 6-arg shape (warehouseId omitted → null)", async () => {
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
    expect(rpc).toHaveBeenCalledWith("logistics_assign_partner_and_dispatch", {
      p_po_id: PO_ID,
      p_partner_id: PARTNER_ID,
      p_outsource_name: null,
      p_outsource_contact: null,
      p_outsource_zones: null,
      p_warehouse_override_id: null,
    });
    assertRpcCallShape(rpc, "logistics_assign_partner_and_dispatch", RPC_KEYS);
  });

  it("partner path: warehouseId set → forwarded as p_warehouse_override_id", async () => {
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
    expect(rpc).toHaveBeenCalledWith("logistics_assign_partner_and_dispatch", {
      p_po_id: PO_ID,
      p_partner_id: PARTNER_ID,
      p_outsource_name: null,
      p_outsource_contact: null,
      p_outsource_zones: null,
      p_warehouse_override_id: WAREHOUSE_ID,
    });
    assertRpcCallShape(rpc, "logistics_assign_partner_and_dispatch", RPC_KEYS);
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
  // v3-S4.4 — Outsource path now goes through the same RPC. The pre-v3-S4
  // direct `purchase_orders` UPDATE branch is gone (skipped po_history +
  // audit_log writes — see carry-forward `phase-4-v3-outsource-audit-gap`).
  // The new unified RPC writes both audit + history at the DB layer.
  // -------------------------------------------------------------------------
  it("outsource path: SAME RPC called with outsource fields set + partner_id null + warehouseId forwarded", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: PO_ID,
        sup_status: "pickup_assigned",
        outsource_partner_name: "Ah Beng Lorry",
      },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          outsourcePartnerName: "Ah Beng Lorry",
          outsourcePartnerContact: "+60 12-345 6789",
          outsourcePartnerZones: "Klang Valley",
          warehouseId: WAREHOUSE_ID,
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_assign_partner_and_dispatch", {
      p_po_id: PO_ID,
      p_partner_id: null,
      p_outsource_name: "Ah Beng Lorry",
      p_outsource_contact: "+60 12-345 6789",
      p_outsource_zones: "Klang Valley",
      p_warehouse_override_id: WAREHOUSE_ID,
    });
    assertRpcCallShape(rpc, "logistics_assign_partner_and_dispatch", RPC_KEYS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.po.id).toBe(PO_ID);
    expect(body.po.outsource_partner_name).toBe("Ah Beng Lorry");
  });

  it("outsource path: zones omitted → p_outsource_zones null; warehouseId omitted → null", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: PO_ID, sup_status: "pickup_assigned" },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
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
    expect(rpc).toHaveBeenCalledWith("logistics_assign_partner_and_dispatch", {
      p_po_id: PO_ID,
      p_partner_id: null,
      p_outsource_name: "Ah Beng Lorry",
      p_outsource_contact: "+60 12-345 6789",
      p_outsource_zones: null,
      p_warehouse_override_id: null,
    });
    assertRpcCallShape(rpc, "logistics_assign_partner_and_dispatch", RPC_KEYS);
  });

  it("outsource path: PG error mapped to 422 via mapPgError", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", message: "wrong state", details: "wrong_sup_status" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
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

  it("maps 22023 detail='partner_or_outsource_xor' → 422 with code='invalid_xor' (RPC defense-in-depth)", async () => {
    // The RPC re-validates XOR at the DB layer and raises 22023 with this
    // specific detail. mapPgError treats generic 22023 as code='invalid_param';
    // this route adds a one-detail intercept so the FE can distinguish a
    // duplicated-args XOR violation from any other 22023 (wrong_sup_status,
    // warehouse_not_found, etc).
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "22023",
        message: "exactly one of p_partner_id / p_outsource_name must be set",
        details: "partner_or_outsource_xor",
      },
    });
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("invalid_xor");
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
// C5.3 / v3-S4.6 — GET /api/logistics/pos/awaiting-stock-shortage (auto-fill feed)
// ---------------------------------------------------------------------------
// Mock matrix (4 tables touched by the dual-path route):
//   - order_supplier_threads (v3-S4.6 PRIMARY): rows where
//     logistics_stage='awaiting_logistics_action' AND po_id IS NULL identify
//     not-yet-procured slices. The mock returns ALL thread rows; the route
//     narrows in TS so tests can supply a mix of stages / po_id values.
//   - orders (v3-S4.6 LEGACY fallback): orders in awaiting_logistics_action
//     that have NO thread row (pre-v3 / unsplit). The mock resolves on
//     .eq("logistics_stage", "awaiting_logistics_action") (T5 collapsed the
//     prior IN-list filter to a single-value .eq()).
//   - purchase_orders (v2-style coverage filter on legacy fallback): only
//     open POs gate orders. Received/cancelled don't count.
//   - order_lines + stock_balances: same as before.
describe("GET /api/logistics/pos/awaiting-stock-shortage", () => {
  function mockShortageQueries(opts: {
    // v3-S4.6: thread rows. Each row tagged with logistics_stage + po_id so
    // tests can verify primary-path filtering. Default: empty (no v3 split
    // has happened — tests fall back to the legacy path).
    threads?: {
      order_id: string;
      logistics_stage: string;
      po_id: string | null;
    }[];
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
        is: vi.fn().mockReturnThis(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const promise = (data: any) => Promise.resolve({ data, error: null });
      switch (table) {
        case "order_supplier_threads":
          // v3-S4.6: route calls .from('order_supplier_threads').select('order_id, logistics_stage, po_id')
          // — no filters, the route does the narrowing in TS so a single fetch
          // serves both "primary path" and "has any thread" lookups. The mock
          // resolves at .select() (which is the awaitable thenable).
          chain.select = vi.fn(() => promise(opts.threads ?? []));
          break;
        case "orders":
          // T5 (Phase 4.5a): route now calls
          // `.eq("logistics_stage", "awaiting_logistics_action")` (the legacy
          // IN-list aliasing was dropped). The mock resolves at .eq(); the
          // .in() variant is kept as a safety net so an older v2 fallback
          // path (or a future re-widening) doesn't silently break this mock.
          chain.eq = vi.fn(() => promise(opts.awaitingOrders ?? []));
          chain.in = vi.fn(() => promise(opts.awaitingOrders ?? []));
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

  it("returns {shortage: []} when no awaiting_logistics_action orders exist", async () => {
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
    // Three awaiting_logistics_action orders. Two SKUs hit. avail < need on MAT only.
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
  it("filters out awaiting_logistics_action orders covered by open POs via dl", async () => {
    // Two awaiting_logistics_action orders. Order A (dl=4001) is covered by an open PO
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

  it("filters out awaiting_logistics_action orders covered by open POs via dl_refs array", async () => {
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
    // in awaiting_logistics_action somehow (e.g. PO partially received and a new
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
    // order is back in play if it's still in awaiting_logistics_action.
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

  // -------------------------------------------------------------------------
  // v3-S4.6 — primary path: order_supplier_threads.po_id IS NULL
  //
  // After v3-S4 (migration 0033) every confirmed order is split into per-
  // (supplier, category) threads. A thread with logistics_stage =
  // 'awaiting_logistics_action' AND po_id IS NULL is the "not yet covered by
  // a PO" auto-fill target. The dl/dl_refs join from v3-S2.1 is now the
  // SECONDARY (legacy) path for orders that exist but have no thread rows
  // (pre-v3 data, or confirm_proceed_request_v3 not yet called).
  // -------------------------------------------------------------------------
  it("v3 primary: thread with po_id NULL contributes its order's lines to shortage", async () => {
    // Order A has been split into a thread at awaiting_logistics_action with
    // po_id NULL → its lines must surface. The order itself does NOT need to
    // be in `awaitingOrders` because the primary path keys off threads, not
    // the orders.logistics_stage column.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    mockShortageQueries({
      threads: [
        { order_id: ID_A, logistics_stage: "awaiting_logistics_action", po_id: null },
      ],
      // No row in awaitingOrders — proves the primary path is doing the work.
      awaitingOrders: [],
      orderLines: [
        { order_id: ID_A, sku: "mattress:cloud:King", qty: 4 },
      ],
      stockBalances: [
        { sku: "mattress:cloud:King", qty: 1, reserved: 0 },
      ],
      pos: [],
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
      { sku: "mattress:cloud:King", need: 4, available: 1, shortage: 3 },
    ]);
  });

  it("v3 primary: thread with po_id NOT NULL is excluded (already covered)", async () => {
    // Order A has a thread already pointing at PO-2050. It must NOT surface in
    // the auto-fill list — even though logistics_stage on the thread is still
    // 'awaiting_logistics_action' (which can happen briefly between PO insert
    // and stage advance). The po_id IS NULL gate is the discriminator.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    mockShortageQueries({
      threads: [
        { order_id: ID_A, logistics_stage: "awaiting_logistics_action", po_id: "PO-2050" },
      ],
      awaitingOrders: [],
      orderLines: [
        { order_id: ID_A, sku: "mattress:cloud:King", qty: 4 },
      ],
      stockBalances: [{ sku: "mattress:cloud:King", qty: 0, reserved: 0 }],
      pos: [],
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

  it("v3 primary: thread with logistics_stage past awaiting_logistics_action is excluded", async () => {
    // Even with po_id NULL, a thread that has moved past awaiting_logistics_action
    // is no longer a procurement target — the stage filter narrows to that
    // exact value. (po_id NULL + stage='dispatched' wouldn't normally happen
    // — the schema can't easily express it — but we test the stage filter is
    // applied so a future enum addition doesn't accidentally widen the surface.)
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    mockShortageQueries({
      threads: [
        { order_id: ID_A, logistics_stage: "ready_to_dispatch", po_id: null },
      ],
      awaitingOrders: [],
      orderLines: [
        { order_id: ID_A, sku: "mattress:cloud:King", qty: 4 },
      ],
      stockBalances: [{ sku: "mattress:cloud:King", qty: 0, reserved: 0 }],
      pos: [],
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

  it("v3 legacy fallback: order in awaiting_logistics_action with no thread + no covering open PO contributes lines", async () => {
    // Order A is pre-v3 / unsplit data: orders.logistics_stage='awaiting_logistics_action'
    // but no row exists in order_supplier_threads. The dl/dl_refs filter
    // against open POs runs as v2 did and leaves the order in play.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    mockShortageQueries({
      threads: [],
      awaitingOrders: [{ id: ID_A, dl: 4001 }],
      orderLines: [
        { order_id: ID_A, sku: "sofa:nordic:3s", qty: 2 },
      ],
      stockBalances: [{ sku: "sofa:nordic:3s", qty: 0, reserved: 0 }],
      pos: [],
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

  it("v3 legacy fallback: order WITH any thread is excluded from legacy path (split orders go through primary only)", async () => {
    // Order A has a thread (in dispatched stage, no po_id yet — unusual but
    // possible mid-pipeline). The fact that it has ANY thread means it has
    // been split, so the legacy path should NOT pick it up by orders.dl.
    // The primary path won't pick it up either (stage != awaiting_logistics_action).
    // Net: order A contributes nothing — it's mid-pipeline, not a procurement target.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    mockShortageQueries({
      threads: [
        { order_id: ID_A, logistics_stage: "dispatched", po_id: null },
      ],
      awaitingOrders: [{ id: ID_A, dl: 4001 }], // orders.logistics_stage rolled up to awaiting_logistics_action
      orderLines: [
        { order_id: ID_A, sku: "sofa:nordic:3s", qty: 2 },
      ],
      stockBalances: [{ sku: "sofa:nordic:3s", qty: 0, reserved: 0 }],
      pos: [],
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

  it("v3 union: same order surfaced by both paths is counted once (no double-aggregation)", async () => {
    // Pathological / migration overlap case: a thread at
    // awaiting_logistics_action + po_id NULL exists (primary), AND the orders
    // row is in awaiting_logistics_action (legacy fallback would also pick it
    // up if not for the "has any thread" gate). Even if the gate were
    // bypassed, the route must dedupe order_ids before aggregating order_lines
    // — order A's lines should contribute exactly once to `need`.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    mockShortageQueries({
      threads: [
        { order_id: ID_A, logistics_stage: "awaiting_logistics_action", po_id: null },
      ],
      awaitingOrders: [{ id: ID_A, dl: 4001 }],
      orderLines: [
        { order_id: ID_A, sku: "mattress:cloud:King", qty: 3 },
      ],
      stockBalances: [{ sku: "mattress:cloud:King", qty: 0, reserved: 0 }],
      pos: [],
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
    // need = 3 (NOT 6 — no double count from the two paths).
    expect(body.shortage).toEqual([
      { sku: "mattress:cloud:King", need: 3, available: 0, shortage: 3 },
    ]);
  });

  it("v3 union: primary thread + separate legacy order both contribute to aggregated shortage", async () => {
    // Real-world v3 transition: order A has been split (thread, primary path
    // active), order B is pre-v3 legacy data (no thread, falls through to the
    // dl/dl_refs filter against open POs which matches nothing). Both should
    // surface and their lines aggregated by SKU.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    const ID_B = "00000000-0000-0000-0000-000000000a02";
    mockShortageQueries({
      threads: [
        { order_id: ID_A, logistics_stage: "awaiting_logistics_action", po_id: null },
      ],
      awaitingOrders: [{ id: ID_B, dl: 4002 }],
      orderLines: [
        { order_id: ID_A, sku: "mattress:cloud:King", qty: 2 },
        { order_id: ID_B, sku: "mattress:cloud:King", qty: 3 },
      ],
      stockBalances: [{ sku: "mattress:cloud:King", qty: 1, reserved: 0 }],
      pos: [],
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
    // need = 5 (2 from A primary + 3 from B legacy), available = 1, shortage = 4.
    expect(body.shortage).toEqual([
      { sku: "mattress:cloud:King", need: 5, available: 1, shortage: 4 },
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

  // T25/T26 (migration 0055/0055b): every PO line now requires cost +
  // costSource on input — see POST /api/logistics/pos block above for the
  // full rationale.
  const TWO_POS = {
    pos: [
      {
        supplierId: SUPPLIER_A,
        warehouseId: WH_KLANG,
        lines: [{ sku: "mattress:carres-cloud:King", qty: 2, cost: 1500, costSource: "hand_entered" as const }],
      },
      {
        supplierId: SUPPLIER_B,
        warehouseId: WH_PJ,
        lines: [{ sku: "sofa:oak:3-seater", qty: 1, cost: 2200, costSource: "prev_po" as const }],
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
          // T29: per-line `costSource` reshaped to snake_case `cost_source` at API edge.
          // 0073: attrs jsonb forwarded too (NULL for mattress + legacy callers).
          lines: [{ sku: "mattress:carres-cloud:King", qty: 2, cost: 1500, cost_source: "hand_entered", attrs: null }],
          eta_date: null,
          dl_refs: null,
          note: null,
        },
        {
          supplier_id: SUPPLIER_B,
          warehouse_id: WH_PJ,
          lines: [{ sku: "sofa:oak:3-seater", qty: 1, cost: 2200, cost_source: "prev_po", attrs: null }],
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
      lines: [{ sku: "mattress:carres-cloud:King", qty: 1, cost: 1500, costSource: "hand_entered" as const }],
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

  // v3-active.1 (migration 0037): logistics_create_pos_batch now calls
  // _v3_claim_threads_for_po after each helper insert inside the loop. If a
  // concurrent transaction already claimed one of the matching threads, the
  // helper raises 40001 (serialization_failure). mapPgError surfaces it as
  // 409 Conflict so the FE can show "Refresh and try again" — distinct from
  // 422 validation failures (warehouse_required, invalid_batch_size).
  it("maps 40001 concurrent_claim from RPC → 409 conflict", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "40001",
        message: "concurrent_claim: 2 thread(s) already claimed",
        details: "concurrent_claim",
        hint:
          "Another logistics user has already issued a PO for these threads. Refresh and try again.",
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
    expect(res.status).toBe(409);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("concurrent_claim");
    expect(body.message).toContain("concurrent_claim");
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
