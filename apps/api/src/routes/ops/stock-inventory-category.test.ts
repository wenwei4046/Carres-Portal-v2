import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import { Hono } from "hono";
import { authMiddleware, _setJwksForTesting } from "../../middleware/auth";
import stockRouter from "./stock";
import type { AppEnv } from "../../types";

/**
 * GET /api/ops/stock/inventory — the CATEGORY the On hand rail filters on.
 *
 * D9 (ERP-ARCHITECTURE §3.1) is a MEASURED defect, not a style preference: three
 * functions used to answer "what kind of product is this?", and the prefix-based
 * one was wrong for every live SKU. What a screenshot could never prove, and
 * these tests can:
 *
 *  1. The category comes through the CATALOG CHAIN (product_skus →
 *     product_models.category) and from nowhere else.
 *  2. A SKU the catalog does not hold returns `null` — never a guess. On live
 *     prod that is 87 of 136 records, and the free-text import SKUs are exactly
 *     the strings a prefix rule would cheerfully mis-classify.
 *  3. A SKU whose TEXT looks like a category still returns whatever the catalog
 *     says (or null). This is the regression test for D9 itself: if anyone ever
 *     reintroduces a SKU-string guess, this is the test that fails.
 *  4. The other list views do not gain the key at all — `null` there would claim
 *     the catalog was asked and had nothing, which is a different fact.
 */

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";
const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

