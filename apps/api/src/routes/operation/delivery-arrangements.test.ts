import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));
import { adminClient, userClient } from "../../lib/supabase";

/**
 * THE ARRANGEMENT DOORS (0379) — and the one rule they exist to enforce:
 *
 *   "Never silently replace an existing Logistics Partner. Changing an existing
 *    Partner uses governed `Change logistics`, requiring reason and history."
 *
 * Every test below is about that sentence or about the boundary it protects:
 * a Sales-owned fact must not be writable from Delivery.
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

const ORDER_A = "00000000-0000-0000-0000-0000000a0001";
const ORDER_B = "00000000-0000-0000-0000-0000000a0002";
const NETS = "00000000-0000-0000-0000-0000000b0001";
const AL = "00000000-0000-0000-0000-0000000b0002";

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

/** Records every insert so a test can assert what the history actually got. */
function mockSb(results: Array<{ data?: unknown; error?: unknown }>) {
  const queue = [...results];
  const inserts: Array<{ table: string; rows: unknown }> = [];
  const upserts: Array<{ table: string; rows: unknown }> = [];
  const from = vi.fn().mockImplementation((table: string) => {
    const res = queue.shift() ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ["select", "eq", "in", "order", "limit", "maybeSingle", "single"]) {
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
    ) =>
      Promise.resolve({ data: res.data ?? null, error: res.error ?? null }).then(resolve, reject);
    return chain;
  });
  vi.mocked(userClient).mockReturnValue({ from } as never);
  vi.mocked(adminClient).mockReturnValue({ from } as never);
  return { from, inserts, upserts };
}

