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
import { phoneKeyMy } from "@carres/shared";
import { authMiddleware, _setJwksForTesting } from "../middleware/auth";
import rentalRouter from "./rental";
import type { AppEnv } from "../types";

// Mock supabase clients so tests don't hit real Supabase. Each test installs
// its own per-table responses on the mocked userClient (catalog.test.ts
// harness pattern).
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

// The test app mirrors index.ts exactly (authMiddleware on the /api group +
// the same onError JSON shape) so the router is exercised the way production
// mounts it, without importing the whole index route graph.
function buildApp() {
  const app = new Hono<AppEnv>();
  app.onError((err, c) => {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "Internal server error";
    return c.json({ error: "server_error", message }, status as 400 | 401 | 403 | 404 | 422 | 500);
  });
  const api = new Hono<AppEnv>();
  api.use("*", authMiddleware);
  api.route("/rental", rentalRouter);
  app.route("/api", api);
  return app;
}
const app = buildApp();

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string, dealerId: string | null = null) {
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

// ---------------------------------------------------------------------------
// Supabase chain mock — read chains resolve the stubbed per-table rows
// (thenable, so `.select().or().order().limit()` awaits fine); write chains
// (.insert/.update/.delete) record the payload and resolve
// writeReturn/writeError from .maybeSingle()/await. Variant of
// catalog.test.ts's buildSb/buildWriteSb pair, collapsed into one builder.
// ---------------------------------------------------------------------------

interface AdminCall {
  table: string;
  op: "insert" | "update" | "delete";
  payload: unknown;
}
type FilterCall = { method: string; args: unknown[] };
type SbStub = ReturnType<typeof userClient>;

function buildSb(opts: {
  tables?: Record<string, unknown[]>;
  writeReturn?: Record<string, unknown> | null;
  writeError?: { code?: string; message?: string } | null;
  recorded?: AdminCall[];
  recordedFilters?: Record<string, FilterCall[]>;
}): SbStub {
  const recorded = opts.recorded ?? [];
  const filters = opts.recordedFilters ?? {};
  const writeReturn = opts.writeReturn ?? null;
  const writeError = opts.writeError ?? null;

  const mk = (table: string) => {
    filters[table] ??= [];
    let rows: unknown[] = opts.tables?.[table] ?? [];
    let mode: "read" | "write" = "read";

    const chain: Record<string, unknown> = {};
    const rec = (method: string, ...args: unknown[]) => {
      filters[table].push({ method, args });
    };
    chain.select = () => chain;
    chain.insert = (body: unknown) => {
      mode = "write";
      recorded.push({ table, op: "insert", payload: body });
      return chain;
    };
    chain.update = (body: unknown) => {
      mode = "write";
      recorded.push({ table, op: "update", payload: body });
      return chain;
    };
    chain.delete = () => {
      mode = "write";
      recorded.push({ table, op: "delete", payload: null });
      return chain;
    };
    chain.eq = (col: string, val: unknown) => {
      rec("eq", col, val);
      if (mode === "read") {
        rows = rows.filter((r) => (r as Record<string, unknown>)[col] === val);
      }
      return chain;
    };
    chain.or = (expr: string) => {
      rec("or", expr);
      return chain;
    };
    // 0264 — the service-SKU mint filters on `.is("discontinued_at", null)`.
    chain.is = (col: string, val: unknown) => {
      rec("is", col, val);
      if (mode === "read") {
        rows = rows.filter((r) => ((r as Record<string, unknown>)[col] ?? null) === val);
      }
      return chain;
    };
    chain.not = (col: string, op: string, val: unknown) => {
      rec("not", col, op, val);
      return chain;
    };
    chain.ilike = (col: string, pattern: string) => {
      rec("ilike", col, pattern);
      return chain;
    };
    chain.order = (col: string, o?: unknown) => {
      rec("order", col, o);
      return chain;
    };
    chain.limit = (n: number) => {
      rec("limit", n);
      return chain;
    };
    chain.maybeSingle = async () =>
      mode === "write"
        ? { data: writeError ? null : writeReturn, error: writeError }
        : { data: rows[0] ?? null, error: null };
    chain.single = chain.maybeSingle;
    chain.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      resolve(
        mode === "write"
          ? { data: writeError ? null : writeReturn, error: writeError }
          : { data: rows, error: null },
      );
    return chain;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (table: string) => mk(table) } as any;
}

// ---------------------------------------------------------------------------
// Fixtures — snake_case rows mirroring 0247/0248/0249 DDL.
// ---------------------------------------------------------------------------

const PKG_ID = "00000000-0000-0000-0000-0000000c0001";
const PLAN_ID = "00000000-0000-0000-0000-0000000c0002";
const CUSTOMER_ID = "00000000-0000-0000-0000-0000000c0003";
const AGREEMENT_ID = "00000000-0000-0000-0000-0000000c0004";
const UNIT_ID = "00000000-0000-0000-0000-0000000c0005";

const PKG_ROW = {
  id: PKG_ID,
  name: "Annual cleaning",
  service_type: "cleaning",
  duration_months: 12,
  visits_per_year: 2,
  price: 199,
  sku: null,
  active: true,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  updated_by: null,
};

const PLAN_ROW = {
  id: PLAN_ID,
  sku: "CLOUD-K",
  term_months: 84,
  monthly_fee: 59,
  supplier_rate_pct: 49,
  commission_base_pct: 20,
  included_package_id: null,
  active: true,
  created_at: "2026-01-02T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  updated_by: null,
};

// 0264 — offer config fixtures.
const OFFER_ID = "00000000-0000-0000-0000-0000000c0031";
const MODEL_ID = "00000000-0000-0000-0000-0000000c0032";
const SERVICE_MODEL_ID = "00000000-0000-0000-0000-0000000c0033";
const COMBO_ID = "00000000-0000-0000-0000-0000000c0034";

const OFFER_ROW = {
  id: OFFER_ID,
  model_id: MODEL_ID,
  pricing_mode: "variant",
  rent_enabled: true,
  buy_enabled: true,
  terms_months: [60, 84],
  option_prices: {
    leg_heights: { required: true, values: { '5"': { on: true, oneTime: 0, monthly: 5 } } },
  },
  surcharges: [{ code: "delivery", label: "Delivery", oneTime: 150, monthly: 0, required: true }],
  supplier_rate_pct: 49,
  commission_base_pct: 20,
  active: false,
  notes: null,
  created_at: "2026-07-26T00:00:00Z",
  updated_at: "2026-07-26T00:00:00Z",
  updated_by: null,
};

const BUY_PRICE_ROW = {
  id: "00000000-0000-0000-0000-0000000c0035",
  offer_id: OFFER_ID,
  sku: "CLOUD-K",
  combo_id: null,
  price: 4590,
  gifts: [{ sku: "PILLOW-STD", qty: 2 }],
  active: true,
  created_at: "2026-07-26T00:00:00Z",
  updated_at: "2026-07-26T00:00:00Z",
  updated_by: null,
};

const OFFER_SERVICE_ROW = {
  id: "00000000-0000-0000-0000-0000000c0036",
  offer_id: OFFER_ID,
  package_id: PKG_ID,
  free_lane: "rent",
  free_visits: 2,
  monthly_price: null,
  outright_price: null,
  active: true,
  sort_order: 0,
  created_at: "2026-07-26T00:00:00Z",
  updated_at: "2026-07-26T00:00:00Z",
  updated_by: null,
};

const AGREEMENT_ROW = {
  id: AGREEMENT_ID,
  agreement_no: "RA-1001",
  customer_id: CUSTOMER_ID,
  dealer_id: null,
  salesperson_id: null,
  order_id: null,
  plan_id: PLAN_ID,
  sku: "CLOUD-K",
  term_months: 84,
  monthly_fee: 59,
  supplier_rate_pct: 49,
  commission_base_pct: 20,
  start_date: "2026-07-01",
  status: "active",
  buyout_at: null,
  buyout_amount: null,
  ownership_transfer_at: null,
  ownership_doc_url: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  notes: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  created_by: null,
};

const UNIT_ROW = {
  id: UNIT_ID,
  unit_code: "RU-1001",
  sku: "CLOUD-K",
  agreement_id: AGREEMENT_ID,
  customer_id: CUSTOMER_ID,
  status: "in_rental",
  deployed_at: "2026-07-02",
  returned_at: null,
  warranty_until: "2031-07-02",
  notes: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-02T00:00:00Z",
  updated_by: null,
};

const CUSTOMER_ROW = {
  id: CUSTOMER_ID,
  name: "Tan Mei Ling",
  phone: "012-345 6789",
  phone_key: phoneKeyMy("012-345 6789"),
  email: null,
  address: null,
  notes: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  created_by: null,
};

// ---------------------------------------------------------------------------

describe("GET /api/rental/config", () => {
  it("401 without a bearer token", async () => {
    const res = await app.fetch(new Request("http://t/api/rental/config"), env);
    expect(res.status).toBe(401);
  });

  it("403 for a non-internal role (dealer)", async () => {
    const jwt = await makeJwt("dealer", "00000000-0000-0000-0000-000000000d01");
    const res = await app.fetch(
      new Request("http://t/api/rental/config", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("200 — packages ordered by (sort_order, name), plans by created_at, camelCase", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        tables: {
          service_packages: [
            { ...PKG_ROW, id: "00000000-0000-0000-0000-0000000c0011", name: "Z later", sort_order: 2 },
            { ...PKG_ROW, id: "00000000-0000-0000-0000-0000000c0012", name: "B same", sort_order: 1 },
            { ...PKG_ROW, id: "00000000-0000-0000-0000-0000000c0013", name: "A same", sort_order: 1 },
          ],
          rental_plans: [
            { ...PLAN_ROW, id: "00000000-0000-0000-0000-0000000c0021", sku: "NEWER", created_at: "2026-02-01T00:00:00Z" },
            { ...PLAN_ROW, id: "00000000-0000-0000-0000-0000000c0022", sku: "OLDER", created_at: "2026-01-01T00:00:00Z" },
          ],
        },
      }),
    );
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request("http://t/api/rental/config", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      servicePackages: Array<{ name: string; durationMonths: number; visitsPerYear: number }>;
      rentalPlans: Array<{ sku: string; termMonths: number; monthlyFee: number }>;
    };
    expect(body.servicePackages.map((p) => p.name)).toEqual(["A same", "B same", "Z later"]);
    expect(body.servicePackages[0]).toMatchObject({ durationMonths: 12, visitsPerYear: 2 });
    expect(body.rentalPlans.map((p) => p.sku)).toEqual(["OLDER", "NEWER"]);
    expect(body.rentalPlans[0]).toMatchObject({ termMonths: 84, monthlyFee: 59 });
  });
});

describe("POST /api/rental/service-packages", () => {
  it("403 for a non-principal internal role (operation)", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/rental/service-packages", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Annual cleaning", durationMonths: 12, visitsPerYear: 2 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message?: string }).message).toMatch(/Master Admin/i);
  });

  it("201 — principal creates; camel→snake payload; domain object back", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildSb({ recorded, writeReturn: PKG_ROW }));
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/rental/service-packages", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Annual cleaning", durationMonths: 12, visitsPerYear: 2, price: 199 }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.table).toBe("service_packages");
    expect(ins?.payload).toMatchObject({
      name: "Annual cleaning",
      service_type: "cleaning", // zod default applied
      duration_months: 12,
      visits_per_year: 2,
      price: 199,
    });
    const body = (await res.json()) as { servicePackage: { name: string; durationMonths: number } };
    expect(body.servicePackage).toMatchObject({ name: "Annual cleaning", durationMonths: 12 });
  });

  it("422 — invalid input (missing name)", async () => {
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/rental/service-packages", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ durationMonths: 12, visitsPerYear: 2 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

describe("PATCH /api/rental/service-packages/:id", () => {
  it("422 — empty patch body", async () => {
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/rental/service-packages/${PKG_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code?: string }).code).toBe("no_fields");
  });

  it("404 — unknown id (update matches no row)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ writeReturn: null }));
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/rental/service-packages/${PKG_ID}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ price: 249 }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/rental/plans", () => {
  it("201 — principal creates; camel→snake payload; domain object back", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildSb({ recorded, writeReturn: PLAN_ROW }));
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/rental/plans", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: "CLOUD-K",
          termMonths: 84,
          monthlyFee: 59,
          supplierRatePct: 49,
          commissionBasePct: 20,
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.table).toBe("rental_plans");
    expect(ins?.payload).toMatchObject({
      sku: "CLOUD-K",
      term_months: 84,
      monthly_fee: 59,
      supplier_rate_pct: 49,
      commission_base_pct: 20,
    });
    const body = (await res.json()) as { plan: { sku: string; termMonths: number } };
    expect(body.plan).toMatchObject({ sku: "CLOUD-K", termMonths: 84 });
  });

  it("409 — duplicate (sku, term_months) via 23505", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        writeError: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "rental_plans_sku_term_months_key"',
        },
      }),
    );
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/rental/plans", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "CLOUD-K", termMonths: 84, monthlyFee: 59 }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("duplicate_plan");
  });

  it("409 plan_in_use — DELETE /plans/:id blocked by an agreements FK (23503)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        writeError: {
          code: "23503",
          message:
            'update or delete on table "rental_plans" violates foreign key constraint "rental_agreements_plan_id_fkey" on table "rental_agreements"',
        },
      }),
    );
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/rental/plans/11111111-1111-1111-1111-000000000001", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("plan_in_use");
  });

  it("409 package_in_use — DELETE /service-packages/:id blocked by an entitlements FK (23503)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        writeError: {
          code: "23503",
          message:
            'update or delete on table "service_packages" violates foreign key constraint "service_entitlements_package_id_fkey" on table "service_entitlements"',
        },
      }),
    );
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/rental/service-packages/11111111-1111-1111-1111-000000000002", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("package_in_use");
  });

  it("422 invalid_sku — unknown sku FK violation via 23503", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        writeError: {
          code: "23503",
          message: 'insert or update on table "rental_plans" violates foreign key constraint "rental_plans_sku_fkey"',
        },
      }),
    );
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/rental/plans", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "NO-SUCH", termMonths: 84, monthlyFee: 59 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code?: string }).code).toBe("invalid_sku");
  });

  it("422 — invalid input (missing sku)", async () => {
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/rental/plans", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ termMonths: 84, monthlyFee: 59 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

describe("GET /api/rental/agreements", () => {
  it("200 — internal list with the embedded customer name/phone flattened", async () => {
    const recordedFilters: Record<string, FilterCall[]> = {};
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        tables: {
          rental_agreements: [
            { ...AGREEMENT_ROW, customers: { name: "Tan Mei Ling", phone: "012-345 6789" } },
          ],
        },
        recordedFilters,
      }),
    );
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/rental/agreements", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      agreements: Array<{ agreementNo: string; status: string; customerName: string; customerPhone: string }>;
    };
    expect(body.agreements).toHaveLength(1);
    expect(body.agreements[0]).toMatchObject({
      agreementNo: "RA-1001",
      status: "active",
      customerName: "Tan Mei Ling",
      customerPhone: "012-345 6789",
    });
    // Newest first, capped at 200.
    expect(recordedFilters.rental_agreements).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }],
    });
    expect(recordedFilters.rental_agreements).toContainEqual({ method: "limit", args: [200] });
  });

  it("403 for a store role (showroom)", async () => {
    const jwt = await makeJwt("showroom", "00000000-0000-0000-0000-000000000d01");
    const res = await app.fetch(
      new Request("http://t/api/rental/agreements", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/rental/units", () => {
  it("200 — internal unit registry, newest first capped at 500", async () => {
    const recordedFilters: Record<string, FilterCall[]> = {};
    vi.mocked(userClient).mockReturnValue(
      buildSb({ tables: { rental_stock_units: [UNIT_ROW] }, recordedFilters }),
    );
    const jwt = await makeJwt("bd");
    const res = await app.fetch(
      new Request("http://t/api/rental/units", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { units: Array<{ unitCode: string; status: string; sku: string }> };
    expect(body.units).toHaveLength(1);
    expect(body.units[0]).toMatchObject({ unitCode: "RU-1001", status: "in_rental", sku: "CLOUD-K" });
    expect(recordedFilters.rental_stock_units).toContainEqual({ method: "limit", args: [500] });
  });
});

describe("GET /api/rental/customers", () => {
  it("200 — q applies a name/phone ilike OR filter (wildcards escaped)", async () => {
    const recordedFilters: Record<string, FilterCall[]> = {};
    vi.mocked(userClient).mockReturnValue(
      buildSb({ tables: { customers: [CUSTOMER_ROW] }, recordedFilters }),
    );
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/rental/customers?q=mei%25", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { customers: Array<{ name: string; phone: string }> };
    expect(body.customers).toHaveLength(1);
    expect(body.customers[0]).toMatchObject({ name: "Tan Mei Ling", phone: "012-345 6789" });
    // ONE .or() with both ilike arms; the literal % in the query is escaped.
    expect(recordedFilters.customers).toContainEqual({
      method: "or",
      args: ["name.ilike.%mei\\%%,phone.ilike.%mei\\%%"],
    });
    expect(recordedFilters.customers).toContainEqual({ method: "limit", args: [50] });
  });

  it("200 — no q returns the newest 50 unfiltered (no .or)", async () => {
    const recordedFilters: Record<string, FilterCall[]> = {};
    vi.mocked(userClient).mockReturnValue(
      buildSb({ tables: { customers: [CUSTOMER_ROW] }, recordedFilters }),
    );
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/rental/customers", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    expect(recordedFilters.customers?.some((f) => f.method === "or")).toBe(false);
  });
});

describe("POST /api/rental/customers", () => {
  it("201 — computes phone_key server-side with the canonical MY-aware helper", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildSb({ recorded, writeReturn: CUSTOMER_ROW }));
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/rental/customers", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tan Mei Ling", phone: "+60 12-345 6789" }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.table).toBe("customers");
    // The key comes from phoneKeyMy (pwp_phone_key JS twin) — never a local
    // re-normalization; +60 and 0-prefixed forms canonicalize identically.
    expect(ins?.payload).toMatchObject({
      name: "Tan Mei Ling",
      phone: "+60 12-345 6789",
      phone_key: phoneKeyMy("+60 12-345 6789"),
    });
    expect((ins?.payload as { phone_key: string }).phone_key).toBe(phoneKeyMy("012-345 6789"));
    const body = (await res.json()) as { customer: { name: string; phone: string } };
    expect(body.customer).toMatchObject({ name: "Tan Mei Ling" });
  });

  it("409 customer_exists — duplicate phone_key via 23505", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        writeError: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "customers_phone_key_key"',
        },
      }),
    );
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request("http://t/api/rental/customers", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tan Mei Ling", phone: "012-345 6789" }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("customer_exists");
  });

  it("422 — invalid input (phone too short)", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/rental/customers", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tan Mei Ling", phone: "12" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// 0264 — rental OFFERS (the Setting closed loop)
// ---------------------------------------------------------------------------

const authed = async (
  path: string,
  role: string,
  init?: { method?: string; body?: unknown },
): Promise<Response> => {
  const jwt = await makeJwt(role);
  return app.fetch(
    new Request(`http://t${path}`, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    }),
    env,
  );
};

