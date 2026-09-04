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
import { userClient } from "../../lib/supabase";

/**
 * R6 — /api/operation/warehouse-receipts (the ops half).
 *
 * The two claims under test: check-in goes through the ONE receive engine (this
 * router never books stock itself), and a send-back cannot happen without a
 * reason the warehouse can act on.
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

const WH = "00000000-0000-0000-0000-000000000c03";
const USER = "00000000-0000-0000-0000-0000000000aa";
const COVER = "00000000-0000-0000-0000-0000000000bb";
const RECEIPT = "22222222-2222-2222-2222-222222222222";
const SITE = "00000000-0000-0000-0000-000000000c04";
const LINE = "33333333-3333-3333-3333-333333333333";
const SAVE_KEY = "44444444-4444-4444-4444-444444444444";

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

type Result = { data: unknown; error: unknown };
type TableCfg = { list?: Result; count?: number; single?: Result };

function makeSb(
  tables: Record<string, TableCfg>,
  rpcResult: { data?: unknown; error?: unknown } = {},
) {
  const sb = {
    rpc: vi.fn().mockResolvedValue({
      data: rpcResult.data ?? null,
      error: rpcResult.error ?? null,
    }),
    from(table: string) {
      const cfg = tables[table] ?? {};
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const m of ["eq", "in", "order", "limit"]) builder[m] = vi.fn(chain);
      // GET /:id reads one row — resolves to the table's `single` config.
      builder.maybeSingle = vi.fn(() =>
        Promise.resolve(cfg.single ?? { data: null, error: null }),
      );
      builder.select = vi.fn((_cols: string, opts?: { head?: boolean }) => {
        if (opts?.head) {
          // A head-count resolves straight to { count } — no rows.
          const headBuilder: Record<string, unknown> = {};
          headBuilder.eq = vi.fn(() => headBuilder);
          headBuilder.then = (resolve: (r: unknown) => unknown) =>
            Promise.resolve({ count: cfg.count ?? 0, error: null }).then(resolve);
          return headBuilder;
        }
        return builder;
      });
      builder.then = (
        resolve: (r: Result) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve(cfg.list ?? { data: [], error: null }).then(resolve, reject);
      return builder;
    },
  };
  return sb;
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

function req(path: string, method: string, jwt: string | null, body?: unknown) {
  return app.fetch(
    new Request(`http://t${path}`, {
      method,
      headers: {
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    env,
  );
}

const RECEIPT_ROW = {
  id: RECEIPT,
  po_id: "PO-1001",
  warehouse_id: WH,
  do_number: "DO-5512",
  do_file_path: "PO-1001/abc-do.jpg",
  note: null,
  status: "submitted",
  submitted_by: USER,
  submitted_at: "2026-07-27T02:00:00Z",
  reviewed_by: null,
  reviewed_at: null,
  return_reason: null,
  lines: [
    {
      id: "l1",
      sku: "MS01-K",
      received_now: 4,
      damaged_qty: 1,
      wrong_item_qty: 0,
      wrong_item_claim_type: null,
    },
  ],
};

function opsTables(row: Record<string, unknown> = RECEIPT_ROW) {
  return {
    warehouse_receipts: { list: { data: [row], error: null }, count: 1 },
    warehouses: { list: { data: [{ id: WH, name: "Carres Klang" }], error: null } },
    purchase_orders: {
      list: {
        data: [{ id: "PO-1001", supplier_id: "s1", suppliers: { name: "Ohana" } }],
        error: null,
      },
    },
    app_users: { list: { data: [{ id: USER, name: "Klang counter" }], error: null } },
  };
}

describe("who may review a warehouse count", () => {
  it("401 without Authorization", async () => {
    expect(
      (await req("/api/operation/warehouse-receipts", "GET", null)).status,
    ).toBe(401);
  });

  it("403 for the warehouse itself — it files, it does not approve", async () => {
    const jwt = await makeJwt("warehouse");
    const res = await req("/api/operation/warehouse-receipts", "GET", jwt);
    expect(res.status).toBe(403);
  });

  it("403 for a dealer", async () => {
    const jwt = await makeJwt("dealer");
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/check-in`,
      "POST",
      jwt,
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/operation/warehouse-receipts", () => {
  it("names the warehouse, the supplier and who counted, and says what arrived", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(opsTables()) as any);
    const res = await req(
      "/api/operation/warehouse-receipts",
      "GET",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      receipts: Array<Record<string, unknown>>;
      counts: { waiting: number };
    };
    expect(body.receipts[0]).toMatchObject({
      po_id: "PO-1001",
      warehouse_name: "Carres Klang",
      supplier_name: "Ohana",
      submitted_by_name: "Klang counter",
      summary: "4 good · 1 damaged",
      opens_claims: true,
    });
    expect(body.counts.waiting).toBe(1);
  });

  it("says a clean count opens no claims", async () => {
    const clean = {
      ...RECEIPT_ROW,
      lines: [
        {
          id: "l1",
          sku: "MS01-K",
          received_now: 4,
          damaged_qty: 0,
          wrong_item_qty: 0,
          wrong_item_claim_type: null,
        },
      ],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(opsTables(clean)) as any);
    const res = await req(
      "/api/operation/warehouse-receipts",
      "GET",
      await makeJwt("operation"),
    );
    const body = (await res.json()) as { receipts: Array<Record<string, unknown>> };
    expect(body.receipts[0].opens_claims).toBe(false);
    expect(body.receipts[0].summary).toBe("4 good");
  });

  it("defaults to the waiting queue, not the filing cabinet", async () => {
    const sb = makeSb(opsTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const spy = vi.spyOn(sb, "from");
    await req(
      "/api/operation/warehouse-receipts",
      "GET",
      await makeJwt("operation"),
    );
    // The first builder is the list query; its `.eq` must have narrowed to
    // submitted.
    const builder = spy.mock.results[0].value as { eq: ReturnType<typeof vi.fn> };
    expect(builder.eq).toHaveBeenCalledWith("status", "submitted");
  });

  it("honours ?status=all by not narrowing at all", async () => {
    const sb = makeSb(opsTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const spy = vi.spyOn(sb, "from");
    await req(
      "/api/operation/warehouse-receipts?status=all",
      "GET",
      await makeJwt("operation"),
    );
    const builder = spy.mock.results[0].value as { eq: ReturnType<typeof vi.fn> };
    expect(builder.eq).not.toHaveBeenCalled();
  });

  it("falls back to the waiting queue on a status nobody defined", async () => {
    const sb = makeSb(opsTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const spy = vi.spyOn(sb, "from");
    await req(
      "/api/operation/warehouse-receipts?status=whatever",
      "GET",
      await makeJwt("operation"),
    );
    const builder = spy.mock.results[0].value as { eq: ReturnType<typeof vi.fn> };
    expect(builder.eq).toHaveBeenCalledWith("status", "submitted");
  });
});

describe("POST /:id/check-in", () => {
  it("delegates to the one check-in RPC and sends no numbers of its own", async () => {
    const sb = makeSb(opsTables(), {
      data: { receipt_id: RECEIPT, po_id: "PO-1001", status: "checked_in" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/check-in`,
      "POST",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(sb.rpc).toHaveBeenCalledWith("warehouse_receipt_check_in", {
      p_receipt_id: RECEIPT,
      // 0426 — no body means no Actual Site override; the PO's own booked
      // warehouse stays the site.
      p_actual_site_id: null,
    });
    // "ops only reviews" — this router must never call the receive engine
    // directly, or there would be two receive paths to keep in step.
    expect(sb.rpc.mock.calls.map((c) => c[0])).not.toContain(
      "operation_receive_po_with_do",
    );
  });

  it("admits the principal like every other Operations surface", async () => {
    const sb = makeSb(opsTables(), { data: { status: "checked_in" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/check-in`,
      "POST",
      await makeJwt("principal"),
    );
    expect(res.status).toBe(200);
  });

  it("passes an already-reviewed refusal straight through", async () => {
    const sb = makeSb(opsTables(), {
      error: {
        code: "22023",
        message: "this receiving has already been reviewed",
        details: "receipt_not_open",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/check-in`,
      "POST",
      await makeJwt("operation"),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await res.json())).toContain("already been reviewed");
  });

  it("passes an Actual Site override through when the body names one (0426)", async () => {
    const sb = makeSb(opsTables(), { data: { status: "posted" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/check-in`,
      "POST",
      await makeJwt("operation"),
      { actualSiteId: SITE },
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("warehouse_receipt_check_in", {
      p_receipt_id: RECEIPT,
      p_actual_site_id: SITE,
    });
  });
});

describe("POST /:id/send-back", () => {
  it("records the reason with the return", async () => {
    const sb = makeSb(opsTables(), { data: { status: "returned" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/send-back`,
      "POST",
      await makeJwt("operation"),
      { reason: "  DO photo is unreadable — send it again  " },
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("warehouse_receipt_return", {
      p_receipt_id: RECEIPT,
      p_reason: "DO photo is unreadable — send it again",
    });
  });

  it("422 with no reason — a review that only approves is not a review", async () => {
    const sb = makeSb(opsTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    for (const body of [{}, { reason: "" }, { reason: "   " }]) {
      const res = await req(
        `/api/operation/warehouse-receipts/${RECEIPT}/send-back`,
        "POST",
        await makeJwt("operation"),
        body,
      );
      expect(res.status).toBe(422);
    }
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

// ── 0426 — GET /duty · GET /:id · amend · void ──────────────────────────────

describe("GET /duty", () => {
  const dutyTables = {
    app_users: {
      list: {
        data: [
          { id: USER, name: "Klang counter" },
          { id: COVER, name: "Buddy cover" },
        ],
        error: null,
      },
    },
  };

  it("resolves today's Receiving owner through the one RPC, names attached", async () => {
    const sb = makeSb(dutyTables, {
      data: { on_duty: true, normal_user_id: USER, acting_user_id: COVER },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      "/api/operation/warehouse-receipts/duty",
      "GET",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("receiving_actor_context");
    expect(await res.json()).toMatchObject({
      on_duty: true,
      normal_user_id: USER,
      acting_user_id: COVER,
      normal_user_name: "Klang counter",
      acting_user_name: "Buddy cover",
    });
  });

  it("is not swallowed by /:id — `duty` never becomes a receipt lookup", async () => {
    const sb = makeSb(dutyTables, { data: { on_duty: false } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const spy = vi.spyOn(sb, "from");
    const res = await req(
      "/api/operation/warehouse-receipts/duty",
      "GET",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(200);
    // The word `duty` must route to the duty context, not be read as an id.
    expect(spy.mock.calls.map((c) => c[0])).not.toContain("warehouse_receipts");
    expect(sb.rpc).toHaveBeenCalledWith("receiving_actor_context");
  });

  it("403 for a dealer — duty is an Operations fact", async () => {
    const res = await req(
      "/api/operation/warehouse-receipts/duty",
      "GET",
      await makeJwt("dealer"),
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /:id — one Receiving Session / GRN record", () => {
  const DETAIL_ROW = {
    ...RECEIPT_ROW,
    status: "posted",
    grn_no: "GRN-20260904-0001",
    actual_site_id: SITE,
    posted_by: USER,
    posted_at: "2026-09-04T03:00:00Z",
    posted_duty_holder: USER,
    posted_duty_cover: COVER,
    posted_authority: "cover",
    void_at: null,
    void_by: null,
    void_reason: null,
  };

  function detailTables() {
    return {
      warehouse_receipts: { single: { data: DETAIL_ROW, error: null } },
      receiving_unit_results: {
        list: {
          data: [
            {
              stock_item_id: "si1",
              unit_code: "MS01-K-0001",
              outcome: "good",
              issue_kind: null,
              note: null,
            },
          ],
          error: null,
        },
      },
      receiving_events: {
        list: {
          data: [
            {
              id: "e1",
              receipt_id: RECEIPT,
              event: "posted",
              actor_id: COVER,
              event_at: "2026-09-04T03:00:00Z",
              payload: {},
            },
          ],
          error: null,
        },
      },
      purchase_orders: {
        single: {
          data: {
            id: "PO-1001",
            supplier_id: "s1",
            warehouse_id: WH,
            destination_id: null,
            suppliers: { name: "Ohana" },
            purchase_order_lines: [
              {
                id: LINE,
                sku: "MS01-K",
                qty: 5,
                received_qty: 4,
                damaged_qty: 1,
                wrong_item_qty: 0,
              },
            ],
          },
          error: null,
        },
      },
      app_users: {
        list: {
          data: [
            { id: USER, name: "Klang counter" },
            { id: COVER, name: "Buddy cover" },
          ],
          error: null,
        },
      },
      warehouses: {
        list: {
          data: [
            { id: WH, name: "Carres Klang" },
            { id: SITE, name: "Carres Setia Alam" },
          ],
          error: null,
        },
      },
    };
  }

  it("returns the record with its unit results, events, PO and resolved names", async () => {
    const sb = makeSb(detailTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}`,
      "GET",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      receipt: Record<string, unknown>;
      po: Record<string, unknown> | null;
      events: Array<Record<string, unknown>>;
    };
    expect(body.receipt).toMatchObject({
      id: RECEIPT,
      grn_no: "GRN-20260904-0001",
      supplier_name: "Ohana",
      warehouse_name: "Carres Klang",
      // The Actual Site is a different place than the PO booked — both named.
      actual_site_name: "Carres Setia Alam",
      posted_by_name: "Klang counter",
      posted_duty_holder_name: "Klang counter",
      posted_duty_cover_name: "Buddy cover",
    });
    expect(body.receipt.unit_results).toEqual([
      {
        stock_item_id: "si1",
        unit_code: "MS01-K-0001",
        outcome: "good",
        issue_kind: null,
        note: null,
      },
    ]);
    expect(body.po).toMatchObject({ id: "PO-1001" });
    expect(body.events[0]).toMatchObject({ event: "posted", actor_name: "Buddy cover" });
  });

  it("404 when the record is not there", async () => {
    const sb = makeSb({
      ...detailTables(),
      warehouse_receipts: { single: { data: null, error: null } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}`,
      "GET",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "receipt not found" });
  });
});

describe("POST /:id/amend", () => {
  it("422 without a reason — a correction that cannot explain itself is refused before the database", async () => {
    const sb = makeSb(opsTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    for (const body of [{}, { reason: "" }, { reason: "ab" }]) {
      const res = await req(
        `/api/operation/warehouse-receipts/${RECEIPT}/amend`,
        "POST",
        await makeJwt("operation"),
        body,
      );
      expect(res.status).toBe(422);
    }
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("maps the camelCase body onto receiving_amend's snake_case p_changes", async () => {
    const sb = makeSb(opsTables(), { data: { status: "posted" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/amend`,
      "POST",
      await makeJwt("operation"),
      {
        reason: "DO number was mistyped at the gate",
        saveKey: SAVE_KEY,
        goodsReceivedAt: "2026-09-01",
        doNumber: "DO-9001",
        actualSiteId: SITE,
        lines: [{ id: LINE, receivedNow: 5 }],
      },
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(sb.rpc).toHaveBeenCalledWith("receiving_amend", {
      p_receipt_id: RECEIPT,
      p_reason: "DO number was mistyped at the gate",
      p_changes: {
        goods_received_at: "2026-09-01",
        do_number: "DO-9001",
        actual_site_id: SITE,
        lines: [{ id: LINE, received_now: 5 }],
      },
      p_save_key: SAVE_KEY,
    });
  });

  it("a field the body does not name stays OUT of p_changes — absent is not null", async () => {
    const sb = makeSb(opsTables(), { data: { status: "posted" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/amend`,
      "POST",
      await makeJwt("operation"),
      { reason: "wrong DO number only", doNumber: "DO-9002" },
    );
    expect(sb.rpc).toHaveBeenCalledWith("receiving_amend", {
      p_receipt_id: RECEIPT,
      p_reason: "wrong DO number only",
      p_changes: { do_number: "DO-9002" },
      p_save_key: null,
    });
  });

  it("a duty refusal from the RPC comes back as 403, not a 500", async () => {
    const sb = makeSb(opsTables(), {
      error: {
        code: "42501",
        message: "you are not on Receiving duty today",
        details: "not_grn_duty",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/amend`,
      "POST",
      await makeJwt("operation"),
      { reason: "correcting the received count" },
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("forbidden");
    expect(body.message).toContain("not on Receiving duty");
  });
});

describe("POST /:id/void", () => {
  it("422 without a reason — nothing voids silently", async () => {
    const sb = makeSb(opsTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    for (const body of [{}, { reason: "" }, { reason: "ab" }]) {
      const res = await req(
        `/api/operation/warehouse-receipts/${RECEIPT}/void`,
        "POST",
        await makeJwt("operation"),
        body,
      );
      expect(res.status).toBe(422);
    }
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("records the reason with the void through the one RPC", async () => {
    const sb = makeSb(opsTables(), { data: { status: "voided" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/void`,
      "POST",
      await makeJwt("operation"),
      { reason: "raised against the wrong PO" },
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("receiving_void", {
      p_receipt_id: RECEIPT,
      p_reason: "raised against the wrong PO",
    });
  });

  it("passes a downstream blocker straight through by name", async () => {
    const sb = makeSb(opsTables(), {
      error: {
        code: "P0001",
        message: "a Unit from this receiving has already been delivered",
        details: "units_moved_on",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/void`,
      "POST",
      await makeJwt("operation"),
      { reason: "raised against the wrong PO" },
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("units_moved_on");
  });
});
