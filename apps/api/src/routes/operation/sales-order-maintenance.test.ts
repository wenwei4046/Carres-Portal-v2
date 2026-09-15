import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
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

async function makeJwt(role: string) {
  return signTestJwt("u1", { email: `${role}@x`, app_metadata: { role } });
}

type Result = { data: unknown; error: unknown };

/** Thenable query-builder mock: `await from(t).select()...` resolves to the
 *  table's result; `.maybeSingle()` resolves to it too. Keyed by table name. */
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

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

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
