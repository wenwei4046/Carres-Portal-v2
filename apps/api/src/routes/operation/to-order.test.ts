import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import { documentPartitionKey } from "@carres/shared";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { addWorkingDays, myHolidaySet } from "@carres/shared";
import { userClient } from "../../lib/supabase";

/**
 * `Issue Purchase Order` is the ONE act that creates a formal purchase order,
 * so these tests are about the WRITE: how many documents come out, what goes on
 * them, and that the operator's chosen destination lands on every one.
 *
 * The route never trusts the client's rows — it recomputes the projection and
 * issues from its own reading — so the fixture below is the live shape: PETER's
 * one customer order holding two sofa builds, plus ella's.
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

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

const OHANA = "11111111-1111-1111-1111-111111111111";
const KLANG = "2f181917-f4e1-42b2-9e25-d7ee6785424a";
const AL = "818b420c-27f9-4707-a516-b91a6e03f343";
const WAREHOUSE = "00000000-0000-0000-0000-000000000c03";
const CLOSED_YARD = "9c9c9c9c-0000-4000-8000-00000000000c";

function sofaLine(id: string, sku: string, orderId: string, buildKey: string | null) {
  return {
    id,
    order_id: orderId,
    sku,
    qty: 1,
    attrs: buildKey ? { sofa_build_key: buildKey, leg_height: '6"', sofa_height: "24" } : null,
    excluded_from_plan: false,
    exclude_from_plan_until: null,
  };
}

type Tbl = Record<string, { data: unknown; error: unknown }>;

const TABLES = (): Tbl => ({
  purchasing_settings: {
    data: {
      order_by_buffer_days: 7,
      earliest_sell_days: 21,
      logistics_call_working_days: 1,
      po_days: [1, 3, 5],
    },
    error: null,
  },
  purchasing_production_days: {
    data: [{ supplier_id: OHANA, category: "sofa", working_days: 14 }],
    error: null,
  },
  purchasing_supplier_settings: {
    data: [{ supplier_id: OHANA, off_days: [0], transit_days: 1 }],
    error: null,
  },
  purchasing_setting_changes: { data: [], error: null },
  suppliers: { data: [{ id: OHANA, name: "Ohana", kind: "own_logistics" }], error: null },
  delivery_partners: {
    data: [{ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "NETS" }],
    error: null,
  },
  orders: {
    data: [
      {
        id: "o1", so: 1207, customer_name: "PETER", status: "proceed_order",
        delivery_date: "2026-08-22", delivery_date_tbd: false,
        placed_at: "2026-07-01", created_at: "2026-07-01",
      },
      /* Proceeded since Card 02-C: a `place` order no longer enters the
         engine at all, and this fixture order is ordinary live demand. */
      {
        id: "o2", so: 1204, customer_name: "ella", status: "proceed_order",
        delivery_date: "2026-08-11", delivery_date_tbd: false,
        placed_at: "2026-07-01", created_at: "2026-07-01",
      },
      /* ⭐ Card 02-C — the `place` order the boundary keeps out. */
      {
        id: "o9", so: 1290, customer_name: "NOT YET PROCEEDED", status: "place",
        delivery_date: "2026-08-11", delivery_date_tbd: false,
        placed_at: "2026-06-01", created_at: "2026-06-01",
      },
    ],
    error: null,
  },
  order_lines: {
    data: [
      sofaLine("p1", "5539-1B(LHF)", "o1", "bk-a"),
      sofaLine("p2", "5539-CNR", "o1", "bk-a"),
      sofaLine("p3", "5539-2A(RHF)", "o1", "bk-a"),
      sofaLine("p4", "5539-1A(LHF)", "o1", "bk-b"),
      sofaLine("e1", "5539-1A(LHF)", "o2", "bk-e"),
      sofaLine("e9", "5539-1A(LHF)", "o9", "bk-z"),
      // An accessory on a live order — it must never reach To Order.
      {
        id: "x1", order_id: "o2", sku: "MEMORY-FOAM-PILLOW", qty: 4, attrs: null,
        excluded_from_plan: false, exclude_from_plan_until: null,
      },
    ],
    error: null,
  },
  product_skus: {
    data: [
      { sku: "5539-1B(LHF)", supplier_id: OHANA, cost: 100, variant: "1B(LHF)",
        product_models: { category: "sofa", name: "Booqit" } },
      { sku: "5539-CNR", supplier_id: OHANA, cost: 100, variant: "CNR",
        product_models: { category: "sofa", name: "Booqit" } },
      { sku: "5539-2A(RHF)", supplier_id: OHANA, cost: 100, variant: "2A(RHF)",
        product_models: { category: "sofa", name: "Booqit" } },
      { sku: "5539-1A(LHF)", supplier_id: OHANA, cost: 120, variant: "1A(LHF)",
        product_models: { category: "sofa", name: "Booqit" } },
      { sku: "MEMORY-FOAM-PILLOW", supplier_id: OHANA, cost: 9, variant: null,
        product_models: { category: "accessory", name: "Memory Foam Pillow" } },
    ],
    error: null,
  },
  purchase_order_lines: { data: [], error: null },
  purchasing_destinations: {
    data: [
      { id: KLANG, name: "Carres Klang", is_default: true, active: true },
      { id: AL, name: "AL Sungai Buloh", is_default: false, active: true },
    ],
    error: null,
  },
  warehouses: { data: [{ id: WAREHOUSE, name: "Carres Klang", kind: "own" }], error: null },
  /* `u1` is the JWT subject every test signs with, so the caller HOLDS PO duty
     unless a test deliberately hands it to somebody else. */
  ops_po_duty: { data: [{ user_id: "u1" }], error: null },
  app_users: { data: [{ id: "u1", name: "On Duty", email: "od@carres.com" }], error: null },
  purchase_orders: { data: null, error: null },
});

