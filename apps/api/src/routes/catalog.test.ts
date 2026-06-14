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
    // c132b97 — GET /api/catalog pages product_skus via `.range(from, to)` to
    // beat Supabase's 1000-row REST cap. The mock returns the whole stubbed
    // set in one page (test fixtures are always < 1000 rows, so fetchAllSkus
    // breaks after the first page).
    chain.range = (_from: number, _to: number) =>
      Promise.resolve({ data: rows, error: null });
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
              supplier_id: null,
            },
            {
              id: "00000000-0000-0000-0000-00000000bb02",
              model_id: MODEL_ID_DEAD,
              sku: "mattress:carres-retired:queen",
              variant: "queen",
              variant_kind: "size",
              price: 999,
              supplier_id: null,
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
// 0074 catalog admin (Loo 2026-05-09 Q2=c). Principal + operation manage the
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
    const jwt = await makeJwt("operation", null);
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
    const jwt = await makeJwt("operation", null);
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
    const jwt = await makeJwt("operation", null);
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
    const jwt = await makeJwt("operation", null);
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
    const jwt = await makeJwt("operation", null);
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
  it("derives sku as {MODEL_KEY}-{variant} (Loo 2026-06-14, dash format)", async () => {
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
          // suppliers.cat_covered so operation doesn't have to pick one.
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
          sku: "CARRES-CLASSIC-Twin",
          variant: "Twin",
          variant_kind: "size",
          price: 2400,
          cost: 1300,
          supplier_id: "00000000-0000-0000-0000-00000000ff01",
          discontinued_at: null,
        },
      }),
    );
    const jwt = await makeJwt("operation", null);
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
    expect((insert?.payload as { sku: string }).sku).toBe("CARRES-CLASSIC-Twin");
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
    const jwt = await makeJwt("operation", null);
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
    const jwt = await makeJwt("operation", null);
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
    const jwt = await makeJwt("operation", null);
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

// ---------------------------------------------------------------------------
// 0169-0173 — Product & Maintenance endpoints (pos_active filter, sizes-active
// cascade, generate-skus idempotency, service no-supplier relaxation, photo
// sign-upload + role gates, floor-config + addons).
// ---------------------------------------------------------------------------

/**
 * scriptedSb — a more capable mock than buildWriteSb for the multi-query
 * endpoints. Each `.from(table)` chain is BOTH thenable (so routes that
 * `await sb.from(...).update().eq()` directly resolve to `{data,error}`) AND
 * exposes `.maybeSingle()/.single()`. `.then` returns the inserted rows once
 * `.insert()` ran on that chain, else `reads[table+"__list"]`.
 */
function scriptedSb(opts: {
  reads?: Record<string, unknown>;
  inserted?: unknown[];
  records?: { table: string; op: "insert" | "update"; body: unknown }[];
}): SbStub {
  const reads = opts.reads ?? {};
  const inserted = opts.inserted ?? [{ id: "00000000-0000-0000-0000-0000000insrt" }];
  const records = opts.records ?? [];
  const mk = (table: string) => {
    let didInsert = false;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.in = () => chain;
    chain.contains = () => chain;
    chain.limit = () => chain;
    chain.is = () => chain;
    chain.order = () => chain;
    chain.insert = (body: unknown) => {
      didInsert = true;
      records.push({ table, op: "insert", body });
      return chain;
    };
    chain.update = (body: unknown) => {
      records.push({ table, op: "update", body });
      return chain;
    };
    chain.maybeSingle = async () => ({ data: reads[table] ?? null, error: null });
    chain.single = async () => ({
      data: didInsert ? inserted[0] ?? null : reads[table] ?? null,
      error: null,
    });
    chain.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
      resolve({ data: didInsert ? inserted : (reads[`${table}__list`] ?? []), error: null });
    return chain;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (table: string) => mk(table) } as any;
}

describe("GET /api/catalog — pos_active sell-side filter (0170)", () => {
  const SKU_ON = "00000000-0000-0000-0000-00000000bb10";
  const SKU_OFF = "00000000-0000-0000-0000-00000000bb11";

  function bundle() {
    return {
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
          photo_url: null,
          allowed_options: {},
        },
      ],
      product_skus: [
        {
          id: SKU_ON,
          model_id: MODEL_ID_LIVE,
          sku: "CARRES-CLASSIC-Queen",
          variant: "Queen",
          variant_kind: "size",
          price: 1500,
          cost: null,
          supplier_id: null,
          discontinued_at: null,
          pos_active: true,
          description: null,
        },
        {
          id: SKU_OFF,
          model_id: MODEL_ID_LIVE,
          sku: "CARRES-CLASSIC-King",
          variant: "King",
          variant_kind: "size",
          price: 1800,
          cost: null,
          supplier_id: null,
          discontinued_at: null,
          pos_active: false,
          description: null,
        },
      ],
      sofa_fabrics: [],
      addons: [],
      floor_config: [{ id: 1, free_up_to_floor: 2, per_floor_per_item: 50 }],
    };
  }

  it("dealer (non-admin) bundle drops pos_active=false SKUs", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb(bundle()));
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;
    expect(body.skus.map((s) => s.id)).toEqual([SKU_ON]);
  });

  it("admin bundle keeps OFF SKUs so the editor can toggle them back on", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb(bundle()));
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog?admin=true", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;
    expect(body.skus.map((s) => s.id).sort()).toEqual([SKU_ON, SKU_OFF].sort());
    expect(body.skus.find((s) => s.id === SKU_OFF)?.posActive).toBe(false);
  });
});

