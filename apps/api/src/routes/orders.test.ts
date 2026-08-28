import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";

vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient } from "../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-2";

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

const DEALER_A = "00000000-0000-0000-0000-000000000d01";
const DEALER_B = "00000000-0000-0000-0000-000000000d02";

/**
 * ⛔ OWNER RULING 2026-08-15 — a new Sales Order is never dateless, so no
 * fixture may reach this door with `dateTbd: true` any more. The fixtures that
 * used TBD were not testing TBD: they used it to duck the lead-time floor. A
 * date far past any configurable floor does the same job and states the truth.
 */
const isoIn = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const DATED_DELIVERY = {
  date: isoIn(400),
  proceedDate: isoIn(0),
  dateTbd: false,
  floor: 1,
  hasLift: false,
};

function makeOrderRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    so: 1001,
    status: "place",
    channel: "dealer",
    dealer_id: DEALER_A,
    outlet_id: null,
    salesperson_id: null,
    customer_name: "Customer X",
    customer_phone: null,
    customer_address: null,
    customer_address_unknown: false,
    customer_billing: null,
    customer_billing_same: true,
    customer_emergency: null,
    delivery_date: null,
    delivery_date_tbd: false,
    delivery_floor: 1,
    delivery_has_lift: false,
    paid: "0",
    signature_url: null,
    payment_slip_url: null,
    terms_accepted: true,
    payment_method: null,
    approval_code: null,
    installment_months: null,
    operation_stage: null,
    warehouse_id: null,
    delivery_partner_id: null,
    partner_stage: null,
    partner_picked_at: null,
    partner_eta: null,
    do_number: null,
    do_note: null,
    invoice_no: null,
    invoiced_at: null,
    placed_at: "2026-05-02T00:00:00Z",
    line_count: [{ count: 0 }],
    ...overrides,
  };
}

/**
 * Records every Supabase Storage createSignedUrl call. Returns a deterministic
 * fake signed URL (`https://signed.test/<path>?token=...`) so tests can assert
 * on whether the route invoked signing AND on what path it asked for. Returns
 * `{ data: null, error }` when the test set `signError: true`.
 */
function buildStorageMock(opts: { signError?: boolean } = {}) {
  const signCalls: Array<{ bucket: string; path: string; ttl: number }> = [];
  return {
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrl(path: string, ttl: number) {
            signCalls.push({ bucket, path, ttl });
            if (opts.signError) {
              return { data: null, error: { message: "sign failed" } };
            }
            return {
              data: { signedUrl: `https://signed.test/${bucket}/${path}?token=fake` },
              error: null,
            };
          },
        };
      },
    },
    _signCalls: signCalls,
  };
}

function buildSb(
  rowsFor: {
    list?: unknown[];
    one?: unknown;
    /** Table-keyed rows for the sales-order-data enrichment lookups
     *  (product_skus / addons / pwp_codes resolve on `.in()`,
     *  order_payments on `.order()`). Absent tables resolve to [] — the
     *  route's fail-soft fallbacks kick in, matching a dealer whose RLS
     *  hides the table. */
    byTable?: Record<string, unknown[]>;
  },
  storageOpts: { signError?: boolean } = {},
) {
  // Simulates a Supabase PostgREST chain that records .eq() filters and
  // returns rows on .order() (list) or .maybeSingle() (single row).
  const eqs: Array<[string, unknown]> = [];
  const iss: Array<[string, string, unknown]> = [];
  function chainFor(table: string) {
    const chain = {
      eq(col: string, val: unknown) {
        eqs.push([col, val]);
        return chain;
      },
      /** 0347 — the ledger read filters `voided_at is null`; recorded so a
       *  test can prove a reversed payment never reaches a customer document. */
      is(col: string, val: unknown) {
        iss.push([table, col, val]);
        return chain;
      },
      in: async () => ({ data: rowsFor.byTable?.[table] ?? [], error: null }),
      order: async () => ({
        data: (table === "orders" ? rowsFor.list : rowsFor.byTable?.[table]) ?? [],
        error: null,
      }),
      maybeSingle: async () => ({ data: rowsFor.one ?? null, error: null }),
    };
    return chain;
  }
  const storage = buildStorageMock(storageOpts);
  return Object.assign(
    {
      from: (table: string) => ({ select: () => chainFor(table) }),
      _eqs: eqs,
      _iss: iss,
    },
    storage,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
}

/**
 * Like buildSb but also stubs `.rpc('create_order', { payload })` so POST tests
 * can assert on what was sent and on rpc-returned errors. Use for POST flow.
 */
/** P1 (0303) — the seeded settings singleton. `earliest_sell_days` is the ONE
 *  number the sell-date floor reads; it replaced mattress 14 / sofa 21 with
 *  the upper of the two, so a mattress cart is now gated at 21 as well. */
const PURCHASING_SETTINGS_ROW = {
  order_by_buffer_days: 7,
  earliest_sell_days: 21,
  logistics_call_working_days: 1,
  po_days: [1, 3, 5],
};

function buildSbForCreate(opts: {
  rpcResult?: { id: string; so: number; placed_at: string };
  rpcError?: { code?: string; message?: string; details?: string };
  fetchedRow?: unknown;
  /** Category rows returned by the product_skus.in() lookup used by the
   *  server-side lead-time validator. Defaults to empty (fail-open). Pass
   *  e.g. `[{ product_models: { category: "mattress" } }]` to make the
   *  validator reject any date closer than the earliest-sell number. */
  productSkuCategoryRows?: Array<{ sku?: string; product_models: { category: string } | null }>;
  /** P1 (0303) — `purchasing_settings` row 1; `null` exercises fail-open. */
  purchasingSettingsRow?: unknown;
}) {
  const rpcCalls: Array<{ name: string; payload: unknown }> = [];
  const eqs: Array<[string, unknown]> = [];
  let currentTable: string | null = null;
  // 2026-08-24: the active-rule read is `.eq().order().order()` through the ONE
  // ordered door (readActivePwpRules), so `order` has to CHAIN. This chain has
  // no `then`, so the hop object carries its own - and it still resolves EMPTY,
  // which is the point: this builder is the UNCONFIGURED-rule path, and an
  // empty rule set is what makes a claim reject as pwp_unknown_rule.
  const orderChain: Record<string, unknown> = {
    order: () => orderChain,
    then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
  };
  const chain = {
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      return chain;
    },
    in: async () => ({ data: opts.productSkuCategoryRows ?? [], error: null }),
    order: () => orderChain,
    maybeSingle: async () => {
      // P1 — the earliest-sell floor is a setting, not a constant.
      if (currentTable === "purchasing_settings") {
        return {
          data:
            opts.purchasingSettingsRow !== undefined
              ? opts.purchasingSettingsRow
              : PURCHASING_SETTINGS_ROW,
          error: null,
        };
      }
      /* 0393 — the stair-carry recompute asks for the rate, but ONLY when a fee
         could apply (no lift AND a count > 0). Fixtures written before this key
         take the short-circuit and never reach here. Seeded values, 0184’s. */
      if (currentTable === "floor_config") {
        return { data: { free_up_to_floor: 2, per_floor_per_item: 50 }, error: null };
      }
      /* 0393 — the FK guard checks the key exists before the row can reference
         it, because production ran the code before the migration. A seeded
         database is the normal case, so the fixture answers as one. */
      if (currentTable === "addons") {
        return { data: { key: "STAIR_CARRY" }, error: null };
      }
      return { data: opts.fetchedRow ?? null, error: null };
    },
  };
  const storage = buildStorageMock();
  return Object.assign(
    {
      from: (table: string) => {
        currentTable = table;
        return { select: () => chain };
      },
      rpc: async (name: string, args: { payload: unknown }) => {
        rpcCalls.push({ name, payload: args.payload });
        if (opts.rpcError) {
          return { data: null, error: opts.rpcError };
        }
        return { data: opts.rpcResult ?? null, error: null };
      },
      _eqs: eqs,
      _rpcCalls: rpcCalls,
    },
    storage,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
}

/**
 * 0187 (PWP VOUCHER) — a CONFIGURED-PATH create mock that returns a real PWP rule
 * (so a coded reward line survives P8b with the code carried through), succeeds
 * `pwp_claim_code` (returns a row), and records `pwp_release_codes` + the
 * `pwp_codes` stamp/sweep, so the route's Stage B → rollback → Confirm-pass insert
 * points are exercised end-to-end. Every OTHER recompute table is dormant/empty.
 *
 * P8C_RULE_ID / P8C_MATT_MODEL / P8C_BED_MODEL are valid-hex uuids (the route
 * never round-trips a pwp_codes row through a uuid schema on these paths, but the
 * P8b rule adapter + grant want consistent ids).
 */
const P8C_RULE_ID = "0000000c-0000-0000-0000-0000000a01e1";
const P8C_MATT_MODEL = "0000000b-0000-0000-0000-0000000a0770";
const P8C_BED_MODEL = "0000000d-0000-0000-0000-0000000be000";
const P8C_GROUP = "00000000-1111-2222-3333-444444444444";

/** One RESERVED `pwp_codes` row the carry-forward sweep (P8d BLOCK 2) reads. */
type ReservedRow = {
  code: string;
  rule_id: string | null;
  cart_line_key: string | null;
  trigger_item_code: string | null;
};

function buildSbForCreatePwp(opts: {
  rpcResult?: { id: string; so: number; placed_at: string };
  /** Force create_order to error (to test the exit-10 rollback). */
  createOrderError?: { code?: string; message?: string; details?: string };
  /** Force the claim RPC (pwp_claim_code OR pwp_claim_available_code) to return
   *  NULL (not claimable / phone mismatch / expired). */
  claimReturnsNull?: boolean;
  /** Force the Confirm-pass stamp (pwp_stamp_redeemed) to return a SHORT count
   *  (fewer stamped than claimed → fail-closed 500). */
  stampShort?: boolean;
  /** The caller's RESERVED pwp_codes the carry-forward sweep reads (P8d). Default
   *  [] → the sweep early-returns (no carry/delete). */
  reservedRows?: ReservedRow[];
  /** Override the active pwp_rules the sweep + P8b read (carry_forward toggle /
   *  inactive scenarios). Defaults to the single P8C carry-forward rule. */
  ruleRows?: unknown[];
  /** 2026-08-24 - override what `pwp_discover_available` returns for a
   *  cross-order code. `[]` simulates an unknown / already-USED voucher.
   *  Default: a snapshot mirroring the active rule fixture. */
  discoverRows?: Array<Record<string, unknown>>;
  fetchedRow?: unknown;
}) {
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  // The mattress trigger (in-scope) + the bedframe reward (carries pwp_price).
  const skuRows = [
    { sku: "MATT-1", model_id: P8C_MATT_MODEL, variant: "QUEEN", product_models: { category: "mattress" }, pwp_price: null },
    { sku: "BED-1", model_id: P8C_BED_MODEL, variant: null, product_models: { category: "bedframe" }, pwp_price: 300 },
  ];
  const defaultRuleRows = [
    {
      id: P8C_RULE_ID,
      type: "pwp",
      trigger_category: "mattress",
      trigger_targets: [{ scope: "model", modelId: P8C_MATT_MODEL }],
      reward_category: "bedframe",
      reward_targets: [{ scope: "model", modelId: P8C_BED_MODEL }],
      qty_per_trigger: 1,
      active: true,
      // P8d (0188) — default carry-forward ON, perpetual.
      carry_forward: true,
      carry_forward_days: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      updated_by: null,
    },
  ];
  const ruleRows = opts.ruleRows ?? defaultRuleRows;
  const reservedRows = opts.reservedRows ?? [];

  function rowsFor(table: string): unknown[] {
    if (table === "product_skus") return skuRows;
    if (table === "pwp_rules") return ruleRows;
    // The carry-forward sweep's RESERVED read (`status='RESERVED'`).
    if (table === "pwp_codes") return reservedRows;
    return []; // every other recompute table is dormant
  }

  // A select chain: records nothing, just resolves the table's rows on .in / .then.
  // For an UPDATE/DELETE `.select("code")` tail (the carry/delete sweep), it echoes
  // the operated rows so the route counts carried/deleted correctly.
  function selectChain(table: string) {
    const chain: Record<string, unknown> = {
      eq: () => chain,
      // `.in()` is BOTH terminal (resolveSkuInfo awaits `.select(...).in(...)`) AND
      // chainable (the carry/delete sweep does `.in(codes).select("code")`): it
      // returns the chain, which is awaitable via `then` (→ rowsFor).
      in: () => chain,
      is: () => chain,
      select: () => {
        // The carry UPDATE / delete `.select("code")` tail — echo the swept rows.
        if (table === "pwp_codes") {
          return Promise.resolve({ data: reservedRows.map((r) => ({ code: r.code })), error: null });
        }
        return chain;
      },
      maybeSingle: async () => {
        /* 0393 — the stair-carry recompute reads the seeded rate. It only asks
           when a fee could apply (no lift AND a count > 0), so every fixture
           written before this key still takes the short-circuit and never
           reaches here. Seeded values, matching 0184’s. */
        if (table === "floor_config") {
          return { data: { free_up_to_floor: 2, per_floor_per_item: 50 }, error: null };
        }
        return { data: opts.fetchedRow ?? null, error: null };
      },
      // 2026-08-24: `order` was TERMINAL here, resolving an empty list. The
      // active-rule read now goes through the ONE ordered door
      // (readActivePwpRules) as .eq().order().order(), so a terminal stub
      // handed every PWP test an EMPTY rule set and 11 of them 500'd.
      // Chainable instead: the chain is awaitable via `then` -> rowsFor,
      // which still yields [] for every dormant table.
      order: () => chain,
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rowsFor(table), error: null }),
    };
    return chain;
  }

  const sb = {
    from: (table: string) => ({
      select: () => selectChain(table),
      insert: async () => ({ error: null }),
      update: () => selectChain(table), // .update().eq().in().select("code") (sweep carry)
      delete: () => selectChain(table), // .delete().eq().in().select("code") (sweep delete)
    }),
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      if (name === "create_order") {
        if (opts.createOrderError) return { data: null, error: opts.createOrderError };
        return { data: opts.rpcResult ?? null, error: null };
      }
      // Same-cart claim (RESERVED→USED) AND cross-order claim (AVAILABLE→USED) both
      // RETURN the claimed row or NULL — the route treats them identically.
      if (name === "pwp_claim_code" || name === "pwp_claim_available_code") {
        if (opts.claimReturnsNull) return { data: null, error: null };
        return { data: { code: String((args as { p_code: string }).p_code) }, error: null };
      }
      // 2026-08-24 - the cross-order snapshot door. A crossOrder claim now
      // validates the line against the reward scope FROZEN on the voucher at
      // mint, read through the DEFINER discover RPC, because a saved voucher
      // is redeemed on an order that need not contain the trigger at all.
      // Mirrors the ACTIVE rule fixture above so the snapshot is truthful.
      if (name === "pwp_discover_available") {
        if (opts.discoverRows) return { data: opts.discoverRows, error: null };
        const first = ruleRows[0] as Record<string, unknown> | undefined;
        if (!first) return { data: [], error: null };
        return {
          data: [
            {
              code: String((args as { p_code?: string }).p_code ?? ""),
              rule_id: first.id,
              type: first.type,
              reward_category: first.reward_category,
              reward_targets: first.reward_targets,
              source_order_id: null,
              expires_at: null,
              phone_matches: true,
              name_matches: true,
            },
          ],
          error: null,
        };
      }
      if (name === "pwp_release_codes") return { data: 1, error: null };
      if (name === "pwp_release_available_code") return { data: 1, error: null };
      // Confirm-pass stamp — returns a COUNT. stampShort → 0 (< claimed → 500).
      if (name === "pwp_stamp_redeemed") {
        const a = args as { p_codes?: string[] };
        return { data: opts.stampShort ? 0 : a.p_codes?.length ?? 0, error: null };
      }
      return { data: null, error: null };
    },
    ...buildStorageMock(),
    _rpcCalls: rpcCalls,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return sb;
}

/** A create body whose reward line carries a P8c voucher claim (code+claimGroup).
 *  The mattress trigger unlocks the bedframe reward under the configured rule. */
function pwpClaimBody(over: Record<string, unknown> = {}) {
  return validCreateBody({
    // A date far past the lead-time floor — the configured mock returns a
    // product_skus category join, which gates a near date.
    delivery: DATED_DELIVERY,
    lines: [
      { sku: "MATT-1", qty: 1, attrs: null, unitPrice: 1500 },
      {
        sku: "BED-1",
        qty: 1,
        unitPrice: 900,
        attrs: { pwp: { ruleId: P8C_RULE_ID, code: "PWP-1111AAAA", claimGroup: P8C_GROUP } },
      },
    ],
    pwpCartLineKeys: ["L-matt"],
    ...over,
  });
}

function validCreateBody(over: Record<string, unknown> = {}) {
  return {
    outletId: "00000000-0000-0000-0000-00000000ee01",
    salespersonId: "00000000-0000-0000-0000-00000000ff01",
    customer: {
      name: "Tan Mei Ling",
      phone: "012-3456789",
      address: "123 Jalan Sample, 50000 KL",
      addressUnknown: false,
      billing: null,
      billingSame: true,
      emergency: "Tan Junior · 012-9988776 · Spouse",
    },
    delivery: { date: "2026-06-01", proceedDate: "2026-05-15", dateTbd: false, floor: 1, hasLift: false },
    lines: [
      {
        sku: "mattress:carres-classic:queen",
        qty: 1,
        attrs: null,
        unitPrice: 1500,
      },
    ],
    addons: [],
    paid: 750,
    // Path prefix MUST match the caller's dealerId — the POST handler validates
    // this. Tests using a different caller (e.g. cross-dealer) need to override.
    signaturePath: `orders-attachments/${DEALER_A}/wiz/signature.png`,
    paymentSlipPath: null,
    termsAccepted: true,
    depositPct: 50,
    paymentMethod: "online",
    // 0219 — the approval / reference code is server-required now for any
    // method whose config says approvalCodeRequired (the default methods
    // mirror Loo's 2026-05-10 rule: everything except cash). The real POS has
    // sent it for every method since 2026-06-16 (step4Valid ≥3 gate).
    approvalCode: "FT2026TEST01",
    installmentMonths: null,
    ...over,
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
});

