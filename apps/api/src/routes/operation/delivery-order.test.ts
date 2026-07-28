/**
 * C7 — POST /api/operation/orders/:id/delivery-order.
 *
 * The delivery order stops being typed by a human and stops being born at
 * dispatch. `docs/ORDERS-WORKING-FLOW.md` §5 puts the HARD gate here — goods
 * reserved, money collected, the date not a Sunday or a public holiday — and
 * the confirm endpoint one step earlier now only warns.
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
import { docNumber } from "@carres/shared";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
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
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

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

/** `orders` answers the pre-read, then the UPDATE's own `.select()` — two
 *  different rows, which is the whole point of the mint. */
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

function makeSb(tables: Record<string, ReturnType<typeof tableMock>>) {
  return {
    from: vi.fn((t: string) => {
      const b = tables[t];
      if (!b) throw new Error(`unmocked table ${t}`);
      return b;
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
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

const ORDER_ID = "00000000-0000-0000-0000-00000000010a";
const URL = `http://t/api/operation/orders/${ORDER_ID}/delivery-order`;
const MATTRESS = "mattress:FirmCare-K";
/** Monday 24 Aug 2026 — a working day, and not on the Selangor calendar. */
const CONFIRMED_DATE = "2026-08-24";

function post(jwt: string | null) {
  return app.fetch(
    new Request(URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: "{}",
    }),
    env,
  );
}

/** Everything §3 asks for: the customer confirmed a future date + slot, the
 *  mattress is reserved to the SO, and the order is paid in full. */
function tables(over?: {
  orderRead?: Result;
  control?: Record<string, unknown>;
  paid?: number;
  lineReceived?: Record<string, number> | null;
}) {
  const control = {
    line_received: over?.lineReceived === undefined ? { [MATTRESS]: 1 } : over.lineReceived,
    balance: null,
    booking_stage: "confirmed",
    confirmed_date: CONFIRMED_DATE,
    confirmed_time_slot: "Afternoon (12pm–3pm)",
    booking_groups: null,
    ...(over?.control ?? {}),
  };
  return {
    orders: ordersMock(
      over?.orderRead ?? {
        data: { id: ORDER_ID, so: 1234, paid: over?.paid ?? 2500, do_number: null },
        error: null,
      },
      {
        data: {
          id: ORDER_ID,
          do_number: docNumber({
            prefix: "DO",
            date: new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10),
            seed: ORDER_ID,
            digits: 4,
          }),
        },
        error: null,
      },
    ),
    order_lines: tableMock({
      data: [{ sku: MATTRESS, qty: 1, unit_price: 2500 }],
      error: null,
    }),
    order_addons: tableMock({ data: [], error: null }),
    ops_order_control: tableMock({ data: control, error: null }),
    ops_stock_items: tableMock({ data: [], error: null }),
  };
}

describe("POST /api/operation/orders/:id/delivery-order", () => {
  it("401 without Authorization", async () => {
    expect((await post(null)).status).toBe(401);
  });

  it("403 for a dealer", async () => {
    expect((await post(await makeJwt("dealer"))).status).toBe(403);
  });

  it("issues the document with the LOCKED number scheme, seeded on the order", async () => {
    const t = tables();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(t) as any);
    const res = await post(await makeJwt("operation"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      issued: boolean;
      order: { do_number: string };
    };
    expect(body.issued).toBe(true);
    // DO-DDMMYY-NNNN (Jess 2026-07-19), never a running counter and never typed.
    expect(body.order.do_number).toMatch(/^DO-\d{6}-\d{4}$/);
    const written = t.orders.update.mock.calls[0][0] as { do_number: string };
    expect(written.do_number).toBe(body.order.do_number);
  });

  it("mints only into an empty column — two operators cannot make two documents", async () => {
    const t = tables();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(t) as any);
    await post(await makeJwt("operation"));
    // `.is("do_number", null)` is the guard, in the DATABASE and not only in
    // the read above.
    expect(t.orders.is).toHaveBeenCalledWith("do_number", null);
  });

  it("records the issue on the order's own timeline, in the dictionary's words", async () => {
    const t = tables();
    const sb = makeSb(t);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    await post(await makeJwt("operation"));
    expect(sb.rpc).toHaveBeenCalledWith(
      "operation_add_annotation",
      expect.objectContaining({
        p_content: expect.stringContaining("Delivery order issued"),
      }),
    );
  });

  it("a second press returns the SAME number and mints nothing", async () => {
    const t = tables({
      orderRead: {
        data: { id: ORDER_ID, so: 1234, paid: 2500, do_number: "DO-240826-4821" },
        error: null,
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(t) as any);
    const res = await post(await makeJwt("operation"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      issued: boolean;
      order: { do_number: string };
    };
    expect(body).toMatchObject({ issued: false });
    expect(body.order.do_number).toBe("DO-240826-4821");
    expect(t.orders.update).not.toHaveBeenCalled();
  });

  it("422 with no confirmed booking — the trigger is the customer's date + slot", async () => {
    const t = tables({
      control: { booking_stage: "none", confirmed_date: null, confirmed_time_slot: null },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(t) as any);
    const res = await post(await makeJwt("operation"));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("delivery_order_gate");
    expect(body.message).toContain("has not confirmed a delivery date");
    expect(t.orders.update).not.toHaveBeenCalled();
  });

  it("422 when the goods are not reserved — and names them", async () => {
    const t = tables({ lineReceived: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(t) as any);
    const res = await post(await makeJwt("operation"));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toContain(MATTRESS);
  });

  it("422 when money is still owed — THE gate C9 said this card owns", async () => {
    const t = tables({ paid: 1000 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(t) as any);
    const res = await post(await makeJwt("operation"));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toContain("1500.00");
    expect(t.orders.update).not.toHaveBeenCalled();
  });

  it("422 on a Sunday booking — §5's hard calendar block, asked again at the last step", async () => {
    const t = tables({ control: { confirmed_date: "2026-08-23" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(t) as any);
    const res = await post(await makeJwt("operation"));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toContain("Sunday");
  });

  it("422 on a Malaysian public holiday — the half the confirm route never asked", async () => {
    // 31 Aug 2026 — Merdeka Day, on the live Selangor calendar the working-day
    // engine already uses.
    const t = tables({ control: { confirmed_date: "2026-08-31" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(t) as any);
    const res = await post(await makeJwt("operation"));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toContain("public holiday");
  });

  it("issues for the trip the customer BOOKED, not for the whole order", async () => {
    // A split trip carries the bed set only; the sofa is not in yet. The paper
    // must exist for the trip that was confirmed, so the unready sofa cannot
    // refuse it — otherwise a split order could never be delivered at all.
    const SOFA = "sofa:Lounge-3S";
    const t = tables({
      control: {
        booking_groups: ["bed"],
        line_received: { [MATTRESS]: 1, [SOFA]: 0 },
      },
    });
    t.order_lines = tableMock({
      data: [
        { sku: MATTRESS, qty: 1, unit_price: 2500 },
        { sku: SOFA, qty: 1, unit_price: 0 },
      ],
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(t) as any);
    const res = await post(await makeJwt("operation"));
    expect(res.status).toBe(200);
    expect(t.orders.update).toHaveBeenCalled();
  });
});
