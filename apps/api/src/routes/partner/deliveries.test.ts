/**
 * THE PARTNER'S OWN DELIVERY SCREEN — the boundary, held as tests.
 * Delivery Card 07 (0413) · `docs/delivery/MASTER.md` §5 + §13.
 *
 * What matters here is who CANNOT do what: another partner's scope answers
 * 404 (not 403 — "not yours" and "does not exist" must be the same answer),
 * a non-partner role is refused outright, and Cannot Deliver cannot be a
 * shrug (a reason always, a note when the reason is `other`).
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

const ME = "11111111-1111-1111-1111-aaaaaaaaaaaa";
const OTHER = "11111111-1111-1111-1111-bbbbbbbbbbbb";
const ORDER_A = "00000000-0000-0000-0000-0000000a0001";

async function makeJwt(role: string, partnerId?: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role, partner_id: partnerId } })
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

/** Queue-driven chain mock: table order = query order in the route. */
function mockAdmin(results: Array<{ data?: unknown; error?: unknown }>) {
  const queue = [...results];
  const inserts: Array<{ table: string; rows: unknown }> = [];
  const upserts: Array<{ table: string; rows: unknown }> = [];
  const from = vi.fn().mockImplementation((table: string) => {
    const res = queue.shift() ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ["select", "eq", "neq", "is", "in", "order", "limit", "maybeSingle", "single"]) {
      chain[m] = vi.fn().mockImplementation(self);
    }
    chain.insert = vi.fn().mockImplementation((rows: unknown) => {
      inserts.push({ table, rows });
      return chain;
    });
    chain.upsert = vi.fn().mockImplementation((rows: unknown) => {
      upserts.push({ table, rows });
      return chain;
    });
    (chain as { then: unknown }).then = (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown,
    ) => Promise.resolve({ data: res.data ?? null, error: res.error ?? null }).then(resolve, reject);
    return chain;
  });
  vi.mocked(adminClient).mockReturnValue({ from } as never);
  return { from, inserts, upserts };
}

