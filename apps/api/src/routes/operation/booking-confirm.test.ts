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
    // T8 — the split confirm appends a plain-English activity line through the
    // existing SECURITY DEFINER annotation door (fail-soft, same as T4/T6).
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
 *  collected. Overridable per test.
 *
 *  C5 (2026-07-27): "collected" is `orders.paid`, NOT an `order_payments` sum.
 *  That table is deliberately NOT mocked here any more — `makeSb` throws on an
 *  unmocked table, so if a future edit points the money gate back at the empty
 *  ledger, every one of these tests fails loudly instead of quietly refusing a
 *  paid customer's booking. */
function happyTables(overrides?: Partial<Record<string, ReturnType<typeof tableMock>>>) {
  const confirmedRow = {
    order_id: ORDER_ID,
    booking_stage: "confirmed",
    confirmed_date: OK_BODY.confirmedDate,
    confirmed_time_slot: OK_BODY.confirmedTimeSlot,
  };
  return {
    orders: tableMock({
      data: { id: ORDER_ID, so: 1234, paid: 2500 },
      error: null,
    }),
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

  it("C7 — goods not reserved WARNS, it no longer refuses the confirmation", async () => {
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
    // §5: "AGREEING a date is softer than ISSUING the document." The date the
    // customer said yes to is recorded; the goods sentence rides the response.
    expect(res.status).toBe(200);
    const body = (await res.json()) as { gateWarnings: string[] };
    expect(body.gateWarnings.join(" ")).toContain(MATTRESS);
    expect(body.gateWarnings.join(" ")).toContain("delivery order cannot be issued");
  });

  it("C7 — an outstanding balance WARNS with its RM figure, it no longer refuses", async () => {
    // RM 2,500 of lines, RM 1,000 paid ⇒ RM 1,500 still owed.
    const sb = makeSb(
      happyTables({
        orders: tableMock({
          data: { id: ORDER_ID, so: 1234, paid: 1000 },
          error: null,
        }),
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), OK_BODY);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { gateWarnings: string[] };
    expect(body.gateWarnings.join(" ")).toContain("1500.00");
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

  // ── C5 · the money gate reads the number that exists ──────────────────────

  it("SO-1209's shape: paid in full through orders.paid ⇒ the booking confirms", async () => {
    // The live order that proved the bug (2026-07-27): RM 6,998 of lines +
    // RM 250 of add-ons, `orders.paid` RM 7,248, `ops_order_control.balance`
    // NULL, `order_payments` empty. The gate used to sum that empty ledger, so
    // it refused this booking for RM 7,248 the customer had already paid.
    const sb = makeSb(
      happyTables({
        orders: tableMock({
          data: { id: ORDER_ID, so: 1209, paid: 7248 },
          error: null,
        }),
        order_lines: tableMock({
          data: [{ sku: MATTRESS, qty: 1, unit_price: 6998 }],
          error: null,
        }),
        order_addons: tableMock({
          data: [{ qty: 1, unit_price: 250 }],
          error: null,
        }),
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), OK_BODY);
    expect(res.status).toBe(200);
  });

  it("an imported row with no prices and no keyed balance is UNKNOWN, and unknown never blocks", async () => {
    // SO-1221's shape: AutoCount, RM 1,300 paid, no line prices, balance NULL.
    // Nobody has said what it is worth, so it cannot owe a figure — the gate
    // must not invent one.
    const sb = makeSb(
      happyTables({
        orders: tableMock({
          data: { id: ORDER_ID, so: 1221, paid: 1300 },
          error: null,
        }),
        order_lines: tableMock({
          data: [{ sku: MATTRESS, qty: 1, unit_price: null }],
          error: null,
        }),
      }),
    );
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

  // ── T8 · delivery groups (migration 0282) ────────────────────────────────
  // Jess: bed set never splits · sofa may take a second trip IF the customer
  // agrees · accessories never block. The endpoint is where that is enforced.

  const BEDFRAME = "bedframe:Jager/Fab3-King";
  const SOFA = "sofa:Glano-3Seater";
  const PILLOW = "Memory Pillow";

  /** Bed set reserved, sofa NOT — the case the whole card exists for. */
  function mixedTables(overrides?: Partial<Record<string, ReturnType<typeof tableMock>>>) {
    return happyTables({
      order_lines: tableMock({
        data: [
          { sku: MATTRESS, qty: 1, unit_price: 2000 },
          { sku: BEDFRAME, qty: 1, unit_price: 500 },
          { sku: SOFA, qty: 1, unit_price: 0 },
          { sku: PILLOW, qty: 2, unit_price: 0 },
        ],
        error: null,
      }),
      ops_order_control: tableMock(
        {
          data: {
            line_received: { [MATTRESS]: 1, [BEDFRAME]: 1, [SOFA]: 0 },
            balance: null,
          },
          error: null,
        },
        { data: { order_id: ORDER_ID, booking_stage: "confirmed" }, error: null },
      ),
      ...overrides,
    });
  }

  it("C7 — a short sofa with no scope WARNS; the system still never splits by itself", async () => {
    const sb = makeSb(mixedTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), OK_BODY);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { gateWarnings: string[] };
    expect(body.gateWarnings.join(" ")).toContain(SOFA);
  });

  it("200 with deliverGroups:['bed'] — the customer said deliver the bed set now", async () => {
    const tables = mixedTables();
    const sb = makeSb(tables);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), {
      ...OK_BODY,
      deliverGroups: ["bed"],
    });
    expect(res.status).toBe(200);
    const payload = tables.ops_order_control.upsert.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload.booking_groups).toEqual(["bed"]);
    // The split is on the timeline in words, not only as a column diff.
    expect(sb.rpc).toHaveBeenCalledWith(
      "operation_add_annotation",
      expect.objectContaining({
        p_content: expect.stringContaining("Sofa follows on a second trip"),
      }),
    );
  });

  it("C7 — deliverGroups:['sofa'] on the unready half WARNS about the sofa", async () => {
    const sb = makeSb(mixedTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), {
      ...OK_BODY,
      deliverGroups: ["sofa"],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { gateWarnings: string[] };
    expect(body.gateWarnings.join(" ")).toContain(SOFA);
  });

  it("HARD rule: no scope can send the mattress without its bed frame (now as the warning)", async () => {
    const sb = makeSb(
      mixedTables({
        ops_order_control: tableMock(
          {
            data: {
              line_received: { [MATTRESS]: 1, [BEDFRAME]: 0, [SOFA]: 1 },
              balance: null,
            },
            error: null,
          },
          { data: null, error: null },
        ),
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), {
      ...OK_BODY,
      deliverGroups: ["bed"],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { gateWarnings: string[] };
    // The bed set is ONE atom either way — the sentence names the frame, and
    // the delivery order is what refuses to exist until it is reserved.
    expect(body.gateWarnings.join(" ")).toContain(BEDFRAME);
  });

  it("422 booking_scope when the scope names a group this order does not have", async () => {
    const sb = makeSb(happyTables()); // mattress only — no sofa
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), {
      ...OK_BODY,
      deliverGroups: ["sofa"],
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("booking_scope");
  });

  it("422 on an empty deliverGroups — a trip carrying nothing is not a delivery", async () => {
    const sb = makeSb(mixedTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), {
      ...OK_BODY,
      deliverGroups: [],
    });
    expect(res.status).toBe(422);
  });

  it("a full-order trip stores NULL, not the group list — no split, nothing to chase", async () => {
    const tables = happyTables();
    const sb = makeSb(tables);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), {
      ...OK_BODY,
      deliverGroups: ["bed"], // the only group this order has
    });
    expect(res.status).toBe(200);
    const payload = tables.ops_order_control.upsert.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload.booking_groups).toBeNull();
    expect(sb.rpc).not.toHaveBeenCalled(); // nothing owed = not a split
  });

  it("the follow-up trip archives the first one instead of overwriting it", async () => {
    const tables = mixedTables({
      ops_order_control: tableMock(
        {
          data: {
            line_received: { [MATTRESS]: 1, [BEDFRAME]: 1, [SOFA]: 1 },
            balance: null,
            // The bed-set trip already on file.
            booking_stage: "confirmed",
            booking_groups: ["bed"],
            confirmed_date: "2026-08-17",
            confirmed_time_slot: "Morning (9am–12pm)",
            customer_confirmed_at: "2026-08-10T02:00:00.000Z",
            customer_confirmed_by: "u1",
            delivery_trips: [],
          },
          error: null,
        },
        { data: { order_id: ORDER_ID, booking_stage: "confirmed" }, error: null },
      ),
    });
    const sb = makeSb(tables);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), {
      ...OK_BODY,
      deliverGroups: ["sofa"],
    });
    expect(res.status).toBe(200);
    const payload = tables.ops_order_control.upsert.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload.booking_groups).toEqual(["sofa"]);
    expect(payload.delivery_trips).toEqual([
      {
        groups: ["bed"],
        date: "2026-08-17",
        slot: "Morning (9am–12pm)",
        at: "2026-08-10T02:00:00.000Z",
        by: "u1",
      },
    ]);
  });

  it("re-confirming the SAME scope is a typo fix — it does not archive a trip", async () => {
    const tables = mixedTables({
      ops_order_control: tableMock(
        {
          data: {
            line_received: { [MATTRESS]: 1, [BEDFRAME]: 1, [SOFA]: 0 },
            balance: null,
            booking_stage: "confirmed",
            booking_groups: ["bed"],
            confirmed_date: "2026-08-17",
            confirmed_time_slot: "Morning (9am–12pm)",
            delivery_trips: [],
          },
          error: null,
        },
        { data: { order_id: ORDER_ID, booking_stage: "confirmed" }, error: null },
      ),
    });
    const sb = makeSb(tables);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"), {
      ...OK_BODY,
      deliverGroups: ["bed"],
    });
    expect(res.status).toBe(200);
    const payload = tables.ops_order_control.upsert.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload.delivery_trips).toEqual([]);
  });

  it("a short pillow never blocks the bed set — accessories are outside the question", async () => {
    const tables = mixedTables({
      order_lines: tableMock({
        data: [
          { sku: MATTRESS, qty: 1, unit_price: 2000 },
          { sku: BEDFRAME, qty: 1, unit_price: 500 },
          { sku: PILLOW, qty: 2, unit_price: 0 }, // nothing received
        ],
        error: null,
      }),
    });
    const sb = makeSb(tables);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    // No scope at all: the order is deliverable in full despite the pillow.
    const res = await post(await makeJwt("operation"), OK_BODY);
    expect(res.status).toBe(200);
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