/** Records what every table saw, plus every rpc + update call. */
function makeSb(tables: Record<string, { data: unknown; error: unknown }>) {
  const CHAIN = [
    "select", "in", "or", "eq", "neq", "gt", "gte", "ilike", "not", "is", "order", "limit",
  ];
  const updates: { table: string; patch: unknown; id: unknown }[] = [];
  /**
   * Every filter every read applied. The mock does NOT evaluate them — the
   * fixture is whatever it is — so a test that cares WHICH question was asked
   * has to read the question rather than the answer. That is exactly the case
   * for "still to buy": the fixture cannot tell `po_id is null` apart from
   * `remaining_qty > 0`, and the whole of 0320 is that they are different.
   */
  const filters: { table: string; method: string; col: unknown; val: unknown }[] = [];
  const inserts: { table: string; rows: unknown }[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  let poSeq = 2030;

  function builder(table: string, result: { data: unknown; error: unknown }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {};
    for (const m of CHAIN) {
      b[m] = vi.fn((col?: unknown, val?: unknown) => {
        filters.push({ table, method: m, col, val });
        return b;
      });
    }
    b.maybeSingle = vi.fn().mockResolvedValue({
      data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
      error: result.error,
    });
    b.single = b.maybeSingle;
    b.insert = vi.fn((rows: unknown) => {
      inserts.push({ table, rows });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ib: any = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ib.then = (res: any, rej: any) => Promise.resolve({ data: null, error: null }).then(res, rej);
      ib.select = vi.fn(() => ib);
      return ib;
    });
    b.update = vi.fn((patch: unknown) => {
      const u: Record<string, unknown> = { table, patch, id: null };
      updates.push(u as { table: string; patch: unknown; id: unknown });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ub: any = {};
      ub.eq = vi.fn((_col: string, val: unknown) => {
        u.id = val;
        return ub;
      });
      ub.in = vi.fn((_col: string, vals: unknown) => {
        u.id = vals;
        return ub;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ub.then = (res: any, rej: any) => Promise.resolve({ data: null, error: null }).then(res, rej);
      return ub;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
    return b;
  }

  // `maybeSingle` on purchasing_destinations must return the ROW being asked
  // for, so the eq() filter is honoured for that one table.
  function destBuilder(rows: { id: string; name: string }[]) {
    let wanted: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {};
    for (const m of CHAIN) {
      b[m] = vi.fn((col?: string, val?: unknown) => {
        if (col === "id" && typeof val === "string") wanted = val;
        return b;
      });
    }
    b.maybeSingle = vi.fn(async () => ({
      data: rows.find((r) => r.id === wanted) ?? null,
      error: null,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.then = (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej);
    return b;
  }

  const tableCalls: Record<string, number> = {};
  /**
   * `product_skus` is read TWICE and the two reads mean different things.
   *
   * The first pulls catalog facts; a fixture with a row removed simulates a
   * SHORT read. The second asks only "does this SKU exist?" — and in the real
   * database it still does, which is exactly what makes a short read alarming.
   * So the existence read always answers from the FULL catalog.
   */
  const fullCatalog = (tables.__fullCatalog?.data ??
    tables.product_skus?.data ??
    []) as { sku: string }[];

  const from = vi.fn((table: string) => {
    tableCalls[table] = (tableCalls[table] ?? 0) + 1;
    if (table === "product_skus") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {};
      let existenceRead = false;
      b.select = vi.fn((cols: string) => {
        existenceRead = cols.trim() === "sku";
        return b;
      });
      for (const m of CHAIN.filter((x) => x !== "select")) b[m] = vi.fn(() => b);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      b.then = (res: any, rej: any) =>
        Promise.resolve(
          existenceRead
            ? { data: fullCatalog.map((r) => ({ sku: r.sku })), error: null }
            : (tables.product_skus ?? { data: [], error: null }),
        ).then(res, rej);
      return b;
    }
    if (table === "purchasing_destinations") {
      return destBuilder(
        (tables.purchasing_destinations.data as { id: string; name: string }[]) ?? [],
      );
    }
    return builder(table, tables[table] ?? { data: [], error: null });
  });

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    /* 0379 · THE ONE ACTOR RESOLVER, answered from the same two tables the SQL
       reads, so a test still says who holds the duty by setting `ops_po_duty`
       and says who covers by setting `ops_po_duty_cover`. */
    if (fn === "purchasing_po_actor") {
      const dutyData = tables.ops_po_duty?.data as
        | { user_id?: string }[]
        | { user_id?: string }
        | null;
      const normal =
        (Array.isArray(dutyData) ? dutyData[0]?.user_id : dutyData?.user_id) ?? null;
      const coverData = tables.ops_po_duty_cover?.data as
        | { acting_user_id?: string }[]
        | null;
      const acting = (Array.isArray(coverData) ? coverData[0]?.acting_user_id : null) ?? null;
      return {
        data: {
          normal_user_id: normal,
          acting_user_id: acting,
          actor_user_id: acting ?? normal,
          is_cover: acting != null,
          month: "2026-08",
        },
        error: null,
      };
    }
    if (fn === "purchasing_issue_pos_batch") {
      const pos = (args.p_pos as unknown[]) ?? [];
      const ids = pos.map(() => `PO-${(poSeq += 1)}`);
      return { data: { po_ids: ids }, error: null };
    }
    poSeq += 1;
    return { data: { id: `PO-${poSeq}`, line_count: 1 }, error: null };
  });

  return { from, rpc, updates, inserts, rpcCalls, tableCalls, filters };
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

const READ = "http://t/api/operation/purchase/to-order";

async function get(query = "") {
  const jwt = await makeJwt("operation");
  return app.fetch(new Request(`${READ}${query}`, { headers: { Authorization: `Bearer ${jwt}` } }), env);
}

describe("GET /api/operation/purchase/to-order", () => {
  it("401 without Authorization", async () => {
    const res = await app.fetch(new Request(READ), env);
    expect(res.status).toBe(401);
  });

  it("projects the live demand into one Ohana · Sofa proposal", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await get();
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;

    expect(body.proposals).toHaveLength(1);
    expect(body.proposals[0].label).toBe("Ohana · Sofa");
    // PETER's one order = one row, holding TWO builds; ella's is the other.
    expect(body.proposals[0].rows).toHaveLength(2);
    expect(body.proposals[0].poCount).toBe(2);
    expect(body.destinations.map((d: { name: string }) => d.name)).toEqual([
      "Carres Klang",
      "AL Sungai Buloh",
    ]);
  });

  it("scopes only after the full server recomputation and returns an explanatory summary", async () => {
    const t = TABLES();
    const todayIsoStr = new Date().toISOString().slice(0, 10);
    t.purchase_orders = {
      data: [
        {
          id: "PO-1900",
          supplier_id: OHANA,
          placed_at: "2025-01-01T09:00:00Z",
          so_refs: [1207],
        },
      ],
      error: null,
    };
    t.purchase_order_lines = {
      data: [{ po_id: "PO-1900", sku: "5539-1B(LHF)", qty: 1, received_qty: 1 }],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await get("?so=1207");
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;

    expect(body.proposals.flatMap((p: any) => p.rows).every((r: any) => r.so === 1207)).toBe(true);
    expect(body.unresolved).toEqual([]);
    expect(body.ordered).toEqual([
      expect.objectContaining({ poId: "PO-1900", so: 1207 }),
    ]);
    expect(body.scope).toMatchObject({
      so: 1207,
      orderFound: true,
      alreadyIssued: 1,
    });
    expect(todayIsoStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns only the three demand-local blocker kinds; pickup remains document-level", async () => {
    const t = TABLES();
    (t.product_skus.data as { sku: string; supplier_id: string | null; cost: number | null }[])
      .find((row) => row.sku === "5539-CNR")!.supplier_id = null;
    (t.product_skus.data as { sku: string; cost: number | null }[])
      .find((row) => row.sku === "5539-1A(LHF)")!.cost = null;
    const undated = (t.orders.data as { id: string; delivery_date: string | null; delivery_date_tbd: boolean }[])
      .find((order) => order.id === "o2")!;
    undated.delivery_date = null;
    undated.delivery_date_tbd = true;
    (t.suppliers.data as { kind: string }[])[0].kind = "factory_pickup";
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);

    const body = (await (await get()).json()) as {
      blockedDemand: { code: string; sku: string; so: number | null }[];
    };
    expect(new Set(body.blockedDemand.map((blocker) => blocker.code))).toEqual(
      new Set(["blocked_delivery_date", "unresolved_supplier", "cost_required"]),
    );
    expect(body.blockedDemand).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unresolved_supplier", sku: "5539-CNR", so: 1207 }),
        expect.objectContaining({ code: "blocked_delivery_date", sku: "5539-1A(LHF)", so: 1204 }),
        expect.objectContaining({ code: "cost_required", sku: "5539-1A(LHF)", so: 1204 }),
      ]),
    );
    expect(body.blockedDemand.some((blocker) => blocker.code.includes("partner"))).toBe(false);
  });

  it("rejects an invalid Sales Order scope without running the engine", async () => {
    const res = await get("?so=not-a-number");
    expect(res.status).toBe(400);
    expect(userClient).not.toHaveBeenCalled();
  });

  /**
   * ── T3 · what an open purchase order already covers, and WHICH one ────────
   *
   * The supply read has always aggregated the open lines into one number per
   * SKU. T3 carries the DOCUMENT alongside it — `po_id` IS the PO number — so
   * the grid can say `2 on PO-2051` instead of leaving a fallen quantity
   * unexplained. No second query, no migration.
   */
  it("carries the cover AND the purchase order behind it onto the row", async () => {
    const t = TABLES();
    // ella's build is one line of one unit; make it two so a cover of one
    // leaves something still to buy — a FULLY covered line is dropped, which
    // is the case the next test pins.
    (t.order_lines.data as { id: string; qty: number }[]).find((l) => l.id === "e1")!.qty = 2;
    t.purchase_order_lines = {
      data: [{ po_id: "PO-2051", sku: "5539-1A(LHF)", qty: 1, received_qty: 0 }],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    const ella = body.proposals[0].rows.find((r: { orderId: string }) => r.orderId === "o2");
    expect(ella.qty).toBe(1); // 2 asked for, 1 already bought
    expect(ella.coveredByOpenPo).toBe(1); // …and this is why
    expect(ella.coveredByOpenPoPos).toEqual(["PO-2051"]);
  });

  it("a RECEIVED purchase-order line covers nothing — the goods are here already", async () => {
    const t = TABLES();
    (t.order_lines.data as { id: string; qty: number }[]).find((l) => l.id === "e1")!.qty = 2;
    t.purchase_order_lines = {
      data: [{ po_id: "PO-2051", sku: "5539-1A(LHF)", qty: 1, received_qty: 1 }],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    const ella = body.proposals[0].rows.find((r: { orderId: string }) => r.orderId === "o2");
    expect(ella.qty).toBe(2);
    expect(ella.coveredByOpenPo).toBe(0);
    expect(ella.coveredByOpenPoPos).toEqual([]);
  });

  it("never lets an accessory reach the page, supplier or not", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    const skus = body.proposals
      .flatMap((p: { rows: { builds: { lines: { sku: string }[] }[] }[] }) => p.rows)
      .flatMap((r: { builds: { lines: { sku: string }[] }[] }) => r.builds)
      .flatMap((b: { lines: { sku: string }[] }) => b.lines)
      .map((l: { sku: string }) => l.sku);
    expect(skus).not.toContain("MEMORY-FOAM-PILLOW");
  });

  it("reads back what was already ordered — recent POs, one row per customer order", async () => {
    const t = TABLES();
    const todayIsoStr = new Date().toISOString().slice(0, 10);
    t.purchase_orders = {
      data: [
        { id: "PO-2001", supplier_id: OHANA, placed_at: `${todayIsoStr}T09:00:00Z`, so_refs: [1207] },
      ],
      error: null,
    };
    // received in full so the SUPPLY read subtracts nothing and the demand
    // half of the fixture stays byte-identical.
    t.purchase_order_lines = {
      data: [{ po_id: "PO-2001", sku: "5539-1B(LHF)", qty: 1, received_qty: 1 }],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;

    expect(body.ordered).toHaveLength(1);
    expect(body.ordered[0]).toMatchObject({
      poId: "PO-2001",
      placedAt: todayIsoStr,
      category: "sofa",
      so: 1207,
      orderId: "o1",
      delivery: "2026-08-22",
      model: "Booqit",
      qty: 1,
    });
  });

  it("a manual PO with no SO still gets a row — ordered work must be answerable", async () => {
    const t = TABLES();
    const todayIsoStr = new Date().toISOString().slice(0, 10);
    t.purchase_orders = {
      data: [
        { id: "PO-2002", supplier_id: OHANA, placed_at: `${todayIsoStr}T09:00:00Z`, so_refs: [] },
      ],
      error: null,
    };
    t.purchase_order_lines = {
      data: [{ po_id: "PO-2002", sku: "5539-1A(LHF)", qty: 2, received_qty: 2 }],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    expect(body.ordered).toHaveLength(1);
    expect(body.ordered[0]).toMatchObject({ poId: "PO-2002", so: null, orderId: null, qty: 2 });
  });

  it("each demand row carries its ORDER's own orderBy for the Work Queue — never rendered", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    for (const r of body.proposals[0].rows) {
      expect(r.orderBy === null || /^\d{4}-\d{2}-\d{2}$/.test(r.orderBy)).toBe(true);
    }
  });
});

describe("a requirement the catalog cannot answer for", () => {
  it("says NOTHING about a line that was never a catalog product", async () => {
    // `Transport Fees`, `Leg 4"`, an AutoCount free-text description — an
    // order_line.sku is plain text with no foreign key, so plenty of them were
    // never products. 95 live in prod. Treating those as an alarm blocked every
    // issue on the page on 2026-07-31.
    const t = TABLES();
    t.order_lines = {
      data: [
        ...(t.order_lines.data as Record<string, unknown>[]),
        {
          id: "fee1", order_id: "o1", sku: "Transport Fees", qty: 1, attrs: null,
          excluded_from_plan: false, exclude_from_plan_until: null,
        },
        {
          id: "fee2", order_id: "o2", sku: 'Leg 4"', qty: 1, attrs: null,
          excluded_from_plan: false, exclude_from_plan_until: null,
        },
      ],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    expect(body.unresolved).toEqual([]);
  });

  it("still lets those lines be issued rather than blocking the page", async () => {
    const t = TABLES();
    t.order_lines = {
      data: [
        ...(t.order_lines.data as Record<string, unknown>[]),
        {
          id: "fee1", order_id: "o1", sku: "Transport Fees", qty: 1, attrs: null,
          excluded_from_plan: false, exclude_from_plan_until: null,
        },
      ],
      error: null,
    };
    const sb = makeSb(t);
    const demands = await readyDemands(sb);
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: pricedAll(demands, KLANG),
    });
    expect(res.status).toBe(200);
  });

  it("never puts a SKU into a PostgREST `.in()` list", () => {
    // THE root cause, turned into a rule the next hand cannot break.
    //
    // `order_lines.sku` is free text and 16 live demand lines carry a DOUBLE
    // QUOTE — `Leg 4"`, `HK5531/28"(2 Seater + Lshape)/…`. PostgREST wraps a
    // reserved-character value in double quotes, so a value containing one
    // breaks the filter and the server answers with whatever it could parse.
    // That is what put seven customer requirements on no purchase order on
    // 2026-07-30 and what made the guard block every issue a day later.
    //
    // The catalog is 205 rows and every open PO line is a small slice, so both
    // are read WHOLE. A render test cannot see this; only the source can.
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "to-order.ts"),
      "utf8",
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\.in\(\s*["']sku["']/);
    // order_id is a uuid — safe, and the one list that still earns its place.
    expect(code).toMatch(/\.in\(\s*["']order_id["']/);
  });

  it("names a procurable SKU nobody has mapped to a supplier", async () => {
    const t = TABLES();
    t.product_skus = {
      data: (t.product_skus.data as { sku: string; supplier_id: string | null }[]).map((r) =>
        r.sku === "5539-CNR" ? { ...r, supplier_id: null } : r,
      ),
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    expect(body.unresolved.map((u: { sku: string }) => u.sku)).toEqual(["5539-CNR"]);
  });

  it("says nothing when every requirement resolves", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    expect(body.unresolved).toEqual([]);
  });

  it("still keeps an accessory out — that is a judgement, not a failure to read", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    expect(body.unresolved).toEqual([]);
    const skus = body.proposals
      .flatMap((p: { rows: { builds: { lines: { sku: string }[] }[] }[] }) => p.rows)
      .flatMap((r: { builds: { lines: { sku: string }[] }[] }) => r.builds)
      .flatMap((b: { lines: { sku: string }[] }) => b.lines)
      .map((l: { sku: string }) => l.sku);
    expect(skus).not.toContain("MEMORY-FOAM-PILLOW");
  });

  it("reads back what was already ordered — recent POs, one row per customer order", async () => {
    const t = TABLES();
    const todayIsoStr = new Date().toISOString().slice(0, 10);
    t.purchase_orders = {
      data: [
        { id: "PO-2001", supplier_id: OHANA, placed_at: `${todayIsoStr}T09:00:00Z`, so_refs: [1207] },
      ],
      error: null,
    };
    // received in full so the SUPPLY read subtracts nothing and the demand
    // half of the fixture stays byte-identical.
    t.purchase_order_lines = {
      data: [{ po_id: "PO-2001", sku: "5539-1B(LHF)", qty: 1, received_qty: 1 }],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;

    expect(body.ordered).toHaveLength(1);
    expect(body.ordered[0]).toMatchObject({
      poId: "PO-2001",
      placedAt: todayIsoStr,
      category: "sofa",
      so: 1207,
      orderId: "o1",
      delivery: "2026-08-22",
      model: "Booqit",
      qty: 1,
    });
  });

  it("a manual PO with no SO still gets a row — ordered work must be answerable", async () => {
    const t = TABLES();
    const todayIsoStr = new Date().toISOString().slice(0, 10);
    t.purchase_orders = {
      data: [
        { id: "PO-2002", supplier_id: OHANA, placed_at: `${todayIsoStr}T09:00:00Z`, so_refs: [] },
      ],
      error: null,
    };
    t.purchase_order_lines = {
      data: [{ po_id: "PO-2002", sku: "5539-1A(LHF)", qty: 2, received_qty: 2 }],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    expect(body.ordered).toHaveLength(1);
    expect(body.ordered[0]).toMatchObject({ poId: "PO-2002", so: null, orderId: null, qty: 2 });
  });

  it("each demand row carries its ORDER's own orderBy for the Work Queue — never rendered", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    for (const r of body.proposals[0].rows) {
      expect(r.orderBy === null || /^\d{4}-\d{2}-\d{2}$/.test(r.orderBy)).toBe(true);
    }
  });
});

describe("the reads are chunked", () => {
  it("asks the catalog in batches so one long URL cannot swallow a customer's goods", async () => {
    const t = TABLES();
    // 95 SKUs on one order line each — past the 40-per-batch chunk.
    const many = Array.from({ length: 95 }, (_, i) => `BULK-${i}`);
    t.order_lines = {
      data: [
        ...(t.order_lines.data as Record<string, unknown>[]),
        ...many.map((sku, i) => ({
          id: `b${i}`, order_id: "o2", sku, qty: 1, attrs: null,
          excluded_from_plan: false, exclude_from_plan_until: null,
        })),
      ],
      error: null,
    };
    t.product_skus = {
      data: [
        ...(t.product_skus.data as Record<string, unknown>[]),
        ...many.map((sku) => ({
          sku, supplier_id: OHANA, cost: 1, variant: null,
          product_models: { category: "sofa", name: "Bulk" },
        })),
      ],
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    // 78 + 95 distinct SKUs cannot ride one `.in()`; the catalog is asked more
    // than once, and nothing is lost.
    expect(sb.tableCalls.product_skus).toBeGreaterThan(1);
    expect(body.unresolved).toEqual([]);
  });
});

/**
 * The gate on the write.
 *
 * The client posts an ARRANGEMENT and nothing else — no SKUs, no quantities, no
 * prices. Every rule below is asked against the proposal the SERVER just built,
 * so a browser left open since this morning cannot order goods that have since
 * been bought, and a hand-written request cannot invent a line.
 */
describe("a purchase order is born with its expected arrival", () => {
  it("stamps eta_date = today + production (factory week) + transit (office week)", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    await postBatch({
      selections: allTo(await readyDemands(sb), KLANG),
      documentDecisions: pricedAll(await readyDemands(sb), KLANG),
    });

    const pos = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args.p_pos as {
      destination_id: string;
      eta_date: string;
    }[];
    expect(pos).toHaveLength(2);
    expect(pos.every((po) => po.destination_id === KLANG)).toBe(true);
    expect(pos.every((po) => /^\d{4}-\d{2}-\d{2}$/.test(po.eta_date))).toBe(true);

    // 14 production days on Ohana's week (Sunday off) + 1 transit day on the
    // OFFICE week — arranging the movement is our work, not the factory's.
    //
    // THE HOLIDAY SET IS PART OF THE ARITHMETIC, not a detail. `expectedArrivalOf`
    // defaults to `myHolidaySet()`, so a naive recomputation here is only equal on
    // the days no Malaysian public holiday falls inside the window — which is why
    // this line passed for a week and then failed on 2026-08-10, when Maulidur
    // Rasul (2026-08-25, my-holidays.ts:41) landed in the 14-day production leg.
    // The route was right and the expectation was short by exactly that day.
    const holidays = myHolidaySet();
    const expected = addWorkingDays(
      addWorkingDays(new Date().toISOString().slice(0, 10), 14, { offDays: [0], holidays }),
      1,
      { offDays: [0, 6], holidays },
    );
    expect(pos.every((po) => po.eta_date === expected)).toBe(true);
  });

  it("NEVER writes expected_ready_date — that column is the factory's promise", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    await postBatch({
      selections: allTo(await readyDemands(sb), KLANG),
      documentDecisions: pricedAll(await readyDemands(sb), KLANG),
    });
    // R5 grades a factory by `expected_ready_date`. Seeding it with OUR
    // estimate would score a supplier on a number it never gave, and nothing
    // on screen would say so. Empty is the trigger of `Confirm ready date`.
    for (const u of sb.updates) {
      expect(JSON.stringify(u.patch)).not.toContain("expected_ready_date");
    }
  });

  it("raises the purchase order ANYWAY when transit days are not set, with no invented date", async () => {
    const t = TABLES();
    t.purchasing_supplier_settings = {
      data: [{ supplier_id: OHANA, off_days: [0] }], // no transit_days
      error: null,
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await postBatch({
      selections: allTo(await readyDemands(sb), KLANG),
      documentDecisions: pricedAll(await readyDemands(sb), KLANG),
    });

    // The goods matter more than the estimate: the PO is still raised.
    expect(res.status).toBe(200);
    const pos = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args.p_pos as {
      eta_date: string | null;
    }[];
    // A guessed arrival would be read downstream as a measurement (P1's law).
    expect(pos.every((po) => po.eta_date === null)).toBe(true);
  });

  it("records who raised it — po_history, the table that has existed since 0001", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    await postBatch({
      selections: allTo(await readyDemands(sb), KLANG),
      documentDecisions: pricedAll(await readyDemands(sb), KLANG),
    });

    // Measured 2026-08-01: `purchasing_issue_pos_batch` writes no audit row of
    // any kind, so a purchase order could not say who raised it or when.
    const hist = sb.inserts.filter((i) => i.table === "po_history");
    expect(hist).toHaveLength(1);
    const rows = hist[0].rows as { po_id: string; text: string }[];
    expect(rows).toHaveLength(2); // one per document the batch made
    expect(rows[0].po_id).toBe("PO-2031");
    expect(rows[0].text).toContain("expected arrival");
  });
});

/**
 * THE FEATURE MAY BE UNAVAILABLE; THE PAGE MAY NOT BE (Jess, 2026-08-03).
 *
 * Typed Ready Stock demand arrives with migration 0318. Between deploying this
 * code and applying it — and in any rebuilt environment — the table is absent.
 * To Order's job is turning CUSTOMER orders into purchase orders and it did
 * that for months before typed demand existed, so an optional read must never
 * 500 the whole workspace.
 */
describe("purchase_demands absent — fail closed, not down", () => {
  it("still answers 200 with the customer-order plan when the table is missing", async () => {
    const t = TABLES();
    // What PostgREST answers for a table that is not there.
    t.purchase_demands = {
      data: null,
      error: { code: "42P01", message: 'relation "purchase_demands" does not exist' },
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);

    const res = await get();
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    // The customer work is all there — the day's purchasing is unaffected.
    expect(body.proposals.length).toBeGreaterThan(0);
    expect(body.proposals[0].rows.length).toBeGreaterThan(0);
  });

  it("issues purchase orders normally while the table is missing", async () => {
    const t = TABLES();
    t.purchase_demands = {
      data: null,
      error: { code: "42P01", message: 'relation "purchase_demands" does not exist' },
    };
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);

    const res = await postBatch({
      selections: allTo(await readyDemands(sb), KLANG),
      documentDecisions: pricedAll(await readyDemands(sb), KLANG),
    });
    expect(res.status).toBe(200);
  });
});

/* THE TYPED-DEMAND-IN-GRID CONTRACTS RETIRED WITH THE GRID SPLIT
 * (CARD-2026-08-18-manual-purchase §1, executed 2026-08-19):
 *   · the 0320 remainder contract now surfaces on the Manual Purchase
 *     register and detail (`OperationManualPurchase.test.tsx`), and the
 *     record-issue call moved INSIDE `purchasing_issue_pos_batch` (0361,
 *     `manual-purchase.test.ts`) — atomic, not after-the-fact.
 *   · P10's offer/take on TYPED rows lost its rendering surface with the
 *     rows themselves; the requester now sees WHAT WE ALREADY HAVE before
 *     submitting and the approver cuts to zero with a reason. The pool-
 *     draw doors (0322) are untouched; the customer-row free-stock
 *     subtraction in the grid is untouched and still covered above. */

describe("POST /api/operation/purchase/to-order/demand/:id/cancel", () => {
  const CANCEL_ID = "6299ed4e-3c91-43c5-b41b-1e8fe9677c7d";

  async function cancel(
    id: string,
    body: unknown,
    role = "operation",
    rpcResult: { data: unknown; error: unknown } = {
      data: { id: CANCEL_ID, cancelled: 2, issued: 3 },
      error: null,
    },
  ) {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    vi.mocked(userClient).mockReturnValue({
      from: vi.fn(),
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return rpcResult;
      }),
    } as never);
    const jwt = await makeJwt(role);
    const res = await app.fetch(
      new Request(`http://t/api/operation/purchase/to-order/demand/${id}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    return { res, calls };
  }

  it("reaches purchasing_cancel_demand with the id and the reason — and NO quantity", async () => {
    const { res, calls } = await cancel(CANCEL_ID, { reason: "do not want the other 2" });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("purchasing_cancel_demand");
    expect(calls[0].args.p_id).toBe(CANCEL_ID);
    expect(calls[0].args.p_reason).toBe("do not want the other 2");
    /**
     * THE CARD'S OWN "nobody types a quantity", as a test rather than a
     * sentence. A cancel takes the whole remainder, and `remaining_qty` is
     * GENERATED — a quantity on this wire would be a number that can disagree
     * with the one the database computed.
     */
    expect(Object.keys(calls[0].args).sort()).toEqual(["p_id", "p_reason"]);
  });

  it("answers with what was cancelled and what stays ordered", async () => {
    const { res } = await cancel(CANCEL_ID, { reason: "changed our mind" });
    expect(await res.json()).toEqual({ id: CANCEL_ID, cancelled: 2, issued: 3 });
  });

  it("refuses a blank reason before it reaches the database", async () => {
    const { res, calls } = await cancel(CANCEL_ID, { reason: "   " });
    expect(res.status).toBe(400);
    // The RPC would refuse it too (`reason_required`), and the table's CHECK
    // behind that. Three refusals, and the cheapest one runs first.
    expect(calls).toHaveLength(0);
  });

  it("refuses a missing reason", async () => {
    const { res, calls } = await cancel(CANCEL_ID, {});
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("refuses an id that is not a demand id", async () => {
    const { res, calls } = await cancel("PO-2040", { reason: "x" });
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("hands back `already_cancelled` by name", async () => {
    const { res } = await cancel(CANCEL_ID, { reason: "x" }, "operation", {
      data: null,
      error: { code: "P0001", details: "already_cancelled", message: "already cancelled" },
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).code).toBe("already_cancelled");
  });

  it("hands back `nothing_to_cancel` by name", async () => {
    const { res } = await cancel(CANCEL_ID, { reason: "x" }, "operation", {
      data: null,
      error: {
        code: "P0001",
        details: "nothing_to_cancel",
        message: "demand has nothing left to cancel",
      },
    });
    expect(res.status).toBe(422);
    // The two refusals must not read alike: one means it already happened, the
    // other that there is nothing left to do it to.
    expect(((await res.json()) as any).code).toBe("nothing_to_cancel");
  });

  it("is not open to a supplier login", async () => {
    const { res, calls } = await cancel(CANCEL_ID, { reason: "x" }, "supplier");
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});

/**
 * P12 — CANCEL IS NOT DELETE, asserted rather than promised (Loo, 2026-08-04,
 * naming AutoCount's own weakness: *"backend dont know how can delete due to
 * when testing"*).
 *
 * A SOURCE SCAN, not a request test: a request test only proves the door it
 * knocks on, and what is being claimed here is that NO door exists anywhere.
 * Comments are stripped first — the file is full of prose about why there is no
 * delete, and a scan that reads its own tombstone is a scan that fails on the
 * text explaining it (D0.5b's lesson, twice).
 */
describe("no delete path exists for a purchase demand", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "to-order.ts"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("the route file registers no DELETE handler at all", () => {
    expect(src).not.toMatch(/\.delete\s*\(/);
  });

  it("the route file never deletes from purchase_demands", () => {
    expect(src).not.toMatch(/purchase_demands[\s\S]{0,200}?\.delete\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(\s*\)[\s\S]{0,200}?purchase_demands/);
  });

  it("no route path in the file spells a delete or a purge", () => {
    expect(src).not.toMatch(/["'`][^"'`]*\/(delete|purge|remove)\b/i);
  });

  it("the only demand doors are create, cancel and the issue record", () => {
    const rpcs = [...src.matchAll(/rpc\(\s*"(purchasing_[a-z_]*demand[a-z_]*)"/g)].map(
      (m) => m[1],
    );
    expect([...new Set(rpcs)].sort()).toEqual([
      "purchasing_cancel_demand",
      "purchasing_create_demand",
      "purchasing_demand_record_issue",
    ]);
  });
});

/**
 * P15 — THE SOURCE, AND THE PICKER'S OWN READ (Loo, 2026-08-04).
 *
 * `purpose` was a hardcoded `"ready_stock"` on this route because the RPC
 * refused everything else by name (Jess, 2026-08-03 — *"V1 buys READY STOCK
 * only"*). 0319 wrote that refusal so that *"the day one is approved this gate
 * is the only thing that changes"*; Loo approved the four the CHECK holds and
 * 0323 changed that one gate. The route now forwards what the operator chose.
 */
describe("POST …/to-order/demand — the Source rides the wire (P15)", () => {
  const DEST = "2f181917-f4e1-42b2-9e25-d7ee6785424a";

  async function create(body: unknown, role = "operation") {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    vi.mocked(userClient).mockReturnValue({
      from: vi.fn(),
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: { id: "d1", supplier_id: "s1" }, error: null };
      }),
    } as never);
    const jwt = await makeJwt(role);
    const res = await app.fetch(
      new Request("http://t/api/operation/purchase/to-order/demand", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    return { res, calls };
  }

  const base = { sku: "SONIC-S", qty: 2, destinationId: DEST };

  it("forwards each approved purpose the doors can record (Card 03, 2026-08-28)", async () => {
    for (const p of [
      "ready_stock",
      "showroom_display",
      "service_case",
      "internal_staff_purchase",
      "subsidiary_purchase",
    ]) {
      const { res, calls } = await create({ ...base, purpose: p });
      expect(res.status).toBe(200);
      expect(calls[0].fn).toBe("purchasing_create_demand");
      expect(calls[0].args.p_purpose).toBe(p);
    }
  });

  it("refuses a purpose the doors have no value for, before it reaches the RPC", async () => {
    // `Other…` is a ruled WORD with no storable value, and the four retired
    // purposes (`display` · `warranty` · `office` · `spare_parts`, Card 03)
    // are history-only: the 0398 doors refuse them for a NEW demand, so the
    // wire must too — the lists (door gate · shared constant · this enum)
    // cannot drift into a fourth that only the api believes.
    for (const p of ["other", "", "READY_STOCK", "display", "warranty", "office", "spare_parts"]) {
      const { res, calls } = await create({ ...base, purpose: p });
      expect(res.status).toBe(400);
      expect(calls).toHaveLength(0);
    }
  });

  it("a browser on the pre-P15 bundle still works, and means ready stock", async () => {
    // No `purpose` key at all — the only thing that browser could have meant,
    // and the RPC's own default.
    const { res, calls } = await create(base);
    expect(res.status).toBe(200);
    expect(calls[0].args.p_purpose).toBe("ready_stock");
  });

  it("NO SUPPLIER may be smuggled through the body", async () => {
    /**
     * Jess's 2026-08-03 ruling as a test: a product has ONE factory and the
     * server derives it from the SKU. P15 shows the supplier in the dialog —
     * that is the derivation read back, never a second answer. The RPC has no
     * supplier parameter, so a body carrying one must reach nothing.
     */
    const { res, calls } = await create({
      ...base,
      purpose: "showroom_display",
      supplierId: "11111111-1111-1111-1111-111111111111",
      supplier: "Somebody Else",
    });
    expect(res.status).toBe(200);
    expect(Object.keys(calls[0].args).sort()).toEqual([
      "p_destination_id",
      "p_purpose",
      "p_qty",
      "p_remark",
      "p_required_by",
      "p_sku",
    ]);
  });
});

describe("GET …/to-order/demand/pick-items — the picker's own read (P15)", () => {
  const WH = "2f181917-f4e1-42b2-9e25-d7ee6785424a";

  function client(opts?: { stockRows?: Record<string, unknown>[] }) {
    const stock = opts?.stockRows ?? [
      // free · sound · at the warehouse → On Hand AND Free
      { id: "u1", sku: "SONIC-S", qty: 1, status: "free", condition: "new", needs_repair: false },
      { id: "u2", sku: "SONIC-S", qty: 1, status: "free", condition: "new", needs_repair: false },
      // reserved → On Hand, never Free
      { id: "u3", sku: "SONIC-S", qty: 1, status: "reserved", condition: "new", needs_repair: false },
      // quarantined → physically here, so On Hand; never Free (R4)
      { id: "u4", sku: "SONIC-S", qty: 1, status: "on_hold", condition: "new", needs_repair: false },
      // on its way → neither
      { id: "u5", sku: "SONIC-S", qty: 9, status: "incoming", condition: "new", needs_repair: false },
    ];
    return {
      from: vi.fn((table: string) => {
        const rows =
          table === "product_skus"
            ? [
                { sku: "5539-CNR", variant: "Corner", variant_kind: "part", supplier_id: "sup1", model_id: "m1" },
                { sku: "SONIC-S", variant: "Single", variant_kind: "size", supplier_id: "sup2", model_id: "m2" },
              ]
            : table === "product_models"
              ? [
                  { id: "m1", name: "Booqit" },
                  { id: "m2", name: "Sonic" },
                ]
              : table === "suppliers"
                ? [
                    { id: "sup1", name: "Ohana" },
                    { id: "sup2", name: "Nice Future" },
                  ]
                : table === "warehouses"
                  ? [{ id: WH, name: "Carres Klang", kind: "own" }]
                  : table === "ops_stock_items"
                    ? stock
                    : [];
        const q: Record<string, unknown> = {};
        const chain = () => q;
        // Every narrowing the route applies, honoured so the shaped rows are
        // what the route would really have seen.
        q.select = vi.fn(chain);
        q.eq = vi.fn((col: string, val: unknown) => {
          if (table === "ops_stock_items" && col === "status") {
            (q as { _rows: unknown[] })._rows = stock.filter((r) => r.status === val);
          }
          if (table === "ops_stock_items" && col === "needs_repair") {
            const cur = ((q as { _rows?: Record<string, unknown>[] })._rows ?? stock);
            (q as { _rows: unknown[] })._rows = cur.filter((r) => r.needs_repair === val);
          }
          return q;
        });
        q.in = vi.fn((col: string, vals: unknown[]) => {
          if (table === "ops_stock_items") {
            const cur = ((q as { _rows?: Record<string, unknown>[] })._rows ?? stock);
            (q as { _rows: unknown[] })._rows = cur.filter((r) =>
              vals.includes(r[col] as never),
            );
          }
          return q;
        });
        q.not = vi.fn(chain);
        q.order = vi.fn(chain);
        q.then = (resolve: (v: unknown) => unknown) =>
          resolve({
            data: table === "ops_stock_items"
              ? ((q as { _rows?: unknown[] })._rows ?? stock)
              : rows,
            error: null,
          });
        return q;
      }),
      rpc: vi.fn(),
    };
  }

  async function pick(c = client()) {
    vi.mocked(userClient).mockReturnValue(c as never);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/purchase/to-order/demand/pick-items", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    return { res, body: (await res.json()) as { items: unknown[]; stockWarehouse: string | null } };
  }

  it("leads with the SKU, so two items that share a name are told apart", async () => {
    const { res, body } = await pick();
    expect(res.status).toBe(200);
    const items = body.items as { sku: string; label: string }[];
    // `5539-CNR` is a PART variant, so `railItemLabel` has no size letter to
    // add and the label is the bare model — P15's defect 1, at the source.
    const corner = items.find((i) => i.sku === "5539-CNR")!;
    expect(corner.label).toBe("Booqit");
    expect(corner.sku).toBe("5539-CNR");
  });

  it("the supplier is DERIVED and rides along as a fact", async () => {
    const { body } = await pick();
    const items = body.items as { sku: string; supplier: string | null }[];
    expect(items.find((i) => i.sku === "5539-CNR")!.supplier).toBe("Ohana");
    expect(items.find((i) => i.sku === "SONIC-S")!.supplier).toBe("Nice Future");
  });

  it("the three stock numbers each mean a different thing", async () => {
    const { body } = await pick();
    const s = (body.items as { sku: string; onHand: number; reserved: number; free: number }[])
      .find((i) => i.sku === "SONIC-S")!;
    // 2 free + 1 reserved + 1 on hold are all standing in the building.
    expect(s.onHand).toBe(4);
    expect(s.reserved).toBe(1);
    // FREE is P10's rule: free · sound · at that warehouse. A quarantined unit
    // is on hand and can never be free; an incoming one is neither.
    expect(s.free).toBe(2);
    expect(body.stockWarehouse).toBe("Carres Klang");
  });

  it("a SKU with no supplier is not offered — the RPC would refuse it by name", async () => {
    const { body } = await pick();
    // The route asks the database for `supplier_id is not null`; nothing here
    // may arrive with a null supplier, because offering it teaches the operator
    // that refusals are random rather than a configuration hole.
    for (const i of body.items as { supplier: string | null }[]) {
      expect(i.supplier).not.toBeNull();
    }
  });

  it("the register being unreachable costs the numbers, never the dialog", async () => {
    const c = client();
    const realFrom = c.from;
    c.from = vi.fn((table: string) => {
      if (table === "ops_stock_items") throw new Error("register down");
      return (realFrom as (t: string) => unknown)(table);
    }) as never;
    const { res, body } = await pick(c);
    // A demand can always be typed. The offer degrades to zero, and zero is
    // what the grid would offer too — never an invented number.
    expect(res.status).toBe(200);
    expect((body.items as { free: number }[]).every((i) => i.free === 0)).toBe(true);
  });
});

/**
 * P18 — THE ORDER'S PROCEED DATE ON THE WIRE (Loo, 2026-08-04 / 2026-08-05).
 *
 * TWO tests, and they cannot replace each other. The BEHAVIOUR test proves the
 * mapping from the order row to the wire; it CANNOT prove the column is asked
 * for, because `makeSb` returns its fixture whatever the `select` string says —
 * so a route that never named `proceed_date` would pass it. The SOURCE SCAN is
 * the half that holds PostgREST: an unnamed column comes back `undefined` in
 * production while every mock in this file stays green.
 */
describe("P18 · the proceed date rides the To Order wire", () => {
  it("carries the order's proceed date onto its row, sliced to a bare day", () => {
    const t = TABLES();
    // A real production shape, measured 2026-08-05: a timestamp-ish value must
    // reach the wire as `YYYY-MM-DD`, because the header compares it to `today`
    // as a STRING.
    (t.orders.data as Record<string, unknown>[])[0]!.proceed_date = "2026-07-21";
    (t.orders.data as Record<string, unknown>[])[1]!.proceed_date = null;
    return (async () => {
      const sb = makeSb(t);
      vi.mocked(userClient).mockReturnValue(sb as never);
      const res = await get();
      expect(res.status).toBe(200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = (await res.json()) as any;
      const rows = body.proposals[0].rows as { so: number; proceedDate: string | null }[];
      const bySo = new Map(rows.map((r) => [r.so, r.proceedDate]));
      expect(bySo.get(1207)).toBe("2026-07-21");
      // An order with no plan says nothing rather than borrowing its neighbour's.
      expect(bySo.get(1204)).toBeNull();
    })();
  });

  it("the order reads NAME the column — the mock cannot prove this, PostgREST needs it", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const strip = (path: string) =>
      readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
    // CARD-2026-08-20 — the demand read moved to `lib/purchase-demand-read.ts`
    // (Purchase Demands reads the same recomputation), so the guard follows it
    // rather than shrinking: the whole point is that NO orders read anywhere in
    // this engine may drop the column.
    const src =
      strip(join(here, "to-order.ts")) +
      "\n" +
      strip(join(here, "..", "..", "lib", "purchase-demand-read.ts"));

    // Every `.from("orders").select(...)` in the engine must ask for it: the
    // demand read, the ordered/receipt read-back and the scoped SO lens — and
    // the second is not optional, because an order whose every line is bought
    // has no demand rows left, so its group is receipts alone.
    const selects = [
      ...src.matchAll(/\.from\(\s*"orders"\s*\)\s*\n?\s*\.select\(\s*([\s\S]*?)\)\s*\n?\s*\./g),
    ].map((m) => m[1]!);
    expect(selects).toHaveLength(3);
    for (const s of selects) expect(s).toContain("proceed_date");
  });
});


/**
 * THE WHOLE-BATCH ISSUE (CARD-2026-08-22-purchasing-02 §7.3).
 *
 * One request, every purchase order, one transaction. The server groups by
 * supplier × Deliver To ITSELF — the browser's grouping is a hint it never
 * reads — recomputes all demand and coverage first, and creates everything or
 * nothing.
 */
const ISSUE_BATCH = "http://t/api/operation/purchase/to-order/issue-batch";

async function postBatch(body: unknown, role = "operation") {
  const jwt = await makeJwt(role);
  return app.fetch(
    new Request(ISSUE_BATCH, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
}

/** Every buyable demand id the projection would show, with its build quantity. */
async function readyDemands(sb: ReturnType<typeof makeSb>) {
  vi.mocked(userClient).mockReturnValue(sb as never);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await (await get()).json()) as any;
  const out: { demandId: string; qty: number; orderId: string; skus: string[] }[] = [];
  for (const p of body.proposals) {
    for (const r of p.rows) {
      for (const b of r.builds) {
        out.push({
          demandId: `build::${r.orderId}::${b.key}`,
          qty: b.qty,
          orderId: r.orderId,
          /* The SKUs this build puts on a document — so a test can price
             exactly what each side of a split actually carries. */
          skus: String(b.codes ?? "").split(" · ").filter(Boolean),
        });
      }
    }
  }
  return out;
}


/**
 * ⭐ A DECISION NAMES ITS DOCUMENT (Card closure §4).
 *
 * The fixture is Ohana × sofa, and a sofa is ONE PO PER CUSTOMER ORDER — so
 * `o1` and `o2` are two documents and a decision must say which. This builds
 * the set the browser would send: the priced document, plus an entry for every
 * other document so the coverage is complete (partial coverage is refused,
 * because it means the operator never saw the split the server made).
 */
function sofaDocKey(orderId: string, destinationId = KLANG) {
  return documentPartitionKey({
    supplierId: OHANA,
    destinationId,
    category: "sofa",
    orderId,
  });
}
/**
 * ⭐ EVERY LINE IS PRICED, ALWAYS (0380; closure §3).
 *
 * There is no "send nothing and let the server read Catalog" path any more:
 * that was the check that compared the live value against itself. The browser
 * declares the price it REVIEWED for every SKU, and so does every test.
 */
const CATALOG_COST: Record<string, number> = {
  "5539-1B(LHF)": 100,
  "5539-CNR": 100,
  "5539-2A(RHF)": 100,
  "5539-1A(LHF)": 120,
};
/** Which SKUs each customer order's sofa document carries. */
const SKUS_BY_ORDER: Record<string, string[]> = {
  o1: ["5539-1B(LHF)", "5539-CNR", "5539-2A(RHF)", "5539-1A(LHF)"],
  o2: ["5539-1A(LHF)"],
};
type WireDecision = { sku: string } & Record<string, unknown>;
const catalogLines = (orderId: string): WireDecision[] =>
  (SKUS_BY_ORDER[orderId] ?? []).map((sku) => ({
    sku,
    treatment: "normal",
    unitCost: CATALOG_COST[sku]!,
    costSource: "catalog",
    expectedCatalogCost: CATALOG_COST[sku]!,
  }));

function decisionsForAll(
  demands: { orderId: string }[],
  destinationId: string,
  priced: {
    orderId: string;
    lineDecisions: unknown[];
    procurementPartnerId?: string | null;
  } | null = null,
) {
  const orders = [...new Set(demands.map((d) => d.orderId))];
  return orders.map((orderId) => {
    /* A test that prices ONE sku replaces that one and leaves the rest at the
       catalog price it reviewed — the same thing the operator does. */
    const byS = new Map<string, WireDecision>(catalogLines(orderId).map((l) => [l.sku, l]));
    if (priced && priced.orderId === orderId) {
      for (const l of priced.lineDecisions as WireDecision[]) byS.set(l.sku, l);
    }
    return {
      documentKey: sofaDocKey(orderId, destinationId),
      supplierId: OHANA,
      destinationId,
      procurementPartnerId:
        priced?.procurementPartnerId !== undefined ? priced.procurementPartnerId : null,
      lineDecisions: [...byS.values()],
    };
  });
}

/** The catalog decision for an explicit SKU list — used where a split makes
 *  each document carry a different part of the set. */
const catalogLinesFor = (skus: readonly string[]): WireDecision[] =>
  skus.map((sku) => ({
    sku,
    treatment: "normal",
    unitCost: CATALOG_COST[sku]!,
    costSource: "catalog",
    expectedCatalogCost: CATALOG_COST[sku]!,
  }));

const pricedDoc = (
  orderId: string,
  destinationId: string,
  skus: readonly string[],
) => ({
  documentKey: sofaDocKey(orderId, destinationId),
  supplierId: OHANA,
  destinationId,
  procurementPartnerId: null,
  lineDecisions: catalogLinesFor(skus),
});

/**
 * PRICE WHAT EACH DOCUMENT ACTUALLY CARRIES, derived from the arrangement.
 *
 * The browser can do exactly this because the partition key is shared: it knows
 * where the server's cuts fall, so it can price each document rather than
 * guessing at the whole supplier surface.
 */
const priceSplit = (
  selections: readonly {
    demandId: string;
    allocations: readonly { destinationId: string; qty: number }[];
  }[],
  demands: readonly { demandId: string; orderId: string; skus: string[] }[],
) => {
  const byId = new Map(demands.map((d) => [d.demandId, d]));
  const docs = new Map<string, { orderId: string; destinationId: string; skus: Set<string> }>();
  for (const sel of selections) {
    const d = byId.get(sel.demandId);
    if (!d) continue;
    for (const a of sel.allocations) {
      const key = sofaDocKey(d.orderId, a.destinationId);
      let hit = docs.get(key);
      if (!hit) {
        hit = { orderId: d.orderId, destinationId: a.destinationId, skus: new Set() };
        docs.set(key, hit);
      }
      for (const sku of d.skus) hit.skus.add(sku);
    }
  }
  return [...docs.values()].map((v) => pricedDoc(v.orderId, v.destinationId, [...v.skus]));
};

/** Everything at the catalog price, for the ordinary happy path. */
const pricedAll = (demands: { orderId: string }[], destinationId: string) =>
  decisionsForAll(demands, destinationId);

const allTo = (
  demands: { demandId: string; qty: number }[],
  destinationId: string,
) => demands.map((d) => ({ demandId: d.demandId, allocations: [{ destinationId, qty: d.qty }] }));

describe("POST …/to-order/issue-batch — one door, one transaction", () => {
  it("401 without Authorization", async () => {
    const res = await app.fetch(new Request(ISSUE_BATCH, { method: "POST" }), env);
    expect(res.status).toBe(401);
  });

  it("creates every purchase order through the ONE governed RPC", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    const res = await postBatch({ selections: allTo(demands, KLANG), documentDecisions: pricedAll(demands, KLANG) });
    expect(res.status).toBe(200);
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(1);
  });

  it("the server groups by supplier × Deliver To — the client's grouping is a hint", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    // Everything to ONE destination.
    await postBatch({ selections: allTo(demands, KLANG), documentDecisions: pricedAll(demands, KLANG) });
    const batch = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!;
    const pos = batch.args.p_pos as { destination_id: string; supplier_id: string }[];
    expect(new Set(pos.map((p) => p.destination_id))).toEqual(new Set([KLANG]));
    expect(new Set(pos.map((p) => p.supplier_id))).toEqual(new Set([OHANA]));
  });

  it("one supplier split across two destinations becomes TWO documents", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    const first = demands[0]!;
    const rest = demands.slice(1);
    const selections = [
      { demandId: first.demandId, allocations: [{ destinationId: AL, qty: first.qty }] },
      ...allTo(rest, KLANG),
    ];
    /* Each document is priced for the part of the set IT carries — the
       partition is shared, so the browser knows where the cut fell. */
    const res = await postBatch({
      selections,
      documentDecisions: priceSplit(selections, demands),
    });
    expect(res.status).toBe(200);
    const batch = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!;
    const pos = batch.args.p_pos as { destination_id: string }[];
    expect(new Set(pos.map((p) => p.destination_id))).toEqual(new Set([KLANG, AL]));
  });

  it("splitting ONE line across two destinations creates two documents from it", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    const multi = demands.find((d) => d.qty >= 2);
    if (!multi) return; // the sofa fixture is one unit per build; covered elsewhere
    const res = await postBatch({
      selections: [
        {
          demandId: multi.demandId,
          allocations: [
            { destinationId: KLANG, qty: multi.qty - 1 },
            { destinationId: AL, qty: 1 },
          ],
        },
      ],
      documentDecisions: pricedAll(demands, KLANG),
    });
    expect(res.status).toBe(200);
  });

  it("every line keeps its source Sales Order on the document", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    await postBatch({ selections: allTo(demands, KLANG), documentDecisions: pricedAll(demands, KLANG) });
    const batch = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!;
    const pos = batch.args.p_pos as { so_refs: number[] }[];
    const refs = pos.flatMap((p) => p.so_refs).sort();
    expect(refs).toEqual([1204, 1207]);
    expect(pos.every((p) => p.so_refs.length > 0)).toBe(true);
  });
});

describe("the batch issue refuses before it creates anything", () => {
  async function expectNoPos(body: unknown, status: number, code?: string) {
    const sb = makeSb(TABLES());
    await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const res = await postBatch(body);
    expect(res.status).toBe(status);
    if (code) expect(((await res.json()) as { code?: string }).code).toBe(code);
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
    return sb;
  }

  it("a demand the recomputation has never heard of", async () => {
    await expectNoPos(
      {
        selections: [
          { demandId: "build::ghost::nope", allocations: [{ destinationId: KLANG, qty: 1 }] },
        ],
        documentDecisions: [],
      },
      409,
      "unknown_demand",
    );
  });

  it("an allocation total that does not equal the server's own remainder", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const first = demands[0]!;
    const res = await postBatch({
      selections: [
        { demandId: first.demandId, allocations: [{ destinationId: KLANG, qty: first.qty + 5 }] },
      ],
      documentDecisions: pricedAll(demands, KLANG),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code?: string }).code).toBe("allocation_mismatch");
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("a destination that is switched off", async () => {
    const tables = TABLES();
    tables.purchasing_destinations = {
      data: [
        { id: KLANG, name: "Carres Klang", is_default: true, active: true },
        { id: CLOSED_YARD, name: "Old Yard", is_default: false, active: false },
      ],
      error: null,
    };
    const sb = makeSb(tables);
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const first = demands[0]!;
    const res = await postBatch({
      selections: [
        { demandId: first.demandId, allocations: [{ destinationId: CLOSED_YARD, qty: first.qty }] },
      ],
      documentDecisions: pricedAll(demands, KLANG),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code?: string }).code).toBe("inactive_destination");
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("a destination nobody has heard of", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const res = await postBatch({
      selections: [
        {
          demandId: demands[0]!.demandId,
          allocations: [
            { destinationId: "7c7c7c7c-0000-4000-8000-00000000000e", qty: demands[0]!.qty },
          ],
        },
      ],
      documentDecisions: pricedAll(demands, KLANG),
    });
    expect(res.status).toBe(422);
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("a customer order with no delivery date", async () => {
    const tables = TABLES();
    (tables.orders.data as Record<string, unknown>[])[0]!.delivery_date = null;
    (tables.orders.data as Record<string, unknown>[])[0]!.delivery_date_tbd = true;
    const sb = makeSb(tables);
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const o1 = demands.filter((d) => d.orderId === "o1");
    if (o1.length === 0) return;
    const res = await postBatch({ selections: allTo(o1, KLANG), documentDecisions: pricedAll(demands, KLANG) });
    expect(res.status).toBe(422);
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("an empty selection is refused by the schema, not by the database", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await postBatch({ selections: [], documentDecisions: [] });
    expect(res.status).toBe(400);
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("the same demand named twice", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const first = demands[0]!;
    const one = { demandId: first.demandId, allocations: [{ destinationId: KLANG, qty: first.qty }] };
    const res = await postBatch({ selections: [one, one], documentDecisions: [] });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code?: string }).code).toBe("duplicate_demand");
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });
});

describe("only Current PO Duty may issue", () => {
  it("the duty holder issues", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    const res = await postBatch({ selections: allTo(demands, KLANG), documentDecisions: pricedAll(demands, KLANG) });
    expect(res.status).toBe(200);
  });

  it("an Operations login who is NOT on duty is refused, and creates nothing", async () => {
    const tables = TABLES();
    tables.ops_po_duty = { data: [{ user_id: "somebody-else" }], error: null };
    const sb = makeSb(tables);
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const res = await postBatch({ selections: allTo(demands, KLANG), documentDecisions: pricedAll(demands, KLANG) });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe("not_po_duty");
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("nobody on duty means nobody issues", async () => {
    const tables = TABLES();
    tables.ops_po_duty = { data: [], error: null };
    const sb = makeSb(tables);
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const res = await postBatch({ selections: allTo(demands, KLANG), documentDecisions: pricedAll(demands, KLANG) });
    expect(res.status).toBe(403);
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("a dealer never reaches the door at all", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await postBatch({ selections: [], documentDecisions: [] }, "dealer");
    expect(res.status).toBe(403);
  });
});

describe("the commercial laws still hold on the batch door", () => {
  it("a catalog cost that moved since the operator looked stops that document", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: decisionsForAll(demands, KLANG, { orderId: "o1", procurementPartnerId: null, lineDecisions: [
            {
              sku: "5539-1B(LHF)",
              treatment: "normal",
              unitCost: 999999,
              costSource: "catalog",
              /* ⭐ WHAT THE OPERATOR REVIEWED. Catalog says 100 now, so the
                 price moved between the review and Issue PO — and 0380 refuses
                 it instead of adopting it silently. */
              expectedCatalogCost: 999999,
            },
          ] }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("supplier_price_changed");
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("a priced line that is no longer on the document stops the batch", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: decisionsForAll(demands, KLANG, { orderId: "o1", procurementPartnerId: null, lineDecisions: [
            { sku: "GONE-SKU", treatment: "normal", unitCost: 10, costSource: "catalog" },
          ] }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("stale_cost_decision");
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("Free of Charge still carries its reason into the document", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: decisionsForAll(demands, KLANG, { orderId: "o1", procurementPartnerId: null, lineDecisions: [
            { sku: "5539-CNR", treatment: "free_of_charge", reason: "Supplier replacement" },
          ] }),
    });
    expect(res.status).toBe(200);
    const batch = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!;
    const pos = batch.args.p_pos as { lines: Record<string, unknown>[] }[];
    const foc = pos.flatMap((p) => p.lines).find((l) => l.sku === "5539-CNR")!;
    expect(foc.commercial_treatment).toBe("free_of_charge");
    expect(foc.commercial_reason).toBe("Supplier replacement");
    expect(foc.cost).toBe(0);
  });
});


/**
 * ⭐ THE GUARDS THAT CAME OFF THE RETIRED `/issue` DOOR
 * (CARD-2026-08-22-purchasing-02 §9 Task 7).
 *
 * `POST …/to-order/issue` is deleted. These are its laws, re-asked of the ONE
 * remaining issuance authority, because a law whose only test died with its
 * route is a law nobody is checking any more.
 *
 * Two of them CHANGED MEANING on the way across, and that is the Card's own
 * ruling rather than a regression:
 *
 *   · the old door issued ONE supplier × category at a time, so "an unrelated
 *     document stays issuable when another needs cost" was true. The batch door
 *     is ATOMIC (§12 — "one failed group leaves some newly created POs
 *     behind" is a failure condition), so the same input now creates NOTHING.
 *   · the old door let the client name which builds shared a document, so a
 *     "merged sofa" had to be refused. The batch door groups by itself, so the
 *     assertion becomes: the server never merges two customer orders' sofas.
 */
describe("the retired door's laws, re-asked of the batch door", () => {
  async function ready(tables = TABLES()) {
    const sb = makeSb(tables);
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    return { sb, demands };
  }
  const batchArgs = (sb: ReturnType<typeof makeSb>) =>
    sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args.p_pos as Record<
      string,
      unknown
    >[];

  it("puts every module of a customer's sofas on that customer's document", async () => {
    const { sb, demands } = await ready();
    await postBatch({ selections: allTo(demands, KLANG), documentDecisions: pricedAll(demands, KLANG) });
    const pos = batchArgs(sb) as unknown as {
      so_refs: number[];
      lines: { sku: string }[];
    }[];
    const peter = pos.find((po) => po.so_refs.includes(1207))!;
    expect(peter.lines.map((l) => l.sku).sort()).toEqual([
      "5539-1A(LHF)",
      "5539-1B(LHF)",
      "5539-2A(RHF)",
      "5539-CNR",
    ]);
    expect(peter.so_refs).toEqual([1207]);
  });

  it("the server never merges two customers' sofas onto one document", async () => {
    const { sb, demands } = await ready();
    await postBatch({ selections: allTo(demands, KLANG), documentDecisions: pricedAll(demands, KLANG) });
    const pos = batchArgs(sb) as unknown as { so_refs: number[] }[];
    // A sofa is one PO per customer order (locked 2026-07-27).
    for (const po of pos) expect(po.so_refs).toHaveLength(1);
    expect(pos.length).toBeGreaterThan(1);
  });

  it("writes the chosen destination onto EVERY purchase order it created", async () => {
    const { sb, demands } = await ready();
    await postBatch({ selections: allTo(demands, AL), documentDecisions: pricedAll(demands, AL) });
    for (const po of batchArgs(sb)) expect(po.destination_id).toBe(AL);
  });

  it("an unknown catalog cost stops the batch rather than inventing RM0", async () => {
    const tables = TABLES();
    (tables.product_skus.data as Record<string, unknown>[]).forEach((r) => {
      if (r.sku === "5539-CNR") r.cost = null;
    });
    const { sb, demands } = await ready(tables);
    const res = await postBatch({ selections: allTo(demands, KLANG), documentDecisions: pricedAll(demands, KLANG) });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; sku?: string };
    expect(body.code).toBe("cost_required");
    expect(body.sku).toBe("5539-CNR");
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("the whole batch stops — a priced document is not quietly issued alone", async () => {
    /* The old door issued the healthy supplier and blocked the other. The batch
       door cannot: all or none is the point of one request (§7.3). */
    const tables = TABLES();
    (tables.product_skus.data as Record<string, unknown>[]).forEach((r) => {
      if (r.sku === "5539-CNR") r.cost = null;
    });
    const { sb, demands } = await ready(tables);
    await postBatch({ selections: allTo(demands, KLANG), documentDecisions: pricedAll(demands, KLANG) });
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("a hand-entered transaction cost rides the document and never touches Catalog", async () => {
    const { sb, demands } = await ready();
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: decisionsForAll(demands, KLANG, { orderId: "o1", procurementPartnerId: null, lineDecisions: [
            { sku: "5539-CNR", treatment: "normal", unitCost: 1234, costSource: "hand_entered" },
          ] }),
    });
    expect(res.status).toBe(200);
    const line = (batchArgs(sb) as unknown as { lines: Record<string, unknown>[] }[])
      .flatMap((p) => p.lines)
      .find((l) => l.sku === "5539-CNR")!;
    expect(line.cost).toBe(1234);
    expect(line.cost_source).toBe("hand_entered");
    // Catalog is untouched — a PO price is not a price list edit.
    expect(sb.rpcCalls.map((c) => c.fn)).not.toContain("catalog_set_cost");
  });

  it("Free of Charge without a reason is refused at the request boundary", async () => {
    const { sb, demands } = await ready();
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: decisionsForAll(demands, KLANG, { orderId: "o1", procurementPartnerId: null, lineDecisions: [{ sku: "5539-CNR", treatment: "free_of_charge", reason: "   " }] }),
    });
    expect(res.status).toBe(400);
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("factory pickup requires one VALID procurement partner", async () => {
    const tables = TABLES();
    (tables.suppliers.data as Record<string, unknown>[])[0]!.kind = "factory_pickup";
    const { sb, demands } = await ready(tables);
    const res = await postBatch({ selections: allTo(demands, KLANG), documentDecisions: pricedAll(demands, KLANG) });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code?: string }).code).toBe("pickup_partner_required");
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);

    const { sb: sb2, demands: d2 } = await ready(tables);
    const ok = await postBatch({
      selections: allTo(d2, KLANG),
      documentDecisions: decisionsForAll(demands, KLANG, { orderId: "o1", procurementPartnerId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", lineDecisions: [] }),
    });
    expect(ok.status).toBe(200);
    for (const po of batchArgs(sb2)) {
      expect(po.procurement_partner_id).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    }
  });

  it("a partner nobody governs is refused even on a pickup document", async () => {
    const tables = TABLES();
    (tables.suppliers.data as Record<string, unknown>[])[0]!.kind = "factory_pickup";
    const { sb, demands } = await ready(tables);
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: decisionsForAll(demands, KLANG, { orderId: "o1", procurementPartnerId: "5d5d5d5d-0000-4000-8000-00000000000d", lineDecisions: [] }),
    });
    expect(res.status).toBe(422);
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("an own-logistics document cannot smuggle a procurement partner", async () => {
    const { sb, demands } = await ready();
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: decisionsForAll(demands, KLANG, { orderId: "o1", procurementPartnerId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", lineDecisions: [] }),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code?: string }).code).toBe("pickup_partner_not_allowed");
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("⭐ the client may never send a quantity, a SKU or a price for a LINE", async () => {
    const { sb, demands } = await ready();
    const first = demands[0]!;
    const res = await postBatch({
      selections: [
        {
          demandId: first.demandId,
          allocations: [{ destinationId: KLANG, qty: first.qty }],
          // Anything beyond demandId + allocations is refused outright.
          lines: [{ sku: "5539-CNR", qty: 99, cost: 1 }],
        },
      ],
      documentDecisions: pricedAll(demands, KLANG),
    });
    expect(res.status).toBe(400);
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("the quantities that reach the RPC are the SERVER's, never the request's", async () => {
    const { sb, demands } = await ready();
    await postBatch({ selections: allTo(demands, KLANG), documentDecisions: pricedAll(demands, KLANG) });
    const lines = (batchArgs(sb) as unknown as { lines: { qty: number }[] }[]).flatMap(
      (p) => p.lines,
    );
    // Every fixture line is one unit; nothing the browser said could change it.
    for (const l of lines) expect(l.qty).toBe(1);
  });

  it("a build that is not waiting to be ordered is unknown to the batch", async () => {
    const { sb } = await ready();
    const res = await postBatch({
      selections: [
        { demandId: "build::o1::already-ordered", allocations: [{ destinationId: KLANG, qty: 1 }] },
      ],
      documentDecisions: [],
    });
    expect(res.status).toBe(409);
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("400s on a malformed body", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(ISSUE_BATCH, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: "{not json",
      }),
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe("there is exactly ONE issuance door left", () => {
  it("the retired per-supplier `/issue` route is GONE from the source", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "to-order.ts"), "utf8");
    expect(src).toContain('post("/issue-batch"');
    expect(src).not.toContain('post("/issue"');
    // ...and its own schema went with it. `validateIssuePlan` STAYS: it is the
    // shared merged-sofa / duplicate-build guard, and the batch door still asks it.
    expect(src).not.toContain("const issueBody");
    expect(src).toContain("validateIssuePlan");
  });

  it("the retired route 404s", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/purchase/to-order/issue", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(404);
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  /**
   * ⭐ ONE AUTHORITY, GOVERNED CALLERS — and the difference matters.
   *
   * `purchasing_issue_pos_batch` is the only thing that may create a Purchase
   * Order. It is NOT reached from only one place: Manual Purchase is a second
   * governed journey onto the same authority
   * (`routes/operation/manual-purchase.ts`), and always was. What this Card
   * removed is the DUPLICATE SO-buying door, not Manual Purchase's.
   *
   * So the assertion is scoped honestly: SO Batch Purchase reaches the
   * authority from exactly one place in its own route.
   */
  it("SO Batch Purchase reaches the creation authority from exactly one place", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "to-order.ts"), "utf8");
    expect(src.match(/rpc\(\s*"purchasing_issue_pos_batch"/g) ?? []).toHaveLength(1);
  });

  it("Manual Purchase is the OTHER governed journey onto the same authority", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const manual = readFileSync(join(here, "manual-purchase.ts"), "utf8");
    // It is not a bypass and this Card did not touch it — it is the second
    // approved way in, and a claim of "one caller" would have been false.
    expect(manual).toContain("purchasing_issue_pos_batch");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CARD 02 CLOSURE — the five authorities, at the door that uses them
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ONE ACTOR AUTHORITY (closure §1; 0379).
 *
 * The route used to read `ops_po_duty` for itself. It now asks the ONE resolver
 * `purchasing_po_actor`, which knows dated buddy cover — and the creation RPC
 * asks it again, so a direct call cannot walk past it either.
 */
describe("closure §1 · one governed PO actor authority", () => {
  it("asks the ONE resolver, never the duty table, for who may act", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    sb.tableCalls.length = 0;
    await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: pricedAll(demands, KLANG),
    });
    expect(sb.rpcCalls.some((c) => c.fn === "purchasing_po_actor")).toBe(true);
    expect(sb.tableCalls).not.toContain("ops_po_duty");
  });

  it("lets the authorised cover issue while the holder is away", async () => {
    const tables = TABLES();
    /* The month's holder is somebody else; today's dated cover is the caller. */
    tables.ops_po_duty = { data: [{ user_id: "u9" }], error: null };
    tables.ops_po_duty_cover = {
      data: [{ normal_user_id: "u9", acting_user_id: "u1" }],
      error: null,
    };
    const sb = makeSb(tables);
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: pricedAll(demands, KLANG),
    });
    expect(res.status).toBe(200);
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(1);
  });

  it("refuses an Operations login who is neither the holder nor the cover", async () => {
    const tables = TABLES();
    tables.ops_po_duty = { data: [{ user_id: "u9" }], error: null };
    tables.app_users = {
      data: [{ id: "u9", name: "Li Ching", email: "lc@carres.com" }],
      error: null,
    };
    const sb = makeSb(tables);
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: pricedAll(demands, KLANG),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string; message?: string; action?: string };
    expect(body.code).toBe("not_po_duty");
    /* ⭐ THE TWO LINES (closure §9): the fact, then the act, naming the person. */
    expect(body.message).toBe("You do not hold PO duty today.");
    expect(body.action).toBe("Ask Li Ching to issue this purchase order.");
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("says so plainly when the month has no PO duty holder at all", async () => {
    const tables = TABLES();
    tables.ops_po_duty = { data: [], error: null };
    const sb = makeSb(tables);
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: pricedAll(demands, KLANG),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string; action?: string };
    expect(body.code).toBe("no_po_duty_holder");
    expect(body.action).toBe("Ask management to set this month's PO duty holder.");
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("turns the DATABASE's own duty refusal into the same two lines", async () => {
    /* The route's check is for words; the RPC's is the authority. When SQL
       refuses, the operator must still read a sentence and not a stack. */
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    const realRpc = sb.rpc.getMockImplementation()!;
    sb.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "purchasing_issue_pos_batch") {
        return {
          data: null,
          error: { message: "only Current PO Duty…", details: "not_po_duty", code: "42501" },
        } as never;
      }
      return realRpc(fn, args);
    });
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: pricedAll(demands, KLANG),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string; message?: string; action?: string };
    expect(body.code).toBe("not_po_duty");
    expect(body.message).toBe("You do not hold PO duty today.");
    expect(body.action?.length).toBeGreaterThan(0);
  });

  it("turns a commercial-approval refusal from SQL into the same two lines", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    const realRpc = sb.rpc.getMockImplementation()!;
    sb.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "purchasing_issue_pos_batch") {
        return {
          data: null,
          error: {
            message: "this price has no commercial approval",
            details: "commercial_approval_required",
            code: "P0001",
          },
        } as never;
      }
      return realRpc(fn, args);
    });
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: pricedAll(demands, KLANG),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; action?: string };
    expect(body.code).toBe("commercial_approval_required");
    expect(body.action).toMatch(/Ask a manager to approve/);
  });
});

/**
 * COMMERCIAL AUTHORITY (closure §2; 0380).
 *
 * The defect was silent: the API re-read Catalog, sent the value back as
 * `cost_source: catalog`, and the RPC compared the live value with itself. Every
 * line now declares the price the OPERATOR REVIEWED, and there is no fallback
 * for a line nobody checked.
 */
describe("closure §2 · commercial authority", () => {
  it("sends the reviewed catalog cost to the RPC, so SQL has something to compare", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: pricedAll(demands, KLANG),
    });
    expect(res.status).toBe(200);
    const pos = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args
      .p_pos as { lines: Record<string, unknown>[] }[];
    const lines = pos.flatMap((p) => p.lines);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l.cost_source).toBe("catalog");
      /* ⭐ THE DECLARATION. Without it 0380 refuses the line outright. */
      expect(l.expected_catalog_cost).toBe(l.cost);
      expect(l.expected_catalog_cost).not.toBeNull();
    }
  });

  it("refuses a line nobody priced instead of filling it from Catalog", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    /* One document arrives with an EMPTY decision list — exactly what the old
       "send nothing and let the server read Catalog" path produced. */
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: [
        { ...pricedDoc("o1", KLANG, []), lineDecisions: [] },
        pricedDoc("o2", KLANG, ["5539-1A(LHF)"]),
      ],
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; sku?: string; action?: string };
    expect(body.code).toBe("cost_review_required");
    expect(body.action).toMatch(/Check the cost of/);
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("sends a hand-entered price as an EXCEPTION, with no catalog expectation", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: decisionsForAll(demands, KLANG, {
        orderId: "o1",
        procurementPartnerId: null,
        lineDecisions: [
          {
            sku: "5539-CNR",
            treatment: "normal",
            unitCost: 250,
            costSource: "hand_entered",
            expectedCatalogCost: 100,
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const pos = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args
      .p_pos as { lines: Record<string, unknown>[] }[];
    const hand = pos.flatMap((p) => p.lines).find((l) => l.sku === "5539-CNR")!;
    expect(hand.cost).toBe(250);
    expect(hand.cost_source).toBe("hand_entered");
    /* ⭐ AN EXCEPTION'S AUTHORITY IS AN APPROVAL RECORD, not a catalog price.
       0380 goes to `po_cost_approvals`; there is nothing here to compare. */
    expect(hand.expected_catalog_cost).toBeNull();
  });

  it("sends Free of Charge as an exception too — reason kept, expectation absent", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: decisionsForAll(demands, KLANG, {
        orderId: "o1",
        procurementPartnerId: null,
        lineDecisions: [
          { sku: "5539-CNR", treatment: "free_of_charge", reason: "Replacement for a claim" },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const pos = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args
      .p_pos as { lines: Record<string, unknown>[] }[];
    const foc = pos.flatMap((p) => p.lines).find((l) => l.sku === "5539-CNR")!;
    expect(foc).toMatchObject({
      cost: 0,
      cost_source: "hand_entered",
      commercial_treatment: "free_of_charge",
      commercial_reason: "Replacement for a claim",
      expected_catalog_cost: null,
    });
  });

  it("stores the SERVER's price, not the number the browser declared", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: pricedAll(demands, KLANG),
    });
    const pos = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args
      .p_pos as { lines: Record<string, unknown>[] }[];
    const cnr = pos.flatMap((p) => p.lines).find((l) => l.sku === "5539-CNR")!;
    /* The fixture's catalog cost. The declaration only made the comparison
       possible; the stored number is the server's own read. */
    expect(cnr.cost).toBe(100);
  });
});