describe("GET /api/rental/config (0264 offer bundle)", () => {
  it("returns offers, buy prices and attached services alongside packages + plans", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        tables: {
          service_packages: [PKG_ROW],
          rental_plans: [PLAN_ROW],
          rental_offers: [OFFER_ROW],
          rental_buy_prices: [BUY_PRICE_ROW],
          rental_offer_services: [OFFER_SERVICE_ROW],
        },
      }),
    );
    const res = await authed("/api/rental/config", "principal");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rentalOffers: Array<{
        modelId: string;
        pricingMode: string;
        termsMonths: number[];
        optionPrices: Record<string, { required: boolean; values: Record<string, unknown> }>;
        surcharges: Array<{ code: string; oneTime: number; required: boolean }>;
      }>;
      buyPrices: Array<{ sku: string; price: number; gifts: Array<{ sku: string; qty: number }> }>;
      offerServices: Array<{ packageId: string; freeLane: string; freeVisits: number }>;
    };
    expect(body.rentalOffers).toHaveLength(1);
    expect(body.rentalOffers[0]).toMatchObject({ modelId: MODEL_ID, pricingMode: "variant" });
    expect(body.rentalOffers[0]!.termsMonths).toEqual([60, 84]);
    expect(body.rentalOffers[0]!.optionPrices.leg_heights).toMatchObject({ required: true });
    expect(body.rentalOffers[0]!.surcharges[0]).toMatchObject({ code: "delivery", oneTime: 150, required: true });
    expect(body.buyPrices[0]).toMatchObject({ sku: "CLOUD-K", price: 4590 });
    expect(body.buyPrices[0]!.gifts).toEqual([{ sku: "PILLOW-STD", qty: 2 }]);
    expect(body.offerServices[0]).toMatchObject({ packageId: PKG_ID, freeLane: "rent", freeVisits: 2 });
  });
});

