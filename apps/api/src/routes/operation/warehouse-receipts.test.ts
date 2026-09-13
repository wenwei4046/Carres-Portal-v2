import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
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

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));
import { adminClient, userClient } from "../../lib/supabase";

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
type TableCfg = {
  list?: Result;
  count?: number;
  single?: Result;
  /** Answer according to the SELECTED columns — lets a test reproduce a
   *  deployed schema that does not carry one optional column. */
  listBySelect?: (columns: string) => Result;
};

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
      for (const m of ["eq", "in", "order", "limit", "range"]) builder[m] = vi.fn(chain);
      // GET /:id reads one row — resolves to the table's `single` config.
      builder.maybeSingle = vi.fn(() =>
        Promise.resolve(cfg.single ?? { data: null, error: null }),
      );
      let selectedColumns = "";
      builder.select = vi.fn((_cols: string, opts?: { head?: boolean }) => {
        selectedColumns = _cols;
        if (opts?.head) {
          // A head-count resolves straight to { count } — no rows.
          const headBuilder: Record<string, unknown> = {};
          headBuilder.eq = vi.fn(() => headBuilder);
          headBuilder.then = (resolve: (r: unknown) => unknown) =>
            Promise.resolve({ count: cfg.count ?? 0, error: null }).then(
              resolve,
            );
          return headBuilder;
        }
        return builder;
      });
      builder.then = (
        resolve: (r: Result) => unknown,
        reject?: (e: unknown) => unknown,
      ) =>
        Promise.resolve(
          cfg.listBySelect?.(selectedColumns) ??
            cfg.list ?? { data: [], error: null },
        ).then(resolve, reject);
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
    warehouses: {
      list: { data: [{ id: WH, name: "Carres Klang" }], error: null },
    },
    purchase_orders: {
      list: {
        data: [
          { id: "PO-1001", supplier_id: "s1", suppliers: { name: "Ohana" } },
        ],
        error: null,
      },
    },
    app_users: {
      list: { data: [{ id: USER, name: "Klang counter" }], error: null },
    },
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
  it("names an arrival source without inventing a purchase order", async () => {
    const tables = {
      ...opsTables(),
      warehouse_receipts: {
        list: {
          data: [
            {
              ...RECEIPT_ROW,
              po_id: null,
              arrival_source_id: RECEIPT,
              do_file_path: null,
            },
          ],
          error: null,
        },
        count: 1,
      },
      arrival_sources: {
        list: {
          data: [
            {
              id: RECEIPT,
              source_no: "TR-20260907-1",
              stock_operating_parties: { name: "Recorded carrier" },
            },
          ],
          error: null,
        },
      },
    };
    vi.mocked(userClient).mockReturnValue(makeSb(tables) as never);
    const res = await req(
      "/api/operation/warehouse-receipts",
      "GET",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      receipts: Array<Record<string, unknown>>;
    };
    expect(body.receipts[0]).toMatchObject({
      po_id: null,
      source_no: "TR-20260907-1",
      source_party_name: "Recorded carrier",
    });
  });

  it("opens on the deployed schema, where warehouse_receipts has no arrival_source_id", async () => {
    /* PRODUCTION SHAPE, 2026-09-07: `arrival_source_id` lands with the
       arrival-source tables, still an unnumbered draft. The register read
       must fall back to the same rows without that one column instead of
       failing — this is the shape that shipped broken. */
    const selects: string[] = [];
    const base = opsTables();
    const rows = base.warehouse_receipts?.list ?? { data: [], error: null };
    vi.mocked(userClient).mockReturnValue(
      makeSb({
        ...base,
        warehouse_receipts: {
          ...base.warehouse_receipts,
          listBySelect: (columns: string) => {
            selects.push(columns);
            return columns.includes("arrival_source_id")
              ? {
                  data: null,
                  error: {
                    code: "42703",
                    message:
                      "column warehouse_receipts.arrival_source_id does not exist",
                  },
                }
              : (rows as never);
          },
        },
      }) as never,
    );
    const res = await req(
      "/api/operation/warehouse-receipts",
      "GET",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { receipts: unknown[] };
    expect(body.receipts.length).toBeGreaterThan(0);
    expect(selects.some((c) => !c.includes("arrival_source_id"))).toBe(true);
  });

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
    const body = (await res.json()) as {
      receipts: Array<Record<string, unknown>>;
    };
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
    const builder = spy.mock.results[0].value as {
      eq: ReturnType<typeof vi.fn>;
    };
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
    const builder = spy.mock.results[0].value as {
      eq: ReturnType<typeof vi.fn>;
    };
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
    const builder = spy.mock.results[0].value as {
      eq: ReturnType<typeof vi.fn>;
    };
    expect(builder.eq).toHaveBeenCalledWith("status", "submitted");
  });
});

