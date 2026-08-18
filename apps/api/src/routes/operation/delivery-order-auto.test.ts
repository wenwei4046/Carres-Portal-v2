/**
 * SLICE 2 — the delivery order issues ITSELF at the booking-confirm door.
 *
 * `docs/orders/MASTER.md` §8: "When every requirement is met the SYSTEM issues
 * the DO. There is no Release button, no Approve button and no manual bypass."
 * For most orders the confirmation is the last requirement to land, so the
 * confirm door attempts the issue in the same request — FAIL-SOFT, because an
 * issuance hiccup must never undo or refuse the booking the operator just
 * recorded.
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
    upsert: vi.fn(() => b),
    order: vi.fn(() => b),
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

const ORDER_ID = "00000000-0000-0000-0000-00000000030a";
const PARTNER_ID = "00000000-0000-0000-0000-0000000d00d1";
const MATTRESS = "mattress:FirmCare-K";
const OK_BODY = {
  confirmedDate: "2026-08-24", // Monday — a working day
  confirmedTimeSlot: "Afternoon (12pm–3pm)",
};
const URL = `http://t/api/operation/orders/${ORDER_ID}/booking/confirm`;
const DO_NUMBER = docNumber({
  prefix: "DO",
  date: new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10),
  seed: ORDER_ID,
  digits: 4,
});

function post(jwt: string) {
  return app.fetch(
    new Request(URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(OK_BODY),
    }),
    env,
  );
}

/** A fully qualifying order: goods received against the line, carrier
 *  assigned, and — decision A — RM 2,500 still owing on purpose. */
function tables(over?: {
  financeExceptions?: Array<Record<string, unknown>>;
  omitFinanceTable?: boolean;
  /** Card §6 — the order already carries this ACTIVE document number. */
  orderDoNumber?: string | null;
  /** The active document's row (0356) and its recorded runs, for the
   *  rebooked-trip supersede path. */
  documentRow?: Record<string, unknown> | null;
  attemptRows?: Array<Record<string, unknown>>;
}) {
  const control = {
    order_id: ORDER_ID,
    line_received: { [MATTRESS]: 1 },
    balance: null,
    booking_stage: "confirmed",
    confirmed_date: OK_BODY.confirmedDate,
    confirmed_time_slot: OK_BODY.confirmedTimeSlot,
    booking_groups: null,
  };
  const t: Record<string, ReturnType<typeof tableMock>> = {
    orders: ordersMock(
      {
        data: {
          id: ORDER_ID,
          so: 1234,
          paid: 0,
          do_number: over?.orderDoNumber ?? null,
          ops_assigned_logistic: PARTNER_ID,
        },
        error: null,
      },
      { data: { id: ORDER_ID, do_number: DO_NUMBER }, error: null },
    ),
    order_lines: tableMock({
      data: [{ sku: MATTRESS, qty: 1, unit_price: 2500 }],
      error: null,
    }),
    order_addons: tableMock({ data: [], error: null }),
    ops_order_control: tableMock({ data: control, error: null }),
    ops_stock_items: tableMock({ data: [], error: null }),
    // The carrier check is fail-soft; giving it a partner with no rules keeps
    // the response's `partnerWarnings` quiet without faking any rule.
    delivery_partners: tableMock({
      data: {
        id: PARTNER_ID,
        name: "NETS",
        off_days: null,
        blackout_dates: null,
        daily_capacity: null,
        booking_lead_days: null,
      },
      error: null,
    }),
  };
  if (!over?.omitFinanceTable) {
    t.order_finance_exceptions = tableMock({
      data: over?.financeExceptions ?? [],
      error: null,
    });
  }
  // The document rows (0356): the supersede path reads the active document by
  // number (maybeSingle) and the repeat-letter lookup reads the order's
  // numbers (list) — one mock answers both shapes.
  t.ops_delivery_orders = tableMock({
    data: over?.documentRow !== undefined ? over.documentRow : [],
    error: null,
  });
  t.delivery_attempts = tableMock({ data: over?.attemptRows ?? [], error: null });
  return t;
}

