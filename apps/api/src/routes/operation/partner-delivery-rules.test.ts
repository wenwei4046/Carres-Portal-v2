/**
 * T9 · Logistic partner profiles (migration 0283).
 *
 *   PUT /api/operation/partners/:id/delivery-rules  — author the four facts
 *   GET /api/operation/orders/:id/booking/partner-check?date=…  — read them
 *
 * The rule these tests exist to pin: partner rules WARN, they never BLOCK. A
 * date the carrier cannot honour still confirms — the operator may have already
 * phoned them. Only OUR obligations (goods, balance, Sunday) refuse.
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
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

type Result = { data: unknown; error: unknown };

function tableMock(read: Result, write?: Result) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    order: vi.fn(() => b),
    upsert: vi.fn(() => b),
    maybeSingle: vi.fn().mockResolvedValue(read),
    single: vi.fn().mockResolvedValue(write ?? read),
    then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(read).then(res, rej),
  };
  return b;
}

function makeSb(
  tables: Record<string, ReturnType<typeof tableMock>>,
  rpc = vi.fn().mockResolvedValue({ data: null, error: null }),
) {
  return {
    from: vi.fn((t: string) => {
      const b = tables[t];
      if (!b) throw new Error(`unmocked table ${t}`);
      return b;
    }),
    rpc,
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

const PARTNER_ID = "00000000-0000-0000-0000-0000000000b1";
const ORDER_ID = "00000000-0000-0000-0000-00000000010a";
const RULES_URL = `http://t/api/operation/partners/${PARTNER_ID}/delivery-rules`;

const OK_RULES = {
  offDays: [0, 6],
  blackoutDates: ["2026-08-15"],
  dailyCapacity: 8,
  bookingLeadDays: 2,
};

function put(jwt: string | null, body: unknown, url = RULES_URL) {
  return app.fetch(
    new Request(url, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: JSON.stringify(body),
    }),
    env,
  );
}

function partnerRow(over: Record<string, unknown> = {}) {
  return {
    id: PARTNER_ID,
    name: "NETS",
    off_days: [0],
    blackout_dates: [],
    daily_capacity: null,
    booking_lead_days: 0,
    ...over,
  };
}

describe("PUT /api/operation/partners/:id/delivery-rules", () => {
  it("401 without Authorization", async () => {
    expect((await put(null, OK_RULES)).status).toBe(401);
  });

  it("403 for a dealer", async () => {
    expect((await put(await makeJwt("dealer"), OK_RULES)).status).toBe(403);
  });

  it("422 on a weekday number that is not a weekday", async () => {
    const res = await put(await makeJwt("operation"), {
      ...OK_RULES,
      offDays: [0, 9],
    });
    expect(res.status).toBe(422);
  });

  it("422 on a zero capacity — NULL is how 'not recorded' is said", async () => {
    const res = await put(await makeJwt("operation"), {
      ...OK_RULES,
      dailyCapacity: 0,
    });
    expect(res.status).toBe(422);
  });

  it("422 when the carrier would run on no day at all", async () => {
    const res = await put(await makeJwt("operation"), {
      ...OK_RULES,
      offDays: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("at least one day");
  });

  it("saves through the audited RPC — never a table UPDATE", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const sb = makeSb(
      {
        delivery_partners: tableMock({
          data: partnerRow({
            off_days: [0, 6],
            blackout_dates: ["2026-08-15"],
            daily_capacity: 8,
            booking_lead_days: 2,
          }),
          error: null,
        }),
      },
      rpc,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await put(await makeJwt("operation"), OK_RULES);
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_partner_delivery_rules", {
      p_partner_id: PARTNER_ID,
      p_off_days: [0, 6],
      p_blackout_dates: ["2026-08-15"],
      p_daily_capacity: 8,
      p_booking_lead_days: 2,
    });
    const body = (await res.json()) as { partner: { daily_capacity: number } };
    expect(body.partner.daily_capacity).toBe(8);
  });

  it("de-duplicates and sorts what the operator typed", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const sb = makeSb(
      { delivery_partners: tableMock({ data: partnerRow(), error: null }) },
      rpc,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    await put(await makeJwt("operation"), {
      offDays: [6, 0, 6],
      blackoutDates: ["2026-09-02", "2026-08-15", "2026-08-15"],
      dailyCapacity: null,
      bookingLeadDays: 0,
    });
    expect(rpc.mock.calls[0]![1]).toMatchObject({
      p_off_days: [0, 6],
      p_blackout_dates: ["2026-08-15", "2026-09-02"],
      p_daily_capacity: null,
    });
  });
});

// ── the read side ───────────────────────────────────────────────────────────

function checkUrl(date: string, orderId = ORDER_ID) {
  return `http://t/api/operation/orders/${orderId}/booking/partner-check?date=${date}`;
}

function get(jwt: string | null, url: string) {
  return app.fetch(
    new Request(url, {
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    }),
    env,
  );
}

type CheckBody = {
  partner: { id: string; name: string } | null;
  bookedOnDate: number | null;
  warnings: { key: string; message: string }[];
};

describe("GET /api/operation/orders/:id/booking/partner-check", () => {
  it("401 without Authorization", async () => {
    expect((await get(null, checkUrl("2026-08-24"))).status).toBe(401);
  });

  it("403 for a partner role", async () => {
    expect((await get(await makeJwt("partner"), checkUrl("2026-08-24"))).status).toBe(
      403,
    );
  });

  it("422 when the date is not a date", async () => {
    const res = await get(await makeJwt("operation"), checkUrl("soon"));
    expect(res.status).toBe(422);
  });

  it("says nothing when no logistic is assigned yet — that is a different step", async () => {
    const sb = makeSb({
      orders: tableMock({
        data: { id: ORDER_ID, delivery_partner_id: null, ops_assigned_logistic: null },
        error: null,
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await get(await makeJwt("operation"), checkUrl("2026-08-24"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as CheckBody;
    expect(body.partner).toBeNull();
    expect(body.warnings).toEqual([]);
  });

  it("an unconfigured carrier warns about nothing on a future weekday", async () => {
    const sb = makeSb({
      orders: tableMock({
        data: {
          id: ORDER_ID,
          delivery_partner_id: PARTNER_ID,
          ops_assigned_logistic: null,
        },
        error: null,
      }),
      delivery_partners: tableMock({ data: partnerRow(), error: null }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    // A Monday far enough ahead that "in the past" can never fire.
    const res = await get(await makeJwt("operation"), checkUrl("2036-08-25"));
    const body = (await res.json()) as CheckBody;
    expect(body.partner?.name).toBe("NETS");
    expect(body.warnings).toEqual([]);
    // No capacity recorded ⇒ the day's load is not even counted.
    expect(body.bookedOnDate).toBeNull();
  });

  it("names the weekday a carrier does not run", async () => {
    const sb = makeSb({
      orders: tableMock({
        data: {
          id: ORDER_ID,
          delivery_partner_id: null,
          ops_assigned_logistic: PARTNER_ID,
        },
        error: null,
      }),
      delivery_partners: tableMock({
        data: partnerRow({ name: "AL", off_days: [0, 6] }),
        error: null,
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    // Saturday 30 Aug 2036.
    const res = await get(await makeJwt("operation"), checkUrl("2036-08-30"));
    const body = (await res.json()) as CheckBody;
    expect(body.warnings.map((w) => w.key)).toContain("off_day");
    expect(body.warnings[0]!.message).toContain("AL");
  });

  it("counts the day's load for a capacity carrier — this order and cancelled orders never count", async () => {
    const OTHER = "00000000-0000-0000-0000-0000000002ff";
    const sb = makeSb({
      orders: tableMock({
        data: {
          id: ORDER_ID,
          delivery_partner_id: PARTNER_ID,
          ops_assigned_logistic: null,
        },
        error: null,
      }),
      delivery_partners: tableMock({
        data: partnerRow({ daily_capacity: 2 }),
        error: null,
      }),
      ops_order_control: tableMock({
        data: [
          // this very order — not its own load
          {
            order_id: ORDER_ID,
            orders: { status: "active", delivery_partner_id: PARTNER_ID },
          },
          // a cancelled order does not occupy a truck
          {
            order_id: OTHER,
            orders: { status: "cancelled", delivery_partner_id: PARTNER_ID },
          },
          // another carrier's delivery
          {
            order_id: OTHER,
            orders: { status: "active", delivery_partner_id: "someone-else" },
          },
          // one real booking
          {
            order_id: OTHER,
            orders: { status: "active", ops_assigned_logistic: PARTNER_ID },
          },
        ],
        error: null,
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await get(await makeJwt("operation"), checkUrl("2036-08-25"));
    const body = (await res.json()) as CheckBody;
    expect(body.bookedOnDate).toBe(1);
    // 1 of 2 used — under the limit, so nothing to say.
    expect(body.warnings).toEqual([]);
  });

  it("keeps warning about a date already in the past", async () => {
    const sb = makeSb({
      orders: tableMock({
        data: {
          id: ORDER_ID,
          delivery_partner_id: PARTNER_ID,
          ops_assigned_logistic: null,
        },
        error: null,
      }),
      delivery_partners: tableMock({ data: partnerRow(), error: null }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await get(await makeJwt("operation"), checkUrl("2020-08-24"));
    const body = (await res.json()) as CheckBody;
    expect(body.warnings.map((w) => w.key)).toEqual(["lead_time"]);
  });

  it("warns when the day is already full", async () => {
    const OTHER = "00000000-0000-0000-0000-0000000002ff";
    const sb = makeSb({
      orders: tableMock({
        data: {
          id: ORDER_ID,
          delivery_partner_id: PARTNER_ID,
          ops_assigned_logistic: null,
        },
        error: null,
      }),
      delivery_partners: tableMock({
        data: partnerRow({ daily_capacity: 1 }),
        error: null,
      }),
      ops_order_control: tableMock({
        data: [
          {
            order_id: OTHER,
            orders: { status: "active", delivery_partner_id: PARTNER_ID },
          },
        ],
        error: null,
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await get(await makeJwt("operation"), checkUrl("2036-08-25"));
    const body = (await res.json()) as CheckBody;
    expect(body.warnings.map((w) => w.key)).toEqual(["capacity"]);
    expect(body.warnings[0]!.message).toContain("its limit is 1 a day");
  });
});

// ── the card's central claim ────────────────────────────────────────────────
// A partner rule WARNS. It must never cost the customer their booking.

describe("POST /:id/booking/confirm — partner rules warn, they never block", () => {
  const MATTRESS = "mattress:FirmCare-K";
  const OK_BODY = {
    confirmedDate: "2036-08-25", // a Monday, comfortably ahead
    confirmedTimeSlot: "Afternoon (12pm–3pm)",
  };

  function confirmTables(partner: Record<string, unknown>) {
    return {
      orders: tableMock({
        data: {
          id: ORDER_ID,
          so: 1234,
          delivery_partner_id: PARTNER_ID,
          ops_assigned_logistic: null,
        },
        error: null,
      }),
      order_lines: tableMock({
        data: [{ sku: MATTRESS, qty: 1, unit_price: 2500 }],
        error: null,
      }),
      order_addons: tableMock({ data: [], error: null }),
      ops_order_control: tableMock(
        { data: { line_received: { [MATTRESS]: 1 }, balance: null }, error: null },
        {
          data: {
            order_id: ORDER_ID,
            booking_stage: "confirmed",
            confirmed_date: OK_BODY.confirmedDate,
            confirmed_time_slot: OK_BODY.confirmedTimeSlot,
          },
          error: null,
        },
      ),
      ops_stock_items: tableMock({ data: [], error: null }),
      order_payments: tableMock({
        data: [{ kind: "payment", amount: 2500 }],
        error: null,
      }),
      delivery_partners: tableMock({ data: partner, error: null }),
    };
  }

  it("confirms the booking anyway, and hands back the reason to call the carrier", async () => {
    const sb = makeSb(
      confirmTables(partnerRow({ blackout_dates: [OK_BODY.confirmedDate] })),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/booking/confirm`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await makeJwt("operation")}`,
        },
        body: JSON.stringify(OK_BODY),
      }),
      env,
    );
    // The booking is RECORDED — a carrier's working pattern is not one of our
    // obligations, and the operator may have already phoned them.
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      control: { booking_stage: string };
      partnerWarnings: { key: string; message: string }[];
    };
    expect(body.control.booking_stage).toBe("confirmed");
    expect(body.partnerWarnings.map((w) => w.key)).toEqual(["blackout"]);
    expect(body.partnerWarnings[0]!.message).toContain("NETS");
  });

  it("sends an empty warning list when the carrier has nothing against the date", async () => {
    const sb = makeSb(confirmTables(partnerRow()));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/booking/confirm`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await makeJwt("operation")}`,
        },
        body: JSON.stringify(OK_BODY),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { partnerWarnings: unknown[] };
    expect(body.partnerWarnings).toEqual([]);
  });
});
