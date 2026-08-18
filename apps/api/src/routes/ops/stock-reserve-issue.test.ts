/**
 * SLICE 2 — RESERVING A UNIT MAY COMPLETE THE DELIVERY-ORDER GATE, AND THEN
 * THE SYSTEM ISSUES THE DOCUMENT (`docs/orders/MASTER.md` §8: no Release
 * button, no manual bypass). The /reserve and /reserve-item doors attempt the
 * issue after a successful draw — FAIL-SOFT, and only for a `SO-{n}` ref:
 * loans and partner refs have no delivery-order gate.
 */
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
    .setSubject("11111111-1111-1111-1111-000000000001")
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

type Result = { data: unknown; error: unknown };

function tableMock(read: Result) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    is: vi.fn(() => b),
    maybeSingle: vi.fn().mockResolvedValue(read),
    single: vi.fn().mockResolvedValue(read),
    then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(read).then(res, rej),
  };
  return b;
}

function ordersMock(read: Result, afterUpdate: Result) {
  let updated = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    is: vi.fn(() => b),
    update: vi.fn(() => {
      updated = true;
      return b;
    }),
    maybeSingle: vi.fn(() => Promise.resolve(updated ? afterUpdate : read)),
    then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(updated ? afterUpdate : read).then(res, rej),
  };
  return b;
}

const ORDER_ID = "00000000-0000-0000-0000-00000000040a";
const ITEM_ID = "00000000-0000-0000-0000-000000000501";
const MATTRESS = "mattress:FirmCare-K";

/** A fully qualifying order — the unit this draw reserves is the last goods
 *  requirement, so the reserved read already answers with it. */
function tables() {
  return {
    orders: ordersMock(
      {
        data: { id: ORDER_ID, so: 1234, paid: 0, do_number: null },
        error: null,
      },
      { data: { id: ORDER_ID, do_number: "DO-170826-2222" }, error: null },
    ),
    order_lines: tableMock({
      data: [{ sku: MATTRESS, qty: 1, unit_price: 2500 }],
      error: null,
    }),
    order_addons: tableMock({ data: [], error: null }),
    ops_order_control: tableMock({
      data: {
        line_received: null,
        balance: null,
        booking_stage: "confirmed",
        confirmed_date: "2026-08-24",
        confirmed_time_slot: "Afternoon (12pm–3pm)",
        booking_groups: null,
      },
      error: null,
    }),
    // The just-reserved unit — reserved to SO-1234, which is what makes the
    // goods requirement pass the moment the draw lands.
    ops_stock_items: tableMock({
      data: [{ sku: MATTRESS, qty: 1 }],
      error: null,
    }),
    order_finance_exceptions: tableMock({ data: [], error: null }),
  };
}

function makeSb(tables: Record<string, unknown>) {
  return {
    from: vi.fn((t: string) => {
      const b = tables[t];
      if (!b) throw new Error(`unmocked table ${t}`);
      return b;
    }),
    // ops_stock_pool_draw answers with the drawn unit's id.
    rpc: vi.fn().mockResolvedValue({ data: ITEM_ID, error: null }),
  };
}

function post(jwt: string, path: string, body: unknown) {
  return app.fetch(
    new Request(`http://t/api/ops/stock${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(body),
    }),
    env,
  );
}

describe("Slice 2 — the reserve doors complete the gate and the system issues", () => {
  it("⭐ /reserve to a Sales Order ref issues the DO with no further press", async () => {
    const t = tables();
    const sb = makeSb(t);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), "/reserve", {
      sku: MATTRESS,
      ref: "SO-1234",
      reason: "sales_urgent",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ itemId: ITEM_ID });
    // The hook looked the order up by its SO and minted into the empty column.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((t.orders as any).update).toHaveBeenCalledWith({
      do_number: expect.stringMatching(/^DO-\d{6}-\d{4}$/),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((t.orders as any).is).toHaveBeenCalledWith("do_number", null);
  });

  it("/reserve-item behaves the same — one shared hook, not a second engine", async () => {
    const t = tables();
    const sb = makeSb(t);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), "/reserve-item", {
      itemId: ITEM_ID,
      ref: "SO-1234",
      reason: "sales_urgent",
    });
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((t.orders as any).update).toHaveBeenCalled();
  });

  it("a non-SO ref (a loan, a partner) never touches the orders table", async () => {
    const t = tables();
    const sb = makeSb(t);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), "/reserve", {
      sku: MATTRESS,
      ref: "LOAN-9",
      reason: "other",
    });
    expect(res.status).toBe(200);
    expect(sb.from).not.toHaveBeenCalledWith("orders");
  });

  it("FAIL-SOFT — an issuance hiccup never undoes the reservation", async () => {
    // Only the RPC is usable; every table read throws. The draw must still
    // answer 200 with its unit id.
    const sb = {
      from: vi.fn(() => {
        throw new Error("unmocked table");
      }),
      rpc: vi.fn().mockResolvedValue({ data: ITEM_ID, error: null }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), "/reserve", {
      sku: MATTRESS,
      ref: "SO-1234",
      reason: "sales_urgent",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ itemId: ITEM_ID });
  });
});
