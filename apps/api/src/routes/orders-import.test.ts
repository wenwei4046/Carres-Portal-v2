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
  const calls: Array<{ name: string; payload: any; payloads?: any[] }> = [];
  const updateCalls: Array<{ table: string; patch: any; eqs: Array<[string, unknown]> }> = [];
  const sb = {
    rpc: async (name: string, args: { payload?: any; payloads?: any[] }) => {
      calls.push({ name, payload: args.payload, payloads: args.payloads });
      const reply =
        opts.rpcReply ?? (() => ({ data: null, error: { message: "no rpcReply configured" } }));
      // 0143: /import batches via import_autocount_orders({ payloads }), which
      // returns a per-order result ARRAY. Fan the per-order reply across each
      // payload; a per-order { error } becomes a { result:'error' } element,
      // mirroring the RPC's in-loop BEGIN/EXCEPTION isolation.
      if (name === "import_autocount_orders") {
        const out = (args.payloads ?? []).map((p) => {
          const r = reply(p);
          if (r.error) {
            return {
              id: null,
              so: null,
              source_ref: p.source_ref,
              result: "error",
              error: (r.error as { message?: string }).message ?? "error",
            };
          }
          return r.data;
        });
        return { data: out, error: null };
      }
      return reply(args.payload);
    },
    from: (table: string) => {
      const selectChain = (_cols?: string): any => {
        const chain: any = {
          // .in() is terminal: returns the catalog (product_skus path)
          in: async (_col: string, _vals: string[]) => ({
            data: opts.catalog ?? [],
            error: null,
          }),
          // 2026-06-04: /import switched to .filter("variant","in",...) so
          // descriptions containing `"` (sofa codes) survive the URL escape
          // bug in supabase-js .in(). Same catalog payload as .in() since the
          // intent is identical (resolve description → sku).
          filter: async (_col: string, _op: string, _val: string) => ({
            data: opts.catalog ?? [],
            error: null,
          }),
          // 2026-06-04 (later): resolver now reads the WHOLE catalog via
          // paginated .range() so the model-family fallback (Layer 3) can run
          // in-memory. Return the same catalog payload — the resolver does
          // the matching itself.
          range: async (_from: number, _to: number) => ({
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

  // 2026-06-04 — surface the failing zod path. Before this, ops saw
  // "Invalid import input: String must contain at least 1 character(s)" with
  // no hint as to WHICH of 192 rows or WHICH field; tracing it took a node
  // diagnostic. The path lets the message read like
  // "Invalid import input at rows.1.itemGroup: …" so the bad CSV row is
  // immediately obvious.
  it("400 message includes the failing zod path (rows.<i>.<field>)", async () => {
    vi.mocked(userClient).mockReturnValue(buildSb({ rpcReply: okReply() }));
    const jwt = await makeJwt("operation");
    const res = await post(jwt, {
      dealerId: DEALER_HOUSE,
      rows: [row(), { ...row(), itemGroup: "" }], // row[1] mirrors the AutoCount discount-line case
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message?: string };
    expect(body.message ?? "").toContain("rows.1.itemGroup");
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
    expect(sb._calls[0].name).toBe("import_autocount_orders");
    expect(sb._calls[0].payloads).toHaveLength(1);
    expect(sb._calls[0].payloads[0].source_ref).toEqual(["CR0418"]);
    expect(sb._calls[0].payloads[0].lines).toHaveLength(2);
    expect(sb._calls[0].payloads[0].channel).toBe("showroom"); // CR prefix
  });

  // 0143 — the whole batch is ONE Supabase subrequest, no matter the order
  // count. Regression guard for the Cloudflare Workers Free-plan 50-subrequest
  // cap that truncated large imports (115 orders → 67 failed mid-batch).
  it("sends every grouped order in a single batch RPC call", async () => {
    const sb = buildSb({ rpcReply: okReply("created") });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await post(jwt, {
      dealerId: DEALER_HOUSE,
      rows: [
        row({ ref: "CR0001", detailDescription: "A" }),
        row({ ref: "CR0002", detailDescription: "B" }),
        row({ ref: "CR0003", detailDescription: "C" }),
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AutocountImportResponse;
    expect(body.ordersTotal).toBe(3);
    expect(body.created).toBe(3);
    // The critical assertion: exactly one subrequest carrying all three orders.
    expect(sb._calls).toHaveLength(1);
    expect(sb._calls[0].name).toBe("import_autocount_orders");
    expect(sb._calls[0].payloads).toHaveLength(3);
  });

  it("isolates a per-order failure inside the batch; good orders still recorded", async () => {
    const sb = buildSb({
      rpcReply: (payload: any) =>
        payload.lines[0].sku === "POISON"
          ? { data: null, error: { message: "bad sku" } }
          : okReply("created")(payload),
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await post(jwt, {
      dealerId: DEALER_HOUSE,
      rows: [
        row({ ref: "CR1000", detailDescription: "Good A" }),
        row({ ref: "CR1001", detailDescription: "POISON" }),
        row({ ref: "CR1002", detailDescription: "Good B" }),
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AutocountImportResponse;
    expect(sb._calls).toHaveLength(1); // still a single subrequest
    expect(body.ordersTotal).toBe(3);
    expect(body.created).toBe(2);
    expect(body.errored).toBe(1);
    // Error is zipped back to the RIGHT order by index.
    const poison = body.results.find((r) => r.sourceRef[0] === "CR1001");
    expect(poison?.result).toBe("error");
    expect(poison?.error).toBe("bad sku");
    const good = body.results.find((r) => r.sourceRef[0] === "CR1000");
    expect(good?.result).toBe("created");
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
    expect(sb._calls[0].payloads[0].source_ref).toEqual(["CR1009", "TCF0282"]);
  });

  // 2026-06-04 — Loo's 192-row CSV: 24 catalog hits silently lost because
  // supabase-js .in() doesn't backslash-escape `"` inside its IN-list values.
  // Sofa codes ("HK5531/28\"(2 Seater)/...") tripped it; PostgREST returned
  // 200 + 0 rows; ALL 109 distinct descriptions fell back to raw. Test guards
  // that resolution now goes through .filter("variant","in",...) and that a
  // catalog entry whose variant contains `"` is correctly matched + sent as
  // the canonical sku on the RPC payload (not the raw description).
  // 2026-06-04 — Loo: sofa specs explode (model × seater × colorway) so the
  // catalog can't enumerate every permutation. When an AutoCount description
  // can't exact-match OR color-strip-match anything, the resolver falls back
  // to a model-family lookup (same model identifier, best-fit seater) so
  // procurement still routes to the correct supplier. Approximate seater is
  // acceptable: the supplier-prefix on the resulting sku is what drives PO
  // routing; operation can adjust the exact line spec at PO creation if
  // needed. Test guards the fallback for a seater config (`(2+L Seater)`)
  // that doesn't exist in the catalog — we still map to the supplier's
  // closest (2 Seater) sku rather than dropping into raw-description mode.
  it("falls back to model-family match when seater config isn't in catalog (Layer 3)", async () => {
    const sb = buildSb({
      rpcReply: okReply("created"),
      catalog: [
        // 3 catalog rows under the HK5531/28" model family — none of them
        // exactly matches `(2+L Seater)`. Layer 3 should still pick the
        // closest by seater number (2).
        { sku: 'SF03-HK5531/28"(1+L)', variant: 'HK5531/28"(1+L)' },
        { sku: 'SF03-HK5531/28"(2 Seater)', variant: 'HK5531/28"(2 Seater)' },
        { sku: 'SF03-HK5531/28"(3 Seater)', variant: 'HK5531/28"(3 Seater)' },
      ],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await post(jwt, {
      dealerId: DEALER_HOUSE,
      rows: [
        row({
          ref: "TCF0448",
          itemGroup: "Sofa",
          detailDescription: 'HK5531/28"(2+L Seater)/COLOUR NINJA 08',
        }),
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AutocountImportResponse;
    // Should resolve via family fallback → no unmatched flagged for this row
    expect(body.results[0].unmatchedDescriptions).toEqual([]);
    // Best seater match within the family = `(2 Seater)`
    expect(sb._calls[0].payloads![0].lines[0].sku).toBe(
      'SF03-HK5531/28"(2 Seater)',
    );
  });

  // 2026-06-04 — AutoCount appends colorway suffix to Detail Description
  // ("/COL:NINJA-02", "/M2402-4 Sand", "/PC151-01" etc.) that the catalog
  // (product_skus.variant) doesn't store — the colorway lives in the sibling
  // sku (Item Code). Resolver now color-strips before catalog lookup so 38
  // more lines find their canonical sku (Loo: 24/109 → 62/109 recovered).
  it("resolves descriptions whose colorway suffix isn't in the catalog (Col:/COLOUR/fabric codes)", async () => {
    const sb = buildSb({
      rpcReply: okReply("created"),
      catalog: [
        // catalog stores stripped model+seater; sku carries the colorway
        { sku: "SF02-DSL8019-3S", variant: 'Muro DSL8019/30"(3 Seater)' },
        { sku: "BF04-1013Jager/Fab3-Q", variant: "1013Jager/Fab3-Queen" },
      ],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await post(jwt, {
      dealerId: DEALER_HOUSE,
      rows: [
        row({
          ref: "TCF0383",
          itemGroup: "Sofa",
          detailDescription: 'Muro DSL8019/30"(3 Seater)/Col:NINJA-02',
        }),
        row({
          ref: "CR1124",
          itemGroup: "Bed Fram",
          detailDescription: "1013Jager/Fab3-Queen/PC151-01",
        }),
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AutocountImportResponse;
    // Both core items should now be unflagged (resolved via color-strip)
    expect(body.results.flatMap((r) => r.unmatchedDescriptions)).toEqual([]);
    // RPC payload carries the catalog sku, NOT the raw description with colorway
    const payloads = sb._calls[0].payloads!;
    const lineSkus = payloads.flatMap((p: any) => p.lines.map((l: any) => l.sku)).sort();
    expect(lineSkus).toEqual(["BF04-1013Jager/Fab3-Q", "SF02-DSL8019-3S"]);
  });

  it("resolves descriptions containing double-quote characters via .filter() (not .in())", async () => {
    const sb = buildSb({
      rpcReply: okReply("created"),
      // catalog row whose variant contains an embedded `"`
      catalog: [{ sku: "SF03-HK5535-2L", variant: 'HK5531/28"(2+L Seater)' }],
    });
    vi.mocked(userClient).mockReturnValue(sb);
    const jwt = await makeJwt("operation");
    const res = await post(jwt, {
      dealerId: DEALER_HOUSE,
      rows: [row({ itemGroup: "Sofa", detailDescription: 'HK5531/28"(2+L Seater)' })],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AutocountImportResponse;
    expect(body.results[0].unmatchedDescriptions).toEqual([]);
    // RPC payload should carry the canonical sku, NOT the raw description.
    const lines = sb._calls[0].payloads![0].lines;
    expect(lines[0].sku).toBe("SF03-HK5535-2L");
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
    expect(sb._calls[0].payloads[0].lines[0].sku).toBe("MS01-B1201F-K");
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
