/**
 * CARD 3 — GET /api/operation/orders/:id/booking-brief.
 *
 * The endpoint that puts the T−3 customer call's four facts in one place. The
 * test that matters most is the first one in the second block: the brief is
 * served IN FULL for an order whose goods are still at the factory, because
 * "Stock ETA informs the conversation; it does not decide whether the
 * conversation happens" (owner ruling 2026-08-13, Rule 3).
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

function tableMock(read: Result) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    in: vi.fn(() => b),
    or: vi.fn(() => b),
    maybeSingle: vi.fn().mockResolvedValue(read),
    single: vi.fn().mockResolvedValue(read),
    then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(read).then(res, rej),
  };
  return b;
}

const ORDER_ID = "00000000-0000-0000-0000-00000000030a";
const PARTNER_NETS = "00000000-0000-0000-0000-0000000003be";
const PARTNER_HOUZS = "00000000-0000-0000-0000-0000000003cf";
const MATTRESS = "mattress:FirmCare-K";
const SOFA = "sofa:Cody-2S";

/** The commitment bundle the 0340 RPC returns (same shape the Card 1 route
 *  test uses) — the brief takes its committed lines from Card 1's resolver and
 *  never from `order_lines` directly. */
function bundle(lines: { sku: string; qty: number }[]) {
  return {
    order_id: ORDER_ID,
    current: {
      header: {
        customer_name: "Tan Ah Kow",
        delivery_date: "2026-08-20",
        delivery_date_tbd: false,
      },
      lines: lines.map((l, i) => ({
        id: `00000000-0000-0000-0000-00000000l${i}0`,
        sku: l.sku,
        qty: l.qty,
        unit_price: 1000,
      })),
      addons: [],
    },
    revisions: [],
    requests: [],
  };
}

function makeSb(opts: {
  lines: { sku: string; qty: number }[];
  order?: Record<string, unknown>;
  control?: Record<string, unknown> | null;
  units?: Record<string, unknown>[];
  callDays?: number;
}) {
  const control = opts.control === undefined ? {} : opts.control;
  const tables: Record<string, ReturnType<typeof tableMock>> = {
    orders: tableMock({
      data: {
        id: ORDER_ID,
        so: 1318,
        delivery_date: "2026-08-20",
        delivery_date_tbd: false,
        ops_assigned_logistic: PARTNER_NETS,
        delivery_partner_id: null,
        ops_order_control: control,
        ...(opts.order ?? {}),
      },
      error: null,
    }),
    ops_stock_items: tableMock({ data: opts.units ?? [], error: null }),
    delivery_partners: tableMock({
      data: [
        { id: PARTNER_NETS, name: "NETS" },
        { id: PARTNER_HOUZS, name: "HOUZS" },
      ],
      error: null,
    }),
    purchasing_settings: tableMock({
      data: { logistics_call_working_days: opts.callDays ?? 3 },
      error: null,
    }),
  };
  return {
    from: vi.fn((t: string) => {
      const b = tables[t];
      if (!b) throw new Error(`unmocked table ${t}`);
      return b;
    }),
    rpc: vi.fn().mockResolvedValue({ data: bundle(opts.lines), error: null }),
  };
}