describe("GET /?scope=grn — the paged GRN Register", () => {
  const POSTED = {
    ...RECEIPT_ROW,
    status: "posted",
    grn_no: "GRN-20260906-1234",
    goods_received_at: "2026-09-01",
  };

  it("answers a PAGE — rows, facets, the whole-set total — with the governed supplier date and product words attached", async () => {
    const sb = makeSb({
      warehouse_receipts: { list: { data: [POSTED], error: null }, count: 0 },
      warehouses: { list: { data: [{ id: WH, name: "Carres Klang" }], error: null } },
      purchase_orders: {
        list: {
          data: [
            {
              id: "PO-1001",
              version: 1,
              supplier_id: "s1",
              suppliers: { name: "Ohana" },
            },
          ],
          error: null,
        },
      },
      po_supplier_promises: {
        list: {
          data: [
            {
              po_id: "PO-1001",
              kind: "tomorrow_delivery",
              answer: "confirmed",
              about_date: null,
              new_date: "2026-09-08",
              po_version: 1,
              channel: "whatsapp",
              recipient: "Ohana group",
              evidence: "evidence/reply.jpg",
              reported_by: "Factory PIC",
              reported_at: "2026-09-01T02:00:00Z",
              recorded_by: USER,
              recorded_at: "2026-09-01T03:00:00Z",
            },
          ],
          error: null,
        },
      },
      product_skus: {
        list: { data: [{ sku: "MS01-K", variant: "Dream King" }], error: null },
      },
      app_users: { list: { data: [], error: null } },
    });
    // Capture the scan's own filters — `from()` mints a fresh builder per
    // call, so the assertion must listen at the door, not on a later builder.
    const inCalls: unknown[][] = [];
    const origFrom = sb.from.bind(sb);
    sb.from = (table: string) => {
      const b = origFrom(table);
      if (table === "warehouse_receipts") {
        const origIn = b.in as (...a: unknown[]) => unknown;
        b.in = vi.fn((...a: unknown[]) => {
          inCalls.push(a);
          return origIn(...a);
        });
      }
      return b;
    };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await req(
      "/api/operation/warehouse-receipts?scope=grn",
      "GET",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, never>;
    // `total_all` = every GRN before narrowing — the footer's other number.
    expect(body.page).toEqual({ offset: 0, limit: 50, total: 1, total_all: 1 });
    const rows = body.receipts as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    // The governed Supplier Delivery Date — the ONE reply arithmetic, and the
    // GRN paper's own product word — never a second spelling.
    expect(rows[0]!.supplier_delivery_date).toBe("2026-09-08");
    // The goods' FULL name — the ONE `Model · Variant` ladder (`grnLineName`,
    // 2026-09-13): the fixture's catalog names no model, so the current
    // catalog word alone cannot be a name and the SKU is printed, labelled
    // as such — never the variant alone.
    const labels = rows[0]!.line_labels as Record<string, { name: string; source: string }>;
    expect(Object.values(labels)[0]).toMatchObject({ name: "MS01-K", source: "sku" });
    expect(rows[0]!.grn_date).toBe(null);
    expect(rows[0]!.source_kind).toBe("PO");
    expect(rows[0]!.items).toBe(1);
    expect(rows[0]!.supplier_name).toBe("Ohana");
    const facets = body.facets as Record<string, Record<string, number>>;
    expect(facets.supplier).toEqual({ Ohana: 1 });
    expect(facets.site).toEqual({ "Carres Klang": 1 });
    // The scan asked for the Register BOUNDARY — posted/voided only.
    expect(inCalls).toContainEqual(["status", ["posted", "voided"]]);
  });

  it("a picked Supplier Delivery Date that matches nothing answers an EMPTY page, total 0", async () => {
    const sb = makeSb({
      warehouse_receipts: { list: { data: [POSTED], error: null }, count: 0 },
      warehouses: { list: { data: [{ id: WH, name: "Carres Klang" }], error: null } },
      purchase_orders: {
        list: {
          data: [
            { id: "PO-1001", version: 1, supplier_id: "s1", suppliers: { name: "Ohana" } },
          ],
          error: null,
        },
      },
      po_supplier_promises: { list: { data: [], error: null } },
      product_skus: { list: { data: [], error: null } },
      app_users: { list: { data: [], error: null } },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await req(
      "/api/operation/warehouse-receipts?scope=grn&expected=2026-09-08",
      "GET",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, never>;
    // No evidenced supplier reply → no GRN carries that date; the register
    // answers honestly rather than ignoring the filter.
    expect(body.page).toEqual({ offset: 0, limit: 50, total: 0, total_all: 1 });
    expect(body.receipts).toEqual([]);
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
    expect(body.receipt.unit_results).toMatchObject([
      {
        stock_item_id: "si1",
        unit_code: "MS01-K-0001",
        outcome: "good",
        issue_kind: null,
        note: null,
      },
    ]);
    expect(body.po).toMatchObject({ id: "PO-1001" });
    expect(body.events[0]).toMatchObject({
      event: "posted",
      actor_name: "Buddy cover",
    });
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

/* ═══ The 2026-09-06 owner correction — categories, limit, evidence amend ══ */

describe("GET / — the rail's governed categories (owner correction 2026-09-06)", () => {
  it("resolves each receipt's category words from the CATALOG through the one shared ladder", async () => {
    const tables = {
      ...opsTables({
        ...RECEIPT_ROW,
        status: "posted",
        grn_no: "GRN-20260906-0001",
      }),
      product_skus: {
        list: {
          data: [{ sku: "MS01-K", product_models: { category: "mattress" } }],
          error: null,
        },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(tables) as any);
    const res = await req(
      "/api/operation/warehouse-receipts?status=posted",
      "GET",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      receipts: Array<{ categories?: string[] }>;
    };
    expect(body.receipts[0].categories).toEqual(["Mattress"]);
  });

  it("caps ?limit at the hard maximum — a URL cannot ask for the whole table", async () => {
    const limits: number[] = [];
    const sb = makeSb(opsTables());
    const origFrom = sb.from.bind(sb);
    sb.from = (table: string) => {
      const builder = origFrom(table) as Record<string, unknown> & {
        limit: (n: number) => unknown;
      };
      if (table === "warehouse_receipts") {
        const origLimit = builder.limit;
        builder.limit = (n: number) => {
          limits.push(n);
          return (origLimit as (n: number) => unknown)(n);
        };
      }
      return builder;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    await req(
      "/api/operation/warehouse-receipts?limit=999999",
      "GET",
      await makeJwt("operation"),
    );
    expect(limits).toContain(1000);
    expect(limits.every((n) => n <= 1000)).toBe(true);
  });
});

describe("GET /:id — the GRN document's product facts (line_info)", () => {
  it("carries the catalog description and the governed category word per SKU", async () => {
    const tables = {
      warehouse_receipts: {
        single: {
          data: {
            ...RECEIPT_ROW,
            status: "posted",
            grn_no: "GRN-20260906-0002",
          },
          error: null,
        },
      },
      receiving_unit_results: { list: { data: [], error: null } },
      receiving_events: { list: { data: [], error: null } },
      purchase_orders: {
        single: {
          data: {
            id: "PO-1001",
            supplier_id: "s1",
            warehouse_id: WH,
            is_consignment: false,
            suppliers: { name: "Ohana" },
            purchase_order_lines: [],
          },
          error: null,
        },
      },
      app_users: { list: { data: [], error: null } },
      warehouses: {
        list: { data: [{ id: WH, name: "Carres Klang" }], error: null },
      },
      product_skus: {
        list: {
          data: [
            {
              sku: "MS01-K",
              variant: "Mattress Forte K",
              product_models: { category: "mattress" },
            },
          ],
          error: null,
        },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(tables) as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}`,
      "GET",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      line_info: Record<
        string,
        { description: string | null; category: string }
      >;
    };
    // ⚠️ the mocked product_skus list answers BOTH the catalog-category read
    // and the variant read with the same rows — which is exactly what the
    // route does against the real table.
    expect(body.line_info["MS01-K"]).toEqual({
      description: "Mattress Forte K",
      // The FULL name needs a model; the fixture's catalog names none, so
      // there is no catalog name to fall back to (never the variant alone).
      label: null,
      category: "Mattress",
    });
  });
});

describe("POST /:id/amend — the paper's evidence (0427)", () => {
  it("maps doFilePath and arrivalEvidenceAdd onto p_changes", async () => {
    const sb = makeSb(opsTables(), { data: { status: "posted" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/amend`,
      "POST",
      await makeJwt("operation"),
      {
        reason: "clerk photographed the wrong DO",
        doFilePath: "PO-1001/corrected-do.jpg",
        arrivalEvidenceAdd: [{ path: "PO-1001/arrival-2.jpg", kind: "photo" }],
      },
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("receiving_amend", {
      p_receipt_id: RECEIPT,
      p_reason: "clerk photographed the wrong DO",
      p_changes: {
        do_file_path: "PO-1001/corrected-do.jpg",
        arrival_evidence_add: [
          { path: "PO-1001/arrival-2.jpg", kind: "photo" },
        ],
      },
      p_save_key: null,
    });
  });
});

describe("the Warehouse boundary — it counts; it never posts, amends or voids", () => {
  it("403 for the warehouse on amend and void", async () => {
    const jwt = await makeJwt("warehouse");
    for (const door of ["amend", "void"]) {
      const res = await req(
        `/api/operation/warehouse-receipts/${RECEIPT}/${door}`,
        "POST",
        jwt,
        { reason: "should never reach the engine" },
      );
      expect(res.status).toBe(403);
    }
  });
});


/* ═══ 0493 · EXCEPTION EVIDENCE — the scoped viewer read and the append door ═══ */

describe("GET /:id/evidence — ONE viewer's files, each with its own state (0493)", () => {
  const EVIDENCE_ROWS = [
    { id: "e1", exception_type: "damaged", line_key: "l1", media_kind: "photo", bucket: "delivery-orders", path: "PO-1001/a-claim.jpg", source: "posting", added_by: USER, added_at: "2026-09-13T01:00:00Z" },
    { id: "e2", exception_type: "damaged", line_key: "l1", media_kind: "photo", bucket: "delivery-orders", path: "PO-1001/b-claim.jpg", source: "amend", added_by: null, added_at: "2026-09-13T02:00:00Z" },
    { id: "e3", exception_type: "damaged", line_key: "l1", media_kind: "photo", bucket: "delivery-orders", path: "PO-1001/c-claim.jpg", source: "amend", added_by: null, added_at: "2026-09-13T03:00:00Z" },
  ];

  it("asks the table for exactly GRN + type + kind + line keys, signs through the service key, and names ok / missing / unsigned per file", async () => {
    const sb = makeSb({
      ...opsTables(),
      receiving_line_evidence: { list: { data: EVIDENCE_ROWS, error: null } },
    });
    const inCalls: unknown[][] = [];
    const eqCalls: unknown[][] = [];
    const origFrom = sb.from.bind(sb);
    sb.from = (table: string) => {
      const b = origFrom(table);
      if (table === "receiving_line_evidence") {
        const origIn = b.in as (...a: unknown[]) => unknown;
        const origEq = b.eq as (...a: unknown[]) => unknown;
        b.in = vi.fn((...a: unknown[]) => { inCalls.push(a); return origIn(...a); });
        b.eq = vi.fn((...a: unknown[]) => { eqCalls.push(a); return origEq(...a); });
      }
      return b;
    };
    vi.mocked(userClient).mockReturnValue(sb as never);
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [
        { path: "PO-1001/a-claim.jpg", signedUrl: "https://signed/a", error: null },
        { path: "PO-1001/b-claim.jpg", signedUrl: null, error: "Object not found" },
        // c-claim.jpg is absent from the answer entirely — unsigned.
      ],
      error: null,
    });
    vi.mocked(adminClient).mockReturnValue({ storage: { from: vi.fn(() => ({ createSignedUrls })) } } as never);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/evidence?type=damaged&kind=photo&line=l1,l9`,
      "GET",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verified: boolean; files: Array<Record<string, unknown>> };
    expect(body.verified).toBe(true);
    expect(eqCalls).toContainEqual(["receipt_id", RECEIPT]);
    expect(eqCalls).toContainEqual(["exception_type", "damaged"]);
    expect(eqCalls).toContainEqual(["media_kind", "photo"]);
    expect(inCalls).toContainEqual(["line_key", ["l1", "l9"]]);
    expect(createSignedUrls).toHaveBeenCalledWith(["PO-1001/a-claim.jpg", "PO-1001/b-claim.jpg", "PO-1001/c-claim.jpg"], 3600);
    expect(body.files.map((f) => [f.path, f.status, f.url, f.added_by_name])).toEqual([
      ["PO-1001/a-claim.jpg", "ok", "https://signed/a", "Klang counter"],
      ["PO-1001/b-claim.jpg", "missing", null, null],
      ["PO-1001/c-claim.jpg", "unsigned", null, null],
    ]);
  });

  it("answers `verified: false` — not an empty list — while 0493 is not applied", async () => {
    const sb = makeSb({
      ...opsTables(),
      receiving_line_evidence: { list: { data: null, error: { code: "42P01", message: "relation does not exist" } } },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/evidence?type=extra&kind=video`,
      "GET",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ receipt_id: RECEIPT, verified: false, files: [] });
  });

  it("refuses a viewer with no exception type or media kind, and the warehouse role", async () => {
    const sb = makeSb(opsTables());
    vi.mocked(userClient).mockReturnValue(sb as never);
    expect((await req(`/api/operation/warehouse-receipts/${RECEIPT}/evidence?type=damaged`, "GET", await makeJwt("operation"))).status).toBe(422);
    expect((await req(`/api/operation/warehouse-receipts/${RECEIPT}/evidence?type=lost&kind=photo`, "GET", await makeJwt("operation"))).status).toBe(422);
    expect((await req(`/api/operation/warehouse-receipts/${RECEIPT}/evidence?type=damaged&kind=photo`, "GET", await makeJwt("warehouse"))).status).toBe(403);
  });
});

describe("POST /:id/amend — exception evidence appends through its own door (0493)", () => {
  it("routes lineEvidenceAdd to receiving_line_evidence_add FIRST, then the other changes to receiving_amend", async () => {
    const sb = makeSb(opsTables(), { data: { added: 1 } });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/amend`,
      "POST",
      await makeJwt("operation"),
      {
        reason: "found the damage video later",
        goodsReceivedAt: "2026-09-02",
        lineEvidenceAdd: [
          { lineKey: "l1", exceptionType: "damaged", kind: "video", path: "PO-1001/v-claim.mp4" },
        ],
      },
    );
    expect(res.status).toBe(200);
    expect(sb.rpc.mock.calls[0]).toEqual([
      "receiving_line_evidence_add",
      {
        p_receipt_id: RECEIPT,
        p_entries: [{ line_key: "l1", exception_type: "damaged", kind: "video", path: "PO-1001/v-claim.mp4" }],
        p_reason: "found the damage video later",
      },
    ]);
    expect(sb.rpc.mock.calls[1]![0]).toBe("receiving_amend");
    expect((sb.rpc.mock.calls[1]![1] as { p_changes: unknown }).p_changes).toEqual({ goods_received_at: "2026-09-02" });
  });

  it("evidence alone is a complete amendment — receiving_amend is not called for nothing", async () => {
    const sb = makeSb(opsTables(), { data: { added: 2, before: 1, after: 3 } });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/amend`,
      "POST",
      await makeJwt("operation"),
      {
        reason: "extra goods photographed",
        lineEvidenceAdd: [
          { lineKey: "11111111-1111-1111-1111-111111111111", exceptionType: "extra", kind: "photo", path: "PO-1001/x-claim.jpg" },
          { lineKey: "11111111-1111-1111-1111-111111111111", exceptionType: "extra", kind: "video", path: "PO-1001/x-claim.mp4" },
        ],
      },
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(sb.rpc.mock.calls[0]![0]).toBe("receiving_line_evidence_add");
    expect(await res.json()).toEqual({ receipt_id: RECEIPT, evidence: { added: 2, before: 1, after: 3 } });
  });

  it("a refusal from the evidence door stops the correction before any other fact moves", async () => {
    const sb = makeSb(opsTables(), {
      error: { code: "P0001", message: "line l1 records no wrong item on this receiving", details: "evidence_exception_zero" },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/amend`,
      "POST",
      await makeJwt("operation"),
      {
        reason: "wrong photo",
        goodsReceivedAt: "2026-09-02",
        lineEvidenceAdd: [{ lineKey: "l1", exceptionType: "wrong_item", kind: "photo", path: "PO-1001/w-claim.jpg" }],
      },
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("GET /:id — the GRN object's own sections (2026-09-13)", () => {
  it("carries the exact claims, the related receipts on the source, the evidence rows and the GRN Date", async () => {
    const posted = { ...RECEIPT_ROW, status: "posted", grn_no: "GRN-20260906-1234", posted_at: "2026-09-05T17:30:00Z", posted_by: USER };
    const sibling = { ...RECEIPT_ROW, id: "33333333-3333-3333-3333-333333333333", status: "posted", grn_no: "GRN-20260901-0001", do_number: "DO-5500", posted_at: "2026-09-01T02:00:00Z", lines: [{ id: "l1", sku: "MS01-K", received_now: 2, damaged_qty: 0, wrong_item_qty: 0, wrong_item_claim_type: null }] };
    const sb = makeSb({
      ...opsTables(posted),
      warehouse_receipts: { single: { data: posted, error: null }, list: { data: [posted, sibling], error: null }, count: 0 },
      purchase_orders: {
        single: {
          data: {
            id: "PO-1001", status: "open", supplier_id: "s1", warehouse_id: WH, destination_id: null, is_consignment: false,
            suppliers: { name: "Ohana" },
            purchase_order_lines: [{ id: "l1", sku: "MS01-K", qty: 6, received_qty: 6, damaged_qty: 1, wrong_item_qty: 0, attrs: { color: "Grey", gap: "5\"" } }],
          },
          error: null,
        },
      },
      supplier_claims: { list: { data: [{ id: "c1", claim_no: "SC-1014", status: "closed", claim_type: "damaged", sku: "MS01-K", qty: 1, po_line_id: "l1", requested_action: "replace", supplier_response: "replacement", created_at: "2026-09-05T18:00:00Z" }], error: null } },
      receiving_line_evidence: { list: { data: [{ id: "e1", exception_type: "damaged", line_key: "l1", media_kind: "photo", path: "PO-1001/a-claim.jpg", source: "projection", added_by: USER, added_at: "2026-09-05T18:00:00Z" }], error: null } },
      receiving_unit_results: { list: { data: [], error: null } },
      receiving_events: { list: { data: [], error: null } },
      product_skus: { list: { data: [{ sku: "MS01-K", variant: "King", product_models: { name: "Forte" } }], error: null } },
      ops_stock_items: { list: { data: [], error: null } },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    vi.mocked(adminClient).mockReturnValue({ storage: { from: vi.fn(() => ({ createSignedUrl: vi.fn().mockResolvedValue({ data: null }), createSignedUrls: vi.fn().mockResolvedValue({ data: [] }) })) } } as never);
    const res = await req(`/api/operation/warehouse-receipts/${RECEIPT}`, "GET", await makeJwt("operation"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, never>;
    // GRN Date = the posting's stamp in MYT: 17:30Z on 5 Sep is 6 Sep in KL.
    expect((body.receipt as { grn_date: string }).grn_date).toBe("2026-09-06");
    expect(body.claims).toMatchObject([{ id: "c1", claim_no: "SC-1014", status: "closed" }]);
    // The sibling GRN, never this one, with its own totals.
    expect(body.related_receipts).toMatchObject([{ id: "33333333-3333-3333-3333-333333333333", grn_no: "GRN-20260901-0001", received_qty: 2, damaged_qty: 0 }]);
    expect(body.line_evidence).toMatchObject([{ id: "e1", added_by_name: "Klang counter" }]);
    // The goods' full name and the PO line's configuration words.
    expect(body.line_info).toMatchObject({ "MS01-K": { label: "Forte · King", category: "Mattress" } });
    expect(body.line_config).toEqual({ l1: ["Grey", "Gap 5\""] });
  });
});
