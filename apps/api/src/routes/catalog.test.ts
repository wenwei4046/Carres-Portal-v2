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
          // 0176 — fabric tier tables (seeded to zero deltas + no overrides).
          fabric_tier_addon_config: [
            { id: 1, sofa_tier2_delta: 0, sofa_tier3_delta: 0, updated_at: "2025-01-01T00:00:00Z", updated_by: null },
          ],
          model_fabric_tier_overrides: [],
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

    // 0176 — fabricTierConfig seeded at {0,0} + no model overrides
    expect(body.fabricTierConfig).toEqual({ sofaTier2Delta: 0, sofaTier3Delta: 0 });
    expect(body.modelFabricTierOverrides).toEqual([]);

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
  op: "insert" | "update" | "upsert" | "delete";
  payload: unknown;
}

function buildWriteSb(opts: {
  /** Pre-baked rows the read paths return (e.g. model lookup before SKU insert). */
  reads?: Record<string, unknown[]>;
  /** Row that .single()/.maybeSingle() returns from the write chain. */
  writeReturn?: Record<string, unknown> | null;
  /** Error the write chain's .single()/.maybeSingle() returns (e.g. 23505). */
  writeError?: { code?: string; message?: string } | null;
  recorded?: AdminCall[];
}): SbStub {
  const recorded = opts.recorded ?? [];
  const reads = opts.reads ?? {};
  const writeReturn = opts.writeReturn ?? null;
  const writeError = opts.writeError ?? null;

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
    // 0176 — upsert support for model-fabric-tier-override route.
    chain.upsert = (body: unknown, _opts?: unknown) => {
      mode = "write";
      writeBody = body;
      recorded.push({ table, op: "upsert", payload: body });
      return chain;
    };
    // 0178 — delete support for the per-model offered un-offer route. The route
    // does `.delete().eq().eq()` then awaits the (non-thenable) chain → error
    // undefined → ok; we just record the op for assertions.
    chain.delete = () => {
      mode = "write";
      recorded.push({ table, op: "delete", payload: null });
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
    // Phase 5 — `.not(col, "is", null)` for the compartment-sku supplier inherit
    // (product_skus where supplier_id is not null). Filters in read mode only.
    chain.not = (col: string, op: string, val: unknown) => {
      if (mode === "read" && op === "is" && val === null) {
        rows = rows.filter((r) => {
          const v = (r as Record<string, unknown>)[col];
          return v !== null && v !== undefined;
        });
      }
      return chain;
    };
    chain.limit = (_n: number) => chain;
    chain.maybeSingle = async () => {
      if (mode === "write") return { data: writeError ? null : writeReturn, error: writeError };
      return { data: rows[0] ?? null, error: null };
    };
    chain.single = async () => {
      if (mode === "write") return { data: writeError ? null : writeReturn, error: writeError };
      return { data: rows[0] ?? null, error: null };
    };
    // Thenable — list reads awaited directly (`await sb.from(t).select().eq()`),
    // e.g. the size-pool lookup behind the bed auto-description. Write-mode await
    // mirrors maybeSingle so the delete-route bare await keeps its falsy error.
    // Read-mode results carry `count` (= filtered row count) so the empty-model
    // cleanup's `{ count: "exact", head: true }` probe works against `reads`.
    chain.then = (resolve: (v: { data: unknown; error: unknown; count?: number }) => unknown) =>
      resolve(
        mode === "write"
          ? { data: writeError ? null : writeReturn, error: writeError }
          : { data: rows, error: null, count: rows.length },
      );
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

// Loo 2026-07-20 — SKU Delete is PERMANENT (a real DELETE, no discontinued_at
// stamp). Models keep the soft-delete above; the compartment un-offer path
// keeps soft-discontinuing its synced sku (asserted in the un-offer test).
describe("Catalog admin — DELETE /api/catalog/skus/:id (hard delete)", () => {
  const SKU_ID = "00000000-0000-0000-0000-00000000bb01";
  // The route pre-fetches the target by id (compartment gate) BEFORE deleting,
  // so every non-404 test seeds the target row in reads.product_skus. The
  // SAME reads array later serves the post-delete count (filtered by the
  // model_id the DELETE returned) — the mock is a static snapshot, so the
  // last-SKU test gives the seeded target a model_id the count filter won't
  // match (the row "left with the delete").
  const targetRow = (over: Record<string, unknown> = {}) => ({
    id: SKU_ID,
    model_id: MODEL_ID_LIVE,
    compartment_id: null,
    ...over,
  });

  it("issues a real DELETE (no discontinued_at update) and returns ok", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        reads: { product_skus: [targetRow()] },
        writeReturn: { id: SKU_ID, model_id: MODEL_ID_LIVE },
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(recorded.find((r) => r.op === "delete" && r.table === "product_skus")).toBeTruthy();
    expect(recorded.find((r) => r.op === "update")).toBeUndefined();
    // A plain (non-compartment) sku never touches the offer table.
    expect(
      recorded.find((r) => r.op === "delete" && r.table === "model_sofa_compartments"),
    ).toBeUndefined();
  });

  it("404s when the sku does not exist", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({ writeReturn: null }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  // Loo 2026-07-20 — "when no more that model sku anymore": deleting a model's
  // LAST SKU deletes the now-empty model too (its chip must leave SKU Master).
  it("deleting the model's LAST SKU also deletes the now-empty model", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        // Only the target itself, under a model_id the count filter won't
        // match → post-delete count for MODEL_ID_LIVE reads 0.
        reads: {
          product_skus: [targetRow({ model_id: "00000000-0000-0000-0000-00000000dead" })],
        },
        writeReturn: { id: SKU_ID, model_id: MODEL_ID_LIVE },
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(recorded.find((r) => r.op === "delete" && r.table === "product_skus")).toBeTruthy();
    expect(recorded.find((r) => r.op === "delete" && r.table === "product_models")).toBeTruthy();
    const body = (await res.json()) as { ok: boolean; modelDeleted: boolean };
    expect(body.modelDeleted).toBe(true);
  });

  it("keeps the model when OTHER SKUs (even discontinued) remain", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        reads: {
          product_skus: [
            targetRow(),
            { id: "00000000-0000-0000-0000-00000000bb02", model_id: MODEL_ID_LIVE },
          ],
        },
        writeReturn: { id: SKU_ID, model_id: MODEL_ID_LIVE },
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(recorded.find((r) => r.op === "delete" && r.table === "product_models")).toBeUndefined();
    const body = (await res.json()) as { ok: boolean; modelDeleted: boolean };
    expect(body.modelDeleted).toBe(false);
  });

  // Loo 2026-07-21 — deleting a COMPARTMENT sku also un-offers the compartment
  // on its model (the Booqit HEADREST ghost: sku deleted, Modular still ON,
  // POS builder still offering an unorderable compartment).
  it("compartment sku (principal): deletes the model_sofa_compartments offer row too", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        reads: {
          product_skus: [
            targetRow({ compartment_id: "00000000-0000-0000-0000-00000000cc01" }),
            { id: "00000000-0000-0000-0000-00000000bb02", model_id: MODEL_ID_LIVE },
          ],
        },
        writeReturn: { id: SKU_ID, model_id: MODEL_ID_LIVE },
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // Offer removed BEFORE the sku delete (never a ghost offer).
    const ops = recorded.filter((r) => r.op === "delete").map((r) => r.table);
    expect(ops.indexOf("model_sofa_compartments")).toBeGreaterThanOrEqual(0);
    expect(ops.indexOf("model_sofa_compartments")).toBeLessThan(ops.indexOf("product_skus"));
  });

  it("compartment sku (non-principal): 403 — the offer cleanup is principal-only, nothing deleted", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        reads: {
          product_skus: [
            targetRow({ compartment_id: "00000000-0000-0000-0000-00000000cc01" }),
          ],
        },
        writeReturn: { id: SKU_ID, model_id: MODEL_ID_LIVE },
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(recorded.find((r) => r.op === "delete")).toBeUndefined();
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
    // 0175 — setting price+cost on create is principal-only (Master Admin).
    const jwt = await makeJwt("principal", null);
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

  // Loo 2026-07-11 — accessory/service carry NO size/variant axis (one SKU per
  // model): an EMPTY variant is allowed for them and the sku code is the bare
  // MODEL_KEY (no dash suffix). Every other category still requires a variant.
  it("accessory with an EMPTY variant → 201, sku = bare MODEL_KEY", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        reads: {
          product_models: [
            {
              id: MODEL_ID_LIVE,
              category: "accessory",
              model_key: "memory-foam-pillow",
            },
          ],
        },
        recorded,
        writeReturn: {
          id: "00000000-0000-0000-0000-00000000bb02",
          model_id: MODEL_ID_LIVE,
          sku: "MEMORY-FOAM-PILLOW",
          variant: "",
          variant_kind: "preset",
          price: 99,
          cost: null,
          supplier_id: null,
          discontinued_at: null,
        },
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/skus", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: MODEL_ID_LIVE,
          variant: "",
          variantKind: "preset",
          price: 99,
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const insert = recorded.find((r) => r.op === "insert");
    expect((insert?.payload as { sku: string }).sku).toBe("MEMORY-FOAM-PILLOW");
    expect((insert?.payload as { variant: string }).variant).toBe("");
    // Supplierless category — supplier_id stays null, no cat_covered lookup.
    expect((insert?.payload as { supplier_id: string | null }).supplier_id).toBeNull();
  });

  it("mattress with an EMPTY variant → 422 variant_required", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        reads: {
          product_models: [
            { id: MODEL_ID_LIVE, category: "mattress", model_key: "carres-classic" },
          ],
        },
        recorded: [],
        writeReturn: {},
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/skus", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: MODEL_ID_LIVE,
          variant: "",
          variantKind: "size",
          price: 2400,
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("variant_required");
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
    // 0175 — changing cost is principal-only (Master Admin).
    const jwt = await makeJwt("principal", null);
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

  // Loo 2026-07-11 — the CODE is a free, directly-renameable field; a variant
  // (SIZE) edit never touches it. Clearing the variant ('') is allowed ONLY
  // for the no-variant-axis categories (accessory/service); others 422.
  it("PATCH sku renames the code directly (free field)", async () => {
    const SKU_ID = "00000000-0000-0000-0000-00000000bb02";
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          id: SKU_ID,
          model_id: MODEL_ID_LIVE,
          sku: "ACC-777",
          variant: "",
          variant_kind: "preset",
          price: 99,
          cost: null,
          supplier_id: null,
          discontinued_at: null,
        },
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "ACC-777" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toEqual({ sku: "ACC-777" });
  });

  it("PATCH variant '' on an accessory → variant cleared, code untouched", async () => {
    const SKU_ID = "00000000-0000-0000-0000-00000000bb02";
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        reads: {
          product_skus: [{ id: SKU_ID, model_id: MODEL_ID_LIVE }],
          product_models: [
            { id: MODEL_ID_LIVE, category: "accessory", model_key: "memory-foam-pillow" },
          ],
        },
        recorded,
        writeReturn: {
          id: SKU_ID,
          model_id: MODEL_ID_LIVE,
          sku: "MEMORY-FOAM-PILLOW-asd",
          variant: "",
          variant_kind: "preset",
          price: 99,
          cost: null,
          supplier_id: null,
          discontinued_at: null,
        },
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ variant: "" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toEqual({ variant: "" });
  });

  it("PATCH variant '' on a mattress → 422 variant_required", async () => {
    const SKU_ID = "00000000-0000-0000-0000-00000000bb03";
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        reads: {
          product_skus: [{ id: SKU_ID, model_id: MODEL_ID_LIVE }],
          product_models: [
            { id: MODEL_ID_LIVE, category: "mattress", model_key: "carres-classic" },
          ],
        },
        recorded: [],
        writeReturn: {},
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ variant: "" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("variant_required");
  });
});