function get(jwt: string | null) {
  return app.fetch(
    new Request(`http://t/api/operation/orders/${ORDER_ID}/booking-brief`, {
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    }),
    env,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Brief = any;
async function brief(sb: unknown): Promise<Brief> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(sb as any);
  const res = await get(await makeJwt("operation"));
  expect(res.status).toBe(200);
  return ((await res.json()) as { brief: Brief }).brief;
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

describe("GET /api/operation/orders/:id/booking-brief", () => {
  it("401 without Authorization", async () => {
    expect((await get(null)).status).toBe(401);
  });

  it("403 for dealer role", async () => {
    expect((await get(await makeJwt("dealer"))).status).toBe(403);
  });

  it("404 when the order does not exist", async () => {
    const sb = makeSb({ lines: [] });
    sb.from = vi.fn((t: string) =>
      t === "orders"
        ? tableMock({ data: null, error: null })
        : tableMock({ data: [], error: null }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    expect((await get(await makeJwt("operation"))).status).toBe(404);
  });
});

describe("CARD 3 · Rule 3 — the brief never waits for the goods", () => {
  it("serves the full brief with NOTHING in the warehouse", async () => {
    const b = await brief(
      makeSb({
        lines: [{ sku: MATTRESS, qty: 2 }],
        control: { stock_eta: null, line_etas: { [MATTRESS]: "2026-08-27" } },
        units: [],
      }),
    );
    // The four facts Operations puts on the call.
    expect(b.promisedDateIso).toBe("2026-08-20");
    expect(b.stockEtaIso).toBe("2026-08-27");
    expect(b.expectedScopeLabel).toBe("Bed set");
    expect(b.goodsNotIn).toHaveLength(1);
    expect(b.goodsNotIn[0].shortQty).toBe(2);
    expect(b.goodsIn).toHaveLength(0);
    // And the call itself is a real, dated step.
    expect(b.contactDueIso).toBe("2026-08-17");
  });

  it("reports what IS in beside what is not", async () => {
    const b = await brief(
      makeSb({
        lines: [
          { sku: MATTRESS, qty: 1 },
          { sku: SOFA, qty: 1 },
        ],
        control: { line_etas: { [SOFA]: "2026-09-01" } },
        units: [
          {
            id: "u1",
            unit_code: "id-aaa111",
            sku: MATTRESS,
            status: "reserved",
            condition: "new",
            warehouse_id: null,
            po_no: "PO-1",
            qty: 1,
            date_in: "2026-08-01",
            sold_at: null,
          },
        ],
      }),
    );
    expect(b.goodsIn.map((l: Brief) => l.sku)).toEqual([MATTRESS]);
    expect(b.goodsNotIn.map((l: Brief) => l.sku)).toEqual([SOFA]);
    expect(b.expectedScope).toEqual(["bed", "sofa"]);
  });
});

describe("CARD 3 · the three separate truths, over the wire", () => {
  it("keeps assignment, Stock ETA and the appointment apart", async () => {
    const b = await brief(
      makeSb({
        lines: [{ sku: MATTRESS, qty: 1 }],
        control: {
          booking_stage: "confirmed",
          confirmed_date: "2026-08-22",
          confirmed_time_slot: "Morning (9am–12pm)",
          confirmed_partner_id: PARTNER_NETS,
          booking_groups: null,
          customer_confirmed_at: "2026-08-15T02:00:00.000Z",
          line_etas: { [MATTRESS]: "2026-08-19" },
        },
      }),
    );
    expect(b.assignedLogistics).toEqual({
      partnerId: PARTNER_NETS,
      partnerName: "NETS",
    });
    expect(b.stockEtaIso).toBe("2026-08-19");
    expect(b.appointment.dateIso).toBe("2026-08-22");
    expect(b.appointment.slot).toBe("Morning (9am–12pm)");
    expect(b.appointment.carrier.partnerName).toBe("NETS");
    expect(b.appointment.scopeLabel).toBe("Bed set");
    // Rule 5 — the promised deadline is a separate date and it never moves.
    expect(b.promisedDateIso).toBe("2026-08-20");
    expect(b.carrierDrift).toBe(false);
    expect(b.contactWindow).toBe("done");
  });

  it("shows the drift when logistics was reassigned after the customer agreed", async () => {
    const b = await brief(
      makeSb({
        lines: [{ sku: MATTRESS, qty: 1 }],
        order: { ops_assigned_logistic: PARTNER_HOUZS },
        control: {
          booking_stage: "confirmed",
          confirmed_date: "2026-08-22",
          confirmed_time_slot: "Morning (9am–12pm)",
          confirmed_partner_id: PARTNER_NETS,
        },
      }),
    );
    expect(b.assignedLogistics.partnerName).toBe("HOUZS");
    expect(b.appointment.carrier.partnerName).toBe("NETS");
    expect(b.carrierDrift).toBe(true);
  });
});

describe("CARD 3 · the call window is the SETTING, never a second copy", () => {
  it("moves the due date when logistics_call_working_days moves", async () => {
    const b = await brief(
      makeSb({ lines: [{ sku: MATTRESS, qty: 1 }], callDays: 5 }),
    );
    // 5 working days before Thu 20 Aug on the Mon–Sat delivery week = Fri 14.
    expect(b.contactDueIso).toBe("2026-08-14");
  });

  it("a TBD promised date has no anchor and is never late", async () => {
    const b = await brief(
      makeSb({
        lines: [{ sku: MATTRESS, qty: 1 }],
        order: { delivery_date_tbd: true },
      }),
    );
    expect(b.promisedDateIso).toBeNull();
    expect(b.contactDueIso).toBeNull();
    expect(b.contactWindow).toBe("no_anchor");
    expect(b.contactOverdue).toBe(false);
  });
});
