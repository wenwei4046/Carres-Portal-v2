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

/** The one responsibility read (0499) the contact writer asks before it
 *  writes — a test sets who is responsible and who is acting today. */
const responsibility = { normal_user_id: null as string | null, acting_user_id: null as string | null, source: "not_assigned" };

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
  const rpc = vi.fn().mockImplementation(async (name: string) =>
    name === "delivery_responsible_operation"
      ? { data: { ...responsibility }, error: null }
      : { data: null, error: null });
  vi.mocked(userClient).mockReturnValue({ from, rpc } as never);
  vi.mocked(adminClient).mockReturnValue({ from, rpc } as never);
  return { from, inserts, upserts, rpc };
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

describe("GET / — every arrangement, every contact, every Cannot Deliver (Card 17)", () => {
  it("carries the Cannot Deliver records for the central Delivery report", async () => {
    mockSb([
      { data: [] }, // arrangements
      { data: [] }, // contacts
      { data: [{ id: "e1", order_id: ORDER_A, leg: 0, from_partner_id: NETS, reason_key: "no_capacity", note: null, recorded_at: "2026-09-04T00:00:00Z" }] },
    ]);
    const res = await call("", "operation");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cannotDeliver?: Array<Record<string, unknown>> };
    expect(body.cannotDeliver).toEqual([
      { id: "e1", order_id: ORDER_A, leg: 0, partner_id: NETS, reason_key: "no_capacity", note: null, recorded_at: "2026-09-04T00:00:00Z" },
    ]);
  });

  it("leaves the field ABSENT when that read fails — the report says Not available, never 0", async () => {
    mockSb([
      { data: [] },
      { data: [] },
      { error: { code: "42P01", message: "relation does not exist" } },
    ]);
    const res = await call("", "operation");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect("cannotDeliver" in body).toBe(false);
  });
});

