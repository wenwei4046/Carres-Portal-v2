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

// The rental router is not yet mounted in src/index.ts (the orchestrator adds
// the mount line); the test app mirrors index.ts exactly — authMiddleware on
// the /api group + the same onError JSON shape — so these tests keep passing
// unchanged once the real mount lands.
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