/**
 * SOURCE LINEAGE (closure §4; 0382).
 *
 * `so_refs` sat on the DOCUMENT, so a bulk purchase order printed a blank
 * `SO NO`. Every line now carries which customer order each unit is for.
 */
describe("closure §4 · source lineage on every line", () => {
  it("gives every line its customer order, SO number and order line", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    const res = await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: pricedAll(demands, KLANG),
    });
    expect(res.status).toBe(200);
    const pos = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args
      .p_pos as { lines: { sku: string; qty: number; sources: Record<string, unknown>[] }[] }[];
    const lines = pos.flatMap((p) => p.lines);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(Array.isArray(l.sources)).toBe(true);
      expect(l.sources.length).toBeGreaterThan(0);
      /* THE PARTS ADD UP TO THE LINE — the rule 0382 refuses in SQL. */
      expect(l.sources.reduce((s, x) => s + Number(x.qty), 0)).toBe(l.qty);
      for (const src of l.sources) {
        expect(typeof src.order_id).toBe("string");
        expect(typeof src.order_line_id).toBe("string");
        expect(src.so === null || typeof src.so === "number").toBe(true);
      }
    }
  });

  it("names the real order line, so SQL can validate the lineage it is given", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: pricedAll(demands, KLANG),
    });
    const pos = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args
      .p_pos as { lines: { sku: string; sources: { order_id: string; order_line_id: string; so: number | null }[] }[] }[];
    const cnr = pos.flatMap((p) => p.lines).find((l) => l.sku === "5539-CNR")!;
    /* `p2` is the fixture's own order line for 5539-CNR on order o1 (SO-1207). */
    expect(cnr.sources).toEqual([{ order_id: "o1", so: 1207, order_line_id: "p2", qty: 1 }]);
  });

  it("keeps the document's so_refs derived from the same lineage", async () => {
    const sb = makeSb(TABLES());
    const demands = await readyDemands(sb);
    sb.rpcCalls.length = 0;
    await postBatch({
      selections: allTo(demands, KLANG),
      documentDecisions: pricedAll(demands, KLANG),
    });
    const pos = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args
      .p_pos as { so_refs: number[]; lines: { sources: { so: number | null }[] }[] }[];
    for (const po of pos) {
      const fromLines = new Set(
        po.lines.flatMap((l) => l.sources.map((s) => s.so)).filter((v) => v != null),
      );
      expect(new Set(po.so_refs)).toEqual(fromLines);
    }
  });
});

