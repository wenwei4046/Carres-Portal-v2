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

describe("GET /api/operation/pos", () => {
  const PO_ROW = {
    id: "PO-2030",
    supplier_id: "00000000-0000-0000-0000-000000000a01",
    warehouse_id: "00000000-0000-0000-0000-000000000b01",
    status: "open",
    sup_status: "pending",
    so: 4001,
    so_refs: null,
    eta_date: "2026-05-15",
    placed_at: "2026-05-03T10:00:00Z",
    purchase_order_lines: [
      // 0076's line UUID + P3's `short_since` (0306) both ride the list select.
      { id: "line-a", sku: "MAT-K-001", qty: 2, received_qty: 0, short_since: null },
    ],
  };

  /**
   * The list route makes TWO reads, and the mock has to know which is which:
   * the POs themselves, then P3's `po_supplier_promises` (0306) for the latest
   * answer per PO / per line. A single shared chain would let the second read
   * silently consume the first one's resolution.
   */
  function mockPosList(
    rows: typeof PO_ROW[],
    promises: Record<string, unknown>[] = [],
  ) {
    const eq = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const select = vi.fn(() => ({ eq, order, limit }));

    const promiseOrder = vi.fn().mockResolvedValue({ data: promises, error: null });
    const promiseIn = vi.fn(() => ({ order: promiseOrder }));
    const promiseSelect = vi.fn(() => ({ in: promiseIn }));

    vi.mocked(userClient).mockReturnValue({
      from: vi.fn((table: string) =>
        table === "po_supplier_promises"
          ? { select: promiseSelect }
          : { select },
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return { eq, order, limit, promiseIn, promiseSelect };
  }

  it("returns POs for operation with default 'all' status", async () => {
    const { order, limit } = mockPosList([PO_ROW]);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
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

  // ── P3 (0306) · what the supplier last told us, and what it was ABOUT ──────
  it("carries the LATEST answer per PO and per line, newest first", async () => {
    const { promiseIn } = mockPosList(
      [PO_ROW],
      [
        // Newest first — the route takes the FIRST row it sees for each key.
        { po_id: "PO-2030", po_line_id: null, kind: "tomorrow_delivery", about_date: "2026-09-15", recorded_at: "2026-09-02T00:00:00Z" },
        { po_id: "PO-2030", po_line_id: null, kind: "tomorrow_delivery", about_date: "2026-08-01", recorded_at: "2026-08-01T00:00:00Z" },
        { po_id: "PO-2030", po_line_id: "line-a", kind: "balance_delivery", about_qty: 2, recorded_at: "2026-09-03T00:00:00Z" },
        { po_id: "PO-2030", po_line_id: "line-a", kind: "balance_delivery", about_qty: 1, recorded_at: "2026-08-20T00:00:00Z" },
      ],
    );
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pos: {
        tomorrow_answer_about_date: string | null;
        purchase_order_lines: { id: string; balance_answer_about_qty: number | null }[];
      }[];
    };
    expect(promiseIn).toHaveBeenCalledWith("po_id", ["PO-2030"]);
    expect(body.pos[0]?.tomorrow_answer_about_date).toBe("2026-09-15");
    const lineA = body.pos[0]?.purchase_order_lines.find((l) => l.id === "line-a");
    expect(lineA?.balance_answer_about_qty).toBe(2);
  });

  it("a PO with no answer on file carries null, never a stale one", async () => {
    mockPosList([PO_ROW], []);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    const body = (await res.json()) as {
      pos: {
        tomorrow_answer_about_date: string | null;
        purchase_order_lines: { balance_answer_about_qty: number | null }[];
      }[];
    };
    expect(body.pos[0]?.tomorrow_answer_about_date).toBeNull();
    for (const l of body.pos[0]?.purchase_order_lines ?? [])
      expect(l.balance_answer_about_qty).toBeNull();
  });

  it("filters by status when query param provided", async () => {
    const { eq } = mockPosList([PO_ROW]);
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request("http://t/api/operation/pos?status=open", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(eq).toHaveBeenCalledWith("status", "open");
  });

  it("filters by supplierId when query param provided", async () => {
    const { eq } = mockPosList([PO_ROW]);
    const jwt = await makeJwt("operation");
    const supId = "00000000-0000-0000-0000-000000000a01";
    await app.fetch(
      new Request(`http://t/api/operation/pos?supplierId=${supId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(eq).toHaveBeenCalledWith("supplier_id", supId);
  });

  it("returns 422 for invalid status", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos?status=bogus", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid supplierId (not uuid)", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos?supplierId=not-a-uuid", {
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
      new Request("http://t/api/operation/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.fetch(new Request("http://t/api/operation/pos"), env);
    expect(res.status).toBe(401);
  });
});

// Loo 2026-05-16 — per-source-order delivery dates for the PO detail modal.
describe("GET /api/operation/pos/:id/source-orders", () => {
  function mockSourceOrders(opts: {
    po?: { so: number | null; so_refs: number[] | null } | null;
    orders?: { so: number; delivery_date: string | null }[];
  }) {
    const fromImpl = vi.fn((table: string) => {
      if (table === "purchase_orders") {
        const maybeSingle = vi.fn().mockResolvedValue({
          data: opts.po === undefined ? { so: null, so_refs: null } : opts.po,
          error: null,
        });
        const eq = vi.fn(() => ({ maybeSingle }));
        const select = vi.fn(() => ({ eq }));
        return { select };
      }
      if (table === "orders") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ordersChain: any = {};
        ordersChain.select = vi.fn(() => ordersChain);
        ordersChain.in = vi.fn(() => ordersChain);
        ordersChain.order = vi.fn().mockResolvedValue({
          data: opts.orders ?? [],
          error: null,
        });
        return ordersChain;
      }
      throw new Error(`unexpected table: ${table}`);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: fromImpl } as any);
    return fromImpl;
  }

  it("returns per-SO delivery dates for a bundle PO", async () => {
    mockSourceOrders({
      po: { so: null, so_refs: [1001, 1002, 1003] },
      orders: [
        { so: 1001, delivery_date: "2026-05-31" },
        { so: 1002, delivery_date: "2026-06-04" },
        { so: 1003, delivery_date: "2026-06-04" },
      ],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/PO-2032/source-orders", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      orders: { so: number; deliveryDate: string | null }[];
    };
    expect(body.orders).toEqual([
      { so: 1001, deliveryDate: "2026-05-31" },
      { so: 1002, deliveryDate: "2026-06-04" },
      { so: 1003, deliveryDate: "2026-06-04" },
    ]);
  });

  it("includes po.so alongside so_refs (single-order PO)", async () => {
    mockSourceOrders({
      po: { so: 4001, so_refs: null },
      orders: [{ so: 4001, delivery_date: "2026-05-15" }],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/PO-2030/source-orders", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      orders: { so: number; deliveryDate: string | null }[];
    };
    expect(body.orders).toEqual([
      { so: 4001, deliveryDate: "2026-05-15" },
    ]);
  });

  it("returns 404 when PO does not exist", async () => {
    mockSourceOrders({ po: null });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/PO-MISSING/source-orders", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-operation role", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/PO-2032/source-orders", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("POST /api/operation/pos", () => {
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
    so: 4001,
    // 0083 (Loo 2026-05-10) — etaDate now required (ISO date).
    etaDate: "2026-06-01",
  };

  // 0083: success-path tests need a chained `.from().update().eq()` mock
  // for the post-RPC eta_date UPDATE. Helper builds the chain inline so we
  // don't have to add it to every error-path test (those return before
  // reaching the UPDATE).
  function makeFromMock(updateError: unknown = null) {
    const eq = vi.fn().mockResolvedValue({ error: updateError });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    return { from, update, eq };
  }

  it("returns 200 on success and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "PO-2050", supplier_id: SUPPLIER_ID, warehouse_id: WAREHOUSE_ID, status: "open", sup_status: "pending", so: 4001, so_refs: null }, error: null,
    });
    const fromMock = makeFromMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc, from: fromMock.from } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operation_create_po", {
      p_supplier_id: SUPPLIER_ID,
      p_warehouse_id: WAREHOUSE_ID,
      // T29: per-line `costSource` is reshaped to snake_case `cost_source` at
      // the API edge before handing to the RPC (matches DB JSONB convention).
      // 0073 cascade picker: each line carries an `attrs` jsonb (NULL for
      // mattress + legacy callers; bedframe/sofa get filled by the FE).
      p_lines: [{ sku: "MAT-K-001", qty: 2, cost: 1500, cost_source: "hand_entered", attrs: null }],
      p_so: 4001,
      p_so_refs: null,
      // 0079 (Loo 2026-05-10) — procurement-leg LP pre-assigned at PO
      // creation. Null when caller omits (own_logistics suppliers).
      p_procurement_partner_id: null,
      // 0308 — MANUAL PURCHASE. Null on a customer-driven PO: the customer
      // order IS its justification, so it carries no purchase reason.
      p_reason_code: null,
      p_reason_note: null,
    });
    assertRpcCallShape(rpc, "operation_create_po", [
      "p_supplier_id",
      "p_warehouse_id",
      "p_lines",
      "p_so",
      "p_so_refs",
      "p_procurement_partner_id",
      "p_reason_code",
      "p_reason_note",
    ]);
    // 0083 (Loo 2026-05-10) — post-RPC UPDATE persists eta_date on the
    // returned PO id (RPC public signature doesn't accept p_eta_date).
    expect(fromMock.from).toHaveBeenCalledWith("purchase_orders");
    expect(fromMock.update).toHaveBeenCalledWith({ eta_date: "2026-06-01" });
    expect(fromMock.eq).toHaveBeenCalledWith("id", "PO-2050");
  });

  it("supports combined PO with soRefs[] (and no so)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "PO-2051" }, error: null });
    const fromMock = makeFromMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc, from: fromMock.from } as any);
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request("http://t/api/operation/pos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: SUPPLIER_ID,
          warehouseId: WAREHOUSE_ID,
          lines: [{ sku: "MAT-K-001", qty: 5, cost: 1500, costSource: "hand_entered" }],
          soRefs: [4001, 4002, 4003],
          // 0083: required.
          etaDate: "2026-07-15",
        }),
      }),
      env,
    );
    expect(rpc).toHaveBeenCalledWith("operation_create_po", {
      p_supplier_id: SUPPLIER_ID,
      p_warehouse_id: WAREHOUSE_ID,
      // T29: per-line `costSource` reshaped to snake_case `cost_source` at API edge.
      // 0073 cascade picker: attrs jsonb (NULL for mattress + legacy lines).
      p_lines: [{ sku: "MAT-K-001", qty: 5, cost: 1500, cost_source: "hand_entered", attrs: null }],
      p_so: null,
      p_so_refs: [4001, 4002, 4003],
      // 0079 (Loo 2026-05-10) — see prior test for rationale.
      p_procurement_partner_id: null,
      // 0308 — MANUAL PURCHASE. Null on a customer-driven PO: the customer
      // order IS its justification, so it carries no purchase reason.
      p_reason_code: null,
      p_reason_note: null,
    });
    assertRpcCallShape(rpc, "operation_create_po", [
      "p_supplier_id",
      "p_warehouse_id",
      "p_lines",
      "p_so",
      "p_so_refs",
      "p_procurement_partner_id",
      "p_reason_code",
      "p_reason_note",
    ]);
  });

  // ── Migration 0308 · MANUAL PURCHASE ────────────────────────────────────
  //
  // The reason is the SOLE stored marker of a manual purchase — there is no
  // `origin` column and there may not be one. These tests prove the ROUTE
  // forwards the boundary; the DATABASE enforces it (0308's CHECKs plus the
  // never-cleared trigger), and the shared zod mirrors it at the edge.

  it("0308 · forwards the purchase reason on a manual purchase", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "PO-2051" }, error: null });
    const fromMock = makeFromMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc, from: fromMock.from } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: SUPPLIER_ID,
          warehouseId: WAREHOUSE_ID,
          lines: [{ sku: "MAT-K-001", qty: 2, cost: 1500, costSource: "hand_entered" }],
          etaDate: "2026-06-01",
          reasonCode: "stockpile",
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const arg = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(arg.p_reason_code).toBe("stockpile");
    // And the boundary itself: a manual purchase carries no customer order.
    expect(arg.p_so).toBeNull();
    expect(arg.p_so_refs).toBeNull();
  });

  it("0308 · REFUSES a reason together with a customer order (422, not 500)", async () => {
    // The shared zod refine catches this at the edge so a store never meets a
    // raw 23514 from the CHECK that backs it. The CHECK is still the
    // enforcement — this is the courtesy layer 0296 established.
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: SUPPLIER_ID,
          warehouseId: WAREHOUSE_ID,
          lines: [{ sku: "MAT-K-001", qty: 2, cost: 1500, costSource: "hand_entered" }],
          etaDate: "2026-06-01",
          reasonCode: "stockpile",
          soRefs: [4001],
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // Refused before the database was asked.
    expect(rpc).not.toHaveBeenCalled();
  });

  it("0308 · REFUSES a blank reason", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: SUPPLIER_ID,
          warehouseId: WAREHOUSE_ID,
          lines: [{ sku: "MAT-K-001", qty: 2, cost: 1500, costSource: "hand_entered" }],
          etaDate: "2026-06-01",
          reasonCode: "   ",
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("returns 422 when lines is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
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

  // v3-active.1 (migration 0037): operation_create_po now calls
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
          "Another operation user has already issued a PO for these threads. Refresh and try again.",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
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

  it("returns 403 for non-operation", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
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

describe("POST /api/operation/pos/:id/receive", () => {
  const PO_ID = "PO-2030";
  const LINE_ID = "11111111-1111-4111-8111-111111111111";
  const VALID_BODY = {
    doNumber: "DO-5210",
    doFilePath: `${PO_ID}/abc-DO-5210.pdf`,
    // 0076 (Loo 2026-05-10): payload keys by line UUID `id` so multi-variant
    // POs (same SKU, different attrs) can be addressed unambiguously.
    lines: [{ id: LINE_ID, receivedQty: 2 }],
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID_BODY),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operation_receive_po_with_do", {
      p_po_id: PO_ID,
      p_do_file_path: VALID_BODY.doFilePath,
      p_do_number: VALID_BODY.doNumber,
      // jsonb payload uses snake_case received_qty (RPC reads
      // v_line->>'received_qty' at 0045:688). camelCase → snake_case
      // reshape happens at the route boundary. 0076 (2026-05-10): `id` is
      // already snake-case (single token), no reshape needed.
      // R1 (0284): the two inspection counters ride every line explicitly —
      // a clean delivery states "nothing was wrong" rather than staying
      // silent about it. The RPC would read an absent key as 0 either way.
      // R2 (0288): the claim's evidence rides with the report. A clean line
      // states "nothing wrong, nothing to prove" explicitly — the RPC only
      // demands photos for a line that actually reported a problem.
      p_lines: [
        {
          id: LINE_ID,
          received_qty: 2,
          damaged_qty: 0,
          wrong_item_qty: 0,
          damaged_photos: [],
          wrong_item_claim_type: null,
          wrong_item_photos: [],
        },
      ],
    });
    assertRpcCallShape(rpc, "operation_receive_po_with_do", [
      "p_po_id",
      "p_do_file_path",
      "p_do_number",
      "p_lines",
    ]);
  });

  it("returns 422 when receivedQty is negative", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...VALID_BODY,
          lines: [{ id: LINE_ID, receivedQty: -1 }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when line id is not a valid UUID", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...VALID_BODY,
          lines: [{ id: "not-a-uuid", receivedQty: 2 }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when doNumber is too short", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/receive`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/receive`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...VALID_BODY,
          lines: [{ id: LINE_ID, receivedQty: 99 }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("over_received");
  });

  it("returns 403 for non-operation (no rpc)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID_BODY),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  // --- R1 (0284): receiving is an inspection ---------------------------------

  it("R1 — forwards damaged + wrong-item qty as snake_case to the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { po_id: PO_ID, po_status: "open", damaged_qty: 1, wrong_item_qty: 2 },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...VALID_BODY,
          lines: [{ id: LINE_ID, receivedQty: 2, damagedQty: 1, wrongItemQty: 2 }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "operation_receive_po_with_do",
      expect.objectContaining({
        p_lines: [
          {
            id: LINE_ID,
            received_qty: 2,
            damaged_qty: 1,
            wrong_item_qty: 2,
            damaged_photos: [],
            wrong_item_claim_type: null,
            wrong_item_photos: [],
          },
        ],
      }),
    );
  });

  it("R1 — rejects a negative damagedQty", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...VALID_BODY,
          lines: [{ id: LINE_ID, receivedQty: 2, damagedQty: -1 }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  // --- R2 (0288): the problem becomes a supplier claim -----------------------

  it("R2 — forwards the claim's evidence (photos + kind) to the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { po_id: PO_ID, po_status: "open", claims_created: 2 },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...VALID_BODY,
          lines: [
            {
              id: LINE_ID,
              receivedQty: 2,
              damagedQty: 1,
              damagedPhotos: ["PO-1/a-claim-DO-1.jpg"],
              wrongItemQty: 1,
              wrongItemClaimType: "wrong_colour",
              wrongItemPhotos: ["PO-1/b-claim-DO-1.jpg"],
            },
          ],
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "operation_receive_po_with_do",
      expect.objectContaining({
        p_lines: [
          {
            id: LINE_ID,
            received_qty: 2,
            damaged_qty: 1,
            wrong_item_qty: 1,
            damaged_photos: ["PO-1/a-claim-DO-1.jpg"],
            wrong_item_claim_type: "wrong_colour",
            wrong_item_photos: ["PO-1/b-claim-DO-1.jpg"],
          },
        ],
      }),
    );
  });

  it("R2 — surfaces the RPC's evidence refusal as a 422 the operator can read", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "damaged units on MS01-K need at least one photo",
        details: "claim_evidence_required",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...VALID_BODY,
          lines: [{ id: LINE_ID, receivedQty: 2, damagedQty: 1 }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("claim_evidence_required");
  });

  it("R2 — refuses an absurd number of photo paths before it reaches the DB", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...VALID_BODY,
          lines: [
            {
              id: LINE_ID,
              receivedQty: 2,
              damagedQty: 1,
              damagedPhotos: Array.from({ length: 13 }, (_, i) => `PO-1/${i}.jpg`),
            },
          ],
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("R1 — maps the RPC's report_exceeds_ordered refusal to a 422 code", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "reported 14 units on a line of 10",
        details: "report_exceeds_ordered",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/receive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...VALID_BODY,
          lines: [{ id: LINE_ID, receivedQty: 9, damagedQty: 5 }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("report_exceeds_ordered");
  });
});

describe("POST /api/operation/pos/:id/cancel", () => {
  const PO_ID = "PO-2030";

  it("returns 200 on success and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: PO_ID, status: "cancelled" }, error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Wrong supplier selected" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operation_cancel_po", {
      p_po_id: PO_ID,
      p_reason: "Wrong supplier selected",
    });
    assertRpcCallShape(rpc, "operation_cancel_po", ["p_po_id", "p_reason"]);
  });

  it("returns 422 when reason is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/cancel`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/cancel`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "test" }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-operation (no rpc)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/cancel`, {
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

describe("POST /api/operation/pos/:id/assign-pickup-partner", () => {
  const PO_ID = "PO-2030";
  const PARTNER_ID = "00000000-0000-0000-0000-000000000c01";
  const WAREHOUSE_ID = "00000000-0000-0000-0000-000000000d01";

  // v3-S4.4 — both partner AND outsource paths now hit the unified RPC
  // `operation_assign_partner_and_dispatch`. The 6-arg shape (p_po_id +
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operation_assign_partner_and_dispatch", {
      p_po_id: PO_ID,
      p_partner_id: PARTNER_ID,
      p_outsource_name: null,
      p_outsource_contact: null,
      p_outsource_zones: null,
      p_warehouse_override_id: null,
    });
    assertRpcCallShape(rpc, "operation_assign_partner_and_dispatch", RPC_KEYS);
  });

  it("partner path: warehouseId set → forwarded as p_warehouse_override_id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: PO_ID, sup_status: "pickup_assigned" }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID, warehouseId: WAREHOUSE_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operation_assign_partner_and_dispatch", {
      p_po_id: PO_ID,
      p_partner_id: PARTNER_ID,
      p_outsource_name: null,
      p_outsource_contact: null,
      p_outsource_zones: null,
      p_warehouse_override_id: WAREHOUSE_ID,
    });
    assertRpcCallShape(rpc, "operation_assign_partner_and_dispatch", RPC_KEYS);
  });

  it("returns 422 when partnerId is not uuid", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/assign-pickup-partner`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/assign-pickup-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for non-operation (no rpc)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/assign-pickup-partner`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/assign-pickup-partner`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/assign-pickup-partner`, {
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
    expect(rpc).toHaveBeenCalledWith("operation_assign_partner_and_dispatch", {
      p_po_id: PO_ID,
      p_partner_id: null,
      p_outsource_name: "Ah Beng Lorry",
      p_outsource_contact: "+60 12-345 6789",
      p_outsource_zones: "Klang Valley",
      p_warehouse_override_id: WAREHOUSE_ID,
    });
    assertRpcCallShape(rpc, "operation_assign_partner_and_dispatch", RPC_KEYS);
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/assign-pickup-partner`, {
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
    expect(rpc).toHaveBeenCalledWith("operation_assign_partner_and_dispatch", {
      p_po_id: PO_ID,
      p_partner_id: null,
      p_outsource_name: "Ah Beng Lorry",
      p_outsource_contact: "+60 12-345 6789",
      p_outsource_zones: null,
      p_warehouse_override_id: null,
    });
    assertRpcCallShape(rpc, "operation_assign_partner_and_dispatch", RPC_KEYS);
  });

  it("outsource path: PG error mapped to 422 via mapPgError", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", message: "wrong state", details: "wrong_sup_status" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/assign-pickup-partner`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/assign-pickup-partner`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/assign-pickup-partner`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/assign-pickup-partner`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/assign-pickup-partner`, {
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

describe("POST /api/operation/pos/:id/reassign-warehouse", () => {
  const PO_ID = "PO-2030";
  const NEW_WH = "00000000-0000-0000-0000-000000000d01";

  it("returns 200 on success and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: PO_ID, warehouse_id: NEW_WH, sup_status: "ready_for_pickup" }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/reassign-warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newWarehouseId: NEW_WH }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operation_reassign_po_warehouse", {
      p_po_id: PO_ID,
      p_new_warehouse_id: NEW_WH,
    });
    assertRpcCallShape(rpc, "operation_reassign_po_warehouse", ["p_po_id", "p_new_warehouse_id"]);
  });

  it("returns 422 when newWarehouseId is not uuid", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/reassign-warehouse`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/reassign-warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newWarehouseId: NEW_WH }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for non-operation (no rpc)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/reassign-warehouse`, {
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
// C5.3 / v3-S4.6 — GET /api/operation/pos/awaiting-stock-shortage (auto-fill feed)
// ---------------------------------------------------------------------------
// Mock matrix (4 tables touched by the dual-path route):
//   - order_supplier_threads (v3-S4.6 PRIMARY): rows where
//     operation_stage='in_production' AND po_id IS NULL identify
//     not-yet-procured slices. The mock returns ALL thread rows; the route
//     narrows in TS so tests can supply a mix of stages / po_id values.
//   - orders (v3-S4.6 LEGACY fallback): orders in in_production
//     that have NO thread row (pre-v3 / unsplit). The mock resolves on
//     .eq("operation_stage", "in_production") (T5 collapsed the
//     prior IN-list filter to a single-value .eq()).
//   - purchase_orders (v2-style coverage filter on legacy fallback): only
//     open POs gate orders. Received/cancelled don't count.
//   - order_lines + stock_balances: same as before.
describe("GET /api/operation/pos/awaiting-stock-shortage", () => {
  function mockShortageQueries(opts: {
    // v3-S4.6: thread rows. Each row tagged with operation_stage + po_id so
    // tests can verify primary-path filtering. Default: empty (no v3 split
    // has happened — tests fall back to the legacy path).
    threads?: {
      order_id: string;
      operation_stage: string;
      po_id: string | null;
    }[];
    awaitingOrders?: { id: string; so?: number | null; delivery_date?: string | null }[];
    // v3-S2.1: lines may optionally carry `order_id` so the mock can mirror
    // `.in("order_id", [...])` filtering — tests supply lines for ALL orders
    // and assert the route narrows the input set BEFORE this fetch. Lines
    // without order_id always pass through (preserves existing tests).
    orderLines?: { sku: string; qty: number; order_id?: string }[];
    stockBalances?: { sku: string; qty: number; reserved: number }[];
    pos?: { status: string; so: number | null; so_refs: number[] | null }[];
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
          // v3-S4.6: route calls .from('order_supplier_threads').select('order_id, operation_stage, po_id')
          // — no filters, the route does the narrowing in TS so a single fetch
          // serves both "primary path" and "has any thread" lookups. The mock
          // resolves at .select() (which is the awaitable thenable).
          chain.select = vi.fn(() => promise(opts.threads ?? []));
          break;
        case "orders": {
          // The orders chain has to be both thenable (when the route awaits
          // `.eq("operation_stage", ...)` directly) AND chainable (when the
          // route additionally calls `.in("so", [...])` for a `?dls=`-scoped
          // bundle request). Tracking `dlScope` lets the mock narrow the
          // resolved data the same way Postgres would, so tests can supply a
          // superset of awaitingOrders and assert so filtering pruned the
          // out-of-scope ones.
          let dlScope: number[] | null = null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ordersChain: any = {};
          ordersChain.select = vi.fn(() => ordersChain);
          ordersChain.eq = vi.fn(() => ordersChain);
          ordersChain.in = vi.fn((col: string, vals: unknown[]) => {
            if (col === "so") dlScope = vals as number[];
            return ordersChain;
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ordersChain.then = (onFulfilled: any, onRejected: any) => {
            let rows = opts.awaitingOrders ?? [];
            if (dlScope) {
              rows = rows.filter(
                (o) => o.so != null && dlScope!.includes(o.so),
              );
            }
            return Promise.resolve({ data: rows, error: null }).then(
              onFulfilled,
              onRejected,
            );
          };
          return ordersChain;
        }
        case "order_lines":
          // Resolves at .in('order_id', [...]). Mock applies the same filter
          // so tests can provide lines for ALL orders and verify the route
          // narrowed the order set first (per v3-S2.1).
          //
          // 2026-05-18 (Phase 3 per-SO PO refactor): the route now SELECTs
          // `order_id, sku, qty, attrs`. The mock used to strip `order_id`
          // from the response; preserve it now so the route can attribute
          // each line back to its source SO for the `bySo` breakdown.
          // `attrs` defaults to null when not supplied by the test fixture.
          chain.in = vi.fn((col: string, ids: string[]) => {
            let rows = opts.orderLines ?? [];
            if (col === "order_id") {
              rows = rows.filter((l) => l.order_id === undefined || ids.includes(l.order_id));
            }
            return promise(
              rows.map((l) => ({
                order_id: l.order_id ?? null,
                sku: l.sku,
                qty: l.qty,
                attrs: null,
              })),
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
            return promise(rows.map((p) => ({ so: p.so, so_refs: p.so_refs })));
          });
          break;
      }
      return chain;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: fromImpl } as any);
    return fromImpl;
  }

  it("returns 403 for non-operation role (no Supabase round-trip)", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns {shortage: []} when no in_production orders exist", async () => {
    mockShortageQueries({ awaitingOrders: [] });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { shortage: unknown[] };
    expect(body.shortage).toEqual([]);
  });

  it("returns aggregated shortage when avail < need (3 orders, 2 SKUs, 1 in shortage)", async () => {
    // Three in_production orders. Two SKUs hit. avail < need on MAT only.
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; attrs: Record<string, unknown> | null; need: number; available: number; shortage: number }[];
    };
    expect(body.shortage).toHaveLength(1);
    expect(body.shortage[0]).toEqual({
      sku: "mattress:cloud:King",
      attrs: null,
      need: 5,
      available: 3,
      shortage: 2,
      // No `?dls=...` and no `so` on awaitingOrders → bySo is [] on every
      // row regardless. Phase 3 (2026-05-18) per-source-SO breakdown.
      bySo: [],
    });
  });

  it("excludes SKUs where avail >= need (negative case)", async () => {
    mockShortageQueries({
      awaitingOrders: [{ id: "00000000-0000-0000-0000-000000000a01" }],
      orderLines: [{ sku: "sofa:nordic:3s", qty: 2 }],
      stockBalances: [{ sku: "sofa:nordic:3s", qty: 10, reserved: 5 }], // avail = 5
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; attrs: Record<string, unknown> | null; need: number; available: number; shortage: number }[];
    };
    expect(body.shortage).toHaveLength(1);
    expect(body.shortage[0]).toEqual({
      sku: "mattress:cloud:King",
      attrs: null,
      need: 8,
      available: 6,
      shortage: 2,
      bySo: [],
    });
  });

  // -------------------------------------------------------------------------
  // v3-S2.1 — exclude orders already covered by an open PO (Bug 7 partial fix)
  // -------------------------------------------------------------------------
  it("filters out in_production orders covered by open POs via so", async () => {
    // Two in_production orders. Order A (so=4001) is covered by an open PO
    // that targets so=4001 directly → its lines must NOT contribute to
    // shortage. Order B (so=4002) is uncovered → its lines DO contribute.
    // Lines for BOTH orders are supplied to the mock; the mock filters by
    // the order_id list the route passes to `.in()`, so if the route
    // failed to drop order A, order A's `mattress` line would surface.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    const ID_B = "00000000-0000-0000-0000-000000000a02";
    mockShortageQueries({
      awaitingOrders: [
        { id: ID_A, so: 4001 },
        { id: ID_B, so: 4002 },
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
        { status: "open", so: 4001, so_refs: null },
      ],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; attrs: Record<string, unknown> | null; need: number; available: number; shortage: number }[];
    };
    // Only order B's SKU surfaces — order A is covered by an open PO.
    expect(body.shortage).toEqual([
      { sku: "sofa:nordic:3s", attrs: null, need: 2, available: 0, shortage: 2, bySo: [] },
    ]);
  });

  it("filters out in_production orders covered by open POs via so_refs array", async () => {
    // Order A (so=4001) and Order B (so=4002) are both covered by ONE batch
    // PO with so=null and so_refs=[4001, 4002]. Order C (so=4003) is not.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    const ID_B = "00000000-0000-0000-0000-000000000a02";
    const ID_C = "00000000-0000-0000-0000-000000000a03";
    mockShortageQueries({
      awaitingOrders: [
        { id: ID_A, so: 4001 },
        { id: ID_B, so: 4002 },
        { id: ID_C, so: 4003 },
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
        { status: "open", so: null, so_refs: [4001, 4002] },
      ],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; attrs: Record<string, unknown> | null; need: number; available: number; shortage: number }[];
    };
    // Only order C's SKU surfaces — A and B are covered by the batch PO.
    expect(body.shortage).toEqual([
      { sku: "mattress:cloud:King", attrs: null, need: 3, available: 1, shortage: 2, bySo: [] },
    ]);
  });

  it("received POs do NOT exclude orders (only open POs count)", async () => {
    // Order A's PO is `received` — the PO is done, but the order is still
    // in in_production somehow (e.g. PO partially received and a new
    // shortage emerged). The route must NOT exclude this order on the
    // basis of the received PO. The mock applies the route's
    // `.eq("status", "open")` filter, so a received row returns []
    // from the purchase_orders fetch — the test passes only if the route
    // is asking for status='open' (any other filter returns the row and
    // the order would be excluded).
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    mockShortageQueries({
      awaitingOrders: [
        { id: ID_A, so: 4001 },
      ],
      orderLines: [
        { order_id: ID_A, sku: "sofa:nordic:3s", qty: 2 },
      ],
      stockBalances: [
        { sku: "sofa:nordic:3s", qty: 0, reserved: 0 },
      ],
      pos: [
        { status: "received", so: 4001, so_refs: null },
      ],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; attrs: Record<string, unknown> | null; need: number; available: number; shortage: number }[];
    };
    // Order A's SKU IS in shortage — received PO does not gate it.
    expect(body.shortage).toEqual([
      { sku: "sofa:nordic:3s", attrs: null, need: 2, available: 0, shortage: 2, bySo: [] },
    ]);
  });

  it("cancelled POs do NOT exclude orders (only open POs count)", async () => {
    // Same shape as the received case — a cancelled PO is a dead PO; the
    // order is back in play if it's still in in_production.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    mockShortageQueries({
      awaitingOrders: [
        { id: ID_A, so: 4001 },
      ],
      orderLines: [
        { order_id: ID_A, sku: "sofa:nordic:3s", qty: 2 },
      ],
      stockBalances: [
        { sku: "sofa:nordic:3s", qty: 0, reserved: 0 },
      ],
      pos: [
        { status: "cancelled", so: 4001, so_refs: null },
      ],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; attrs: Record<string, unknown> | null; need: number; available: number; shortage: number }[];
    };
    expect(body.shortage).toEqual([
      { sku: "sofa:nordic:3s", attrs: null, need: 2, available: 0, shortage: 2, bySo: [] },
    ]);
  });

  // -------------------------------------------------------------------------
  // v3-S4.6 — primary path: order_supplier_threads.po_id IS NULL
  //
  // After v3-S4 (migration 0033) every confirmed order is split into per-
  // (supplier, category) threads. A thread with operation_stage =
  // 'in_production' AND po_id IS NULL is the "not yet covered by
  // a PO" auto-fill target. The so/so_refs join from v3-S2.1 is now the
  // SECONDARY (legacy) path for orders that exist but have no thread rows
  // (pre-v3 data, or confirm_proceed_request_v3 not yet called).
  // -------------------------------------------------------------------------
  it("v3 primary: thread with po_id NULL contributes its order's lines to shortage", async () => {
    // Order A has been split into a thread at in_production with
    // po_id NULL → its lines must surface. The order itself does NOT need to
    // be in `awaitingOrders` because the primary path keys off threads, not
    // the orders.operation_stage column.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    mockShortageQueries({
      threads: [
        { order_id: ID_A, operation_stage: "in_production", po_id: null },
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; attrs: Record<string, unknown> | null; need: number; available: number; shortage: number }[];
    };
    expect(body.shortage).toEqual([
      { sku: "mattress:cloud:King", attrs: null, need: 4, available: 1, shortage: 3, bySo: [] },
    ]);
  });

  it("v3 primary: thread with po_id NOT NULL is excluded (already covered)", async () => {
    // Order A has a thread already pointing at PO-2050. It must NOT surface in
    // the auto-fill list — even though operation_stage on the thread is still
    // 'in_production' (which can happen briefly between PO insert
    // and stage advance). The po_id IS NULL gate is the discriminator.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    mockShortageQueries({
      threads: [
        { order_id: ID_A, operation_stage: "in_production", po_id: "PO-2050" },
      ],
      awaitingOrders: [],
      orderLines: [
        { order_id: ID_A, sku: "mattress:cloud:King", qty: 4 },
      ],
      stockBalances: [{ sku: "mattress:cloud:King", qty: 0, reserved: 0 }],
      pos: [],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { shortage: unknown[] };
    expect(body.shortage).toEqual([]);
  });

  it("v3 primary: thread with operation_stage past in_production is excluded", async () => {
    // Even with po_id NULL, a thread that has moved past in_production
    // is no longer a procurement target — the stage filter narrows to that
    // exact value. (po_id NULL + stage='dispatched' wouldn't normally happen
    // — the schema can't easily express it — but we test the stage filter is
    // applied so a future enum addition doesn't accidentally widen the surface.)
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    mockShortageQueries({
      threads: [
        { order_id: ID_A, operation_stage: "ready_to_dispatch", po_id: null },
      ],
      awaitingOrders: [],
      orderLines: [
        { order_id: ID_A, sku: "mattress:cloud:King", qty: 4 },
      ],
      stockBalances: [{ sku: "mattress:cloud:King", qty: 0, reserved: 0 }],
      pos: [],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { shortage: unknown[] };
    expect(body.shortage).toEqual([]);
  });

  it("v3 legacy fallback: order in in_production with no thread + no covering open PO contributes lines", async () => {
    // Order A is pre-v3 / unsplit data: orders.operation_stage='in_production'
    // but no row exists in order_supplier_threads. The so/so_refs filter
    // against open POs runs as v2 did and leaves the order in play.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    mockShortageQueries({
      threads: [],
      awaitingOrders: [{ id: ID_A, so: 4001 }],
      orderLines: [
        { order_id: ID_A, sku: "sofa:nordic:3s", qty: 2 },
      ],
      stockBalances: [{ sku: "sofa:nordic:3s", qty: 0, reserved: 0 }],
      pos: [],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; attrs: Record<string, unknown> | null; need: number; available: number; shortage: number }[];
    };
    expect(body.shortage).toEqual([
      { sku: "sofa:nordic:3s", attrs: null, need: 2, available: 0, shortage: 2, bySo: [] },
    ]);
  });

  it("v3 legacy fallback: order WITH any thread is excluded from legacy path (split orders go through primary only)", async () => {
    // Order A has a thread (in dispatched stage, no po_id yet — unusual but
    // possible mid-pipeline). The fact that it has ANY thread means it has
    // been split, so the legacy path should NOT pick it up by orders.so.
    // The primary path won't pick it up either (stage != in_production).
    // Net: order A contributes nothing — it's mid-pipeline, not a procurement target.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    mockShortageQueries({
      threads: [
        { order_id: ID_A, operation_stage: "dispatched", po_id: null },
      ],
      awaitingOrders: [{ id: ID_A, so: 4001 }], // orders.operation_stage rolled up to in_production
      orderLines: [
        { order_id: ID_A, sku: "sofa:nordic:3s", qty: 2 },
      ],
      stockBalances: [{ sku: "sofa:nordic:3s", qty: 0, reserved: 0 }],
      pos: [],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
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
    // in_production + po_id NULL exists (primary), AND the orders
    // row is in in_production (legacy fallback would also pick it
    // up if not for the "has any thread" gate). Even if the gate were
    // bypassed, the route must dedupe order_ids before aggregating order_lines
    // — order A's lines should contribute exactly once to `need`.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    mockShortageQueries({
      threads: [
        { order_id: ID_A, operation_stage: "in_production", po_id: null },
      ],
      awaitingOrders: [{ id: ID_A, so: 4001 }],
      orderLines: [
        { order_id: ID_A, sku: "mattress:cloud:King", qty: 3 },
      ],
      stockBalances: [{ sku: "mattress:cloud:King", qty: 0, reserved: 0 }],
      pos: [],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; attrs: Record<string, unknown> | null; need: number; available: number; shortage: number }[];
    };
    // need = 3 (NOT 6 — no double count from the two paths).
    expect(body.shortage).toEqual([
      { sku: "mattress:cloud:King", attrs: null, need: 3, available: 0, shortage: 3, bySo: [] },
    ]);
  });

  it("v3 union: primary thread + separate legacy order both contribute to aggregated shortage", async () => {
    // Real-world v3 transition: order A has been split (thread, primary path
    // active), order B is pre-v3 legacy data (no thread, falls through to the
    // so/so_refs filter against open POs which matches nothing). Both should
    // surface and their lines aggregated by SKU.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    const ID_B = "00000000-0000-0000-0000-000000000a02";
    mockShortageQueries({
      threads: [
        { order_id: ID_A, operation_stage: "in_production", po_id: null },
      ],
      awaitingOrders: [{ id: ID_B, so: 4002 }],
      orderLines: [
        { order_id: ID_A, sku: "mattress:cloud:King", qty: 2 },
        { order_id: ID_B, sku: "mattress:cloud:King", qty: 3 },
      ],
      stockBalances: [{ sku: "mattress:cloud:King", qty: 1, reserved: 0 }],
      pos: [],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; attrs: Record<string, unknown> | null; need: number; available: number; shortage: number }[];
    };
    // need = 5 (2 from A primary + 3 from B legacy), available = 1, shortage = 4.
    expect(body.shortage).toEqual([
      { sku: "mattress:cloud:King", attrs: null, need: 5, available: 1, shortage: 4, bySo: [] },
    ]);
  });

  // -------------------------------------------------------------------------
  // ?dls= scoping — bundle PO from CrossOrderBundleSheet
  //
  // The CreatePOModal opens with `prefill.soRefs` set to the operator's
  // selected orders. The hook re-issues this request with `?dls=...`, and the
  // route must narrow shortage to exactly those orders (otherwise the
  // pre-fill leaks lines from unrelated awaiting orders, which is the bug
  // memory 1790 / 1793 documented).
  // -------------------------------------------------------------------------
  it("scopes shortage to ?dls= when present (legacy path narrows by so)", async () => {
    // Three awaiting orders. dls=[4001,4002] → only A and B should contribute.
    // C's lines must NOT surface.
    const ID_A = "00000000-0000-0000-0000-000000000a01";
    const ID_B = "00000000-0000-0000-0000-000000000a02";
    const ID_C = "00000000-0000-0000-0000-000000000a03";
    mockShortageQueries({
      awaitingOrders: [
        { id: ID_A, so: 4001 },
        { id: ID_B, so: 4002 },
        { id: ID_C, so: 9999 },
      ],
      orderLines: [
        { order_id: ID_A, sku: "mattress:cloud:King", qty: 3 },
        { order_id: ID_B, sku: "mattress:cloud:King", qty: 2 },
        { order_id: ID_C, sku: "sofa:nordic:3s", qty: 99 },
      ],
      stockBalances: [
        { sku: "mattress:cloud:King", qty: 0, reserved: 0 },
        { sku: "sofa:nordic:3s", qty: 0, reserved: 0 },
      ],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(
        "http://t/api/operation/pos/awaiting-stock-shortage?dls=4001,4002",
        { headers: { Authorization: `Bearer ${jwt}` } },
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; attrs: Record<string, unknown> | null; need: number; available: number; shortage: number }[];
    };
    // Only A + B's mattress line surfaces — sofa:nordic:3s (qty 99 from C) is
    // proof the so scope held: without it the sentinel would leak through.
    // Phase 3 (2026-05-18) — `bySo` populated when `?dls=` is set; each
    // source SO contributes its own slice, sorted by so ascending.
    expect(body.shortage).toEqual([
      {
        sku: "mattress:cloud:King",
        attrs: null,
        need: 5,
        available: 0,
        shortage: 5,
        bySo: [
          { so: 4001, need: 3, available: 0, shortage: 3 },
          { so: 4002, need: 2, available: 0, shortage: 2 },
        ],
      },
    ]);
  });

  it("intersects ?dls= with primary-path threads (out-of-scope thread doesn't leak)", async () => {
    // Threads carry no so, so when ?dls= is present the route must intersect
    // primaryOrderIds with the so-scoped orders set. Without that step, an
    // awaiting + po_id-null thread for an order outside the user's selection
    // would re-introduce its lines into the shortage feed.
    const ID_IN = "00000000-0000-0000-0000-000000000b01"; // so=5001 (in scope)
    const ID_OUT = "00000000-0000-0000-0000-000000000b02"; // so=5099 (NOT in scope)
    mockShortageQueries({
      threads: [
        { order_id: ID_IN, operation_stage: "in_production", po_id: null },
        { order_id: ID_OUT, operation_stage: "in_production", po_id: null },
      ],
      awaitingOrders: [
        { id: ID_IN, so: 5001 },
        { id: ID_OUT, so: 5099 },
      ],
      orderLines: [
        { order_id: ID_IN, sku: "mattress:cloud:King", qty: 4 },
        // Sentinel — must NOT surface. Different SKU so the assertion tells us
        // exactly whether the intersection held.
        { order_id: ID_OUT, sku: "sofa:nordic:3s", qty: 7 },
      ],
      stockBalances: [
        { sku: "mattress:cloud:King", qty: 0, reserved: 0 },
        { sku: "sofa:nordic:3s", qty: 0, reserved: 0 },
      ],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(
        "http://t/api/operation/pos/awaiting-stock-shortage?dls=5001",
        { headers: { Authorization: `Bearer ${jwt}` } },
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: { sku: string; attrs: Record<string, unknown> | null; need: number; available: number; shortage: number }[];
    };
    expect(body.shortage).toEqual([
      {
        sku: "mattress:cloud:King",
        attrs: null,
        need: 4,
        available: 0,
        shortage: 4,
        bySo: [{ so: 5001, need: 4, available: 0, shortage: 4 }],
      },
    ]);
  });

  // -------------------------------------------------------------------------
  // Phase 3 (2026-05-18) — per-source-SO breakdown on bundle (?dls=) calls
  //
  // FE feeds this breakdown into CreatePOModal's auto-split: fan out one PO
  // per source SO. The conservative stock-distribution algorithm (walk
  // sku → canonAttrs → so order, each entry consumes min(remaining, need))
  // means the first SO in canonical order absorbs available stock; later
  // SOs see whatever's left. Sum-across-bySo for (need, available, shortage)
  // must equal the row-level totals so legacy callers reading the aggregate
  // see consistent numbers.
  // -------------------------------------------------------------------------
  it("populates bySo with per-SO need/available/shortage when ?dls= is set (partial coverage)", async () => {
    // Two awaiting orders each need 3 Harbour Cotton Blend (same SKU+attrs).
    // Stock = 4. Walk in (sku, attrs, so) order: first SO (so=1007) absorbs
    // 3, second SO (so=1008) sees 1 remaining → shortage 2.
    // Row totals: need=6, available=4, shortage=2.
    const ID_A = "00000000-0000-0000-0000-000000000e01"; // so=1007
    const ID_B = "00000000-0000-0000-0000-000000000e02"; // so=1008
    mockShortageQueries({
      awaitingOrders: [
        { id: ID_A, so: 1007 },
        { id: ID_B, so: 1008 },
      ],
      orderLines: [
        { order_id: ID_A, sku: "sofa:harbour:3s", qty: 3 },
        { order_id: ID_B, sku: "sofa:harbour:3s", qty: 3 },
      ],
      stockBalances: [
        { sku: "sofa:harbour:3s", qty: 4, reserved: 0 },
      ],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(
        "http://t/api/operation/pos/awaiting-stock-shortage?dls=1007,1008",
        { headers: { Authorization: `Bearer ${jwt}` } },
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: {
        sku: string;
        attrs: Record<string, unknown> | null;
        need: number;
        available: number;
        shortage: number;
        bySo: { so: number; need: number; available: number; shortage: number }[];
      }[];
    };
    expect(body.shortage).toEqual([
      {
        sku: "sofa:harbour:3s",
        attrs: null,
        need: 6,
        available: 4,
        shortage: 2,
        bySo: [
          // so=1007 fully covered — kept anyway so FE knows which SOs
          // contributed to this row (brief: "knowing which SOs participated
          // helps with auditing/UI").
          { so: 1007, need: 3, available: 3, shortage: 0 },
          // so=1008 partially covered — this is the SO that needs a PO.
          { so: 1008, need: 3, available: 1, shortage: 2 },
        ],
      },
    ]);
    // Sum-across-bySo invariant — must equal row-level totals.
    const row = body.shortage[0]!;
    const sumNeed = row.bySo.reduce((s, e) => s + e.need, 0);
    const sumAvail = row.bySo.reduce((s, e) => s + e.available, 0);
    const sumShort = row.bySo.reduce((s, e) => s + e.shortage, 0);
    expect(sumNeed).toBe(row.need);
    expect(sumAvail).toBe(row.available);
    expect(sumShort).toBe(row.shortage);
  });

  it("returns per-order delivery dates when ?dls= is set (bundle scope)", async () => {
    // 2026-05-16 (Loo) — CreatePOModal bundle prefill needs each selected
    // order's delivery_date so operation can see WHY this bundle exists.
    // Global (no-dls) calls must still return orders: [] to avoid shipping
    // the full awaiting cohort over the wire.
    const ID_A = "00000000-0000-0000-0000-000000000c01"; // so=6001
    const ID_B = "00000000-0000-0000-0000-000000000c02"; // so=6002 (TBD)
    mockShortageQueries({
      awaitingOrders: [
        { id: ID_A, so: 6001, delivery_date: "2026-06-15" },
        { id: ID_B, so: 6002, delivery_date: null },
      ],
      orderLines: [
        { order_id: ID_A, sku: "mattress:cloud:King", qty: 1 },
        { order_id: ID_B, sku: "mattress:cloud:King", qty: 1 },
      ],
      stockBalances: [
        { sku: "mattress:cloud:King", qty: 0, reserved: 0 },
      ],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(
        "http://t/api/operation/pos/awaiting-stock-shortage?dls=6001,6002",
        { headers: { Authorization: `Bearer ${jwt}` } },
      ),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      shortage: unknown[];
      orders: { so: number; deliveryDate: string | null }[];
    };
    expect(body.orders).toEqual([
      { so: 6001, deliveryDate: "2026-06-15" },
      { so: 6002, deliveryDate: null },
    ]);
  });

  it("returns orders: [] for global (no-dls) shortage calls", async () => {
    mockShortageQueries({
      awaitingOrders: [
        { id: "00000000-0000-0000-0000-000000000d01", so: 7001, delivery_date: "2026-07-01" },
      ],
      orderLines: [
        { order_id: "00000000-0000-0000-0000-000000000d01", sku: "mattress:cloud:King", qty: 1 },
      ],
      stockBalances: [
        { sku: "mattress:cloud:King", qty: 0, reserved: 0 },
      ],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/awaiting-stock-shortage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orders: unknown[] };
    expect(body.orders).toEqual([]);
  });

  it("rejects ?dls= with non-integer values (422)", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(
        "http://t/api/operation/pos/awaiting-stock-shortage?dls=4001,abc",
        { headers: { Authorization: `Bearer ${jwt}` } },
      ),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("invalid_param");
    expect(body.message).toContain("abc");
    // Validation must short-circuit BEFORE any Supabase round-trip.
    expect(from).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C5.2 — POST /api/operation/pos/batch (batch-create with per-PO warehouse)
// ---------------------------------------------------------------------------
describe("POST /api/operation/pos/batch", () => {
  const SUPPLIER_A = "00000000-0000-0000-0000-000000000a01";
  const SUPPLIER_B = "00000000-0000-0000-0000-000000000a02";
  const WH_KLANG = "00000000-0000-0000-0000-000000000b01";
  const WH_PJ = "00000000-0000-0000-0000-000000000b02";

  // T25/T26 (migration 0055/0055b): every PO line now requires cost +
  // costSource on input — see POST /api/operation/pos block above for the
  // full rationale.
  const TWO_POS = {
    pos: [
      {
        supplierId: SUPPLIER_A,
        warehouseId: WH_KLANG,
        lines: [{ sku: "mattress:carres-cloud:King", qty: 2, cost: 1500, costSource: "hand_entered" as const }],
        // 0083 (Loo 2026-05-10) — etaDate now required on each PO entry.
        etaDate: "2026-06-01",
      },
      {
        supplierId: SUPPLIER_B,
        warehouseId: WH_PJ,
        lines: [{ sku: "sofa:oak:3-seater", qty: 1, cost: 2200, costSource: "prev_po" as const }],
        etaDate: "2026-06-15",
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/batch", {
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
    expect(rpc).toHaveBeenCalledWith("operation_create_pos_batch", {
      p_pos: [
        {
          supplier_id: SUPPLIER_A,
          warehouse_id: WH_KLANG,
          // 0079 (Loo 2026-05-10) — procurement-leg LP per PO. null for
          // own_logistics suppliers or when caller omits.
          procurement_partner_id: null,
          // T29: per-line `costSource` reshaped to snake_case `cost_source` at API edge.
          // 0073: attrs jsonb forwarded too (NULL for mattress + legacy callers).
          lines: [{ sku: "mattress:carres-cloud:King", qty: 2, cost: 1500, cost_source: "hand_entered", attrs: null }],
          // 0083 (Loo 2026-05-10) — etaDate now propagated from caller into
          // RPC's JSONB input, no longer hard-coded null.
          eta_date: "2026-06-01",
          so_refs: null,
          note: null,
          // 0308 — null on a customer-driven PO, per entry.
          reason_code: null,
          reason_note: null,
        },
        {
          supplier_id: SUPPLIER_B,
          warehouse_id: WH_PJ,
          procurement_partner_id: null,
          lines: [{ sku: "sofa:oak:3-seater", qty: 1, cost: 2200, cost_source: "prev_po", attrs: null }],
          eta_date: "2026-06-15",
          so_refs: null,
          note: null,
          reason_code: null,
          reason_note: null,
        },
      ],
    });
    assertRpcCallShape(rpc, "operation_create_pos_batch", ["p_pos"]);
  });

  it("atomicity: helper failure on one PO returns 422; the RPC's single-call shape guarantees no partial inserts", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "invalid sku/qty", details: "invalid_qty", hint: "pos_index=1" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/batch", {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/batch", {
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
    const jwt = await makeJwt("operation");
    const onePo = {
      supplierId: SUPPLIER_A,
      warehouseId: WH_KLANG,
      lines: [{ sku: "mattress:carres-cloud:King", qty: 1, cost: 1500, costSource: "hand_entered" as const }],
      etaDate: "2026-06-01",
    };
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/batch", {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/batch", {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/batch", {
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

  // v3-active.1 (migration 0037): operation_create_pos_batch now calls
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
          "Another operation user has already issued a PO for these threads. Refresh and try again.",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/batch", {
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
      new Request("http://t/api/operation/pos/batch", {
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
