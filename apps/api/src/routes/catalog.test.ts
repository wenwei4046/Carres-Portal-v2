import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import type {
  CatalogResponse,
  OutletsListResponse,
  SalespersonsListResponse,
} from "@carres/shared";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";

// Mock supabase clients so tests don't hit real Supabase. Each test installs
// its own per-table responses on the mocked userClient.
vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient } from "../lib/supabase";

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

async function makeJwt(role: string, dealerId: string | null) {
  return new SignJWT({
    email: "test@carres.com",
    app_metadata: { role, ...(dealerId ? { dealer_id: dealerId } : {}) },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

/**
 * buildSb — generic per-table-stub mock for supabase-js.
 *
 * Pass `tables: { product_models: [...rows], ... }` and an optional
 * `recordedFilters` ref that the mock will populate with `.is/.eq` calls per
 * table. Resolves any `.select().is()` / `.select().eq()` / `.select().order()`
 * / `.maybeSingle()` chain. Test asserts on `recordedFilters[table]`.
 */
type FilterCall = { method: "is" | "eq" | "order"; col: string; val: unknown };
type SbStub = ReturnType<typeof userClient>;

function buildSb(
  tables: Record<string, unknown[]>,
  recordedFilters: Record<string, FilterCall[]> = {},
): SbStub {
  const mk = (table: string) => {
    recordedFilters[table] ??= [];
    let rows = tables[table] ?? [];

    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.order = (col: string) => {
      recordedFilters[table].push({ method: "order", col, val: null });
      return Promise.resolve({ data: rows, error: null });
    };
    chain.is = (col: string, val: unknown) => {
      recordedFilters[table].push({ method: "is", col, val });
      // Filter the rows by `col is null` — only `is null` is used in our routes
      if (val === null) {
        rows = rows.filter((r) => (r as Record<string, unknown>)[col] === null);
      }
      return chain;
    };
    chain.eq = (col: string, val: unknown) => {
      recordedFilters[table].push({ method: "eq", col, val });
      rows = rows.filter((r) => (r as Record<string, unknown>)[col] === val);
      return chain;
    };
    chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null });
    return chain;
  };

  return {
    from: (table: string) => mk(table),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
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

const DEALER_ID = "00000000-0000-0000-0000-000000000d01";
const MODEL_ID_LIVE = "00000000-0000-0000-0000-00000000aa01";
const MODEL_ID_DEAD = "00000000-0000-0000-0000-00000000aa02";

describe("GET /api/catalog", () => {
  it("returns the bundle and filters discontinued models", async () => {
    const recorded: Record<string, FilterCall[]> = {};
    vi.mocked(userClient).mockReturnValue(
      buildSb(
        {
          product_models: [
            {
              id: MODEL_ID_LIVE,
              category: "mattress",
              model_key: "carres-classic",
              name: "Classic",
              blurb: null,
              colors: null,
              gaps: null,
              sofa_mode: null,
              discontinued_at: null,
            },
            {
              id: MODEL_ID_DEAD,
              category: "mattress",
              model_key: "carres-retired",
              name: "Retired",
              blurb: null,
              colors: null,
              gaps: null,
              sofa_mode: null,
              discontinued_at: "2025-01-01T00:00:00Z",
            },
          ],
          product_skus: [
            {
              id: "00000000-0000-0000-0000-00000000bb01",
              model_id: MODEL_ID_LIVE,
              sku: "mattress:carres-classic:queen",
              variant: "queen",
              variant_kind: "size",
              price: 1500,
            },
            {
              id: "00000000-0000-0000-0000-00000000bb02",
              model_id: MODEL_ID_DEAD,
              sku: "mattress:carres-retired:queen",
              variant: "queen",
              variant_kind: "size",
              price: 999,
            },
          ],
          sofa_fabrics: [],
          addons: [
            { key: "warranty5", name: "5-yr warranty", price: 200, active: true },
          ],
          floor_config: [
            { id: 1, free_up_to_floor: 2, per_floor_per_item: 50, updated_at: "2025-01-01T00:00:00Z" },
          ],
        },
        recorded,
      ),
    );

    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/catalog", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;

    // Discontinued model filtered (server-side `.is('discontinued_at', null)`)
    expect(recorded.product_models).toContainEqual({
      method: "is",
      col: "discontinued_at",
      val: null,
    });
    expect(body.models).toHaveLength(1);
    expect(body.models[0]?.id).toBe(MODEL_ID_LIVE);

    // Skus belonging to the discontinued model dropped client-side
    expect(body.skus).toHaveLength(1);
    expect(body.skus[0]?.modelId).toBe(MODEL_ID_LIVE);

    // Addons + floorConfig present, fabrics empty
    expect(body.addons).toHaveLength(1);
    expect(body.addons[0]?.key).toBe("warranty5");
    expect(body.sofaFabrics).toHaveLength(0);
    expect(body.floorConfig).toEqual({ id: 1, freeUpToFloor: 2, perFloorPerItem: 50 });

    // active=true filter on addons applied
    expect(recorded.addons).toContainEqual({ method: "eq", col: "active", val: true });

    // Cache hint
    // 0074 — switched from `private, max-age=300` to `no-store` so the
    // catalog admin invalidate-on-write flow isn't blocked by the browser's
    // HTTP cache (Loo 2026-05-09 sofa-model bug). React-query's staleTime
    // still handles client-side caching.
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("requires authentication (no JWT → 401)", async () => {
    const res = await app.fetch(new Request("http://t/api/catalog"), env);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/outlets", () => {
  it("returns outlets list (RLS handles dealer scope)", async () => {
    const recorded: Record<string, FilterCall[]> = {};
    vi.mocked(userClient).mockReturnValue(
      buildSb(
        {
          outlets: [
            {
              id: "00000000-0000-0000-0000-00000000ee01",
              dealer_id: DEALER_ID,
              name: "KL Showroom",
              address: "123 Jalan",
              created_at: "2025-01-01",
            },
          ],
        },
        recorded,
      ),
    );

    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/outlets", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OutletsListResponse;
    expect(body.outlets).toHaveLength(1);
    expect(body.outlets[0]).toMatchObject({
      id: "00000000-0000-0000-0000-00000000ee01",
      dealerId: DEALER_ID,
      name: "KL Showroom",
    });
    expect(recorded.outlets).toContainEqual({ method: "order", col: "name", val: null });
  });
});

describe("GET /api/salespersons", () => {
  it("returns SPs list (RLS handles dealer scope)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        salespersons: [
          {
            id: "00000000-0000-0000-0000-00000000ff01",
            dealer_id: DEALER_ID,
            outlet_id: "00000000-0000-0000-0000-00000000ee01",
            name: "Alice",
            phone: "+60123",
            user_id: null,
            created_at: "2025-01-01",
          },
        ],
      }),
    );

    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/salespersons", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as SalespersonsListResponse;
    expect(body.salespersons).toHaveLength(1);
    expect(body.salespersons[0]).toMatchObject({
      id: "00000000-0000-0000-0000-00000000ff01",
      dealerId: DEALER_ID,
      outletId: "00000000-0000-0000-0000-00000000ee01",
      name: "Alice",
    });
  });

  it("narrows by outletId query param", async () => {
    const recorded: Record<string, FilterCall[]> = {};
    const OUTLET_ID = "00000000-0000-0000-0000-00000000ee01";
    vi.mocked(userClient).mockReturnValue(
      buildSb(
        {
          salespersons: [
            {
              id: "00000000-0000-0000-0000-00000000ff01",
              dealer_id: DEALER_ID,
              outlet_id: OUTLET_ID,
              name: "Alice",
              phone: null,
              user_id: null,
              created_at: "2025-01-01",
            },
          ],
        },
        recorded,
      ),
    );

    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request(`http://t/api/salespersons?outletId=${OUTLET_ID}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(recorded.salespersons).toContainEqual({
      method: "eq",
      col: "outlet_id",
      val: OUTLET_ID,
    });
  });
});

// ---------------------------------------------------------------------------
// 0074 catalog admin (Loo 2026-05-09 Q2=c). Principal + logistics manage the
// SKU catalog. Tests use a small write-aware mock since buildSb above only
// covers read chains.
// ---------------------------------------------------------------------------

interface AdminCall {
  table: string;
  op: "insert" | "update";
  payload: unknown;
}

function buildWriteSb(opts: {
  /** Pre-baked rows the read paths return (e.g. model lookup before SKU insert). */
  reads?: Record<string, unknown[]>;
  /** Row that .single()/.maybeSingle() returns from the write chain. */
  writeReturn?: Record<string, unknown> | null;
  recorded?: AdminCall[];
}): SbStub {
  const recorded = opts.recorded ?? [];
  const reads = opts.reads ?? {};
  const writeReturn = opts.writeReturn ?? null;

  const mk = (table: string) => {
    let rows: unknown[] = reads[table] ?? [];
    let mode: "read" | "write" = "read";
    let writeBody: unknown = null;

    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.insert = (body: unknown) => {
      mode = "write";
      writeBody = body;
      recorded.push({ table, op: "insert", payload: body });
      return chain;
    };
    chain.update = (body: unknown) => {
      mode = "write";
      writeBody = body;
      recorded.push({ table, op: "update", payload: body });
      return chain;
    };
    chain.eq = (col: string, val: unknown) => {
      if (mode === "read") {
        rows = rows.filter((r) => (r as Record<string, unknown>)[col] === val);
      }
      return chain;
    };
    // 0074 — `.contains(col, [value])` for the supplier auto-resolve path.
    // Tests stub the row(s) directly, so we just no-op the filter — the
    // arrange step is responsible for seeding the right row.
    chain.contains = (_col: string, _val: unknown) => chain;
    chain.limit = (_n: number) => chain;
    chain.maybeSingle = async () => {
      if (mode === "write") return { data: writeReturn, error: null };
      return { data: rows[0] ?? null, error: null };
    };
    chain.single = async () => {
      if (mode === "write") return { data: writeReturn, error: null };
      return { data: rows[0] ?? null, error: null };
    };
    void writeBody; // silenced; the recorded payload is what assertions read
    return chain;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (table: string) => mk(table) } as any;
}

describe("Catalog admin — POST /api/catalog/models", () => {
  it("inserts a new model and returns 201 with the camelCase DTO", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          id: MODEL_ID_LIVE,
          category: "mattress",
          model_key: "carres-hybrid",
          name: "Carres Hybrid",
          blurb: null,
          colors: null,
          gaps: null,
          sofa_mode: null,
          discontinued_at: null,
        },
      }),
    );
    const jwt = await makeJwt("logistics", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/models", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "mattress",
          modelKey: "carres-hybrid",
          name: "Carres Hybrid",
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { model: { name: string; modelKey: string } };
    expect(body.model.modelKey).toBe("carres-hybrid");
    expect(recorded[0]?.op).toBe("insert");
  });

  it("422s on invalid modelKey (not kebab-case)", async () => {
    const jwt = await makeJwt("logistics", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/models", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "mattress",
          modelKey: "Carres Hybrid", // spaces + caps disallowed
          name: "Carres Hybrid",
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

describe("Catalog admin — PATCH /api/catalog/models/:id", () => {
  it("updates allowed fields and returns the patched DTO", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          id: MODEL_ID_LIVE,
          category: "mattress",
          model_key: "carres-classic",
          name: "Classic Renamed",
          blurb: "new blurb",
          colors: null,
          gaps: null,
          sofa_mode: null,
          discontinued_at: null,
        },
      }),
    );
    const jwt = await makeJwt("logistics", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Classic Renamed", blurb: "new blurb" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const update = recorded.find((r) => r.op === "update");
    expect(update?.payload).toMatchObject({
      name: "Classic Renamed",
      blurb: "new blurb",
    });
  });

  it("422s when the patch body is empty", async () => {
    const jwt = await makeJwt("logistics", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

describe("Catalog admin — DELETE /api/catalog/models/:id (soft-delete)", () => {
  it("stamps discontinued_at and returns ok", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: { id: MODEL_ID_LIVE },
      }),
    );
    const jwt = await makeJwt("logistics", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toMatchObject({});
    expect((upd!.payload as { discontinued_at: string }).discontinued_at).toBeTruthy();
  });
});

describe("Catalog admin — POST /api/catalog/skus", () => {
  it("derives sku string from model.category + model_key + variant", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        reads: {
          // Mock filters by .eq("id", modelId) when looking up the model
          // before deriving the sku string — must include `id` so the eq
          // filter retains the row.
          product_models: [
            {
              id: MODEL_ID_LIVE,
              category: "mattress",
              model_key: "carres-classic",
            },
          ],
          // 0074 — POST /skus auto-resolves the supplier from
          // suppliers.cat_covered so logistics doesn't have to pick one.
          // Stub a mattress-covering supplier here.
          suppliers: [
            {
              id: "00000000-0000-0000-0000-00000000ff01",
              cat_covered: ["mattress"],
            },
          ],
        },
        recorded,
        writeReturn: {
          id: "00000000-0000-0000-0000-00000000bb01",
          model_id: MODEL_ID_LIVE,
          sku: "mattress:carres-classic:Twin",
          variant: "Twin",
          variant_kind: "size",
          price: 2400,
          cost: 1300,
          supplier_id: "00000000-0000-0000-0000-00000000ff01",
          discontinued_at: null,
        },
      }),
    );
    const jwt = await makeJwt("logistics", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/skus", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: MODEL_ID_LIVE,
          variant: "Twin",
          variantKind: "size",
          price: 2400,
          cost: 1300,
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const insert = recorded.find((r) => r.op === "insert");
    expect((insert?.payload as { sku: string }).sku).toBe(
      "mattress:carres-classic:Twin",
    );
    expect((insert?.payload as { cost: number }).cost).toBe(1300);
  });
});

describe("Catalog admin — PATCH /api/catalog/skus/:id", () => {
  it("updates cost only when only cost is sent", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          id: "00000000-0000-0000-0000-00000000bb01",
          model_id: MODEL_ID_LIVE,
          sku: "mattress:carres-classic:queen",
          variant: "queen",
          variant_kind: "size",
          price: 1500,
          cost: 950,
          supplier_id: null,
          discontinued_at: null,
        },
      }),
    );
    const jwt = await makeJwt("logistics", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/skus/00000000-0000-0000-0000-00000000bb01", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cost: 950 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toEqual({ cost: 950 });
  });
});

describe("Catalog admin — sofa fabrics CRUD", () => {
  it("POST /sofa-fabrics inserts and returns 201", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          id: "00000000-0000-0000-0000-00000000cc01",
          model_id: MODEL_ID_LIVE,
          fabric_name: "Linen Slate",
          surcharge: 250,
          discontinued_at: null,
        },
      }),
    );
    const jwt = await makeJwt("logistics", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/sofa-fabrics", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: MODEL_ID_LIVE,
          fabricName: "Linen Slate",
          surcharge: 250,
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.payload).toEqual({
      model_id: MODEL_ID_LIVE,
      fabric_name: "Linen Slate",
      surcharge: 250,
      // 0075 — colors defaults to null when caller omits the field.
      colors: null,
    });
  });

  it("DELETE /sofa-fabrics/:id soft-deletes via discontinued_at", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: { id: "00000000-0000-0000-0000-00000000cc01" },
      }),
    );
    const jwt = await makeJwt("logistics", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/sofa-fabrics/00000000-0000-0000-0000-00000000cc01", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect((upd!.payload as { discontinued_at: string }).discontinued_at).toBeTruthy();
  });
});
