import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";
import type { ReadyStockResponse } from "@carres/shared";

/**
 * SO BATCH PURCHASE · READY STOCK — the route's own contract.
 *
 * The rules live in SQL and are proved against a real Postgres in
 * `test/ready-stock-reservation.test.ts`; the operator's half is proved in
 * `ReadyStockPanel.test.tsx`. What is proved HERE is the projection between
 * them: which Units are offered against which item lines, what each line still
 * needs, and that a counted row reaches the screen labelled rather than hidden.
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

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  signKey = privateKey;
  publicJwk = { ...(await exportJWK(publicKey)), kid: KID, alg: "ES256", use: "sig" };
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
});

const ORDER = "4328cf35-6c90-43fc-b05d-56b6d1aba602";
const LINE_A = "1bdd69d7-60b0-4ea3-b443-51a08526cba8";
const LINE_B = "e6b3f308-31d6-410c-aa3c-df2f8147ac7e";
const LINE_KING = "a2ef3bf6-e884-4b13-b65c-0efcd9c698c3";
const QUEEN = "1013Jager/Fab3-Queen/PC151-01";

/** One Sales Order carrying two item lines of one SKU — the live SO-1251 shape. */
function fixture(over: Record<string, { data: unknown; error: unknown }> = {}) {
  return {
    orders: { data: [{ id: ORDER, so: 1251 }], error: null },
    order_lines: {
      data: [
        { id: LINE_A, sku: QUEEN, qty: 1, attrs: { modelName: "Jager bedframe" } },
        { id: LINE_B, sku: QUEEN, qty: 1, attrs: null },
        { id: LINE_KING, sku: "1013Jager/Fab3-King/PC151-01", qty: 1, attrs: null },
      ],
      error: null,
    },
    ops_stock_items: { data: [], error: null },
    po_line_sources: { data: [], error: null },
    warehouses: { data: [{ id: "wh-1", name: "Carres Klang Warehouse", kind: "own" }], error: null },
    stock_unit_register_v: {
      data: [
        {
          id: "unit-queen-1", unit_code: "U1-000-001", sku: QUEEN, qty: 1,
          date_in: "2026-08-01", condition: "exhibition", site_name: "Carres Klang Warehouse",
          holder_name: null, ownership: "carres_owned", supplier: null,
          identity_scope: "unit", warehouse_id: "wh-1",
        },
        {
          id: "unit-bulk", unit_code: "QTY-000000001", sku: QUEEN, qty: 893,
          date_in: "2026-08-05", condition: "new", site_name: "Carres Klang Warehouse",
          holder_name: null, ownership: "carres_owned", supplier: null,
          identity_scope: "quantity", warehouse_id: "wh-1",
        },
        {
          id: "unit-consign", unit_code: "U1-000-065", sku: QUEEN, qty: 1,
          date_in: "2026-08-06", condition: "new", site_name: "Ohana",
          holder_name: null, ownership: "supplier_consignment", supplier: "Dorsettloft",
          identity_scope: "unit", warehouse_id: "wh-2",
        },
      ],
      error: null,
    },
    ...over,
  };
}

/** A chainable Supabase mock that honours only the filters this route applies. */
function client(tables: Record<string, { data: unknown; error: unknown }>) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const from = vi.fn((table: string) => {
    const result = tables[table] ?? { data: [], error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {};
    for (const m of ["select", "eq", "in", "neq", "not", "is", "order", "limit"]) {
      b[m] = vi.fn(() => b);
    }
    b.maybeSingle = vi.fn().mockResolvedValue({
      data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
      error: result.error,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
    return b;
  });
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return { data: { reserved: 1, reference: "SO-1251", units: [] }, error: null };
  });
  return { from, rpc, rpcCalls };
}

async function read(tables = fixture()) {
  const c = client(tables);
  vi.mocked(userClient).mockReturnValue(c as never);
  const jwt = await makeJwt("operation");
  const res = await app.fetch(
    new Request(`http://t/api/operation/purchase/demands/${ORDER}/ready-stock`, {
      headers: { Authorization: `Bearer ${jwt}` },
    }),
    env,
  );
  return { res, body: (await res.json()) as ReadyStockResponse, c };
}

beforeEach(() => vi.mocked(userClient).mockReset());

