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
import scRouter from "./service-cases";
import type { AppEnv } from "../../types";

/**
 * Service cases (0210) — the J2 cross-link contract.
 *
 * Two things a UI bug cannot reveal:
 *  1. `?orderId=` must narrow in the DATABASE. If the filter silently did
 *     nothing, the order drawer would show every case in the company as
 *     "related to this order" — a wrong answer that still looks like a feature.
 *  2. The response must carry the linked order's SO NUMBER. order_id is a uuid;
 *     without the join nothing on screen can name the order, which is the whole
 *     point of the case→order half.
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
  api.route("/ops/service-cases", scRouter);
  app.route("/api", api);
  return app;
}
const app = buildApp();

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: "test@carres.com", app_metadata: { role } })
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

/** Chainable read stub that RECORDS every `.eq()` — the filter assertions below
 *  are about what reached the database, not about what came back. */
function buildSb(rows: unknown[]) {
  const eqCalls: Array<[string, unknown]> = [];
  const selects: string[] = [];
  const chain: Record<string, unknown> = {
    then: (res: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(res),
    eq: (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return chain;
    },
    select: (cols: string) => {
      selects.push(cols);
      return chain;
    },
  };
  for (const m of ["order", "limit", "in", "is", "or", "contains", "single"]) {
    chain[m] = () => chain;
  }
  const sb = {
    from: vi.fn(() => chain),
    rpc: vi.fn(async () => ({ data: "SC2607-02", error: null })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { sb, eqCalls, selects };
}

const CASE_ROW = {
  id: "c1",
  case_no: "SC2607-01",
  order_id: "ord-1",
  ref_no: "TCF0497",
  customer_name: "Ryan Chong",
  customer_phone: null,
  customer_address: null,
  case_type_id: null,
  status_id: null,
  what_happened: null,
  carres_action: null,
  what_affected: null,
  incurred_charges: null,
  opened_at: "2026-06-16",
  source_service_note_id: null,
  created_by: null,
  created_at: "2026-06-16T00:00:00Z",
  updated_at: "2026-06-16T00:00:00Z",
  service_case_types: { label: "Warranty Claim" },
  service_case_statuses: { label: "In Progress", is_closed: false },
  orders: { so: 1258 },
};

async function get(path: string, sb: unknown, role = "operation") {
  vi.mocked(userClient).mockReturnValue(sb as never);
  return app.request(
    `/api${path}`,
    { headers: { Authorization: `Bearer ${await makeJwt(role)}` } },
    env,
  );
}

describe("GET /api/ops/service-cases", () => {
  it("narrows to one order in the database when ?orderId= is given", async () => {
    const { sb, eqCalls } = buildSb([CASE_ROW]);
    const res = await get("/ops/service-cases?orderId=ord-1", sb);

    expect(res.status).toBe(200);
    // The filter must reach the query — not be applied after the fact, and not
    // be dropped on the floor.
    expect(eqCalls).toContainEqual(["order_id", "ord-1"]);
  });

  it("does NOT filter by order when the param is absent", async () => {
    const { sb, eqCalls } = buildSb([CASE_ROW]);
    await get("/ops/service-cases", sb);
    expect(eqCalls.some(([col]) => col === "order_id")).toBe(false);
  });

  it("treats a blank orderId as no filter rather than matching nothing", async () => {
    const { sb, eqCalls } = buildSb([CASE_ROW]);
    await get("/ops/service-cases?orderId=%20%20", sb);
    expect(eqCalls.some(([col]) => col === "order_id")).toBe(false);
  });

  it("carries the linked order's SO number so the link can be named", async () => {
    const { sb, selects } = buildSb([CASE_ROW]);
    const res = await get("/ops/service-cases", sb);
    const body = (await res.json()) as { items: { so: number | null; orderId: string }[] };

    expect(selects[0]).toContain("orders(so)");
    expect(body.items[0].so).toBe(1258);
    expect(body.items[0].orderId).toBe("ord-1");
  });

  it("reports so=null for a case with no linked order — the live state today", async () => {
    // Every service case in prod is currently unlinked (order_id null), so this
    // is the shape the screen actually renders.
    const { sb } = buildSb([{ ...CASE_ROW, order_id: null, orders: null }]);
    const res = await get("/ops/service-cases", sb);
    const body = (await res.json()) as { items: { so: number | null; orderId: string | null }[] };

    expect(body.items[0].orderId).toBeNull();
    expect(body.items[0].so).toBeNull();
  });

  it("tolerates PostgREST returning the embed as an array", async () => {
    const { sb } = buildSb([{ ...CASE_ROW, orders: [{ so: 1301 }] }]);
    const res = await get("/ops/service-cases", sb);
    const body = (await res.json()) as { items: { so: number | null }[] };
    expect(body.items[0].so).toBe(1301);
  });

  it("still refuses a dealer — the cross-link opens no new door", async () => {
    const { sb } = buildSb([CASE_ROW]);
    const res = await get("/ops/service-cases?orderId=ord-1", sb, "dealer");
    expect(res.status).toBe(403);
  });
});

describe("GET /api/ops/service-cases/:id", () => {
  it("names the order on the detail read too (the modal's link)", async () => {
    const { sb } = buildSb([CASE_ROW]);
    // `.single()` resolves through the same then(), handing back the array; the
    // route reads `data` directly, so shape the stub to match a single row.
    vi.mocked(userClient).mockReturnValue({
      ...sb,
      from: () => {
        const chain: Record<string, unknown> = {
          then: (res: (v: { data: unknown; error: null }) => unknown) =>
            Promise.resolve({ data: CASE_ROW, error: null }).then(res),
        };
        for (const m of ["select", "eq", "order", "single"]) chain[m] = () => chain;
        return chain;
      },
    } as never);

    const res = await app.request(
      "/api/ops/service-cases/c1",
      { headers: { Authorization: `Bearer ${await makeJwt("operation")}` } },
      env,
    );
    const body = (await res.json()) as { so: number | null };
    expect(res.status).toBe(200);
    expect(body.so).toBe(1258);
  });
});