async function call(path: string, role: string, partnerId?: string, init?: RequestInit) {
  const jwt = await makeJwt(role, partnerId);
  return app.fetch(
    new Request(`http://t/api/partner/deliveries${path === "/" ? "" : path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    }),
    env,
  );
}

const PARTNER_ROW = { data: { id: ME, name: "NETS" } };

const ORDER_ROW = {
  id: ORDER_A,
  status: "proceed_order",
  customer_name: "kong chai yin",
  customer_phone: "0162389000",
  customer_address_city: "Klang",
  customer_address_state: "Selangor",
  building_type: "Landed",
  delivery_date: "2026-09-05",
  delivery_date_tbd: false,
  delivered_at: null,
  do_number: null,
  delivery_partner_id: ME,
  ops_assigned_logistic: null,
  order_lines: [{ sku: "mattress:M1401F-K", qty: 1 }],
};

describe("the role boundary", () => {
  it("refuses operation, dealer and a partner token without partner_id", async () => {
    for (const [role, pid] of [
      ["operation", undefined],
      ["dealer", undefined],
      ["partner", undefined],
    ] as const) {
      mockAdmin([PARTNER_ROW]);
      const res = await call("/", role, pid);
      expect(res.status).toBe(403);
    }
  });
});

describe("GET / — only MY deliveries", () => {
  it("lists the scope my arrangement carries, and the auto-assigned order without one", async () => {
    mockAdmin([
      PARTNER_ROW,
      // arrangements where partner_id = me
      {
        data: [
          {
            id: "arr-1",
            order_id: ORDER_A,
            leg: 0,
            partner_id: ME,
            confirmed_date: "2026-09-05",
            confirmed_time: "2pm–5pm",
            expected_arrival: "14:30:00",
            logistics_note: null,
          },
        ],
      },
      // live orders
      { data: [ORDER_ROW] },
      // events
      { data: [] },
    ]);
    const res = await call("/", "partner", ME);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { partner: string; deliveries: Array<Record<string, unknown>> };
    expect(body.partner).toBe("NETS");
    expect(body.deliveries).toHaveLength(1);
    expect(body.deliveries[0]!.customerName).toBe("kong chai yin");
    expect(body.deliveries[0]!.expectedArrival).toBe("14:30");
  });

  it("shows an auto-assigned Klang Valley order that has no arrangement row yet", async () => {
    mockAdmin([
      PARTNER_ROW,
      { data: [] }, // no arrangements yet
      { data: [ORDER_ROW] }, // delivery_partner_id = me
      { data: [] },
    ]);
    const res = await call("/", "partner", ME);
    const body = (await res.json()) as { deliveries: Array<Record<string, unknown>> };
    expect(body.deliveries).toHaveLength(1);
    expect(body.deliveries[0]!.confirmedDate).toBeNull();
  });

  it("hides another partner's order entirely", async () => {
    mockAdmin([
      PARTNER_ROW,
      { data: [] },
      { data: [{ ...ORDER_ROW, delivery_partner_id: OTHER }] },
      { data: [] },
    ]);
    const res = await call("/", "partner", ME);
    const body = (await res.json()) as { deliveries: unknown[] };
    expect(body.deliveries).toHaveLength(0);
  });

  it("marks a scope whose latest event is Cannot Deliver", async () => {
    mockAdmin([
      PARTNER_ROW,
      { data: [] },
      { data: [ORDER_ROW] },
      {
        data: [
          { order_id: ORDER_A, leg: 0, event: "cannot_deliver", recorded_at: "2026-09-02T00:00:00Z" },
          { order_id: ORDER_A, leg: 0, event: "assigned", recorded_at: "2026-09-01T00:00:00Z" },
        ],
      },
    ]);
    const res = await call("/", "partner", ME);
    const body = (await res.json()) as { deliveries: Array<Record<string, unknown>> };
    expect(body.deliveries[0]!.cannotDeliverReported).toBe(true);
  });
});

describe("PUT /:orderId/arrangement — Save Delivery Arrangement", () => {
  const save = (body: unknown, partnerId = ME) =>
    call(`/${ORDER_A}/arrangement?leg=0`, "partner", partnerId, {
      method: "PUT",
      body: JSON.stringify(body),
    });

  it("saves my scope and leaves a history line", async () => {
    const { upserts, inserts } = mockAdmin([
      PARTNER_ROW,
      { data: { id: "arr-1", order_id: ORDER_A, leg: 0, partner_id: ME } }, // arrangement
      { data: ORDER_ROW }, // order
      { data: null }, // upsert result
      { data: null }, // history insert
    ]);
    const res = await save({ confirmedDate: "2026-09-05", confirmedTime: "2pm–5pm" });
    expect(res.status).toBe(200);
    expect(upserts).toHaveLength(1);
    const row = upserts[0]!.rows as Record<string, unknown>;
    expect(row.partner_id).toBe(ME); // the partner can never move the partner
    expect(row.confirmed_date).toBe("2026-09-05");
    expect(inserts.some((i) => i.table === "order_history")).toBe(true);
  });

  it("404s a scope another partner carries", async () => {
    const { upserts } = mockAdmin([
      PARTNER_ROW,
      { data: { id: "arr-1", order_id: ORDER_A, leg: 0, partner_id: OTHER } },
      { data: { ...ORDER_ROW, delivery_partner_id: OTHER } },
    ]);
    const res = await save({ confirmedDate: "2026-09-05" });
    expect(res.status).toBe(404);
    expect(upserts).toHaveLength(0);
  });

  it("refuses a field outside the partner's subset", async () => {
    mockAdmin([PARTNER_ROW]);
    const res = await save({ confirmedDate: "2026-09-05", partnerId: OTHER });
    expect(res.status).toBe(422);
  });
});

describe("POST /:orderId/cannot-deliver — a report, never a shrug", () => {
  const report = (body: unknown) =>
    call(`/${ORDER_A}/cannot-deliver?leg=0`, "partner", ME, {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("records the governed reason as an append-only event + history line", async () => {
    const { inserts } = mockAdmin([
      PARTNER_ROW,
      { data: { id: "arr-1", order_id: ORDER_A, leg: 0, partner_id: ME } },
      { data: ORDER_ROW },
      { data: null }, // event insert
      { data: null }, // history insert
    ]);
    const res = await report({ reason: "customer_unreachable" });
    expect(res.status).toBe(200);
    const ev = inserts.find((i) => i.table === "ops_delivery_arrangement_events");
    expect(ev).toBeDefined();
    const row = ev!.rows as Record<string, unknown>;
    expect(row.event).toBe("cannot_deliver");
    expect(row.reason_key).toBe("customer_unreachable");
    expect(row.order_id).toBe(ORDER_A);
    expect(inserts.some((i) => i.table === "order_history")).toBe(true);
  });

  it("refuses `other` without the note", async () => {
    mockAdmin([PARTNER_ROW]);
    const res = await report({ reason: "other" });
    expect(res.status).toBe(422);
  });

  it("404s another partner's scope", async () => {
    const { inserts } = mockAdmin([
      PARTNER_ROW,
      { data: { id: "arr-1", order_id: ORDER_A, leg: 0, partner_id: OTHER } },
      { data: { ...ORDER_ROW, delivery_partner_id: OTHER } },
    ]);
    const res = await report({ reason: "no_capacity" });
    expect(res.status).toBe(404);
    expect(inserts).toHaveLength(0);
  });
});
