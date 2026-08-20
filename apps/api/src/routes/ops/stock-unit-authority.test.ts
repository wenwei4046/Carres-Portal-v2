/**
 * 0366 · WAREHOUSE UNIT AUTHORITY — the register has ONE way in per fact.
 *
 * The database is where this law is enforced: `ops_stock_items` lost its write
 * policy entirely, so a raw `.update()` / `.insert()` / `.delete()` from an
 * authenticated session is refused by RLS no matter which route attempts it.
 * These tests hold the OTHER half — that the API actually goes through the
 * governed doors, and that the two forbidden doors are gone from the router.
 *
 * The DB-side proofs (a duplicate id refused, an id never reused, a delete
 * refused, a bulk sofa refused, a derived total that cannot be hand-written)
 * live in migration 0366's own sanity block and in the release-gate run
 * recorded in docs/stock/MASTER.md — they cannot be proven against a mock.
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

const ITEM = "00000000-0000-0000-0000-0000000000f1";
const WH = "00000000-0000-0000-0000-000000000w01".replace("w", "0");

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

/**
 * A client whose `.from()` THROWS. Any route that still reaches for the table
 * fails loudly here instead of quietly working against a mock that a real
 * session's RLS would have refused.
 */
function doorOnlyClient(rpcResult: { data?: unknown; error?: unknown } = {}) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    return Promise.resolve({
      data: rpcResult.data ?? null,
      error: rpcResult.error ?? null,
    });
  });
  const from = vi.fn((table: string) => {
    throw new Error(`0366: ${table} must be reached through a governed door`);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue({ rpc, from } as any);
  return { rpc, from, rpcCalls };
}

async function call(path: string, method: string, body?: unknown, role = "operation") {
  const jwt = await makeJwt(role);
  return app.fetch(
    new Request(`http://t/api/ops/stock${path}`, {
      method,
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  );
}

describe("0366 — the forbidden doors are gone from the router", () => {
  it('"+ Add stock" no longer exists: a Unit is born from a confirmed PO', async () => {
    doorOnlyClient();
    const res = await call("", "POST", { sku: "MAT-K-001", qty: 3 });
    expect(res.status).toBe(404);
  });

  it("a Unit cannot be hard-deleted: the identity outlives the goods", async () => {
    doorOnlyClient();
    const res = await call(`/${ITEM}`, "DELETE");
    expect(res.status).toBe(404);
  });

  it("neither retired door touches the register on its way to the 404", async () => {
    const m = doorOnlyClient();
    await call("", "POST", { sku: "MAT-K-001", qty: 3 });
    await call(`/${ITEM}`, "DELETE");
    expect(m.from).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();
  });
});

describe("0366 — every unit fact moves through its own door", () => {
  it("condition goes through ops_stock_set_condition, not a raw update", async () => {
    const m = doorOnlyClient({ data: ITEM });
    const res = await call(`/${ITEM}/condition`, "PATCH", { condition: "damaged" });
    expect(res.status).toBe(200);
    expect(m.rpcCalls[0]?.name).toBe("ops_stock_set_condition");
    expect(m.rpcCalls[0]?.args).toMatchObject({
      p_item_id: ITEM,
      p_condition: "damaged",
    });
    expect(m.from).not.toHaveBeenCalled();
  });

  it("WHERE moves through ops_stock_set_site", async () => {
    const m = doorOnlyClient({ data: ITEM });
    const res = await call(`/${ITEM}/site`, "POST", { warehouseId: WH });
    expect(res.status).toBe(200);
    expect(m.rpcCalls[0]?.name).toBe("ops_stock_set_site");
    expect(m.rpcCalls[0]?.args).toMatchObject({ p_item_id: ITEM, p_warehouse_id: WH });
  });

  it("WHO HAS IT moves through ops_stock_set_holder, and by party CODE — never a hard-coded NETS", async () => {
    const m = doorOnlyClient({ data: ITEM });
    const res = await call(`/${ITEM}/holder`, "POST", { partyCode: "nets_delivery" });
    expect(res.status).toBe(200);
    expect(m.rpcCalls[0]?.name).toBe("ops_stock_set_holder");
    expect(m.rpcCalls[0]?.args).toMatchObject({ p_party_code: "nets_delivery" });
  });

  it("WHERE and WHO HAS IT are separate doors — moving one never moves the other", async () => {
    const m = doorOnlyClient({ data: ITEM });
    await call(`/${ITEM}/site`, "POST", { warehouseId: WH });
    await call(`/${ITEM}/holder`, "POST", { partyCode: "pj_showroom" });
    expect(m.rpcCalls.map((r) => r.name)).toEqual([
      "ops_stock_set_site",
      "ops_stock_set_holder",
    ]);
    expect(m.rpcCalls[0]?.args).not.toHaveProperty("p_party_code");
    expect(m.rpcCalls[1]?.args).not.toHaveProperty("p_warehouse_id");
  });

  it("handing a Unit back to nobody in particular is a real answer, not a missing one", async () => {
    const m = doorOnlyClient({ data: ITEM });
    const res = await call(`/${ITEM}/holder`, "POST", { partyCode: null });
    expect(res.status).toBe(200);
    expect(m.rpcCalls[0]?.args.p_party_code).toBeNull();
  });

  it("ownership moves through ops_stock_set_ownership and keeps its two words", async () => {
    const m = doorOnlyClient({ data: ITEM });
    const ok = await call(`/${ITEM}/ownership`, "POST", {
      ownership: "supplier_consignment",
      supplier: "Nice Future",
    });
    expect(ok.status).toBe(200);
    expect(m.rpcCalls[0]?.args).toMatchObject({
      p_ownership: "supplier_consignment",
      p_supplier: "Nice Future",
    });

    // The contract holds only two words, so a third never reaches the door.
    const bad = await call(`/${ITEM}/ownership`, "POST", { ownership: "rented" });
    expect(bad.status).toBe(400);
  });

  it("last verified is stamped by a door, never by opening a screen", async () => {
    const m = doorOnlyClient({ data: ITEM });
    const res = await call(`/${ITEM}/verify`, "POST");
    expect(res.status).toBe(200);
    expect(m.rpcCalls[0]?.name).toBe("ops_stock_verify_unit");
  });

  it("repair in and out both go through their doors", async () => {
    const m = doorOnlyClient({ data: ITEM });
    await call("/refurbish", "POST", { itemId: ITEM });
    await call("/refurbish-complete", "POST", { itemId: ITEM });
    expect(m.rpcCalls.map((r) => r.name)).toEqual([
      "ops_stock_refurbish",
      "ops_stock_refurbish_complete",
    ]);
    expect(m.from).not.toHaveBeenCalled();
  });

  it("a door's refusal reaches the caller as the caller's mistake, not a 500", async () => {
    // P0001 is how every governed door says no. Before 0366 this router mapped
    // it to 500, which reads as an outage for what is really "that unit is not
    // in repair" — and buries the real 500s.
    doorOnlyClient({ error: { code: "P0001", message: "unit is not in repair" } });
    const res = await call("/refurbish-complete", "POST", { itemId: ITEM });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string; message?: string };
    expect(JSON.stringify(body)).toContain("unit is not in repair");
  });

  it("a door that cannot find the unit is a 404, not a 500", async () => {
    doorOnlyClient({ error: { code: "P0002", message: "unit not found" } });
    const res = await call(`/${ITEM}/verify`, "POST");
    expect(res.status).toBe(404);
  });

  it("a dealer cannot reach any of them", async () => {
    const m = doorOnlyClient({ data: ITEM });
    for (const [path, method, body] of [
      [`/${ITEM}/site`, "POST", { warehouseId: WH }],
      [`/${ITEM}/holder`, "POST", { partyCode: "nets_delivery" }],
      [`/${ITEM}/ownership`, "POST", { ownership: "carres_owned" }],
      [`/${ITEM}/verify`, "POST", undefined],
    ] as const) {
      const res = await call(path, method, body, "dealer");
      expect(res.status).toBe(403);
    }
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
