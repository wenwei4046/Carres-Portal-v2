import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";

vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient } from "../lib/supabase";

const KID = "test-kid-pwpcodes";
// Valid-hex uuids — the reserve response round-trips through pwpCodeSchema, whose
// ruleId/ownerStaffId are z.string().uuid(), so these must be real uuids.
const STAFF_ID = "0000000a-0000-0000-0000-000000005741";
const MATT_MODEL = "0000000b-0000-0000-0000-0000000a0770";
const RULE_ID = "0000000c-0000-0000-0000-0000000a01e1";
const BED_MODEL = "0000000d-0000-0000-0000-0000000be000";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role = "salesperson") {
  return new SignJWT({
    email: "sales@carres.com",
    app_metadata: { role, dealer_id: "00000000-0000-0000-0000-000000000d01" },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject(STAFF_ID)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

/* ─── stateful pwp_codes mock ─────────────────────────────────────────────────
 * Holds an in-memory pwp_codes table so reserve idempotency (top-up / trim) is
 * tested realistically. product_skus + pwp_rules return configured fixtures.
 * pwp_reap_orphans is a no-op stub. The PostgREST chain supports the exact shapes
 * the route uses: .select().eq()*  (thenable), .insert(), .delete().in().eq()*,
 * and product_skus' .select().in() join. */
interface MockRow {
  code: string;
  rule_id: string | null;
  type: string;
  reward_category: string;
  reward_targets: unknown;
  status: string;
  owner_staff_id: string | null;
  cart_line_key: string | null;
  trigger_item_code: string | null;
  claim_group: string | null;
  redeemed_order_id: string | null;
  redeemed_item_sku: string | null;
  source_order_id: string | null;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
}

interface MockOpts {
  rules?: unknown[];
  skuRows?: Array<Record<string, unknown>>;
  seed?: Array<Partial<MockRow>>;
  /** P8d — the stripped rows pwp_discover_available returns. A function so a test
   *  can assert the selector args it was called with. Default → []. */
  discoverRows?: (args: { p_phone: string | null; p_code: string | null }) => unknown[];
}

function fullRow(p: Partial<MockRow>): MockRow {
  return {
    code: p.code ?? "PWP-0000AAAA",
    rule_id: p.rule_id ?? null,
    type: p.type ?? "pwp",
    reward_category: p.reward_category ?? "bedframe",
    reward_targets: p.reward_targets ?? [],
    status: p.status ?? "RESERVED",
    owner_staff_id: p.owner_staff_id ?? STAFF_ID,
    cart_line_key: p.cart_line_key ?? null,
    trigger_item_code: p.trigger_item_code ?? null,
    claim_group: p.claim_group ?? null,
    redeemed_order_id: p.redeemed_order_id ?? null,
    redeemed_item_sku: p.redeemed_item_sku ?? null,
    source_order_id: p.source_order_id ?? null,
    customer_id: p.customer_id ?? null,
    created_at: p.created_at ?? "2026-01-01T00:00:00Z",
    updated_at: p.updated_at ?? "2026-01-01T00:00:00Z",
  };
}

function mockSb(opts: MockOpts = {}) {
  const table: MockRow[] = (opts.seed ?? []).map(fullRow);
  const rpcCalls: Array<{ name: string; args: unknown }> = [];

  // A select chain that filters `table` (pwp_codes) or returns a configured list.
  function selectChain(tableName: string, _cols: string) {
    const filters: Array<[string, unknown]> = [];
    const ins: Array<[string, unknown[]]> = [];
    const rows = () => {
      if (tableName === "pwp_rules") return opts.rules ?? [];
      if (tableName === "product_skus") return opts.skuRows ?? [];
      // pwp_codes — apply the recorded filters to the in-memory table.
      return table.filter((r) => {
        for (const [col, val] of filters) if ((r as unknown as Record<string, unknown>)[col] !== val) return false;
        for (const [col, vals] of ins) if (!vals.includes((r as unknown as Record<string, unknown>)[col])) return false;
        return true;
      });
    };
    const result = () => ({ data: rows(), error: null });
    const chain: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return chain;
      },
      // 2026-08-24: the active-rule read now goes through the ONE ordered
      // door (readActivePwpRules), i.e. .eq().order().order(). The double
      // does not need to SORT - every assertion here is per-rule - it only
      // has to stay chainable through the extra hops.
      order() {
        return chain;
      },
      in(col: string, vals: unknown[]) {
        ins.push([col, vals]);
        // product_skus join is awaited directly on .in()
        if (tableName !== "pwp_codes") return Promise.resolve(result());
        return chain;
      },
      then(resolve: (v: unknown) => unknown) {
        return resolve(result());
      },
    };
    return chain;
  }

  const sb = {
    from(tableName: string) {
      return {
        select: (cols: string) => selectChain(tableName, cols),
        insert: async (vals: Partial<MockRow>) => {
          if (table.some((r) => r.code === vals.code)) {
            return { error: { code: "23505", message: "duplicate key" } };
          }
          table.push(fullRow(vals));
          return { error: null };
        },
        delete: () => {
          const filters: Array<[string, unknown]> = [];
          const ins: Array<[string, unknown[]]> = [];
          const run = async () => {
            for (let i = table.length - 1; i >= 0; i--) {
              const r = table[i]!;
              let match = true;
              for (const [col, val] of filters) if ((r as unknown as Record<string, unknown>)[col] !== val) match = false;
              for (const [col, vals] of ins) if (!vals.includes((r as unknown as Record<string, unknown>)[col])) match = false;
              if (match) table.splice(i, 1);
            }
            return { error: null };
          };
          const chain: Record<string, unknown> = {
            eq(col: string, val: unknown) {
              filters.push([col, val]);
              return chain;
            },
            in(col: string, vals: unknown[]) {
              ins.push([col, vals]);
              return chain;
            },
            then(resolve: (v: unknown) => unknown) {
              return run().then(resolve);
            },
          };
          return chain;
        },
      };
    },
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      if (name === "pwp_discover_available") {
        const a = args as { p_phone: string | null; p_code: string | null };
        return { data: opts.discoverRows ? opts.discoverRows(a) : [], error: null };
      }
      return { data: 0, error: null };
    },
    _table: table,
    _rpcCalls: rpcCalls,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as any;
}

/** A pwp_rules row (mattress trigger → bedframe reward, 1 reward per trigger). */
const ruleRow = (over: Record<string, unknown> = {}) => ({
  id: RULE_ID,
  type: "pwp",
  trigger_category: "mattress",
  trigger_targets: [{ scope: "model", modelId: MATT_MODEL }],
  reward_category: "bedframe",
  reward_targets: [{ scope: "model", modelId: BED_MODEL }],
  qty_per_trigger: 1,
  active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  updated_by: null,
  ...over,
});

/** product_skus join fixture for the trigger sku (mattress, in the rule scope). */
const skuJoinRow = (sku: string, over: Record<string, unknown> = {}) => ({
  sku,
  model_id: MATT_MODEL,
  variant: "QUEEN",
  product_models: { category: "mattress" },
  ...over,
});

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

async function reserve(jwt: string, body: unknown) {
  return app.fetch(
    new Request("http://t/api/pwp-codes/reserve", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
}

describe("POST /api/pwp-codes/reserve", () => {
  it("401 without Authorization", async () => {
    const res = await app.fetch(
      new Request("http://t/api/pwp-codes/reserve", { method: "POST", body: "{}" }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("DORMANT — no active rule matches the trigger → 0 codes minted", async () => {
    const sb = mockSb({ rules: [], skuRows: [skuJoinRow("MATT-1")] });
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await reserve(await makeJwt(), { cartLineKey: "L1", sku: "MATT-1", qty: 2 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { codes: unknown[] };
    expect(body.codes).toHaveLength(0);
    expect(sb._table).toHaveLength(0);
  });

  it("mints qtyPerTrigger × qty RESERVED codes for a matching trigger (genCode format)", async () => {
    const sb = mockSb({ rules: [ruleRow()], skuRows: [skuJoinRow("MATT-1")] });
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await reserve(await makeJwt(), { cartLineKey: "L1", sku: "MATT-1", qty: 2 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { codes: Array<{ code: string; status: string; cartLineKey: string }> };
    expect(body.codes).toHaveLength(2);
    for (const c of body.codes) {
      expect(c.code).toMatch(/^PWP-\d{4}[A-Z]{4}$/);
      expect(c.status).toBe("RESERVED");
      expect(c.cartLineKey).toBe("L1");
    }
  });

  it("idempotent (sequential) — re-reserving the same line unchanged does NOT double-mint", async () => {
    const sb = mockSb({ rules: [ruleRow()], skuRows: [skuJoinRow("MATT-1")] });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt();
    await reserve(jwt, { cartLineKey: "L1", sku: "MATT-1", qty: 2 });
    const res2 = await reserve(jwt, { cartLineKey: "L1", sku: "MATT-1", qty: 2 });
    const body = (await res2.json()) as { codes: unknown[] };
    expect(body.codes).toHaveLength(2); // still 2 — not 4
    expect(sb._table.filter((r: { status: string }) => r.status === "RESERVED")).toHaveLength(2);
  });

  it("top-up — qty up from 2 → 3 inserts the delta", async () => {
    const sb = mockSb({ rules: [ruleRow()], skuRows: [skuJoinRow("MATT-1")] });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt();
    await reserve(jwt, { cartLineKey: "L1", sku: "MATT-1", qty: 2 });
    const res = await reserve(jwt, { cartLineKey: "L1", sku: "MATT-1", qty: 3 });
    const body = (await res.json()) as { codes: unknown[] };
    expect(body.codes).toHaveLength(3);
  });

  it("trim — qty down from 3 → 1 deletes the surplus", async () => {
    const sb = mockSb({ rules: [ruleRow()], skuRows: [skuJoinRow("MATT-1")] });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt();
    await reserve(jwt, { cartLineKey: "L1", sku: "MATT-1", qty: 3 });
    const res = await reserve(jwt, { cartLineKey: "L1", sku: "MATT-1", qty: 1 });
    const body = (await res.json()) as { codes: unknown[] };
    expect(body.codes).toHaveLength(1);
  });

  it("stray trim — deactivating the rule (no match) trims the existing reservations to 0", async () => {
    // Seed 2 RESERVED for rule-1 on L1, then reserve with NO active rule → strays gone.
    const sb = mockSb({
      rules: [],
      skuRows: [skuJoinRow("MATT-1")],
      seed: [
        { code: "PWP-1111AAAA", rule_id: RULE_ID, cart_line_key: "L1" },
        { code: "PWP-2222BBBB", rule_id: RULE_ID, cart_line_key: "L1" },
      ],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await reserve(await makeJwt(), { cartLineKey: "L1", sku: "MATT-1", qty: 2 });
    const body = (await res.json()) as { codes: unknown[] };
    expect(body.codes).toHaveLength(0);
  });

  it("400 on a malformed reserve body", async () => {
    vi.mocked(userClient).mockReturnValue(mockSb());
    const res = await reserve(await makeJwt(), { cartLineKey: "", sku: "MATT-1", qty: 0 });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/pwp-codes/reserve", () => {
  it("frees a line's RESERVED codes (RESERVED only)", async () => {
    const sb = mockSb({
      seed: [
        { code: "PWP-1111AAAA", rule_id: RULE_ID, cart_line_key: "L1", status: "RESERVED" },
        { code: "PWP-9999ZZZZ", rule_id: RULE_ID, cart_line_key: "L1", status: "USED" },
      ],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await app.fetch(
      new Request("http://t/api/pwp-codes/reserve?cartLineKey=L1", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${await makeJwt()}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // RESERVED deleted, USED untouched.
    expect(sb._table.map((r: { code: string }) => r.code)).toEqual(["PWP-9999ZZZZ"]);
  });

  it("400 when cartLineKey is missing", async () => {
    vi.mocked(userClient).mockReturnValue(mockSb());
    const res = await app.fetch(
      new Request("http://t/api/pwp-codes/reserve", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${await makeJwt()}` },
      }),
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/pwp-codes/mine", () => {
  it("returns the caller's RESERVED set + runs the self-heal reaper", async () => {
    const sb = mockSb({
      seed: [
        { code: "PWP-1111AAAA", cart_line_key: "L1", status: "RESERVED" },
        { code: "PWP-9999ZZZZ", cart_line_key: "L2", status: "USED" },
      ],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await app.fetch(
      new Request("http://t/api/pwp-codes/mine", { headers: { Authorization: `Bearer ${await makeJwt()}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { codes: Array<{ code: string }> };
    expect(body.codes.map((c) => c.code)).toEqual(["PWP-1111AAAA"]); // only RESERVED
    const reap = sb._rpcCalls.find((c: { name: string }) => c.name === "pwp_reap_orphans");
    // Self-scoped RPC (review BLOCKER fix): the route no longer passes p_owner —
    // the RPC forces the owner to auth.uid() + clamps the grace.
    expect(reap?.args).toEqual({ p_grace_minutes: 15 });
  });
});

describe("POST /api/pwp-codes/reap", () => {
  it("calls pwp_reap_orphans owner-scoped + returns the count", async () => {
    const sb = mockSb();
    sb.rpc = async (name: string, args: unknown) => {
      sb._rpcCalls.push({ name, args });
      return { data: 3, error: null };
    };
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await app.fetch(
      new Request("http://t/api/pwp-codes/reap", {
        method: "POST",
        headers: { Authorization: `Bearer ${await makeJwt()}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reaped: number };
    expect(body.reaped).toBe(3);
    const reap = sb._rpcCalls.find((c: { name: string }) => c.name === "pwp_reap_orphans");
    // Self-scoped RPC (review BLOCKER fix): no p_owner — owner forced to auth.uid().
    expect(reap?.args).toEqual({ p_grace_minutes: 15 });
  });
});

/* ─── GET /available — cross-order DISCOVERY (P8d, 0188 §6.3 / §8.2) ──────────── */

/** One stripped pwp_discover_available row (NO phone / owner / trigger sku). */
const discoverRow = (over: Record<string, unknown> = {}) => ({
  code: "PWP-9999ZZZZ",
  rule_id: RULE_ID,
  type: "pwp",
  reward_category: "bedframe",
  reward_targets: [{ scope: "model", modelId: BED_MODEL }],
  source_order_id: "00000000-0000-0000-0000-00000000a001",
  expires_at: null,
  phone_matches: true,
  ...over,
});

describe("GET /api/pwp-codes/available", () => {
  it("401 without Authorization", async () => {
    const res = await app.fetch(new Request("http://t/api/pwp-codes/available?phone=0123456789"), env);
    expect(res.status).toBe(401);
  });

  it("NO selector (no phone, no code) → { vouchers: [] } WITHOUT calling the RPC (no dump-all)", async () => {
    const sb = mockSb();
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await app.fetch(
      new Request("http://t/api/pwp-codes/available", { headers: { Authorization: `Bearer ${await makeJwt()}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vouchers: unknown[] };
    expect(body.vouchers).toEqual([]);
    // The route short-circuits — the discovery RPC is never invoked.
    expect((sb._rpcCalls as Array<{ name: string }>).find((c) => c.name === "pwp_discover_available")).toBeUndefined();
  });

  it("?phone= → calls pwp_discover_available with the selector + returns the STRIPPED projection", async () => {
    const sb = mockSb({ discoverRows: () => [discoverRow()] });
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await app.fetch(
      new Request("http://t/api/pwp-codes/available?phone=%2B60%2012-345%206789", {
        headers: { Authorization: `Bearer ${await makeJwt()}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vouchers: Array<Record<string, unknown>> };
    expect(body.vouchers).toHaveLength(1);
    const v = body.vouchers[0]!;
    // The DTO carries the discovery fields + the server phoneMatches boolean…
    expect(v).toMatchObject({ code: "PWP-9999ZZZZ", ruleId: RULE_ID, phoneMatches: true });
    // …and NO PII (no bound phone / owner / trigger sku / customer id).
    expect(v).not.toHaveProperty("boundCustomerPhone");
    expect(v).not.toHaveProperty("ownerStaffId");
    expect(v).not.toHaveProperty("triggerItemCode");
    expect(v).not.toHaveProperty("customerId");
    // The route forwarded the raw selector to the (server-side) RPC.
    const call = (sb._rpcCalls as Array<{ name: string; args: { p_phone: string | null; p_code: string | null } }>).find(
      (c) => c.name === "pwp_discover_available",
    );
    expect(call?.args).toEqual({ p_phone: "+60 12-345 6789", p_code: null, p_name: null });
  });

  it("?code= with a mismatched phone → row returned with phoneMatches=false, NO raw phone in payload", async () => {
    const sb = mockSb({ discoverRows: () => [discoverRow({ phone_matches: false })] });
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await app.fetch(
      new Request("http://t/api/pwp-codes/available?code=PWP-9999ZZZZ&phone=0199999999", {
        headers: { Authorization: `Bearer ${await makeJwt()}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vouchers: Array<Record<string, unknown>> };
    expect(body.vouchers[0]!.phoneMatches).toBe(false);
    // The serialized response can NEVER contain a bound phone (PII oracle closed).
    expect(JSON.stringify(body)).not.toContain("boundCustomerPhone");
    const call = (sb._rpcCalls as Array<{ name: string; args: { p_code: string | null } }>).find(
      (c) => c.name === "pwp_discover_available",
    );
    expect(call?.args.p_code).toBe("PWP-9999ZZZZ");
  });

  it("a discovery RPC error → 500", async () => {
    const sb = mockSb();
    sb.rpc = async (name: string, args: unknown) => {
      sb._rpcCalls.push({ name, args });
      return { data: null, error: { message: "boom" } };
    };
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await app.fetch(
      new Request("http://t/api/pwp-codes/available?phone=0123456789", {
        headers: { Authorization: `Bearer ${await makeJwt()}` },
      }),
      env,
    );
    expect(res.status).toBe(500);
  });
});
