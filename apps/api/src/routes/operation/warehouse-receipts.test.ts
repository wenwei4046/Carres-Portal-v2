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

  it("filters and sorts before paging, with choices from records beyond the first fifty", async () => {
    const records = Array.from({ length: 61 }, (_, i) => ({
      ...POSTED, id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      do_number: i === 60 ? "DO-OUTSIDE-FIRST-PAGE" : `DO-${i}`,
      lines: [{ id: "line", sku: "SKU", received_now: i === 60 ? 10 : 2, damaged_qty: 0, wrong_item_qty: 0 }],
    }));
    vi.mocked(userClient).mockReturnValue(makeSb({ warehouse_receipts: { list: { data: records, error: null }, count: 0 } }) as never);
    const columns = { filters: { doNo: ["DO-OUTSIDE-FIRST-PAGE"] }, dateFilters: {}, numberFilters: {}, dateRangeFilters: {}, sort: null };
    const jwt = await makeJwt("operation");
    const filtered = await req(`/api/operation/warehouse-receipts?scope=grn&columns=${encodeURIComponent(JSON.stringify(columns))}`, "GET", jwt);
    expect(filtered.status).toBe(200);
    const body = await filtered.json() as { receipts: Array<{ id: string }>; page: { total: number }; column_values: Record<string, string[]> };
    expect(body.page.total).toBe(1); expect(body.receipts.map(row => row.id)).toEqual([records[60].id]);
    expect(body.column_values.doNo).toContain("DO-0"); expect(body.column_values.doNo).toContain("DO-OUTSIDE-FIRST-PAGE");
    const sorted = await req(`/api/operation/warehouse-receipts?scope=grn&limit=1&columns=${encodeURIComponent(JSON.stringify({ ...columns, filters: {}, sort: { key: "receivedQty", dir: "desc" } }))}`, "GET", jwt);
    const sortedBody = await sorted.json() as { receipts: Array<{ id: string }>; page: { total: number } };
    expect(sortedBody.page.total).toBe(61); expect(sortedBody.receipts[0].id).toBe(records[60].id);
    const cleared = await req("/api/operation/warehouse-receipts?scope=grn", "GET", jwt);
    expect((await cleared.json() as { page: { total: number } }).page.total).toBe(61);
  });

  it.each(["{", JSON.stringify({ filters: { private_field: ["value"] }, dateFilters: {}, numberFilters: {}, dateRangeFilters: {}, sort: null })])("rejects invalid column asks before reading data", async (columns) => {
    const response = await req(`/api/operation/warehouse-receipts?scope=grn&columns=${encodeURIComponent(columns)}`, "GET", await makeJwt("operation"));
    expect(response.status).toBe(422);
  });

  it.each(["GRN-20260906-1234", "GRN-260906-1234"])(
    "resolves original and displayed GRN search %s to the same stored receipt",
    async (number) => {
      vi.mocked(userClient).mockReturnValue(makeSb({
        warehouse_receipts: { list: { data: [POSTED], error: null }, count: 0 },
      }) as never);
      const response = await req(
        `/api/operation/warehouse-receipts?scope=grn&q=${encodeURIComponent(number)}`,
        "GET", await makeJwt("operation"),
      );
      expect(response.status).toBe(200);
      const body = await response.json() as { receipts: Array<{ id: string; grn_no: string }>; page: { total: number } };
      expect(body.page.total).toBe(1);
      expect(body.receipts[0]).toMatchObject({ id: POSTED.id, grn_no: POSTED.grn_no });
    },
  );

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
    expect(body.page).toEqual({ offset: 0, limit: 50, total: 1 });
    const rows = body.receipts as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    // The governed Supplier Delivery Date — the ONE reply arithmetic, and the
    // GRN paper's own product word — never a second spelling.
    expect(rows[0]!.supplier_delivery_date).toBe("2026-09-08");
    expect(rows[0]!.product_labels).toEqual(["Dream King"]);
    expect(rows[0]!.supplier_name).toBe("Ohana");
    const facets = body.facets as Record<string, Record<string, number>>;
    expect(facets.supplier).toEqual({ Ohana: 1 });
    expect(facets.site).toEqual({ "Carres Klang": 1 });
    // The scan asked for the Register BOUNDARY — posted/voided only.
    expect(inCalls).toContainEqual(["status", ["posted", "voided"]]);
  });

  /* ── PURCHASING CARD 12 — the six rail groups, the source column and the
     read-only goods expansion (§9.4, owner rulings 2026-09-17 / 2026-09-18).
     `GRN date` is the CREATION stamp, `Received with` is a record of what was
     found, and every linked document the receipt genuinely has is preserved
     while nothing stands in for one it does not. ──────────────────────────── */

  /** `Save Receiving` created this GRN on Wed 16 Sep, Kuala Lumpur time. */
  const CREATED = {
    ...POSTED,
    posted_at: "2026-09-16T09:00:00Z",
    extra_lines: [{ sku: "MS01-Q", qty: 2 }],
  };

  const cardTables = (over: Record<string, unknown> = {}) => ({
    warehouse_receipts: { list: { data: [CREATED], error: null }, count: 0 },
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
    product_skus: {
      list: {
        data: [
          { sku: "MS01-K", variant: "Dream King" },
          { sku: "MS01-Q", variant: "Dream Queen" },
        ],
        error: null,
      },
    },
    purchase_order_lines: { list: { data: [{ id: "l1", demand_id: "d1" }], error: null } },
    po_line_sources: { list: { data: [{ po_line_id: "l1", so: 1303 }], error: null } },
    purchase_demands: { list: { data: [{ id: "d1", request_id: "r1" }], error: null } },
    purchase_requests: {
      list: { data: [{ id: "r1", req_no: "MPR-20260904-8935" }], error: null },
    },
    receiving_unit_results: {
      list: {
        data: [
          { receipt_id: RECEIPT, stock_item_id: "u1", unit_code: "id-abc000001" },
          { receipt_id: RECEIPT, stock_item_id: "u2", unit_code: "id-abc000002" },
        ],
        error: null,
      },
    },
    ops_stock_items: {
      list: {
        data: [
          { id: "u1", po_line_id: "l1", identity_scope: "unit" },
          // A quantity row carries a technical register key and is NEVER
          // shown as a Unit ID (§9.4, 0453).
          { id: "u2", po_line_id: "l1", identity_scope: "quantity" },
        ],
        error: null,
      },
    },
    arrival_sources: { list: { data: [], error: null } },
    app_users: { list: { data: [], error: null } },
    ...over,
  });

  const ask = async (query: string) => {
    const res = await req(
      `/api/operation/warehouse-receipts?scope=grn${query}`,
      "GET",
      await makeJwt("operation"),
    );
    expect(res.status).toBe(200);
    return (await res.json()) as Record<string, never>;
  };

  it("carries GRN Date, the genuine linked documents and the expansion's line facts", async () => {
    vi.mocked(userClient).mockReturnValue(makeSb(cardTables()) as never);
    const body = await ask("");
    const row = (body.receipts as Array<Record<string, unknown>>)[0]!;
    // Creation, never the physical arrival date — the two are separate facts.
    expect(row.grn_date).toBe("2026-09-16T09:00:00Z");
    expect(row.goods_received_at).toBe("2026-09-01");
    // Every ACTUAL linked document, and nothing invented for the ones absent.
    expect(row.source_refs).toEqual(["SO-1303", "MPR-20260904-8935"]);
    expect(row.po_id).toBe("PO-1001");
    // The source number's own line-bound Units — the quantity row is not one.
    expect(row.unit_ids_by_line).toEqual({ l1: ["id-abc000001"] });
    // The expansion's `Items` and `Category` are the GRN document's own two
    // reads, extra goods included.
    const info = body.line_info as Record<string, { description: string | null }>;
    expect(info["MS01-K"]!.description).toBe("Dream King");
    expect(info["MS01-Q"]!.description).toBe("Dream Queen");
  });

  it("the GRN date group filters by an inclusive range, in Kuala Lumpur time", async () => {
    vi.mocked(userClient).mockReturnValue(makeSb(cardTables()) as never);
    const week = await ask("&from=2026-09-14&to=2026-09-20");
    expect(week.page).toMatchObject({ total: 1 });
    // The day counts the rail folds into weeks and months.
    expect((week.facets as Record<string, unknown>).grnDate).toEqual({
      "2026-09-16": 1,
    });

    vi.mocked(userClient).mockReturnValue(makeSb(cardTables()) as never);
    const before = await ask("&from=2026-09-01&to=2026-09-07");
    expect(before.page).toMatchObject({ total: 0 });
    expect(before.receipts).toEqual([]);
  });

  it("`Received with` counts GRNs by what was found — damaged, wrong items, extra goods", async () => {
    vi.mocked(userClient).mockReturnValue(makeSb(cardTables()) as never);
    const body = await ask("");
    // This GRN carries BOTH a damaged unit and extra goods, so it is counted
    // in two rows — which is why the three counts are never added together.
    expect((body.facets as Record<string, unknown>).receivedWith).toEqual({
      damaged: 1,
      wrong_item: 0,
      extra: 1,
    });

    vi.mocked(userClient).mockReturnValue(makeSb(cardTables()) as never);
    const wrong = await ask("&receivedWith=wrong_item");
    expect(wrong.page).toMatchObject({ total: 0 });
  });

  it("Cancelled GRNs is its own row; the default listing holds valid and cancelled alike", async () => {
    const voided = { ...CREATED, id: "r-void", status: "voided", grn_no: "GRN-20260906-9999" };
    const both = cardTables({
      warehouse_receipts: { list: { data: [CREATED, voided], error: null }, count: 0 },
    });
    vi.mocked(userClient).mockReturnValue(makeSb(both) as never);
    const all = await ask("");
    expect(all.page).toMatchObject({ total: 2 });
    expect((all.facets as Record<string, unknown>).cancelled).toBe(1);
  });

  it("an arrival-source receipt keeps its own number and gets NO purchase order", async () => {
    const repair = {
      ...CREATED,
      id: "r-repair",
      po_id: null,
      arrival_source_id: "as1",
      lines: [],
      extra_lines: [],
    };
    const tables = cardTables({
      warehouse_receipts: { list: { data: [repair], error: null }, count: 0 },
      arrival_sources: {
        list: { data: [{ id: "as1", source_no: "RO-20260916-0042" }], error: null },
      },
    });
    vi.mocked(userClient).mockReturnValue(makeSb(tables) as never);
    const body = await ask("");
    const row = (body.receipts as Array<Record<string, unknown>>)[0]!;
    expect(row.source_refs).toEqual(["RO-20260916-0042"]);
    // No fabricated PO for a receipt that genuinely has none.
    expect(row.po_id).toBeNull();
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
    lines: RECEIPT_ROW.lines.map((line) => ({ ...line, id: LINE })),
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
      ops_stock_items: {
        list: { data: [{ id: "si1", po_line_id: LINE, identity_scope: "unit" }], error: null },
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
        po_line_id: LINE,
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

  it.each(["receiving_unit_results", "receiving_events", "purchase_orders", "ops_stock_items"])(
    "refuses an incomplete document when %s cannot be read",
    async (table) => {
      const failure = { data: null, error: { code: "XX000", message: "read failed" } };
      const sb = makeSb({ ...detailTables(), [table]: { list: failure, single: failure } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(userClient).mockReturnValue(sb as any);
      const res = await req(`/api/operation/warehouse-receipts/${RECEIPT}`, "GET", await makeJwt("operation"));
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await res.json()).not.toHaveProperty("receipt");
    },
  );

  it("keeps unknown lineage unassigned and suppresses counted-stock technical IDs", async () => {
    const tables = detailTables();
    const sb = makeSb({
      ...tables,
      receiving_unit_results: { list: { data: [
        ...tables.receiving_unit_results.list.data,
        { stock_item_id: "si2", unit_code: "COUNTED", outcome: "received" },
        { stock_item_id: "si3", unit_code: "U-003", outcome: "received" },
      ], error: null } },
      ops_stock_items: { list: { data: [
        { id: "si1", po_line_id: "other-receipt-line", identity_scope: "unit" },
        { id: "si2", po_line_id: LINE, identity_scope: "quantity" },
      ], error: null } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(`/api/operation/warehouse-receipts/${RECEIPT}`, "GET", await makeJwt("operation"));
    expect(res.status).toBe(200);
    const body = await res.json() as { receipt: { unit_results: unknown[] } };
    expect(body.receipt.unit_results).toEqual([
      expect.objectContaining({ stock_item_id: "si1", po_line_id: null }),
      expect.objectContaining({ stock_item_id: "si3", po_line_id: null }),
    ]);
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
        basedOnRevision: 3,
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
        based_on_revision: 3,
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
      { reason: "wrong DO number only", doNumber: "DO-9002", basedOnRevision: 0 },
    );
    expect(sb.rpc).toHaveBeenCalledWith("receiving_amend", {
      p_receipt_id: RECEIPT,
      p_reason: "wrong DO number only",
      p_changes: { based_on_revision: 0, do_number: "DO-9002" },
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
      { reason: "correcting the received count", basedOnRevision: 0 },
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
        basedOnRevision: 1,
        doFilePath: "PO-1001/corrected-do.jpg",
        arrivalEvidenceAdd: [{ path: "PO-1001/arrival-2.jpg", kind: "photo" }],
      },
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("receiving_amend", {
      p_receipt_id: RECEIPT,
      p_reason: "clerk photographed the wrong DO",
      p_changes: {
        based_on_revision: 1,
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

/* ═══ 0601 — Receiving closure (owner rulings 2026-09-17 / 09-25 / 09-28) ══ */

describe("POST /:id/amend — named Units, arrival time, first save wins (0601)", () => {
  const UNIT_A = "55555555-5555-5555-5555-555555555555";
  const UNIT_B = "66666666-6666-6666-6666-666666666666";

  it("422 before the database when the correction does not say which version it starts from", async () => {
    const sb = makeSb(opsTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/amend`,
      "POST",
      await makeJwt("operation"),
      { reason: "wrong DO number only", doNumber: "DO-9002" },
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("maps named Units and the arrival time onto p_changes — the system never picks a Unit", async () => {
    const sb = makeSb(opsTables(), { data: { status: "posted", revision: 2 } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/amend`,
      "POST",
      await makeJwt("operation"),
      {
        reason: "the wrong Unit was scanned",
        basedOnRevision: 1,
        goodsReceivedTime: "2026-09-28T09:15:00+08:00",
        units: [
          { stockItemId: UNIT_A, outcome: "received" },
          { stockItemId: UNIT_B, outcome: "not_received" },
        ],
      },
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("receiving_amend", {
      p_receipt_id: RECEIPT,
      p_reason: "the wrong Unit was scanned",
      p_changes: {
        based_on_revision: 1,
        goods_received_time: "2026-09-28T09:15:00+08:00",
        units: [
          { stock_item_id: UNIT_A, outcome: "received" },
          { stock_item_id: UNIT_B, outcome: "not_received" },
        ],
      },
      p_save_key: null,
    });
  });

  it("refuses an outcome other than Received or Not received before the database", async () => {
    const sb = makeSb(opsTables());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/amend`,
      "POST",
      await makeJwt("operation"),
      {
        reason: "damaged after all",
        basedOnRevision: 0,
        units: [{ stockItemId: UNIT_A, outcome: "received_with_issue" }],
      },
    );
    expect(res.status).toBe(422);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("a stale version comes back as 409 with the governed sentence", async () => {
    const sb = makeSb(opsTables(), {
      error: { code: "40001", message: "Someone changed this GRN. Check it again.", details: "receipt_changed" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/amend`,
      "POST",
      await makeJwt("operation"),
      { reason: "wrong DO number only", doNumber: "DO-9002", basedOnRevision: 0 },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: "receipt_changed",
      message: "Someone changed this GRN. Check it again.",
    });
  });

  it("locked Units come back one by one, each with its own reason", async () => {
    const locked = [
      { unit_code: "U1-000-064", reason: "reserved", words: "Reserved for SO2609-4827" },
      { unit_code: "U1-000-065", reason: "on_delivery_order", words: "On DO2609-1234" },
    ];
    const sb = makeSb(opsTables(), {
      error: {
        code: "P0001",
        message: "U1-000-064 cannot change. Reserved for SO2609-4827 U1-000-065 cannot change. On DO2609-1234",
        details: "units_locked",
        hint: JSON.stringify(locked),
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(
      `/api/operation/warehouse-receipts/${RECEIPT}/amend`,
      "POST",
      await makeJwt("operation"),
      {
        reason: "recount",
        basedOnRevision: 0,
        units: [{ stockItemId: UNIT_A, outcome: "not_received" }],
      },
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "units_locked", units: locked });
  });
});

describe("GET /:id — the receipt reads the Catalog category (owner 2026-09-28)", () => {
  it("prints Not recorded when the Catalog cannot answer, never Other goods or a SKU-text guess", async () => {
    const tables = {
      warehouse_receipts: {
        single: {
          data: {
            ...RECEIPT_ROW,
            lines: [{ ...RECEIPT_ROW.lines[0], sku: "SMOKE King Mattress" }],
            status: "posted",
            grn_no: "GRN-20260904-1064",
          },
          error: null,
        },
      },
      receiving_unit_results: { list: { data: [], error: null } },
      receiving_events: { list: { data: [], error: null } },
      purchase_orders: {
        single: {
          data: { id: "PO-1001", supplier_id: "s1", warehouse_id: WH, suppliers: { name: "Ohana" }, purchase_order_lines: [] },
          error: null,
        },
      },
      app_users: { list: { data: [], error: null } },
      warehouses: { list: { data: [{ id: WH, name: "Carres Klang" }], error: null } },
      product_skus: { list: { data: [], error: null } },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(tables) as any);
    const res = await req(`/api/operation/warehouse-receipts/${RECEIPT}`, "GET", await makeJwt("operation"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { line_info: Record<string, { category: string }> };
    expect(body.line_info["SMOKE King Mattress"]!.category).toBe("Not recorded");
  });

  it("reads the arrival time, receiver and version, and still opens on a schema without them", async () => {
    const row = { ...RECEIPT_ROW, status: "posted", grn_no: "GRN-20260928-0001" };
    const withNew = {
      ...row,
      goods_received_time: "2026-09-28T01:15:00+00:00",
      received_by_kind: "company",
      received_by_name: "NETS",
      revision: 2,
    };
    const selects: string[] = [];
    const base = {
      receiving_unit_results: { list: { data: [], error: null } },
      receiving_events: { list: { data: [], error: null } },
      purchase_orders: {
        single: {
          data: { id: "PO-1001", supplier_id: "s1", warehouse_id: WH, suppliers: { name: "Ohana" }, purchase_order_lines: [] },
          error: null,
        },
      },
      app_users: { list: { data: [], error: null } },
      warehouses: { list: { data: [{ id: WH, name: "Carres Klang" }], error: null } },
    };
    const sb = makeSb({ ...base, warehouse_receipts: { single: { data: withNew, error: null } } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const origFrom = sb.from.bind(sb);
    sb.from = (table: string) => {
      const b = origFrom(table) as Record<string, unknown> & { select: (c: string) => unknown };
      if (table === "warehouse_receipts") {
        const orig = b.select;
        b.select = (c: string) => {
          selects.push(c);
          return orig(c);
        };
      }
      return b;
    };
    const res = await req(`/api/operation/warehouse-receipts/${RECEIPT}`, "GET", await makeJwt("operation"));
    expect(res.status).toBe(200);
    expect(selects[0]).toContain("goods_received_time");
    expect(selects[0]).toContain("received_by_name");
    expect(selects[0]).toContain("revision");
    const body = (await res.json()) as { receipt: Record<string, unknown> };
    expect(body.receipt).toMatchObject({ received_by_kind: "company", received_by_name: "NETS", revision: 2 });

    // Before 0601 is applied the new columns do not exist: the record still opens.
    const selects2: string[] = [];
    const sb2 = makeSb(base);
    const from2 = sb2.from.bind(sb2);
    sb2.from = (table: string) => {
      const b = from2(table) as Record<string, unknown>;
      if (table === "warehouse_receipts") {
        b.select = (c: string) => {
          selects2.push(c);
          return b;
        };
        b.maybeSingle = () =>
          Promise.resolve(
            c0601(selects2[selects2.length - 1]!)
              ? { data: null, error: { code: "42703", message: "column warehouse_receipts.goods_received_time does not exist" } }
              : { data: row, error: null },
          );
      }
      return b;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb2 as any);
    const res2 = await req(`/api/operation/warehouse-receipts/${RECEIPT}`, "GET", await makeJwt("operation"));
    expect(res2.status).toBe(200);
    expect(selects2.length).toBeGreaterThan(1);
  });
});

function c0601(select: string) {
  return select.includes("goods_received_time");
}

describe("GET /receiver — who the GRN will name, before saving (0601)", () => {
  it("asks the one SQL rule for this Site and the signed-in saver", async () => {
    const sb = makeSb({}, { data: { kind: "company", party_id: "p1", user_id: null, name: "NETS" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(`/api/operation/warehouse-receipts/receiver?site=${SITE}`, "GET", await makeJwt("operation"));
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("receiving_receiver_preview", { p_site_id: SITE });
    expect(await res.json()).toEqual({ receiver: { kind: "company", name: "NETS" } });
  });

  it("answers no receiver when the database does not know the rule yet", async () => {
    const sb = makeSb({}, { error: { code: "PGRST202", message: "Could not find the function" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(`/api/operation/warehouse-receipts/receiver?site=${SITE}`, "GET", await makeJwt("operation"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ receiver: null });
  });

  it("422 for a site that is not an id", async () => {
    const res = await req(`/api/operation/warehouse-receipts/receiver?site=klang`, "GET", await makeJwt("operation"));
    expect(res.status).toBe(422);
  });
});

describe("GET /duty — posting and amend/void are two answers (0601)", () => {
  it("passes may_amend through beside allowed", async () => {
    const sb = makeSb({ app_users: { list: { data: [], error: null } } }, {
      data: { allowed: true, may_amend: false, source: "assignment" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req("/api/operation/warehouse-receipts/duty", "GET", await makeJwt("operation"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ allowed: true, may_amend: false });
  });

  it("a void by someone who is not GRN Duty comes back as 403 with the duty refusal", async () => {
    const sb = makeSb(opsTables(), {
      error: { code: "42501", message: "only GRN duty may amend or void a receiving", details: "not_grn_duty" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const res = await req(`/api/operation/warehouse-receipts/${RECEIPT}/void`, "POST", await makeJwt("operation"), { reason: "never existed" });
    expect(res.status).toBe(403);
  });
});

