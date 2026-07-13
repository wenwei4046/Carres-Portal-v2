import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import { SO_GRID_COLUMNS } from "@carres/shared";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};
const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

type Result = { data: unknown; error: unknown };

/** Thenable query-builder mock: `await from(t).select()...` resolves to the
 *  table's result; `.maybeSingle()` resolves to it too. Keyed by table name so
 *  the grid endpoint's multi-table enrichment returns the right rows. */
function makeSb(byTable: Record<string, Result>, rpcResult: Result = { data: null, error: null }) {
  const makeBuilder = (result: Result) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      in: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve(result)),
      single: vi.fn(() => Promise.resolve(result)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
    };
    return builder;
  };
  return {
    from: vi.fn((t: string) => makeBuilder(byTable[t] ?? { data: [], error: null })),
    rpc: vi.fn(() => Promise.resolve(rpcResult)),
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

const ORDER_ID = "00000000-0000-0000-0000-0000000000d1";
const GRID_URL = "http://t/api/operation/sales-order-maintenance/grid";
const CONFIG_URL = "http://t/api/operation/sales-order-maintenance/config";

const ORDERS_RESULT: Result = {
  data: [
    {
      id: ORDER_ID,
      so: 1001,
      status: "place",
      channel: "dealer",
      source_system: "autocount",
      source_ref: ["TCF1", "CR2"],
      customer_name: "Tan Ah Kow",
      customer_phone: "0123",
      dealer_id: "d1",
      salesperson_id: null,
      outlet_id: null,
      delivery_date: "2026-07-01",
      warehouse_id: null,
      delivery_partner_id: null,
      paid: 200,
      placed_at: "2026-06-01T00:00:00.000Z",
      order_lines: [
        { id: "l1", sku: "SKU-A", qty: 2, unit_price: 100, attrs: null, source_po: null },
      ],
    },
  ],
  error: null,
};

const ENRICH = {
  orders: ORDERS_RESULT,
  dealers: { data: [{ id: "d1", name: "Carres House" }], error: null },
  product_skus: { data: [{ sku: "SKU-A", model_id: "m1" }], error: null },
  product_models: { data: [{ id: "m1", name: "Cozy 910", category: "bedframe" }], error: null },
  sales_order_grid_config: { data: { columns: [], options: {} }, error: null },
};

// =====================================================================
// GET /grid
// =====================================================================
describe("GET /api/operation/sales-order-maintenance/grid", () => {
  it("401 without Authorization", async () => {
    const res = await app.fetch(new Request(GRID_URL), env);
    expect(res.status).toBe(401);
  });

  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(GRID_URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("200 — flattens order×line and enriches resolved names", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(ENRICH) as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(GRID_URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rows: Array<Record<string, unknown>>;
      config: { columns: unknown[] };
      generatedAt: string;
    };
    expect(body.rows).toHaveLength(1);
    const r = body.rows[0];
    expect(r.rowId).toBe(`${ORDER_ID}:l1`);
    expect(r.so).toBe("SO-1001");
    expect(r.source_ref).toBe("TCF1, CR2");
    expect(r.customer_name).toBe("Tan Ah Kow");
    expect(r.dealer_name).toBe("Carres House");
    expect(r.sku).toBe("SKU-A");
    expect(r.product_name).toBe("Cozy 910");
    expect(r.item_group).toBe("bedframe");
    expect(r.qty).toBe(2);
    expect(r.unit_price).toBe(100);
    expect(r.line_total).toBe(200);
    // config merged with the live catalog → every column present.
    expect(body.config.columns).toHaveLength(SO_GRID_COLUMNS.length);
    expect(typeof body.generatedAt).toBe("string");
  });

  it("200 — order with no lines still yields one row (noline)", async () => {
    const noLines = {
      ...ENRICH,
      orders: {
        data: [{ ...(ORDERS_RESULT.data as any[])[0], order_lines: [] }],
        error: null,
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(noLines) as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(GRID_URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<Record<string, unknown>> };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].lineId).toBe("noline");
    expect(body.rows[0].sku).toBeNull();
  });
});

// =====================================================================
// GET /config
// =====================================================================
describe("GET /api/operation/sales-order-maintenance/config", () => {
  it("200 — merges stored config with the catalog", async () => {
    const sb = makeSb({
      sales_order_grid_config: {
        data: { columns: [{ key: "so", visible: false, order: 0, width: 90 }], options: {} },
        error: null,
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(CONFIG_URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      config: { columns: Array<{ key: string; visible: boolean }> };
    };
    expect(body.config.columns).toHaveLength(SO_GRID_COLUMNS.length);
    const so = body.config.columns.find((c) => c.key === "so");
    expect(so?.visible).toBe(false); // stored override wins
  });
});

// =====================================================================
// PUT /config
// =====================================================================
describe("PUT /api/operation/sales-order-maintenance/config", () => {
  const validBody = JSON.stringify({
    columns: [{ key: "so", visible: true, order: 0, width: 120 }],
    options: { status: ["place", "delivered"] },
  });

  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(CONFIG_URL, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: validBody,
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("422 when columns is not an array", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(CONFIG_URL, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ columns: "nope", options: {} }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("200 — calls the RPC and echoes the merged config", async () => {
    const sb = makeSb(
      { sales_order_grid_config: { data: { columns: [], options: {} }, error: null } },
      { data: null, error: null },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(CONFIG_URL, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: validBody,
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("set_sales_order_grid_config", {
      p_columns: [{ key: "so", visible: true, order: 0, width: 120 }],
      p_options: { status: ["place", "delivered"] },
    });
    const body = (await res.json()) as { config: { columns: unknown[] } };
    expect(body.config.columns).toHaveLength(SO_GRID_COLUMNS.length);
  });

  it("maps a PG RLS denial (42501) → 403", async () => {
    const sb = makeSb(
      {},
      { data: null, error: { code: "42501", message: "forbidden" } },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(CONFIG_URL, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: validBody,
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// =====================================================================
// 0219 — GET/PUT /entry-config (Order Entry: payment methods + form fields)
// =====================================================================

const ENTRY_URL = "http://t/api/operation/sales-order-maintenance/entry-config";

describe("GET /api/operation/sales-order-maintenance/entry-config", () => {
  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(ENTRY_URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns the LENIENTLY parsed singleton (garbage jsonb degrades to empty)", async () => {
    const sb = makeSb({
      order_entry_config: {
        data: {
          payment_methods: [
            {
              key: "cash",
              label: "Cash",
              sublabel: "Paid in store",
              active: true,
              approvalCodeRequired: false,
              followUps: [],
            },
          ],
          form_fields: "garbage-not-an-object",
        },
        error: null,
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(ENTRY_URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entryConfig: { paymentMethods: Array<{ key: string }>; formFields: object };
    };
    expect(body.entryConfig.paymentMethods.map((m) => m.key)).toEqual(["cash"]);
    expect(body.entryConfig.formFields).toEqual({}); // lenient fallback
  });
});

describe("PUT /api/operation/sales-order-maintenance/entry-config", () => {
  const validEntryBody = JSON.stringify({
    paymentMethods: [
      {
        key: "credit",
        label: "Credit / Debit",
        sublabel: "Full payment",
        active: true,
        approvalCodeRequired: true,
        followUps: [
          { key: "bank", label: "Bank", options: ["Maybank", "CIMB Bank"], required: true },
        ],
      },
    ],
    formFields: {
      customer: { builtins: { race: { enabled: true, required: false } }, custom: [] },
    },
  });

  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(ENTRY_URL, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: validEntryBody,
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("422 on a non-kebab method key", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(ENTRY_URL, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethods: [
            {
              key: "Bad Key!",
              label: "X",
              sublabel: "",
              active: true,
              approvalCodeRequired: false,
              followUps: [],
            },
          ],
          formFields: {},
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("200 — calls set_order_entry_config and echoes the parsed row", async () => {
    const sb = makeSb(
      {},
      {
        data: {
          payment_methods: JSON.parse(validEntryBody).paymentMethods,
          form_fields: JSON.parse(validEntryBody).formFields,
        },
        error: null,
      },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(ENTRY_URL, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: validEntryBody,
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("set_order_entry_config", {
      p_payment_methods: JSON.parse(validEntryBody).paymentMethods,
      p_form_fields: JSON.parse(validEntryBody).formFields,
    });
    const body = (await res.json()) as {
      entryConfig: { paymentMethods: Array<{ key: string; followUps: unknown[] }> };
    };
    expect(body.entryConfig.paymentMethods[0]?.key).toBe("credit");
    expect(body.entryConfig.paymentMethods[0]?.followUps).toHaveLength(1);
  });

  it("maps the RPC role-gate denial (42501) → 403", async () => {
    const sb = makeSb({}, { data: null, error: { code: "42501", message: "forbidden" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(ENTRY_URL, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: validEntryBody,
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