describe("booking confirm — the door that completes the gate issues the document", () => {
  it("⭐ a qualifying confirmation issues the DO with no further press — over an outstanding balance", async () => {
    const t = tables();
    const sb = makeSb(t);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      deliveryOrder: { do_number: string; issued: boolean } | null;
    };
    expect(body.deliveryOrder).toEqual({ do_number: DO_NUMBER, issued: true });
    expect(t.orders.update).toHaveBeenCalledWith({ do_number: DO_NUMBER });
    // Idempotent at the DATABASE — the mint writes only into an empty column.
    expect(t.orders.is).toHaveBeenCalledWith("do_number", null);
  });

  it("an OPEN Finance exception keeps the document unissued — and never the confirmation", async () => {
    const t = tables({
      financeExceptions: [
        {
          id: "00000000-0000-0000-0000-0000000fe00e",
          status: "open",
          reason: "Chargeback under investigation",
          opened_at: "2026-08-16T02:00:00Z",
          cleared_at: null,
          clear_evidence: null,
        },
      ],
    });
    const sb = makeSb(t);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"));
    // The booking succeeded; the gate simply is not complete yet.
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deliveryOrder: unknown };
    expect(body.deliveryOrder).toBeNull();
    expect(t.orders.update).not.toHaveBeenCalled();
  });

  it("⭐ card §6 — a rebooked trip voids the un-run document (rescheduled) and mints anew", async () => {
    const OLD = "DO-170826-9999";
    const t = tables({
      orderDoNumber: OLD,
      documentRow: {
        id: "00000000-0000-0000-0000-0000000d0aaa",
        do_number: OLD,
        delivery_date: "2026-08-20", // the OLD booking — differs from OK_BODY
        time_slot: "Morning (9am–12pm)",
        voided_at: null,
      },
      attemptRows: [], // no run yet — the trip it authorised no longer exists
    });
    const sb = makeSb(t);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"));
    expect(res.status).toBe(200);
    // The ONE void door was used, with the system cause — never a free void.
    expect(sb.rpc).toHaveBeenCalledWith("delivery_order_void", {
      p_do_id: "00000000-0000-0000-0000-0000000d0aaa",
      p_reason: "rescheduled",
    });
    // The mirror emptied so the idempotent mint can write the new number.
    expect(t.orders.update).toHaveBeenCalledWith({ do_number: null });
  });

  it("card §6 — a FAILED document is never voided; it keeps its exception and simply stops being active", async () => {
    const OLD = "DO-170826-9999";
    const t = tables({
      orderDoNumber: OLD,
      documentRow: {
        id: "00000000-0000-0000-0000-0000000d0aaa",
        do_number: OLD,
        delivery_date: "2026-08-20",
        time_slot: "Morning (9am–12pm)",
        voided_at: null,
      },
      attemptRows: [{ result: "failed" }],
    });
    const sb = makeSb(t);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"));
    expect(res.status).toBe(200);
    // NOT voided — the exception is history, forever.
    expect(sb.rpc).not.toHaveBeenCalledWith(
      "delivery_order_void",
      expect.anything(),
    );
    // But it stops being the active number, making way for the new document.
    expect(t.orders.update).toHaveBeenCalledWith({ do_number: null });
  });

  it("FAIL-SOFT — an issuance hiccup never costs the operator their recorded booking", async () => {
    // The finance table is not mocked at all, so the attempt throws inside
    // the hook. The confirmation must still return 200 with its control row.
    const t = tables({ omitFinanceTable: true });
    const sb = makeSb(t);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await post(await makeJwt("operation"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deliveryOrder: unknown };
    expect(body.deliveryOrder).toBeNull();
    expect(t.orders.update).not.toHaveBeenCalled();
  });
});