describe("POST /api/rental/offers", () => {
  it("403 for a non-principal internal role", async () => {
    const res = await authed("/api/rental/offers", "operation", {
      method: "POST",
      body: { modelId: MODEL_ID },
    });
    expect(res.status).toBe(403);
  });

  it("201 — camel→snake payload, defaults applied, offer born inactive", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildSb({ recorded, writeReturn: OFFER_ROW }));
    const res = await authed("/api/rental/offers", "principal", {
      method: "POST",
      body: {
        modelId: MODEL_ID,
        pricingMode: "both",
        buyEnabled: true,
        optionPrices: { leg_heights: { required: true, values: { '5"': { on: true, monthly: 5 } } } },
        surcharges: [{ code: "delivery", label: "Delivery", oneTime: 150, required: true }],
        supplierRatePct: 49,
        commissionBasePct: 20,
      },
    });
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.table).toBe("rental_offers");
    expect(ins?.payload).toMatchObject({
      model_id: MODEL_ID,
      pricing_mode: "both",
      buy_enabled: true,
      supplier_rate_pct: 49,
      commission_base_pct: 20,
      active: false,
    });
  });

  it("409 — one offer per model (23505 on the UNIQUE model_id)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        writeError: { code: "23505", message: 'duplicate key value violates unique constraint "rental_offers_model_id_key"' },
      }),
    );
    const res = await authed("/api/rental/offers", "principal", {
      method: "POST",
      body: { modelId: MODEL_ID },
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("duplicate_offer");
  });

  it("422 — the split can never exceed the collection", async () => {
    const res = await authed("/api/rental/offers", "principal", {
      method: "POST",
      body: { modelId: MODEL_ID, supplierRatePct: 70, commissionBasePct: 40 },
    });
    expect(res.status).toBe(422);
  });
});