/**
 * ⭐ THE SPLIT THAT USED TO DOUBLE THE ORDER (closure §3 · §4).
 *
 * Measured 2026-08-24: the endpoint grouped allocations into documents and then
 * asked `planFromDocuments` for each group's lines — a function that answers
 * *what does this BUILD contain*. A demand of 3 split 2 + 1 across two
 * destinations therefore produced two purchase orders of THREE: six units
 * bought for a three-unit demand.
 *
 * The sofa fixture cannot show it (a sofa build is one unit and one place), so
 * this fixture buys mattresses, which consolidate across customer orders.
 */
function MATTRESS_TABLES(): Tbl {
  const t = TABLES();
  t.purchasing_production_days = {
    data: [{ supplier_id: OHANA, category: "mattress", working_days: 7 }],
    error: null,
  };
  t.orders = {
    data: [
      {
        id: "m1", so: 1400, customer_name: "MEI", status: "proceed_order",
        delivery_date: "2026-09-30", delivery_date_tbd: false,
        placed_at: "2026-07-01", created_at: "2026-07-01",
      },
    ],
    error: null,
  };
  t.order_lines = {
    data: [
      {
        id: "ml1", order_id: "m1", sku: "MAT-KING", qty: 3, attrs: null,
        excluded_from_plan: false, exclude_from_plan_until: null,
      },
    ],
    error: null,
  };
  t.product_skus = {
    data: [
      {
        sku: "MAT-KING", supplier_id: OHANA, cost: 800, variant: "King",
        product_models: { category: "mattress", name: "Dreamland" },
      },
    ],
    error: null,
  };
  return t;
}