describe("GET /warehouse-schedule — Delivery's read-only feed", () => {
  /** The feed's fixed query order (0424): arrangements · orders ·
   *  delivery orders · SCOPE (delivery_order_units) · units · prep ·
   *  event units · handover events · warehouses · product names. */
  const ARRANGEMENT_ROW = {
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
  };
  const ORDER_ROW = {
    id: ORDER_A,
    so: 1322,
    customer_address: "12 Jalan Meru, Klang",
    delivered_at: null,
    do_file_path: null,
    pod_signature_url: null,
    placed_at: "2026-08-30T02:00:00Z",
    created_at: "2026-08-29T02:00:00Z",
  };
  const DO_ROW = {
    id: "do-1",
    order_id: ORDER_A,
    do_number: "DO-010926-1322",
    trip_groups: null,
    voided_at: null,
  };

  it("0491 — a Journey leg joins the feed once it carries its OWN document; a leg without one stays absent", async () => {
    const LEG_ARRANGEMENT = { ...ARRANGEMENT_ROW, id: "arr-2", leg: 1 };
    const LEG_DO = { ...DO_ROW, id: "do-2", do_number: "DO-010926-0002", leg: 1 };
    mockSb([
      { data: [LEG_ARRANGEMENT, { ...ARRANGEMENT_ROW, id: "arr-3", leg: 2 }] },
      { data: [{ ...ORDER_ROW, delivery_stops: [{ leg: 1, partner_id: NETS, partner_name: "NETS", from_loc: "Carres Klang", to_loc: "Customer" }] }] },
      { data: [LEG_DO] },
      { data: [{ delivery_order_id: "do-2", item_id: "item-1" }] },
      { data: [{ id: "item-1", unit_code: "CAR-000123", warehouse_id: "wh-1", sku: "SOFA-X" }] },
      { data: [] },
      { data: [] },
      { data: [] },
      { data: [{ id: "wh-1", name: "Carres Klang" }] },
      { data: [{ sku: "SOFA-X", variant: "Sofa X (Grey)" }] },
    ]);
    const res = await call("/warehouse-schedule", "operation");
    expect(res.status).toBe(200);
    const { events } = (await res.json()) as { events: Array<{ leg: number; doNumber: string; deliveryHref: string }> };
    /* leg 1 has its document → projected (pickup + handover events, one Unit);
       leg 2 has none → absent. */
    expect(events.length).toBe(2);
    expect(new Set(events.map((e) => `${e.leg}:${e.doNumber}`))).toEqual(new Set(["1:DO-010926-0002"]));
    expect(events[0]!.deliveryHref).toContain("open=");
  });

  it.each(["operation", "warehouse"])("keeps the actual two-leg route and limits %s to its physical Site", async (role) => {
    mockSb([
      { data: [1, 2].map((leg) => ({ ...ARRANGEMENT_ROW, leg })) },
      { data: [{ ...ORDER_ROW, delivery_stops: [
        { leg: 1, partner_id: NETS, partner_name: "NETS", from_loc: "Klang", to_loc: "JB" },
        { leg: 2, partner_id: AL, partner_name: "AL", from_loc: "JB", to_loc: "Singapore customer" },
      ] }] },
      { data: [1, 2].map((leg) => ({ ...DO_ROW, id: `do-${leg}`, leg })) },
      { data: [1, 2].map((leg) => ({ delivery_order_id: `do-${leg}`, item_id: "item-1" })) },
      { data: [{ id: "item-1", unit_code: "U1-000-123", warehouse_id: "wh-1", sku: "SOFA-X" }] },
      { data: [] }, { data: [] }, { data: [] },
      { data: [{ id: "wh-1", name: "Carres Klang" }] },
      { data: [{ sku: "SOFA-X", variant: "Sofa" }] },
    ]);
    const res = await call("/warehouse-schedule", role, undefined, role === "warehouse" ? "wh-1" : undefined);
    expect(res.status).toBe(200);
    const { events } = await res.json() as { events: Array<Record<string, unknown>> };
    expect(events.filter((e) => e.leg === 1)).toHaveLength(1);
    expect(events[0]).toMatchObject({ fromLocation: "Klang", toCustomer: "JB", warehouseSiteId: "wh-1" });
    const later = events.filter((e) => e.leg === 2);
    if (role === "warehouse") expect(later).toEqual([]);
    else {
      expect(later).toHaveLength(2);
      expect(later[0]).toMatchObject({ fromLocation: "JB", toCustomer: "Singapore customer", warehouseSiteId: null });
    }
  });

  it("refuses an unreadable documented leg instead of inventing its original Warehouse route", async () => {
    mockSb([
      { data: [{ ...ARRANGEMENT_ROW, leg: 1 }] },
      { data: [ORDER_ROW] },
      { data: [{ ...DO_ROW, leg: 1 }] },
    ]);
    const res = await call("/warehouse-schedule", "operation");
    expect(res.status).toBe(503);
  });

  it("projects the DO's recorded exact-Unit scope onto the real Saturday pickup with Friday readiness", async () => {
    const { inserts, upserts } = mockSb([
      { data: [ARRANGEMENT_ROW] },
      { data: [ORDER_ROW] },
      { data: [DO_ROW] },
      { data: [{ delivery_order_id: "do-1", item_id: "item-1" }] },
      { data: [{ id: "item-1", unit_code: "CAR-000123", warehouse_id: "wh-1", sku: "SOFA-X" }] },
      { data: [] }, // prep
      { data: [] }, // event units
      { data: [] }, // handover events
      { data: [{ id: "wh-1", name: "Carres Klang" }] },
      { data: [{ sku: "SOFA-X", variant: "Sofa X (Grey)" }] },
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
      soDate: "2026-08-30",
      sku: "SOFA-X",
      productName: "Sofa X (Grey)",
      unitScannedAt: null,
      unitHandedOverAt: null,
    });
    expect(body.events[1]).toMatchObject({
      title: "Customer handover",
      eventDate: "2026-09-05",
      unitId: "CAR-000123",
    });
    expect(inserts).toEqual([]);
    expect(upserts).toEqual([]);
  });

  it("a document with no recorded scope stays absent — never an invented Unit assignment", async () => {
    mockSb([
      { data: [ARRANGEMENT_ROW] },
      { data: [ORDER_ROW] },
      { data: [{ ...DO_ROW, trip_groups: ["ROOM_1"] }] },
      { data: [] }, // no scope rows recorded for the split document
    ]);
    const res = await call("/warehouse-schedule", "operation");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: unknown[] };
    expect(body.events).toEqual([]);
  });

  it("projects per-Unit prep and the accepted batch's own handover time", async () => {
    mockSb([
      { data: [ARRANGEMENT_ROW] },
      { data: [ORDER_ROW] },
      { data: [DO_ROW] },
      {
        data: [
          { delivery_order_id: "do-1", item_id: "item-1" },
          { delivery_order_id: "do-1", item_id: "item-2" },
        ],
      },
      {
        data: [
          { id: "item-1", unit_code: "U1-260-019", warehouse_id: "wh-1", sku: "SOFA-X" },
          { id: "item-2", unit_code: "U1-260-020", warehouse_id: "wh-1", sku: "SOFA-X" },
        ],
      },
      {
        data: [
          { delivery_order_id: "do-1", item_id: "item-1", fact: "scanned", recorded_at: "2026-09-04T10:00:00Z" },
          { delivery_order_id: "do-1", item_id: "item-1", fact: "checked", recorded_at: "2026-09-04T10:05:00Z" },
          { delivery_order_id: "do-1", item_id: "item-1", fact: "packed", recorded_at: "2026-09-04T10:10:00Z" },
        ],
      },
      {
        data: [
          { delivery_order_id: "do-1", item_id: "item-1", event_id: "ev-1", recorded_side: "warehouse" },
        ],
      },
      {
        data: [
          { id: "ev-1", delivery_order_id: "do-1", kind: "handed_over", proof_path: "handover/do-1/p.jpg", recorded_at: "2026-09-04T11:18:00Z" },
        ],
      },
      { data: [{ id: "wh-1", name: "Carres Klang" }] },
      { data: [] },
    ]);

    const res = await call("/warehouse-schedule", "operation");
    const body = (await res.json()) as { events: Array<Record<string, unknown>> };
    const pickups = body.events.filter((e) => e.title === "Customer delivery pickup");
    expect(pickups).toHaveLength(2);
    const handed = pickups.find((e) => e.unitId === "U1-260-019");
    const waiting = pickups.find((e) => e.unitId === "U1-260-020");
    expect(handed).toMatchObject({
      unitScannedAt: "2026-09-04T10:00:00Z",
      unitCheckedAt: "2026-09-04T10:05:00Z",
      unitPackedAt: "2026-09-04T10:10:00Z",
      unitHandedOverAt: "2026-09-04T11:18:00Z",
      hasEvidence: true,
    });
    // The Unit NOT in the batch keeps null facts — a partial handover
    // changes only the accepted exact Units.
    expect(waiting).toMatchObject({
      unitScannedAt: null,
      unitHandedOverAt: null,
      hasEvidence: false,
    });
  });

  it("does not expose the internal Warehouse feed to a Partner role", async () => {
    mockSb([]);
    const res = await call("/warehouse-schedule", "partner");
    expect(res.status).toBe(403);
  });

  it("lets a Warehouse login read only exact Units physically assigned to its own Warehouse", async () => {
    mockSb([
      { data: [{ ...ARRANGEMENT_ROW, logistics_note: "internal note must not ride the projection", reply_proof_path: null }] },
      { data: [ORDER_ROW] },
      { data: [DO_ROW] },
      {
        data: [
          { delivery_order_id: "do-1", item_id: "item-own" },
          { delivery_order_id: "do-1", item_id: "item-other" },
        ],
      },
      {
        data: [
          { id: "item-own", unit_code: "CAR-OWN-001", warehouse_id: "wh-own", sku: null },
          { id: "item-other", unit_code: "CAR-OTHER-002", warehouse_id: "wh-other", sku: null },
        ],
      },
      { data: [] }, // prep
      { data: [] }, // event units
      { data: [] }, // handover events
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

describe("PUT /:orderId — the in-panel writes (CARD 11, Delivery MASTER §8.6)", () => {
  const save = (body: unknown, path = `/${ORDER_A}`) =>
    call(path, "operation", { method: "PUT", body: JSON.stringify(body) });
  const savedArrangement = {
    id: "arr-1",
    order_id: ORDER_A,
    leg: 0,
    partner_id: NETS,
    confirmed_date: "2026-09-29",
    confirmed_time: "Afternoon (12pm–3pm)",
    expected_arrival: null,
    logistics_note: null,
    reply_proof_path: "proof/a.jpg",
    driver_name: null,
    vehicle: null,
    updated_at: "2026-09-13T00:00:00Z",
    updated_by: null,
    delivery_partners: { id: NETS, name: "NETS" },
  };

  it("⭐ a day LATER than the requested day is refused without the WhatsApp reply", async () => {
    const { upserts } = mockSb([{ data: { id: ORDER_A, delivery_date: "2026-09-25", delivery_date_tbd: false } }]);
    const res = await save({ partnerId: NETS, confirmedDate: "2026-09-29", confirmedTime: "Afternoon (12pm–3pm)" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("later_date_needs_reply_proof");
    expect(body.error).toBe("Save confirmed delivery — upload the WhatsApp reply");
    expect(upserts).toHaveLength(0);
  });

  it("a day later than the requested day saves WITH the reply, and records the contact", async () => {
    const { inserts } = mockSb([
      { data: { id: ORDER_A, delivery_date: "2026-09-25", delivery_date_tbd: false } },
      { data: [] },
      { data: [{ id: ORDER_A, delivery_partner_id: NETS, ops_assigned_logistic: null }] },
      { data: savedArrangement },
      { data: { id: "c-1" } },
    ]);
    const res = await save({
      partnerId: NETS,
      confirmedDate: "2026-09-29",
      confirmedTime: "Afternoon (12pm–3pm)",
      replyProofPath: "proof/a.jpg",
      informationReceivedFrom: "operation_on_behalf",
    });
    expect(res.status).toBe(200);
    const contact = inserts.find((i) => i.table === "ops_delivery_contacts")?.rows as Record<string, unknown>;
    expect(contact).toBeTruthy();
    expect(contact.purpose_key).toBe("confirm_new_delivery_date");
    expect(contact.contacted_person).toBe("customer");
    expect(contact.on_behalf_of_partner_id).toBe(NETS);
    expect(contact.reply_evidence_path).toBe("proof/a.jpg");
    expect(contact.result_key).toBe("confirmed");
  });

  it("a day that is NOT later needs no reply, and the partner's own answer is recorded as the partner's", async () => {
    const { inserts } = mockSb([
      { data: { id: ORDER_A, delivery_date: "2026-09-25", delivery_date_tbd: false } },
      { data: [] },
      { data: [{ id: ORDER_A, delivery_partner_id: NETS, ops_assigned_logistic: null }] },
      { data: { ...savedArrangement, confirmed_date: "2026-09-24", reply_proof_path: null } },
      { data: { id: "c-2" } },
    ]);
    const res = await save({
      partnerId: NETS,
      confirmedDate: "2026-09-24",
      confirmedTime: "Morning (9am–12pm)",
      informationReceivedFrom: "partner",
    });
    expect(res.status).toBe(200);
    const contact = inserts.find((i) => i.table === "ops_delivery_contacts")?.rows as Record<string, unknown>;
    expect(contact.purpose_key).toBe("confirm_delivery_date");
    expect(contact.contacted_person).toBe("partner");
    expect(contact.channel).toBe("call");
  });

  it("no `Information received from` — no contact is invented", async () => {
    const { inserts } = mockSb([
      { data: { id: ORDER_A, delivery_date: null, delivery_date_tbd: true } },
      { data: [] },
      { data: [{ id: ORDER_A, delivery_partner_id: NETS, ops_assigned_logistic: null }] },
      { data: savedArrangement },
    ]);
    const res = await save({ partnerId: NETS, confirmedDate: "2026-09-29" });
    expect(res.status).toBe(200);
    expect(inserts.some((i) => i.table === "ops_delivery_contacts")).toBe(false);
  });

  it("⭐ a Sunday is not a delivery day", async () => {
    mockSb([{ data: { id: ORDER_A, delivery_date: null, delivery_date_tbd: false } }]);
    const res = await save({ partnerId: NETS, confirmedDate: "2026-09-06" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("not_a_delivery_day");
  });
});

describe("POST /:orderId/contacts — the one customer-contact door (0487)", () => {
  it("records a contact with its purpose and result — silence is never a result", async () => {
    const { inserts } = mockSb([{ data: { id: ORDER_A } }, { data: { id: "c-9" } }]);
    const res = await call(`/${ORDER_A}/contacts?leg=0`, "operation", {
      method: "POST",
      body: JSON.stringify({
        purpose: "confirm_delivery_time",
        channel: "whatsapp",
        contactedPerson: "customer",
        result: "waiting_for_customer_reply",
      }),
    });
    expect(res.status).toBe(200);
    const row = inserts.find((i) => i.table === "ops_delivery_contacts")?.rows as Record<string, unknown>;
    expect(row.result_key).toBe("waiting_for_customer_reply");
    expect(row.purpose_key).toBe("confirm_delivery_time");
  });

  /** 0499 — four identities, separately. The signed-in subject in these tests
   *  is 11111111-…-0001; the responsible person and today's acting person
   *  come from the one responsibility read, never from who is typing. */
  const SHASHA = "0cab8bcf-6ebb-454e-ba21-b916e18cc419";
  const YUJUN = "aac9edf9-63ad-4d0a-ba91-e495a25f9896";
  const RECORDER = "11111111-1111-1111-1111-000000000001";
  async function contactRow() {
    const { inserts, rpc } = mockSb([{ data: { id: ORDER_A } }, { data: { id: "c-9" } }]);
    const res = await call(`/${ORDER_A}/contacts?leg=0`, "operation", {
      method: "POST",
      body: JSON.stringify({ purpose: "confirm_delivery_date", channel: "call", contactedPerson: "customer", result: "confirmed" }),
    });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("delivery_responsible_operation", { p_order_id: ORDER_A, p_on: null });
    return inserts.find((i) => i.table === "ops_delivery_contacts")?.rows as Record<string, unknown>;
  }

  it("the responsible person is the order's normal person from the one read — the recorder is evidence, never responsibility", async () => {
    Object.assign(responsibility, { normal_user_id: SHASHA, acting_user_id: SHASHA, source: "delivery_duty" });
    const row = await contactRow();
    expect(row.contact_owner_user_id).toBe(SHASHA);
    expect(row.acting_user_id).toBe(SHASHA);
    expect(row.recorded_by).toBe(RECORDER);
    expect(row.contact_owner_user_id).not.toBe(row.recorded_by);
  });

  it("a buddy cover recording during leave is today's acting person; the normal person is kept", async () => {
    Object.assign(responsibility, { normal_user_id: SHASHA, acting_user_id: YUJUN, source: "contact" });
    const row = await contactRow();
    expect(row.contact_owner_user_id).toBe(SHASHA);
    expect(row.acting_user_id).toBe(YUJUN);
    expect(row.recorded_by).toBe(RECORDER);
  });

  it("nobody responsible yet → the contact records no owner and no acting person, keeps its recorder, and still lands", async () => {
    Object.assign(responsibility, { normal_user_id: null, acting_user_id: null, source: "not_assigned" });
    const row = await contactRow();
    expect(row.contact_owner_user_id).toBeNull();
    expect(row.acting_user_id).toBeNull();
    expect(row.recorded_by).toBe(RECORDER);
  });

  it("a partner's reply keeps its provenance beside the three people", async () => {
    Object.assign(responsibility, { normal_user_id: SHASHA, acting_user_id: SHASHA, source: "delivery_duty" });
    const { inserts } = mockSb([{ data: { id: ORDER_A } }, { data: { id: "c-9" } }]);
    const res = await call(`/${ORDER_A}/contacts?leg=0`, "operation", {
      method: "POST",
      body: JSON.stringify({ purpose: "confirm_delivery_date", channel: "whatsapp", contactedPerson: "partner", result: "confirmed", onBehalfOfPartnerId: NETS }),
    });
    expect(res.status).toBe(200);
    const row = inserts.find((i) => i.table === "ops_delivery_contacts")?.rows as Record<string, unknown>;
    expect(row.on_behalf_of_partner_id).toBe(NETS);
    expect(row.contact_owner_user_id).toBe(SHASHA);
    expect(row.recorded_by).toBe(RECORDER);
  });

  it("refuses a purpose outside the governed list", async () => {
    mockSb([]);
    const res = await call(`/${ORDER_A}/contacts`, "operation", {
      method: "POST",
      body: JSON.stringify({ purpose: "follow_up", channel: "call", contactedPerson: "customer", result: "no_answer" }),
    });
    expect(res.status).toBe(422);
  });
});

describe("POST /:orderId/cannot-deliver — Operation on behalf of the partner (§8.6)", () => {
  it("records the 0417 event in the partner's name and a history line naming the proxy", async () => {
    const { inserts } = mockSb([
      { data: { id: ORDER_A } },
      { data: { id: NETS, name: "NETS" } },
      { data: null },
      { data: null },
    ]);
    const res = await call(`/${ORDER_A}/cannot-deliver?leg=0`, "operation", {
      method: "POST",
      body: JSON.stringify({ partnerId: NETS, reason: "no_capacity", note: "Lorry full that day" }),
    });
    expect(res.status).toBe(200);
    const event = inserts.find((i) => i.table === "ops_delivery_arrangement_events")?.rows as Record<string, unknown>;
    expect(event.event).toBe("cannot_deliver");
    expect(event.from_partner_id).toBe(NETS);
    expect(event.reason_key).toBe("no_capacity");
    const history = inserts.find((i) => i.table === "order_history")?.rows as Record<string, unknown>;
    expect(history.by_role).toBe("operation");
    expect(history.text).toContain("on behalf of NETS");
  });

  it("`Another reason` needs the note, exactly as the partner's own door demands", async () => {
    mockSb([]);
    const res = await call(`/${ORDER_A}/cannot-deliver`, "operation", {
      method: "POST",
      body: JSON.stringify({ partnerId: NETS, reason: "other" }),
    });
    expect(res.status).toBe(422);
  });

  it("refuses a dealer", async () => {
    mockSb([]);
    const res = await call(`/${ORDER_A}/cannot-deliver`, "dealer", {
      method: "POST",
      body: JSON.stringify({ partnerId: NETS, reason: "no_capacity" }),
    });
    expect(res.status).toBe(403);
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

describe("POST /:orderId/message-prepared — preparation is activity, never confirmation (0412)", () => {
  const prepared = (body: unknown, path = `/${ORDER_A}/message-prepared?leg=0`, role = "operation") =>
    call(path, role, { method: "POST", body: JSON.stringify(body) });

  function mockRpc() {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(userClient).mockReturnValue({ rpc } as never);
    return rpc;
  }

  it("records through the one SQL door with the exact scope", async () => {
    const rpc = mockRpc();
    const res = await prepared({ partnerId: NETS }, `/${ORDER_A}/message-prepared?leg=2`);
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("delivery_arrangement_message_prepared", {
      p_order_id: ORDER_A,
      p_leg: 2,
      p_partner_id: NETS,
    });
  });

  it("422s a junk partner id before any call", async () => {
    const rpc = mockRpc();
    const res = await prepared({ partnerId: "nope" });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("403s a dealer", async () => {
    mockRpc();
    const res = await prepared({ partnerId: NETS }, undefined, "dealer");
    expect(res.status).toBe(403);
  });
});
