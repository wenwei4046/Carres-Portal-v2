/**
 * D1 booking confirm (migration 0277) — POST /api/operation/orders/:id/booking/confirm.
 * The gates live on the SERVER: date+slot both (invariant #1), no Sunday
 * (invariant #8), goods ready + balance ready (frozen §7 Stage 2).
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

/** Thenable chainable builder — list queries are awaited directly after .eq(),
 *  single-row reads via .maybeSingle(), the upsert via .single(). `read` feeds
 *  the awaits/maybeSingle; `write` feeds .single() (the upsert response). */
function tableMock(read: Result, write?: Result) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    upsert: vi.fn(() => b),
    maybeSingle: vi.fn().mockResolvedValue(read),
    single: vi.fn().mockResolvedValue(write ?? read),
    then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(read).then(res, rej),
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
const URL = `http://t/api/operation/orders/${ORDER_ID}/booking/confirm`;
const MATTRESS = "mattress:FirmCare-K";

// Monday 24 Aug 2026 — a legal delivery working day.
const OK_BODY = {
  confirmedDate: "2026-08-24",
  confirmedTimeSlot: "Afternoon (12pm–3pm)",
};

function post(jwt: string | null, body: unknown) {
  return app.fetch(
    new Request(URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: JSON.stringify(body),
    }),
    env,
  );
}

/** Standard happy-path table set: one reserved mattress line, RM2500 fully
 *  collected. Overridable per test. */
function happyTables(overrides?: Partial<Record<string, ReturnType<typeof tableMock>>>) {
  const confirmedRow = {
    order_id: ORDER_ID,
    booking_stage: "confirmed",
    confirmed_date: OK_BODY.confirmedDate,
    confirmed_time_slot: OK_BODY.confirmedTimeSlot,
  };
  return {
    orders: tableMock({ data: { id: ORDER_ID, so: 1234 }, error: null }),
    order_lines: tableMock({
      data: [{ sku: MATTRESS, qty: 1, unit_price: 2500 }],
      error: null,
    }),
    order_addons: tableMock({ data: [], error: null }),
    ops_order_control: tableMock(
      { data: { line_received: { [MATTRESS]: 1 }, balance: null }, error: null },
      { data: confirmedRow, error: null },
    ),
    ops_stock_items: tableMock({ data: [], error: null }),
    order_payments: tableMock({
      data: [{ kind: "payment", amount: 2500 }],
      error: null,
    }),
    ...overrides,
  };
}

describe("POST /api/operation/orders/:id/booking/confirm", () => {
  it("401 without Authorization", async () => {
    const res = await post(null, OK_BODY);
    expect(res.status).toBe(401);
  });

  it("403 for dealer role", async () => {
    const res = await post(await makeJwt("dealer"), OK_BODY);
    expect(res.status).toBe(403);
  });

  it("422 when the time slot is missing — invariant #1, a date alone never confirms", async () => {
    const res = await post(await makeJwt("operation"), {
      confirmedDate: "2026-08-24",
    });
    expect(res.status).toBe(422);
  });

  it("422 on a Sunday — invariant #8", async () => {
    const res = await post(await makeJwt("operation"), {
      ...OK_BODY,
      confirmedDate: "2026-08-23", // Sunday
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("booking_sunday");
  });

  it("422 when a core line is not reserved — names the sku", async () => {
    const sb = makeSb(
      happyTables({
        ops_order_control: tableMock(
          { data: { line_received: null, balance: null }, error: null },
          { data: null, error: null },
        ),
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), OK_BODY);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("booking_gate");
    expect(body.message).toContain(MATTRESS);
  });

  it("422 when the balance is outstanding — reports the RM figure", async () => {
    const sb = makeSb(
      happyTables({
        order_payments: tableMock({
          data: [{ kind: "deposit", amount: 1000 }],
          error: null,
        }),
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), OK_BODY);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("booking_gate");
    expect(body.message).toContain("1500.00");
  });

  it("the reserved-units ledger (SO-ref) satisfies goods ready without line_received", async () => {
    const tables = happyTables({
      ops_order_control: tableMock(
        { data: { line_received: null, balance: null }, error: null },
        { data: { order_id: ORDER_ID, booking_stage: "confirmed" }, error: null },
      ),
      ops_stock_items: tableMock({
        // Size spelled as a WORD vs the line's "-K" suffix — stockMatchKey
        // unifies the drift (same model + canonical size = one key).
        data: [{ sku: "mattress:FirmCare King", qty: 1 }],
        error: null,
      }),
    });
    const sb = makeSb(tables);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), OK_BODY);
    expect(res.status).toBe(200);
  });

  it("200 — confirm writes stage + date + slot + evidence stamp", async () => {
    const tables = happyTables();
    const sb = makeSb(tables);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), OK_BODY);
    expect(res.status).toBe(200);
    const upsert = tables.ops_order_control.upsert;
    expect(upsert).toHaveBeenCalledTimes(1);
    const payload = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.booking_stage).toBe("confirmed");
    expect(payload.confirmed_date).toBe(OK_BODY.confirmedDate);
    expect(payload.confirmed_time_slot).toBe(OK_BODY.confirmedTimeSlot);
    expect(payload.customer_confirmed_by).toBe("u1");
    expect(typeof payload.customer_confirmed_at).toBe("string");
    const body = (await res.json()) as { control: { booking_stage: string } };
    expect(body.control.booking_stage).toBe("confirmed");
  });

  it("generic PUT /control refuses booking_stage — the one door is the confirm endpoint", async () => {
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${await makeJwt("operation")}`,
        },
        body: JSON.stringify({ booking_stage: "confirmed" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});
