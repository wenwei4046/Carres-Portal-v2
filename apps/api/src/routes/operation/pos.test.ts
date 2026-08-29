import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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
   * The list route makes FOUR reads, and the mock has to know which is which:
   * the POs themselves, P3's `po_supplier_promises` (0306) for the latest
   * answer per PO / per line, then the Register's two enrichments (Jess,
   * 2026-08-02): `orders` for the customer's date + name, and `product_skus`
   * for the MODEL name each line speaks instead of its code. A single shared
   * chain would let one read silently consume another's resolution.
   */
  function mockPosList(
    rows: typeof PO_ROW[],
    promises: Record<string, unknown>[] = [],
    orderRows: Record<string, unknown>[] = [],
    skuRows: Record<string, unknown>[] = [],
    lineage: {
      poLineSources?: Record<string, unknown>[];
      demands?: Record<string, unknown>[];
      requests?: Record<string, unknown>[];
      sends?: Record<string, unknown>[];
      referencedDestinations?: Record<string, unknown>[];
      onPoLineRange?: (phase: "start" | "end") => void;
    } = {},
  ) {
    const eq = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const range = vi.fn((from: number, to: number) => Promise.resolve({
      data: rows.slice(from, to + 1),
      error: null,
    }));
    const select = vi.fn(() => ({ eq, order, range }));

    // Every Register enrichment now owns both protections: a small `.in(…)`
    // batch and complete range pages. This chain mimics that PostgREST shape.
    const paged = (
      data: Record<string, unknown>[],
      onRange?: (phase: "start" | "end") => void,
    ) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};
      builder.order = vi.fn(() => builder);
      builder.range = vi.fn(async (from: number, to: number) => {
        onRange?.("start");
        if (onRange) await new Promise((resolve) => setTimeout(resolve, 0));
        const result = { data: data.slice(from, to + 1), error: null };
        onRange?.("end");
        return result;
      });
      return builder;
    };

    const promiseIn = vi.fn(() => paged(promises));
    const promiseSelect = vi.fn(() => ({ in: promiseIn }));

    const ordersIn = vi.fn(() => paged(orderRows));
    const ordersSelect = vi.fn(() => ({ in: ordersIn }));

    const skusIn = vi.fn(() => paged(skuRows));
    const skusSelect = vi.fn(() => ({ in: skusIn }));

    // 0311's destination registry rides the list so the per-line picker has
    // its options without a second call.
    // 0312: the sends read + the settings singleton (message template).
    const sendsPaged = paged(lineage.sends ?? []);
    const sendsIn = vi.fn(() => sendsPaged);
    const sendsSelect = vi.fn(() => ({ in: sendsIn }));

    const tmplSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const tmplEq = vi.fn(() => ({ maybeSingle: tmplSingle }));
    const tmplSelect = vi.fn(() => ({ eq: tmplEq }));

    const destOrder2 = vi.fn().mockResolvedValue({ data: [], error: null });
    const destOrder1 = vi.fn(() => ({ order: destOrder2 }));
    const destEq = vi.fn(() => ({ order: destOrder1 }));
    const destinationHistoryIn = vi.fn(() => paged(lineage.referencedDestinations ?? []));
    const destSelect = vi.fn(() => ({ eq: destEq, in: destinationHistoryIn }));

    // The Excel-row derivation reads the covered SOs' own lines (Jess,
    // 2026-08-02): one grid row per SO × SKU, carrying the salesperson's
    // remark. Empty here — the rows fall back to one per PO line.
    const solIn = vi.fn(() => paged([]));
    const solSelect = vi.fn(() => ({ in: solIn }));

    const lineRows = rows.flatMap((po) => po.purchase_order_lines.map((line) => ({
      ...line,
      po_id: po.id,
    })));
    const poLinesIn = vi.fn(() => paged(lineRows, lineage.onPoLineRange));
    const poLinesSelect = vi.fn(() => ({ in: poLinesIn }));

    const lineageIn = vi.fn(() => paged(lineage.poLineSources ?? []));
    const lineageSelect = vi.fn(() => ({ in: lineageIn }));
    const demandIn = vi.fn(() => paged(lineage.demands ?? []));
    const demandSelect = vi.fn(() => ({ in: demandIn }));
    const requestIn = vi.fn(() => paged(lineage.requests ?? []));
    const requestSelect = vi.fn(() => ({ in: requestIn }));

    vi.mocked(userClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "po_supplier_promises") return { select: promiseSelect };
        if (table === "orders") return { select: ordersSelect };
        if (table === "product_skus") return { select: skusSelect };
        if (table === "order_lines") return { select: solSelect };
        if (table === "purchase_order_lines") return { select: poLinesSelect };
        if (table === "po_line_sources") return { select: lineageSelect };
        if (table === "purchase_demands") return { select: demandSelect };
        if (table === "purchase_requests") return { select: requestSelect };
        if (table === "purchasing_destinations") return { select: destSelect };
        if (table === "po_sends") return { select: sendsSelect };
        if (table === "purchasing_settings") return { select: tmplSelect };
        return { select };
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return { eq, order, range, promiseIn, promiseSelect, ordersIn, skusIn, sendsRange: sendsPaged.range };
  }

  it("returns POs for operation with default 'all' status", async () => {
    const { order, range } = mockPosList([PO_ROW]);
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
    expect(range).toHaveBeenCalledWith(0, 999);
  });

  it("pages the complete PO register beyond the first PostgREST response", async () => {
    const rows = Array.from({ length: 1_001 }, (_, index) => ({
      ...PO_ROW,
      id: `PO-${String(index + 1).padStart(5, "0")}`,
      purchase_order_lines: [],
    }));
    const { range } = mockPosList(rows);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pos: Array<{ id: string }> };
    expect(body.pos).toHaveLength(1_001);
    expect(range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it("pages every send so current-version evidence cannot disappear at row 1001", async () => {
    const sends = Array.from({ length: 1_001 }, (_, index) => ({
      id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
      po_id: "PO-2030",
      channel: "whatsapp",
      note: null,
      sent_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      kind: index === 1_000 ? "confirmed_sent" : "external_open",
      recipient: index === 1_000 ? "Hooka Purchasing Group" : null,
      po_version: index === 1_000 ? 1 : null,
      sent_by: null,
      duty_user_id: null,
      acting_user_id: null,
      po_revisions: null,
    }));
    const { sendsRange } = mockPosList([PO_ROW], [], [], [], { sends });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pos: Array<{ sends: Array<{ kind: string }> }> };
    expect(body.pos[0]?.sends).toHaveLength(1_001);
    expect(body.pos[0]?.sends.some((send) => send.kind === "confirmed_sent")).toBe(true);
    expect(sendsRange).toHaveBeenNthCalledWith(1, 0, 999);
    expect(sendsRange).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it("uses bounded parallel batches for a large register enrichment", async () => {
    let active = 0;
    let maximum = 0;
    const rows = Array.from({ length: 81 }, (_, index) => ({
      ...PO_ROW,
      id: `PO-${String(index + 1).padStart(5, "0")}`,
    }));
    mockPosList(rows, [], [], [], {
      onPoLineRange: (phase) => {
        active += phase === "start" ? 1 : -1;
        maximum = Math.max(maximum, active);
      },
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(maximum).toBeGreaterThan(1);
    expect(maximum).toBeLessThanOrEqual(4);
  });

  it("returns governed SO and Manual Purchase lineage instead of guessing from display fields", async () => {
    const row = {
      ...PO_ROW,
      so: null,
      so_refs: null,
      purchase_order_lines: [
        { ...PO_ROW.purchase_order_lines[0], demand_id: "demand-1" },
      ],
    };
    mockPosList([row as unknown as typeof PO_ROW], [], [], [], {
      poLineSources: [
        {
          po_id: "PO-2030",
          po_line_id: "line-a",
          order_id: "order-1",
          order_line_id: "order-line-1",
          so: 4001,
          qty: 1,
        },
      ],
      demands: [{ id: "demand-1", request_id: "request-1", purpose: "showroom" }],
      requests: [{ id: "request-1", req_no: "PR-20260828-0042" }],
    });

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pos: Array<{
        sources: Array<{ kind: string; reference: string }>;
        purchase_order_lines: Array<{
          sources: Array<{ so: number; qty: number }>;
          governed_sources: Array<{ kind: string; reference: string; qty: number | null }>;
        }>;
      }>;
    };
    expect(body.pos[0]?.sources).toEqual([
      { kind: "sales_order", reference: "SO-4001" },
      { kind: "manual_purchase", reference: "PR-20260828-0042" },
    ]);
    expect(body.pos[0]?.purchase_order_lines[0]?.sources).toEqual([
      expect.objectContaining({ so: 4001, qty: 1 }),
    ]);
    expect(body.pos[0]?.purchase_order_lines[0]).toEqual(expect.objectContaining({
      governed_sources: [
        { kind: "sales_order", reference: "SO-4001", qty: 1 },
        { kind: "manual_purchase", reference: "PR-20260828-0042", qty: 1 },
      ],
    }));
    expect(
      body.pos[0]?.purchase_order_lines[0]?.governed_sources.reduce(
        (sum, source) => sum + (source.qty ?? 0),
        0,
      ),
    ).toBe(2);
  });

  it("returns a closed destination name when a historical PO still references it", async () => {
    const row = {
      ...PO_ROW,
      destination_id: "destination-closed",
      purchase_order_lines: [{
        ...PO_ROW.purchase_order_lines[0],
        destination_id: "destination-closed",
      }],
    };
    mockPosList([row as unknown as typeof PO_ROW], [], [], [], {
      referencedDestinations: [{
        id: "destination-closed",
        name: "Old Partner Warehouse",
        is_default: false,
      }],
    });
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      referencedDestinations: Array<{ id: string; name: string }>;
    };
    expect(body.referencedDestinations).toContainEqual({
      id: "destination-closed",
      name: "Old Partner Warehouse",
      is_default: false,
    });
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

  // ── Register (Jess, 2026-08-02) · the listing's enrichments ───────────────
  it("speaks MODEL per line, carries the customer + EARLIEST delivery, and flags a revised arrival", async () => {
    const twoSo: Record<string, unknown> = {
      ...PO_ROW,
      so: 4001,
      so_refs: [4002],
      purchase_order_lines: [
        { id: "line-a", sku: "MAT-K-001", qty: 2, received_qty: 0, short_since: null },
        { id: "line-b", sku: "UNKNOWN-SKU", qty: 1, received_qty: 0, short_since: null },
      ],
    };
    const { ordersIn, skusIn } = mockPosList(
      [twoSo as typeof PO_ROW],
      [
        // TWO different arrival dates answered about → (revised).
        { po_id: "PO-2030", po_line_id: null, kind: "tomorrow_delivery", about_date: "2026-09-15", recorded_at: "2026-09-02T00:00:00Z" },
        { po_id: "PO-2030", po_line_id: null, kind: "tomorrow_delivery", about_date: "2026-08-01", recorded_at: "2026-08-01T00:00:00Z" },
      ],
      [
        { so: 4001, delivery_date: "2026-09-20", customer_name: "Ah Hock" },
        { so: 4002, delivery_date: "2026-09-05", customer_name: "Mei Ling" },
      ],
      [{ sku: "MAT-K-001", variant: "King", product_models: { name: "Cody" } }],
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
        customer_delivery: string | null;
        eta_revised: boolean;
        orders: { so: number; customer_name: string }[];
        purchase_order_lines: { id: string; model_name: string | null; size: string | null }[];
      }[];
    };
    expect(ordersIn).toHaveBeenCalledWith("so", expect.arrayContaining([4001, 4002]));
    expect(skusIn).toHaveBeenCalledWith(
      "sku",
      expect.arrayContaining(["MAT-K-001", "UNKNOWN-SKU"]),
    );
    const po = body.pos[0]!;
    // EARLIEST across the merged PO's SOs — never the first, never the last.
    expect(po.customer_delivery).toBe("2026-09-05");
    expect(po.orders.map((o) => o.customer_name).sort()).toEqual(["Ah Hock", "Mei Ling"]);
    expect(po.eta_revised).toBe(true);
    const lineA = po.purchase_order_lines.find((l) => l.id === "line-a");
    const lineB = po.purchase_order_lines.find((l) => l.id === "line-b");
    expect(lineA?.model_name).toBe("Cody");
    expect(lineA?.size).toBe("King");
    // A SKU the catalog does not know stays honest: null, never an invention.
    expect(lineB?.model_name).toBeNull();
  });

  it("ONE answered arrival date is not (revised)", async () => {
    mockPosList(
      [PO_ROW],
      [{ po_id: "PO-2030", po_line_id: null, kind: "tomorrow_delivery", about_date: "2026-09-15", recorded_at: "2026-09-02T00:00:00Z" }],
    );
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    const body = (await res.json()) as { pos: { eta_revised: boolean }[] };
    expect(body.pos[0]?.eta_revised).toBe(false);
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

describe("GET /api/operation/pos/:id/audit", () => {
  it("returns complete revisions and history with real staff names", async () => {
    const tables: Record<string, Record<string, unknown>[]> = {
      po_revisions: [
        {
          id: "rev-1",
          rev_no: 1,
          reason: "Deliver To changed",
          created_by: "user-1",
          created_at: "2026-08-28T09:00:00Z",
          snapshot: { version: 1 },
        },
      ],
      po_history: [
        {
          id: "hist-1",
          text: "Purchase order revised to Version 2",
          by_role: "operation",
          by_user_id: "user-1",
          occurred_at: "2026-08-28T09:00:00Z",
        },
      ],
      app_users: [{ id: "user-1", name: "Yee Jean", email: "yj@carres.com" }],
    };
    vi.mocked(userClient).mockReturnValue({
      from: vi.fn((table: string) => {
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.in = vi.fn().mockResolvedValue({ data: tables[table] ?? [], error: null });
        chain.order = vi.fn().mockResolvedValue({ data: tables[table] ?? [], error: null });
        return chain;
      }),
    } as never);

    const res = await app.fetch(
      new Request("http://t/api/operation/pos/PO-2030/audit", {
        headers: { Authorization: `Bearer ${await makeJwt("operation")}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      revisions: Array<{ actor_name: string | null }>;
      history: Array<{ actor_name: string | null }>;
    };
    expect(body.revisions[0]?.actor_name).toBe("Yee Jean");
    expect(body.history[0]?.actor_name).toBe("Yee Jean");
  });
});

/**
 * ⭐ CARD 4B · SINGLE PO CREATION AUTHORITY (2026-08-11).
 *
 * `POST /api/operation/pos` and `POST /api/operation/pos/batch` were the
 * application's two Purchase Order creation doors. They called
 * `operation_create_po` and `operation_create_pos_batch` — two of the four extra
 * creation authorities the Card 4 audit found reachable from the browser.
 *
 * Their suites are replaced by their inverse. The assertion that matters is
 * **404, not 403**: a route that answers 403 still exists, and this card's whole
 * point is that no compatibility write door is left behind for a stale bundle or
 * a curl to find. Nothing may reach a `create` RPC from here — proven by the
 * mock client, which fails the test if any RPC is called at all.
 */
describe("the two legacy Purchase Order creation routes are RETIRED", () => {
  /** A client that turns any DB touch into a test failure. */
  function noDbClient() {
    const rpc = vi.fn(() => {
      throw new Error("a retired create route reached the database");
    });
    const from = vi.fn(() => {
      throw new Error("a retired create route reached a table");
    });
    vi.mocked(userClient).mockReturnValue({ rpc, from } as never);
    return { rpc, from };
  }

  const BODY = {
    supplierId: "00000000-0000-0000-0000-000000000a01",
    warehouseId: "00000000-0000-0000-0000-000000000b01",
    lines: [{ sku: "mattress:m1:k", qty: 2, cost: 100, costSource: "catalog" }],
    etaDate: "2026-09-01",
  };

  async function post(path: string, body: unknown, role = "operation") {
    return app.fetch(
      new Request(`http://t${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${await makeJwt(role)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      env,
    );
  }

  it("POST /api/operation/pos is gone — 404, not a 403 compatibility door", async () => {
    const { rpc, from } = noDbClient();
    const res = await post("/api/operation/pos", BODY);
    expect(res.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("POST /api/operation/pos/batch is gone — 404, not a 403 compatibility door", async () => {
    const { rpc, from } = noDbClient();
    const res = await post("/api/operation/pos/batch", { pos: [BODY] });
    expect(res.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("a principal cannot reach them either — the door is gone, not gated", async () => {
    noDbClient();
    expect((await post("/api/operation/pos", BODY, "principal")).status).toBe(404);
    expect((await post("/api/operation/pos/batch", { pos: [BODY] }, "principal")).status).toBe(404);
  });

  it("the surviving read door on the same prefix still answers", async () => {
    // Proof this is a targeted retirement and not a broken router: the GET that
    // shares the `/api/operation/pos` path still resolves.
    vi.mocked(userClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          in: vi.fn(() => Promise.resolve({ data: [], error: null })),
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    } as never);
    const res = await app.fetch(
      new Request("http://t/api/operation/pos", {
        headers: { authorization: `Bearer ${await makeJwt("operation")}` },
      }),
      env,
    );
    expect(res.status).not.toBe(404);
  });
});

describe("the Office has exactly ONE receiving door", () => {
  const LINE = "11111111-1111-4111-8111-111111111111";

  it("the legacy POST /:id/receive is gone — a caller meets 404, never a silent receive", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/PO-2050/receive", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          doNumber: "DO-1234",
          doFilePath: "x/y.pdf",
          lines: [{ id: LINE, receivedQty: 1 }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(404);
    // The point of the card: nothing moved on the way to that 404.
    expect(rpc).not.toHaveBeenCalled();
  });

  it("the surviving Office door goes through office_receive_post, never the bare receive engine", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { receipt_id: "r1", status: "posted", units_counted: 1 },
      error: null,
    });
    // The route also runs the post-receive auto-reserve, which reads tables.
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc, from } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/PO-2050/office-receive", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          doNumber: "DO-1234",
          doFilePath: "x/y.pdf",
          lines: [{ id: LINE, receivedNow: 1 }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc.mock.calls[0][0]).toBe("office_receive_post");
    // DATA INTEGRITY (Jess): the Office may never reach the receive engine
    // directly — that is the path that moves stock and opens no Session.
    expect(
      rpc.mock.calls.some((c: unknown[]) => c[0] === "operation_receive_po_with_do"),
    ).toBe(false);
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
//   - order_lines + stock_sku_availability (0366): same as before.
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
    stockBalances?: {
      sku: string;
      qty: number;
      reserved: number;
      /** 0366 — exact Units a Sales Order can BIND. Defaults to qty − reserved. */
      available?: number;
      /** 0368 — available + bulk pieces on the floor; what replenishment asks. */
      sellable?: number;
    }[];
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
        case "stock_sku_availability":
          // 0366 — the shortage feed reads the unit register's ONE availability
          // authority, not `stock_balances`. Fixtures still describe a site as
          // {qty, reserved} because that is what the scenarios are about; the
          // view's `available` is derived here exactly as the register derives
          // it, so a test that wants a controlled unit sets `available` itself.
          // No filter on this query — the .select() chain itself awaits.
          chain.select = vi.fn(() =>
            promise(
              (opts.stockBalances ?? []).map((b) => ({
                sku: b.sku,
                // 0368 — this feed decides what to BUY, so it reads `sellable`.
                sellable: b.sellable ?? b.available ?? b.qty - b.reserved,
              })),
            ),
          );
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
describe("POST /api/operation/pos/:id/ready-date", () => {
  const PO_ID = "PO-2032";

  it("records the supplier's ready date and calls the 0318 RPC by name", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { po_id: PO_ID, previous_date: null, new_date: "2026-09-10" },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/ready-date`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newDate: "2026-09-10" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("purchasing_record_ready_date", {
      p_po_id: PO_ID,
      p_new_date: "2026-09-10",
      p_reason: null,
      // Slice 1 (0325): the computed `ready + transit` arrival rides along;
      // null here because the mock supplies no transit number — P1: no
      // number, no guessed arrival, and the RPC then keeps the old date.
      p_new_eta: null,
    });
    // The RPC's signature is (text, date, text, date): a missing or extra key
    // is PGRST202 in production and a green test without this assertion.
    assertRpcCallShape(rpc, "purchasing_record_ready_date", [
      "p_po_id",
      "p_new_date",
      "p_reason",
      "p_new_eta",
    ]);
  });

  it("carries the reason when the operator gave one", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/ready-date`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newDate: "2026-09-10", reason: "Production Delay" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_reason: "Production Delay" });
  });

  it("refuses a date that is not a date, before any RPC runs", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/ready-date`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newDate: "10 Sep 2026" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a QUANTITY cannot be smuggled in — the schema is strict", async () => {
    // Q5's own MUST NOT: qty is not editable here, and the closest thing to a
    // door is a body key nobody validates. `.strict()` is what refuses it.
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/ready-date`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newDate: "2026-09-10", qty: 99 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the RPC's own po_not_open detail to a readable 422", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "PO PO-2032 is cancelled", details: "po_not_open" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/ready-date`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newDate: "2026-09-10" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "po_not_open" });
  });

  it("maps po_not_found to 404", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42P01", message: "PO not found", details: "po_not_found" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/ready-date`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newDate: "2026-09-10" }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for a dealer, and no RPC runs", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/ready-date`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newDate: "2026-09-10" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the operator's OWN client — never service_role", async () => {
    // The RPC's `purchasing_supplier_call_gate()` IS the boundary (Q5's MUST
    // NOT). A service key would walk around it, so the route may only ever
    // reach the database through `userClient`.
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/ready-date`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newDate: "2026-09-10" }),
      }),
      env,
    );
    expect(vi.mocked(userClient)).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("."),
    );
    const passedJwt = vi.mocked(userClient).mock.calls[0]?.[1];
    expect(passedJwt).toBe(jwt);
  });
});


/**
 * CONFIRMED OUTBOUND EVIDENCE (0377; CARD-2026-08-22-purchasing-02 §7.4).
 *
 * The whole point of this block: an app that OPENED is not a PDF that ARRIVED.
 */
describe("POST /api/operation/pos/:id/confirm-sent", () => {
  const PO_ID = "PO-2041";

  function mockRpc(result: unknown = { po_id: PO_ID, po_version: 2 }, error: unknown = null) {
    const rpc = vi.fn().mockResolvedValue({ data: result, error });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    return rpc;
  }

  async function post(body: unknown, role = "operation") {
    const jwt = await makeJwt(role);
    return app.fetch(
      new Request(`http://t/api/operation/pos/${PO_ID}/confirm-sent`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
  }

  it("records channel, recipient, version and note through the governed RPC", async () => {
    const rpc = mockRpc();
    const res = await post({
      channel: "whatsapp",
      recipient: "Hooka Purchasing Group",
      poVersion: 2,
      note: "Sent with the Unit list",
    });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("purchasing_confirm_po_sent", {
      p_po_id: PO_ID,
      p_expected_version: 2,
      p_channel: "whatsapp",
      p_recipient: "Hooka Purchasing Group",
      p_note: "Sent with the Unit list",
    });
  });

  /**
   * ⭐ 0378 — the caller DECLARES the version it rendered.
   *
   * 0377 had SQL read the newest version instead, reasoning that a caller able
   * to name one could lie. That was backwards: send Version 1, let another
   * session revise to Version 2, confirm — and Carres recorded Version 2 as
   * shared while the supplier held Version 1. Declaring is not trusting; SQL
   * locks, compares, refuses, and still stores only its own read.
   */
  it("a confirmation with NO version is refused", async () => {
    const rpc = mockRpc();
    const res = await post({ channel: "email", recipient: "buy@hooka.my" });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a version that is not a positive whole number is refused", async () => {
    const rpc = mockRpc();
    for (const bad of [0, -1, 1.5, "2", null]) {
      const res = await post({ channel: "email", recipient: "buy@hooka.my", poVersion: bad });
      expect(res.status, JSON.stringify(bad)).toBe(422);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("the declared version reaches SQL as the EXPECTED version, not as the stored one", async () => {
    const rpc = mockRpc();
    await post({ channel: "email", recipient: "buy@hooka.my", poVersion: 1 });
    const args = rpc.mock.calls[0]![1] as Record<string, unknown>;
    expect(args.p_expected_version).toBe(1);
    // There is no argument that could SET the stored version.
    expect(Object.keys(args)).not.toContain("p_version");
    expect(Object.keys(args)).not.toContain("p_po_version");
  });

  it("viewing Version 1 while the database holds Version 2 is refused, in two lines", async () => {
    mockRpc(null, {
      code: "P0001",
      message: "stale_po_version: saw 1, current is 2",
      details: "stale_po_version",
    });
    const res = await post({ channel: "whatsapp", recipient: "Hooka", poVersion: 1 });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string; message?: string; action?: string };
    expect(body.code).toBe("stale_po_version");
    // The approved fact/fix pair (`docs/purchasing/MASTER.md` §8.3).
    expect(body.message).toBe("Purchase order changed");
    expect(body.action).toBe("Open the latest PDF and send it again.");
  });

  it("a stale confirmation writes NOTHING — the refusal is the whole outcome", async () => {
    const rpc = mockRpc(null, {
      code: "P0001",
      message: "stale_po_version",
      details: "stale_po_version",
    });
    await post({ channel: "whatsapp", recipient: "Hooka", poVersion: 1 });
    // One call, and it raised. No second call could have written a row.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![0]).toBe("purchasing_confirm_po_sent");
  });

  it("declaring the version that IS current records it", async () => {
    const rpc = mockRpc({ po_id: PO_ID, po_version: 2 });
    const res = await post({ channel: "whatsapp", recipient: "Hooka", poVersion: 2 });
    expect(res.status).toBe(200);
    expect((rpc.mock.calls[0]![1] as Record<string, unknown>).p_expected_version).toBe(2);
    const body = (await res.json()) as { result?: { po_version?: number } };
    expect(body.result?.po_version).toBe(2);
  });

  it("refuses a blank recipient — `sent` must say to whom", async () => {
    const rpc = mockRpc();
    for (const recipient of ["", "   "]) {
      const res = await post({ channel: "whatsapp", recipient, poVersion: 1 });
      expect(res.status, JSON.stringify(recipient)).toBe(422);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a channel nobody governs", async () => {
    const rpc = mockRpc();
    const res = await post({ channel: "carrier pigeon", recipient: "Hooka", poVersion: 1 });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses an unknown field rather than silently dropping it", async () => {
    const rpc = mockRpc();
    const res = await post({
      channel: "whatsapp", recipient: "Hooka", poVersion: 1, sentAt: "2026-08-24",
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a caller who does not hold PO duty is refused by SQL, not by the screen", async () => {
    mockRpc(null, { code: "P0001", message: "not_po_duty", details: "not_po_duty" });
    const res = await post({ channel: "whatsapp", recipient: "Hooka", poVersion: 1 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("a dealer never reaches the door", async () => {
    const rpc = mockRpc();
    const res = await post({ channel: "whatsapp", recipient: "Hooka", poVersion: 1 }, "dealer");
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("opening an app records an OPEN, and completes nothing", () => {
  it("`/sends` still exists and still takes only channel and note", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/pos/PO-2041/sends", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "whatsapp" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("purchasing_record_send", {
      p_po_id: "PO-2041",
      p_channel: "whatsapp",
      p_note: null,
    });
    // It carries NO recipient — an open cannot name who received anything.
    const args = rpc.mock.calls[0]![1] as Record<string, unknown>;
    expect(args).not.toHaveProperty("p_recipient");
  });

  it("the two doors are DIFFERENT functions — an open can never mint evidence", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "pos.ts"), "utf8");
    expect(src).toContain("purchasing_record_send");
    expect(src).toContain("purchasing_confirm_po_sent");
    // The open door does not touch the evidence function, and vice versa.
    const openBlock = src.slice(src.indexOf('post("/:id/sends"'), src.indexOf('post("/:id/confirm-sent"'));
    expect(openBlock).not.toContain("purchasing_confirm_po_sent");
  });
});