describe("PATCH /api/rental/offers/:id", () => {
  it("422 — an authored offer can never be re-pointed at another model", async () => {
    const res = await authed(`/api/rental/offers/${OFFER_ID}`, "principal", {
      method: "PATCH",
      body: { modelId: "00000000-0000-0000-0000-0000000c9999" },
    });
    expect(res.status).toBe(422);
  });

  it("200 — writes the overlay and the surcharge slots", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildSb({ recorded, writeReturn: OFFER_ROW }));
    const res = await authed(`/api/rental/offers/${OFFER_ID}`, "principal", {
      method: "PATCH",
      body: {
        optionPrices: { fabrics: { required: true, series: { CG: { on: true, colors: { "CG-008": { on: true, monthly: 4 } } } } } },
        active: true,
      },
    });
    expect(res.status).toBe(200);
    const upd = recorded.find((r) => r.op === "update");
    expect(upd?.table).toBe("rental_offers");
    expect(upd?.payload).toMatchObject({ active: true });
    expect((upd?.payload as { option_prices: Record<string, unknown> }).option_prices).toHaveProperty("fabrics");
  });
});

describe("POST /api/rental/offers/:id/buy-prices", () => {
  it("201 — outright price with gifts, offer id from the path", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildSb({ recorded, writeReturn: BUY_PRICE_ROW }));
    const res = await authed(`/api/rental/offers/${OFFER_ID}/buy-prices`, "principal", {
      method: "POST",
      body: { sku: "CLOUD-K", price: 4590, gifts: [{ sku: "PILLOW-STD", qty: 2 }] },
    });
    expect(res.status).toBe(201);
    expect(recorded.find((r) => r.op === "insert")?.payload).toMatchObject({
      offer_id: OFFER_ID,
      sku: "CLOUD-K",
      price: 4590,
    });
  });

  it("422 — a buy price needs exactly one target (never both a sku and a combo)", async () => {
    const res = await authed(`/api/rental/offers/${OFFER_ID}/buy-prices`, "principal", {
      method: "POST",
      body: { sku: "CLOUD-K", comboId: COMBO_ID, price: 4590 },
    });
    expect(res.status).toBe(422);
  });
});

