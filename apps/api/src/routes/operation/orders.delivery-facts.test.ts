/**
 * GET /api/operation/orders — the two DELIVERY facts the list now carries.
 * Owner ruling 2026-09-10 · `docs/delivery/MASTER.md` §8.
 *
 * The Delivery work list must answer two questions about every row — *when do
 * the goods reach us?* and *are they already in?* — and both answers are
 * RECORDED somewhere else. What this route adds is the READ, batched once for
 * the whole page, and nothing more:
 *
 *  1. `po_arrivals` — per purchase order serving the order: its status, the
 *     SKUs it still OWES, OUR production-plus-transit prediction (`eta_date`),
 *     the immutable supplier-facing original (`official_delivery_date`) and the
 *     latest recorded supplier reply. No classification, no derived word.
 *  2. `allocated_units` — the register rows reserved or sold to the order, so
 *     the shared `deliveryStockReadinessOf` can count the exact shortage.
 *
 * The properties held here are the ones a browser cannot check: that the reads
 * are BATCHED (never one per order), that the LATEST promise wins, that a
 * fully-received line leaves `owedSkus`, and that nothing is invented when a
 * table answers nothing.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
}));

import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};
const KID = "test-kid-1";
let signKey: KeyLike;
let publicJwk: JWK;

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

const ORDER = {
  id: "00000000-0000-0000-0000-000000000a01",
  so: 4001,
  status: "proceed_order",
  operation_stage: "in_production",
  customer_name: "Tan Ah Kow",
  placed_at: "2026-05-03T10:00:00Z",
  delivery_date: "2026-05-10",
  delivery_partner_id: null,
  do_number: null,
  dealer_id: "00000000-0000-0000-0000-000000000d01",
  dealers: { name: "BedHouse KL" },
};

interface Tables {
  orders?: Record<string, unknown>[];
  pos?: Record<string, unknown>[];
  poLines?: Record<string, unknown>[];
  promises?: Record<string, unknown>[];
  reserved?: Record<string, unknown>[];
  sold?: Record<string, unknown>[];
  incoming?: Record<string, unknown>[];
  sources?: Record<string, unknown>[];
  truncatedOwners?: boolean;
}

/** Every table the list read touches, each answering with its own rows. */
function mockTables(t: Tables) {
  const from = vi.fn((table: string) => {
    if (table === "po_line_sources") {
      return { select: vi.fn(() => ({ in: vi.fn((column: string, values: string[]) => {
        const data = (t.sources ?? []).filter(row => values.includes(String(row[column])));
        return Promise.resolve({ data, count: data.length + (column === "po_line_id" && t.truncatedOwners ? 1 : 0), error: null });
      }) })) };
    }
    if (table === "purchase_orders") {
      const or = vi.fn().mockResolvedValue({ data: t.pos ?? [], error: null });
      return { select: vi.fn(() => ({ or })) };
    }
    if (table === "purchase_order_lines") {
      const inFn = vi.fn().mockResolvedValue({ data: t.poLines ?? [], error: null });
      return { select: vi.fn(() => ({ in: inFn })) };
    }
    if (table === "po_supplier_promises") {
      const order = vi.fn().mockResolvedValue({ data: t.promises ?? [], error: null });
      const inFn = vi.fn(() => ({ order }));
      const eq = vi.fn(() => ({ in: inFn }));
      return { select: vi.fn(() => ({ eq })) };
    }
    if (table === "ops_stock_items") {
      /* ONE table, two reads — reserved by `reserved_ref`, sold by
         `sold_order_id`. The mock answers each by the status it was asked for,
         exactly as the register would. */
      const query = () => {
        let status = "";
        const chain = {
          eq: vi.fn((column: string, value: string) => { if (column === "status") status = value; return chain; }),
          in: vi.fn((_column: string, values: string[]) => {
            const data = status === "incoming" ? (t.incoming ?? []).filter(row => values.includes(String(row.po_line_id)))
              : (status === "reserved" ? t.reserved : t.sold) ?? [];
            return Promise.resolve({ data, count: data.length, error: null });
          }),
        };
        return chain;
      };
      return { select: vi.fn(query) };
    }
    const chain: Record<string, unknown> = {};
    for (const k of ["in", "eq", "ilike", "or", "not", "is", "order"]) chain[k] = vi.fn(() => chain);
    chain.limit = vi.fn().mockResolvedValue({ data: t.orders ?? [ORDER], error: null });
    return { select: vi.fn(() => chain) };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue({ from } as any);
  return from;
}

interface ArrivalWire {
  poId: string;
  status: string | null;
  owedSkus: string[];
  plannedIso: string | null;
  originalIso: string | null;
  reply: { answer: string; aboutIso: string | null; newIso: string | null } | null;
}

async function get() {
  const jwt = await new SignJWT({
    email: "operation@carres.com",
    app_metadata: { role: "operation" },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
  const res = await app.fetch(
    new Request("http://t/api/operation/orders", {
      headers: { Authorization: `Bearer ${jwt}` },
    }),
    env,
  );
  expect(res.status).toBe(200);
  return (await res.json()) as {
    orders: {
      so: number;
      po_arrivals: ArrivalWire[];
      allocated_units: { sku: string; status: string; qty: number }[];
      incoming_units: { unitCode: string; orderLineId: string; qty: number }[];
    }[];
  };
}

describe("incoming line evidence", () => {
  it.each([false, true])("returns incoming Units only when every source names the same line (shared=%s)", async shared => {
    const from = mockTables({
      orders: [{ ...ORDER, order_lines: [{ id: "line-a", sku: "MAT-1", qty: 1 }] }],
      pos: [{ id: "PO-1", so: 4001, status: "open" }],
      poLines: [{ po_id: "PO-1", sku: "MAT-1", qty: 1, received_qty: 0 }],
      sources: [{ po_id: "PO-1", po_line_id: "pl-1", order_id: ORDER.id, order_line_id: "line-a" },
        ...(shared ? [{ po_id: "PO-1", po_line_id: "pl-1", order_id: "another", order_line_id: "line-b" }] : [])],
      incoming: [{ unit_code: "U1", po_line_id: "pl-1", qty: 1 }],
    });
    expect((await get()).orders[0]!.incoming_units).toEqual(shared ? [] : [{ unitCode: "U1", orderLineId: "line-a", qty: 1 }]);
    expect(from.mock.calls.filter(call => call[0] === "po_line_sources")).toHaveLength(2);
  });
  it("does not use incoming rows from a cancelled PO", async () => {
    mockTables({ pos: [{ id: "PO-1", so: 4001, status: "cancelled" }],
      sources: [{ po_id: "PO-1", po_line_id: "pl-1", order_id: ORDER.id, order_line_id: "line-a" }],
      incoming: [{ unit_code: "U1", po_line_id: "pl-1", qty: 1 }],
    });
    expect((await get()).orders[0]!.incoming_units).toEqual([]);
  });
  it("does not call a truncated source read exclusive", async () => {
    mockTables({
      orders: [{ ...ORDER, order_lines: [{ id: "line-a", sku: "MAT-1", qty: 1 }] }],
      pos: [{ id: "PO-1", so: 4001, status: "open" }],
      sources: [{ po_id: "PO-1", po_line_id: "pl-1", order_id: ORDER.id, order_line_id: "line-a" }],
      incoming: [{ unit_code: "U1", po_line_id: "pl-1", qty: 1 }], truncatedOwners: true,
    });
    expect((await get()).orders[0]!.incoming_units).toEqual([]);
  });
});

describe("po_arrivals — recorded purchase-order dates, never a derived word", () => {
  it("carries the status, OUR prediction and the immutable original", async () => {
    mockTables({
      pos: [
        {
          id: "PO-2049",
          so: null,
          so_refs: [4001],
          status: "open",
          eta_date: "2026-05-08",
          official_delivery_date: "2026-05-06",
        },
      ],
      poLines: [{ po_id: "PO-2049", sku: "MAT-1", qty: 2, received_qty: 0 }],
    });
    const arrival = (await get()).orders[0]!.po_arrivals[0]!;
    expect(arrival).toMatchObject({
      poId: "PO-2049",
      status: "open",
      plannedIso: "2026-05-08",
      originalIso: "2026-05-06",
      owedSkus: ["MAT-1"],
      reply: null,
    });
  });

  it("a line the supplier has fully delivered leaves `owedSkus`", async () => {
    mockTables({
      pos: [{ id: "PO-1", so: 4001, so_refs: null, status: "open", eta_date: "2026-05-08" }],
      poLines: [
        { po_id: "PO-1", sku: "IN-FULL", qty: 2, received_qty: 2 },
        { po_id: "PO-1", sku: "STILL-OWED", qty: 2, received_qty: 1 },
      ],
    });
    expect((await get()).orders[0]!.po_arrivals[0]!.owedSkus).toEqual(["STILL-OWED"]);
  });

  it("the LATEST supplier reply wins — the ledger is append-only", async () => {
    mockTables({
      pos: [{ id: "PO-1", so: 4001, so_refs: null, status: "open", official_delivery_date: "2026-05-06" }],
      poLines: [{ po_id: "PO-1", sku: "MAT-1", qty: 1, received_qty: 0 }],
      /* The route reads newest first and takes the first row per document. */
      promises: [
        {
          po_id: "PO-1",
          answer: "delayed",
          about_date: "2026-05-06",
          previous_date: "2026-05-06",
          new_date: "2026-05-20",
          recorded_at: "2026-05-04T00:00:00Z",
        },
        {
          po_id: "PO-1",
          answer: "confirmed",
          about_date: "2026-05-06",
          previous_date: null,
          new_date: "2026-05-06",
          recorded_at: "2026-05-01T00:00:00Z",
        },
      ],
    });
    expect((await get()).orders[0]!.po_arrivals[0]!.reply).toMatchObject({
      answer: "delayed",
      newIso: "2026-05-20",
    });
  });

  it("no reply on file is `null` — never a confirmation nobody gave", async () => {
    mockTables({
      pos: [{ id: "PO-1", so: 4001, so_refs: null, status: "open", official_delivery_date: "2026-05-06" }],
      poLines: [{ po_id: "PO-1", sku: "MAT-1", qty: 1, received_qty: 0 }],
      promises: [],
    });
    expect((await get()).orders[0]!.po_arrivals[0]!.reply).toBeNull();
  });

  it("an order NO purchase order names gets an empty list", async () => {
    mockTables({
      orders: [
        { ...ORDER, id: "a", so: 4001 },
        { ...ORDER, id: "b", so: 9999 },
      ],
      pos: [{ id: "PO-1", so: null, so_refs: [4001], status: "open", eta_date: "2026-05-08" }],
      poLines: [{ po_id: "PO-1", sku: "MAT-1", qty: 1, received_qty: 0 }],
    });
    const body = await get();
    expect(body.orders[0]!.po_arrivals).toHaveLength(1);
    expect(body.orders[1]!.po_arrivals).toEqual([]);
  });

  it("ONE consolidated purchase order reaches every sales order it names", async () => {
    mockTables({
      orders: [
        { ...ORDER, id: "a", so: 4001 },
        { ...ORDER, id: "b", so: 4002 },
      ],
      pos: [{ id: "PO-9", so: null, so_refs: [4001, 4002], status: "open", eta_date: "2026-05-08" }],
      poLines: [{ po_id: "PO-9", sku: "MAT-1", qty: 1, received_qty: 0 }],
    });
    const body = await get();
    expect(body.orders[0]!.po_arrivals[0]!.poId).toBe("PO-9");
    expect(body.orders[1]!.po_arrivals[0]!.poId).toBe("PO-9");
  });
});

describe("allocated_units — what the register physically holds", () => {
  it("reserved rows reach the order that reserved them", async () => {
    mockTables({
      reserved: [
        { sku: "MAT-1", qty: 1, reserved_ref: "SO-4001" },
        { sku: "OTHER", qty: 1, reserved_ref: "SO-9999" },
      ],
    });
    expect((await get()).orders[0]!.allocated_units).toEqual([
      { sku: "MAT-1", status: "reserved", qty: 1, orderLineId: null },
    ]);
  });

  it("sold rows reach the order they were sold to, by its id", async () => {
    mockTables({ sold: [{ sku: "MAT-1", qty: 2, sold_order_id: ORDER.id }] });
    expect((await get()).orders[0]!.allocated_units).toEqual([
      { sku: "MAT-1", status: "sold", qty: 2, orderLineId: null },
    ]);
  });

  it("a bulk register row carries its OWN quantity (0218), never 1", async () => {
    mockTables({ reserved: [{ sku: "MAT-1", qty: 5, reserved_ref: "SO-4001" }] });
    expect((await get()).orders[0]!.allocated_units[0]!.qty).toBe(5);
  });

  it("a row with no recorded quantity counts as one unit", async () => {
    mockTables({ reserved: [{ sku: "MAT-1", qty: null, reserved_ref: "SO-4001" }] });
    expect((await get()).orders[0]!.allocated_units[0]!.qty).toBe(1);
  });

  it("nothing allocated is an EMPTY list, never a missing field", async () => {
    mockTables({});
    expect((await get()).orders[0]!.allocated_units).toEqual([]);
  });

  it("both reads are BATCHED for the whole page — never one per order", async () => {
    const from = mockTables({
      orders: [
        { ...ORDER, id: "a", so: 4001 },
        { ...ORDER, id: "b", so: 4002 },
        { ...ORDER, id: "c", so: 4003 },
      ],
      reserved: [{ sku: "MAT-1", qty: 1, reserved_ref: "SO-4002" }],
    });
    const body = await get();
    /* Three orders, exactly two register reads — one for reserved, one for
       sold — and the units land on the order that owns them. */
    expect(from.mock.calls.filter((c) => c[0] === "ops_stock_items")).toHaveLength(2);
    expect(body.orders[1]!.allocated_units).toHaveLength(1);
    expect(body.orders[0]!.allocated_units).toEqual([]);
  });
});