describe("GET …/:orderId/ready-stock", () => {
  it("offers a Unit against EVERY item line whose goods it matches", async () => {
    const { res, body } = await read();
    expect(res.status).toBe(200);
    expect(body.reference).toBe("SO-1251");
    const queen = body.units.find((u) => u.itemId === "unit-queen-1")!;
    /* Two lines of one SKU both still need goods, so the operator must choose. */
    expect(queen.matchingLineIds).toEqual([LINE_A, LINE_B]);
    expect(queen.blocked).toBeNull();
  });

  it("never offers a Unit against a line of different goods", async () => {
    const { body } = await read();
    for (const u of body.units) expect(u.matchingLineIds).not.toContain(LINE_KING);
  });

  it("labels counted stock and refuses to call its key a Unit ID", async () => {
    const { body } = await read();
    const bulk = body.units.find((u) => u.itemId === "unit-bulk")!;
    expect(bulk.identityScope).toBe("quantity");
    expect(bulk.blocked).toBe("counted_stock");
    expect(bulk.qty).toBe(893);
  });

  it("carries ownership and site rather than assuming them", async () => {
    const { body } = await read();
    const consign = body.units.find((u) => u.itemId === "unit-consign")!;
    expect(consign.ownership).toBe("supplier_consignment");
    expect(consign.supplier).toBe("Dorsettloft");
    /* A second site is offered, not filtered away. */
    expect(consign.siteName).toBe("Ohana");
  });

  it("states the ORIGINAL demand beside what already answers it", async () => {
    const { body } = await read(
      fixture({
        ops_stock_items: {
          data: [{ unit_code: "U1-000-009", qty: 1, reserved_order_line_id: LINE_A }],
          error: null,
        },
        po_line_sources: { data: [{ order_line_id: LINE_B, qty: 1 }], error: null },
      }),
    );
    const a = body.lines.find((l) => l.orderLineId === LINE_A)!;
    expect(a.qty).toBe(1);
    expect(a.reservedQty).toBe(1);
    expect(a.reservedUnitCodes).toEqual(["U1-000-009"]);
    expect(a.remainingQty).toBe(0);
    const b = body.lines.find((l) => l.orderLineId === LINE_B)!;
    expect(b.onPoQty).toBe(1);
    expect(b.remainingQty).toBe(0);
  });

  it("says a Unit is not choosable once every matching line is covered", async () => {
    const { body } = await read(
      fixture({
        ops_stock_items: {
          data: [
            { unit_code: "U1-000-009", qty: 1, reserved_order_line_id: LINE_A },
            { unit_code: "U1-000-010", qty: 1, reserved_order_line_id: LINE_B },
          ],
          error: null,
        },
      }),
    );
    const queen = body.units.find((u) => u.itemId === "unit-queen-1")!;
    expect(queen.matchingLineIds).toEqual([]);
    expect(queen.blocked).toBe("no_line_needs_it");
  });

  it("names the item line by its model words, falling back to the SKU", async () => {
    const { body } = await read();
    expect(body.lines.find((l) => l.orderLineId === LINE_A)!.item).toBe("Jager bedframe");
    expect(body.lines.find((l) => l.orderLineId === LINE_B)!.item).toBe(QUEEN);
  });

  it("is an operation surface", async () => {
    const c = client(fixture());
    vi.mocked(userClient).mockReturnValue(c as never);
    const res = await app.fetch(
      new Request(`http://t/api/operation/purchase/demands/${ORDER}/ready-stock`, {
        headers: { Authorization: `Bearer ${await makeJwt("dealer")}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("answers 404 for an order that is not there", async () => {
    const { res } = await read(fixture({ orders: { data: [], error: null } }));
    expect(res.status).toBe(404);
  });
});

describe("POST …/ready-stock/reserve", () => {
  async function reserve(body: unknown, tables = fixture()) {
    const c = client(tables);
    vi.mocked(userClient).mockReturnValue(c as never);
    const res = await app.fetch(
      new Request("http://t/api/operation/purchase/demands/ready-stock/reserve", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await makeJwt("operation")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      env,
    );
    return { res, c };
  }

  it("sends every pick to the ONE governed transaction, with its own line", async () => {
    const { res, c } = await reserve({
      orderId: ORDER,
      picks: [
        { itemId: "11111111-1111-4111-8111-111111111111", orderLineId: LINE_A },
        { itemId: "22222222-2222-4222-8222-222222222222", orderLineId: LINE_B },
      ],
    });
    expect(res.status).toBe(200);
    expect(c.rpcCalls).toHaveLength(1);
    const call = c.rpcCalls[0]!;
    expect(call.fn).toBe("so_batch_reserve_ready_units");
    expect(call.args.p_ref).toBe("SO-1251");
    /* The reason is recorded by construction — nothing is typed. */
    expect(call.args.p_reason).toBe("used_instead_of_ordering");
    expect(call.args.p_picks).toHaveLength(2);
  });

  it("refuses a body that names no pick", async () => {
    const { res, c } = await reserve({ orderId: ORDER, picks: [] });
    expect(res.status).toBe(400);
    expect(c.rpcCalls).toHaveLength(0);
  });

  it("refuses an order with no customer number rather than reaching the door", async () => {
    const { res, c } = await reserve(
      { orderId: ORDER, picks: [{ itemId: "11111111-1111-4111-8111-111111111111", orderLineId: LINE_A }] },
      fixture({ orders: { data: [{ id: ORDER, so: null }], error: null } }),
    );
    expect(res.status).toBe(422);
    expect(c.rpcCalls).toHaveLength(0);
  });
});