describe("POST /api/rental/offers/:id/services", () => {
  it("201 — a package attached free on the rent lane for 2 visits", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildSb({ recorded, writeReturn: OFFER_SERVICE_ROW }));
    const res = await authed(`/api/rental/offers/${OFFER_ID}/services`, "principal", {
      method: "POST",
      body: { packageId: PKG_ID, freeLane: "rent", freeVisits: 2 },
    });
    expect(res.status).toBe(201);
    expect(recorded.find((r) => r.op === "insert")?.payload).toMatchObject({
      offer_id: OFFER_ID,
      package_id: PKG_ID,
      free_lane: "rent",
      free_visits: 2,
    });
  });

  it("409 — the same package cannot be attached twice", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({ writeError: { code: "23505", message: "duplicate key" } }),
    );
    const res = await authed(`/api/rental/offers/${OFFER_ID}/services`, "principal", {
      method: "POST",
      body: { packageId: PKG_ID, monthlyPrice: 19 },
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("duplicate_offer_service");
  });
});

describe("POST /api/rental/service-packages (0264 auto SKU)", () => {
  it("mints SVC-MAT-CLEAN-1Y2 under the service model and links it", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        recorded,
        tables: {
          product_skus: [],
          product_models: [{ id: SERVICE_MODEL_ID, category: "service", discontinued_at: null }],
        },
        writeReturn: { ...PKG_ROW, sku: "SVC-MAT-CLEAN-1Y2", category: "mattress" },
      }),
    );
    const res = await authed("/api/rental/service-packages", "principal", {
      method: "POST",
      body: {
        name: "Mattress Care — 1 year",
        category: "mattress",
        serviceType: "cleaning",
        durationMonths: 12,
        visitsPerYear: 2,
        price: 190,
      },
    });
    expect(res.status).toBe(201);
    const skuInsert = recorded.find((r) => r.table === "product_skus" && r.op === "insert");
    expect(skuInsert?.payload).toMatchObject({
      model_id: SERVICE_MODEL_ID,
      sku: "SVC-MAT-CLEAN-1Y2",
      variant_kind: "preset",
      price: 190,
      pos_active: true,
    });
    const pkgInsert = recorded.find((r) => r.table === "service_packages" && r.op === "insert");
    expect(pkgInsert?.payload).toMatchObject({ sku: "SVC-MAT-CLEAN-1Y2", category: "mattress" });
  });

  it("reuses an existing SKU code instead of inserting it twice", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        recorded,
        tables: {
          product_skus: [{ sku: "SVC-SOFA-CLEAN-3Y3" }],
          product_models: [{ id: SERVICE_MODEL_ID, category: "service", discontinued_at: null }],
        },
        writeReturn: { ...PKG_ROW, sku: "SVC-SOFA-CLEAN-3Y3", category: "sofa" },
      }),
    );
    const res = await authed("/api/rental/service-packages", "principal", {
      method: "POST",
      body: {
        name: "Sofa Care — 3 years",
        category: "sofa",
        serviceType: "cleaning",
        durationMonths: 36,
        visitsPerYear: 3,
      },
    });
    expect(res.status).toBe(201);
    expect(recorded.find((r) => r.table === "product_skus" && r.op === "insert")).toBeUndefined();
  });

  it("422 when the catalog has no service model to hang the SKU on", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({ tables: { product_skus: [], product_models: [] }, writeReturn: PKG_ROW }),
    );
    const res = await authed("/api/rental/service-packages", "principal", {
      method: "POST",
      body: { name: "Orphan plan", category: "mattress", durationMonths: 12, visitsPerYear: 2 },
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code?: string }).code).toBe("service_sku_mint_failed");
  });

  it("no category → no mint (the pre-0264 hand-linked path still works)", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildSb({ recorded, writeReturn: PKG_ROW }));
    const res = await authed("/api/rental/service-packages", "principal", {
      method: "POST",
      body: { name: "Legacy plan", durationMonths: 12, visitsPerYear: 2 },
    });
    expect(res.status).toBe(201);
    expect(recorded.find((r) => r.table === "product_skus")).toBeUndefined();
  });
});

