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
import { userClient, adminClient } from "../../lib/supabase";

/**
 * /api/operation/jump — the document half of `Jump to…`.
 *
 * Four claims are under test, and they are the four the locked contract makes:
 *
 *   1. only governed DOCUMENT NUMBERS are searched — never customer text
 *   2. every read runs under the CALLER'S token, so RLS is the permission filter
 *      and `adminClient` (which bypasses RLS) is never reachable from here
 *   3. a role that may not open the surface gets nothing, not a filtered list
 *   4. the route is navigate-only — there is no create, and no write verb answers
 */

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};
const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;

const ORDER_ID = "11111111-1111-1111-1111-111111111111";
const RECEIPT_ID = "22222222-2222-2222-2222-222222222222";

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

type Call = { table: string; method: string; args: unknown[] };

/**
 * A chainable Supabase stub that RECORDS what was asked for. The filters are
 * the thing under test here — a result list can be faked, but the predicate
 * that produced it is the contract.
 */
function makeSb(rows: Record<string, unknown[]>, calls: Call[]) {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "or", "eq", "ilike", "order", "limit", "in", "not"]) {
        builder[m] = vi.fn((...args: unknown[]) => {
          calls.push({ table, method: m, args });
          return builder;
        });
      }
      builder.then = (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve, reject);
      return builder;
    },
  };
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
  vi.mocked(adminClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

function req(path: string, jwt: string | null, method = "GET") {
  return app.fetch(
    new Request(`http://t${path}`, {
      method,
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    }),
    env,
  );
}

function wire(rows: Record<string, unknown[]> = {}) {
  const calls: Call[] = [];
  vi.mocked(userClient).mockReturnValue(makeSb(rows, calls) as never);
  return calls;
}

describe("GET /api/operation/jump", () => {
  it("finds a Sales Order by its exact number, with the customer as the party", async () => {
    const calls = wire({
      orders: [{ id: ORDER_ID, so: 1307, customer_name: "Stage Two Test" }],
    });
    const res = await req("/api/operation/jump?q=SO-1307", await makeJwt("operation"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { documents: Array<Record<string, unknown>> };
    expect(body.documents[0]).toEqual({
      type: "SO",
      number: "SO-1307",
      party: "Stage Two Test",
      href: `/operation/orders/so/${ORDER_ID}`,
    });
    /* The SO filter is a NUMERIC RANGE, never a text match — `orders.so` is an
     * integer, and a prefix that became an ILIKE would be a silent table scan. */
    const or = calls.find((c) => c.table === "orders" && c.method === "or");
    expect(or?.args[0]).toContain("and(so.gte.1307,so.lt.1308)");
  });

  it("a partial number still finds the document it prefixes", async () => {
    const calls = wire({ orders: [{ id: ORDER_ID, so: 1307, customer_name: "Stage Two Test" }] });
    await req("/api/operation/jump?q=13", await makeJwt("operation"));
    const or = calls.find((c) => c.table === "orders" && c.method === "or");
    expect(or?.args[0]).toContain("and(so.gte.1300,so.lt.1400)");
  });

  /* ⭐ THE BOUNDARY THE MASTER DRAWS. Register Search is page-owned and searches
   * customer text; `Jump to…` does not, and must not start. */
  it("never searches customer text — a name query asks orders for nothing", async () => {
    const calls = wire({});
    const res = await req("/api/operation/jump?q=Kimmy", await makeJwt("operation"));
    expect(res.status).toBe(200);
    expect((await res.json()) as { documents: unknown[] }).toEqual({ documents: [] });
    expect(calls.some((c) => c.table === "orders" && c.method === "or")).toBe(false);
    expect(
      calls.some(
        (c) => c.method === "ilike" && String(c.args[0]).includes("customer"),
      ),
    ).toBe(false);
  });

  it("a purchase order is matched on its number and carries its supplier", async () => {
    const calls = wire({
      purchase_orders: [{ id: "PO-2051", suppliers: { name: "Ohana" } }],
    });
    const res = await req("/api/operation/jump?q=PO-2051", await makeJwt("operation"));
    const body = (await res.json()) as { documents: Array<Record<string, unknown>> };
    expect(body.documents[0]).toEqual({
      type: "PO",
      number: "PO-2051",
      party: "Ohana",
      href: "/operation/procurement?po=PO-2051",
    });
    expect(calls.some((c) => c.table === "purchase_orders" && c.method === "ilike")).toBe(true);
  });

  it("a GRN query asks for the date the number itself names", async () => {
    const calls = wire({
      warehouse_receipts: [
        {
          id: RECEIPT_ID,
          goods_received_at: "2026-08-02",
          submitted_at: "2026-08-02T02:00:00Z",
          purchase_orders: { id: "PO-2051", suppliers: { name: "Ohana" } },
        },
      ],
    });
    await req("/api/operation/jump?q=GRN-020826", await makeJwt("operation"));
    const eqs = calls.filter((c) => c.table === "warehouse_receipts" && c.method === "eq");
    expect(eqs.map((c) => c.args)).toContainEqual(["goods_received_at", "2026-08-02"]);
    /* Only a POSTED count is a record of goods received. */
    expect(eqs.map((c) => c.args)).toContainEqual(["status", "posted"]);
  });

  it("an invoice opens the order it belongs to", async () => {
    wire({
      invoices: [
        {
          invoice_no: "INV-FIX-3208",
          order_id: ORDER_ID,
          orders: { customer_name: "Kimmy" },
        },
      ],
      orders: [{ id: ORDER_ID, invoice_no: "INV-FIX-3208", customer_name: "Kimmy" }],
    });
    const res = await req("/api/operation/jump?q=INV-FIX-3208", await makeJwt("operation"));
    const body = (await res.json()) as { documents: Array<Record<string, unknown>> };
    /* The same number lives on `invoices` AND on `orders.invoice_no`. One
     * number is ONE document — two rows must not become two results. */
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0]).toMatchObject({
      type: "INV",
      number: "INV-FIX-3208",
      href: `/operation/orders/so/${ORDER_ID}`,
    });
  });

  it("an empty query returns nothing and asks the database nothing", async () => {
    const calls = wire({});
    const res = await req("/api/operation/jump?q=", await makeJwt("operation"));
    expect(await res.json()).toEqual({ documents: [] });
    expect(calls).toHaveLength(0);
  });

  // ── PERMISSION ────────────────────────────────────────────────────────────

  it.each(["dealer", "supplier", "partner", "finance", "hr", "warehouse"])(
    "%s cannot reach the surface at all — no documents, filtered or otherwise",
    async (role) => {
      const calls = wire({ orders: [{ id: ORDER_ID, so: 1307, customer_name: "Stage Two Test" }] });
      const res = await req("/api/operation/jump?q=SO-1307", await makeJwt(role));
      expect(res.status).toBe(403);
      expect(calls).toHaveLength(0);
    },
  );

  it("the principal reaches it, the same as operation", async () => {
    wire({ orders: [{ id: ORDER_ID, so: 1307, customer_name: "Stage Two Test" }] });
    const res = await req("/api/operation/jump?q=SO-1307", await makeJwt("principal"));
    expect(res.status).toBe(200);
  });

  it("an unauthenticated caller gets 401", async () => {
    wire({});
    expect((await req("/api/operation/jump?q=SO-1307", null)).status).toBe(401);
  });

  /* ⭐ RLS IS THE FILTER. `adminClient` bypasses it; reaching for it here would
   * turn every result into a leak, so the negative control is that it is never
   * called and the caller's own JWT is what opens the connection. */
  it("reads under the CALLER'S token and never through the service role", async () => {
    wire({ orders: [] });
    const jwt = await makeJwt("operation");
    await req("/api/operation/jump?q=SO-1307", jwt);
    expect(vi.mocked(userClient)).toHaveBeenCalledWith(expect.anything(), jwt);
    expect(vi.mocked(adminClient)).not.toHaveBeenCalled();
  });

  // ── NAVIGATE-ONLY ─────────────────────────────────────────────────────────

  it.each(["POST", "PATCH", "PUT", "DELETE"])(
    "%s is not a verb this surface has — there is no create and no workflow",
    async (method) => {
      wire({});
      const res = await req("/api/operation/jump", await makeJwt("operation"), method);
      expect(res.status).toBe(404);
    },
  );
});
