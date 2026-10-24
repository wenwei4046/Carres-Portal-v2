import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

/**
 * POST /api/operation/pos/new — office staff open a Purchase Order with no
 * source, the Houzs way. Weisiang's decision (Mr Lim, WhatsApp 2026-10-22),
 * overturning docs/purchasing/MASTER.md "No blank independent PO". The door
 * reuses the one creation authority `purchasing_issue_pos_batch`; it adds no
 * second engine.
 */
vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const KID = "test-kid-new-po";
const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "unused" };
let signKey: KeyLike;
let publicJwk: JWK;

const SUPPLIER = "00000000-0000-4000-8000-000000000a01";
const DEST = "00000000-0000-4000-8000-000000000d01";
const DEST_WH = "00000000-0000-4000-8000-000000000b01";
const OWN_WH = "00000000-0000-4000-8000-000000000b02";

async function jwt(role: string) {
  return new SignJWT({ email: `${role}@carres.com`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
    .setIssuedAt().setExpirationTime("5m").sign(signKey);
}

beforeAll(async () => {
  const kp = await generateKeyPair("ES256", { extractable: true });
  signKey = kp.privateKey;
  publicJwk = { ...(await exportJWK(kp.publicKey)), kid: KID, alg: "ES256", use: "sig" };
});
beforeEach(() => {
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
  vi.mocked(userClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

/** A client whose reads answer `rows[table]`, and whose rpc answers `rpcResult`. */
function client(rows: Record<string, unknown[]>, rpcResult: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => rpcResult);
  const from = vi.fn((table: string) => {
    const result = { data: rows[table] ?? [], error: null };
    const chain: Record<string, unknown> = {
      maybeSingle: vi.fn(async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null })),
      then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, no),
    };
    for (const m of ["select", "eq", "in"]) chain[m] = vi.fn(() => chain);
    return chain;
  });
  vi.mocked(userClient).mockReturnValue({ rpc, from } as never);
  return { rpc, from };
}

const ROWS = {
  purchasing_destinations: [{ id: DEST, name: "Showroom", warehouse_id: DEST_WH, warehouses: { address: "Lot 1, Klang" }, active: true }],
  warehouses: [{ id: OWN_WH, name: "Carres Klang", kind: "own" }],
  product_skus: [{ sku: "SOFA-1", cost: 1200 }, { sku: "BED-1", cost: null }],
};

async function post(body: unknown, role = "operation") {
  return app.fetch(new Request("http://t/api/operation/pos/new", {
    method: "POST",
    headers: { authorization: `Bearer ${await jwt(role)}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }), env);
}

const BODY = {
  supplierId: SUPPLIER,
  destinationId: DEST,
  etaDate: "2026-11-20",
  note: "Showroom top-up",
  lines: [{ sku: "SOFA-1", qty: 2 }, { sku: "BED-1", qty: 1 }],
};

describe("POST /api/operation/pos/new — a Purchase Order with no source (Weisiang 2026-10-22)", () => {
  it("issues one sourceless PO through the one creation authority and answers its number", async () => {
    const { rpc } = client(ROWS, { data: { po_ids: ["PO261023-1234"] }, error: null });
    const res = await post(BODY);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ poId: "PO261023-1234" });
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as unknown as [string, { p_pos: Array<Record<string, unknown>> }];
    expect(name).toBe("purchasing_issue_pos_batch");
    expect(args.p_pos).toHaveLength(1);
    const po = args.p_pos[0]!;
    expect(po).toMatchObject({ supplier_id: SUPPLIER, destination_id: DEST, warehouse_id: DEST_WH, eta_date: "2026-11-20", so_refs: null, purpose: null, note: "Showroom top-up" });
    const lines = po.lines as Array<Record<string, unknown>>;
    // No source of any kind: no demand, no Sales Order lineage, no request.
    for (const l of lines) {
      expect(l.demand_id ?? null).toBeNull();
      expect(l.sources).toBeUndefined();
      expect(l.request_sources).toBeUndefined();
    }
    // Blank price takes the Catalog price; no Catalog price is an honest absence.
    expect(lines[0]).toMatchObject({ sku: "SOFA-1", qty: 2, cost: 1200, cost_source: "catalog", commercial_treatment: "normal", expected_catalog_cost: 1200 });
    expect(lines[1]).toMatchObject({ sku: "BED-1", qty: 1, cost: null, cost_source: null, commercial_treatment: null });
  });

  it("an entered price that differs from Catalog is sent as hand-entered for the engine's commercial gate", async () => {
    const { rpc } = client(ROWS, { data: { po_ids: ["PO1"] }, error: null });
    await post({ ...BODY, lines: [{ sku: "SOFA-1", qty: 1, price: 999 }] });
    const line = ((rpc.mock.calls[0] as unknown as [string, { p_pos: Array<{ lines: unknown[] }> }])[1].p_pos[0]!.lines[0]) as Record<string, unknown>;
    expect(line).toMatchObject({ cost: 999, cost_source: "hand_entered", commercial_treatment: "normal", expected_catalog_cost: 1200 });
  });

  it("a destination with no warehouse falls back to the own Klang warehouse", async () => {
    const { rpc } = client({ ...ROWS, purchasing_destinations: [{ id: DEST, name: "Showroom", address: "Jalan 1", warehouse_id: null, active: true }] }, { data: { po_ids: ["PO2"] }, error: null });
    await post(BODY);
    expect((rpc.mock.calls[0] as unknown as [string, { p_pos: Array<Record<string, unknown>> }])[1].p_pos[0]!.warehouse_id).toBe(OWN_WH);
  });

  it("a Deliver To with no address is refused before a PO number is spent", async () => {
    const { rpc } = client({ ...ROWS, purchasing_destinations: [{ id: DEST, name: "Showroom", address: " ", warehouse_id: null }] }, { data: null, error: null });
    const res = await post(BODY);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("destination_address_missing");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a factory-pickup supplier takes its collection partner from Settings", async () => {
    const PARTNER = "00000000-0000-4000-8000-000000000c01";
    const { rpc } = client({ ...ROWS, suppliers: [{ kind: "factory_pickup", name: "F" }], purchasing_supplier_settings: [{ fixed_destination_id: null, collected_by_partner_id: PARTNER }] }, { data: { po_ids: ["PO3"] }, error: null });
    await post(BODY);
    expect((rpc.mock.calls[0] as unknown as [string, { p_pos: Array<Record<string, unknown>> }])[1].p_pos[0]!.procurement_partner_id).toBe(PARTNER);
  });

  it("refuses a price of 0 (Free of Charge needs a reason this form does not take)", async () => {
    const { rpc } = client(ROWS, { data: null, error: null });
    expect((await post({ ...BODY, lines: [{ sku: "SOFA-1", qty: 1, price: 0 }] })).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses an empty order before touching the database", async () => {
    const { rpc } = client(ROWS, { data: null, error: null });
    const res = await post({ ...BODY, lines: [] });
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a login outside Operation (a dealer) cannot open the door", async () => {
    const { rpc } = client(ROWS, { data: null, error: null });
    expect((await post(BODY, "dealer")).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("the engine's refusal reaches the operator in the approved words", async () => {
    client(ROWS, { data: null, error: { code: "P0001", message: "x", details: "unresolved_supplier" } });
    const res = await post(BODY);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("unresolved_supplier");
    expect(body.message).not.toBe("x");
  });
});
