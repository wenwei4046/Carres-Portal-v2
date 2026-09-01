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

async function makeJwt(role: string, warehouseId?: string) {
  return new SignJWT({
    email: `${role}@x`,
    app_metadata: { role, ...(warehouseId ? { warehouse_id: warehouseId } : {}) },
  })
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

async function call(path: string, role: string, init?: RequestInit, warehouseId?: string) {
  const jwt = await makeJwt(role, warehouseId);
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

describe("GET /warehouse-schedule — Delivery's read-only feed", () => {
  it("projects one assigned exact Unit onto the real Saturday pickup with Friday readiness", async () => {
    const { inserts, upserts } = mockSb([
      {
        data: [{
          id: "arr-1",
          order_id: ORDER_A,
          leg: 0,
          partner_id: NETS,
          confirmed_date: "2026-09-05",
          confirmed_time: "Morning (9am–12pm)",
          expected_arrival: "11:00:00",
          logistics_note: null,
          reply_proof_path: "arrangements/arr-1/reply.jpg",
          driver_name: "Ahmad",
          vehicle: "VAN-7",
          updated_at: "2026-09-01T00:00:00Z",
          updated_by: "user-1",
          delivery_partners: { id: NETS, name: "NETS" },
        }],
      },
      {
        data: [{
          id: ORDER_A,
          so: 1322,
          customer_address: "12 Jalan Meru, Klang",
          delivered_at: null,
          do_file_path: null,
          pod_signature_url: null,
        }],
      },
      {
        data: [{
          id: "do-1",
          order_id: ORDER_A,
          do_number: "DO-010926-1322",
          trip_groups: null,
          voided_at: null,
        }],
      },
      {
        data: [{
          unit_code: "CAR-000123",
          warehouse_id: "wh-1",
          reserved_ref: "SO-1322",
          sold_order_id: null,
        }],
      },
      { data: [] },
      { data: [{ id: "wh-1", name: "Carres Klang" }] },
      { data: [] },
    ]);

    const res = await call("/warehouse-schedule", "operation");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: Array<Record<string, unknown>> };
    expect(body.events).toHaveLength(2);
    expect(body.events[0]).toMatchObject({
      title: "Customer delivery pickup",
      unitId: "CAR-000123",
      eventDate: "2026-09-05",
      operationsReadyBy: "2026-09-04",
      fromLocation: "Carres Klang",
      toCustomer: "12 Jalan Meru, Klang",
      logisticsPartner: "NETS",
      driverName: "Ahmad",
      vehicle: "VAN-7",
      doNumber: "DO-010926-1322",
      actualCollectionAt: null,
      hasEvidence: false,
      custody: null,
      deliveryOrderHref: "/operation/delivery-orders/DO-010926-1322",
    });
    expect(body.events[1]).toMatchObject({
      title: "Customer handover",
      eventDate: "2026-09-05",
      unitId: "CAR-000123",
    });
    expect(inserts).toEqual([]);
    expect(upserts).toEqual([]);
  });

  it("does not expose the internal Warehouse feed to a Partner role", async () => {
    mockSb([]);
    const res = await call("/warehouse-schedule", "partner");
    expect(res.status).toBe(403);
  });

  it("lets a Warehouse login read only exact Units physically assigned to its own Warehouse", async () => {
    mockSb([
      {
        data: [{
          id: "arr-1",
          order_id: ORDER_A,
          leg: 0,
          partner_id: NETS,
          confirmed_date: "2026-09-05",
          confirmed_time: "Morning (9am–12pm)",
          expected_arrival: "11:00:00",
          logistics_note: "internal note must not ride the projection",
          reply_proof_path: null,
          driver_name: "Ahmad",
          vehicle: "VAN-7",
          updated_at: "2026-09-01T00:00:00Z",
          updated_by: "user-1",
          delivery_partners: { id: NETS, name: "NETS" },
        }],
      },
      {
        data: [{
          id: ORDER_A,
          so: 1322,
          customer_address: "12 Jalan Meru, Klang",
          delivered_at: null,
          do_file_path: null,
          pod_signature_url: null,
        }],
      },
      {
        data: [{
          id: "do-1",
          order_id: ORDER_A,
          do_number: "DO-010926-1322",
          trip_groups: null,
          voided_at: null,
        }],
      },
      {
        data: [
          {
            unit_code: "CAR-OWN-001",
            warehouse_id: "wh-own",
            reserved_ref: "SO-1322",
            sold_order_id: null,
          },
          {
            unit_code: "CAR-OTHER-002",
            warehouse_id: "wh-other",
            reserved_ref: "SO-1322",
            sold_order_id: null,
          },
        ],
      },
      { data: [] },
      {
        data: [
          { id: "wh-own", name: "Own Warehouse" },
          { id: "wh-other", name: "Other Warehouse" },
        ],
      },
      { data: [] },
    ]);

    const res = await call("/warehouse-schedule", "warehouse", undefined, "wh-own");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: Array<Record<string, unknown>> };
    expect(body.events).toHaveLength(2);
    expect(new Set(body.events.map((event) => event.unitId))).toEqual(
      new Set(["CAR-OWN-001"]),
    );
    for (const event of body.events) {
      expect(event).toMatchObject({ driverName: "Ahmad", vehicle: "VAN-7" });
      expect(event).not.toHaveProperty("logisticsNote");
      expect(event).not.toHaveProperty("price");
      expect(event).not.toHaveProperty("payment");
    }
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

describe("POST /:orderId/reply-proof/sign-upload — the reply evidence door (Card 05)", () => {
  const sign = (
    body: unknown,
    path = `/${ORDER_A}/reply-proof/sign-upload?leg=0`,
    role = "operation",
  ) => call(path, role, { method: "POST", body: JSON.stringify(body) });

  function mockStorage() {
    const createSignedUploadUrl = vi.fn().mockImplementation((p: string) =>
      Promise.resolve({ data: { token: "t1", path: p }, error: null }),
    );
    vi.mocked(adminClient).mockReturnValue({
      storage: { from: () => ({ createSignedUploadUrl }) },
    } as never);
    return createSignedUploadUrl;
  }

  it("signs an upload under the arrangement's own key", async () => {
    mockSb([{ data: { id: ORDER_A } }]);
    const createSignedUploadUrl = mockStorage();
    const res = await sign({ mimeType: "image/png", sizeBytes: 1000 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; path: string };
    expect(body.token).toBe("t1");
    expect(createSignedUploadUrl).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^arrangement/${ORDER_A}/0/.+-reply\\.png$`)),
    );
  });

  it("keys a Journey leg's proof under its own leg", async () => {
    mockSb([{ data: { id: ORDER_A } }]);
    const createSignedUploadUrl = mockStorage();
    const res = await sign(
      { mimeType: "image/jpeg", sizeBytes: 1000 },
      `/${ORDER_A}/reply-proof/sign-upload?leg=2`,
    );
    expect(res.status).toBe(200);
    expect(createSignedUploadUrl).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^arrangement/${ORDER_A}/2/.+-reply\\.jpg$`)),
    );
  });

  it("refuses a non-photo mime in words, before any storage call", async () => {
    mockSb([{ data: { id: ORDER_A } }]);
    const createSignedUploadUrl = mockStorage();
    const res = await sign({ mimeType: "application/pdf", sizeBytes: 1000 });
    expect(res.status).toBe(422);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("404s a junk order id without touching the database", async () => {
    const { from } = mockSb([]);
    mockStorage();
    const res = await sign({ mimeType: "image/png", sizeBytes: 1000 }, "/not-a-uuid/reply-proof/sign-upload");
    expect(res.status).toBe(404);
    expect(from).not.toHaveBeenCalled();
  });

  it("404s an order that does not exist", async () => {
    mockSb([{ data: null }]);
    mockStorage();
    const res = await sign({ mimeType: "image/png", sizeBytes: 1000 });
    expect(res.status).toBe(404);
  });

  it("403s a dealer", async () => {
    mockSb([{ data: { id: ORDER_A } }]);
    mockStorage();
    const res = await sign({ mimeType: "image/png", sizeBytes: 1000 }, undefined, "dealer");
    expect(res.status).toBe(403);
  });
});
