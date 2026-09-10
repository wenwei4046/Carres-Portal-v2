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

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
}));

import { userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({
    email: `${role}@carres.com`,
    app_metadata: { role },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
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

describe("GET /api/operation/suppliers", () => {
  it("returns 200 with supplier rows for operation", async () => {
    const suppliers = [
      {
        id: "00000000-0000-0000-0000-000000000c01",
        name: "Carres Manufacturing",
        kind: "own_logistics",
        cat_covered: ["mattress", "bedframe"],
        lead_time: "5–7 days",
        contact: "+60 3-1111 1111",
      },
      {
        id: "00000000-0000-0000-0000-000000000c02",
        name: "Sofa Factory Co",
        kind: "factory_pickup",
        cat_covered: ["sofa"],
        lead_time: "10–14 days",
        contact: "+60 3-2222 2222",
      },
    ];
    vi.mocked(userClient).mockReturnValue({
      from: () => ({
        select: () => ({
          order: async () => ({ data: suppliers, error: null }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/suppliers", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suppliers: typeof suppliers };
    expect(body.suppliers).toHaveLength(2);
    expect(body.suppliers[0].name).toBe("Carres Manufacturing");
    expect(body.suppliers[0].kind).toBe("own_logistics");
    expect(body.suppliers[1].kind).toBe("factory_pickup");
    expect(body.suppliers[1].cat_covered).toEqual(["sofa"]);
  });

  it("returns 403 for non-operation role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/operation/suppliers", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when JWT is missing", async () => {
    const res = await app.fetch(
      new Request("http://t/api/operation/suppliers"),
      env,
    );
    expect(res.status).toBe(401);
  });
});

/**
 * ⭐ POST /api/operation/suppliers — THE FIRST SUPPLIER-CREATION DOOR
 * (2026-08-24).
 *
 * Before this the portal had none anywhere: no route, no screen. Every supplier
 * was inserted by hand in the SQL editor, so onboarding a factory was an
 * engineering task and a keyer who met a new supplier mid-catalog stopped.
 *
 * Nothing about RLS moved. `suppliers_principal_write` (0002) always said
 * principal-only; there was simply nothing to call.
 */
describe("POST /api/operation/suppliers", () => {
  function mockSb(opts: {
    clash?: { id: string; name: string } | null;
    inserted?: Record<string, unknown> | null;
    records?: Record<string, unknown>[];
  }) {
    vi.mocked(userClient).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: opts.clash ?? null, error: null }),
          }),
        }),
      }),
      rpc: async (name: string, body: Record<string, unknown>) => {
        expect(name).toBe("catalog_create_supplier_setup");
        opts.records?.push(body);
        return { data: opts.inserted ?? null, error: null };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  async function post(role: string, body: unknown) {
    const jwt = await makeJwt(role);
    return app.fetch(
      new Request("http://t/api/operation/suppliers", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
  }

  const OK = { name: "Hookka", kind: "factory_pickup", catCovered: ["sofa"], productionDays: [{ category: "sofa", workingDays: 14 }], offDays: [0] };

  it("creates the supplier and DERIVES its slug from the name", async () => {
    const records: Record<string, unknown>[] = [];
    mockSb({
      inserted: { id: "00000000-0000-0000-0000-000000000c09", name: "Hookka" },
      records,
    });
    const res = await post("principal", { ...OK, name: "  HoOKkA  " });
    expect(res.status).toBe(201);
    /* The slug is never typed. It is unique in production and keys SUPPLIER_SOP
       across environments (0032), so a keyer who has never heard the word
       cannot mistype it — and `HoOKkA` folds to the SAME slug the 0032 backfill
       wrote, so a supplier added today reads like one added by that migration. */
    expect(records[0]).toMatchObject({ p_name: "HoOKkA", p_slug: "hookka", p_production_days: OK.productionDays, p_off_days: [0] });
  });

  it("⭐ refuses a name that already exists, naming the supplier rather than the column", async () => {
    mockSb({ clash: { id: "00000000-0000-0000-0000-000000000c01", name: "HoOKkA" } });
    // A DIFFERENT spelling of the same name — the clash is found on the
    // derived slug, which is the whole reason to derive it.
    const res = await post("principal", { ...OK, name: "hookka" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("supplier_exists");
    // Names the SUPPLIER the keyer would recognise, not the column.
    expect(body.message).toContain("HoOKkA");
  });

  it("refuses a name with nothing sluggable in it", async () => {
    mockSb({ clash: null, inserted: null });
    const res = await post("principal", { ...OK, name: "!!!!" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    // Caught BEFORE the insert — a blank slug would hit a NOT NULL constraint
    // and surface as a raw 23502 about a column the keyer never saw.
    expect(body.code).toBe("unusable_name");
  });

  it("⭐ is PRINCIPAL only — the same boundary 0002 has always drawn", async () => {
    for (const role of ["operation", "dealer", "supplier"]) {
      const res = await post(role, OK);
      expect(res.status).toBe(403);
    }
    // And no Supabase round-trip happened for the refused roles.
    expect(vi.mocked(userClient)).not.toHaveBeenCalled();
  });

  it("rejects incomplete category setup without writing anything", async () => {
    const records: Record<string, unknown>[] = [];
    mockSb({ records });
    for (const body of [
      { ...OK, catCovered: [] }, { ...OK, productionDays: [] },
      { ...OK, catCovered: ["service"] }, { ...OK, offDays: [] },
      { ...OK, catCovered: ["sofa", "mattress"] },
    ]) expect((await post("principal", body)).status).toBe(422);
    expect(records).toEqual([]);
  });

  it("rejects an unknown key rather than dropping it", async () => {
    mockSb({ clash: null, inserted: null });
    const res = await post("principal", { ...OK, slug: "hand-picked" });
    // `.strict()` — the slug is DERIVED, so a caller trying to choose one is a
    // caller who has misunderstood something, not a caller to quietly ignore.
    expect(res.status).toBe(422);
  });
});
