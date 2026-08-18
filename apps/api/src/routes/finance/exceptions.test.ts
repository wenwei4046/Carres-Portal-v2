import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { adminClient, userClient } from "../../lib/supabase";

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
  vi.mocked(adminClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

const ORDER_ID = "00000000-0000-0000-0000-0000000fe001";
const EXC_ID = "00000000-0000-0000-0000-0000000fe002";

const OPEN_ROW = {
  id: EXC_ID,
  order_id: ORDER_ID,
  status: "open",
  reason: "Chargeback under investigation",
  opened_at: "2026-08-16T02:00:00Z",
  cleared_at: null,
  clear_evidence: null,
};

/** Mocks the RPC surface and the one read this router makes. */
function mockSb(opts: {
  rpcRow?: unknown;
  rpcErr?: { code: string; message: string } | null;
  listRows?: unknown[];
  listErr?: { code: string; message: string } | null;
} = {}) {
  const rpc = vi.fn().mockResolvedValue({
    data: opts.rpcRow ?? OPEN_ROW,
    error: opts.rpcErr ?? null,
  });
  const order = vi
    .fn()
    .mockResolvedValue({ data: opts.listRows ?? [OPEN_ROW], error: opts.listErr ?? null });
  const from = vi.fn().mockReturnValue({
    select: () => ({ eq: () => ({ order }) }),
  });
  vi.mocked(userClient).mockReturnValue({ rpc, from } as never);
  return { rpc, from };
}

async function call(
  path: string,
  role: string,
  init: { method?: string; body?: unknown } = {},
) {
  const jwt = await makeJwt(role);
  return app.fetch(
    new Request(`http://t/api/finance/exceptions${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    }),
    env,
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ⭐ FINANCE, AND ONLY FINANCE. The middleware is the readable refusal; the RPC
 * refuses again in the database. This block covers the first.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("only Finance may write", () => {
  it("refuses an operation user opening an exception", async () => {
    mockSb();
    const res = await call("/open", "operation", {
      method: "POST",
      body: { orderId: ORDER_ID, reason: "Chargeback" },
    });
    expect(res.status).toBe(403);
  });

  it("refuses an operation user clearing one", async () => {
    mockSb();
    const res = await call(`/${EXC_ID}/clear`, "operation", {
      method: "POST",
      body: { evidence: "Bank confirmed" },
    });
    expect(res.status).toBe(403);
  });

  it("refuses a dealer outright", async () => {
    mockSb();
    const res = await call("/open", "dealer", {
      method: "POST",
      body: { orderId: ORDER_ID, reason: "Chargeback" },
    });
    expect(res.status).toBe(403);
  });

  it("admits finance", async () => {
    const { rpc } = mockSb();
    const res = await call("/open", "finance", {
      method: "POST",
      body: { orderId: ORDER_ID, reason: "Chargeback under investigation" },
    });
    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("finance_exception_open", {
      p_order_id: ORDER_ID,
      p_reason: "Chargeback under investigation",
    });
  });

  it("admits principal — the go-live fallback, same as every finance route", async () => {
    mockSb();
    const res = await call("/open", "principal", {
      method: "POST",
      body: { orderId: ORDER_ID, reason: "Chargeback under investigation" },
    });
    expect(res.status).toBe(201);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * THE READ IS WIDER THAN THE WRITE — the route canvas has to show WHY.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("any internal role may read", () => {
  it("lets operation read the exceptions on an order", async () => {
    mockSb({ listRows: [OPEN_ROW] });
    const res = await call(`/${ORDER_ID}`, "operation");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([OPEN_ROW]);
  });

  it("returns an empty list rather than an error when nothing is held", async () => {
    mockSb({ listRows: [] });
    const res = await call(`/${ORDER_ID}`, "finance");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * EVIDENCE IS REQUIRED TO CLEAR — refused before it reaches the database.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("clearing costs evidence", () => {
  it("refuses a blank evidence string", async () => {
    const { rpc } = mockSb();
    const res = await call(`/${EXC_ID}/clear`, "finance", {
      method: "POST",
      body: { evidence: "   " },
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a missing evidence field", async () => {
    const { rpc } = mockSb();
    const res = await call(`/${EXC_ID}/clear`, "finance", { method: "POST", body: {} });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("clears with evidence, and passes it through untouched", async () => {
    const { rpc } = mockSb({
      rpcRow: { ...OPEN_ROW, status: "cleared", clear_evidence: "Bank confirmed — ref 8821" },
    });
    const res = await call(`/${EXC_ID}/clear`, "finance", {
      method: "POST",
      body: { evidence: "Bank confirmed — ref 8821" },
    });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("finance_exception_clear", {
      p_id: EXC_ID,
      p_evidence: "Bank confirmed — ref 8821",
    });
  });
});

describe("opening costs a reason", () => {
  it("refuses a blank reason", async () => {
    const { rpc } = mockSb();
    const res = await call("/open", "finance", {
      method: "POST",
      body: { orderId: ORDER_ID, reason: "  " },
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses an orderId that is not a uuid", async () => {
    const { rpc } = mockSb();
    const res = await call("/open", "finance", {
      method: "POST",
      body: { orderId: "SO-1318", reason: "Chargeback" },
    });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * THE DATABASE HAS THE LAST WORD — its refusals reach the caller intact.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("the RPC's own refusals survive the route", () => {
  it("passes the database role refusal through rather than swallowing it", async () => {
    mockSb({ rpcErr: { code: "42501", message: "forbidden: only finance can open" } });
    const res = await call("/open", "principal", {
      method: "POST",
      body: { orderId: ORDER_ID, reason: "Chargeback" },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("passes a double-clear refusal through", async () => {
    mockSb({ rpcErr: { code: "P0001", message: "this finance exception is already cleared" } });
    const res = await call(`/${EXC_ID}/clear`, "finance", {
      method: "POST",
      body: { evidence: "Bank confirmed" },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * SLICE 2 — CLEARING THE HOLD MAY COMPLETE THE GATE, AND THEN THE SYSTEM
 * ISSUES THE DOCUMENT. The attempt runs on the ADMIN client: Finance may clear
 * its exception, but the system — not the finance user — writes the document.
 * FAIL-SOFT: an issuance hiccup never undoes the clear Finance just recorded.
 * ──────────────────────────────────────────────────────────────────────────── */

type Result = { data: unknown; error: unknown };

function issueTableMock(read: Result) {
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

function issueOrdersMock(read: Result, afterUpdate: Result) {
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

describe("Slice 2 — a clear that completes the gate issues the delivery order", () => {
  const MATTRESS = "mattress:FirmCare-K";
  const CLEARED_ROW = {
    ...OPEN_ROW,
    status: "cleared",
    cleared_at: "2026-08-17T03:00:00Z",
    clear_evidence: "Bank confirmed — ref 8821",
  };

  function adminTables(over?: { doNumber?: string | null }) {
    return {
      orders: issueOrdersMock(
        {
          data: { id: ORDER_ID, so: 1234, paid: 0, do_number: over?.doNumber ?? null },
          error: null,
        },
        { data: { id: ORDER_ID, do_number: "DO-170826-1234" }, error: null },
      ),
      order_lines: issueTableMock({
        data: [{ sku: MATTRESS, qty: 1, unit_price: 2500 }],
        error: null,
      }),
      order_addons: issueTableMock({ data: [], error: null }),
      ops_order_control: issueTableMock({
        data: {
          line_received: { [MATTRESS]: 1 },
          balance: null,
          booking_stage: "confirmed",
          confirmed_date: "2026-08-24",
          confirmed_time_slot: "Afternoon (12pm–3pm)",
          booking_groups: null,
        },
        error: null,
      }),
      ops_stock_items: issueTableMock({ data: [], error: null }),
      order_finance_exceptions: issueTableMock({ data: [CLEARED_ROW], error: null }),
      ops_delivery_orders: issueTableMock({ data: [], error: null }),
    };
  }

  function mockAdmin(tables: Record<string, unknown>) {
    const from = vi.fn((t: string) => {
      const b = tables[t];
      if (!b) throw new Error(`unmocked table ${t}`);
      return b;
    });
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(adminClient).mockReturnValue({ from, rpc } as never);
    return { from, rpc };
  }

  it("⭐ the SYSTEM issues on the admin client after the clear — no press, no release button", async () => {
    mockSb({ rpcRow: CLEARED_ROW });
    const t = adminTables();
    mockAdmin(t);
    const res = await call(`/${EXC_ID}/clear`, "finance", {
      method: "POST",
      body: { evidence: "Bank confirmed — ref 8821" },
    });
    expect(res.status).toBe(200);
    // The attempt ran as the system, wrote only into an empty column, and
    // stamped the LOCKED scheme's number.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((t.orders as any).update).toHaveBeenCalledWith({
      do_number: expect.stringMatching(/^DO-\d{6}-\d{4}$/),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((t.orders as any).is).toHaveBeenCalledWith("do_number", null);
  });

  it("an order already carrying its number is left alone — one trip, one document", async () => {
    mockSb({ rpcRow: CLEARED_ROW });
    const t = adminTables({ doNumber: "DO-240826-4821" });
    mockAdmin(t);
    const res = await call(`/${EXC_ID}/clear`, "finance", {
      method: "POST",
      body: { evidence: "Bank confirmed — ref 8821" },
    });
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((t.orders as any).update).not.toHaveBeenCalled();
  });

  it("FAIL-SOFT — an issuance hiccup never undoes the clear (admin client absent)", async () => {
    // adminClient is reset and returns undefined: the attempt throws inside
    // the hook and is swallowed; the clear itself must still answer 200.
    mockSb({ rpcRow: CLEARED_ROW });
    const res = await call(`/${EXC_ID}/clear`, "finance", {
      method: "POST",
      body: { evidence: "Bank confirmed — ref 8821" },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("cleared");
  });
});