describe("POST /api/catalog/skus — service category no-supplier relaxation (0171)", () => {
  it("inserts a service SKU with supplier_id null (no 422)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        reads: {
          product_models: [
            { id: MODEL_ID_LIVE, category: "service", model_key: "service-addons" },
          ],
          // NOTE: no suppliers row — a service SKU must insert anyway.
        },
        recorded,
        writeReturn: {
          id: "00000000-0000-0000-0000-00000000bb20",
          model_id: MODEL_ID_LIVE,
          sku: "SERVICE-ADDONS-Install",
          variant: "Install",
          variant_kind: "preset",
          price: 120,
          cost: null,
          supplier_id: null,
          discontinued_at: null,
          pos_active: true,
          description: null,
        },
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/skus", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: MODEL_ID_LIVE,
          variant: "Install",
          variantKind: "preset",
          price: 120,
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const insert = recorded.find((r) => r.op === "insert");
    expect((insert?.payload as { supplier_id: unknown }).supplier_id).toBeNull();
  });
});

describe("PATCH /api/catalog/models/:id/sizes-active (0171 cascade)", () => {
  it("writes allowed_options.sizes + cascades pos_active, never discontinued_at", async () => {
    const records: { table: string; op: "insert" | "update"; body: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue(
      scriptedSb({
        reads: { product_models: { allowed_options: { sizes: ["Queen"] } } },
        records,
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}/sizes-active`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sizes: ["Queen", "King"] }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; sizes: string[] };
    expect(body.sizes).toEqual(["Queen", "King"]);

    const modelUpdate = records.find((r) => r.table === "product_models");
    expect((modelUpdate?.body as { allowed_options: { sizes: string[] } }).allowed_options.sizes).toEqual([
      "Queen",
      "King",
    ]);
    // Two cascade updates on product_skus (all-off, then in-set-on).
    const skuUpdates = records.filter((r) => r.table === "product_skus");
    expect(skuUpdates).toHaveLength(2);
    expect(skuUpdates.map((u) => (u.body as { pos_active: boolean }).pos_active)).toEqual([
      false,
      true,
    ]);
    // The cascade NEVER touches discontinued_at.
    for (const r of records) {
      expect(r.body).not.toHaveProperty("discontinued_at");
    }
  });

  it("403s for a dealer (internal-only)", async () => {
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}/sizes-active`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sizes: ["Queen"] }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/catalog/models/:id/generate-skus (idempotent skip)", () => {
  it("skips existing codes and only inserts the missing variant", async () => {
    const records: { table: string; op: "insert" | "update"; body: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue(
      scriptedSb({
        reads: {
          product_models: {
            category: "mattress",
            model_key: "carres-classic",
            allowed_options: { sizes: ["Queen", "King"] },
          },
          suppliers: { id: "00000000-0000-0000-0000-00000000ff01" },
          // Queen already exists → only King should be inserted.
          product_skus__list: [{ sku: "CARRES-CLASSIC-Queen" }],
        },
        inserted: [{ id: "00000000-0000-0000-0000-00000000bb30" }],
        records,
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}/generate-skus`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { generated: number; skipped: number };
    expect(body).toMatchObject({ generated: 1, skipped: 1 });
    const insert = records.find((r) => r.op === "insert");
    const rows = insert?.body as { sku: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sku).toBe("CARRES-CLASSIC-King");
  });
});

describe("Photo sign-upload — role gate + validation (0173)", () => {
  it("403s for a dealer", async () => {
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}/photo/sign-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: "image/jpeg", sizeBytes: 1000 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("422s an operation user on a non-image mime / oversize", async () => {
    vi.mocked(userClient).mockReturnValue(scriptedSb({}));
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}/photo/sign-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: "application/pdf", sizeBytes: 1000 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

describe("Maintenance — floor-config + addons role gate", () => {
  it("floor-config 403s for a dealer", async () => {
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/catalog/floor-config", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ freeUpToFloor: 3 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("floor-config patches free_up_to_floor for an internal user", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: { id: 1, free_up_to_floor: 3, per_floor_per_item: 60 },
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/floor-config", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ freeUpToFloor: 3, perFloorPerItem: 60 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toMatchObject({ free_up_to_floor: 3, per_floor_per_item: 60 });
  });

  it("addons POST inserts for an internal user", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          key: "dispose-mattress",
          name: "Dispose old mattress",
          price: 50,
          active: true,
          service_sku: "SVC-DISPOSE-MATTRESS",
        },
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/addons", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "dispose-mattress",
          name: "Dispose old mattress",
          price: 50,
          serviceSku: "SVC-DISPOSE-MATTRESS",
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.payload).toMatchObject({
      key: "dispose-mattress",
      service_sku: "SVC-DISPOSE-MATTRESS",
    });
  });

  it("addons POST 422s an invalid service SKU code", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/addons", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "bad-addon",
          name: "Bad addon",
          price: 10,
          serviceSku: "NOT-A-SVC-CODE",
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});
