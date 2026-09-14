import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));
vi.mock("../../lib/purchasing-settings", () => ({
  loadPurchasingSettings: vi.fn().mockResolvedValue({ logisticsCallWorkingDays: 3 }),
}));
import { adminClient, userClient } from "../../lib/supabase";

/**
 * 【DELIVERY】 CARD 12 · Delivery Settings (Delivery MASTER §11, 0488).
 *
 * The router is thin: every rule lives in the SQL doors. These tests pin the
 * wire — the one read, each section's RPC name and arguments, and the
 * refusals the schema makes before SQL is reached.
 */
const env = { SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "" };
const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;
const NETS = "00000000-0000-0000-0000-0000000b0001";

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

function mockSb(tables: Record<string, unknown[]>, rpcResults: Record<string, { data?: unknown; error?: unknown }> = {}) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const from = vi.fn().mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ["select", "eq", "in", "order", "limit", "maybeSingle", "single"]) chain[m] = vi.fn().mockImplementation(self);
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve, reject);
    return chain;
  });
  const rpc = vi.fn().mockImplementation((fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve(rpcResults[fn] ?? { data: { ok: true }, error: null });
  });
  vi.mocked(userClient).mockReturnValue({ from, rpc } as never);
  vi.mocked(adminClient).mockReturnValue({ from, rpc } as never);
  return { from, rpc, rpcCalls };
}