async function call(path: string, role: string, init?: RequestInit) {
  const jwt = await makeJwt(role);
  return app.fetch(
    new Request(`http://t/api/operation/delivery-arrangements${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    }),
    env,
  );
}

const assign = (body: unknown, role = "operation") =>
  call("/assign", role, { method: "POST", body: JSON.stringify(body) });

describe("POST /assign — one partner onto one or many scopes", () => {
  it("assigns a partner to a scope that has none, with no reason required", async () => {
    const { inserts, upserts } = mockSb([
      { data: { id: NETS, name: "NETS" } }, // partner lookup
      { data: [] }, // existing arrangements
      { data: [{ id: ORDER_A, delivery_partner_id: null, ops_assigned_logistic: null }] },
      { data: { id: "arr-1" } }, // upsert returning
      { data: null }, // history insert
    ]);
    const res = await assign({ scopes: [{ orderId: ORDER_A, leg: 0 }], partnerId: NETS });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { assigned: number; results: Array<{ event: string }> };
    expect(body.assigned).toBe(1);
    expect(body.results[0]?.event).toBe("assigned");
    // The history row is written in the SAME request that moved the carrier.
    const history = inserts.find((i) => i.table === "ops_delivery_arrangement_events");
    expect(history).toBeTruthy();
    expect((history?.rows as { reason_key: string | null }).reason_key).toBeNull();
    expect(upserts.some((u) => u.table === "ops_delivery_arrangements")).toBe(true);
  });

  it("⭐ REFUSES to replace an existing partner without a reason, and names the scopes", async () => {
    mockSb([
      { data: { id: AL, name: "AL" } },
      { data: [{ id: "arr-1", order_id: ORDER_A, leg: 0, partner_id: NETS }] },
      { data: [{ id: ORDER_A, delivery_partner_id: null, ops_assigned_logistic: null }] },
    ]);
    const res = await assign({ scopes: [{ orderId: ORDER_A, leg: 0 }], partnerId: AL });
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      code: string;
      scopes: Array<{ orderId: string; leg: number }>;
    };
    expect(body.code).toBe("change_needs_reason");
    // "some of these already have a carrier" is not actionable — say WHICH.
    expect(body.scopes).toEqual([{ orderId: ORDER_A, leg: 0 }]);
  });

  it("⭐ a carrier that arrived through Sales' own door still counts as existing", async () => {
    // Otherwise every partner set at Accept Proceed could be replaced without a
    // reason exactly once — the hole the ruling closes.
    mockSb([
      { data: { id: AL, name: "AL" } },
      { data: [] }, // no arrangement row yet
      { data: [{ id: ORDER_A, delivery_partner_id: NETS, ops_assigned_logistic: null }] },
    ]);
    const res = await assign({ scopes: [{ orderId: ORDER_A, leg: 0 }], partnerId: AL });
    expect(res.status).toBe(409);
  });

  it("accepts the replacement once a governed reason rides along, and records it", async () => {
    const { inserts } = mockSb([
      { data: { id: AL, name: "AL" } },
      { data: [{ id: "arr-1", order_id: ORDER_A, leg: 0, partner_id: NETS }] },
      { data: [{ id: ORDER_A, delivery_partner_id: null, ops_assigned_logistic: null }] },
      { data: { id: "arr-1" } },
      { data: null },
    ]);
    const res = await assign({
      scopes: [{ orderId: ORDER_A, leg: 0 }],
      partnerId: AL,
      reason: "partner_capacity_full",
    });
    expect(res.status).toBe(200);
    const history = inserts.find((i) => i.table === "ops_delivery_arrangement_events");
    const row = history?.rows as { event: string; reason_key: string; from_partner_id: string };
    expect(row.event).toBe("changed");
    expect(row.reason_key).toBe("partner_capacity_full");
    expect(row.from_partner_id).toBe(NETS);
  });

  it("refuses the WHOLE request when only one of many scopes would be overwritten", async () => {
    // All or nothing: a partly-applied assignment across many scopes is a state
    // the operator cannot read back off the screen.
    mockSb([
      { data: { id: AL, name: "AL" } },
      { data: [{ id: "arr-1", order_id: ORDER_B, leg: 0, partner_id: NETS }] },
      {
        data: [
          { id: ORDER_A, delivery_partner_id: null, ops_assigned_logistic: null },
          { id: ORDER_B, delivery_partner_id: null, ops_assigned_logistic: null },
        ],
      },
    ]);
    const res = await assign({
      scopes: [
        { orderId: ORDER_A, leg: 0 },
        { orderId: ORDER_B, leg: 0 },
      ],
      partnerId: AL,
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { scopes: Array<{ orderId: string }> };
    expect(body.scopes).toHaveLength(1);
    expect(body.scopes[0]?.orderId).toBe(ORDER_B);
  });

  it("⭐ a Journey LEG inherits no carrier from the order-level column", async () => {
    // The Sales column was never leg 2's carrier, so assigning one is a first
    // assignment and must not demand a reason.
    const { inserts } = mockSb([
      { data: { id: AL, name: "AL" } },
      { data: [] },
      { data: [{ id: ORDER_A, delivery_partner_id: NETS, ops_assigned_logistic: null }] },
      { data: { id: "arr-leg2" } },
      { data: null },
    ]);
    const res = await assign({ scopes: [{ orderId: ORDER_A, leg: 2 }], partnerId: AL });
    expect(res.status).toBe(200);
    const row = inserts.find((i) => i.table === "ops_delivery_arrangement_events")?.rows as {
      event: string;
    };
    expect(row.event).toBe("assigned");
  });

  it("re-picking the partner a scope already has writes no history line", async () => {
    const { inserts } = mockSb([
      { data: { id: NETS, name: "NETS" } },
      { data: [{ id: "arr-1", order_id: ORDER_A, leg: 0, partner_id: NETS }] },
      { data: [{ id: ORDER_A, delivery_partner_id: null, ops_assigned_logistic: null }] },
    ]);
    const res = await assign({ scopes: [{ orderId: ORDER_A, leg: 0 }], partnerId: NETS });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { assigned: number }).assigned).toBe(0);
    expect(inserts.filter((i) => i.table === "ops_delivery_arrangement_events")).toHaveLength(0);
  });

  it("refuses a partner that does not exist", async () => {
    mockSb([{ data: null }]);
    const res = await assign({ scopes: [{ orderId: ORDER_A, leg: 0 }], partnerId: NETS });
    expect(res.status).toBe(404);
  });

  it("refuses an empty scope list", async () => {
    mockSb([]);
    const res = await assign({ scopes: [], partnerId: NETS });
    expect(res.status).toBe(400);
  });

  it("refuses a role outside operation/principal", async () => {
    mockSb([]);
    const res = await assign({ scopes: [{ orderId: ORDER_A, leg: 0 }], partnerId: NETS }, "supplier");
    expect(res.status).toBe(403);
  });
});

describe("PUT /:orderId — Save Delivery", () => {
  const save = (body: unknown, path = `/${ORDER_A}`) =>
    call(path, "operation", { method: "PUT", body: JSON.stringify(body) });

  it("saves the Delivery-owned fields for a scope", async () => {
    const { upserts } = mockSb([
      { data: { id: ORDER_A } },
      { data: [] },
      { data: [{ id: ORDER_A, delivery_partner_id: null, ops_assigned_logistic: null }] },
      {
        data: {
          id: "arr-1",
          order_id: ORDER_A,
          leg: 0,
          partner_id: NETS,
          confirmed_date: "2026-08-28",
          confirmed_time: "Afternoon (12pm–3pm)",
          expected_arrival: "14:30:00",
          logistics_note: null,
          reply_proof_path: null,
          driver_name: null,
          vehicle: null,
          updated_at: "2026-08-24T00:00:00Z",
          updated_by: null,
          delivery_partners: { id: NETS, name: "NETS" },
        },
      },
      { data: null },
    ]);
    const res = await save({
      partnerId: NETS,
      confirmedDate: "2026-08-28",
      confirmedTime: "Afternoon (12pm–3pm)",
      expectedArrival: "14:30",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { arrangement: { expected_arrival: string } };
    // `14:30:00` from Postgres is trimmed once, in the route.
    expect(body.arrangement.expected_arrival).toBe("14:30");
    const row = upserts.find((u) => u.table === "ops_delivery_arrangements")?.rows as {
      confirmed_date: string;
    };
    expect(row.confirmed_date).toBe("2026-08-28");
  });

  it("⭐ a Sales-owned fact cannot be written from Delivery", async () => {
    const { upserts } = mockSb([
      { data: { id: ORDER_A } },
      { data: [] },
      { data: [{ id: ORDER_A, delivery_partner_id: null, ops_assigned_logistic: null }] },
      {
        data: {
          id: "arr-1",
          order_id: ORDER_A,
          leg: 0,
          partner_id: null,
          confirmed_date: null,
          confirmed_time: null,
          expected_arrival: null,
          logistics_note: null,
          reply_proof_path: null,
          driver_name: null,
          vehicle: null,
          updated_at: "2026-08-24T00:00:00Z",
          updated_by: null,
        },
      },
    ]);
    const res = await save({
      confirmedDate: "2026-08-28",
      // Every one of these belongs to Sales Orders. The schema has no field for
      // them, so they must not reach the database by any route.
      customer_name: "SOMEBODY ELSE",
      delivery_date: "2026-12-25",
      customer_address_city: "Nowhere",
    });
    expect(res.status).toBe(200);
    const row = upserts.find((u) => u.table === "ops_delivery_arrangements")?.rows as Record<
      string,
      unknown
    >;
    expect(row).not.toHaveProperty("customer_name");
    expect(row).not.toHaveProperty("delivery_date");
    expect(row).not.toHaveProperty("customer_address_city");
  });

  it("refuses a partner change without its reason", async () => {
    mockSb([
      { data: { id: ORDER_A } },
      { data: [{ id: "arr-1", order_id: ORDER_A, leg: 0, partner_id: NETS }] },
      { data: [{ id: ORDER_A, delivery_partner_id: null, ops_assigned_logistic: null }] },
    ]);
    const res = await save({ partnerId: AL });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("change_needs_reason");
  });

  it("refuses a confirmed date that is not a date", async () => {
    mockSb([]);
    const res = await save({ confirmedDate: "next Friday" });
    expect(res.status).toBe(400);
  });

  it("refuses an unknown leg", async () => {
    mockSb([]);
    const res = await save({ confirmedDate: "2026-08-28" }, `/${ORDER_A}?leg=99`);
    expect(res.status).toBe(400);
  });
});