describe("POST /api/rental/plans (0264 line kinds)", () => {
  it("201 — a sofa COMBO line carries no sku and lands line_kind=combo", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildSb({ recorded, writeReturn: { ...PLAN_ROW, sku: null, combo_id: COMBO_ID, line_kind: "combo" } }),
    );
    const res = await authed("/api/rental/plans", "principal", {
      method: "POST",
      body: { comboId: COMBO_ID, lineKind: "combo", termMonths: 84, monthlyFee: 150, offerId: OFFER_ID },
    });
    expect(res.status).toBe(201);
    expect(recorded.find((r) => r.op === "insert")?.payload).toMatchObject({
      sku: null,
      combo_id: COMBO_ID,
      line_kind: "combo",
      offer_id: OFFER_ID,
    });
  });

  it("201 — a compartment line keeps its sku and carries gifts", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildSb({ recorded, writeReturn: { ...PLAN_ROW, line_kind: "compartment" } }),
    );
    const res = await authed("/api/rental/plans", "principal", {
      method: "POST",
      body: {
        sku: "BOOQIT-1A",
        lineKind: "compartment",
        termMonths: 84,
        monthlyFee: 10,
        offerId: OFFER_ID,
        gifts: [{ sku: "CUSHION", qty: 1 }],
      },
    });
    expect(res.status).toBe(201);
    expect(recorded.find((r) => r.op === "insert")?.payload).toMatchObject({
      sku: "BOOQIT-1A",
      line_kind: "compartment",
      gifts: [{ sku: "CUSHION", qty: 1 }],
    });
  });

  it("422 — a line with neither a sku nor a combo is refused", async () => {
    const res = await authed("/api/rental/plans", "principal", {
      method: "POST",
      body: { termMonths: 84, monthlyFee: 59 },
    });
    expect(res.status).toBe(422);
  });
});