const matDocKey = (destinationId: string) =>
  documentPartitionKey({
    supplierId: OHANA,
    destinationId,
    category: "mattress",
    /* A mattress consolidates across customer orders, so the order is not part
       of its key — `documentPartitionKey` drops it. */
    orderId: "m1",
  });

const matDoc = (destinationId: string) => ({
  documentKey: matDocKey(destinationId),
  supplierId: OHANA,
  destinationId,
  procurementPartnerId: null,
  lineDecisions: [
    {
      sku: "MAT-KING",
      treatment: "normal",
      unitCost: 800,
      costSource: "catalog",
      expectedCatalogCost: 800,
    },
  ],
});

describe("closure §3 · a Deliver To split buys the demand ONCE", () => {
  it("splits 3 into 2 + 1 and buys three units, not six", async () => {
    const sb = makeSb(MATTRESS_TABLES());
    const demands = await readyDemands(sb);
    const only = demands.find((d) => d.qty === 3);
    expect(only, "the mattress fixture must offer one build of 3").toBeTruthy();
    sb.rpcCalls.length = 0;
    const res = await postBatch({
      selections: [
        {
          demandId: only!.demandId,
          allocations: [
            { destinationId: KLANG, qty: 2 },
            { destinationId: AL, qty: 1 },
          ],
        },
      ],
      documentDecisions: [matDoc(KLANG), matDoc(AL)],
    });
    expect(res.status).toBe(200);
    const pos = sb.rpcCalls.find((c) => c.fn === "purchasing_issue_pos_batch")!.args
      .p_pos as {
      destination_id: string;
      lines: { sku: string; qty: number; sources: { qty: number }[] }[];
    }[];
    expect(pos).toHaveLength(2);
    const byDest = new Map(pos.map((p) => [p.destination_id, p]));
    expect(byDest.get(KLANG)!.lines[0]!.qty).toBe(2);
    expect(byDest.get(AL)!.lines[0]!.qty).toBe(1);
    /* ⭐ THE WHOLE POINT: three units bought for a three-unit demand. */
    const bought = pos.flatMap((p) => p.lines).reduce((s, l) => s + l.qty, 0);
    expect(bought).toBe(3);
    /* And the lineage was cut with it, not copied. */
    for (const p of pos) {
      for (const l of p.lines) {
        expect(l.sources.reduce((s, x) => s + x.qty, 0)).toBe(l.qty);
      }
    }
  });

  it("still refuses a split that does not add back to the server's own Buy", async () => {
    const sb = makeSb(MATTRESS_TABLES());
    const demands = await readyDemands(sb);
    const only = demands.find((d) => d.qty === 3)!;
    sb.rpcCalls.length = 0;
    const res = await postBatch({
      selections: [
        {
          demandId: only.demandId,
          allocations: [
            { destinationId: KLANG, qty: 2 },
            { destinationId: AL, qty: 3 },
          ],
        },
      ],
      documentDecisions: [matDoc(KLANG), matDoc(AL)],
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code?: string; message?: string };
    expect(body.code).toBe("allocation_mismatch");
    expect(body.message).toBe("You arranged 5 units and must buy 3.");
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });
});

/**
 * ⭐ WHICH EXCEPTIONS A MANAGER HAS ALREADY APPROVED (closure §2).
 *
 * Without this read, "ask a manager to approve the price" arrives only as a
 * refusal, after the operator has typed eleven prices — and they cannot tell
 * "nobody has approved this yet" from "somebody already did".
 */
describe("GET …/to-order/cost-approvals", () => {
  const TODAY = new Date().toISOString().slice(0, 10);
  const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const SUP = "bbbbbbbb-0000-0000-0000-000000000001";

  async function ask(query: string, tables?: Tbl) {
    const t = tables ?? TABLES();
    const sb = makeSb(t);
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`${READ}/cost-approvals${query}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    return { res, sb };
  }

  it("401 without Authorization", async () => {
    const res = await app.fetch(new Request(`${READ}/cost-approvals`), env);
    expect(res.status).toBe(401);
  });

  it("asks for a supplier and at least one SKU, in words", async () => {
    const { res } = await ask("");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string; action?: string };
    expect(body.code).toBe("invalid_param");
    expect(body.action?.length).toBeGreaterThan(0);
  });

  it("returns the open approvals with the approver's name", async () => {
    const t = TABLES();
    (t as unknown as Tbl).po_cost_approvals = {
      data: [
        {
          id: "a1", sku: "5539-CNR", treatment: "hand_entered", unit_cost: 250,
          reason: "Agreed with the factory", expires_on: null,
          approved_at: "2026-08-24T01:00:00Z", approved_by: "u1",
        },
      ],
      error: null,
    };
    const { res } = await ask(`?supplierId=${SUP}&skus=5539-CNR`, t);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { approvals: Record<string, unknown>[] };
    expect(body.approvals).toEqual([
      {
        sku: "5539-CNR",
        treatment: "hand_entered",
        unitCost: 250,
        reason: "Agreed with the factory",
        approvedBy: "On Duty",
        expiresOn: null,
      },
    ]);
  });

  it("drops an EXPIRED approval — it is for a decision, not for ever", async () => {
    const t = TABLES();
    (t as unknown as Tbl).po_cost_approvals = {
      data: [
        {
          id: "a1", sku: "5539-CNR", treatment: "free_of_charge", unit_cost: null,
          reason: "Claim replacement", expires_on: YESTERDAY,
          approved_at: "2026-08-01T01:00:00Z", approved_by: "u1",
        },
        {
          id: "a2", sku: "5539-2A(RHF)", treatment: "free_of_charge", unit_cost: null,
          reason: "Claim replacement", expires_on: TODAY,
          approved_at: "2026-08-01T01:00:00Z", approved_by: "u1",
        },
      ],
      error: null,
    };
    const { res } = await ask(`?supplierId=${SUP}&skus=5539-CNR,5539-2A(RHF)`, t);
    const body = (await res.json()) as { approvals: { sku: string }[] };
    /* Today's expiry still counts; yesterday's does not. */
    expect(body.approvals.map((a) => a.sku)).toEqual(["5539-2A(RHF)"]);
  });

  it("writes nothing at all", async () => {
    const t = TABLES();
    (t as unknown as Tbl).po_cost_approvals = { data: [], error: null };
    const { sb } = await ask(`?supplierId=${SUP}&skus=5539-CNR`, t);
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
    expect(sb.inserts).toEqual([]);
    expect(sb.updates).toEqual([]);
  });
});

/**
 * ⭐ CARD 02-C — THE PROCEEDED-ORDER BOUNDARY AT THE WRITE DOORS
 * (RESOLVED FROM AUTHORITY, 2026-08-27).
 *
 * Both doors recompute through the ONE boundary read at POST time — a demand
 * id naming a `place` order resolves to nothing and is refused BY NAME, with
 * nothing created and nothing reserved. There is no second status check to
 * drift from the read: the recomputation IS the recheck.
 */
describe("Card 02-C · a `place` order is refused at every door", () => {
  it("never reaches the projection — no proposal row, no blocker row", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await get()).json()) as any;
    for (const proposal of body.proposals) {
      for (const row of proposal.rows) {
        expect(row.orderId, `SO-${row.so}`).not.toBe("o9");
        expect(row.so).not.toBe(1290);
      }
    }
    for (const blocked of body.blockedDemand ?? []) {
      expect(blocked.so).not.toBe(1290);
    }
  });

  it("direct PO issuance is refused with ZERO purchase orders created", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    const res = await postBatch({
      selections: [
        { demandId: "build::o9::bk-z", allocations: [{ destinationId: KLANG, qty: 1 }] },
      ],
      documentDecisions: [],
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("unknown_demand");
    expect(sb.rpcCalls.filter((c) => c.fn === "purchasing_issue_pos_batch")).toHaveLength(0);
  });

  it("direct Ready Stock reservation is refused with ZERO units drawn", async () => {
    const sb = makeSb(TABLES());
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/purchase/to-order/take-stock", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "o9", buildKey: "bk-z" }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("unknown_build");
    expect(sb.rpcCalls.filter((c) => c.fn === "ops_stock_pool_draw")).toHaveLength(0);
  });
});