function buildApp() {
  const app = new Hono<AppEnv>();
  app.onError((err, c) => {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Internal server error";
    return c.json({ error: "server_error", message }, status as 400 | 401 | 403 | 404 | 500);
  });
  const api = new Hono<AppEnv>();
  api.use("*", authMiddleware);
  api.route("/ops/stock", stockRouter);
  app.route("/api", api);
  return app;
}
const app = buildApp();

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string, email = "khoryee@carres.com") {
  return new SignJWT({ email, app_metadata: { role } })
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

/**
 * Real shapes from live prod 2026-08-19. `SOFA-...` is catalogued; the two
 * free-text sheet SKUs are not — and note that the pillow's TEXT contains the
 * word "Pillow" while the protector's contains "Mattress". A prefix or keyword
 * rule would call the second one a mattress. The catalog says nothing, so the
 * honest answer is null.
 */
const SOFA_SKU = "TCF-Sofa-Lucca-3S-Beige";
const PILLOW = "Essential Memory Pillow(L)";
const MP_K = "Microfiber Waterproof Mattress Protector-K";

function unit(sku: string, id: string) {
  return {
    id,
    unit_code: `id-${id}`,
    sku,
    warehouse_id: "wh-klang",
    condition: "new",
    status: "free",
    reserved_ref: null,
    ref_history: [],
    needs_repair: false,
    qty: 1,
    supplier: null,
    po_no: null,
    source_ref: null,
    date_in: "2026-05-20",
    reserve_reason: null,
    sold_at: null,
    sold_order_id: null,
    created_at: "2026-05-20T00:00:00Z",
    updated_at: "2026-05-20T00:00:00Z",
  };
}

const STOCK = [unit(SOFA_SKU, "1"), unit(PILLOW, "2"), unit(MP_K, "3")];

interface SbOpts {
  stock?: unknown[];
  /** Rows product_skus returns — i.e. what the CATALOG actually holds. */
  catalog?: unknown[];
  catalogError?: { message: string } | null;
}

function buildSb(opts: SbOpts = {}) {
  const tables: string[] = [];
  /** Every `in(...)` list the catalog read sent, so chunking can be asserted. */
  const catalogInLists: string[][] = [];

  function chainFor(rows: unknown[], onIn?: (vals: string[]) => void) {
    const chain: Record<string, unknown> = {
      then: (res: (v: { data: unknown[]; error: unknown }) => unknown) =>
        Promise.resolve({
          data: rows,
          error: onIn ? opts.catalogError ?? null : null,
        }).then(res),
    };
    for (const m of ["select", "eq", "is", "or", "order", "limit", "range"]) {
      chain[m] = () => chain;
    }
    chain.in = (_col: string, vals: string[]) => {
      onIn?.(vals);
      return chain;
    };
    return chain;
  }

  const sb = {
    from: vi.fn((table: string) => {
      tables.push(table);
      if (table === "product_skus")
        return chainFor(opts.catalog ?? [], (vals) => catalogInLists.push(vals));
      return chainFor(opts.stock ?? STOCK);
    }),
    rpc: vi.fn(async () => ({ data: [], error: null })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { sb, tables, catalogInLists };
}

async function req(path: string, sb: unknown, role = "operation") {
  vi.mocked(userClient).mockReturnValue(sb as never);
  return app.request(
    `/api${path}`,
    { headers: { Authorization: `Bearer ${await makeJwt(role)}` } },
    env,
  );
}

type Item = { sku: string; category?: string | null };
async function inventory(sb: unknown): Promise<Item[]> {
  const res = await req("/ops/stock/inventory", sb);
  expect(res.status).toBe(200);
  return ((await res.json()) as { items: Item[] }).items;
}

describe("GET /api/ops/stock/inventory — the catalog category (D9)", () => {
  it("gives a catalogued unit the category its MODEL carries", async () => {
    const { sb, tables } = buildSb({
      catalog: [{ sku: SOFA_SKU, product_models: { category: "sofa" } }],
    });
    const items = await inventory(sb);
    expect(items.find((i) => i.sku === SOFA_SKU)?.category).toBe("sofa");
    // It came through the catalog chain, not from anywhere else.
    expect(tables).toContain("product_skus");
  });

  it("returns null — never a guess — for a SKU the catalog does not hold", async () => {
    const { sb } = buildSb({
      catalog: [{ sku: SOFA_SKU, product_models: { category: "sofa" } }],
    });
    const items = await inventory(sb);
    expect(items.find((i) => i.sku === PILLOW)?.category).toBeNull();
    expect(items.find((i) => i.sku === MP_K)?.category).toBeNull();
  });

  it("NEVER derives a category from the SKU text — D9's own regression", async () => {
    // The catalog holds nothing at all. Two of these SKUs contain the words
    // "Pillow" and "Mattress"; a prefix/keyword rule would classify them. The
    // only correct answer is null for all three.
    const { sb } = buildSb({ catalog: [] });
    const items = await inventory(sb);
    expect(items.map((i) => i.category)).toEqual([null, null, null]);
  });

  it("honours the catalog even when the SKU text says otherwise", async () => {
    // A SKU whose text reads "Mattress Protector" but which the catalog files
    // under 'accessory'. The catalog wins; that is the whole ruling.
    const { sb } = buildSb({
      catalog: [{ sku: MP_K, product_models: { category: "accessory" } }],
    });
    const items = await inventory(sb);
    expect(items.find((i) => i.sku === MP_K)?.category).toBe("accessory");
  });

  it("accepts PostgREST's array-shaped 1:1 embed as well as the object", async () => {
    const { sb } = buildSb({
      catalog: [{ sku: SOFA_SKU, product_models: [{ category: "sofa" }] }],
    });
    const items = await inventory(sb);
    expect(items.find((i) => i.sku === SOFA_SKU)?.category).toBe("sofa");
  });

  it("asks the catalog ONCE per SKU, not once per unit", async () => {
    // Ten units of one SKU is one question. Asking per row would be 10 reads on
    // a page that already carries 1000+ units.
    const stock = Array.from({ length: 10 }, (_, i) => unit(SOFA_SKU, String(i)));
    const { sb, catalogInLists } = buildSb({
      stock,
      catalog: [{ sku: SOFA_SKU, product_models: { category: "sofa" } }],
    });
    const items = await inventory(sb);
    expect(items).toHaveLength(10);
    expect(items.every((i) => i.category === "sofa")).toBe(true);
    expect(catalogInLists).toHaveLength(1);
    expect(catalogInLists[0]).toEqual([SOFA_SKU]);
  });

  it("chunks a large SKU set so an over-long URL can never blank the answer", async () => {
    // 250 distinct SKUs → 3 reads of ≤100. Before chunking this was one request
    // whose failure mode was an empty map, i.e. every unit silently uncatalogued.
    const stock = Array.from({ length: 250 }, (_, i) => unit(`SKU-${i}`, String(i)));
    const { sb, catalogInLists } = buildSb({ stock, catalog: [] });
    await inventory(sb);
    expect(catalogInLists).toHaveLength(3);
    expect(catalogInLists.map((l) => l.length)).toEqual([100, 100, 50]);
  });

  it("fails OPEN and WHOLE when the catalog read errors", async () => {
    // Every unit reads as uncatalogued; nothing is guessed and the grid still
    // renders. A half-filled map is the dangerous answer, not this one.
    const { sb } = buildSb({
      catalog: [{ sku: SOFA_SKU, product_models: { category: "sofa" } }],
      catalogError: { message: "boom" },
    });
    const items = await inventory(sb);
    expect(items.map((i) => i.category)).toEqual([null, null, null]);
  });

  it("leaves the other list views without the key at all", async () => {
    // absent ≠ null. `null` would say the catalog was asked and held nothing.
    const { sb, tables } = buildSb({});
    const res = await req("/ops/stock/ready", sb);
    expect(res.status).toBe(200);
    const items = ((await res.json()) as { items: Item[] }).items;
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) expect("category" in i).toBe(false);
    expect(tables).not.toContain("product_skus");
  });
});
