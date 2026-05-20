import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import app from "../index";
import { _setJwksForTesting } from "../middleware/auth";
import type { AutocountImportResponse } from "@carres/shared";

vi.mock("../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));

import { userClient } from "../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-import";
const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};
const DEALER_HOUSE = "00000000-0000-0000-0000-0000000000d1";

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({ email: "ops@carres.com", app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000777")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

type RpcReply = { data: unknown; error: unknown };
type SbOpts = {
  rpcReply?: (payload: any) => RpcReply;
  // 0133: for /import → product_skus catalog resolution via .from('product_skus').select(...).in(...)
  catalog?: Array<{ sku: string; variant: string }>;
  // 0135/0136: for /accept-autocount-items + /ops-assign — row returned by
  // .from('orders').update(...).eq().eq().select(...).maybeSingle()
  orderUpdateRow?: Record<string, unknown> | null;
  orderUpdateError?: unknown;
  // 0136: for /inbox → row list from .from('orders').select(...).eq().eq().is().order()
  inboxRows?: Array<Record<string, unknown>>;
};
function buildSb(opts: SbOpts = {}) {
  const calls: Array<{ name: string; payload: any }> = [];
  const updateCalls: Array<{ table: string; patch: any; eqs: Array<[string, unknown]> }> = [];
  const sb = {
    rpc: async (name: string, args: { payload: any }) => {
      calls.push({ name, payload: args.payload });
      return (opts.rpcReply ?? (() => ({ data: null, error: { message: "no rpcReply configured" } })))(args.payload);
    },
    from: (table: string) => {
      const selectChain = (_cols?: string): any => {
        const chain: any = {
          // .in() is terminal: returns the catalog (product_skus path)
          in: async (_col: string, _vals: string[]) => ({
            data: opts.catalog ?? [],
            error: null,
          }),
          // .eq().is().order() chain for the /inbox read; resolves to inboxRows
          eq: () => chain,
          is: () => chain,
          order: async () => ({ data: opts.inboxRows ?? [], error: null }),
        };
        return chain;
      };
      const updateChain = (patch: any): any => {
        const eqs: Array<[string, unknown]> = [];
        const chain: any = {
          eq: (col: string, val: unknown) => {
            eqs.push([col, val]);
            return chain;
          },
          select: (_cols?: string) => ({
            maybeSingle: async () => {
              updateCalls.push({ table, patch, eqs });
              return {
                data: opts.orderUpdateRow ?? null,
                error: opts.orderUpdateError ?? null,
              };
            },
          }),
        };
        return chain;
      };
      return {
        select: selectChain,
        update: updateChain,
      };
    },
    _calls: calls,
    _updateCalls: updateCalls,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as any;
}

const row = (over: Record<string, unknown> = {}) => ({
  ref: "CR0418",
  itemGroup: "Mattress",
  qty: 1,
  detailDescription: "Breeze FirmCare-B1201F-K",
  poDocNo: "PO/2604-006",
  debtorName: "Felix Koh",
  phone: "012-6399285",
  addr1: "18 Jalan Cempaka",
  deliveryLocation: "Muar, Johor",
  balance: "RM3322 Paid",
  ...over,
});

function okReply(result = "created") {
  return (payload: any): RpcReply => ({
    data: {
      id: "00000000-0000-0000-0000-0000000000a1",
      so: 1251,
      source_ref: payload.source_ref,
      result,
    },
    error: null,
  });
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

async function post(jwt: string | null, body: unknown) {
  return app.fetch(
    new Request("http://t/api/orders/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      body: JSON.stringify(body),
    }),
    env,
  );
}

describe("POST /api/orders/import", () => {
  it("401 without Authorization", async () => {
    const res = await post(null, { dealerId: DEALER_HOUSE, rows: [row()] });
    expect(res.status).toBe(401);
  });

  it("403 for a non-operation/principal role", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ rpcReply: okReply() }));
    const jwt = await makeJwt("dealer");
    const res = await post(jwt, { dealerId: DEALER_HOUSE, rows: [row()] });
    expect(res.status).toBe(403);
  });

  it("400 on invalid body", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ rpcReply: okReply() }));
    const jwt = await makeJwt("operation");
    const res = await post(jwt, { dealerId: "not-a-uuid", rows: [] });
    expect(res.status).toBe(400);
  });

  it("groups rows sharing a Ref into one order; calls RPC once", async () => {
    const sb = buildSb({ rpcReply: okReply("created") });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await post(jwt, {
      dealerId: DEALER_HOUSE,
      rows: [
        row({ detailDescription: "Breeze FirmCare-B1201F-K", itemGroup: "Mattress" }),
        row({ detailDescription: "Essential Memory Pillow(L)", itemGroup: "Pillow", qty: 2 }),
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AutocountImportResponse;
    expect(body.ordersTotal).toBe(1);
    expect(body.created).toBe(1);
    expect(sb._calls).toHaveLength(1);
    expect(sb._calls[0].name).toBe("import_autocount_order");
    expect(sb._calls[0].payload.source_ref).toEqual(["CR0418"]);
    expect(sb._calls[0].payload.lines).toHaveLength(2);
    expect(sb._calls[0].payload.channel).toBe("showroom"); // CR prefix
  });

  it("splits a combined Ref into a sorted unique source_ref array", async () => {
    const sb = buildSb({ rpcReply: okReply() });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await post(jwt, {
      dealerId: DEALER_HOUSE,
      rows: [row({ ref: "TCF0282/CR1009" })],
    });
    expect(res.status).toBe(200);
    expect(sb._calls[0].payload.source_ref).toEqual(["CR1009", "TCF0282"]);
  });

  it("flags unmatched core items in the report (SKU resolver is a pending seam)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ rpcReply: okReply() }));
    const jwt = await makeJwt("operation");
    const res = await post(jwt, {
      dealerId: DEALER_HOUSE,
      rows: [
        row({ itemGroup: "Sofa", detailDescription: "Glano TH5090/30(2 Seater)" }),
        row({ itemGroup: "Service", detailDescription: "Sofa Disposal" }),
      ],
    });
    const body = (await res.json()) as AutocountImportResponse;
    expect(body.results[0].unmatchedDescriptions).toContain("Glano TH5090/30(2 Seater)");
    // Service rows are not core → not flagged
    expect(body.results[0].unmatchedDescriptions).not.toContain("Sofa Disposal");
  });

  it("passes through skipped_locked from the RPC", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ rpcReply: okReply("skipped_locked") }));
    const jwt = await makeJwt("principal");
    const res = await post(jwt, { dealerId: DEALER_HOUSE, rows: [row()] });
    const body = (await res.json()) as AutocountImportResponse;
    expect(body.skippedLocked).toBe(1);
    expect(body.results[0].result).toBe("skipped_locked");
  });

  it("records a per-order error instead of failing the whole batch", async () => {
    const sb = buildSb({ rpcReply: () => ({ data: null, error: { message: "boom" } }) });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await post(jwt, { dealerId: DEALER_HOUSE, rows: [row()] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AutocountImportResponse;
    expect(body.errored).toBe(1);
    expect(body.results[0].result).toBe("error");
    expect(body.results[0].error).toBe("boom");
  });

  it("resolves Description → Item Code via product_skus.variant (0133 seam)", async () => {
    const sb = buildSb({
      rpcReply: okReply(),
      catalog: [{ sku: "MS01-B1201F-K", variant: "Breeze FirmCare-B1201F-K" }],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await post(jwt, {
      dealerId: DEALER_HOUSE,
      rows: [row({ detailDescription: "Breeze FirmCare-B1201F-K" })],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AutocountImportResponse;
    // Resolved → no unmatched flag, even for core item
    expect(body.results[0].unmatchedDescriptions).toEqual([]);
    // RPC payload's first line uses canonical Item Code, NOT raw description
    expect(sb._calls[0].payload.lines[0].sku).toBe("MS01-B1201F-K");
  });

  // 0135 — portal-wins-AutoCount guard.
  it("buckets 'updated_items_locked' under updated count + keeps per-row distinction", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ rpcReply: okReply("updated_items_locked") }));
    const jwt = await makeJwt("operation");
    const res = await post(jwt, { dealerId: DEALER_HOUSE, rows: [row()] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AutocountImportResponse;
    // Counts: bucketed under "updated"
    expect(body.updated).toBe(1);
    expect(body.created).toBe(0);
    expect(body.skippedLocked).toBe(0);
    // Per-row detail preserves the locked label
    expect(body.results[0].result).toBe("updated_items_locked");
  });
});

// 0135 — one-shot unlock endpoint.
describe("POST /api/orders/:id/accept-autocount-items", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a1";

  async function postAccept(jwt: string | null, id: string) {
    return app.fetch(
      new Request(`http://t/api/orders/${id}/accept-autocount-items`, {
        method: "POST",
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      }),
      env,
    );
  }

  it("401 without Authorization", async () => {
    const res = await postAccept(null, ORDER_ID);
    expect(res.status).toBe(401);
  });

  it("403 for non-operation/principal role", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ rpcReply: okReply() }));
    const jwt = await makeJwt("dealer");
    const res = await postAccept(jwt, ORDER_ID);
    expect(res.status).toBe(403);
  });

  it("clears items_edited and returns the row (operation role)", async () => {
    const sb = buildSb({
      rpcReply: okReply(),
      orderUpdateRow: { id: ORDER_ID, items_edited: false },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await postAccept(jwt, ORDER_ID);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; items_edited: boolean };
    expect(body.id).toBe(ORDER_ID);
    expect(body.items_edited).toBe(false);
    // Confirm the UPDATE patched the right column + was scoped to id + status='place'
    expect(sb._updateCalls).toHaveLength(1);
    expect(sb._updateCalls[0].patch.items_edited).toBe(false);
    const eqMap = new Map(sb._updateCalls[0].eqs);
    expect(eqMap.get("id")).toBe(ORDER_ID);
    expect(eqMap.get("status")).toBe("place");
  });

  it("404 when no matching row (already past 'place' or RLS-hidden)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({ rpcReply: okReply(), orderUpdateRow: null /* no row returned */ }),
    );
    const jwt = await makeJwt("operation");
    const res = await postAccept(jwt, ORDER_ID);
    expect(res.status).toBe(404);
  });

  it("admits principal role too (mirrors /import gate)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({ rpcReply: okReply(), orderUpdateRow: { id: ORDER_ID, items_edited: false } }),
    );
    const jwt = await makeJwt("principal");
    const res = await postAccept(jwt, ORDER_ID);
    expect(res.status).toBe(200);
  });
});