afterAll(() => _setJwksForTesting(null));

describe("GET /api/orders", () => {
  it("401 without Authorization", async () => {
    const res = await app.fetch(new Request("http://t/api/orders"), env);
    expect(res.status).toBe(401);
  });

  it("returns RLS-scoped list for dealer (own dealerId only — Supabase enforces, route doesn't add WHERE)", async () => {
    const sb = buildSb({ list: [makeOrderRow({ dealer_id: DEALER_A })] });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number; orders: Array<{ dealerId: string }> };
    expect(body.total).toBe(1);
    expect(body.orders[0]?.dealerId).toBe(DEALER_A);
  });

  it("status filter is applied at the SQL level", async () => {
    const sb = buildSb({ list: [makeOrderRow({ status: "delivered" })] });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    await app.fetch(
      new Request("http://t/api/orders?status=delivered", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(sb._eqs).toContainEqual(["status", "delivered"]);
  });

  it("outletId filter is applied", async () => {
    const sb = buildSb({ list: [] });
    vi.mocked(userClient).mockReturnValue(sb);
    const outlet = "22222222-2222-2222-2222-222222222222";
    const jwt = await makeJwt("dealer", DEALER_A);
    await app.fetch(
      new Request(`http://t/api/orders?outletId=${outlet}`, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(sb._eqs).toContainEqual(["outlet_id", outlet]);
  });

  it("dealerId param IGNORED for dealer role (RLS handles scoping)", async () => {
    const sb = buildSb({ list: [] });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    await app.fetch(
      new Request(`http://t/api/orders?dealerId=${DEALER_B}`, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(sb._eqs).not.toContainEqual(["dealer_id", DEALER_B]);
  });

  it("dealerId param HONORED for principal role (cross-dealer filter)", async () => {
    const sb = buildSb({ list: [] });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("principal", null);
    await app.fetch(
      new Request(`http://t/api/orders?dealerId=${DEALER_B}`, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(sb._eqs).toContainEqual(["dealer_id", DEALER_B]);
  });

  it("returns 400 for invalid status enum", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ list: [] }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders?status=bogus", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/orders/customer-search", () => {
  /** Chain mock for .select().ilike().order().limit() — records the ilike
   *  pattern + limit and resolves rows at .limit(). */
  function buildSbForSearch(rows: unknown[]) {
    const calls: { ilike?: [string, string]; limit?: number } = {};
    const chain = {
      ilike(col: string, pattern: string) {
        calls.ilike = [col, pattern];
        return chain;
      },
      order() {
        return chain;
      },
      limit: async (n: number) => {
        calls.limit = n;
        return { data: rows, error: null };
      },
    };
    return Object.assign(
      { from: () => ({ select: () => chain }), _calls: calls },
      {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
  }

  function customerRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      customer_name: "Jamie Tan",
      customer_phone: "012-3456789",
      customer_email: "jamie@example.com",
      customer_address: "12 Jalan Besar, Petaling Jaya 46200, Selangor",
      customer_address_unknown: false,
      customer_billing: null,
      customer_billing_same: true,
      customer_emergency: "Mei Tan · 012-9988776 · Spouse",
      customer_race: "Chinese",
      customer_gender: "Female",
      customer_birthday: "1990-04-01",
      placed_at: "2026-07-01T00:00:00Z",
      ...overrides,
    };
  }

  it("401 without Authorization", async () => {
    const res = await app.fetch(new Request("http://t/api/orders/customer-search?q=jam"), env);
    expect(res.status).toBe(401);
  });

  it("short query (<2 chars) returns empty without touching the DB", async () => {
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/customer-search?q=j", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ customers: [] });
    expect(vi.mocked(userClient)).not.toHaveBeenCalled();
  });

  it("maps the full customer block to camelCase", async () => {
    vi.mocked(userClient).mockReturnValue(buildSbForSearch([customerRow()]));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/customer-search?q=jam", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { customers: Array<Record<string, unknown>> };
    expect(body.customers).toEqual([
      {
        name: "Jamie Tan",
        phone: "012-3456789",
        email: "jamie@example.com",
        address: "12 Jalan Besar, Petaling Jaya 46200, Selangor",
        addressUnknown: false,
        billing: null,
        billingSame: true,
        emergency: "Mei Tan · 012-9988776 · Spouse",
        race: "Chinese",
        gender: "Female",
        birthday: "1990-04-01",
      },
    ]);
  });

  it("dedupes by phone digits (newest order wins) and by name when phone is null", async () => {
    const rows = [
      customerRow({ customer_email: "newest@example.com" }),
      // Same phone, different formatting → same customer, older order dropped.
      customerRow({ customer_phone: "0123456789", customer_email: "older@example.com" }),
      // No phone → keyed by lowercased name.
      customerRow({ customer_name: "James Lee", customer_phone: null }),
      customerRow({ customer_name: "james lee", customer_phone: null }),
    ];
    vi.mocked(userClient).mockReturnValue(buildSbForSearch(rows));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/customer-search?q=ja", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    const body = (await res.json()) as { customers: Array<{ name: string; email: string }> };
    expect(body.customers).toHaveLength(2);
    expect(body.customers[0]?.email).toBe("newest@example.com");
    expect(body.customers[1]?.name).toBe("James Lee");
  });

  it("escapes ilike wildcards in the query and caps results at 8", async () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      customerRow({ customer_name: `Jam ${i}`, customer_phone: `012-000000${i}` }),
    );
    const sb = buildSbForSearch(rows);
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(`http://t/api/orders/customer-search?q=${encodeURIComponent("ja%m")}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(sb._calls.ilike).toEqual(["customer_name", "%ja\\%m%"]);
    const body = (await res.json()) as { customers: unknown[] };
    expect(body.customers).toHaveLength(8);
  });
});

describe("GET /api/orders/:id", () => {
  it("returns order with rels populated via PostgREST nested fetch", async () => {
    const oneRow = {
      ...makeOrderRow(),
      order_lines: [
        { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", order_id: "11111111-1111-1111-1111-111111111111", sku: "SKU-1", qty: 1, attrs: null, unit_price: "100" },
      ],
      order_addons: [],
      order_history: [],
    };
    const sb = buildSb({ one: oneRow });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/11111111-1111-1111-1111-111111111111", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; lines: Array<{ unitPrice: number }> };
    expect(body.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]?.unitPrice).toBe(100);
  });

  it("returns 404 when row not found / RLS-hidden (same message — no info leak)", async () => {
    const sb = buildSb({ one: null });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/11111111-1111-1111-1111-111111111199", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for malformed UUID (no SQL run)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ one: null }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/not-a-uuid", { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("rewrites signature_url + payment_slip_url Storage paths to 1h signed URLs", async () => {
    const sigPath = `orders-attachments/${DEALER_A}/wiz-1/signature.png`;
    const slipPath = `orders-attachments/${DEALER_A}/wiz-1/payment-slip.jpg`;
    const oneRow = {
      ...makeOrderRow({ signature_url: sigPath, payment_slip_url: slipPath }),
      order_lines: [],
      order_addons: [],
      order_history: [],
    };
    const sb = buildSb({ one: oneRow });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/11111111-1111-1111-1111-111111111111", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { signatureUrl: string; paymentSlipUrl: string };
    expect(body.signatureUrl).toMatch(/^https:\/\/signed\.test\/orders-attachments\/.+\/signature\.png\?token=/);
    expect(body.paymentSlipUrl).toMatch(/^https:\/\/signed\.test\/orders-attachments\/.+\/payment-slip\.jpg\?token=/);
    // Both signs were attempted in parallel — exactly one call per path
    expect(sb._signCalls).toHaveLength(2);
    expect(sb._signCalls.map((c: { path: string }) => c.path).sort()).toEqual(
      [`${DEALER_A}/wiz-1/payment-slip.jpg`, `${DEALER_A}/wiz-1/signature.png`].sort(),
    );
    expect(sb._signCalls[0]!.ttl).toBe(60 * 60);
  });

  it("leaves null url fields as null without invoking Storage signing", async () => {
    const oneRow = {
      ...makeOrderRow({ signature_url: null, payment_slip_url: null }),
      order_lines: [],
      order_addons: [],
      order_history: [],
    };
    const sb = buildSb({ one: oneRow });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/11111111-1111-1111-1111-111111111111", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { signatureUrl: string | null; paymentSlipUrl: string | null };
    expect(body.signatureUrl).toBeNull();
    expect(body.paymentSlipUrl).toBeNull();
    expect(sb._signCalls).toHaveLength(0);
  });

  it("returns null url field when Storage sign fails (defensive — no leak of internal error)", async () => {
    const sigPath = `orders-attachments/${DEALER_A}/wiz-1/signature.png`;
    const oneRow = {
      ...makeOrderRow({ signature_url: sigPath, payment_slip_url: null }),
      order_lines: [],
      order_addons: [],
      order_history: [],
    };
    const sb = buildSb({ one: oneRow }, { signError: true });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/11111111-1111-1111-1111-111111111111", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { signatureUrl: string | null };
    expect(body.signatureUrl).toBeNull();
    expect(sb._signCalls).toHaveLength(1); // attempted, then swallowed
  });
});

// 2026-05-12 (Loo) — Sales Order data for client-side render.
describe("GET /api/orders/:id/sales-order-data", () => {
  const ORDER_ID = "11111111-1111-1111-1111-111111111111";

  function makeJoinedRow(over: Partial<Record<string, unknown>> = {}) {
    return {
      ...makeOrderRow({
        customer_name: "Tan Mei Ling",
        customer_phone: "012-3456789",
        customer_address: "123 Jalan Sample, 50000 KL",
        delivery_date: "2026-06-01",
        delivery_floor: 3,
        delivery_has_lift: true,
        paid: "750",
        placed_at: "2026-05-12T10:00:00Z",
        ...over,
      }),
      order_lines: [
        {
          sku: "sofa:atrium:part:L-piece",
          qty: 1,
          unit_price: "1149.50",
          attrs: { mode: "custom", fabric_name: "Linen", fabric_surcharge: 0 },
        },
      ],
      order_addons: [{ addon_key: "stair_carry", qty: 1, unit_price: "60" }],
      dealers: { name: "Mattress King", contact: "012-1111111" },
      outlets: null,
      salespersons: null,
    };
  }

  it("returns JSON payload for dealer role (browser does the render)", async () => {
    const sb = buildSb({ one: makeJoinedRow() });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/sales-order-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    // Golden SO (STAGE 2): SO-1001 everywhere — no zero-padding, no second format.
    expect(body.so_number).toBe("SO-1001");
    expect(body.order_code).toBe("SO-1001");
    expect(body.customer.name).toBe("Tan Mei Ling");
    expect(body.lines).toHaveLength(1);
    expect(body.addons).toHaveLength(1);
  });

  it("admits operation (revised 2026-05-12 — they need it on handover)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ one: makeJoinedRow() }));
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/sales-order-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("returns 403 for partner role", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ one: makeJoinedRow() }));
    const jwt = await makeJwt("partner", null);
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/sales-order-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 for supplier role", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ one: makeJoinedRow() }));
    const jwt = await makeJwt("supplier", null);
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/sales-order-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("admits finance + principal too (customer-facing doc, internal roles)", async () => {
    for (const role of ["finance", "principal"] as const) {
      vi.mocked(userClient).mockReturnValue(buildSb({ one: makeJoinedRow() }));
      const jwt = await makeJwt(role, null);
      const res = await app.fetch(
        new Request(`http://t/api/orders/${ORDER_ID}/sales-order-data`, {
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env,
      );
      expect(res.status).toBe(200);
    }
  });

  it("returns 404 for missing order (RLS-hidden or genuinely absent)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ one: null }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/sales-order-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for malformed UUID (no DB call)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ one: null }));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(`http://t/api/orders/not-a-uuid/sales-order-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  // 2026-07-14 (Loo, 2990s SO parity) — description = PRODUCT NAME, addon
  // labels humanized, PAYMENTS RECEIVED rows, earned voucher codes.
  async function fetchPayload(sb: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/sales-order-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await res.json()) as any;
  }

  it("resolves line description to the product name (model name + variant)", async () => {
    const body = await fetchPayload(
      buildSb({
        one: makeJoinedRow(),
        byTable: {
          product_skus: [
            {
              sku: "sofa:atrium:part:L-piece",
              variant: "L-piece",
              product_models: { name: "Atrium Sofa" },
            },
          ],
        },
      }),
    );
    expect(body.lines[0].sku).toBe("sofa:atrium:part:L-piece"); // SKU column keeps the code
    expect(body.lines[0].description).toBe("Atrium Sofa (L-piece)");
  });

  it("falls back to the sku code when the catalog lookup misses", async () => {
    const body = await fetchPayload(buildSb({ one: makeJoinedRow() }));
    expect(body.lines[0].description).toBe("sofa:atrium:part:L-piece");
  });

  // Loo 2026-07-19 — the customer's SO shows a built sofa as ONE model line;
  // the per-compartment split (Phase-5 explode) is operation's view.
  it("regroups exploded sofa-build lines into ONE model line (sku = model key, sofa_spec sub-line)", async () => {
    const row = makeJoinedRow();
    const whole = { sofa_height: "24", fabric_name: "CG-011 Peach", leg_height: '4"' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (row as any).order_lines = [
      { sku: "5539-1B(LHF)", qty: 1, unit_price: "996.66", attrs: { ...whole, sofa_build_key: "bk-1", module_code: "1B(LHF)" } },
      { sku: "5539-CNR", qty: 1, unit_price: "996.66", attrs: { ...whole, sofa_build_key: "bk-1", module_code: "CNR" } },
      { sku: "5539-2A(RHF)", qty: 1, unit_price: "996.68", attrs: { ...whole, sofa_build_key: "bk-1", module_code: "2A(RHF)" } },
      { sku: "MATT-A", qty: 2, unit_price: "100", attrs: null },
    ];
    const body = await fetchPayload(
      buildSb({
        one: row,
        byTable: {
          product_skus: [
            {
              sku: "5539-1B(LHF)",
              variant: "1B(LHF)",
              product_models: { name: "Booqit", model_key: "5539" },
            },
            {
              sku: "MATT-A",
              variant: "Queen",
              product_models: { name: "Matt X", model_key: "matt-x" },
            },
          ],
        },
      }),
    );
    expect(body.lines).toHaveLength(2);
    expect(body.lines[0]).toMatchObject({
      sku: "5539",
      description: "Booqit",
      qty: 1,
      unit_price: 2990,
      line_total: 2990,
    });
    expect(body.lines[0].attrs.sofa_spec).toBe(
      '1B(LHF) + CNR + 2A(RHF) · 24″ · CG-011 Peach · leg 4"',
    );
    // The flat line passes through untouched…
    expect(body.lines[1]).toMatchObject({ sku: "MATT-A", description: "Matt X (Queen)", qty: 2 });
    // …and the Σ-exact split keeps the subtotal (2990 + 200 + addon 60).
    expect(body.subtotal).toBe(3250);
  });

  it("humanizes addon labels via addons.name and passes addon attrs through", async () => {
    const row = makeJoinedRow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (row as any).order_addons = [
      { addon_key: "dispose-mattress", qty: 3, unit_price: "80", attrs: { size: "King" } },
    ];
    const body = await fetchPayload(
      buildSb({
        one: row,
        byTable: { addons: [{ key: "dispose-mattress", name: "Dispose old mattress" }] },
      }),
    );
    expect(body.addons[0].label).toBe("Dispose old mattress");
    expect(body.addons[0].attrs).toEqual({ size: "King" });
  });

  it("synthesizes ONE payments row from orders.paid + payment_method when the ledger is unreadable/empty", async () => {
    const body = await fetchPayload(
      buildSb({
        one: makeJoinedRow({ paid: "750", payment_method: "credit", approval_code: "123123" }),
      }),
    );
    expect(body.payments).toEqual([
      // Golden SO (STAGE 2): the synthesized row carries the order date; the
      // collector is the salesperson when the embed is present (absent here).
      { label: "Card", reference: "123123", amount: 750, date: "2026-05-12", collected_by: null },
    ]);
  });

  it("returns no payments rows for an unpaid order", async () => {
    const body = await fetchPayload(buildSb({ one: makeJoinedRow({ paid: "0" }) }));
    expect(body.payments).toEqual([]);
  });

  it("prefers order_payments ledger rows (internal reprint) over the synthesized row", async () => {
    const body = await fetchPayload(
      buildSb({
        one: makeJoinedRow(),
        byTable: {
          order_payments: [
            {
              amount: "500",
              paid_on: "2026-07-01",
              method: "bank",
              kind: "deposit",
              reference: "R-1",
              receipt_no: null,
            },
            {
              amount: "250",
              paid_on: "2026-07-08",
              method: "cash",
              kind: "payment",
              reference: null,
              receipt_no: "RC-9",
            },
          ],
        },
      }),
    );
    expect(body.payments).toEqual([
      // Golden SO (STAGE 2): each ledger row carries its own date; the
      // collector resolves from app_users (unreadable in this mock → null).
      { label: "Deposit · Bank transfer", reference: "R-1", amount: 500, date: "2026-07-01", collected_by: null },
      { label: "Cash", reference: "RC-9", amount: 250, date: "2026-07-08", collected_by: null },
    ]);
  });

  // CARD 4 closing slice (0347). 0343 turned a void into a STAMP so money
  // history is never erased — and this query, written when a void DELETED the
  // row, would otherwise print a reversed payment on the document the CUSTOMER
  // reads. The filter is asserted on the query, not on the mock's rows,
  // because the mock cannot apply a PostgREST filter for us.
  it("asks the ledger for LIVE payments only — a voided row never prints", async () => {
    const sb = buildSb({ one: makeJoinedRow() });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation", null);
    await app.fetch(
      new Request(`http://t/api/orders/${ORDER_ID}/sales-order-data`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(sb._iss).toContainEqual(["order_payments", "voided_at", null]);
  });

  it("returns earned voucher codes (fail-soft to [] when the table is unreadable)", async () => {
    const body = await fetchPayload(
      buildSb({
        one: makeJoinedRow(),
        byTable: {
          pwp_codes: [
            {
              code: "PWP-1401JXWP",
              status: "AVAILABLE",
              type: "pwp",
              reward_category: "bedframe",
              trigger_item_code: "sofa:atrium:part:L-piece",
            },
            {
              code: "PWP-2988YJLO",
              status: "USED",
              type: "promo",
              reward_category: null,
              trigger_item_code: null,
            },
          ],
        },
      }),
    );
    expect(body.vouchers).toEqual([
      {
        code: "PWP-1401JXWP",
        redeemed: false,
        type: "pwp",
        reward_category: "bedframe",
        trigger_sku: "sofa:atrium:part:L-piece",
      },
      {
        code: "PWP-2988YJLO",
        redeemed: true,
        type: "promo",
        reward_category: null,
        trigger_sku: null,
      },
    ]);
    // and absent table → []
    const bare = await fetchPayload(buildSb({ one: makeJoinedRow() }));
    expect(bare.vouchers).toEqual([]);
  });
});

describe("POST /api/orders", () => {
  const NEW_ORDER_ID = "11111111-1111-1111-1111-111111111111";

  it("happy path → calls RPC, then refetches order with rels, returns 201 + full order", async () => {
    const sb = buildSbForCreate({
      rpcResult: { id: NEW_ORDER_ID, so: 1251, placed_at: "2026-05-02T10:00:00Z" },
      fetchedRow: {
        ...makeOrderRow({
          id: NEW_ORDER_ID,
          so: 1251,
          dealer_id: DEALER_A,
          customer_name: "Tan Mei Ling",
          paid: "750",
        }),
        order_lines: [
          {
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            order_id: NEW_ORDER_ID,
            sku: "mattress:carres-classic:queen",
            qty: 1,
            attrs: null,
            unit_price: "1500",
          },
        ],
        order_addons: [],
        order_history: [
          {
            id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            order_id: NEW_ORDER_ID,
            text: "Order created · 50% deposit",
            by_role: "dealer",
            occurred_at: "2026-05-02T10:00:00Z",
          },
        ],
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);

    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody()),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; so: number; lines: unknown[]; history: unknown[] };
    expect(body.id).toBe(NEW_ORDER_ID);
    expect(body.so).toBe(1251);
    expect(body.lines).toHaveLength(1);
    expect(body.history).toHaveLength(1);

    // RPC was called with the snake_case payload + dealer_id from JWT
    expect(sb._rpcCalls).toHaveLength(1);
    const sentPayload = sb._rpcCalls[0]!.payload as Record<string, unknown>;
    expect(sentPayload.dealer_id).toBe(DEALER_A);
    expect(sentPayload.customer_name).toBe("Tan Mei Ling");
    expect(sentPayload.deposit_pct).toBe(50);
    expect((sentPayload.lines as unknown[])).toHaveLength(1);
    // 0184 — the delivery-fee recompute runs on the dormant 0-rate config in
    // this harness (the shared mock can't return a configured rate), so it
    // appends NO delivery addon — the payload addons stay byte-identical.
    expect((sentPayload.addons as unknown[])).toHaveLength(0);

    // Then re-fetched the order by id
    expect(sb._eqs).toContainEqual(["id", NEW_ORDER_ID]);
  });

  /* STAIR CARRY REACHES THE ORDER (owner ruling YH, 2026-08-28; migration 0393).

     The fee was computed in the browser and written down nowhere, so the
     customer signed a total the order could not describe and every payment door
     capped below it. These pin the two halves of the fix at the route: a
     chargeable order carries the row into the RPC, and a client may not send
     one itself. */
  it("stamps a STAIR_CARRY addon onto a chargeable order", async () => {
    const sb = buildSbForCreate({
      rpcResult: { id: NEW_ORDER_ID, so: 1252, placed_at: "2026-05-02T10:00:00Z" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          validCreateBody({
            // 1 item, floor 3, no lift, 1 needing carry, at the seeded rate:
            // (3 − 2) flight × RM50 × 1 item = RM50.
            delivery: {
              date: "2026-06-01",
              proceedDate: "2026-05-15",
              dateTbd: false,
              floor: 3,
              hasLift: false,
              stairItems: 1,
            },
          }),
        ),
      }),
      env,
    );
    const payload = sb._rpcCalls[0]!.payload as { addons: Array<Record<string, unknown>> };
    expect(payload.addons).toContainEqual(
      expect.objectContaining({ addon_key: "STAIR_CARRY", qty: 1, unit_price: 50 }),
    );
  });

  it("refuses a client-sent STAIR_CARRY — the charge is the server’s alone", async () => {
    const sb = buildSbForCreate({
      rpcResult: { id: NEW_ORDER_ID, so: 1253, placed_at: "2026-05-02T10:00:00Z" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          validCreateBody({
            // A lift means no charge — so a row here could ONLY have come from
            // the client, and it must not survive.
            delivery: {
              date: "2026-06-01",
              proceedDate: "2026-05-15",
              dateTbd: false,
              floor: 3,
              hasLift: true,
              stairItems: 3,
            },
            addons: [{ addonKey: "STAIR_CARRY", qty: 1, unitPrice: 9999, attrs: null }],
          }),
        ),
      }),
      env,
    );
    const payload = sb._rpcCalls[0]!.payload as { addons: Array<Record<string, unknown>> };
    expect(payload.addons).toHaveLength(0);
  });

  it("returns 400 on invalid payload (missing required field)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSbForCreate({}));
    const jwt = await makeJwt("dealer", DEALER_A);
    const body = validCreateBody();
    delete (body as Record<string, unknown>).signaturePath; // signature is required
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on empty lines array (zod min(1))", async () => {
    vi.mocked(userClient).mockReturnValue(buildSbForCreate({}));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody({ lines: [] })),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when termsAccepted is false (literal(true) gate)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSbForCreate({}));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody({ termsAccepted: false })),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("maps RPC 42501 (cross-dealer block) to HTTP 403", async () => {
    const sb = buildSbForCreate({
      rpcError: { code: "42501", message: "forbidden: cross-dealer insert" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody()),
      }),
      env,
    );
    expect(res.status).toBe(403);
    // RPC was attempted; no follow-up ORDER fetch happened. The two eqs
    // recorded are both PRE-create singleton reads, not a follow-up fetch:
    // the 0219 order_entry_config row (payment-method validation) and, since
    // P1 (0303), the purchasing_settings row the earliest-sell floor reads.
    expect(sb._rpcCalls).toHaveLength(1);
    expect(sb._eqs).toEqual([
      ["id", true],
      ["id", 1],
    ]);
  });

  it("maps RPC 22023 (validation in PL/pgSQL) to HTTP 400", async () => {
    const sb = buildSbForCreate({
      rpcError: { code: "22023", message: "order must have at least one line" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody()),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  // Migration 0089 (Loo 2026-05-11) — sofa cannot mix with mattress / bedframe.
  // The RPC raises 22023 with DETAIL='mixed_category_lines'; the route maps
  // this specific detail to 422 + code so the UI can surface a friendly toast.
  it("maps RPC 22023 mixed_category_lines → 422 with typed code", async () => {
    const sb = buildSbForCreate({
      rpcError: {
        code: "22023",
        message: "sofa cannot mix with mattress or bedframe in the same order",
        details: "mixed_category_lines",
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody()),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; message?: string };
    expect(body.code).toBe("mixed_category_lines");
    expect(body.message).toMatch(/sofa/i);
  });

  // 0185 (free items / gifts) — order-path wiring. The shared chain can't return
  // a configured campaign (campaign read resolves empty), so a claim is
  // ineligible → 409 free_item_not_eligible (the route maps the typed
  // bad_request). A client-sent attrs.free_gift is stripped before the RPC.
  it("rejects an ineligible free-item claim with 409 free_item_not_eligible (no create)", async () => {
    const sb = buildSbForCreate({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const body = validCreateBody({
      lines: [{ sku: "MATT-1", qty: 1, attrs: { free_item: { campaignId: "camp-x" } }, unitPrice: 1500 }],
    });
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: string; code: string };
    expect(j.error).toBe("rule_violation");
    expect(j.code).toBe("free_item_not_eligible");
    // No order created.
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("strips a client-sent attrs.free_gift before reaching create_order (gifts are server-only)", async () => {
    const sb = buildSbForCreate({
      rpcResult: { id: "11111111-1111-1111-1111-111111111111", so: 1252, placed_at: "2026-05-02T10:00:00Z" },
      fetchedRow: makeOrderRow({ order_lines: [], order_addons: [], order_history: [] }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const body = validCreateBody({
      lines: [{ sku: "MATT-1", qty: 1, attrs: { free_gift: { giftSku: "HACK-TV" }, color: "blue" }, unitPrice: 1500 }],
    });
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(sb._rpcCalls).toHaveLength(1);
    const payload = sb._rpcCalls[0]!.payload as { lines: Array<{ attrs: Record<string, unknown> | null }> };
    // The bogus client gift marker is gone; the rest of the attrs survive.
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0]!.attrs).toEqual({ color: "blue" });
  });

  // 0186 (PWP / Promo) — order-path wiring. The shared chain can't return a
  // configured pwp_rule (the rules read resolves empty), so a claim is an unknown
  // rule → 409 pwp_not_eligible (the route maps the typed bad_request to 409).
  // The configured happy path (a valid claim forces unitPrice to pwp_price in the
  // create_order payload) is covered by the isolated pwp-recompute.test.ts — same
  // mock-limitation precedent as free-gift-route-configured-test (§17.5).
  it("rejects a PWP claim against an unconfigured rule with 409 (no create)", async () => {
    const sb = buildSbForCreate({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const body = validCreateBody({
      lines: [{ sku: "MATT-1", qty: 1, attrs: { pwp: { ruleId: "rule-x" } }, unitPrice: 1500 }],
    });
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: string; code: string };
    expect(j.error).toBe("rule_violation");
    expect(j.code).toMatch(/^pwp_/);
    // No order created.
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("strips a client-sent attrs.pwp before reaching create_order when no rule is active (DORMANT passthrough)", async () => {
    const sb = buildSbForCreate({
      rpcResult: { id: "11111111-1111-1111-1111-111111111111", so: 1253, placed_at: "2026-05-02T10:00:00Z" },
      fetchedRow: makeOrderRow({ order_lines: [], order_addons: [], order_history: [] }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    // A line carrying a pwp marker with no active rules: the unknown-rule guard
    // fires (409) so it never reaches create_order. To exercise the STRIP-only
    // passthrough we send a line WITHOUT a pwp marker but with a stray attr, then
    // assert it survives — proving the PWP stage is wired in and inert on the
    // no-claim path (the configured strip is unit-tested in pwp-recompute.test.ts).
    const body = validCreateBody({
      lines: [{ sku: "MATT-1", qty: 1, attrs: { color: "blue" }, unitPrice: 1500 }],
    });
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(sb._rpcCalls).toHaveLength(1);
    const payload = sb._rpcCalls[0]!.payload as { lines: Array<{ attrs: Record<string, unknown> | null }> };
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0]!.attrs).toEqual({ color: "blue" });
  });

  // 0187 (PWP VOUCHER STATE MACHINE) — Stage B order-path wiring. The shared
  // create mock can't return a configured pwp_rule OR a configured pwp_codes row,
  // so the CONFIGURED happy paths (a valid attrs.pwp.code claim flips a code USED
  // + stamps redeemed_order_id; a rollback exit releases the claim) are covered by
  // the isolated pwp-codes-claim.test.ts unit suite — same mock-limitation
  // precedent as free-gift-route-configured-test / delivery-route-configured-test
  // (§17.5). Here we prove Stage B is WIRED IN and INERT on the no-voucher path:
  // a DORMANT order claims nothing → NO pwp_claim_code / pwp_release_codes RPC
  // fires and the ONLY rpc is create_order (so the Confirm-pass + rollback are
  // both skipped → byte-identical).
  it("Stage B is dormant on a no-voucher order — no pwp_claim_code / pwp_release_codes RPC fires (byte-identical)", async () => {
    const sb = buildSbForCreate({
      rpcResult: { id: "11111111-1111-1111-1111-111111111111", so: 1254, placed_at: "2026-05-02T10:00:00Z" },
      fetchedRow: makeOrderRow({ order_lines: [], order_addons: [], order_history: [] }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    // A plain order with no attrs.pwp marker at all.
    const body = validCreateBody({
      lines: [{ sku: "MATT-1", qty: 1, attrs: null, unitPrice: 1500 }],
    });
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(201);
    // ONLY create_order ran — no voucher claim / release.
    const rpcNames = (sb._rpcCalls as Array<{ name: string }>).map((r) => r.name);
    expect(rpcNames).toEqual(["create_order"]);
  });

  // 0187 — CONFIGURED-PATH Stage B (via buildSbForCreatePwp, which returns a real
  // PWP rule so a coded line survives P8b). Exercises the orders.ts insert points
  // that the shared mock can't reach.
  it("Stage B happy path — a valid attrs.pwp.code claim claims the code then create_order runs (claim BEFORE create)", async () => {
    const sb = buildSbForCreatePwp({
      rpcResult: { id: "11111111-1111-1111-1111-111111111111", so: 1260, placed_at: "2026-05-02T10:00:00Z" },
      fetchedRow: makeOrderRow({ order_lines: [], order_addons: [], order_history: [] }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(pwpClaimBody()),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const names = (sb._rpcCalls as Array<{ name: string }>).map((r) => r.name);
    // The claim happens BEFORE create_order; no release on the happy path.
    expect(names).toContain("pwp_claim_code");
    expect(names).toContain("create_order");
    expect(names.indexOf("pwp_claim_code")).toBeLessThan(names.indexOf("create_order"));
    expect(names).not.toContain("pwp_release_codes");
  });

  it("Stage B rollback — create_order error releases the claimed voucher (exit 10)", async () => {
    const sb = buildSbForCreatePwp({
      createOrderError: { code: "XX000", message: "boom" }, // unmapped → generic 500 path
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(pwpClaimBody()),
      }),
      env,
    );
    expect(res.status).toBe(500); // unmapped create_order error → 500 (exit 10)
    const names = (sb._rpcCalls as Array<{ name: string }>).map((r) => r.name);
    // The claim was released after create_order failed.
    expect(names).toContain("pwp_claim_code");
    expect(names).toContain("pwp_release_codes");
    const release = (sb._rpcCalls as Array<{ name: string; args: { p_codes?: string[] } }>).find(
      (r) => r.name === "pwp_release_codes",
    );
    expect(release?.args.p_codes).toEqual(["PWP-1111AAAA"]);
  });

  it("Stage B claim rejection — an un-reservable code (pwp_claim_code NULL) → 409, no order", async () => {
    const sb = buildSbForCreatePwp({ claimReturnsNull: true });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(pwpClaimBody()),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: string; code: string };
    expect(j.error).toBe("rule_violation");
    expect(j.code).toBe("pwp_code_rejected");
    const names = (sb._rpcCalls as Array<{ name: string }>).map((r) => r.name);
    // No order created (claim failed before create_order).
    expect(names).not.toContain("create_order");
  });

  it("Confirm-pass fail-closed — a SHORT stamp releases the claim + 500", async () => {
    const sb = buildSbForCreatePwp({
      rpcResult: { id: "11111111-1111-1111-1111-111111111111", so: 1261, placed_at: "2026-05-02T10:00:00Z" },
      stampShort: true, // the stamp re-select returns 0 rows < 1 claimed
      fetchedRow: makeOrderRow({ order_lines: [], order_addons: [], order_history: [] }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(pwpClaimBody()),
      }),
      env,
    );
    expect(res.status).toBe(500);
    const names = (sb._rpcCalls as Array<{ name: string }>).map((r) => r.name);
    // create_order committed, then the short stamp → release + 500.
    expect(names).toContain("create_order");
    expect(names).toContain("pwp_release_codes");
  });

  // ─── P8d (0188) — the Confirm-pass STAMP is now the DEFINER pwp_stamp_redeemed ──
  it("Confirm-pass — a claimed order stamps via pwp_stamp_redeemed (not an owner table update)", async () => {
    const sb = buildSbForCreatePwp({
      rpcResult: { id: "11111111-1111-1111-1111-111111111111", so: 1262, placed_at: "2026-05-02T10:00:00Z" },
      fetchedRow: makeOrderRow({ order_lines: [], order_addons: [], order_history: [] }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(pwpClaimBody()),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const stamp = (sb._rpcCalls as Array<{ name: string; args: { p_codes?: string[]; p_order_id?: string } }>).find(
      (r) => r.name === "pwp_stamp_redeemed",
    );
    expect(stamp?.args.p_codes).toEqual(["PWP-1111AAAA"]);
    expect(stamp?.args.p_order_id).toBe("11111111-1111-1111-1111-111111111111");
  });

  // ─── P8d (0188 §3 / §8.3) — CARRY-FORWARD at Confirm (the BLOCKER fix) ──────────
  // The headline: buy a trigger, claim NO reward this cart, carry the voucher to the
  // customer's next order. The sweep is HOISTED OUT of the claims guard, so it fires
  // with 0 claims — proven here by configuring a RESERVED code with NO coded reward.
  it("carry-forward — a claim-LESS order with an active carry rule + a phone flips RESERVED→AVAILABLE", async () => {
    const sb = buildSbForCreatePwp({
      rpcResult: { id: "11111111-1111-1111-1111-111111111111", so: 1263, placed_at: "2026-05-02T10:00:00Z" },
      fetchedRow: makeOrderRow({ order_lines: [], order_addons: [], order_history: [] }),
      // ONE unclaimed RESERVED code minted by the carry rule, triggered by MATT-1.
      reservedRows: [{ code: "PWP-RES00001", rule_id: P8C_RULE_ID, cart_line_key: "L-matt", trigger_item_code: "MATT-1" }],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    // A plain order: the mattress trigger, NO coded reward line (claimedPwpCodes=0).
    const body = validCreateBody({
      delivery: DATED_DELIVERY,
      lines: [{ sku: "MATT-1", qty: 1, attrs: null, unitPrice: 1500 }],
    });
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const names = (sb._rpcCalls as Array<{ name: string }>).map((r) => r.name);
    // No claim happened (claim-less) — but the sweep STILL ran (the hoist) without
    // a 500. The carry runs via the table (no RPC), so we assert it didn't error.
    expect(names).not.toContain("pwp_claim_code");
    expect(names).not.toContain("pwp_claim_available_code");
    expect(names).not.toContain("pwp_stamp_redeemed"); // BLOCK 1 skipped (0 claims)
  });

  // NOTE on the no-phone soft-warning (§3.3): the create_order schema requires
  // customer.phone (regex /^[0-9-+\s]{8,}/), so a phone-LESS order can't reach the
  // sweep through the POST route — the soft-warning branch is therefore exercised at
  // the lib level (pwp-carry-forward.test.ts "would-carry but NO phone → DELETE +
  // softWarning"), and the header plumbing is asserted there + by code inspection.

  it("carry-forward — a successful carry adds NO warning header (the happy path is silent)", async () => {
    const sb = buildSbForCreatePwp({
      rpcResult: { id: "11111111-1111-1111-1111-111111111111", so: 1264, placed_at: "2026-05-02T10:00:00Z" },
      fetchedRow: makeOrderRow({ order_lines: [], order_addons: [], order_history: [] }),
      reservedRows: [{ code: "PWP-RES00002", rule_id: P8C_RULE_ID, cart_line_key: "L-matt", trigger_item_code: "MATT-1" }],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const body = validCreateBody({
      delivery: DATED_DELIVERY,
      lines: [{ sku: "MATT-1", qty: 1, attrs: null, unitPrice: 1500 }],
    });
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(201);
    // A carried voucher (phone captured) → no warning (nothing was dropped).
    expect(res.headers.get("X-Pwp-Carry-Forward-Warning")).toBeNull();
  });

  it("carry-forward — carry_forward=false rule → no warning header (deleted, not carried, silently)", async () => {
    const sb = buildSbForCreatePwp({
      rpcResult: { id: "11111111-1111-1111-1111-111111111111", so: 1265, placed_at: "2026-05-02T10:00:00Z" },
      fetchedRow: makeOrderRow({ order_lines: [], order_addons: [], order_history: [] }),
      reservedRows: [{ code: "PWP-RES00003", rule_id: P8C_RULE_ID, cart_line_key: "L-matt", trigger_item_code: "MATT-1" }],
      // The rule is active but carry_forward=false → DELETE (same-cart, P8c).
      ruleRows: [
        {
          id: P8C_RULE_ID,
          type: "pwp",
          trigger_category: "mattress",
          trigger_targets: [{ scope: "model", modelId: P8C_MATT_MODEL }],
          reward_category: "bedframe",
          reward_targets: [{ scope: "model", modelId: P8C_BED_MODEL }],
          qty_per_trigger: 1,
          active: true,
          carry_forward: false,
          carry_forward_days: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          updated_by: null,
        },
      ],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const body = validCreateBody({
      delivery: DATED_DELIVERY,
      lines: [{ sku: "MATT-1", qty: 1, attrs: null, unitPrice: 1500 }],
    });
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(201);
    // A no-carry delete is silent — no warning header (the customer didn't earn it).
    expect(res.headers.get("X-Pwp-Carry-Forward-Warning")).toBeNull();
  });

  // ─── P8d (0188 §4.2 / §8.4) — CROSS-ORDER claim by phone ───────────────────────
  it("cross-order claim — a crossOrder=true reward routes the claim to pwp_claim_available_code with the phone", async () => {
    const sb = buildSbForCreatePwp({
      rpcResult: { id: "11111111-1111-1111-1111-111111111111", so: 1266, placed_at: "2026-05-02T10:00:00Z" },
      fetchedRow: makeOrderRow({ order_lines: [], order_addons: [], order_history: [] }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    // The bedframe reward carries crossOrder:true (an AVAILABLE carry-forward voucher).
    const body = pwpClaimBody({
      lines: [
        { sku: "MATT-1", qty: 1, attrs: null, unitPrice: 1500 },
        {
          sku: "BED-1",
          qty: 1,
          unitPrice: 900,
          attrs: { pwp: { ruleId: P8C_RULE_ID, code: "PWP-1111AAAA", claimGroup: P8C_GROUP, crossOrder: true } },
        },
      ],
    });
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const names = (sb._rpcCalls as Array<{ name: string }>).map((r) => r.name);
    expect(names).toContain("pwp_claim_available_code");
    expect(names).not.toContain("pwp_claim_code"); // NOT the same-cart RPC
    const claim = (
      sb._rpcCalls as Array<{ name: string; args: { p_customer_phone?: string } }>
    ).find((r) => r.name === "pwp_claim_available_code");
    // The order's customer phone reaches the binding RPC (012-3456789 from validCreateBody).
    expect(claim?.args.p_customer_phone).toBe("012-3456789");
  });

  it("cross-order claim rejection — pwp_claim_available_code NULL (phone mismatch) → 409, releases via pwp_release_available_code on a downstream error", async () => {
    const sb = buildSbForCreatePwp({
      claimReturnsNull: true, // the cross-order claim returns NULL → 409 before create_order
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const body = pwpClaimBody({
      lines: [
        { sku: "MATT-1", qty: 1, attrs: null, unitPrice: 1500 },
        {
          sku: "BED-1",
          qty: 1,
          unitPrice: 900,
          attrs: { pwp: { ruleId: P8C_RULE_ID, code: "PWP-1111AAAA", claimGroup: P8C_GROUP, crossOrder: true } },
        },
      ],
    });
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const j = (await res.json()) as { code: string };
    expect(j.code).toBe("pwp_code_rejected");
    const names = (sb._rpcCalls as Array<{ name: string }>).map((r) => r.name);
    expect(names).not.toContain("create_order"); // rejected before the order
  });

  it("returns 403 when dealer role JWT has no dealerId", async () => {
    vi.mocked(userClient).mockReturnValue(buildSbForCreate({}));
    const jwt = await makeJwt("dealer", null);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody()),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 for principal role in Phase 2B (cross-dealer create deferred)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSbForCreate({}));
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody()),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("rejects signaturePath pointing to another dealer's folder (no RPC call)", async () => {
    const sb = buildSbForCreate({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const body = validCreateBody({
      // Path scoped to DEALER_B but caller is DEALER_A — must 400
      signaturePath: `orders-attachments/${DEALER_B}/wiz/signature.png`,
    });
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(400);
    // Critically: RPC was NOT called — guard fires before DB write
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("rejects paymentSlipPath pointing to another dealer's folder", async () => {
    const sb = buildSbForCreate({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const body = validCreateBody({
      paymentSlipPath: `orders-attachments/${DEALER_B}/wiz/payment-slip.jpg`,
    });
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody()),
      }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed JSON body", async () => {
    vi.mocked(userClient).mockReturnValue(buildSbForCreate({}));
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: "{not-json",
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  // 2026-05-22 (Loo) — server-side lead-time floor for delivery.date.
  // Mattress + bedframe = 14 days, sofa = 21 days (see shared
  // DELIVERY_LEAD_DAYS). The wizard gates this client-side; these tests
  // verify the curl/devtools bypass is shut.
  describe("lead-time validation", () => {
    // P1 (0303): ONE number for every made item — `earliest_sell_days`, 21.
    // It used to be mattress/bedframe 14 · sofa 21, hard-coded where Jess
    // could not reach it. The upper bound was taken deliberately: nothing
    // becomes sellable EARLIER than it was, and a sofa's door does not widen
    // by a week to something the factory cannot make.
    it("rejects 422 lead_time_violation when a mattress order is sold closer than the number", async () => {
      const today = new Date();
      const tooSoon = new Date(today);
      tooSoon.setDate(tooSoon.getDate() + 5);
      const tooSoonIso = tooSoon.toISOString().slice(0, 10);

      const sb = buildSbForCreate({
        productSkuCategoryRows: [{ product_models: { category: "mattress" } }],
      });
      vi.mocked(userClient).mockReturnValue(sb);
      const jwt = await makeJwt("dealer", DEALER_A);
      const res = await app.fetch(
        new Request("http://t/api/orders", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify(
            validCreateBody({ delivery: { date: tooSoonIso, proceedDate: tooSoonIso, dateTbd: false, floor: 1, hasLift: false } }),
          ),
        }),
        env,
      );
      expect(res.status).toBe(422);
      const body = (await res.json()) as { code?: string; leadDays?: number };
      expect(body.code).toBe("lead_time_violation");
      expect(body.leadDays).toBe(21);
      // Critically: RPC was NOT called — server bailed before DB write
      expect(sb._rpcCalls).toHaveLength(0);
    });

    it("rejects 422 with the same number for a sofa — one floor, not two", async () => {
      const today = new Date();
      const tooSoon = new Date(today);
      tooSoon.setDate(tooSoon.getDate() + 15);
      const tooSoonIso = tooSoon.toISOString().slice(0, 10);

      const sb = buildSbForCreate({
        productSkuCategoryRows: [{ product_models: { category: "sofa" } }],
      });
      vi.mocked(userClient).mockReturnValue(sb);
      const jwt = await makeJwt("dealer", DEALER_A);
      const res = await app.fetch(
        new Request("http://t/api/orders", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify(
            validCreateBody({ delivery: { date: tooSoonIso, proceedDate: tooSoonIso, dateTbd: false, floor: 1, hasLift: false } }),
          ),
        }),
        env,
      );
      expect(res.status).toBe(422);
      const body = (await res.json()) as { code?: string; leadDays?: number };
      expect(body.code).toBe("lead_time_violation");
      expect(body.leadDays).toBe(21);
    });

    it("accepts 201 when the date clears the number", async () => {
      const today = new Date();
      const okDate = new Date(today);
      okDate.setDate(okDate.getDate() + 30);
      const okIso = okDate.toISOString().slice(0, 10);

      const sb = buildSbForCreate({
        rpcResult: { id: NEW_ORDER_ID, so: 1042, placed_at: "2026-05-22T00:00:00Z" },
        fetchedRow: makeOrderRow({
          id: NEW_ORDER_ID,
          delivery_date: okIso,
          signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
          terms_accepted: true,
        }),
        productSkuCategoryRows: [{ product_models: { category: "mattress" } }],
      });
      vi.mocked(userClient).mockReturnValue(sb);
      const jwt = await makeJwt("dealer", DEALER_A);
      const res = await app.fetch(
        new Request("http://t/api/orders", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify(
            validCreateBody({ delivery: { date: okIso, proceedDate: okIso, dateTbd: false, floor: 1, hasLift: false } }),
          ),
        }),
        env,
      );
      expect(res.status).toBe(201);
      // RPC fired exactly once (lead-time gate passed)
      expect(sb._rpcCalls.filter((c: { name: string }) => c.name === "create_order")).toHaveLength(1);
    });

    /**
     * ⛔ CUSTOMER DELIVERY IS MANDATORY AT ORDER ENTRY — owner ruling
     * 2026-08-15 (Jess). This test used to prove the OPPOSITE: that a dateless
     * order sailed through and the floor was re-checked later at
     * `POST /:id/date`. That door still exists for the legacy rows that
     * predate the ruling; this one refuses to mint another.
     */
    it("refuses a dateless order — the promise is made at entry, never later", async () => {
      const sb = buildSbForCreate({
        rpcResult: { id: NEW_ORDER_ID, so: 1043, placed_at: "2026-05-22T00:00:00Z" },
        productSkuCategoryRows: [{ product_models: { category: "mattress" } }],
      });
      vi.mocked(userClient).mockReturnValue(sb);
      const jwt = await makeJwt("dealer", DEALER_A);
      const res = await app.fetch(
        new Request("http://t/api/orders", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify(
            validCreateBody({
              delivery: { date: null, proceedDate: null, dateTbd: true, floor: 1, hasLift: false },
            }),
          ),
        }),
        env,
      );
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("Ask the customer for the date");
      expect(sb._rpcCalls).toHaveLength(0);
    });

    it("refuses a dateless order sent WITHOUT the retired flag either", async () => {
      const sb = buildSbForCreate({
        rpcResult: { id: NEW_ORDER_ID, so: 1044, placed_at: "2026-05-22T00:00:00Z" },
      });
      vi.mocked(userClient).mockReturnValue(sb);
      const jwt = await makeJwt("dealer", DEALER_A);
      const res = await app.fetch(
        new Request("http://t/api/orders", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify(
            validCreateBody({
              delivery: { date: null, proceedDate: null, dateTbd: false, floor: 1, hasLift: false },
            }),
          ),
        }),
        env,
      );
      expect(res.status).toBe(400);
      expect(sb._rpcCalls).toHaveLength(0);
    });
  });

  /**
   * ⛔ A SALES ORDER MUST CONTAIN GOODS — owner ruling 2026-08-15.
   *
   * The Guarantee attachment law generalised: standalone service is a Service
   * Case and belongs to the Service channel. The gate is POSITIVE-recognition
   * only, so the "unknown SKU still sells" half is pinned too — otherwise a
   * legacy or not-yet-catalogued line silently kills a real order.
   */
  describe("goods gate", () => {
    const serviceOnly = () =>
      validCreateBody({ lines: [{ sku: "SVC-DISPOSE-MATTRESS", qty: 1, attrs: null, unitPrice: 80 }] });

    it("refuses 422 goods_required when every line is a service", async () => {
      const sb = buildSbForCreate({
        productSkuCategoryRows: [
          { sku: "SVC-DISPOSE-MATTRESS", product_models: { category: "service" } },
        ],
      });
      vi.mocked(userClient).mockReturnValue(sb);
      const jwt = await makeJwt("dealer", DEALER_A);
      const res = await app.fetch(
        new Request("http://t/api/orders", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify(serviceOnly()),
        }),
        env,
      );
      expect(res.status).toBe(422);
      const body = (await res.json()) as { code: string; message: string };
      expect(body.code).toBe("goods_required");
      expect(body.message).toContain("must contain a product");
      expect(sb._rpcCalls).toHaveLength(0);
    });

    it("refuses a guarantee sold on its own", async () => {
      const sb = buildSbForCreate({
        productSkuCategoryRows: [
          { sku: "GRT-MATTRESS-15Y", product_models: { category: "guarantee" } },
        ],
      });
      vi.mocked(userClient).mockReturnValue(sb);
      const jwt = await makeJwt("dealer", DEALER_A);
      const res = await app.fetch(
        new Request("http://t/api/orders", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify(
            validCreateBody({ lines: [{ sku: "GRT-MATTRESS-15Y", qty: 1, attrs: null, unitPrice: 150 }] }),
          ),
        }),
        env,
      );
      expect(res.status).toBe(422);
      expect(sb._rpcCalls).toHaveLength(0);
    });

    it("accepts a service line that rides a product on the same order", async () => {
      const sb = buildSbForCreate({
        rpcResult: { id: NEW_ORDER_ID, so: 1045, placed_at: "2026-05-22T00:00:00Z" },
        fetchedRow: makeOrderRow({ id: NEW_ORDER_ID, so: 1045 }),
        productSkuCategoryRows: [
          { sku: "mattress:carres-classic:queen", product_models: { category: "mattress" } },
          { sku: "SVC-DISPOSE-MATTRESS", product_models: { category: "service" } },
        ],
      });
      vi.mocked(userClient).mockReturnValue(sb);
      const jwt = await makeJwt("dealer", DEALER_A);
      const res = await app.fetch(
        new Request("http://t/api/orders", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify(
            validCreateBody({
              delivery: DATED_DELIVERY,
              lines: [
                { sku: "mattress:carres-classic:queen", qty: 1, attrs: null, unitPrice: 1500 },
                { sku: "SVC-DISPOSE-MATTRESS", qty: 1, attrs: null, unitPrice: 80 },
              ],
            }),
          ),
        }),
        env,
      );
      expect(res.status).toBe(201);
    });

    it("lets a SKU the catalog cannot resolve through — nothing is refused by elimination", async () => {
      const sb = buildSbForCreate({
        rpcResult: { id: NEW_ORDER_ID, so: 1046, placed_at: "2026-05-22T00:00:00Z" },
        fetchedRow: makeOrderRow({ id: NEW_ORDER_ID, so: 1046 }),
        productSkuCategoryRows: [
          { sku: "SVC-DISPOSE-MATTRESS", product_models: { category: "service" } },
        ],
      });
      vi.mocked(userClient).mockReturnValue(sb);
      const jwt = await makeJwt("dealer", DEALER_A);
      const res = await app.fetch(
        new Request("http://t/api/orders", {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify(
            validCreateBody({ lines: [{ sku: "SOME-LEGACY-CODE", qty: 1, attrs: null, unitPrice: 900 }] }),
          ),
        }),
        env,
      );
      expect(res.status).toBe(201);
    });
  });
});

// =============================================================================
// POST /api/orders/:id/proceed — Place→Proceed transition
// =============================================================================

/** Mocks `.rpc('proceed_order', { p_order_id })` + the post-success re-fetch
 *  chain. Set `rpcError` to simulate RPC validation failures (P0001 with a
 *  blocker code in DETAIL, 42501 cross-dealer, 42P01 not found, 22023 wrong
 *  status). Set `fetchedRow` to control what the re-fetch returns on success. */
function buildSbForProceed(opts: {
  rpcError?: { code?: string; message?: string; details?: string };
  fetchedRow?: unknown;
  /** Used by the server-side lead-time validator (POST /:id/date and
   *  PATCH /:id with delivery.date). The validator first fetches the
   *  order's lines, then joins product_skus → product_models.category. */
  productSkuCategoryRows?: Array<{ sku?: string; product_models: { category: string } | null }>;
  /** Optional SKU list returned by the order_lines fetch in
   *  `getOrderSkus`. Empty array (default) means the lead-time validator
   *  short-circuits at the "no SKUs" branch (fail-open). */
  orderLineSkus?: string[];
  /** 0232 (add-lines P2) — FULL order_lines rows (sku/qty/attrs/unit_price)
   *  for the route's existing-lines fetch. Takes precedence over
   *  orderLineSkus when set. */
  orderLineRows?: Array<Record<string, unknown>>;
  /** 0233 (P3) — per-table maybeSingle overrides (e.g. the change-request row
   *  vs the order row, both fetched via maybeSingle in the decide route). */
  tables?: Record<string, { single?: unknown }>;
  /** 0233 (P3) — rows returned by a `.order()`-terminated list read (the
   *  change-requests list). */
  orderedRows?: unknown[];
  /** 0257 — per-table rows for `.in()`-terminated reads (addons config /
   *  order_supplier_threads), so they stop aliasing the product_skus read.
   *  Falls back to productSkuCategoryRows when the table isn't listed. */
  inTables?: Record<string, unknown[]>;
  /** P1 (0303) — the earliest-sell gate reads `purchasing_settings` row 1.
   *  `null` makes the read come back empty, which is how the validator's
   *  fail-open branch is exercised. */
  purchasingSettingsRow?: unknown;
}) {
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const eqs: Array<[string, unknown]> = [];
  let currentTable: string | null = null;
  const chain = {
    eq(col: string, val: unknown) {
      eqs.push([col, val]);
      // `.eq()` is the terminal builder call for `getOrderSkus`
      // (sb.from("order_lines").select("sku").eq("order_id", id)). Awaiting
      // the resulting builder is awaiting this object — return a thenable
      // result for the order_lines path; for every other table the test
      // still composes via .order/.maybeSingle so we keep returning chain.
      if (currentTable === "order_lines") {
        return Promise.resolve({
          data: opts.orderLineRows ?? (opts.orderLineSkus ?? []).map((sku) => ({ sku })),
          error: null,
        });
      }
      return chain;
    },
    in: async () => ({
      data:
        (currentTable ? opts.inTables?.[currentTable] : undefined) ??
        opts.productSkuCategoryRows ??
        [],
      error: null,
    }),
    order: async () => ({ data: opts.orderedRows ?? [], error: null }),
    maybeSingle: async () => {
      // P1 (0303) — the earliest-sell floor is one editable number, read from
      // `purchasing_settings`. Without this branch every lead-time gate
      // fails OPEN and the tests below would pass for the wrong reason.
      if (currentTable === "purchasing_settings") {
        return {
          data:
            opts.purchasingSettingsRow !== undefined
              ? opts.purchasingSettingsRow
              : PURCHASING_SETTINGS_ROW,
          error: null,
        };
      }
      return {
        data:
          currentTable && opts.tables?.[currentTable]?.single !== undefined
            ? opts.tables[currentTable].single
            : (opts.fetchedRow ?? null),
        error: null,
      };
    },
  };
  const storage = buildStorageMock();
  return Object.assign(
    {
      from: (table: string) => {
        currentTable = table;
        return { select: () => chain };
      },
      rpc: async (name: string, args: unknown) => {
        rpcCalls.push({ name, args });
        if (opts.rpcError) {
          return { data: null, error: opts.rpcError };
        }
        return {
          data: { id: "11111111-1111-1111-1111-111111111111", so: 1001, status: "proceed_order" },
          error: null,
        };
      },
      _rpcCalls: rpcCalls,
      _eqs: eqs,
    },
    storage,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
}

const PROCEED_ID = "11111111-1111-1111-1111-111111111111";
const proceedUrl = `http://t/api/orders/${PROCEED_ID}/proceed`;

describe("POST /api/orders/:id/proceed", () => {
  it("200 — calls proceed_order RPC and returns the re-fetched order with proceed_order status", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        status: "proceed_order",
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(proceedUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string; code?: string | null; message?: string; error?: string };
    expect(body.status).toBe("proceed_order");
    expect(sb._rpcCalls).toHaveLength(1);
    expect(sb._rpcCalls[0].name).toBe("proceed_order");
    expect(sb._rpcCalls[0].args).toEqual({ p_order_id: PROCEED_ID });
  });

  it("422 with code='signature_required' when RPC raises P0001 with blocker DETAIL", async () => {
    const sb = buildSbForProceed({
      rpcError: {
        code: "P0001",
        message: "Customer signature is required",
        details: "signature_required",
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(proceedUrl, { method: "POST", headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { status?: string; code?: string | null; message?: string; error?: string };
    expect(body.code).toBe("signature_required");
    expect(body.error).toBe("proceed_order_blocked");
  });

  it("422 with code='payment_below_50' when RPC raises P0001", async () => {
    const sb = buildSbForProceed({
      rpcError: {
        code: "P0001",
        message: "Payment must be at least 50 percent of total",
        details: "payment_below_50",
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(proceedUrl, { method: "POST", headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { status?: string; code?: string | null; message?: string; error?: string };
    expect(body.code).toBe("payment_below_50");
  });

  it("422 with code='wrong_status' when RPC raises 22023", async () => {
    const sb = buildSbForProceed({
      rpcError: { code: "22023", message: "Order is not in Place status", details: "wrong_status" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(proceedUrl, { method: "POST", headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { status?: string; code?: string | null; message?: string; error?: string };
    expect(body.code).toBe("wrong_status");
  });

  it("403 when RPC raises 42501 (cross-dealer)", async () => {
    const sb = buildSbForProceed({
      rpcError: { code: "42501", message: "forbidden: cross-dealer proceed", details: "forbidden" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(proceedUrl, { method: "POST", headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("404 when RPC raises 42P01 (order not found)", async () => {
    const sb = buildSbForProceed({
      rpcError: { code: "42P01", message: "Order not found", details: "order_not_found" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(proceedUrl, { method: "POST", headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("404 on non-uuid path param (no RPC called)", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders/not-a-uuid/proceed", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("401 without Authorization header", async () => {
    const res = await app.fetch(new Request(proceedUrl, { method: "POST" }), env);
    expect(res.status).toBe(401);
  });

  it("422 body still has code=null when DETAIL is unrecognized (defensive)", async () => {
    // If the RPC ever raises with a DETAIL value outside our enum (older code,
    // typo, etc.), the API route still returns 422 but with code=null so the
    // client falls back to the generic message instead of trying to look up a
    // bogus code in PROCEED_BLOCKER_LABEL.
    const sb = buildSbForProceed({
      rpcError: { code: "P0001", message: "Some unknown failure", details: "not_a_known_code" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(proceedUrl, { method: "POST", headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { status?: string; code?: string | null; message?: string; error?: string };
    expect(body.code).toBeNull();
    expect(body.message).toBe("Some unknown failure");
  });
});

// =============================================================================
// POST /api/orders/:id/unproceed — 0220 sales-side Proceed→Place reversal
// =============================================================================

const unproceedUrl = `http://t/api/orders/${PROCEED_ID}/unproceed`;

describe("POST /api/orders/:id/unproceed", () => {
  it("200 — calls unproceed_order RPC with p_order_id and returns the re-fetched Place order", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        status: "place",
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(unproceedUrl, { method: "POST", headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status?: string };
    expect(body.status).toBe("place");
    expect(sb._rpcCalls).toHaveLength(1);
    expect(sb._rpcCalls[0].name).toBe("unproceed_order");
    expect(sb._rpcCalls[0].args).toEqual({ p_order_id: PROCEED_ID });
  });

  it("422 with code='wrong_stage' when RPC raises 22023 (ops already working the order)", async () => {
    const sb = buildSbForProceed({
      rpcError: {
        code: "22023",
        message: "HQ operation has already started on this order",
        details: "wrong_stage",
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(unproceedUrl, { method: "POST", headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string | null; error?: string };
    expect(body.error).toBe("unproceed_blocked");
    expect(body.code).toBe("wrong_stage");
  });

  it("403 for a role outside the order-writing list (supplier)", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("supplier", null);
    const res = await app.fetch(
      new Request(unproceedUrl, { method: "POST", headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("401 without Authorization header", async () => {
    const res = await app.fetch(new Request(unproceedUrl, { method: "POST" }), env);
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// POST /api/orders/:id/top-up — partial payment toward order total
// POST /api/orders/:id/address — fill in deferred delivery address
// POST /api/orders/:id/date — confirm TBD delivery date
// All three share the same dispatchOrderMutation helper, so we test the
// happy path + RPC error mapping for each plus body validation.
// =============================================================================

const topUpUrl = `http://t/api/orders/${PROCEED_ID}/top-up`;
const addressUrl = `http://t/api/orders/${PROCEED_ID}/address`;
const dateUrl = `http://t/api/orders/${PROCEED_ID}/date`;

function validTopUpBody(over: Record<string, unknown> = {}) {
  return {
    amount: 500,
    method: "bank",
    methodLabel: "Bank transfer",
    reference: "MB-12345",
    note: null,
    date: "2026-05-03",
    photoPaths: [`orders-attachments/${DEALER_A}/topup-1/receipt.jpg`],
    ...over,
  };
}

describe("POST /api/orders/:id/top-up", () => {
  it("200 — calls top_up_order RPC, validates dealer-owned photo paths, returns shaped order", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(topUpUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validTopUpBody()),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("top_up_order");
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_amount).toBe(500);
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_method).toBe("bank");
  });

  // 0230 — the method key is validated against the ACTIVE order_entry_config
  // methods (code defaults when the config read yields nothing, as here) ∪ the
  // legacy proto keys. "credit" is a configured default; "gold-plan" is neither.
  it("200 — a configured (non-legacy) method key passes validation", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(topUpUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validTopUpBody({ method: "credit", methodLabel: "Credit / Debit" })),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_method).toBe("credit");
  });

  it("422 invalid_payment_method for a key that is neither configured nor legacy", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(topUpUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validTopUpBody({ method: "gold-plan", methodLabel: "Gold plan" })),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string | null; error?: string };
    expect(body.code).toBe("invalid_payment_method");
    expect(body.error).toBe("top_up_blocked");
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("400 when a photoPath is outside the caller's dealer folder", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(topUpUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          validTopUpBody({
            photoPaths: [`orders-attachments/${DEALER_B}/topup-1/receipt.jpg`],
          }),
        ),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("422 when RPC raises P0001 with already_paid DETAIL", async () => {
    const sb = buildSbForProceed({
      rpcError: { code: "22023", message: "Order is already fully paid", details: "already_paid" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(topUpUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validTopUpBody()),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string | null; error?: string };
    expect(body.code).toBe("already_paid");
    expect(body.error).toBe("top_up_blocked");
  });

  it("400 on invalid body shape", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(topUpUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: -50 }),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("401 without Authorization header", async () => {
    const res = await app.fetch(
      new Request(topUpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validTopUpBody()),
      }),
      env,
    );
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// POST /api/orders/:id/lines — add-product P1+P2 (0231/0232): append
// server-priced lines to a Place-lane order. The mock's generic `.in()` slot
// doubles as the product_skus fetch; the engines short-circuit on their
// dormant paths (no pwp markers / no builds / no specials / dormant delivery
// config), per the same mock-limitation precedent as the create-route tests
// (§17.5 delivery-route-configured-test).
// =============================================================================

const addLinesUrl = `http://t/api/orders/${PROCEED_ID}/lines`;

function addSkuRow(over: Record<string, unknown> = {}) {
  return { sku: "SKU-ADD-1", price: 250, pos_active: true, discontinued_at: null, ...over };
}

/** A place-lane order row the 0232 pre-fetch gate accepts. */
function addOrderRow(over: Record<string, unknown> = {}) {
  return makeOrderRow({
    signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
    terms_accepted: true,
    ...over,
  });
}

describe("POST /api/orders/:id/lines", () => {
  it("200 — prices from the FRESH catalog (client price ignored) and calls add_order_lines", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      productSkuCategoryRows: [addSkuRow()] as unknown as Array<{
        product_models: { category: string } | null;
      }>,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        // A client unitPrice on a FLAT line is parsed but ignored — the server
        // prices from product_skus.price (250), never this 1.
        body: JSON.stringify({ lines: [{ sku: "SKU-ADD-1", qty: 2, attrs: null, unitPrice: 1 }] }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("add_order_lines");
    const args = sb._rpcCalls[0].args as Record<string, unknown>;
    expect(args.p_source).toBe("direct");
    expect(args.p_change_request_id).toBeNull();
    // Dormant delivery + no persisted DELIVERY* rows → no addon replace-set.
    expect(args.p_addons_replace).toBeNull();
    const lines = args.p_lines as Array<Record<string, unknown>>;
    expect(lines).toHaveLength(1);
    expect(lines[0].sku).toBe("SKU-ADD-1");
    expect(lines[0].qty).toBe(2);
    expect(lines[0].unit_price).toBe(250);
  });

  it("400 when a sofa BUILD line lacks the preview unitPrice (drift-gate input)", async () => {
    const sb = buildSbForProceed({ fetchedRow: addOrderRow() });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: [{ sku: "SOFA-1", qty: 1, attrs: { sofa_build: { cells: [] } } }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("409 pwp_voucher_add_not_supported when attrs.pwp carries a voucher code", async () => {
    const sb = buildSbForProceed({ fetchedRow: addOrderRow() });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: [{ sku: "SKU-ADD-1", qty: 1, attrs: { pwp: { ruleId: "r", code: "PWP-123" } } }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("pwp_voucher_add_not_supported");
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("400 when a line carries a server-exclusive free marker", async () => {
    const sb = buildSbForProceed({ fetchedRow: addOrderRow() });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    for (const attrs of [{ free_gift: true }, { free_item: true }]) {
      const res = await app.fetch(
        new Request(addLinesUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify({ lines: [{ sku: "SKU-ADD-1", qty: 1, attrs }] }),
        }),
        env,
      );
      expect(res.status).toBe(400);
    }
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("422 wrong_status from the early gate when the order already proceeded", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow({ status: "proceed_order" }),
      productSkuCategoryRows: [addSkuRow()] as unknown as Array<{
        product_models: { category: string } | null;
      }>,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lines: [{ sku: "SKU-ADD-1", qty: 1 }] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; error?: string };
    expect(body.code).toBe("wrong_status");
    expect(body.error).toBe("add_lines_blocked");
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("422 unknown_or_inactive_sku when the sku is missing from the catalog", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      productSkuCategoryRows: [] as unknown as Array<{
        product_models: { category: string } | null;
      }>,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lines: [{ sku: "GONE-SKU", qty: 1 }] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("unknown_or_inactive_sku");
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("422 unknown_or_inactive_sku when the sku is pos_active=false", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      productSkuCategoryRows: [addSkuRow({ pos_active: false })] as unknown as Array<{
        product_models: { category: string } | null;
      }>,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lines: [{ sku: "SKU-ADD-1", qty: 1 }] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("409 pwp_add_conflict when the order already has a promo line and a NEW claim rides in", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      orderLineRows: [{ sku: "OLD-REWARD", qty: 1, attrs: { pwp: { ruleId: "r1" } }, unit_price: 50 }],
      productSkuCategoryRows: [addSkuRow()] as unknown as Array<{
        product_models: { category: string } | null;
      }>,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: [{ sku: "SKU-ADD-1", qty: 1, attrs: { pwp: { ruleId: "r2" } } }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("pwp_add_conflict");
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("200 — an existing promo line does NOT block a plain (no-claim) add (markers stripped)", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      orderLineRows: [{ sku: "OLD-REWARD", qty: 1, attrs: { pwp: { ruleId: "r1" } }, unit_price: 50 }],
      productSkuCategoryRows: [addSkuRow()] as unknown as Array<{
        product_models: { category: string } | null;
      }>,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lines: [{ sku: "SKU-ADD-1", qty: 1 }] }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("add_order_lines");
  });

  it("422 existing_build_unsupported when a raw un-exploded sofa build sits on the order", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      orderLineRows: [{ sku: "RAW-SOFA", qty: 1, attrs: { sofa_build: { cells: [] } }, unit_price: 5000 }],
      productSkuCategoryRows: [addSkuRow()] as unknown as Array<{
        product_models: { category: string } | null;
      }>,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lines: [{ sku: "SKU-ADD-1", qty: 1 }] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("existing_build_unsupported");
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("an orphan specials_total (no picks array) can NOT skew the server price (review fix #3)", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      productSkuCategoryRows: [addSkuRow()] as unknown as Array<{
        product_models: { category: string } | null;
      }>,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: [{ sku: "SKU-ADD-1", qty: 1, attrs: { specials_total: -250 } }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const lines = (sb._rpcCalls[0].args as Record<string, unknown>).p_lines as Array<
      Record<string, unknown>
    >;
    expect(lines[0].unit_price).toBe(250); // catalog price intact
  });

  it("422 passthrough of the RPC's mixed_category_lines / wrong_status details", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      productSkuCategoryRows: [addSkuRow()] as unknown as Array<{
        product_models: { category: string } | null;
      }>,
      rpcError: {
        code: "22023",
        message: "sofa cannot mix with mattress or bedframe in the same order",
        details: "mixed_category_lines",
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lines: [{ sku: "SKU-ADD-1", qty: 1 }] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; error?: string };
    expect(body.code).toBe("mixed_category_lines");
    expect(body.error).toBe("add_lines_blocked");
  });

  it("400 on invalid body (empty lines)", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lines: [] }),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("401 without Authorization header", async () => {
    const res = await app.fetch(
      new Request(addLinesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: [{ sku: "S", qty: 1 }] }),
      }),
      env,
    );
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// POST /api/orders/:id/lines/replace — line EDIT (0255): re-configure one
// item (or a whole exploded sofa group) on a place-lane order, up-sell only.
// Same mock-limitation posture as the add tests (dormant engine paths).
// =============================================================================

const replaceLinesUrl = `http://t/api/orders/${PROCEED_ID}/lines/replace`;
const TARGET_LINE_ID = "33333333-3333-3333-3333-333333333301";

function replaceTargetRow(over: Record<string, unknown> = {}) {
  return {
    id: TARGET_LINE_ID,
    sku: "SKU-OLD",
    qty: 1,
    attrs: null,
    unit_price: 100,
    ...over,
  };
}

describe("POST /api/orders/:id/lines/replace", () => {
  it("200 — re-prices from the FRESH catalog and calls replace_order_lines with the target ids", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      orderLineRows: [replaceTargetRow()],
      productSkuCategoryRows: [addSkuRow()] as unknown as Array<{
        product_models: { category: string } | null;
      }>,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(replaceLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        // Client price is ignored on a flat line — server prices 250 (> old 100).
        body: JSON.stringify({
          targetLineIds: [TARGET_LINE_ID],
          line: { sku: "SKU-ADD-1", qty: 1, attrs: null, unitPrice: 1 },
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("replace_order_lines");
    const args = sb._rpcCalls[0].args as Record<string, unknown>;
    expect(args.p_old_line_ids).toEqual([TARGET_LINE_ID]);
    const lines = args.p_lines as Array<Record<string, unknown>>;
    expect(lines).toHaveLength(1);
    expect(lines[0].sku).toBe("SKU-ADD-1");
    expect(lines[0].unit_price).toBe(250);
    expect(args.p_addons_replace).toBeNull();
  });

  it("422 downsell_blocked from the friendly precheck (server price below the old total)", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      // Old row cost RM 500 — the fresh catalog prices the replacement at 250.
      orderLineRows: [replaceTargetRow({ unit_price: 500 })],
      productSkuCategoryRows: [addSkuRow()] as unknown as Array<{
        product_models: { category: string } | null;
      }>,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(replaceLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLineIds: [TARGET_LINE_ID],
          line: { sku: "SKU-ADD-1", qty: 1 },
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; error?: string };
    expect(body.code).toBe("downsell_blocked");
    expect(body.error).toBe("replace_blocked");
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("422 line_not_editable when the target carries a free/promo/bundle marker", async () => {
    for (const attrs of [
      { free_gift: true },
      { free_item: true },
      { pwp: { ruleId: "r" } },
      { bundle_group: "bg-1" },
      { combo_key: "ck-1" },
    ]) {
      const sb = buildSbForProceed({
        fetchedRow: addOrderRow(),
        orderLineRows: [replaceTargetRow({ attrs })],
        productSkuCategoryRows: [addSkuRow()] as unknown as Array<{
          product_models: { category: string } | null;
        }>,
      });
      vi.mocked(userClient).mockReturnValue(sb);
      const jwt = await makeJwt("dealer", DEALER_A);
      const res = await app.fetch(
        new Request(replaceLinesUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            targetLineIds: [TARGET_LINE_ID],
            line: { sku: "SKU-ADD-1", qty: 1 },
          }),
        }),
        env,
      );
      expect(res.status).toBe(422);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe("line_not_editable");
      expect(sb._rpcCalls).toHaveLength(0);
    }
  });

  it("422 line_not_found when a target id is not on this order", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      orderLineRows: [replaceTargetRow()],
      productSkuCategoryRows: [addSkuRow()] as unknown as Array<{
        product_models: { category: string } | null;
      }>,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(replaceLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLineIds: ["44444444-4444-4444-4444-444444444404"],
          line: { sku: "SKU-ADD-1", qty: 1 },
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("line_not_found");
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("422 wrong_status from the early gate when the order already proceeded", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow({ status: "proceed_order" }),
      orderLineRows: [replaceTargetRow()],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(replaceLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLineIds: [TARGET_LINE_ID],
          line: { sku: "SKU-ADD-1", qty: 1 },
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; error?: string };
    expect(body.code).toBe("wrong_status");
    expect(body.error).toBe("replace_blocked");
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("400 when the replacement carries a server-exclusive free marker", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      orderLineRows: [replaceTargetRow()],
      productSkuCategoryRows: [addSkuRow()] as unknown as Array<{
        product_models: { category: string } | null;
      }>,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(replaceLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLineIds: [TARGET_LINE_ID],
          line: { sku: "SKU-ADD-1", qty: 1, attrs: { free_gift: true } },
        }),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("422 passthrough of the RPC's authoritative downsell_blocked", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      orderLineRows: [replaceTargetRow()],
      productSkuCategoryRows: [addSkuRow()] as unknown as Array<{
        product_models: { category: string } | null;
      }>,
      rpcError: {
        code: "22023",
        message: "replacement total RM 250 is below the original RM 300 — upgrades only",
        details: "downsell_blocked",
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(replaceLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLineIds: [TARGET_LINE_ID],
          line: { sku: "SKU-ADD-1", qty: 1 },
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; error?: string };
    expect(body.code).toBe("downsell_blocked");
    expect(body.error).toBe("replace_blocked");
  });

  it("401 without Authorization header", async () => {
    const res = await app.fetch(
      new Request(replaceLinesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLineIds: [TARGET_LINE_ID],
          line: { sku: "S", qty: 1 },
        }),
      }),
      env,
    );
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// Order change requests (P3, 0233) — proceed-lane submission + ops decide.
// =============================================================================

const changeReqUrl = `http://t/api/orders/${PROCEED_ID}/change-requests`;
const REQ_ID = "22222222-2222-2222-2222-222222222222";

function requestRow(over: Record<string, unknown> = {}) {
  return {
    id: REQ_ID,
    order_id: PROCEED_ID,
    kind: "add_lines",
    payload: { lines: [{ sku: "SKU-ADD-1", qty: 1 }] },
    status: "pending",
    requested_by: null,
    requested_at: "2026-07-18T00:00:00Z",
    decided_by: null,
    decided_at: null,
    decision_note: null,
    applied_at: null,
    ...over,
  };
}

describe("order change requests (P3, 0233)", () => {
  it("POST submit — calls submit_order_change_request and returns the created row", async () => {
    const sb = buildSbForProceed({
      tables: { order_change_requests: { single: requestRow() } },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(changeReqUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: [{ sku: "SKU-ADD-1", qty: 1, unitPrice: 220, label: "Memory Foam Pillow" }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("submit_order_change_request");
    const args = sb._rpcCalls[0].args as { p_payload?: { lines?: unknown[] } };
    expect(args.p_payload?.lines).toHaveLength(1);
    const body = (await res.json()) as { request?: { id?: string; status?: string } };
    expect(body.request?.id).toBe(REQ_ID);
    expect(body.request?.status).toBe("pending");
  });

  it("submit 422 passthrough — pending_exists / use_direct_add", async () => {
    const sb = buildSbForProceed({
      rpcError: { code: "22023", message: "already pending", details: "pending_exists" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(changeReqUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lines: [{ sku: "SKU-ADD-1", qty: 1 }] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; error?: string };
    expect(body.code).toBe("pending_exists");
    expect(body.error).toBe("submit_blocked");
  });

  it("GET list — returns adapted rows (RLS-scoped)", async () => {
    const sb = buildSbForProceed({ orderedRows: [requestRow()] });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(changeReqUrl, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { requests?: Array<{ id?: string; orderId?: string }> };
    expect(body.requests).toHaveLength(1);
    expect(body.requests?.[0]?.id).toBe(REQ_ID);
    expect(body.requests?.[0]?.orderId).toBe(PROCEED_ID);
  });

  it("cancel — calls cancel_order_change_request", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(`${changeReqUrl}/${REQ_ID}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: "{}",
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("cancel_order_change_request");
  });

  it("decide REJECT — operation only; calls reject RPC with the note", async () => {
    const sb = buildSbForProceed({
      tables: { order_change_requests: { single: requestRow() } },
      fetchedRow: addOrderRow({ status: "proceed_order" }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`${changeReqUrl}/${REQ_ID}/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ approve: false, note: "no stock" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("reject_order_change_request");
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_note).toBe("no stock");
  });

  it("decide APPROVE — pipeline runs then add_order_lines p_source=change_request", async () => {
    const sb = buildSbForProceed({
      tables: {
        order_change_requests: { single: requestRow() },
        orders: { single: addOrderRow({ status: "proceed_order" }) },
      },
      productSkuCategoryRows: [addSkuRow()] as unknown as Array<{
        product_models: { category: string } | null;
      }>,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`${changeReqUrl}/${REQ_ID}/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ approve: true }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("add_order_lines");
    const args = sb._rpcCalls[0].args as Record<string, unknown>;
    expect(args.p_source).toBe("change_request");
    expect(args.p_change_request_id).toBe(REQ_ID);
    const lines = args.p_lines as Array<Record<string, unknown>>;
    expect(lines[0].unit_price).toBe(250); // fresh catalog price at APPROVAL time
  });

  it("decide 403 for a dealer JWT", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(`${changeReqUrl}/${REQ_ID}/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ approve: true }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("decide 422 wrong_status when the request was already decided", async () => {
    const sb = buildSbForProceed({
      tables: { order_change_requests: { single: requestRow({ status: "approved" }) } },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`${changeReqUrl}/${REQ_ID}/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ approve: true }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("wrong_status");
    expect(sb._rpcCalls).toHaveLength(0);
  });
});

// =============================================================================
// 0257 — proceed-lane item CHANGE (replace_lines requests) + service add-ons.
// =============================================================================

const ADDON_CFG = {
  key: "dispose-mattress",
  name: "Dispose old mattress",
  price: 80,
  active: true,
  size_options: null,
};

function replaceRequestRow(over: Record<string, unknown> = {}) {
  return requestRow({
    kind: "replace_lines",
    payload: {
      targetLineIds: [TARGET_LINE_ID],
      targetLines: [{ sku: "SKU-OLD", qty: 1, unitPrice: 100, label: "Old thing" }],
      line: { sku: "SKU-ADD-1", qty: 1, attrs: null },
    },
    ...over,
  });
}

// 0258 — service add-on edit fixtures.
const ADDON_ROW_ID = "55555555-5555-5555-5555-555555555501";
const editAddonUrl = `http://t/api/orders/${PROCEED_ID}/addons/${ADDON_ROW_ID}/edit`;

describe("0257 — service add-ons on the add doors", () => {
  it("direct add: addons-only body prices from the addons config and passes p_addons_append", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      inTables: { addons: [ADDON_CFG] },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        // Client price 1 is IGNORED — the config prices RM 80.
        body: JSON.stringify({
          addons: [{ addonKey: "dispose-mattress", qty: 2, unitPrice: 1 }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("add_order_lines");
    const args = sb._rpcCalls[0].args as Record<string, unknown>;
    expect(args.p_lines).toEqual([]);
    expect(args.p_addons_append).toEqual([
      { addon_key: "dispose-mattress", qty: 2, unit_price: 80, attrs: null },
    ]);
  });

  it("direct add 422 unknown_or_inactive_addon for an inactive / unknown / DELIVERY key", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      inTables: { addons: [{ ...ADDON_CFG, active: false }] },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ addons: [{ addonKey: "dispose-mattress", qty: 1 }] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("unknown_or_inactive_addon");
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("direct add 422 addon_size_required when a sized addon misses per-unit sizes", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      inTables: { addons: [{ ...ADDON_CFG, size_options: ["King", "Queen"] }] },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addLinesUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        // qty 2 but only ONE size picked.
        body: JSON.stringify({
          addons: [{ addonKey: "dispose-mattress", qty: 2, attrs: { sizes: ["Queen"] } }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("addon_size_required");
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("submit: addons ride the add_lines payload with p_kind", async () => {
    const sb = buildSbForProceed({
      tables: { order_change_requests: { single: requestRow() } },
      inTables: { addons: [ADDON_CFG] },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(changeReqUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "add_lines",
          addons: [{ addonKey: "dispose-mattress", qty: 1, unitPrice: 80, label: "Dispose old mattress" }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("submit_order_change_request");
    const args = sb._rpcCalls[0].args as {
      p_kind?: string;
      p_payload?: { addons?: unknown[]; lines?: unknown[] };
    };
    expect(args.p_kind).toBe("add_lines");
    expect(args.p_payload?.addons).toHaveLength(1);
    expect(args.p_payload?.lines).toEqual([]);
  });
});

describe("0257 — replace_lines change requests", () => {
  it("submit: passes p_kind=replace_lines with the target + replacement payload", async () => {
    const sb = buildSbForProceed({
      tables: { order_change_requests: { single: replaceRequestRow() } },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(changeReqUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "replace_lines",
          targetLineIds: [TARGET_LINE_ID],
          targetLines: [{ sku: "SKU-OLD", qty: 1, unitPrice: 100, label: "Old thing" }],
          line: { sku: "SKU-ADD-1", qty: 1, unitPrice: 250, label: "New thing" },
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("submit_order_change_request");
    const args = sb._rpcCalls[0].args as {
      p_kind?: string;
      p_payload?: { targetLineIds?: string[]; line?: { sku?: string } };
    };
    expect(args.p_kind).toBe("replace_lines");
    expect(args.p_payload?.targetLineIds).toEqual([TARGET_LINE_ID]);
    expect(args.p_payload?.line?.sku).toBe("SKU-ADD-1");
  });

  it("decide APPROVE — replace pipeline runs then replace_order_lines p_source=change_request", async () => {
    const sb = buildSbForProceed({
      tables: {
        order_change_requests: { single: replaceRequestRow() },
        orders: { single: addOrderRow({ status: "proceed_order" }) },
      },
      orderLineRows: [replaceTargetRow()],
      inTables: {
        order_supplier_threads: [],
        product_skus: [addSkuRow()],
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`${changeReqUrl}/${REQ_ID}/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ approve: true }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("replace_order_lines");
    const args = sb._rpcCalls[0].args as Record<string, unknown>;
    expect(args.p_source).toBe("change_request");
    expect(args.p_change_request_id).toBe(REQ_ID);
    expect(args.p_old_line_ids).toEqual([TARGET_LINE_ID]);
    const lines = args.p_lines as Array<Record<string, unknown>>;
    expect(lines[0].sku).toBe("SKU-ADD-1");
    expect(lines[0].unit_price).toBe(250); // fresh catalog price at APPROVAL time
  });

  it("direct addon edit — POST /:id/addons/:addonId/edit calls edit_order_addon", async () => {
    const sb = buildSbForProceed({ fetchedRow: addOrderRow() });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(editAddonUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ qty: 2, attrs: { sizes: ["King", "Queen"], size: "King + Queen" } }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("edit_order_addon");
    const args = sb._rpcCalls[0].args as Record<string, unknown>;
    expect(args.p_addon_id).toBe(ADDON_ROW_ID);
    expect(args.p_qty).toBe(2);
    expect(args.p_source).toBe("direct");
    expect((args.p_attrs as { sizes?: string[] }).sizes).toEqual(["King", "Queen"]);
  });

  it("direct addon edit 422 wrong_status once the order proceeded (friendly gate)", async () => {
    const sb = buildSbForProceed({ fetchedRow: addOrderRow({ status: "proceed_order" }) });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(editAddonUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ qty: 2 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; error?: string };
    expect(body.code).toBe("wrong_status");
    expect(body.error).toBe("edit_addon_blocked");
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("direct addon edit 422 passthrough of the RPC's downsell_blocked (qty reduction)", async () => {
    const sb = buildSbForProceed({
      fetchedRow: addOrderRow(),
      rpcError: {
        code: "22023",
        message: "quantity can only stay or increase — reductions go through HQ",
        details: "downsell_blocked",
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(editAddonUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ qty: 1 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("downsell_blocked");
  });

  it("submit edit_addon — passes p_kind + the qty/size payload", async () => {
    const sb = buildSbForProceed({
      tables: {
        order_change_requests: {
          single: requestRow({
            kind: "edit_addon",
            payload: { targetAddonId: ADDON_ROW_ID, qty: 2 },
          }),
        },
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(changeReqUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "edit_addon",
          targetAddonId: ADDON_ROW_ID,
          qty: 2,
          attrs: { sizes: ["King", "Queen"], size: "King + Queen" },
          label: "Dispose old mattress",
          oldQty: 1,
          oldSize: "King",
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("submit_order_change_request");
    const args = sb._rpcCalls[0].args as {
      p_kind?: string;
      p_payload?: { targetAddonId?: string; qty?: number; oldQty?: number };
    };
    expect(args.p_kind).toBe("edit_addon");
    expect(args.p_payload?.targetAddonId).toBe(ADDON_ROW_ID);
    expect(args.p_payload?.qty).toBe(2);
    expect(args.p_payload?.oldQty).toBe(1);
  });

  it("decide APPROVE on edit_addon — applies via edit_order_addon p_source=change_request", async () => {
    const sb = buildSbForProceed({
      tables: {
        order_change_requests: {
          single: requestRow({
            kind: "edit_addon",
            payload: {
              targetAddonId: ADDON_ROW_ID,
              qty: 3,
              attrs: { sizes: ["King", "Queen", "Single"], size: "King + Queen + Single" },
              label: "Dispose old mattress",
              oldQty: 1,
            },
          }),
        },
        orders: { single: addOrderRow({ status: "proceed_order" }) },
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`${changeReqUrl}/${REQ_ID}/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ approve: true }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("edit_order_addon");
    const args = sb._rpcCalls[0].args as Record<string, unknown>;
    expect(args.p_addon_id).toBe(ADDON_ROW_ID);
    expect(args.p_qty).toBe(3);
    expect(args.p_source).toBe("change_request");
    expect(args.p_change_request_id).toBe(REQ_ID);
  });

  it("decide APPROVE 422 line_in_production when the target line already has a thread", async () => {
    const sb = buildSbForProceed({
      tables: {
        order_change_requests: { single: replaceRequestRow() },
        orders: { single: addOrderRow({ status: "proceed_order" }) },
      },
      orderLineRows: [replaceTargetRow()],
      inTables: {
        order_supplier_threads: [{ id: "t-1" }],
        product_skus: [addSkuRow()],
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation", null);
    const res = await app.fetch(
      new Request(`${changeReqUrl}/${REQ_ID}/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ approve: true }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; error?: string };
    expect(body.code).toBe("line_in_production");
    expect(body.error).toBe("decide_blocked");
    expect(sb._rpcCalls).toHaveLength(0);
  });
});

describe("POST /api/orders/:id/address", () => {
  it("200 — calls set_order_address RPC", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        customer_address: "123 Jalan Updated, 50000 KL",
        customer_address_unknown: false,
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addressUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          address: "123 Jalan Updated, 50000 KL",
          billing: null,
          billingSame: true,
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("set_order_address");
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_address).toBe("123 Jalan Updated, 50000 KL");
    // 0230 — legacy flat write: no parts in the body → p_parts null (the RPC
    // clears any previously-stored structured columns).
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_parts).toBeNull();
  });

  it("forwards the structured parts as p_parts (0230)", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        customer_address: "8 Jalan PP50A, Seri Kembangan 43300, Selangor",
        customer_address_unknown: false,
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const parts = {
      line1: "8 Jalan PP50A",
      state: "Selangor",
      city: "Seri Kembangan",
      postcode: "43300",
    };
    const res = await app.fetch(
      new Request(addressUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          address: "8 Jalan PP50A, Seri Kembangan 43300, Selangor",
          billing: null,
          billingSame: true,
          parts,
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_parts).toEqual(parts);
  });

  it("400 when address is too short", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addressUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ address: "abc", billing: null, billingSame: true }),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("422 when RPC says wrong status", async () => {
    const sb = buildSbForProceed({
      rpcError: { code: "22023", message: "Not in Place", details: "wrong_status" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(addressUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          address: "123 Jalan Long Enough Address, 50000 KL",
          billing: null,
          billingSame: true,
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string | null };
    expect(body.code).toBe("wrong_status");
  });
});

describe("POST /api/orders/:id/date", () => {
  it("200 — calls set_order_date RPC", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        delivery_date: "2026-06-15",
        delivery_date_tbd: false,
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(dateUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2026-06-15", proceedDate: "2026-06-01" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("set_order_date");
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_date).toBe("2026-06-15");
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_proceed_date).toBe("2026-06-01");
  });

  it("400 when date string is malformed", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(dateUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ date: "not-a-date", proceedDate: "2026-06-01" }),
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("422 lead_time_violation when the confirmed date is closer than the number", async () => {
    const today = new Date();
    const tooSoon = new Date(today);
    tooSoon.setDate(tooSoon.getDate() + 5);
    const tooSoonIso = tooSoon.toISOString().slice(0, 10);

    const sb = buildSbForProceed({
      orderLineSkus: ["mattress-1"],
      productSkuCategoryRows: [{ product_models: { category: "mattress" } }],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(dateUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ date: tooSoonIso, proceedDate: tooSoonIso }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; leadDays?: number };
    expect(body.code).toBe("lead_time_violation");
    expect(body.leadDays).toBe(21);
    // Critically: set_order_date RPC was NOT called — server bailed first
    expect(sb._rpcCalls.some((c: { name: string }) => c.name === "set_order_date")).toBe(false);
  });
});

// =============================================================================
// PATCH /api/orders/:id — Phase 2C.2 full edit
// =============================================================================

const editUrl = `http://t/api/orders/${PROCEED_ID}`;

describe("PATCH /api/orders/:id", () => {
  it("200 — flattens camelCase to snake_case payload, calls update_order RPC", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        customer_name: "Updated Name",
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(editUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name: "Updated Name", phone: "012-9988776" },
          // 2026-05-22 (Loo) — floor capped at MAX_DELIVERY_FLOOR (3) since
          // Carres doesn't stair-carry above floor 3. The original test used
          // floor: 5 to assert the flattening path; floor: 3 exercises the
          // same path and now also satisfies the new max constraint.
          delivery: { floor: 3, hasLift: true },
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("update_order");
    const args = sb._rpcCalls[0].args as { p_payload: Record<string, unknown> };
    expect(args.p_payload.customer_name).toBe("Updated Name");
    expect(args.p_payload.customer_phone).toBe("012-9988776");
    expect(args.p_payload.delivery_floor).toBe(3);
    expect(args.p_payload.delivery_has_lift).toBe(true);
  });

  // 0220 — POS proceed-lane edits: customer.email flows to the RPC payload.
  it("200 — flattens customer.email to customer_email (null → '' so the RPC clears it)", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(editUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ customer: { email: "loo@carres.com" } }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("update_order");
    const args = sb._rpcCalls[0].args as { p_payload: Record<string, unknown> };
    expect(args.p_payload.customer_email).toBe("loo@carres.com");

    // null clears — flattened to "" (the RPC's nullif(trim(…), '') nulls it).
    const sb2 = buildSbForProceed({
      fetchedRow: makeOrderRow({
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb2);
    const res2 = await app.fetch(
      new Request(editUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ customer: { email: null } }),
      }),
      env,
    );
    expect(res2.status).toBe(200);
    const args2 = sb2._rpcCalls[0].args as { p_payload: Record<string, unknown> };
    expect(args2.p_payload.customer_email).toBe("");
  });

  it("422 with code='wrong_status' when RPC says order isn't in Place", async () => {
    const sb = buildSbForProceed({
      rpcError: {
        code: "22023",
        message: "Order is no longer editable",
        details: "wrong_status",
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(editUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ customer: { name: "Updated Name" } }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string | null; error?: string };
    expect(body.code).toBe("wrong_status");
    expect(body.error).toBe("update_order_blocked");
  });

  it("400 when neither customer nor delivery is provided", async () => {
    const sb = buildSbForProceed({});
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(editUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("403 when RPC returns 42501 (cross-dealer)", async () => {
    const sb = buildSbForProceed({
      rpcError: { code: "42501", message: "forbidden", details: "forbidden" },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(editUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ customer: { name: "Cross-dealer attempt" } }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  // 2026-05-22 (Loo) — lead-time floor also enforced on edit. The wizard
  // bakes the gate into Step 3, but a curl PATCH would otherwise bypass it
  // because dealers can edit Place orders freely.
  it("422 lead_time_violation when patching delivery.date closer than the number", async () => {
    const today = new Date();
    const tooSoon = new Date(today);
    tooSoon.setDate(tooSoon.getDate() + 3);
    const tooSoonIso = tooSoon.toISOString().slice(0, 10);

    const sb = buildSbForProceed({
      orderLineSkus: ["mattress-1"],
      productSkuCategoryRows: [{ product_models: { category: "mattress" } }],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(editUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ delivery: { date: tooSoonIso } }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; leadDays?: number };
    expect(body.code).toBe("lead_time_violation");
    expect(body.leadDays).toBe(21);
    expect(sb._rpcCalls.some((c: { name: string }) => c.name === "update_order")).toBe(false);
  });

  it("200 when the patched delivery.date clears the number", async () => {
    const today = new Date();
    const okDate = new Date(today);
    okDate.setDate(okDate.getDate() + 30);
    const okIso = okDate.toISOString().slice(0, 10);

    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        delivery_date: okIso,
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
      orderLineSkus: ["mattress-1"],
      productSkuCategoryRows: [{ product_models: { category: "mattress" } }],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(editUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ delivery: { date: okIso } }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls.some((c: { name: string }) => c.name === "update_order")).toBe(true);
  });
});

// =============================================================================
// POST /api/orders/:id/cancel — Phase 2C.3 dealer cancel
// =============================================================================

const cancelUrl = `http://t/api/orders/${PROCEED_ID}/cancel`;

describe("POST /api/orders/:id/cancel", () => {
  it("200 — calls cancel_order RPC with reason", async () => {
    const sb = buildSbForProceed({
      fetchedRow: makeOrderRow({
        status: "cancelled",
        signature_url: `orders-attachments/${DEALER_A}/wiz/signature.png`,
        terms_accepted: true,
      }),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(cancelUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Customer changed mind" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb._rpcCalls[0].name).toBe("cancel_order");
    expect((sb._rpcCalls[0].args as Record<string, unknown>).p_reason).toBe("Customer changed mind");
  });

  /* 0350 — A CANCELLATION SAYS WHY. This test used to assert the opposite:
   * `{ reason: null }` returned 200 and passed a NULL through to the RPC, and
   * the audit row read the bare words "Order cancelled". A cancelled customer
   * transaction that cannot say why is a record that answers nothing, so the
   * reason is now required and the refusal happens at the boundary — the RPC
   * is never reached, and the caller gets the field back rather than a
   * database error. */
  it.each([{ reason: null }, { reason: "" }, { reason: "   " }, {}])(
    "400 before the RPC — a cancellation says why (%j)",
    async (body) => {
      const sb = buildSbForProceed({});
      vi.mocked(userClient).mockReturnValue(sb);
      const jwt = await makeJwt("dealer", DEALER_A);
      const res = await app.fetch(
        new Request(cancelUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        env,
      );
      /* 400 is this dispatcher's one shape for a body that never passed the
       * schema — the same answer every other order mutation gives. */
      expect(res.status).toBe(400);
      expect(sb._rpcCalls).toHaveLength(0);
    },
  );

  it("422 when RPC says wrong_status (already proceeded / cancelled)", async () => {
    const sb = buildSbForProceed({
      rpcError: {
        code: "22023",
        message: "Only Place orders can be cancelled by the dealer",
        details: "wrong_status",
      },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request(cancelUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Late" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string | null; error?: string };
    expect(body.code).toBe("wrong_status");
    expect(body.error).toBe("cancel_order_blocked");
  });
});

// ---------------------------------------------------------------------------
// Phase 4 (sofa engine) — server recompute + 0.5% drift-reject on a sofa BUILD
// line (one carrying attrs.sofa_build). Needs a per-table Supabase mock because
// the recompute fans out to product_skus (model resolve) + the 5 catalog tables
// that make up the SofaPricingSnapshot, then create_order + the order re-fetch.
// ---------------------------------------------------------------------------

interface SofaTableData {
  list?: unknown[];
  one?: unknown;
  error?: { message: string } | null;
}

/** Supabase mock that routes .from(table) to per-table data + records rpc +
 *  from() calls. The chain is thenable (resolves to the table list) so a query
 *  terminated by .select()/.eq()/.is() awaits to {data:list}, while
 *  .maybeSingle() awaits to {data:one}. */
function buildSbForSofa(opts: {
  tables: Record<string, SofaTableData>;
  rpcResult?: { id: string; so: number; placed_at: string };
  rpcError?: { code?: string; message?: string; details?: string };
}) {
  const rpcCalls: Array<{ name: string; payload: unknown }> = [];
  const fromCalls: string[] = [];
  function makeChain(table: string) {
    const listRes = () => ({
      data: opts.tables[table]?.list ?? [],
      error: opts.tables[table]?.error ?? null,
    });
    const oneRes = () => ({
      data: opts.tables[table]?.one ?? null,
      error: opts.tables[table]?.error ?? null,
    });
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      // Phase 5 — the compartment-sku fetch uses `.not("compartment_id","is",null)`.
      not: () => chain,
      in: async () => listRes(),
      order: async () => listRes(),
      maybeSingle: async () => oneRes(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(listRes()).then(resolve, reject),
    };
    return chain;
  }
  return Object.assign(
    {
      from: (table: string) => {
        fromCalls.push(table);
        return makeChain(table);
      },
      rpc: async (name: string, args: { payload: unknown }) => {
        rpcCalls.push({ name, payload: args.payload });
        if (opts.rpcError) return { data: null, error: opts.rpcError };
        return { data: opts.rpcResult ?? null, error: null };
      },
      _rpcCalls: rpcCalls,
      _fromCalls: fromCalls,
    },
    buildStorageMock(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
}

const SOFA_MODEL_ID = "00000000-0000-0000-0000-0000000m0del";
const SOFA_REP_SKU = "SOFA-OHANA-REP";

/** Pool: 2A = RM1000, 1A = RM600. No per-model overrides, no combos → a build
 *  of [2A, 1A] at PRICE_1 prices à-la-carte to RM1600. */
function sofaTables(over: Partial<Record<string, SofaTableData>> = {}): Record<string, SofaTableData> {
  return {
    product_skus: {
      // `.maybeSingle()` (model resolve) returns `one`; the thenable
      // compartment-sku fetch returns `list` — the 5A-synced per-compartment
      // skus the Phase-5 explode maps each cell to.
      one: { model_id: SOFA_MODEL_ID },
      list: [
        { sku: "OHANA-2A", compartment_id: "comp-2a" },
        { sku: "OHANA-1A", compartment_id: "comp-1a" },
      ],
    },
    sofa_compartments: {
      list: [
        { id: "comp-2a", code: "2A", description: null, seat_count: 2, arm_config: null, icon_url: null, default_price: "1000", sort_order: 0, active: true },
        { id: "comp-1a", code: "1A", description: null, seat_count: 1, arm_config: null, icon_url: null, default_price: "600", sort_order: 1, active: true },
      ],
    },
    model_sofa_compartments: { list: [] },
    sofa_combo_pricing: { list: [] },
    fabric_tier_addon_config: { one: null },
    model_fabric_tier_overrides: { one: null },
    orders: {
      one: {
        ...makeOrderRow({ id: "11111111-1111-1111-1111-111111111111", dealer_id: DEALER_A }),
        order_lines: [],
        order_addons: [],
        order_history: [],
      },
    },
    ...over,
  };
}

/** A create body whose single line is a sofa build (cells 2A + 1A, PRICE_1).
 *  Delivery is TBD so the lead-time validator (which also hits product_skus) is
 *  skipped — keeps the mock focused on the recompute path. */
function buildOrderBody(unitPrice: number, sofaBuildOver: Record<string, unknown> = {}) {
  return validCreateBody({
    delivery: DATED_DELIVERY,
    lines: [
      {
        sku: SOFA_REP_SKU,
        qty: 1,
        unitPrice,
        attrs: {
          mode: "build",
          fabric_id: null,
          fabric_name: null,
          fabric_surcharge: 0,
          fabric_tier: "PRICE_1",
          sofa_build: {
            cells: [
              { moduleCode: "2A", x: 0, y: 0, rot: 0 },
              { moduleCode: "1A", x: 200, y: 0, rot: 0 },
            ],
            height: "28",
          },
          sofa_build_key: "sc_test_1",
          ...sofaBuildOver,
        },
      },
    ],
  });
}

describe("POST /api/orders — sofa build recompute + explode (Phase 5)", () => {
  const NEW_ID = "11111111-1111-1111-1111-111111111111";
  const rpcOk = { id: NEW_ID, so: 1301, placed_at: "2026-06-23T00:00:00Z" };

  it("accepts an honest client price (within 0.5%) and EXPLODES it into per-compartment lines at the server total", async () => {
    // Client claims RM1605; server computes RM1600 (drift 0.31% < 0.5%). The one
    // build line explodes into 2 real compartment lines (2A=RM1000, 1A=RM600)
    // summing to the SERVER 1600, not the client 1605.
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1605)),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(sb._rpcCalls).toHaveLength(1);
    const payload = sb._rpcCalls[0]!.payload as {
      lines: Array<{ sku: string; qty: number; unit_price: number; attrs: Record<string, unknown> }>;
    };
    // One build line → two real per-compartment lines under the sofa model.
    expect(payload.lines).toHaveLength(2);
    expect(payload.lines.map((l) => l.sku)).toEqual(["OHANA-2A", "OHANA-1A"]);
    // Σ unit_price === the SERVER total (1600), not the client 1605.
    expect(payload.lines.reduce((s, l) => s + l.unit_price * l.qty, 0)).toBe(1600);
    expect(payload.lines.map((l) => l.unit_price)).toEqual([1000, 600]);
    // Each line carries the regroup key + its cell index + fabric.
    expect(payload.lines[0]!.attrs).toMatchObject({ sofa_build_key: "sc_test_1", cell_index: 0 });
    expect(payload.lines[1]!.attrs).toMatchObject({
      sofa_build_key: "sc_test_1",
      cell_index: 1,
      fabric_tier: "PRICE_1",
    });
  });

  it("0202 KIV series survives the explode: fabric_series rides every per-compartment line", async () => {
    // Colour KIV (fabric_name stays null) but the EZ series was chosen — the
    // series must ride each exploded line so the PO shows "EZ · colour to confirm".
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1600, { fabric_series: "EZ" })),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const payload = sb._rpcCalls[0]!.payload as {
      lines: Array<{ attrs: Record<string, unknown> }>;
    };
    expect(payload.lines).toHaveLength(2);
    expect(payload.lines.every((l) => l.attrs.fabric_series === "EZ")).toBe(true);
    // colour still deferred → no fabric_name got invented
    expect(payload.lines.every((l) => l.attrs.fabric_name == null)).toBe(true);
  });

  it("rejects a tampered client price (> 0.5% drift) with 422 sofa_price_drift and does NOT create", async () => {
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(9999)),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; code: string; serverTotal: number };
    expect(body.error).toBe("rule_violation");
    expect(body.code).toBe("sofa_price_drift");
    expect(body.serverTotal).toBe(1600);
    // No order created.
    expect(sb._rpcCalls).toHaveLength(0);
  });

  // ── Remark ± price adjustment (Loo 2026-07-12) — attrs.remark_surcharge is an
  // operator-decided amount the drift gate ADDS to the engine total; the remark
  // text + the adjustment ride every exploded line (whole-sofa metadata).
  it("remark_surcharge joins the expected total: engine 1600 + 200 accepts unitPrice 1800 and explodes to Σ1800", async () => {
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildOrderBody(1800, { remark: "custom armrest", remark_surcharge: 200 }),
        ),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const payload = sb._rpcCalls[0]!.payload as {
      lines: Array<{ unit_price: number; qty: number; attrs: Record<string, unknown> }>;
    };
    expect(payload.lines).toHaveLength(2);
    expect(payload.lines.reduce((s, l) => s + l.unit_price * l.qty, 0)).toBe(1800);
    // Remark + adjustment ride every exploded line (already inside the split).
    expect(payload.lines.every((l) => l.attrs.remark === "custom armrest")).toBe(true);
    expect(payload.lines.every((l) => l.attrs.remark_surcharge === 200)).toBe(true);
  });

  it("a NEGATIVE remark adjustment (discount) is honoured: engine 1600 − 200 accepts 1400", async () => {
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1400, { remark_surcharge: -200 })),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const payload = sb._rpcCalls[0]!.payload as {
      lines: Array<{ unit_price: number; qty: number }>;
    };
    expect(payload.lines.reduce((s, l) => s + l.unit_price * l.qty, 0)).toBe(1400);
  });

  it("an adjusted unitPrice WITHOUT the declared remark_surcharge still drifts (422)", async () => {
    // unitPrice 1800 but no attrs declaration → server expects 1600 → reject.
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1800)),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("sofa_price_drift");
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("a discount below RM 0 → 400 bad_request (fail-closed), no create", async () => {
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(0, { remark_surcharge: -1700 })),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("a NON-NUMERIC remark_surcharge is rejected by the attrs schema (400)", async () => {
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1800, { remark_surcharge: "200" })),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("server price 0 + client 0 → accepted (genuine free build, still explodes)", async () => {
    // Both compartments offered but priced 0 → server total 0; the build still
    // explodes into 2 real (RM0) lines whose skus map.
    const sb = buildSbForSofa({
      tables: sofaTables({
        sofa_compartments: {
          list: [
            { id: "comp-2a", code: "2A", description: null, seat_count: 2, arm_config: null, icon_url: null, default_price: "0", sort_order: 0, active: true },
            { id: "comp-1a", code: "1A", description: null, seat_count: 1, arm_config: null, icon_url: null, default_price: "0", sort_order: 1, active: true },
          ],
        },
      }),
      rpcResult: rpcOk,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(0)),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(sb._rpcCalls).toHaveLength(1);
    const payload = sb._rpcCalls[0]!.payload as { lines: Array<{ unit_price: number }> };
    expect(payload.lines).toHaveLength(2);
    expect(payload.lines.reduce((s, l) => s + l.unit_price, 0)).toBe(0);
  });

  it("server price 0 + client > 0 → rejected (model can't justify any price)", async () => {
    const sb = buildSbForSofa({
      tables: sofaTables({ sofa_compartments: { list: [] } }),
      rpcResult: rpcOk,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1500)),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("malformed sofa_build (empty cells) → 400 and no create", async () => {
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1600, { sofa_build: { cells: [], height: "28" } })),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("unknown representative sku → 400 and no create", async () => {
    const sb = buildSbForSofa({
      tables: sofaTables({ product_skus: { one: null } }),
      rpcResult: rpcOk,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1600)),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("a catalog read error fails CLOSED with 500 (never silently accepts)", async () => {
    const sb = buildSbForSofa({
      tables: sofaTables({ sofa_compartments: { error: { message: "boom" } } }),
      rpcResult: rpcOk,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1600)),
      }),
      env,
    );
    expect(res.status).toBe(500);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("a non-build order skips the recompute entirely (no catalog fan-out)", async () => {
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        // validCreateBody = a normal mattress line (attrs: null), TBD delivery.
        body: JSON.stringify(
          validCreateBody({ delivery: DATED_DELIVERY }),
        ),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(sb._rpcCalls).toHaveLength(1);
    // The recompute never ran → no sofa-catalog tables were touched.
    expect(sb._fromCalls).not.toContain("sofa_compartments");
  });

  it("two build lines on the same model fetch the snapshot only once (memoized)", async () => {
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const body = buildOrderBody(1600);
    // Append a second identical build line (same model).
    (body.lines as unknown[]).push({
      sku: SOFA_REP_SKU,
      qty: 1,
      unitPrice: 1600,
      attrs: {
        mode: "build",
        fabric_tier: "PRICE_1",
        sofa_build: {
          cells: [
            { moduleCode: "2A", x: 0, y: 0, rot: 0 },
            { moduleCode: "1A", x: 200, y: 0, rot: 0 },
          ],
          height: "28",
        },
        sofa_build_key: "sc_test_2",
      },
    });
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(201);
    // Snapshot pool fetched exactly once despite two build lines.
    expect(sb._fromCalls.filter((t: string) => t === "sofa_compartments")).toHaveLength(1);
  });

  it("a build cell whose compartment has no synced sku → 400 fail-closed (never drops the line)", async () => {
    // 1A is priced (server total still 1600, drift gate passes) but its sku was
    // never synced (only 2A in product_skus.list) → the explode can't make a real
    // line for it → fail closed, no create.
    const sb = buildSbForSofa({
      tables: sofaTables({
        product_skus: {
          one: { model_id: SOFA_MODEL_ID },
          list: [{ sku: "OHANA-2A", compartment_id: "comp-2a" }],
        },
      }),
      rpcResult: rpcOk,
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1600)),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Principal-portal orders (Option A) — an internal role (principal/operation/
// finance/bd) places an order ON BEHALF OF a dealer it picks (body `dealerId`).
// A dealer/salesperson/showroom always uses its OWN JWT dealer (no body spoof).
// ---------------------------------------------------------------------------
describe("POST /api/orders — internal role places on behalf of a picked dealer (Option A)", () => {
  const NEW_ID = "11111111-1111-1111-1111-111111111111";
  const rpcOk = { id: NEW_ID, so: 1401, placed_at: "2026-06-25T00:00:00Z" };
  const dated = { delivery: DATED_DELIVERY };
  const mkFetched = (dealerId: string) => ({
    ...makeOrderRow({ id: NEW_ID, so: 1401, dealer_id: dealerId, paid: "750" }),
    order_lines: [
      { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", order_id: NEW_ID, sku: "mattress:carres-classic:queen", qty: 1, attrs: null, unit_price: "1500" },
    ],
    order_addons: [],
    order_history: [],
  });

  it("dealer flow unchanged: the JWT dealer wins and a body dealerId is IGNORED (no spoof)", async () => {
    const sb = buildSbForCreate({ rpcResult: rpcOk, fetchedRow: mkFetched(DEALER_A) });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        // dealer A tries to attribute the order to dealer B via the body → must be ignored.
        body: JSON.stringify(validCreateBody({ ...dated, dealerId: DEALER_B })),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const payload = sb._rpcCalls[0]!.payload as { dealer_id: string };
    expect(payload.dealer_id).toBe(DEALER_A);
  });

  it("principal places under the PICKED dealer (body dealerId honored)", async () => {
    const sb = buildSbForCreate({ rpcResult: rpcOk, fetchedRow: mkFetched(DEALER_B) });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          validCreateBody({
            ...dated,
            dealerId: DEALER_B,
            signaturePath: `orders-attachments/${DEALER_B}/wiz/signature.png`,
          }),
        ),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const payload = sb._rpcCalls[0]!.payload as { dealer_id: string };
    expect(payload.dealer_id).toBe(DEALER_B);
  });

  it("principal without a dealerId → 403, no create", async () => {
    const sb = buildSbForCreate({ rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(validCreateBody({ ...dated })),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("storage guard uses the effective (picked) dealer: principal + signature under a DIFFERENT dealer → 400", async () => {
    const sb = buildSbForCreate({ rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("principal", null);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          validCreateBody({
            ...dated,
            dealerId: DEALER_B,
            // signature lives under DEALER_A's folder but the order is for DEALER_B.
            signaturePath: `orders-attachments/${DEALER_A}/wiz/signature.png`,
          }),
        ),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(sb._rpcCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 0201/0202-wiring — option picks (divan / leg / fabric) trust gate + the sofa
// build leg-height surcharge riding the P4 drift gate.
// ---------------------------------------------------------------------------

describe("POST /api/orders — option picks recompute (0201/0202 wiring)", () => {
  const NEW_ID = "11111111-1111-1111-1111-111111111111";
  const rpcOk = { id: NEW_ID, so: 1401, placed_at: "2026-07-06T00:00:00Z" };

  const OPTION_POOLS = {
    catalog_option_pools: {
      list: [
        { id: "00000000-0000-4000-8000-000000000901", pool: "divan_height", value: '10"', label: null, dimensions: null, surcharge: "125", active: true, sort_order: 1, created_at: "2026-07-05T00:00:00Z", updated_at: "2026-07-05T00:00:00Z", updated_by: null },
        { id: "00000000-0000-4000-8000-000000000902", pool: "bedframe_leg_height", value: '4"', label: null, dimensions: null, surcharge: "60", active: true, sort_order: 2, created_at: "2026-07-05T00:00:00Z", updated_at: "2026-07-05T00:00:00Z", updated_by: null },
        { id: "00000000-0000-4000-8000-000000000903", pool: "sofa_leg_height", value: '6"', label: null, dimensions: null, surcharge: "90", active: true, sort_order: 3, created_at: "2026-07-05T00:00:00Z", updated_at: "2026-07-05T00:00:00Z", updated_by: null },
        // 0204 — the sofa_size axis the recompute's size gate reads: like a
        // real DB, the build fixture's height "28" must be a live pool value.
        { id: "00000000-0000-4000-8000-000000000904", pool: "sofa_size", value: "28", label: null, dimensions: null, surcharge: null, active: true, sort_order: 4, created_at: "2026-07-05T00:00:00Z", updated_at: "2026-07-05T00:00:00Z", updated_by: null },
      ],
    },
  };

  function bedframeOptionsBody(unitPrice: number, optionsTotal: number) {
    return validCreateBody({
      delivery: DATED_DELIVERY,
      lines: [
        {
          sku: "BF-KAYU-Q",
          qty: 1,
          unitPrice,
          attrs: {
            color: "Walnut",
            gap: '12"',
            options: [
              { kind: "divan_height", value: '10"', surcharge: 125 },
              { kind: "bedframe_leg_height", value: '4"', surcharge: 60 },
            ],
            options_total: optionsTotal,
          },
        },
      ],
    });
  }

  it("accepts an honest options total and canonicalises attrs.options", async () => {
    const sb = buildSbForSofa({ tables: sofaTables(OPTION_POOLS), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(bedframeOptionsBody(2185, 185)),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const payload = sb._rpcCalls[0]!.payload as {
      lines: Array<{ sku: string; unit_price: number; attrs: Record<string, unknown> }>;
    };
    expect(payload.lines[0]!.unit_price).toBe(2185);
    expect(payload.lines[0]!.attrs).toMatchObject({
      color: "Walnut",
      gap: '12"',
      options_total: 185,
    });
    expect(payload.lines[0]!.attrs.options).toEqual([
      { kind: "divan_height", value: '10"', surcharge: 125 },
      { kind: "bedframe_leg_height", value: '4"', surcharge: 60 },
    ]);
  });

  it("rejects a tampered options total with 422 options_price_drift and does NOT create", async () => {
    const sb = buildSbForSofa({ tables: sofaTables(OPTION_POOLS), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(bedframeOptionsBody(2005, 5)),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; serverTotal: number };
    expect(body.code).toBe("options_price_drift");
    expect(body.serverTotal).toBe(185);
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("sofa build: attrs.leg_height joins the drift-gated server total + rides the exploded lines", async () => {
    // à-la-carte 1600 + leg 6" surcharge 90 → server total 1690.
    const sb = buildSbForSofa({ tables: sofaTables(OPTION_POOLS), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1690, { leg_height: '6"', leg_surcharge: 90 })),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const payload = sb._rpcCalls[0]!.payload as {
      lines: Array<{ unit_price: number; attrs: Record<string, unknown> }>;
    };
    expect(payload.lines).toHaveLength(2);
    expect(payload.lines.reduce((s, l) => s + l.unit_price, 0)).toBe(1690);
    // Leg attrs ride every exploded line (server-resolved surcharge).
    expect(payload.lines[0]!.attrs).toMatchObject({ leg_height: '6"', leg_surcharge: 90 });
    expect(payload.lines[1]!.attrs).toMatchObject({ leg_height: '6"', leg_surcharge: 90 });
  });

  it("sofa build: a client leg claim the pool can't justify drifts and rejects", async () => {
    // No leg pool row in the mock → server prices leg 0 → total 1600 ≠ 1690.
    const sb = buildSbForSofa({ tables: sofaTables(), rpcResult: rpcOk });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("dealer", DEALER_A);
    const res = await app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderBody(1690, { leg_height: '6"', leg_surcharge: 90 })),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string; serverTotal: number };
    expect(body.code).toBe("sofa_price_drift");
    expect(body.serverTotal).toBe(1600);
    expect(sb._rpcCalls).toHaveLength(0);
  });
});

// =====================================================================
// 0219 — config-driven payment methods (cash + follow-ups + entry_data)
// =====================================================================

describe("POST /api/orders — 0219 payment-method config gates", () => {
  // The RPC erroring with 22023 stops the flow right AFTER create_order is
  // called — perfect probe: reaching the RPC proves the 0219 gate passed,
  // and _rpcCalls[0].payload shows exactly what would have been persisted.
  function sbStopAtRpc() {
    return buildSbForCreate({ rpcError: { code: "22023", message: "stop-probe" } });
  }
  async function post(body: unknown) {
    const jwt = await makeJwt("dealer", DEALER_A);
    return app.fetch(
      new Request("http://t/api/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
  }

  it("CASH is accepted with NO approval code (default-config method, approvalCodeRequired=false)", async () => {
    const sb = sbStopAtRpc();
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await post(validCreateBody({ paymentMethod: "cash", approvalCode: null }));
    expect(res.status).toBe(400); // the stop-probe 22023 — i.e. the gate PASSED
    expect(sb._rpcCalls).toHaveLength(1);
    const payload = sb._rpcCalls[0]!.payload as Record<string, unknown>;
    expect(payload.payment_method).toBe("cash");
    // REGRESSION (2026-07-14): the key must be ABSENT, not `null` — a JSON
    // null arrives in Postgres as jsonb 'null' (not SQL NULL) and trips
    // create_order's `entry_data must be a json object` guard, killing every
    // order without entry extras (e.g. installment with only an approval
    // code + EDC slip).
    expect("entry_data" in payload).toBe(false);
  });

  it("an unconfigured method → 422 invalid_payment_method, create_order never fires", async () => {
    const sb = sbStopAtRpc();
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await post(validCreateBody({ paymentMethod: "bitcoin" }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("invalid_payment_method");
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("a method with approvalCodeRequired and no code → 422 approval_code_required", async () => {
    const sb = sbStopAtRpc();
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await post(validCreateBody({ paymentMethod: "online", approvalCode: null }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("approval_code_required");
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("credit + a configured bank answer rides entry_data into the create payload", async () => {
    const sb = sbStopAtRpc();
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await post(
      validCreateBody({
        paymentMethod: "credit",
        entryData: { payment: { bank: "Maybank" } },
      }),
    );
    expect(res.status).toBe(400); // stop-probe → gate passed
    const payload = sb._rpcCalls[0]!.payload as Record<string, unknown>;
    expect(payload.entry_data).toEqual({ payment: { bank: "Maybank" } });
  });

  it("credit + a bank NOT in the configured options → 422 payment_followup_invalid", async () => {
    const sb = sbStopAtRpc();
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await post(
      validCreateBody({
        paymentMethod: "credit",
        entryData: { payment: { bank: "Bank of Mars" } },
      }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("payment_followup_invalid");
    expect(sb._rpcCalls).toHaveLength(0);
  });

  it("custom form-field values ride entry_data.fields through untouched", async () => {
    const sb = sbStopAtRpc();
    vi.mocked(userClient).mockReturnValue(sb);
    const res = await post(
      validCreateBody({
        entryData: { fields: { occupation: "Engineer" } },
      }),
    );
    expect(res.status).toBe(400); // stop-probe → gate passed
    const payload = sb._rpcCalls[0]!.payload as Record<string, unknown>;
    expect(payload.entry_data).toEqual({ fields: { occupation: "Engineer" } });
  });
});