describe("POST /api/rental/agreement-templates (0267)", () => {
  const TEMPLATE_ROW = {
    id: "00000000-0000-0000-0000-0000000c0041",
    doc_key: "rent_to_own",
    name: "Rental Agreement",
    binds_to: ["mattress", "sofa"],
    version: 2,
    body: [{ kind: "p", text: "hello {{customer.name}}" }],
    fields: ["customer.name"],
    effective_from: "2026-07-26",
    active: true,
    created_at: "2026-07-26T00:00:00Z",
    updated_at: "2026-07-26T00:00:00Z",
    updated_by: null,
  };

  it("403 for a non-principal internal role", async () => {
    const res = await authed("/api/rental/agreement-templates", "operation", {
      method: "POST",
      body: { docKey: "rent_to_own", name: "X", body: [{ kind: "p", text: "hi" }] },
    });
    expect(res.status).toBe(403);
  });

  it("201 — the SERVER assigns the next version and caches the tokens the wording uses", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        recorded,
        // one existing version of THIS doc → the new one must be 2
        tables: { rental_agreement_templates: [{ doc_key: "rent_to_own", version: 1 }] },
        writeReturn: TEMPLATE_ROW,
      }),
    );
    const res = await authed("/api/rental/agreement-templates", "principal", {
      method: "POST",
      body: {
        docKey: "rent_to_own",
        name: "Rental Agreement",
        bindsTo: ["mattress", "sofa"],
        body: [
          { kind: "title", text: "RENTAL AGREEMENT" },
          { kind: "p", text: "Between Carress and {{customer.name}}, NRIC {{customer.nric}}." },
        ],
      },
    });
    expect(res.status).toBe(201);
    const ins = recorded.find((r) => r.op === "insert");
    expect(ins?.table).toBe("rental_agreement_templates");
    expect(ins?.payload).toMatchObject({
      doc_key: "rent_to_own",
      version: 2,
      binds_to: ["mattress", "sofa"],
      fields: ["customer.name", "customer.nric"],
    });
  });

  it("201 — a brand-new document starts at version 1", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(
      buildSb({ recorded, tables: { rental_agreement_templates: [] }, writeReturn: TEMPLATE_ROW }),
    );
    const res = await authed("/api/rental/agreement-templates", "principal", {
      method: "POST",
      body: { docKey: "service_package", name: "Service Agreement", body: [{ kind: "p", text: "hi" }] },
    });
    expect(res.status).toBe(201);
    expect(recorded.find((r) => r.op === "insert")?.payload).toMatchObject({ version: 1 });
  });

  it("422 — empty wording is refused (a contract with no words is not a contract)", async () => {
    const res = await authed("/api/rental/agreement-templates", "principal", {
      method: "POST",
      body: { docKey: "rent_to_own", name: "X", body: [] },
    });
    expect(res.status).toBe(422);
  });

  it("PATCH changes the binding, never the wording", async () => {
    const recorded: AdminCall[] = [];
    vi.mocked(userClient).mockReturnValue(buildSb({ recorded, writeReturn: TEMPLATE_ROW }));
    const ok = await authed(`/api/rental/agreement-templates/${TEMPLATE_ROW.id}`, "principal", {
      method: "PATCH",
      body: { bindsTo: ["mattress"], active: false },
    });
    expect(ok.status).toBe(200);
    expect(recorded.find((r) => r.op === "update")?.payload).toMatchObject({
      binds_to: ["mattress"],
      active: false,
    });

    const nope = await authed(`/api/rental/agreement-templates/${TEMPLATE_ROW.id}`, "principal", {
      method: "PATCH",
      body: { body: [{ kind: "p", text: "sneaky edit" }] },
    });
    expect(nope.status).toBe(422);
  });

  it("GET /config carries the wording, newest version first", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({
        tables: {
          rental_agreement_templates: [
            { ...TEMPLATE_ROW, id: "v1", version: 1 },
            { ...TEMPLATE_ROW, id: "v2", version: 2 },
          ],
        },
      }),
    );
    const res = await authed("/api/rental/config", "principal");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { agreementTemplates: Array<{ version: number; fields: string[] }> };
    expect(body.agreementTemplates.map((t) => t.version)).toEqual([2, 1]);
    expect(body.agreementTemplates[0]!.fields).toEqual(["customer.name"]);
  });
});