// 0136 — Inbox triage assignment.
describe("POST /api/orders/:id/ops-assign", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a1";
  const PARTNER_ID = "00000000-0000-0000-0000-0000000000e1";

  async function postAssign(jwt: string | null, id: string, body: unknown) {
    return app.fetch(
      new Request(`http://t/api/orders/${id}/ops-assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify(body),
      }),
      env,
    );
  }

  it("401 without Authorization", async () => {
    const res = await postAssign(null, ORDER_ID, { deliveryPartnerId: PARTNER_ID });
    expect(res.status).toBe(401);
  });

  it("403 for non-operation/principal role", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ rpcReply: okReply() }));
    const jwt = await makeJwt("dealer");
    const res = await postAssign(jwt, ORDER_ID, { deliveryPartnerId: PARTNER_ID });
    expect(res.status).toBe(403);
  });

  it("400 on invalid input (non-uuid)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ rpcReply: okReply() }));
    const jwt = await makeJwt("operation");
    const res = await postAssign(jwt, ORDER_ID, { deliveryPartnerId: "not-a-uuid" });
    expect(res.status).toBe(400);
  });

  it("sets ops_assigned_logistic to a partner uuid (operation)", async () => {
    const sb = buildSb({
      rpcReply: okReply(),
      orderUpdateRow: { id: ORDER_ID, ops_assigned_logistic: PARTNER_ID },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await postAssign(jwt, ORDER_ID, { deliveryPartnerId: PARTNER_ID });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; ops_assigned_logistic: string | null };
    expect(body.ops_assigned_logistic).toBe(PARTNER_ID);
    // Update patched the right column scoped to id + status='place'
    expect(sb._updateCalls).toHaveLength(1);
    expect(sb._updateCalls[0].patch.ops_assigned_logistic).toBe(PARTNER_ID);
    const eqMap = new Map(sb._updateCalls[0].eqs);
    expect(eqMap.get("id")).toBe(ORDER_ID);
    expect(eqMap.get("status")).toBe("place");
  });

  it("clears ops_assigned_logistic when deliveryPartnerId=null (returns order to Inbox)", async () => {
    const sb = buildSb({
      rpcReply: okReply(),
      orderUpdateRow: { id: ORDER_ID, ops_assigned_logistic: null },
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await postAssign(jwt, ORDER_ID, { deliveryPartnerId: null });
    expect(res.status).toBe(200);
    expect(sb._updateCalls[0].patch.ops_assigned_logistic).toBeNull();
  });

  it("404 when no row matches (not at status='place' or RLS-hidden)", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({ rpcReply: okReply(), orderUpdateRow: null }),
    );
    const jwt = await makeJwt("operation");
    const res = await postAssign(jwt, ORDER_ID, { deliveryPartnerId: PARTNER_ID });
    expect(res.status).toBe(404);
  });
});

// 0136 — Inbox triage queue.
describe("GET /api/orders/inbox", () => {
  async function getInbox(jwt: string | null) {
    return app.fetch(
      new Request("http://t/api/orders/inbox", {
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      }),
      env,
    );
  }

  it("401 without Authorization", async () => {
    const res = await getInbox(null);
    expect(res.status).toBe(401);
  });

  it("403 for non-operation/principal role", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ rpcReply: okReply() }));
    const jwt = await makeJwt("dealer");
    const res = await getInbox(jwt);
    expect(res.status).toBe(403);
  });

  it("returns the filtered Inbox rows (operation)", async () => {
    const rows = [
      {
        id: "11111111-1111-1111-1111-000000000001",
        so: 1252,
        customer_name: "Felix Koh",
        ops_assigned_logistic: null,
      },
      {
        id: "11111111-1111-1111-1111-000000000002",
        so: 1253,
        customer_name: "Tan Win Shen",
        ops_assigned_logistic: null,
      },
    ];
    vi.mocked(userClient).mockReturnValue(
      buildSb({ rpcReply: okReply(), inboxRows: rows }),
    );
    const jwt = await makeJwt("operation");
    const res = await getInbox(jwt);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orders: typeof rows; total: number };
    expect(body.total).toBe(2);
    expect(body.orders[0].so).toBe(1252);
    expect(body.orders[1].so).toBe(1253);
  });

  it("returns empty list when nothing in Inbox", async () => {
    vi.mocked(userClient).mockReturnValue(
      buildSb({ rpcReply: okReply(), inboxRows: [] }),
    );
    const jwt = await makeJwt("principal");
    const res = await getInbox(jwt);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orders: unknown[]; total: number };
    expect(body.total).toBe(0);
    expect(body.orders).toEqual([]);
  });
});