// ---------------------------------------------------------------------------
// 0175 — Master-Admin pricing lock (relaxed 0226). price / pwp_price /
// pricesBySize stay principal-only; COST (the buying price) is writable by
// operation + principal since 0226 (the Operation Catalog records it). The DB
// trigger is the real boundary; this API gate returns a clean 403 before the
// round-trip. All OTHER SKU edits stay open to internal (operation) roles, and
// a non-principal may still create an UNPRICED sku (price 0).
// ---------------------------------------------------------------------------
describe("0175/0226 — SKU pricing lock", () => {
  const SKU_ID = "00000000-0000-0000-0000-00000000bb01";

  it("PATCH price by a non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ price: 1999 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toMatch(/Master Admin/i);
  });

  // 0226 — cost is operation-writable (the Operation Catalog records buying
  // prices). price stays locked (asserted above); non-internal roles stay out.
  it("PATCH cost by operation → allowed (0226)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          id: SKU_ID,
          model_id: MODEL_ID_LIVE,
          sku: "CARRES-CLASSIC-Queen",
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
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
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

  it("PATCH cost:null (clearing) by operation → allowed (0226)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          id: SKU_ID,
          model_id: MODEL_ID_LIVE,
          sku: "CARRES-CLASSIC-Queen",
          variant: "queen",
          variant_kind: "size",
          price: 1500,
          cost: null,
          supplier_id: null,
          discontinued_at: null,
        },
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cost: null }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toEqual({ cost: null });
  });

  it("PATCH cost by a dealer → 403 (cost is internal-only)", async () => {
    const jwt = await makeJwt("dealer", "00000000-0000-0000-0000-00000000dd01");
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cost: 950 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toMatch(/operation or the principal/i);
  });

  it("PATCH a non-price/cost field (pos_active) by a non-principal → allowed", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          id: SKU_ID,
          model_id: MODEL_ID_LIVE,
          sku: "CARRES-CLASSIC-Queen",
          variant: "queen",
          variant_kind: "size",
          price: 1500,
          cost: null,
          supplier_id: null,
          discontinued_at: null,
          pos_active: false,
          description: null,
        },
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ posActive: false }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toEqual({ pos_active: false });
  });

  it("PATCH price by the principal → allowed", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          id: SKU_ID,
          model_id: MODEL_ID_LIVE,
          sku: "CARRES-CLASSIC-Queen",
          variant: "queen",
          variant_kind: "size",
          price: 1999,
          cost: null,
          supplier_id: null,
          discontinued_at: null,
          pos_active: true,
          description: null,
        },
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ price: 1999 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toMatchObject({ price: 1999 });
  });

  it("POST a priced sku by a non-principal → 403", async () => {
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
        }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  // 0226 — operation may seed the buying cost on create (price must stay 0).
  it("POST an unpriced-but-costed sku by operation → allowed (0226)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        reads: {
          product_models: [
            { id: MODEL_ID_LIVE, category: "mattress", model_key: "carres-classic" },
          ],
          suppliers: [
            { id: "00000000-0000-0000-0000-00000000ff01", cat_covered: ["mattress"] },
          ],
        },
        recorded,
        writeReturn: {
          id: SKU_ID,
          model_id: MODEL_ID_LIVE,
          sku: "CARRES-CLASSIC-Twin",
          variant: "Twin",
          variant_kind: "size",
          price: 0,
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
          price: 0,
          cost: 1300,
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const insert = recorded.find((r) => r.op === "insert");
    expect((insert?.payload as { cost: number }).cost).toBe(1300);
  });

  it("POST a costed sku by a dealer → 403", async () => {
    const jwt = await makeJwt("dealer", "00000000-0000-0000-0000-00000000dd01");
    const res = await app.fetch(
      new Request("http://t/api/catalog/skus", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: MODEL_ID_LIVE,
          variant: "Twin",
          variantKind: "size",
          price: 0,
          cost: 1300,
        }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("POST an UNPRICED sku (price 0 / cost null) by a non-principal → allowed", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        reads: {
          product_models: [
            { id: MODEL_ID_LIVE, category: "mattress", model_key: "carres-classic" },
          ],
          suppliers: [
            { id: "00000000-0000-0000-0000-00000000ff01", cat_covered: ["mattress"] },
          ],
        },
        recorded,
        writeReturn: {
          id: SKU_ID,
          model_id: MODEL_ID_LIVE,
          sku: "CARRES-CLASSIC-Twin",
          variant: "Twin",
          variant_kind: "size",
          price: 0,
          cost: null,
          supplier_id: "00000000-0000-0000-0000-00000000ff01",
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
          variant: "Twin",
          variantKind: "size",
          price: 0,
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const insert = recorded.find((r) => r.op === "insert");
    expect((insert?.payload as { price: number }).price).toBe(0);
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
          tier: "PRICE_1",
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
      // 0176 — tier defaults to PRICE_1 when caller omits the field.
      tier: "PRICE_1",
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
      // 0176 — fabric tier tables required by the new parallel bundle fetch.
      fabric_tier_addon_config: [
        { id: 1, sofa_tier2_delta: 0, sofa_tier3_delta: 0, updated_at: "2025-01-01T00:00:00Z", updated_by: null },
      ],
      model_fabric_tier_overrides: [],
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
    // 0175 — setting price on create is principal-only (Master Admin).
    const jwt = await makeJwt("principal", null);
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
          // Queen already exists (SHORT code suffix) → only King should insert.
          product_skus__list: [{ sku: "CARRES-CLASSIC-Q" }],
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
    const rows = insert?.body as { sku: string; variant: string }[];
    expect(rows).toHaveLength(1);
    // SHORT code suffix, FULL name variant — the SIZE reads "King", not "K".
    expect(rows[0]?.sku).toBe("CARRES-CLASSIC-K");
    expect(rows[0]?.variant).toBe("King");
  });

  it("expands raw bed-size codes to full-name variants (K→King, SS→Super Single)", async () => {
    const records: { table: string; op: "insert" | "update"; body: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue(
      scriptedSb({
        reads: {
          product_models: {
            category: "mattress",
            model_key: "lumi-classic",
            allowed_options: {},
          },
          suppliers: { id: "00000000-0000-0000-0000-00000000ff01" },
          product_skus__list: [],
        },
        inserted: [
          { id: "00000000-0000-0000-0000-00000000bb31" },
          { id: "00000000-0000-0000-0000-00000000bb32" },
        ],
        records,
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}/generate-skus`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ variants: ["K", "SS"] }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const rows = records.find((r) => r.op === "insert")?.body as {
      sku: string;
      variant: string;
    }[];
    expect(rows).toEqual([
      expect.objectContaining({ sku: "LUMI-CLASSIC-K", variant: "King" }),
      expect.objectContaining({ sku: "LUMI-CLASSIC-SS", variant: "Super Single" }),
    ]);
  });

  // Loo 2026-07-21 — adding a size to an EXISTING model unions it into
  // allowed_options.sizes (the sizes-active cascade / POS size source);
  // deliberately-inactive existing sizes are never clobbered (union, not
  // replace), and an already-listed size triggers no write.
  it("unions freshly generated sizes into allowed_options.sizes", async () => {
    const records: { table: string; op: "insert" | "update"; body: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue(
      scriptedSb({
        reads: {
          product_models: {
            category: "mattress",
            model_key: "forte",
            allowed_options: { sizes: ["Queen"], specials: ["X1"] },
          },
          suppliers: { id: "00000000-0000-0000-0000-00000000ff01" },
          product_skus__list: [],
        },
        inserted: [{ id: "00000000-0000-0000-0000-00000000bb33" }],
        records,
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}/generate-skus`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ variants: ["K"] }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = records.find((r) => r.table === "product_models" && r.op === "update");
    // Union keeps Queen + the other allowed_options keys untouched.
    expect(upd?.body).toEqual({
      allowed_options: { sizes: ["Queen", "King"], specials: ["X1"] },
    });
  });

  it("an already-listed size triggers NO allowed_options write", async () => {
    const records: { table: string; op: "insert" | "update"; body: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue(
      scriptedSb({
        reads: {
          product_models: {
            category: "mattress",
            model_key: "forte",
            allowed_options: { sizes: ["King"] },
          },
          suppliers: { id: "00000000-0000-0000-0000-00000000ff01" },
          product_skus__list: [],
        },
        inserted: [{ id: "00000000-0000-0000-0000-00000000bb34" }],
        records,
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}/generate-skus`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ variants: ["K"] }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(records.find((r) => r.table === "product_models" && r.op === "update")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Auto-generated SKU descriptions (Loo 2026-07-20): bed SKUs created with a
// blank description get `{Category} {Model name} {dimensions}` stamped from
// the Maintenance size pool; a typed description always wins; accessory/service
// stay manual (covered implicitly — no pool read runs for them).
// ---------------------------------------------------------------------------

describe("SKU auto-description — {Category} {Model name} {dimensions} (Loo 2026-07-20)", () => {
  const SIZE_POOL_ROWS = [
    { pool: "mattress_size", value: "K", label: "6FT", dimensions: "183X190CM" },
    { pool: "mattress_size", value: "SS", label: "3.5FT", dimensions: "107X190CM" },
  ];

  const skuWriteReturn = {
    id: "00000000-0000-0000-0000-00000000bb40",
    model_id: MODEL_ID_LIVE,
    sku: "CARRES-CLASSIC-K",
    variant: "King",
    variant_kind: "size",
    price: 1800,
    cost: null,
    supplier_id: "00000000-0000-0000-0000-00000000ff01",
    discontinued_at: null,
    pos_active: true,
    description: "Mattress Carres Classic 183X190CM",
  };

  it("POST /skus (mattress, blank description) stamps `Mattress {Model} {dims}` from the size pool", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        reads: {
          product_models: [
            {
              id: MODEL_ID_LIVE,
              category: "mattress",
              model_key: "carres-classic",
              name: "Carres Classic",
            },
          ],
          suppliers: [{ id: "00000000-0000-0000-0000-00000000ff01" }],
          catalog_option_pools: SIZE_POOL_ROWS,
        },
        recorded,
        writeReturn: skuWriteReturn,
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/skus", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: MODEL_ID_LIVE,
          variant: "King",
          variantKind: "size",
          price: 1800,
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const insert = recorded.find((r) => r.op === "insert" && r.table === "product_skus");
    expect((insert?.payload as { description: unknown }).description).toBe(
      "Mattress Carres Classic 183X190CM",
    );
  });

  it("POST /skus — a typed description WINS over the auto one", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        reads: {
          product_models: [
            {
              id: MODEL_ID_LIVE,
              category: "mattress",
              model_key: "carres-classic",
              name: "Carres Classic",
            },
          ],
          suppliers: [{ id: "00000000-0000-0000-0000-00000000ff01" }],
          catalog_option_pools: SIZE_POOL_ROWS,
        },
        recorded,
        writeReturn: { ...skuWriteReturn, description: "Hand-typed" },
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/skus", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: MODEL_ID_LIVE,
          variant: "King",
          variantKind: "size",
          price: 1800,
          description: "Hand-typed",
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const insert = recorded.find((r) => r.op === "insert" && r.table === "product_skus");
    expect((insert?.payload as { description: unknown }).description).toBe("Hand-typed");
  });

  it("generate-skus stamps a per-size description on every generated bed SKU", async () => {
    const records: { table: string; op: "insert" | "update"; body: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue(
      scriptedSb({
        reads: {
          product_models: {
            category: "mattress",
            model_key: "lumi-classic",
            name: "Lumi Classic",
            allowed_options: {},
          },
          suppliers: { id: "00000000-0000-0000-0000-00000000ff01" },
          product_skus__list: [],
          catalog_option_pools__list: SIZE_POOL_ROWS,
        },
        inserted: [
          { id: "00000000-0000-0000-0000-00000000bb41" },
          { id: "00000000-0000-0000-0000-00000000bb42" },
        ],
        records,
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}/generate-skus`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ variants: ["K", "SS"] }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const rows = records.find((r) => r.op === "insert")?.body as {
      sku: string;
      description: string | null;
    }[];
    expect(rows).toEqual([
      expect.objectContaining({
        sku: "LUMI-CLASSIC-K",
        description: "Mattress Lumi Classic 183X190CM",
      }),
      expect.objectContaining({
        sku: "LUMI-CLASSIC-SS",
        description: "Mattress Lumi Classic 107X190CM",
      }),
    ]);
  });

  it("generate-skus with NO pool dimensions leaves descriptions null (never blocks)", async () => {
    const records: { table: string; op: "insert" | "update"; body: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue(
      scriptedSb({
        reads: {
          product_models: {
            category: "mattress",
            model_key: "lumi-classic",
            name: "Lumi Classic",
            allowed_options: {},
          },
          suppliers: { id: "00000000-0000-0000-0000-00000000ff01" },
          product_skus__list: [],
          // no catalog_option_pools__list — empty pool
        },
        inserted: [{ id: "00000000-0000-0000-0000-00000000bb43" }],
        records,
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}/generate-skus`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ variants: ["K"] }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const rows = records.find((r) => r.op === "insert")?.body as {
      description: string | null;
    }[];
    expect(rows[0]?.description).toBeNull();
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

  it("addons POST mints the Service SKU row — UNPRICED for a non-principal (0175 lock)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        reads: {
          product_models: [
            { id: MODEL_ID_LIVE, category: "service", model_key: "service-addons" },
          ],
        },
        writeReturn: {
          key: "dispose-old-rug",
          name: "Dispose old rug",
          price: 60,
          active: true,
          service_sku: "SVC-DISPOSE-OLD-RUG",
        },
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/addons", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "dispose-old-rug",
          name: "Dispose old rug",
          price: 60,
          serviceSku: "SVC-DISPOSE-OLD-RUG",
          serviceDescription: "Haul away the old rug",
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const mint = recorded.find((r) => r.table === "product_skus" && r.op === "upsert");
    expect(mint?.payload).toMatchObject({
      model_id: MODEL_ID_LIVE,
      sku: "SVC-DISPOSE-OLD-RUG",
      variant: "SVC-DISPOSE-OLD-RUG",
      variant_kind: "preset",
      price: 0, // operation may not price a sku — principal prices later
      pos_active: true,
      description: "Haul away the old rug",
    });
  });

  it("addons POST by a PRINCIPAL mints the Service SKU with the real price", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        reads: {
          product_models: [
            { id: MODEL_ID_LIVE, category: "service", model_key: "service-addons" },
          ],
        },
        writeReturn: {
          key: "dispose-old-rug",
          name: "Dispose old rug",
          price: 60,
          active: true,
          service_sku: "SVC-DISPOSE-OLD-RUG",
        },
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/addons", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "dispose-old-rug",
          name: "Dispose old rug",
          price: 60,
          serviceSku: "SVC-DISPOSE-OLD-RUG",
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const mint = recorded.find((r) => r.table === "product_skus" && r.op === "upsert");
    expect(mint?.payload).toMatchObject({
      sku: "SVC-DISPOSE-OLD-RUG",
      price: 60,
      description: "Dispose old rug", // no serviceDescription sent → falls back to name
    });
  });

  it("addons PATCH price by a PRINCIPAL mirrors it onto the linked Service SKU", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          key: "dispose-mattress",
          name: "Dispose old mattress",
          price: 95,
          active: true,
          service_sku: "SVC-DISPOSE-MATTRESS",
        },
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/addons/dispose-mattress", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ price: 95 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const sync = recorded.find((r) => r.table === "product_skus" && r.op === "update");
    expect(sync?.payload).toMatchObject({ price: 95 });
  });

  it("addons PATCH with ONLY serviceDescription writes it to the linked SKU row (no addons update)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        reads: {
          addons: [
            {
              key: "dispose-mattress",
              name: "Dispose old mattress",
              price: 80,
              active: true,
              service_sku: "SVC-DISPOSE-MATTRESS",
            },
          ],
        },
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/addons/dispose-mattress", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ serviceDescription: "We collect & dispose responsibly" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    // No addons column changed → no addons write; the SKU description updated.
    expect(recorded.find((r) => r.table === "addons")).toBeUndefined();
    const descSync = recorded.find((r) => r.table === "product_skus" && r.op === "update");
    expect(descSync?.payload).toEqual({ description: "We collect & dispose responsibly" });
  });

  it("addons PATCH price by a NON-principal does NOT touch the Service SKU (0175 lock)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          key: "dispose-mattress",
          name: "Dispose old mattress",
          price: 95,
          active: true,
          service_sku: "SVC-DISPOSE-MATTRESS",
        },
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/addons/dispose-mattress", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ price: 95 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(recorded.find((r) => r.table === "product_skus")).toBeUndefined();
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

// ---------------------------------------------------------------------------
// 0176 — Fabric tier pricing (config singleton + per-model overrides).
// ---------------------------------------------------------------------------

describe("0176 — PATCH /api/catalog/fabric-tier-config (principal only)", () => {
  it("principal updates the tier config and returns the updated values", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          id: 1,
          sofa_tier2_delta: 300,
          sofa_tier3_delta: 700,
          updated_at: "2026-06-20T00:00:00Z",
          updated_by: "11111111-1111-1111-1111-000000000999",
        },
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/fabric-tier-config", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sofaTier2Delta: 300, sofaTier3Delta: 700 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { fabricTierConfig: { sofaTier2Delta: number; sofaTier3Delta: number } };
    expect(body.fabricTierConfig).toEqual({ sofaTier2Delta: 300, sofaTier3Delta: 700 });
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toMatchObject({ sofa_tier2_delta: 300, sofa_tier3_delta: 700 });
  });

  it("non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/fabric-tier-config", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sofaTier2Delta: 300, sofaTier3Delta: 700 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toMatch(/Master Admin/i);
  });

  it("dealer → 403", async () => {
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/catalog/fabric-tier-config", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sofaTier2Delta: 0, sofaTier3Delta: 0 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("422s negative deltas", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/fabric-tier-config", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sofaTier2Delta: -100, sofaTier3Delta: 0 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

describe("0176 — PUT /api/catalog/model-fabric-tier-override/:modelId (principal only)", () => {
  it("principal upserts an override and returns the row", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          model_id: MODEL_ID_LIVE,
          tier2_delta: 200,
          tier3_delta: null,
          updated_at: "2026-06-20T00:00:00Z",
          updated_by: "11111111-1111-1111-1111-000000000999",
        },
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/model-fabric-tier-override/${MODEL_ID_LIVE}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tier2Delta: 200, tier3Delta: null }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      override: { modelId: string; tier2Delta: number | null; tier3Delta: number | null };
    };
    expect(body.override).toMatchObject({ modelId: MODEL_ID_LIVE, tier2Delta: 200, tier3Delta: null });
  });

  it("principal can set both deltas to null (inherit from global)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          model_id: MODEL_ID_LIVE,
          tier2_delta: null,
          tier3_delta: null,
          updated_at: "2026-06-20T00:00:00Z",
          updated_by: "11111111-1111-1111-1111-000000000999",
        },
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/model-fabric-tier-override/${MODEL_ID_LIVE}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tier2Delta: null, tier3Delta: null }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      override: { tier2Delta: number | null; tier3Delta: number | null };
    };
    expect(body.override.tier2Delta).toBeNull();
    expect(body.override.tier3Delta).toBeNull();
  });

  it("non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/model-fabric-tier-override/${MODEL_ID_LIVE}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tier2Delta: 100, tier3Delta: 200 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toMatch(/Master Admin/i);
  });
});

// ---------------------------------------------------------------------------
// 0178 — Sofa compartments (the "Base" pool) + per-model offered. GET bundles
// `sofaCompartments` + `modelSofaCompartments`; all writes are principal-only.
// ---------------------------------------------------------------------------
describe("0178 — sofa compartments (pool + per-model offered)", () => {
  const COMP_ID = "00000000-0000-0000-0000-0000000c0001";
  const COMP_ROW = {
    id: COMP_ID,
    code: "1A(LHF)",
    description: "1 seat, ONE arm (left)",
    seat_count: 1,
    arm_config: "left",
    icon_url: null,
    default_price: 250,
    sort_order: 1,
    active: true,
  };

  it("GET /api/catalog includes sofaCompartments + modelSofaCompartments", async () => {
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
          ],
          // The synced compartment sku: pos_active=false (never in the flat POS
          // grid / non-admin `skus` output) but its PRICE must still enrich the
          // offered row as `skuPrice` — the authoritative à-la-carte source.
          product_skus: [
            {
              id: "00000000-0000-0000-0000-0000000d0001",
              model_id: MODEL_ID_LIVE,
              sku: "CLASSIC-1A(LHF)",
              variant: "1A(LHF)",
              variant_kind: "part",
              price: 777,
              cost: null,
              supplier_id: null,
              discontinued_at: null,
              pos_active: false,
              description: null,
              compartment_id: COMP_ID,
              // 0204 — per-size map; "900.00" exercises the PostgREST
              // numeric-as-string coercion, null value preserved.
              prices_by_size: { "24": "900.00", "32": 1200, Flat: null },
            },
          ],
          sofa_fabrics: [],
          addons: [],
          floor_config: [
            { id: 1, free_up_to_floor: 2, per_floor_per_item: 50, updated_at: "2025-01-01T00:00:00Z" },
          ],
          fabric_tier_addon_config: [
            { id: 1, sofa_tier2_delta: 0, sofa_tier3_delta: 0, updated_at: "2025-01-01T00:00:00Z", updated_by: null },
          ],
          model_fabric_tier_overrides: [],
          sofa_compartments: [COMP_ROW],
          model_sofa_compartments: [
            { model_id: MODEL_ID_LIVE, compartment_id: COMP_ID, price_override: null, sort_order: 0 },
          ],
        },
        recorded,
      ),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;
    expect(body.sofaCompartments).toHaveLength(1);
    expect(body.sofaCompartments?.[0]).toMatchObject({
      id: COMP_ID,
      code: "1A(LHF)",
      defaultPrice: 250,
      seatCount: 1,
    });
    expect(body.modelSofaCompartments).toHaveLength(1);
    expect(body.modelSofaCompartments?.[0]).toMatchObject({
      modelId: MODEL_ID_LIVE,
      compartmentId: COMP_ID,
      priceOverride: null,
      // skuPrice = the synced compartment sku's price (SKU Master), even though
      // the pos_active=false sku itself is excluded from the non-admin skus list.
      skuPrice: 777,
      // 0204 — the sku's per-size map rides along, numerics coerced, null kept.
      skuPricesBySize: { "24": 900, "32": 1200, Flat: null },
    });
    expect(body.skus).toHaveLength(0);
  });

  it("POST /sofa-compartments — principal inserts → 201 (NO price field — prices live in SKU Master)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: COMP_ROW }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/sofa-compartments", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code: "1A(LHF)", description: "1 seat, ONE arm (left)", seatCount: 1 }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.table).toBe("sofa_compartments");
    expect((ins?.payload as { code: string }).code).toBe("1A(LHF)");
    // The pool carries no authored price — the insert never sets default_price
    // (the column stays at its DB default, a dormant legacy fallback).
    expect(ins?.payload as Record<string, unknown>).not.toHaveProperty("default_price");
    const body = (await res.json()) as { compartment: { code: string } };
    expect(body.compartment).toMatchObject({ code: "1A(LHF)" });
  });

  it("POST /sofa-compartments — defaultPrice is no longer accepted → 422 (strict schema)", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/sofa-compartments", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code: "1A(LHF)", defaultPrice: 250 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("POST /sofa-compartments — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/sofa-compartments", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code: "1A(LHF)" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message?: string }).message).toMatch(/Master Admin/i);
  });

  it("PATCH /sofa-compartments/:id — empty body → 422", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-compartments/${COMP_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("PATCH /sofa-compartments/:id — principal updates iconUrl → 200", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: { ...COMP_ROW, icon_url: "https://x/y.jpg" } }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-compartments/${COMP_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ iconUrl: "https://x/y.jpg" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect((upd?.payload as { icon_url: string }).icon_url).toBe("https://x/y.jpg");
  });

  it("PATCH /sofa-compartments/:id — principal sets P2/P3 fabric-tier specials → 200 (0205)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: COMP_ROW }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-compartments/${COMP_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ specialTier2Delta: 500, specialTier3Delta: 800 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload as Record<string, unknown>).toMatchObject({
      special_tier2_delta: 500,
      special_tier3_delta: 800,
    });
  });

  it("PATCH /sofa-compartments/:id — explicit null clears a fabric-tier special (0205)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: COMP_ROW }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-compartments/${COMP_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ specialTier2Delta: null }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    // `!== undefined` guard → an explicit null IS written (clears to inherit).
    expect(Object.prototype.hasOwnProperty.call(upd?.payload, "special_tier2_delta")).toBe(true);
    expect((upd?.payload as Record<string, unknown>).special_tier2_delta).toBeNull();
  });

  it("PATCH /sofa-compartments/:id — defaultPrice is no longer accepted → 422 (strict schema)", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-compartments/${COMP_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ defaultPrice: 300 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("DELETE /sofa-compartments/:id — soft-delete via active=false", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: { id: COMP_ID } }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-compartments/${COMP_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect((upd?.payload as { active: boolean }).active).toBe(false);
  });

  it("PUT /models/:id/compartments/:cid — principal upserts offered → 200 + syncs the compartment sku", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        // Phase 5 — the auto-sync reads the model (sku prefix + category), the
        // pool compartment, and the model's own supplier before the upsert.
        reads: {
          product_models: [{ id: MODEL_ID_LIVE, model_key: "OHANA", category: "sofa", name: "Ohana" }],
          sofa_compartments: [COMP_ROW],
          product_skus: [{ model_id: MODEL_ID_LIVE, supplier_id: "sup-ohana" }],
        },
        writeReturn: { model_id: MODEL_ID_LIVE, compartment_id: COMP_ID, price_override: 280, sort_order: 0 },
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}/compartments/${COMP_ID}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ priceOverride: 280 }),
      }),
      env,
    );
    expect(res.status).toBe(200);

    // The synced compartment sku: real product_skus row, pos_active OFF (never in
    // the flat POS grid), variant_kind 'part', deterministic {MODEL_KEY}-{code}
    // sku, inherited supplier, the override price, compartment_id linked, and
    // the "Sofa {Model} {code}" description (Loo 2026-07-06 — names the
    // model+compartment pair, NOT the pool compartment's own description).
    const skuUpsert = recorded.find((r) => r.op === "upsert" && r.table === "product_skus");
    expect(skuUpsert?.payload).toMatchObject({
      sku: "OHANA-1A(LHF)",
      model_id: MODEL_ID_LIVE,
      compartment_id: COMP_ID,
      variant: "1A(LHF)",
      variant_kind: "part",
      price: 280,
      supplier_id: "sup-ohana",
      pos_active: false,
      description: "Sofa Ohana 1A(LHF)",
      discontinued_at: null,
    });
    // cost is OMITTED so a manually-set cost survives a re-sync.
    expect(skuUpsert?.payload).not.toHaveProperty("cost");

    // The offered row still upserts.
    const offered = recorded.find((r) => r.op === "upsert" && r.table === "model_sofa_compartments");
    expect((offered?.payload as { compartment_id: string }).compartment_id).toBe(COMP_ID);
    const body = (await res.json()) as {
      modelSofaCompartment: { modelId: string; compartmentId: string; priceOverride: number };
    };
    expect(body.modelSofaCompartment).toMatchObject({ modelId: MODEL_ID_LIVE, compartmentId: COMP_ID, priceOverride: 280 });
  });

  it("PUT — no model-own supplier → falls back to the category cover; sku still synced", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        reads: {
          product_models: [{ id: MODEL_ID_LIVE, model_key: "OHANA", category: "sofa", name: "Ohana" }],
          sofa_compartments: [COMP_ROW],
          product_skus: [], // model has no existing sku → no own supplier
          suppliers: [{ id: "sup-covers-sofa" }],
        },
        writeReturn: { model_id: MODEL_ID_LIVE, compartment_id: COMP_ID, price_override: null, sort_order: 0 },
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}/compartments/${COMP_ID}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ priceOverride: null }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const skuUpsert = recorded.find((r) => r.op === "upsert" && r.table === "product_skus");
    // priceOverride null → seeds UNPRICED (0). The pool's default_price (the
    // fixture carries 250) is deliberately IGNORED (Loo 2026-07-20): prices
    // live in SKU Master only — legacy pool prices must never leak onto a
    // fresh model's SKUs.
    expect(skuUpsert?.payload).toMatchObject({ supplier_id: "sup-covers-sofa", price: 0, pos_active: false });
  });

  it("PUT — unknown model → 404 fail-closed (no offered row written)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({ recorded, reads: { product_models: [] }, writeReturn: null }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}/compartments/${COMP_ID}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ priceOverride: 280 }),
      }),
      env,
    );
    expect(res.status).toBe(404);
    // sync ran first + failed → the offered row was NEVER upserted.
    expect(recorded.find((r) => r.table === "model_sofa_compartments")).toBeUndefined();
  });

  it("PUT — derived sku collides with an existing FLAT product → 422 sku_collision (never clobbers it)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        reads: {
          product_models: [{ id: MODEL_ID_LIVE, model_key: "OHANA", category: "sofa", name: "Ohana" }],
          sofa_compartments: [COMP_ROW],
          // The model's own supplier read + the collision read both hit
          // product_skus. The colliding flat row has compartment_id NULL.
          product_skus: [
            { model_id: MODEL_ID_LIVE, supplier_id: "sup-ohana" },
            { sku: "OHANA-1A(LHF)", compartment_id: null },
          ],
        },
        writeReturn: null,
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}/compartments/${COMP_ID}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ priceOverride: 280 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code?: string }).code).toBe("sku_collision");
    // Never upserted product_skus (no clobber) and never wrote the offered row.
    expect(recorded.find((r) => r.op === "upsert" && r.table === "product_skus")).toBeUndefined();
    expect(recorded.find((r) => r.table === "model_sofa_compartments")).toBeUndefined();
  });

  it("PUT /models/:id/compartments/:cid — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}/compartments/${COMP_ID}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ priceOverride: 280 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message?: string }).message).toMatch(/Master Admin/i);
  });

  it("DELETE /models/:id/compartments/:cid — un-offer → 200 (delete offered + discontinue sku, never delete sku)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: null }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/models/${MODEL_ID_LIVE}/compartments/${COMP_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // The OFFERED row is hard-deleted...
    expect(recorded.find((r) => r.op === "delete")?.table).toBe("model_sofa_compartments");
    // ...but the compartment's sku is only SOFT-discontinued (historical
    // order_lines may FK it) — an update, never a product_skus delete.
    const disc = recorded.find((r) => r.op === "update" && r.table === "product_skus");
    expect((disc?.payload as { pos_active: boolean }).pos_active).toBe(false);
    expect((disc?.payload as { discontinued_at: string | null }).discontinued_at).toBeTruthy();
    expect(recorded.find((r) => r.op === "delete" && r.table === "product_skus")).toBeUndefined();
  });
});

describe("0176 — PATCH /api/catalog/sofa-fabrics/:id persists tier", () => {
  const FABRIC_ID = "00000000-0000-0000-0000-00000000cc02";

  it("persists tier PRICE_2 when sent in the patch body", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          id: FABRIC_ID,
          model_id: MODEL_ID_LIVE,
          fabric_name: "Velvet Ash",
          surcharge: 300,
          colors: null,
          discontinued_at: null,
          tier: "PRICE_2",
        },
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-fabrics/${FABRIC_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "PRICE_2" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect((upd?.payload as { tier: string }).tier).toBe("PRICE_2");
    const body = (await res.json()) as { fabric: { tier: string } };
    expect(body.fabric.tier).toBe("PRICE_2");
  });

  it("422s on an invalid tier value", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-fabrics/${FABRIC_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "PRICE_99" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// 0179 — Sofa combo pricing. GET bundles `sofaCombos` (active-filtered for
// non-principal / non-admin); all writes principal-only ("Master Admin"); slots
// canonicalized on save.
// ---------------------------------------------------------------------------
describe("0179 — sofa combo pricing (GET bundle + principal-gated CRUD)", () => {
  const SOFA_COMBO_ID = "00000000-0000-0000-0000-0000000f0001";
  const SOFA_COMBO_ID_2 = "00000000-0000-0000-0000-0000000f0002";
  const sofaComboRow = (over: Record<string, unknown> = {}) => ({
    id: SOFA_COMBO_ID,
    model_id: MODEL_ID_LIVE,
    slots: [["2A(LHF)", "2A(RHF)"], ["L(LHF)", "L(RHF)"]],
    tier: null,
    prices_by_height: { "24": 2640, "28": 2750 },
    // 0183 — per-seat-height cost benchmark (companion to prices_by_height).
    cost_by_height: { "24": 1800, "28": 1850 },
    label: "L-shape combo",
    effective_from: "2026-06-21",
    active: true,
    discontinued_at: null,
    created_at: "2026-06-21T00:00:00Z",
    updated_at: "2026-06-21T00:00:00Z",
    updated_by: null,
    ...over,
  });

  // A minimal catalog GET fixture (floor_config row 1 required) + the sofa
  // combo rows under test.
  const getBundle = (sofaCombos: unknown[]) => ({
    product_models: [
      {
        id: MODEL_ID_LIVE,
        category: "sofa",
        model_key: "carres-sofa",
        name: "Sofa",
        blurb: null,
        colors: null,
        gaps: null,
        sofa_mode: null,
        discontinued_at: null,
      },
    ],
    product_skus: [],
    sofa_fabrics: [],
    addons: [],
    floor_config: [
      { id: 1, free_up_to_floor: 2, per_floor_per_item: 50, updated_at: "2025-01-01T00:00:00Z" },
    ],
    fabric_tier_addon_config: [
      { id: 1, sofa_tier2_delta: 0, sofa_tier3_delta: 0, updated_at: "2025-01-01T00:00:00Z", updated_by: null },
    ],
    model_fabric_tier_overrides: [],
    sofa_combo_pricing: sofaCombos,
  });

  it("GET /api/catalog includes sofaCombos (mapped via sofaComboFromRow)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb(getBundle([sofaComboRow()])));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;
    expect(body.sofaCombos).toHaveLength(1);
    expect(body.sofaCombos?.[0]).toMatchObject({
      id: SOFA_COMBO_ID,
      modelId: MODEL_ID_LIVE,
      slots: [["2A(LHF)", "2A(RHF)"], ["L(LHF)", "L(RHF)"]],
      tier: null,
      pricesByHeight: { "24": 2640, "28": 2750 },
      // 0183 — per-height cost benchmark flows via sofaComboFromRow.
      costByHeight: { "24": 1800, "28": 1850 },
      label: "L-shape combo",
    });
  });

  it("0183 — GET maps cost_by_height null → costByHeight null (unset distinct from {})", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb(getBundle([sofaComboRow({ cost_by_height: null })])),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;
    expect(body.sofaCombos?.[0]?.costByHeight).toBeNull();
  });

  it("non-admin excludes active:false / discontinued sofa combos; ?admin=true includes them", async () => {
    const rows = [
      sofaComboRow(), // live
      sofaComboRow({ id: SOFA_COMBO_ID_2, active: false }), // inactive
    ];
    // POS (non-admin) — only the live combo.
    vi.mocked(userClient).mockReturnValue(buildSb(getBundle(rows)));
    let jwt = await makeJwt("dealer", DEALER_ID);
    let res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    let body = (await res.json()) as CatalogResponse;
    expect(body.sofaCombos?.map((x) => x.id)).toEqual([SOFA_COMBO_ID]);

    // admin=true — both.
    vi.mocked(userClient).mockReturnValue(buildSb(getBundle(rows)));
    jwt = await makeJwt("principal", null);
    res = await app.fetch(
      new Request("http://t/api/catalog?admin=true", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    body = (await res.json()) as CatalogResponse;
    expect(body.sofaCombos?.map((x) => x.id).sort()).toEqual([SOFA_COMBO_ID, SOFA_COMBO_ID_2].sort());
  });

  it("POST /sofa-combos — principal inserts (slots canonicalized) → 201", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: sofaComboRow() }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/sofa-combos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: MODEL_ID_LIVE,
          // Deliberately UNsorted within-slot + slots out of order + a dupe code
          // to prove canonicalization (sort within slot, de-dupe, sort slots).
          slots: [["L(RHF)", "L(LHF)"], ["2A(RHF)", "2A(LHF)", "2A(LHF)"]],
          pricesByHeight: { "24": 2640, "28": 2750 },
          label: "L-shape combo",
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.table).toBe("sofa_combo_pricing");
    const payload = ins?.payload as { model_id: string; slots: string[][]; prices_by_height: Record<string, number> };
    expect(payload.model_id).toBe(MODEL_ID_LIVE);
    // Codes sorted within each slot; empty slot dropped; dupes removed; slots
    // sorted by first code (canonicalizeSofaSlots).
    expect(payload.slots).toEqual([["2A(LHF)", "2A(RHF)"], ["L(LHF)", "L(RHF)"]]);
    expect(payload.prices_by_height).toEqual({ "24": 2640, "28": 2750 });
    const body = (await res.json()) as { sofaCombo: { id: string; modelId: string } };
    expect(body.sofaCombo).toMatchObject({ id: SOFA_COMBO_ID, modelId: MODEL_ID_LIVE });
  });

  it("0206 — POST /sofa-combos threads is_quick_pick=true (Create quick pick)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: sofaComboRow() }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/sofa-combos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: MODEL_ID_LIVE, slots: [["1NA"]], isQuickPick: true }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect((ins?.payload as { is_quick_pick: boolean }).is_quick_pick).toBe(true);
  });

  it("0206 — POST /sofa-combos defaults is_quick_pick=false (Create combo)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: sofaComboRow() }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/sofa-combos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: MODEL_ID_LIVE, slots: [["1NA"]], pricesByHeight: { "24": 1000 } }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect((ins?.payload as { is_quick_pick: boolean }).is_quick_pick).toBe(false);
  });

  it("0183 — POST /sofa-combos persists cost_by_height (camelCase costByHeight → snake)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: sofaComboRow() }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/sofa-combos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: MODEL_ID_LIVE,
          slots: [["2A(LHF)"]],
          pricesByHeight: { "24": 2640 },
          costByHeight: { "24": 1800, "28": 1850 },
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.table).toBe("sofa_combo_pricing");
    const payload = ins?.payload as { cost_by_height: Record<string, number> };
    expect(payload.cost_by_height).toEqual({ "24": 1800, "28": 1850 });
  });

  it("0183 — POST /sofa-combos omitted costByHeight → insert writes cost_by_height: null (unset)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: sofaComboRow() }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/sofa-combos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: MODEL_ID_LIVE, slots: [["2A(LHF)"]], pricesByHeight: { "24": 2640 } }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect((ins?.payload as { cost_by_height: unknown }).cost_by_height).toBeNull();
  });

  it("POST /sofa-combos — non-principal → 403 (/Master Admin/i)", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/sofa-combos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: MODEL_ID_LIVE, slots: [["2A(LHF)"]] }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message?: string }).message).toMatch(/Master Admin/i);
  });

  it("PATCH /sofa-combos/:id — empty body → 422", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-combos/${SOFA_COMBO_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("PATCH /sofa-combos/:id — principal updates slots (canonicalized) → 200", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: sofaComboRow() }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-combos/${SOFA_COMBO_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ slots: [["2A(RHF)", "2A(LHF)"]], pricesByHeight: { "30": 2900 } }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    const payload = upd?.payload as { slots: string[][]; prices_by_height: Record<string, number> };
    expect(payload.slots).toEqual([["2A(LHF)", "2A(RHF)"]]);
    expect(payload.prices_by_height).toEqual({ "30": 2900 });
  });

  it("0183 — PATCH /sofa-combos/:id updates cost_by_height (camelCase costByHeight → snake)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: sofaComboRow() }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-combos/${SOFA_COMBO_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ costByHeight: { "30": 1900 } }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect((upd?.payload as { cost_by_height: Record<string, number> }).cost_by_height).toEqual({ "30": 1900 });
  });

  it("0183 — PATCH /sofa-combos/:id costByHeight: null clears the benchmark (explicit null written)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: sofaComboRow() }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-combos/${SOFA_COMBO_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ costByHeight: null }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toHaveProperty("cost_by_height", null);
  });

  it("0183 — PATCH /sofa-combos/:id WITHOUT costByHeight does NOT write cost_by_height (no clobber)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: sofaComboRow() }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-combos/${SOFA_COMBO_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Renamed combo" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).not.toHaveProperty("cost_by_height");
  });

  it("PATCH /sofa-combos/:id — non-principal → 403 (/Master Admin/i)", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-combos/${SOFA_COMBO_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message?: string }).message).toMatch(/Master Admin/i);
  });

  it("PATCH /sofa-combos/:id — missing row → 404", async () => {
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ writeReturn: null }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-combos/${SOFA_COMBO_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      }),
      env,
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { message?: string }).message).toMatch(/sofa combo not found/i);
  });

  it("DELETE /sofa-combos/:id — soft-delete via active=false + discontinued_at → 200", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: { id: SOFA_COMBO_ID } }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-combos/${SOFA_COMBO_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    const payload = upd?.payload as { active: boolean; discontinued_at: string };
    expect(payload.active).toBe(false);
    expect(payload.discontinued_at).toBeTruthy();
  });

  it("DELETE /sofa-combos/:id — non-principal → 403 (/Master Admin/i)", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-combos/${SOFA_COMBO_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message?: string }).message).toMatch(/Master Admin/i);
  });

  it("DELETE /sofa-combos/:id — missing row → 404", async () => {
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ writeReturn: null }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-combos/${SOFA_COMBO_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { message?: string }).message).toMatch(/sofa combo not found/i);
  });
});

// ---------------------------------------------------------------------------
// 2990s Products parity Phase 1 — POST /api/catalog/import-skus
// ---------------------------------------------------------------------------

describe("POST /api/catalog/import-skus", () => {
  type ImportResult = {
    upserted: number;
    createdModels: number;
    failed: number;
    failures: { row: number; key: string; reason: string }[];
  };

  async function importAs(
    role: string,
    rows: unknown[],
    opts: {
      reads?: Record<string, unknown>;
      records?: { table: string; op: "insert" | "update"; body: unknown }[];
      inserted?: unknown[];
    } = {},
  ) {
    vi.mocked(userClient).mockReturnValue(
      scriptedSb({ reads: opts.reads ?? {}, records: opts.records, inserted: opts.inserted }),
    );
    const jwt = await makeJwt(role, role === "dealer" ? DEALER_ID : null);
    return app.fetch(
      new Request("http://t/api/catalog/import-skus", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      }),
      env,
    );
  }

  const baseRow = (over: Record<string, unknown> = {}) => ({
    model: "Booqit",
    modelKey: "booqit",
    category: "sofa",
    variant: "1S",
    variantKind: "size",
    ...over,
  });

  it("403s a dealer (internal only)", async () => {
    const res = await importAs("dealer", [baseRow()]);
    expect(res.status).toBe(403);
  });

  it("403s a non-principal that imports a price (0175 lock)", async () => {
    const res = await importAs("operation", [baseRow({ price: 1899 })]);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe("import_pricing_principal_only");
  });

  it("operation imports UNPRICED structure → creates model + sku", async () => {
    const records: { table: string; op: string; body: unknown }[] = [];
    const res = await importAs("operation", [baseRow()], {
      reads: { suppliers__list: [{ id: "sup-ohana", slug: "hookka", name: "Ohana", cat_covered: ["sofa", "bedframe"] }] },
      records: records as never,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ImportResult;
    expect(body).toMatchObject({ upserted: 1, createdModels: 1, failed: 0 });
    const modelIns = records.find((r) => r.table === "product_models" && r.op === "insert");
    expect(modelIns?.body).toMatchObject({ category: "sofa", model_key: "booqit", name: "Booqit" });
    const skuIns = records.find((r) => r.table === "product_skus" && r.op === "insert");
    expect(skuIns?.body).toMatchObject({ sku: "BOOQIT-1S", variant: "1S", price: 0, cost: null, supplier_id: "sup-ohana" });
  });

  it("principal imports a priced sku (price reaches the insert body)", async () => {
    const records: { table: string; op: string; body: unknown }[] = [];
    const res = await importAs("principal", [baseRow({ price: 1899, cost: 900 })], {
      reads: { suppliers__list: [{ id: "sup-ohana", slug: "hookka", name: "Ohana", cat_covered: ["sofa"] }] },
      records: records as never,
    });
    expect(res.status).toBe(200);
    const skuIns = records.find((r) => r.table === "product_skus" && r.op === "insert");
    expect(skuIns?.body).toMatchObject({ price: 1899, cost: 900 });
  });

  it("updates an existing sku and preserves blank fields (no price key in patch)", async () => {
    const records: { table: string; op: string; body: unknown }[] = [];
    const res = await importAs("operation", [baseRow({ description: "Updated blurb" })], {
      reads: {
        product_models__list: [{ id: "m-booqit", category: "sofa", model_key: "booqit" }],
        product_skus__list: [{ id: "s-booqit-1s", sku: "BOOQIT-1S", model_id: "m-booqit" }],
      },
      records: records as never,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ImportResult;
    expect(body).toMatchObject({ upserted: 1, createdModels: 0, failed: 0 });
    const skuUpd = records.find((r) => r.table === "product_skus" && r.op === "update");
    expect(skuUpd?.body).toMatchObject({ variant: "1S", description: "Updated blurb" });
    expect(skuUpd?.body).not.toHaveProperty("price");
    expect(skuUpd?.body).not.toHaveProperty("cost");
    // no new model created, no insert on product_skus
    expect(records.find((r) => r.op === "insert")).toBeUndefined();
  });

  it("preserves variant_kind on update when the column is omitted", async () => {
    const records: { table: string; op: string; body: unknown }[] = [];
    // Existing SKU is a 'preset'; the import row omits variant_kind entirely.
    const res = await importAs(
      "operation",
      [{ model: "Booqit", modelKey: "booqit", category: "sofa", variant: "1S" }], // no variantKind
      {
        reads: {
          product_models__list: [{ id: "m-booqit", category: "sofa", model_key: "booqit" }],
          product_skus__list: [{ id: "s-booqit-1s", sku: "BOOQIT-1S", model_id: "m-booqit" }],
        },
        records: records as never,
      },
    );
    expect(res.status).toBe(200);
    const skuUpd = records.find((r) => r.table === "product_skus" && r.op === "update");
    // blank variant_kind must NOT be written — it would silently re-type the SKU.
    expect(skuUpd?.body).not.toHaveProperty("variant_kind");
  });

  it("fails a row whose derived code already belongs to a different model (cross-category collision)", async () => {
    const res = await importAs(
      "operation",
      [{ model: "Booqit", modelKey: "booqit", category: "mattress", variant: "1S" }],
      {
        reads: {
          // mattress 'booqit' model exists; the BOOQIT-1S code already lives under a SOFA model.
          product_models__list: [{ id: "m-mattress", category: "mattress", model_key: "booqit" }],
          product_skus__list: [{ id: "s-sofa", sku: "BOOQIT-1S", model_id: "m-sofa" }],
        },
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ImportResult;
    expect(body.upserted).toBe(0);
    expect(body.failed).toBe(1);
    expect(body.failures[0].reason.toLowerCase()).toContain("already belongs");
  });

  it("resolves the supplier by NAME (not just slug), case-insensitively", async () => {
    const records: { table: string; op: string; body: unknown }[] = [];
    await importAs(
      "operation",
      [{ model: "Akka", modelKey: "akka", category: "mattress", variant: "K", supplier: "NICE FUTURE" }],
      {
        reads: { suppliers__list: [{ id: "sup-nf", slug: "nice-future", name: "Nice Future", cat_covered: ["mattress"] }] },
        records: records as never,
      },
    );
    const skuIns = records.find((r) => r.table === "product_skus" && r.op === "insert");
    expect(skuIns?.body).toMatchObject({ supplier_id: "sup-nf" });
  });

  it("auto-resolves the supplier by category for a new sku", async () => {
    const records: { table: string; op: string; body: unknown }[] = [];
    await importAs("operation", [baseRow({ model: "Akka", modelKey: "akka", category: "mattress", variant: "K" })], {
      reads: { suppliers__list: [{ id: "sup-nf", slug: "nice-future", name: "Nice Future", cat_covered: ["mattress"] }] },
      records: records as never,
    });
    const skuIns = records.find((r) => r.table === "product_skus" && r.op === "insert");
    expect(skuIns?.body).toMatchObject({ supplier_id: "sup-nf" });
  });

  it("a new accessory sku carries a null supplier (supplierless)", async () => {
    const records: { table: string; op: string; body: unknown }[] = [];
    await importAs("operation", [baseRow({ model: "Pillow", modelKey: "pillow", category: "accessory", variant: "STD" })], {
      reads: { suppliers__list: [] },
      records: records as never,
    });
    const skuIns = records.find((r) => r.table === "product_skus" && r.op === "insert");
    expect(skuIns?.body).toMatchObject({ supplier_id: null });
  });

  it("fails a row with an unknown explicit supplier (others still process)", async () => {
    const res = await importAs("principal", [baseRow({ supplier: "ghost-co" })], {
      reads: { suppliers__list: [{ id: "sup-ohana", slug: "hookka", name: "Ohana", cat_covered: ["sofa"] }] },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ImportResult;
    expect(body.upserted).toBe(0);
    expect(body.failed).toBe(1);
    expect(body.failures[0].reason.toLowerCase()).toContain("supplier");
  });

  it("422s a batch over 500 rows", async () => {
    const rows = Array.from({ length: 501 }, () => baseRow());
    const res = await importAs("operation", rows);
    expect(res.status).toBe(422);
  });

  it("422s an empty batch", async () => {
    const res = await importAs("operation", []);
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// 0181 — Special Add-ons CRUD (principal-only)
// ---------------------------------------------------------------------------

describe("Special add-ons CRUD (/api/catalog/special-addons)", () => {
  const SA_ID = "00000000-0000-0000-0000-00000000aa90";
  const SA_ROW = {
    id: SA_ID,
    code: "right-drawer",
    label: "Right Drawer",
    so_description: "Right pull-out drawer",
    categories: ["bedframe"],
    selling_price: 50,
    cost: null,
    option_groups: [{ label: "Thickness", required: true, choices: [{ label: '10"', extra: 0 }, { label: '8"', extra: -10 }] }],
    active: true,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: null,
  };

  it("POST 403s a non-principal", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/special-addons", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code: "x", label: "X", categories: ["sofa"], sellingPrice: 10 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message?: string }).message).toMatch(/Master Admin/i);
  });

  it("POST creates (principal) with snake_case body incl negative price + option groups", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: { ...SA_ROW, selling_price: -40 } }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/special-addons", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "no-side-panel",
          label: "No Side Panel",
          soDescription: "Omit the side panel",
          categories: ["bedframe", "sofa"],
          sellingPrice: -40,
          optionGroups: [{ label: "Thickness", required: true, choices: [{ label: '8"', extra: -10 }] }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.table).toBe("special_addons");
    expect(ins?.payload).toMatchObject({
      code: "no-side-panel",
      so_description: "Omit the side panel",
      categories: ["bedframe", "sofa"],
      selling_price: -40,
    });
    expect((ins?.payload as { option_groups: unknown[] }).option_groups).toHaveLength(1);
    const body = (await res.json()) as { specialAddon: { sellingPrice: number } };
    expect(body.specialAddon.sellingPrice).toBe(-40);
  });

  it("PATCH maps camel→snake and never writes `code`", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: { ...SA_ROW, selling_price: 75 } }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/special-addons/${SA_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sellingPrice: 75, soDescription: "updated" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toMatchObject({ selling_price: 75, so_description: "updated" });
    expect(upd?.payload).not.toHaveProperty("code");
  });

  it("PATCH 403s a non-principal", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/special-addons/${SA_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sellingPrice: 75 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("DELETE soft-deletes (active=false)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: { id: SA_ID } }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/special-addons/${SA_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toMatchObject({ active: false });
  });

  it("DELETE 404s a missing row", async () => {
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ writeReturn: null }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/special-addons/${SA_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });
});

describe("0182 — global option pools (GET bundle + principal-gated CRUD)", () => {
  const POOL_ID = "00000000-0000-0000-0000-0000000f0001";
  const POOL_ROW = {
    id: POOL_ID,
    pool: "mattress_size",
    value: "Queen",
    label: "Queen",
    dimensions: "152x190",
    active: true,
    sort_order: 2,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: null,
  };

  it("GET /api/catalog includes optionPools (active AND inactive, ordered)", async () => {
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
          ],
          product_skus: [],
          sofa_fabrics: [],
          addons: [],
          floor_config: [
            { id: 1, free_up_to_floor: 2, per_floor_per_item: 50, updated_at: "2025-01-01T00:00:00Z" },
          ],
          fabric_tier_addon_config: [
            { id: 1, sofa_tier2_delta: 0, sofa_tier3_delta: 0, updated_at: "2025-01-01T00:00:00Z", updated_by: null },
          ],
          model_fabric_tier_overrides: [],
          catalog_option_pools: [
            POOL_ROW, // mattress_size / Queen / sort 2
            { ...POOL_ROW, id: "00000000-0000-0000-0000-0000000f0002", value: "King", label: "King", sort_order: 1, active: false },
            {
              ...POOL_ROW,
              id: "00000000-0000-0000-0000-0000000f0003",
              pool: "supplier_category",
              value: "sofa",
              label: null,
              dimensions: null,
              sort_order: 0,
            },
          ],
        },
        recorded,
      ),
    );
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;
    // All three returned — inactive included (consumers filter client-side).
    expect(body.optionPools).toHaveLength(3);
    expect(body.optionPools?.some((p) => p.active === false)).toBe(true);
    // Ordered by (pool, sort_order, value): mattress_size/King(1),
    // mattress_size/Queen(2), supplier_category/sofa(0).
    expect(body.optionPools?.map((p) => p.value)).toEqual(["King", "Queen", "sofa"]);
    // Adapter mapping (camelCase + dimensions passthrough).
    expect(body.optionPools?.[1]).toMatchObject({
      id: POOL_ID,
      pool: "mattress_size",
      value: "Queen",
      dimensions: "152x190",
      sortOrder: 2,
      active: true,
    });
  });

  it("POST /option-pools — principal inserts → 201 (camel→snake)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: POOL_ROW }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/option-pools", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pool: "mattress_size", value: "Queen", label: "Queen", dimensions: "152x190", sortOrder: 2 }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.table).toBe("catalog_option_pools");
    expect(ins?.payload).toMatchObject({
      pool: "mattress_size",
      value: "Queen",
      label: "Queen",
      dimensions: "152x190",
      sort_order: 2,
    });
    const body = (await res.json()) as { optionPool: { value: string; sortOrder: number } };
    expect(body.optionPool).toMatchObject({ value: "Queen", sortOrder: 2 });
  });

  it("POST /option-pools — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/option-pools", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pool: "mattress_size", value: "Queen" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message?: string }).message).toMatch(/Master Admin/i);
  });

  it("POST /option-pools — duplicate (pool,value) → 409", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        writeError: { code: "23505", message: 'duplicate key value violates unique constraint "catalog_option_pools_pool_value_key"' },
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/option-pools", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pool: "mattress_size", value: "Queen" }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("duplicate_option_pool_value");
  });

  it("PATCH /option-pools/:id — principal updates → 200, maps camel→snake, never writes pool", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({ recorded, writeReturn: { ...POOL_ROW, value: "Super King", sort_order: 5 } }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/option-pools/${POOL_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ value: "Super King", sortOrder: 5 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toMatchObject({ value: "Super King", sort_order: 5 });
    expect(upd?.payload).not.toHaveProperty("pool");
    const body = (await res.json()) as { optionPool: { value: string; sortOrder: number } };
    expect(body.optionPool).toMatchObject({ value: "Super King", sortOrder: 5 });
  });

  it("PATCH /option-pools/:id — empty body → 422", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/option-pools/${POOL_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("PATCH /option-pools/:id — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/option-pools/${POOL_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ value: "X" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("PATCH /option-pools/:id — value rename collision (23505) → 409", async () => {
    // A rename onto an existing (pool,value) must surface the SAME friendly 409
    // as POST, not the generic 500 mapPgError defaults 23505 to.
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        writeError: { code: "23505", message: 'duplicate key value violates unique constraint "catalog_option_pools_pool_value_key"' },
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/option-pools/${POOL_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ value: "Queen" }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("duplicate_option_pool_value");
  });

  it("DELETE /option-pools/:id — HARD delete → 200 { ok: true }", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/option-pools/${POOL_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const del = recorded.find((r) => r.op === "delete");
    expect(del?.table).toBe("catalog_option_pools");
  });

  it("DELETE /option-pools/:id — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/option-pools/${POOL_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 0184 — Delivery TRIP fee (config singleton + per-RuleTarget special rules).
// GET bundle exposure + principal-gated CRUD. Mirrors the 0182 option-pools
// block: buildSb for the read bundle, buildWriteSb for the writes.
// ---------------------------------------------------------------------------
describe("0184 — delivery fee (GET bundle + principal-gated CRUD)", () => {
  const RULE_A = "aa000000-0000-4000-8000-000000000001"; // active, sort 5
  const RULE_B = "bb000000-0000-4000-8000-000000000002"; // inactive, sort 0
  const RULE_C = "cc000000-0000-4000-8000-000000000003"; // active, sort 1
  const ruleRow = (over: Record<string, unknown>) => ({
    id: RULE_A,
    target: [{ scope: "model", modelId: MODEL_ID_LIVE }],
    standalone_fee: 80,
    cross_cat_followup_fee: 30,
    label: "Big sofa transport",
    active: true,
    sort_order: 5,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: null,
    ...over,
  });

  it("GET /api/catalog returns deliveryFeeConfig (mapped) + specialDeliveryFeeRules (active-first, sort_order)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        product_models: [
          {
            id: MODEL_ID_LIVE,
            category: "sofa",
            model_key: "carres-sofa",
            name: "Sofa",
            blurb: null,
            colors: null,
            gaps: null,
            sofa_mode: null,
            discontinued_at: null,
          },
        ],
        product_skus: [],
        sofa_fabrics: [],
        addons: [],
        floor_config: [
          { id: 1, free_up_to_floor: 2, per_floor_per_item: 50, updated_at: "2025-01-01T00:00:00Z" },
        ],
        fabric_tier_addon_config: [
          { id: 1, sofa_tier2_delta: 0, sofa_tier3_delta: 0, updated_at: "2025-01-01T00:00:00Z", updated_by: null },
        ],
        model_fabric_tier_overrides: [],
        delivery_fee_config: [
          {
            id: 1,
            base_fee: 120,
            cross_category_fee: 60,
            charged_categories: ["sofa", "mattress", "bedframe"],
            mattress_bedframe_lead_days: 14,
            sofa_lead_days: 21,
            updated_at: "2026-01-01T00:00:00Z",
            updated_by: null,
          },
        ],
        special_delivery_fee_rules: [
          ruleRow({ id: RULE_A, active: true, sort_order: 5 }),
          ruleRow({ id: RULE_B, active: false, sort_order: 0, label: "Retired" }),
          ruleRow({ id: RULE_C, active: true, sort_order: 1 }),
        ],
      }),
    );
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;

    // Config mapped camelCase + numeric-coerced.
    expect(body.deliveryFeeConfig).toEqual({
      baseFee: 120,
      crossCategoryFee: 60,
      chargedCategories: ["sofa", "mattress", "bedframe"],
      mattressBedframeLeadDays: 14,
      sofaLeadDays: 21,
    });

    // All three rules returned (inactive included — consumers filter).
    expect(body.specialDeliveryFeeRules).toHaveLength(3);
    // Active-first, then ascending sort_order: C(active,1), A(active,5), B(inactive).
    expect(body.specialDeliveryFeeRules?.map((r) => r.id)).toEqual([RULE_C, RULE_A, RULE_B]);
    // Adapter mapping (camelCase + RuleTarget parse).
    expect(body.specialDeliveryFeeRules?.find((r) => r.id === RULE_A)).toMatchObject({
      standaloneFee: 80,
      crossCategoryFollowupFee: 30,
      label: "Big sofa transport",
      active: true,
      sortOrder: 5,
      target: [{ scope: "model", modelId: MODEL_ID_LIVE }],
    });
  });

  it("GET /api/catalog falls back to dormant config defaults when the singleton row is absent", async () => {
    // Existing pre-0184 bundle stubs never set delivery_fee_config — the bundle
    // must still ship a (dormant 0-rate) config, never 500.
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        product_models: [],
        product_skus: [],
        sofa_fabrics: [],
        addons: [],
        floor_config: [{ id: 1, free_up_to_floor: 2, per_floor_per_item: 50 }],
        fabric_tier_addon_config: [
          { id: 1, sofa_tier2_delta: 0, sofa_tier3_delta: 0, updated_at: "2025-01-01T00:00:00Z", updated_by: null },
        ],
        model_fabric_tier_overrides: [],
      }),
    );
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;
    expect(body.deliveryFeeConfig).toMatchObject({ baseFee: 0, crossCategoryFee: 0 });
    expect(body.specialDeliveryFeeRules).toEqual([]);
  });

  // ----- PATCH /delivery-fee-config -----

  it("PATCH /delivery-fee-config — principal updates → 200 (camel→snake)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          id: 1,
          base_fee: 150,
          cross_category_fee: 70,
          charged_categories: ["sofa", "mattress"],
          mattress_bedframe_lead_days: 10,
          sofa_lead_days: 18,
          updated_at: "2026-01-01T00:00:00Z",
          updated_by: null,
        },
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/delivery-fee-config", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          baseFee: 150,
          crossCategoryFee: 70,
          chargedCategories: ["sofa", "mattress"],
          mattressBedframeLeadDays: 10,
          sofaLeadDays: 18,
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.table).toBe("delivery_fee_config");
    expect(upd?.payload).toMatchObject({
      base_fee: 150,
      cross_category_fee: 70,
      charged_categories: ["sofa", "mattress"],
      mattress_bedframe_lead_days: 10,
      sofa_lead_days: 18,
    });
    const body = (await res.json()) as { deliveryFeeConfig: { baseFee: number; crossCategoryFee: number } };
    expect(body.deliveryFeeConfig).toMatchObject({ baseFee: 150, crossCategoryFee: 70 });
  });

  it("PATCH /delivery-fee-config — empty body → 422", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/delivery-fee-config", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("PATCH /delivery-fee-config — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/delivery-fee-config", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ baseFee: 150 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message?: string }).message).toMatch(/Master Admin/i);
  });

  // ----- POST /special-delivery-fee-rules -----

  it("POST /special-delivery-fee-rules — principal inserts → 201 (camel→snake)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: ruleRow({}) }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/special-delivery-fee-rules", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          target: [{ scope: "model", modelId: MODEL_ID_LIVE }],
          standaloneFee: 80,
          crossCategoryFollowupFee: 30,
          label: "Big sofa transport",
          sortOrder: 5,
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.table).toBe("special_delivery_fee_rules");
    expect(ins?.payload).toMatchObject({
      target: [{ scope: "model", modelId: MODEL_ID_LIVE }],
      standalone_fee: 80,
      cross_cat_followup_fee: 30,
      label: "Big sofa transport",
      active: true,
      sort_order: 5,
    });
    const body = (await res.json()) as { specialDeliveryFeeRule: { standaloneFee: number } };
    expect(body.specialDeliveryFeeRule).toMatchObject({ standaloneFee: 80, crossCategoryFollowupFee: 30 });
  });

  it("POST /special-delivery-fee-rules — empty target → 422", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/special-delivery-fee-rules", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ target: [], standaloneFee: 80, crossCategoryFollowupFee: 30 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("POST /special-delivery-fee-rules — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/special-delivery-fee-rules", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          target: [{ scope: "model", modelId: MODEL_ID_LIVE }],
          standaloneFee: 80,
          crossCategoryFollowupFee: 30,
        }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message?: string }).message).toMatch(/Master Admin/i);
  });

  // ----- PATCH /special-delivery-fee-rules/:id -----

  it("PATCH /special-delivery-fee-rules/:id — principal partial update → 200 (camel→snake)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({ recorded, writeReturn: ruleRow({ standalone_fee: 95, active: false }) }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/special-delivery-fee-rules/${RULE_A}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ standaloneFee: 95, active: false }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toMatchObject({ standalone_fee: 95, active: false });
    const body = (await res.json()) as { specialDeliveryFeeRule: { standaloneFee: number; active: boolean } };
    expect(body.specialDeliveryFeeRule).toMatchObject({ standaloneFee: 95, active: false });
  });

  it("PATCH /special-delivery-fee-rules/:id — empty body → 422", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/special-delivery-fee-rules/${RULE_A}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("PATCH /special-delivery-fee-rules/:id — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/special-delivery-fee-rules/${RULE_A}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ standaloneFee: 95 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  // ----- DELETE /special-delivery-fee-rules/:id -----

  it("DELETE /special-delivery-fee-rules/:id — HARD delete → 200 { ok: true }", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/special-delivery-fee-rules/${RULE_A}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const del = recorded.find((r) => r.op === "delete");
    expect(del?.table).toBe("special_delivery_fee_rules");
  });

  it("DELETE /special-delivery-fee-rules/:id — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/special-delivery-fee-rules/${RULE_A}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 0185 — Default Free Gifts (per model) + Free Item Campaigns (GWP). GET bundle
// exposure + principal-gated CRUD. Mirrors the 0184 delivery-fee block: buildSb
// for the read bundle, buildWriteSb for the writes.
// ---------------------------------------------------------------------------
describe("0185 — free gifts + free item campaigns (GET bundle + principal-gated CRUD)", () => {
  const CAMP_A = "aa000000-0000-4000-8000-0000000000a1"; // active
  const CAMP_B = "bb000000-0000-4000-8000-0000000000b2"; // inactive
  const campRow = (over: Record<string, unknown>) => ({
    id: CAMP_A,
    name: "Active GWP",
    active: true,
    max_free_qty: 2,
    eligible: [{ scope: "model", modelId: MODEL_ID_LIVE }],
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    updated_by: null,
    ...over,
  });

  it("GET /api/catalog returns modelDefaultFreeGifts (mapped) + freeItemCampaigns (active-first)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
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
        ],
        product_skus: [],
        sofa_fabrics: [],
        addons: [],
        floor_config: [
          { id: 1, free_up_to_floor: 2, per_floor_per_item: 50, updated_at: "2025-01-01T00:00:00Z" },
        ],
        fabric_tier_addon_config: [
          { id: 1, sofa_tier2_delta: 0, sofa_tier3_delta: 0, updated_at: "2025-01-01T00:00:00Z", updated_by: null },
        ],
        model_fabric_tier_overrides: [],
        model_default_free_gifts: [
          {
            model_id: MODEL_ID_LIVE,
            gifts: [{ giftSku: "ACC-PILLOW", qty: 2, label: "Free pillow" }],
            updated_at: "2026-02-01T00:00:00Z",
            updated_by: null,
          },
        ],
        free_item_campaigns: [
          campRow({ id: CAMP_B, name: "Retired GWP", active: false, created_at: "2026-01-01T00:00:00Z" }),
          campRow({ id: CAMP_A, name: "Active GWP", active: true, created_at: "2026-02-01T00:00:00Z" }),
        ],
      }),
    );
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;

    // Gift set mapped camelCase; malformed entries (none here) would be dropped.
    expect(body.modelDefaultFreeGifts).toHaveLength(1);
    expect(body.modelDefaultFreeGifts?.[0]?.modelId).toBe(MODEL_ID_LIVE);
    expect(body.modelDefaultFreeGifts?.[0]?.gifts[0]).toMatchObject({
      giftSku: "ACC-PILLOW",
      qty: 2,
      label: "Free pillow",
    });

    // Both campaigns returned (inactive included); active-first ordering.
    expect(body.freeItemCampaigns).toHaveLength(2);
    expect(body.freeItemCampaigns?.map((c) => c.id)).toEqual([CAMP_A, CAMP_B]);
    expect(body.freeItemCampaigns?.find((c) => c.id === CAMP_A)).toMatchObject({
      name: "Active GWP",
      active: true,
      maxFreeQty: 2,
      eligible: [{ scope: "model", modelId: MODEL_ID_LIVE }],
    });
  });

  it("GET /api/catalog ships empty arrays when none are authored (dormant)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        product_models: [],
        product_skus: [],
        sofa_fabrics: [],
        addons: [],
        floor_config: [{ id: 1, free_up_to_floor: 2, per_floor_per_item: 50 }],
        fabric_tier_addon_config: [
          { id: 1, sofa_tier2_delta: 0, sofa_tier3_delta: 0, updated_at: "2025-01-01T00:00:00Z", updated_by: null },
        ],
        model_fabric_tier_overrides: [],
      }),
    );
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;
    expect(body.modelDefaultFreeGifts).toEqual([]);
    expect(body.freeItemCampaigns).toEqual([]);
  });

  // ----- PUT /model-free-gifts/:modelId -----

  it("PUT /model-free-gifts/:modelId — principal upserts → 200 (camel→snake)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        recorded,
        writeReturn: {
          model_id: MODEL_ID_LIVE,
          gifts: [{ giftSku: "ACC-PILLOW", qty: 2 }],
          updated_at: "2026-02-01T00:00:00Z",
          updated_by: null,
        },
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/model-free-gifts/${MODEL_ID_LIVE}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ gifts: [{ giftSku: "ACC-PILLOW", qty: 2 }] }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const up = recorded.find((r) => r.op === "upsert");
    expect(up?.table).toBe("model_default_free_gifts");
    expect(up?.payload).toMatchObject({
      model_id: MODEL_ID_LIVE,
      gifts: [{ giftSku: "ACC-PILLOW", qty: 2 }],
    });
    const body = (await res.json()) as { modelDefaultFreeGifts: { modelId: string; gifts: unknown[] } };
    expect(body.modelDefaultFreeGifts).toMatchObject({
      modelId: MODEL_ID_LIVE,
      gifts: [{ giftSku: "ACC-PILLOW", qty: 2 }],
    });
  });

  it("PUT /model-free-gifts/:modelId — empty gifts clears (delete) → 200", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/model-free-gifts/${MODEL_ID_LIVE}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ gifts: [] }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const del = recorded.find((r) => r.op === "delete");
    expect(del?.table).toBe("model_default_free_gifts");
    const body = (await res.json()) as { modelDefaultFreeGifts: { modelId: string; gifts: unknown[] } };
    expect(body.modelDefaultFreeGifts).toEqual({ modelId: MODEL_ID_LIVE, gifts: [] });
  });

  it("PUT /model-free-gifts/:modelId — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/model-free-gifts/${MODEL_ID_LIVE}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ gifts: [{ giftSku: "ACC-PILLOW", qty: 1 }] }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message?: string }).message).toMatch(/Master Admin/i);
  });

  // ----- DELETE /model-free-gifts/:modelId -----

  it("DELETE /model-free-gifts/:modelId — HARD delete → 200 { ok: true }", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/model-free-gifts/${MODEL_ID_LIVE}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const del = recorded.find((r) => r.op === "delete");
    expect(del?.table).toBe("model_default_free_gifts");
  });

  it("DELETE /model-free-gifts/:modelId — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/model-free-gifts/${MODEL_ID_LIVE}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  // ----- POST /free-item-campaigns -----

  it("POST /free-item-campaigns — principal inserts → 201 (camel→snake; active defaults false)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({ recorded, writeReturn: campRow({ active: false, max_free_qty: 1 }) }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/free-item-campaigns", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New GWP",
          eligible: [{ scope: "model", modelId: MODEL_ID_LIVE }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.table).toBe("free_item_campaigns");
    expect(ins?.payload).toMatchObject({
      name: "New GWP",
      active: false,
      max_free_qty: 1,
      eligible: [{ scope: "model", modelId: MODEL_ID_LIVE }],
    });
    const body = (await res.json()) as { freeItemCampaign: { name: string; active: boolean } };
    expect(body.freeItemCampaign).toMatchObject({ active: false, maxFreeQty: 1 });
  });

  it("POST /free-item-campaigns — empty eligible → 422", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/free-item-campaigns", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bad GWP", eligible: [] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("POST /free-item-campaigns — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/free-item-campaigns", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New GWP",
          eligible: [{ scope: "model", modelId: MODEL_ID_LIVE }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message?: string }).message).toMatch(/Master Admin/i);
  });

  // ----- PATCH /free-item-campaigns/:id -----

  it("PATCH /free-item-campaigns/:id — principal partial update → 200 (camel→snake)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({ recorded, writeReturn: campRow({ active: true, max_free_qty: 3 }) }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/free-item-campaigns/${CAMP_A}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ active: true, maxFreeQty: 3 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.table).toBe("free_item_campaigns");
    expect(upd?.payload).toMatchObject({ active: true, max_free_qty: 3 });
    const body = (await res.json()) as { freeItemCampaign: { active: boolean; maxFreeQty: number } };
    expect(body.freeItemCampaign).toMatchObject({ active: true, maxFreeQty: 3 });
  });

  it("PATCH /free-item-campaigns/:id — empty body → 422", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/free-item-campaigns/${CAMP_A}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("PATCH /free-item-campaigns/:id — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/free-item-campaigns/${CAMP_A}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  // ----- DELETE /free-item-campaigns/:id -----

  it("DELETE /free-item-campaigns/:id — HARD delete → 200 { ok: true }", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/free-item-campaigns/${CAMP_A}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const del = recorded.find((r) => r.op === "delete");
    expect(del?.table).toBe("free_item_campaigns");
  });

  it("DELETE /free-item-campaigns/:id — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/free-item-campaigns/${CAMP_A}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 0186 — PWP & Promo rules (2990s Products parity Phase 8a). GET bundle exposure
// (incl. the per-SKU pwp_price + per-sofa-combo pwp_prices_by_height read-through)
// + principal-gated CRUD. Mirrors the 0185 free-item-campaigns block: buildSb for
// the read bundle, buildWriteSb for the writes.
// ---------------------------------------------------------------------------
describe("0186 — PWP & Promo rules (GET bundle + principal-gated CRUD)", () => {
  const RULE_A = "ee000000-0000-4000-8000-0000000000e1"; // active
  const RULE_B = "ff000000-0000-4000-8000-0000000000f2"; // inactive
  const pwpRow = (over: Record<string, unknown>) => ({
    id: RULE_A,
    type: "pwp",
    trigger_category: "mattress",
    trigger_targets: [{ scope: "model", modelId: MODEL_ID_LIVE }],
    reward_category: "accessory",
    reward_targets: [],
    qty_per_trigger: 1,
    active: true,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    updated_by: null,
    ...over,
  });

  it("GET /api/catalog returns pwpRules (mapped via pwpRuleFromRow, active-first)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
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
        ],
        product_skus: [],
        sofa_fabrics: [],
        addons: [],
        floor_config: [
          { id: 1, free_up_to_floor: 2, per_floor_per_item: 50, updated_at: "2025-01-01T00:00:00Z" },
        ],
        fabric_tier_addon_config: [
          { id: 1, sofa_tier2_delta: 0, sofa_tier3_delta: 0, updated_at: "2025-01-01T00:00:00Z", updated_by: null },
        ],
        model_fabric_tier_overrides: [],
        pwp_rules: [
          pwpRow({ id: RULE_B, type: "promo", active: false, created_at: "2026-01-01T00:00:00Z" }),
          pwpRow({ id: RULE_A, type: "pwp", active: true, created_at: "2026-02-01T00:00:00Z" }),
        ],
      }),
    );
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;

    // Both rules returned (inactive included); active-first ordering.
    expect(body.pwpRules).toHaveLength(2);
    expect(body.pwpRules?.map((r) => r.id)).toEqual([RULE_A, RULE_B]);
    expect(body.pwpRules?.find((r) => r.id === RULE_A)).toMatchObject({
      type: "pwp",
      triggerCategory: "mattress",
      triggerTargets: [{ scope: "model", modelId: MODEL_ID_LIVE }],
      rewardCategory: "accessory",
      rewardTargets: [],
      qtyPerTrigger: 1,
      active: true,
    });
  });

  it("GET /api/catalog surfaces pwp_price on a sku + pwp_prices_by_height on a sofa combo", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        product_models: [
          {
            id: MODEL_ID_LIVE,
            category: "sofa",
            model_key: "carres-sofa",
            name: "Sofa",
            blurb: null,
            colors: null,
            gaps: null,
            sofa_mode: null,
            discontinued_at: null,
          },
        ],
        product_skus: [
          {
            id: "00000000-0000-0000-0000-00000000bb01",
            model_id: MODEL_ID_LIVE,
            sku: "CARRES-SOFA-2A",
            variant: "2A",
            variant_kind: "part",
            price: 1500,
            cost: null,
            // 0186 — per-SKU PWP reward price rides in the bundle (POS preview).
            pwp_price: "999.00",
            supplier_id: null,
            pos_active: true,
          },
        ],
        sofa_fabrics: [],
        addons: [],
        floor_config: [
          { id: 1, free_up_to_floor: 2, per_floor_per_item: 50, updated_at: "2025-01-01T00:00:00Z" },
        ],
        fabric_tier_addon_config: [
          { id: 1, sofa_tier2_delta: 0, sofa_tier3_delta: 0, updated_at: "2025-01-01T00:00:00Z", updated_by: null },
        ],
        model_fabric_tier_overrides: [],
        sofa_combo_pricing: [
          {
            id: "00000000-0000-0000-0000-0000000f0001",
            model_id: MODEL_ID_LIVE,
            slots: [["2A(LHF)", "2A(RHF)"]],
            tier: null,
            prices_by_height: { "24": 2640 },
            cost_by_height: null,
            // 0186 — per-sofa-combo PWP reward price (per seat height).
            pwp_prices_by_height: { "24": 1990 },
            label: null,
            effective_from: "2026-06-21",
            active: true,
            discontinued_at: null,
            created_at: "2026-06-21T00:00:00Z",
            updated_at: "2026-06-21T00:00:00Z",
            updated_by: null,
          },
        ],
      }),
    );
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;
    // The PWP reward price legitimately reaches the POS (read-exposure by design).
    expect(body.skus[0]?.pwpPrice).toBe(999);
    expect(body.sofaCombos?.[0]?.pwpPricesByHeight).toEqual({ "24": 1990 });
  });

  it("GET /api/catalog ships an empty pwpRules array when none are authored (dormant)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        product_models: [],
        product_skus: [],
        sofa_fabrics: [],
        addons: [],
        floor_config: [{ id: 1, free_up_to_floor: 2, per_floor_per_item: 50 }],
        fabric_tier_addon_config: [
          { id: 1, sofa_tier2_delta: 0, sofa_tier3_delta: 0, updated_at: "2025-01-01T00:00:00Z", updated_by: null },
        ],
        model_fabric_tier_overrides: [],
      }),
    );
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;
    expect(body.pwpRules).toEqual([]);
  });

  // ----- POST /pwp-rules -----

  it("POST /pwp-rules — principal inserts → 201 (camel→snake; qty defaults 1, active defaults false)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({ recorded, writeReturn: pwpRow({ active: false, qty_per_trigger: 1 }) }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/pwp-rules", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "pwp",
          triggerCategory: "mattress",
          triggerTargets: [{ scope: "model", modelId: MODEL_ID_LIVE }],
          rewardCategory: "accessory",
          // Empty rewardTargets = the whole category (allowed for PWP).
          rewardTargets: [],
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.table).toBe("pwp_rules");
    expect(ins?.payload).toMatchObject({
      type: "pwp",
      trigger_category: "mattress",
      trigger_targets: [{ scope: "model", modelId: MODEL_ID_LIVE }],
      reward_category: "accessory",
      reward_targets: [],
      qty_per_trigger: 1,
      active: false,
    });
    const body = (await res.json()) as { pwpRule: { type: string; active: boolean; qtyPerTrigger: number } };
    expect(body.pwpRule).toMatchObject({ type: "pwp", active: false, qtyPerTrigger: 1 });
  });

  it("POST /pwp-rules — carry_forward defaults true / null when omitted (P8d, 0188)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({ recorded, writeReturn: pwpRow({}) }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/pwp-rules", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "pwp",
          triggerCategory: "mattress",
          triggerTargets: [],
          rewardCategory: "accessory",
          rewardTargets: [],
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.payload).toMatchObject({ carry_forward: true, carry_forward_days: null });
  });

  it("POST /pwp-rules — carry_forward=false + carry_forward_days=30 round-trip to the insert (P8d, 0188)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({ recorded, writeReturn: pwpRow({ carry_forward: false, carry_forward_days: 30 }) }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/pwp-rules", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "pwp",
          triggerCategory: "mattress",
          triggerTargets: [],
          rewardCategory: "accessory",
          rewardTargets: [],
          carryForward: false,
          carryForwardDays: 30,
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.payload).toMatchObject({ carry_forward: false, carry_forward_days: 30 });
  });

  it("POST /pwp-rules — bad input (qtyPerTrigger 0) → 422", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/pwp-rules", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "pwp",
          triggerCategory: "mattress",
          triggerTargets: [],
          rewardCategory: "accessory",
          rewardTargets: [],
          qtyPerTrigger: 0,
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("POST /pwp-rules — bad input (unknown type) → 422", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/pwp-rules", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "discount",
          triggerCategory: "mattress",
          triggerTargets: [],
          rewardCategory: "accessory",
          rewardTargets: [],
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("POST /pwp-rules — non-principal → 403 (/Master Admin/i)", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/pwp-rules", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "pwp",
          triggerCategory: "mattress",
          triggerTargets: [],
          rewardCategory: "accessory",
          rewardTargets: [],
        }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message?: string }).message).toMatch(/Master Admin/i);
  });

  // ----- PATCH /pwp-rules/:id -----

  it("PATCH /pwp-rules/:id — principal partial update → 200 (camel→snake)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({ recorded, writeReturn: pwpRow({ active: true, qty_per_trigger: 2 }) }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/pwp-rules/${RULE_A}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ active: true, qtyPerTrigger: 2 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.table).toBe("pwp_rules");
    expect(upd?.payload).toMatchObject({ active: true, qty_per_trigger: 2 });
    const body = (await res.json()) as { pwpRule: { active: boolean; qtyPerTrigger: number } };
    expect(body.pwpRule).toMatchObject({ active: true, qtyPerTrigger: 2 });
  });

  it("PATCH /pwp-rules/:id — carry_forward=false + carry_forward_days=30 round-trip to the patch (P8d, 0188)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({ recorded, writeReturn: pwpRow({ carry_forward: false, carry_forward_days: 30 }) }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/pwp-rules/${RULE_A}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ carryForward: false, carryForwardDays: 30 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toMatchObject({ carry_forward: false, carry_forward_days: 30 });
  });

  it("PATCH /pwp-rules/:id — empty body → 422", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: pwpRow({}) }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/pwp-rules/${RULE_A}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("PATCH /pwp-rules/:id — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/pwp-rules/${RULE_A}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("PATCH /pwp-rules/:id — missing row → 404", async () => {
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ writeReturn: null }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/pwp-rules/${RULE_A}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  // ----- DELETE /pwp-rules/:id -----

  it("DELETE /pwp-rules/:id — HARD delete → 200 { ok: true }", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/pwp-rules/${RULE_A}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const del = recorded.find((r) => r.op === "delete");
    expect(del?.table).toBe("pwp_rules");
  });

  it("DELETE /pwp-rules/:id — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/pwp-rules/${RULE_A}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 0239 — Product bundles (bundle pricing). GET bundle exposure (POS sees active
// only; admin sees all) + principal-gated CRUD. Mirrors the 0186 pwp-rules
// block: buildSb for the read bundle, buildWriteSb for the writes.
// ---------------------------------------------------------------------------
describe("0239 — product bundles (GET bundle + principal-gated CRUD)", () => {
  const BUNDLE_A = "aa000000-0000-4000-8000-0000000000a1"; // active
  const BUNDLE_B = "bb000000-0000-4000-8000-0000000000b2"; // inactive
  const bundleRow = (over: Record<string, unknown> = {}) => ({
    id: BUNDLE_A,
    name: "King Bedroom Set",
    price: 2500,
    components: [
      { sku: "MAT-001-K", qty: 1 },
      { sku: "LUMI-CLASSIC-K", qty: 1 },
      { sku: "BED-201-K", qty: 1 },
    ],
    active: true,
    sort_order: 0,
    created_at: "2026-07-19T00:00:00Z",
    updated_at: "2026-07-19T00:00:00Z",
    updated_by: null,
    ...over,
  });

  const baseTables = () => ({
    product_models: [],
    product_skus: [],
    sofa_fabrics: [],
    addons: [],
    floor_config: [{ id: 1, free_up_to_floor: 2, per_floor_per_item: 50 }],
    fabric_tier_addon_config: [
      { id: 1, sofa_tier2_delta: 0, sofa_tier3_delta: 0, updated_at: "2025-01-01T00:00:00Z", updated_by: null },
    ],
    model_fabric_tier_overrides: [],
  });

  it("GET /api/catalog returns ACTIVE bundles only for a non-admin consumer (POS)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        ...baseTables(),
        product_bundles: [
          bundleRow({}),
          bundleRow({ id: BUNDLE_B, name: "Retired Set", active: false }),
        ],
      }),
    );
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;
    expect(body.bundles).toHaveLength(1);
    expect(body.bundles?.[0]).toMatchObject({
      id: BUNDLE_A,
      name: "King Bedroom Set",
      price: 2500,
      active: true,
      sortOrder: 0,
      components: [
        { sku: "MAT-001-K", qty: 1 },
        { sku: "LUMI-CLASSIC-K", qty: 1 },
        { sku: "BED-201-K", qty: 1 },
      ],
    });
  });

  it("GET /api/catalog?admin=true returns inactive bundles too (editor)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        ...baseTables(),
        product_bundles: [
          bundleRow({}),
          bundleRow({ id: BUNDLE_B, name: "Retired Set", active: false }),
        ],
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog?admin=true", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;
    expect(body.bundles).toHaveLength(2);
  });

  it("GET /api/catalog drops malformed component entries (adapter parse)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        ...baseTables(),
        product_bundles: [
          bundleRow({
            components: [
              { sku: "MAT-001-K", qty: 1 },
              { sku: "", qty: 1 },
              { sku: "BED-201-K", qty: 0 },
              "garbage",
            ],
          }),
        ],
      }),
    );
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;
    expect(body.bundles?.[0]?.components).toEqual([{ sku: "MAT-001-K", qty: 1 }]);
  });

  it("GET /api/catalog ships an empty bundles array when none are authored (dormant)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb(baseTables()));
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CatalogResponse;
    expect(body.bundles).toEqual([]);
  });

  // ----- POST /bundles -----

  it("POST /bundles — principal inserts → 201 (camel→snake; active defaults false)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({ recorded, writeReturn: bundleRow({ active: false }) }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/bundles", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "King Bedroom Set",
          price: 2500,
          components: [
            { sku: "MAT-001-K", qty: 1 },
            { sku: "LUMI-CLASSIC-K", qty: 1 },
            { sku: "BED-201-K", qty: 1 },
          ],
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.table).toBe("product_bundles");
    expect(ins?.payload).toMatchObject({
      name: "King Bedroom Set",
      price: 2500,
      components: [
        { sku: "MAT-001-K", qty: 1 },
        { sku: "LUMI-CLASSIC-K", qty: 1 },
        { sku: "BED-201-K", qty: 1 },
      ],
      active: false,
      sort_order: 0,
    });
    const body = (await res.json()) as { bundle: { name: string; price: number; active: boolean } };
    expect(body.bundle).toMatchObject({ name: "King Bedroom Set", price: 2500, active: false });
  });

  it("POST /bundles — a single-component bundle → 422 (≥2 components)", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/bundles", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Just one",
          price: 100,
          components: [{ sku: "MAT-001-K", qty: 1 }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("POST /bundles — bad component qty (0) → 422", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/bundles", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Bad qty",
          price: 100,
          components: [
            { sku: "MAT-001-K", qty: 0 },
            { sku: "BED-201-K", qty: 1 },
          ],
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("POST /bundles — non-principal → 403 (/Master Admin/i)", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/bundles", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "King Bedroom Set",
          price: 2500,
          components: [
            { sku: "MAT-001-K", qty: 1 },
            { sku: "BED-201-K", qty: 1 },
          ],
        }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message?: string };
    expect(String(body.message ?? "")).toMatch(/Master Admin/i);
  });

  // ----- PATCH /bundles/:id -----

  it("PATCH /bundles/:id — principal partial update → 200 (camel→snake)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({ recorded, writeReturn: bundleRow({ price: 2400, active: true }) }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/bundles/${BUNDLE_A}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ price: 2400, active: true }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.table).toBe("product_bundles");
    expect(upd?.payload).toMatchObject({ price: 2400, active: true });
    const body = (await res.json()) as { bundle: { price: number; active: boolean } };
    expect(body.bundle).toMatchObject({ price: 2400, active: true });
  });

  it("PATCH /bundles/:id — empty body → 422", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/bundles/${BUNDLE_A}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("PATCH /bundles/:id — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/bundles/${BUNDLE_A}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ price: 2400 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("PATCH /bundles/:id — missing row → 404", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: null }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/bundles/${BUNDLE_A}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ price: 2400 }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  // ----- DELETE /bundles/:id -----

  it("DELETE /bundles/:id — HARD delete → 200 { ok: true }", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/bundles/${BUNDLE_A}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const del = recorded.find((r) => r.op === "delete");
    expect(del?.table).toBe("product_bundles");
  });

  it("DELETE /bundles/:id — non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/bundles/${BUNDLE_A}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 0186 — per-SKU pwp_price + per-sofa-combo pwp_prices_by_height write paths
// (the EXISTING principal-gated sku / sofa-combo update routes). pwp_price joins
// the 0175 price/cost principal lock; pwp_prices_by_height rides the already
// principal-only sofa-combo routes (mirrors 0183 cost_by_height).
// ---------------------------------------------------------------------------
describe("0186 — pwp_price + pwp_prices_by_height write paths", () => {
  const SKU_ID = "00000000-0000-0000-0000-00000000bb01";
  const SOFA_COMBO_ID = "00000000-0000-0000-0000-0000000f0001";

  const skuRow = (over: Record<string, unknown> = {}) => ({
    id: SKU_ID,
    model_id: MODEL_ID_LIVE,
    sku: "CARRES-CLASSIC-Queen",
    variant: "queen",
    variant_kind: "size",
    price: 1500,
    cost: null,
    pwp_price: null,
    supplier_id: null,
    discontinued_at: null,
    pos_active: true,
    description: null,
    ...over,
  });

  it("PATCH /skus/:id — principal sets pwp_price → 200 (camelCase pwpPrice → snake)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({ recorded, writeReturn: skuRow({ pwp_price: 999 }) }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pwpPrice: 999 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toEqual({ pwp_price: 999 });
  });

  it("PATCH /skus/:id — pwpPrice:null (clearing) by a non-principal → 403 (joins the 0175 lock)", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pwpPrice: null }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message?: string }).message).toMatch(/Master Admin/i);
  });

  it("PATCH /skus/:id — WITHOUT pwpPrice does NOT write pwp_price (no clobber)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({ recorded, writeReturn: skuRow({ pos_active: false }) }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ posActive: false }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).not.toHaveProperty("pwp_price");
  });

  // 0204 — per-size price map: same principal lock + full-map replace.
  it("PATCH /skus/:id — principal sets pricesBySize → 200 (camelCase → prices_by_size, full map)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({ recorded, writeReturn: skuRow({ prices_by_size: { "24": 900 } }) }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pricesBySize: { "24": 900, "32": 1200 } }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).toEqual({ prices_by_size: { "24": 900, "32": 1200 } });
  });

  it("PATCH /skus/:id — pricesBySize by a non-principal → 403 (joins the 0175/0204 lock)", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pricesBySize: { "24": 900 } }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message?: string }).message).toMatch(/Master Admin/i);
  });

  it("PATCH /skus/:id — a negative per-size price → 422 (schema)", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/skus/${SKU_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pricesBySize: { "24": -5 } }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("POST /skus — a sku WITH pwpPrice by a non-principal → 403", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/skus", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: MODEL_ID_LIVE,
          variant: "Twin",
          variantKind: "size",
          price: 0,
          pwpPrice: 999,
        }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("POST /skus — principal seeds pwp_price → 201 (camel→snake)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildWriteSb({
        reads: {
          product_models: [
            { id: MODEL_ID_LIVE, category: "mattress", model_key: "carres-classic" },
          ],
          suppliers: [
            { id: "00000000-0000-0000-0000-00000000ff01", cat_covered: ["mattress"] },
          ],
        },
        recorded,
        writeReturn: skuRow({ pwp_price: 999, price: 2400 }),
      }),
    );
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/skus", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: MODEL_ID_LIVE,
          variant: "Twin",
          variantKind: "size",
          price: 2400,
          pwpPrice: 999,
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect((ins?.payload as { pwp_price: number }).pwp_price).toBe(999);
  });

  const sofaComboRow = (over: Record<string, unknown> = {}) => ({
    id: SOFA_COMBO_ID,
    model_id: MODEL_ID_LIVE,
    slots: [["2A(LHF)", "2A(RHF)"]],
    tier: null,
    prices_by_height: { "24": 2640 },
    cost_by_height: null,
    pwp_prices_by_height: null,
    label: null,
    effective_from: "2026-06-21",
    active: true,
    discontinued_at: null,
    created_at: "2026-06-21T00:00:00Z",
    updated_at: "2026-06-21T00:00:00Z",
    updated_by: null,
    ...over,
  });

  it("POST /sofa-combos — principal persists pwp_prices_by_height (camelCase → snake)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: sofaComboRow() }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/sofa-combos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: MODEL_ID_LIVE,
          slots: [["2A(LHF)", "2A(RHF)"]],
          pricesByHeight: { "24": 2640 },
          pwpPricesByHeight: { "24": 1990 },
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect((ins?.payload as { pwp_prices_by_height: Record<string, number> }).pwp_prices_by_height).toEqual({ "24": 1990 });
  });

  it("POST /sofa-combos — omitted pwpPricesByHeight → insert writes pwp_prices_by_height: null (unset)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: sofaComboRow() }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/sofa-combos", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: MODEL_ID_LIVE,
          slots: [["2A(LHF)", "2A(RHF)"]],
          pricesByHeight: { "24": 2640 },
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect((ins?.payload as { pwp_prices_by_height: unknown }).pwp_prices_by_height).toBeNull();
  });

  it("PATCH /sofa-combos/:id — updates pwp_prices_by_height (camelCase → snake)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: sofaComboRow() }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-combos/${SOFA_COMBO_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pwpPricesByHeight: { "30": 2100 } }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect((upd?.payload as { pwp_prices_by_height: Record<string, number> }).pwp_prices_by_height).toEqual({ "30": 2100 });
  });

  it("PATCH /sofa-combos/:id — WITHOUT pwpPricesByHeight does NOT write pwp_prices_by_height (no clobber)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildWriteSb({ recorded, writeReturn: sofaComboRow() }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/sofa-combos/${SOFA_COMBO_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Renamed" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.payload).not.toHaveProperty("pwp_prices_by_height");
  });
});

// ---------------------------------------------------------------------------
// 0201 — option pool BATCH save (PUT /option-pools/:pool → catalog_pool_batch_
// save RPC) + config-history read. The RPC replaces the pool's contents and
// appends a catalog_config_history snapshot atomically; these tests assert the
// route→RPC contract + gates, not the SQL.
// ---------------------------------------------------------------------------

describe("0201 — option pool batch save + config history", () => {
  /** Minimal sb stub with a recording `.rpc()`. */
  function buildRpcSb(opts?: {
    rpcError?: { code?: string; message?: string } | null;
    calls?: { fn: string; args: unknown }[];
  }): SbStub {
    const calls = opts?.calls ?? [];
    return {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        if (opts?.rpcError) return { data: null, error: opts.rpcError };
        return { data: { ok: true, count: 2 }, error: null };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("PUT /option-pools/:pool — principal → RPC with p_pool/p_entries in array order", async () => {
    const calls: { fn: string; args: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue(buildRpcSb({ calls }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/option-pools/divan_height", {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [
            { value: '4"' },
            { value: '10"', surcharge: 125 },
          ],
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("catalog_pool_batch_save");
    expect(calls[0].args).toEqual({
      p_pool: "divan_height",
      p_entries: [
        { value: '4"', label: null, dimensions: null, surcharge: null, active: true },
        { value: '10"', label: null, dimensions: null, surcharge: 125, active: true },
      ],
      p_notes: null,
    });
  });

  it("PUT /option-pools/:pool — non-principal → 403, RPC never called", async () => {
    const calls: { fn: string; args: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue(buildRpcSb({ calls }));
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/option-pools/divan_height", {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ entries: [{ value: '4"' }] }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("PUT /option-pools/:pool — unknown pool → 404", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/option-pools/branding", {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ entries: [{ value: "X" }] }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("PUT /option-pools/:pool — duplicate values in the body → 409, RPC never called", async () => {
    const calls: { fn: string; args: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue(buildRpcSb({ calls }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/option-pools/gap", {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ entries: [{ value: '4"' }, { value: '4"' }] }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("duplicate_option_pool_value");
    expect(calls).toHaveLength(0);
  });

  it("GET /config-history?section= — internal read maps snapshot rows to camelCase", async () => {
    const historyRow = {
      id: "00000000-0000-0000-0000-0000000e0001",
      section: "divan_height",
      snapshot: [
        { value: '10"', label: null, dimensions: null, surcharge: 125, active: true, sortOrder: 1 },
      ],
      effective_from: "2026-07-05",
      notes: "Baseline — ported from 2990s Portal (0201)",
      created_at: "2026-07-05T08:00:00.000Z",
      created_by: null,
    };
    const eqCalls: { col: string; val: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue({
      from: (table: string) => {
        expect(table).toBe("catalog_config_history");
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = (col: string, val: unknown) => {
          eqCalls.push({ col, val });
          return chain;
        };
        chain.order = () => chain;
        chain.limit = async () => ({ data: [historyRow], error: null });
        return chain;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/config-history?section=divan_height", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(eqCalls).toEqual([{ col: "section", val: "divan_height" }]);
    const body = (await res.json()) as {
      history: { section: string; effectiveFrom: string; entries: { surcharge: number }[] }[];
    };
    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({
      section: "divan_height",
      effectiveFrom: "2026-07-05",
      notes: "Baseline — ported from 2990s Portal (0201)",
    });
    expect(body.history[0].entries[0].surcharge).toBe(125);
  });

  it("GET /config-history — unknown section → 422", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/config-history?section=branding", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// 0202 — global fabric master (PUT /fabrics → catalog_fabrics_batch_save RPC)
// + fabrics history read. Mirrors the 0201 batch-save contract tests above.
// ---------------------------------------------------------------------------

describe("0202 — fabric master batch save + history", () => {
  it("GET /api/catalog returns fabrics (mapped camelCase, sorted by sort_order)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        product_models: [],
        product_skus: [],
        sofa_fabrics: [],
        addons: [],
        floor_config: [
          { id: 1, free_up_to_floor: 2, per_floor_per_item: 50, updated_at: "2025-01-01T00:00:00Z" },
        ],
        catalog_fabrics: [
          {
            id: "00000000-0000-4000-8000-0000000fab02",
            fabric_code: "CG-001",
            series: "KOONA VELVET H2O",
            description: "CG-001 Pearl",
            supplier_code: "KN390-1",
            sofa_tier: "PRICE_2",
            bedframe_tier: "PRICE_2",
            active: true,
            sort_order: 19,
            created_at: "2026-07-06T00:00:00Z",
            updated_at: "2026-07-06T00:00:00Z",
            updated_by: null,
          },
          {
            id: "00000000-0000-4000-8000-0000000fab01",
            fabric_code: "BF-15",
            series: null,
            description: "BF-15",
            supplier_code: "PC151-15",
            sofa_tier: "PRICE_1",
            bedframe_tier: "PRICE_2",
            active: false,
            sort_order: 15,
            created_at: "2026-07-06T00:00:00Z",
            updated_at: "2026-07-06T00:00:00Z",
            updated_by: null,
          },
        ],
      }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      fabrics: {
        fabricCode: string;
        series: string | null;
        supplierCode: string | null;
        sofaTier: string;
        bedframeTier: string;
        active: boolean;
      }[];
    };
    // sorted by sort_order: BF-15 (15) before CG-001 (19); inactive rows kept
    expect(body.fabrics.map((f) => f.fabricCode)).toEqual(["BF-15", "CG-001"]);
    expect(body.fabrics[0]).toMatchObject({
      fabricCode: "BF-15",
      supplierCode: "PC151-15",
      sofaTier: "PRICE_1",
      bedframeTier: "PRICE_2",
      active: false,
    });
    expect(body.fabrics[1]).toMatchObject({
      fabricCode: "CG-001",
      series: "KOONA VELVET H2O",
      sofaTier: "PRICE_2",
    });
  });

  function buildRpcSb(opts?: {
    rpcError?: { code?: string; message?: string } | null;
    calls?: { fn: string; args: unknown }[];
  }): SbStub {
    const calls = opts?.calls ?? [];
    return {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        if (opts?.rpcError) return { data: null, error: opts.rpcError };
        return { data: { ok: true, count: 2 }, error: null };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("PUT /fabrics — principal → RPC with camelCase p_entries in array order (tiers default PRICE_2)", async () => {
    const calls: { fn: string; args: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue(buildRpcSb({ calls }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/fabrics", {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [
            { fabricCode: "BF-01", supplierCode: "PC151-01" },
            { fabricCode: "BF-15", sofaTier: "PRICE_1", active: false },
          ],
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("catalog_fabrics_batch_save");
    expect(calls[0].args).toEqual({
      p_entries: [
        {
          fabricCode: "BF-01",
          series: null,
          description: null,
          supplierCode: "PC151-01",
          sofaTier: "PRICE_2",
          bedframeTier: "PRICE_2",
          active: true,
        },
        {
          fabricCode: "BF-15",
          series: null,
          description: null,
          supplierCode: null,
          sofaTier: "PRICE_1",
          bedframeTier: "PRICE_2",
          active: false,
        },
      ],
      p_notes: null,
    });
  });

  it("PUT /fabrics — non-principal → 403, RPC never called", async () => {
    const calls: { fn: string; args: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue(buildRpcSb({ calls }));
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/fabrics", {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ entries: [{ fabricCode: "BF-01" }] }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("PUT /fabrics — duplicate codes in the body → 409, RPC never called", async () => {
    const calls: { fn: string; args: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue(buildRpcSb({ calls }));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/fabrics", {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ entries: [{ fabricCode: "BF-01" }, { fabricCode: "BF-01" }] }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("duplicate_fabric_code");
    expect(calls).toHaveLength(0);
  });

  it("PUT /fabrics — invalid tier value → 422", async () => {
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/fabrics", {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ entries: [{ fabricCode: "BF-01", sofaTier: "PRICE_9" }] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  // 0226 — Operation Catalog fabric costing (PATCH /fabrics/:id/cost →
  // catalog_fabrics_set_cost DEFINER RPC). Internal (operation + principal).
  const FABRIC_ID = "00000000-0000-0000-0000-0000000fab01";

  it("PATCH /fabrics/:id/cost — operation → RPC with p_id + p_cost", async () => {
    const calls: { fn: string; args: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue(buildRpcSb({ calls }));
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/fabrics/${FABRIC_ID}/cost`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cost: 120.5 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("catalog_fabrics_set_cost");
    expect(calls[0].args).toEqual({ p_id: FABRIC_ID, p_cost: 120.5 });
  });

  it("PATCH /fabrics/:id/cost — cost:null clears the recorded cost", async () => {
    const calls: { fn: string; args: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue(buildRpcSb({ calls }));
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/fabrics/${FABRIC_ID}/cost`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cost: null }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(calls[0].args).toEqual({ p_id: FABRIC_ID, p_cost: null });
  });

  it("PATCH /fabrics/:id/cost — dealer → 403, RPC never called", async () => {
    const calls: { fn: string; args: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue(buildRpcSb({ calls }));
    const jwt = await makeJwt("dealer", DEALER_ID);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/fabrics/${FABRIC_ID}/cost`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cost: 100 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("PATCH /fabrics/:id/cost — negative cost → 422", async () => {
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/fabrics/${FABRIC_ID}/cost`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cost: -5 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("PATCH /fabrics/:id/cost — unknown fabric (P0002) → 404", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildRpcSb({ rpcError: { code: "P0002", message: "fabric not found" } }),
    );
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/catalog/fabrics/${FABRIC_ID}/cost`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cost: 100 }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("GET /fabrics/history — internal read maps fabric-shaped snapshots", async () => {
    const historyRow = {
      id: "00000000-0000-0000-0000-0000000f0001",
      section: "fabrics",
      snapshot: [
        {
          fabricCode: "BF-01",
          series: null,
          description: "BF-01",
          supplierCode: "PC151-01",
          sofaTier: "PRICE_2",
          bedframeTier: "PRICE_2",
          active: true,
          sortOrder: 1,
        },
      ],
      effective_from: "2026-07-06",
      notes: "Baseline — ported from the live 2990s fabric_trackings (0202)",
      created_at: "2026-07-06T08:00:00.000Z",
      created_by: null,
    };
    const eqCalls: { col: string; val: unknown }[] = [];
    vi.mocked(userClient).mockReturnValue({
      from: (table: string) => {
        expect(table).toBe("catalog_config_history");
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = (col: string, val: unknown) => {
          eqCalls.push({ col, val });
          return chain;
        };
        chain.order = () => chain;
        chain.limit = async () => ({ data: [historyRow], error: null });
        return chain;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request("http://t/api/catalog/fabrics/history", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(eqCalls).toEqual([{ col: "section", val: "fabrics" }]);
    const body = (await res.json()) as {
      history: { effectiveFrom: string; entries: { fabricCode: string; sofaTier: string }[] }[];
    };
    expect(body.history).toHaveLength(1);
    expect(body.history[0].effectiveFrom).toBe("2026-07-06");
    expect(body.history[0].entries[0]).toMatchObject({
      fabricCode: "BF-01",
      supplierCode: "PC151-01",
      sofaTier: "PRICE_2",
    });
  });
});