async function call(path: string, role: string, init?: RequestInit) {
  const jwt = await makeJwt(role);
  return app.fetch(
    new Request(`http://t/api/operation/delivery-settings${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${jwt}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    }),
    env,
  );
}

describe("GET / — the one read", () => {
  it("returns partners, fleet, templates, changes with actor names, accounts, the gate and the shared lead", async () => {
    mockSb(
      {
        delivery_partners: [{ id: NETS, name: "NETS", active: true, customer_phone: null }],
        partner_drivers: [{ id: "d1", partner_id: NETS, name: "Ali", phone: null, active: true }],
        partner_fleet: [],
        delivery_message_templates: [],
        delivery_setting_changes: [{ id: "c1", what: "partner_details", partner_id: NETS, old_value: null, new_value: null, actor_id: "u1", changed_at: "2026-09-13T00:00:00Z" }],
        app_users: [{ id: "u1", name: "Jess" }],
      },
      { delivery_can_manage_settings: { data: true, error: null } },
    );
    const res = await call("", "operation");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect((body.partners as unknown[]).length).toBe(1);
    expect((body.drivers as unknown[]).length).toBe(1);
    expect(body.canEdit).toBe(true);
    expect(body.contactLeadWorkingDays).toBe(3);
    expect((body.changes as Array<{ actor_name: string | null }>)[0]!.actor_name).toBe("Jess");
  });

  it("refuses a dealer", async () => {
    mockSb({});
    const res = await call("", "dealer");
    expect(res.status).toBe(403);
  });
});

describe("the section doors forward to their SQL doors", () => {
  it("PUT /partner/details → delivery_set_partner_details with the customer-facing number", async () => {
    const { rpcCalls } = mockSb({});
    const res = await call("/partner/details", "principal", {
      method: "PUT",
      body: JSON.stringify({ partnerId: NETS, name: "NETS", active: true, customerPhone: "012-3456789", officeContact: null, address: null, whatsappGroupUrl: null }),
    });
    expect(res.status).toBe(200);
    expect(rpcCalls[0]).toEqual({
      fn: "delivery_set_partner_details",
      args: expect.objectContaining({ p_partner_id: NETS, p_name: "NETS", p_customer_phone: "012-3456789" }),
    });
  });

  it("PUT /partner/details refuses a blank name before SQL", async () => {
    const { rpcCalls } = mockSb({});
    const res = await call("/partner/details", "principal", {
      method: "PUT",
      body: JSON.stringify({ partnerId: NETS, name: "  ", active: true }),
    });
    expect(res.status).toBe(422);
    expect(rpcCalls).toHaveLength(0);
  });

  it("PUT /partner/coverage → delivery_set_partner_coverage with the KV default flag", async () => {
    const { rpcCalls } = mockSb({});
    const res = await call("/partner/coverage", "principal", {
      method: "PUT",
      body: JSON.stringify({ partnerId: NETS, coverage: { states: ["Selangor"], cities: [], postcodes: [], excluded: [] }, kvDefault: true }),
    });
    expect(res.status).toBe(200);
    expect(rpcCalls[0]!.fn).toBe("delivery_set_partner_coverage");
    expect(rpcCalls[0]!.args.p_kv_default).toBe(true);
  });

  it("PUT /partner/rules → delivery_set_partner_rules, and an unknown contact-by is refused before SQL", async () => {
    const { rpcCalls } = mockSb({});
    const bad = await call("/partner/rules", "principal", {
      method: "PUT",
      body: JSON.stringify({ partnerId: NETS, customerContactBy: "nobody", recordOnBehalfAllowed: true, proofRules: null }),
    });
    expect(bad.status).toBe(422);
    const ok = await call("/partner/rules", "principal", {
      method: "PUT",
      body: JSON.stringify({ partnerId: NETS, customerContactBy: "operation", recordOnBehalfAllowed: false, proofRules: null }),
    });
    expect(ok.status).toBe(200);
    expect(rpcCalls[0]).toEqual({
      fn: "delivery_set_partner_rules",
      args: { p_partner_id: NETS, p_customer_contact_by: "operation", p_record_on_behalf_allowed: false, p_proof_rules: null },
    });
  });

  it("POST /partner/vehicle → delivery_save_partner_vehicle; a plate is required", async () => {
    const { rpcCalls } = mockSb({});
    const bad = await call("/partner/vehicle", "principal", {
      method: "POST",
      body: JSON.stringify({ partnerId: NETS, plate: "", vehicleType: "Lorry" }),
    });
    expect(bad.status).toBe(422);
    const ok = await call("/partner/vehicle", "principal", {
      method: "POST",
      body: JSON.stringify({ partnerId: NETS, plate: "WXY 1234", vehicleType: "Lorry", capacity: "10 mattresses" }),
    });
    expect(ok.status).toBe(200);
    expect(rpcCalls[0]!.fn).toBe("delivery_save_partner_vehicle");
    expect(rpcCalls[0]!.args.p_plate).toBe("WXY 1234");
    expect(rpcCalls[0]!.args.p_active).toBe(true);
  });

  it("POST /templates/save → delivery_template_save with a Delivery purpose; a Payment purpose is refused", async () => {
    const { rpcCalls } = mockSb({});
    const bad = await call("/templates/save", "principal", {
      method: "POST",
      body: JSON.stringify({ purpose: "gentle_reminder", name: "X", body: "Hi" }),
    });
    expect(bad.status).toBe(422);
    const ok = await call("/templates/save", "principal", {
      method: "POST",
      body: JSON.stringify({ purpose: "ask_partner_for_date", name: "Ask NETS", body: "SO {so} · {customer}. Please confirm the delivery date." }),
    });
    expect(ok.status).toBe(200);
    expect(rpcCalls[0]!.fn).toBe("delivery_template_save");
    expect(rpcCalls[0]!.args.p_purpose).toBe("ask_partner_for_date");
    expect(rpcCalls[0]!.args.p_channel).toBe("whatsapp");
  });

  it("a SQL refusal reaches the caller in words", async () => {
    mockSb({}, { delivery_set_partner_details: { data: null, error: { code: "42501", message: "forbidden", details: "delivery settings are set by the manager" } } });
    const res = await call("/partner/details", "operation", {
      method: "PUT",
      body: JSON.stringify({ partnerId: NETS, name: "NETS", active: true }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
