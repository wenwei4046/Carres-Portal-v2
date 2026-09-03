import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect, afterAll, beforeAll, beforeEach, vi } from "vitest";
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

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import {
  addWorkingDays,
  myHolidaySet,
  type SoBatchPurchaseResponse,
} from "@carres/shared";
import { userClient } from "../../lib/supabase";

/**
 * PURCHASE DEMANDS — the Register that EXPLAINS
 * (CARD-2026-08-20-purchase-demands).
 *
 * SO Batch Purchase may drop a line it cannot buy: it has no document to make.
 * This page may not — its whole job is *why can this not be bought* — so these
 * tests are mostly about the rows that were never on a screen before: a sold
 * SKU the catalog has never heard of, a real product nobody mapped a supplier
 * to, a pair with no production days, and a requirement an open purchase order
 * already covers.
 *
 * The fixture is one live day: four customer orders, seven catalog SKUs, two
 * open purchase orders and one deliberately excluded line.
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

/**
 * THE CLOCK IS FROZEN (Card 02-A). The timing states are derived against the
 * real read's `todayIso()`, so the fixture pins the day — a Wednesday with no
 * Malaysian holiday — and composes every delivery date RELATIVE to it with the
 * same calendar engine the server plans on. The classification itself is not
 * computed here (that would test the engine against itself); each delivery is
 * placed a known number of working days from the expected completion, and the
 * test asserts the state that distance must produce.
 */
const TODAY = "2026-09-02";
const HOLIDAYS = myHolidaySet();
/** Nice Future works Mon–Sat. */
const NICE_WEEK = { offDays: [0] as number[], holidays: HOLIDAYS };
/** The governed Office week. */
const OFFICE = { offDays: [0, 6] as number[], holidays: HOLIDAYS };
/** Expected production completion of a Nice Future mattress ordered today. */
const READY = addWorkingDays(TODAY, 7, NICE_WEEK);
const DELIVERY_EARLY = addWorkingDays(READY, 40, OFFICE);
const DELIVERY_FULL = addWorkingDays(READY, 14, OFFICE);
const DELIVERY_LOW = addWorkingDays(READY, 5, OFFICE);
const DELIVERY_NONE = READY;
const DELIVERY_SHORT = addWorkingDays(TODAY, 2, OFFICE);

const NICE = "11111111-1111-1111-1111-111111111111";
const OHANA = "22222222-2222-2222-2222-222222222222";
const WAREHOUSE = "00000000-0000-0000-0000-000000000c03";
const SALES = "aaaaaaaa-0000-0000-0000-00000000000a";
const PO_HOLDER = "bbbbbbbb-0000-0000-0000-00000000000b";
const KLANG_DEST = "dddddddd-0000-4000-8000-00000000000d";
const BULOH_DEST = "eeeeeeee-0000-4000-8000-00000000000e";
const CLOSED_DEST = "ffffffff-0000-4000-8000-00000000000f";

function line(
  id: string,
  orderId: string,
  sku: string,
  qty: number,
  over: Record<string, unknown> = {},
) {
  return {
    id,
    order_id: orderId,
    sku,
    qty,
    attrs: null,
    excluded_from_plan: false,
    exclude_from_plan_until: null,
    ...over,
  };
}

const TABLES = () => ({
  purchasing_settings: {
    data: {
      order_by_buffer_days: 14,
      earliest_sell_days: 21,
      logistics_call_working_days: 1,
      po_days: [1, 3, 5],
    },
    error: null,
  },
  /* Nice Future can be planned; Ohana × mattress has NO production days — the
     one pair the engine must refuse, and only that pair. */
  purchasing_production_days: {
    data: [{ supplier_id: NICE, category: "mattress", working_days: 7 }],
    error: null,
  },
  purchasing_supplier_settings: {
    data: [{ supplier_id: NICE, off_days: [0], transit_days: 1 }],
    error: null,
  },
  purchasing_setting_changes: { data: [], error: null },
  suppliers: {
    data: [
      { id: NICE, name: "Nice Future", kind: "own_logistics" },
      { id: OHANA, name: "Ohana", kind: "own_logistics" },
    ],
    error: null,
  },
  delivery_partners: { data: [], error: null },
  orders: {
    data: [
      {
        id: "o1", so: 1207, customer_name: "PETER", status: "proceed_order",
        delivery_date: DELIVERY_EARLY, delivery_date_tbd: false,
        placed_at: "2026-07-01", created_at: "2026-07-01", proceed_date: null,
        salesperson_id: SALES,
      },
      /* PROCEEDED with no agreed date — the `no_customer_date` story. It was
         a `place` order until Card 02-C drew the proceeded-order boundary; a
         dateless order is a Sales gap, not a not-yet-proceeded one. */
      {
        id: "o2", so: 1204, customer_name: "ella", status: "proceed_order",
        delivery_date: null, delivery_date_tbd: true,
        placed_at: "2026-07-01", created_at: "2026-07-01", proceed_date: null,
        salesperson_id: SALES,
      },
      /* ⭐ Card 02-C — the `place` order. EARLIER than every proceeded order,
         demanding the same SKU an open PO partly covers, so the old behaviour
         (place demand consuming coverage ahead of proceeded demand) would be
         visible the moment it returned. It must contribute NOTHING. */
      {
        id: "o12", so: 1219, customer_name: "NOT YET PROCEEDED", status: "place",
        delivery_date: DELIVERY_EARLY, delivery_date_tbd: false,
        placed_at: "2026-06-01", created_at: "2026-06-01", proceed_date: null,
        salesperson_id: null,
      },
      {
        id: "o13", so: 1220, customer_name: "PROCEEDED ONE", status: "proceed_order",
        delivery_date: DELIVERY_EARLY, delivery_date_tbd: false,
        placed_at: "2026-07-15", created_at: "2026-07-15", proceed_date: null,
        salesperson_id: null,
      },
      {
        id: "o3", so: 1210, customer_name: "ANNE", status: "proceed_order",
        delivery_date: "2026-09-20", delivery_date_tbd: false,
        placed_at: "2026-07-01", created_at: "2026-07-01", proceed_date: null,
        salesperson_id: null,
      },
      {
        id: "o4", so: 1211, customer_name: "BOB", status: "proceed_order",
        delivery_date: DELIVERY_LOW, delivery_date_tbd: false,
        placed_at: "2026-07-01", created_at: "2026-07-01", proceed_date: null,
        salesperson_id: null,
      },
      /* The three remaining timing bands, one order each (Card 02-A §4). */
      {
        id: "o5", so: 1212, customer_name: "MEI", status: "proceed_order",
        delivery_date: DELIVERY_FULL, delivery_date_tbd: false,
        placed_at: "2026-07-01", created_at: "2026-07-01", proceed_date: null,
        salesperson_id: null,
      },
      {
        id: "o6", so: 1213, customer_name: "RAJ", status: "proceed_order",
        delivery_date: DELIVERY_NONE, delivery_date_tbd: false,
        placed_at: "2026-07-01", created_at: "2026-07-01", proceed_date: null,
        salesperson_id: null,
      },
      {
        id: "o7", so: 1214, customer_name: "LIN", status: "proceed_order",
        delivery_date: DELIVERY_SHORT, delivery_date_tbd: false,
        placed_at: "2026-07-01", created_at: "2026-07-01", proceed_date: null,
        salesperson_id: null,
      },
    ],
    error: null,
  },
  order_lines: {
    data: [
      line("l1", "o1", "B1201S-K", 2),
      // Not a catalog product at all — an AutoCount description.
      line("l2", "o1", 'Transport Fees 4"', 1),
      // A POSITIVELY non-procurable category.
      line("l3", "o1", "SVC-1", 1),
      // Deliberately taken out of the plan.
      line("l9", "o1", "B1201S-Q", 5, { excluded_from_plan: true }),
      line("l4", "o2", "B1201S-Q", 1),
      line("l5", "o3", "B9999-K", 1),
      line("l6", "o3", "H1401S-K", 1),
      line("l7", "o4", "COV-K", 3),
      line("l8", "o4", "PART-K", 3),
      line("l10", "o5", "B1201S-Q", 1),
      line("l11", "o6", "B1201S-Q", 1),
      line("l12", "o7", "B1201S-Q", 1),
      /* Card 02-C — one open-PO unit, two claimants; only the proceeded order
         may consume it. */
      line("l17", "o12", "COV2-K", 1),
      line("l18", "o13", "COV2-K", 1),
    ],
    error: null,
  },
  product_skus: {
    data: [
      { sku: "B1201S-K", supplier_id: NICE, cost: 100, variant: "King", variant_kind: "size",
        product_models: { category: "mattress", name: "Booqit" } },
      { sku: "B1201S-Q", supplier_id: NICE, cost: 100, variant: "Queen", variant_kind: "size",
        product_models: { category: "mattress", name: "Booqit" } },
      // A real procurable product nobody has mapped a supplier to.
      { sku: "B9999-K", supplier_id: null, cost: 50, variant: "King", variant_kind: "size",
        product_models: { category: "mattress", name: "Orphan" } },
      { sku: "H1401S-K", supplier_id: OHANA, cost: 100, variant: "King", variant_kind: "size",
        product_models: { category: "mattress", name: "Haven" } },
      { sku: "SVC-1", supplier_id: NICE, cost: 0, variant: null, variant_kind: null,
        product_models: { category: "service", name: "Service Visit" } },
      { sku: "COV-K", supplier_id: NICE, cost: 100, variant: "King", variant_kind: "size",
        product_models: { category: "mattress", name: "Covered" } },
      { sku: "PART-K", supplier_id: NICE, cost: 100, variant: "King", variant_kind: "size",
        product_models: { category: "mattress", name: "Partly" } },
      { sku: "COV2-K", supplier_id: NICE, cost: 100, variant: "King", variant_kind: "size",
        product_models: { category: "mattress", name: "Contested" } },
    ],
    error: null,
  },
  purchase_order_lines: {
    data: [
      { po_id: "PO-2051", sku: "COV-K", qty: 3, received_qty: 0,
        purchase_orders: { status: "open" } },
      { po_id: "PO-2052", sku: "PART-K", qty: 2, received_qty: 0,
        purchase_orders: { status: "open" } },
      { po_id: "PO-2053", sku: "COV2-K", qty: 1, received_qty: 0,
        purchase_orders: { status: "open" } },
    ],
    error: null,
  },
  warehouses: { data: [{ id: WAREHOUSE, name: "Carres Klang", kind: "own" }], error: null },
  ops_stock_items: { data: [], error: null },
  ops_stock_pool_usage: { data: [], error: null },
  ops_po_duty: { data: [{ user_id: PO_HOLDER }], error: null },
  app_users: {
    data: [
      { id: SALES, name: "Siew Hong", email: "sh@carres.com" },
      { id: PO_HOLDER, name: "Yee Jin", email: "yj@carres.com" },
    ],
    error: null,
  },
  purchasing_destinations: {
    data: [
      { id: KLANG_DEST, name: "Carres Klang", is_default: true, active: true },
      { id: BULOH_DEST, name: "AL Sungai Buloh", is_default: false, active: true },
      { id: CLOSED_DEST, name: "Old Yard", is_default: false, active: false },
    ],
    error: null,
  },
  purchase_orders: { data: [], error: null },
});

type Tbl = ReturnType<typeof TABLES>;

/** Records every question asked, and every write attempted. */
function makeSb(tables: Record<string, { data: unknown; error: unknown }>) {
  const CHAIN = [
    "select", "in", "or", "eq", "neq", "gt", "gte", "ilike", "not", "is", "order", "limit",
  ];
  const writes: { table: string; kind: string }[] = [];
  const filters: { table: string; method: string; col: unknown; val: unknown }[] = [];
  const rpcCalls: string[] = [];

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
    for (const w of ["insert", "update", "upsert", "delete"]) {
      b[w] = vi.fn(() => {
        writes.push({ table, kind: w });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wb: any = {};
        for (const m of [...CHAIN, "maybeSingle", "single"]) wb[m] = vi.fn(() => wb);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wb.then = (res: any, rej: any) =>
          Promise.resolve({ data: null, error: null }).then(res, rej);
        return wb;
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
    return b;
  }

  /** `app_users` is asked BY ID — an honest builder, so a name cannot land on
   *  the wrong person just because it was first in the fixture. */
  function usersBuilder(rows: { id: string }[]) {
    let wanted: string | null = null;
    let wantedMany: string[] | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {};
    for (const m of CHAIN) {
      b[m] = vi.fn((col?: string, val?: unknown) => {
        filters.push({ table: "app_users", method: m, col, val });
        if (m === "eq" && col === "id" && typeof val === "string") wanted = val;
        if (m === "in" && col === "id" && Array.isArray(val)) wantedMany = val as string[];
        return b;
      });
    }
    b.maybeSingle = vi.fn(async () => ({
      data: rows.find((r) => r.id === wanted) ?? null,
      error: null,
    }));
    b.single = b.maybeSingle;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.then = (res: any, rej: any) =>
      Promise.resolve({
        data: wantedMany ? rows.filter((r) => wantedMany!.includes(r.id)) : rows,
        error: null,
      }).then(res, rej);
    return b;
  }

  const from = vi.fn((table: string) => {
    if (table === "app_users") {
      return usersBuilder((tables.app_users?.data as { id: string }[]) ?? []);
    }
    return builder(table, tables[table] ?? { data: [], error: null });
  });
  const rpc = vi.fn(async (fn: string) => {
    rpcCalls.push(fn);
    if (fn === "purchasing_actor_may_issue") {
      if (tables.__mayIssue) return tables.__mayIssue;
      const duty = tables.ops_po_duty?.data as { user_id?: string }[] | null;
      const cover = tables.ops_po_duty_cover?.data as { acting_user_id?: string }[] | null;
      const actor = cover?.[0]?.acting_user_id ?? duty?.[0]?.user_id ?? null;
      return { data: actor === "u1", error: null };
    }
    /* 0379 · the ONE actor resolver, answered from the same two tables SQL
       reads, so a test still says who holds the duty with `ops_po_duty` and who
       covers it with `ops_po_duty_cover`. */
    if (fn === "purchasing_po_actor") {
      const resolverError = tables.ops_po_duty?.error ?? tables.ops_po_duty_cover?.error;
      if (resolverError) return { data: null, error: resolverError };
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
        },
        error: null,
      };
    }
    return { data: null, error: null };
  });
  return { from, rpc, writes, filters, rpcCalls };
}

beforeAll(async () => {
  // Only Date is faked — timers stay real so the in-process fetches run.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T04:00:00Z`));
  const kp = await generateKeyPair("ES256", { extractable: true });
  signKey = kp.privateKey;
  publicJwk = await exportJWK(kp.publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
  vi.mocked(userClient).mockReset();
});

async function getDemands(
  tables: Record<string, { data: unknown; error: unknown }> = TABLES() as unknown as Tbl,
  role = "operation",
) {
  const sb = makeSb(tables);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(sb as any);
  const res = await app.fetch(
    new Request("https://api.test/api/operation/purchase/demands", {
      headers: { Authorization: `Bearer ${await makeJwt(role)}` },
    }),
    env,
  );
  return { res, sb };
}

async function rowsOf(tables?: Record<string, { data: unknown; error: unknown }>) {
  const { res, sb } = await getDemands(tables);
  expect(res.status).toBe(200);
  const body = (await res.json()) as SoBatchPurchaseResponse;
  return { body, rows: body.rows, sb };
}

const bySku = (rows: SoBatchPurchaseResponse["rows"], sku: string) =>
  rows.find((r) => r.skus.includes(sku));

describe("GET /api/operation/purchase/demands — one read, two projections", () => {
  it("reads the SAME engine SO Batch Purchase reads — there is no second one", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const demands = readFileSync(join(here, "purchase-demands.ts"), "utf8");
    const toOrder = readFileSync(join(here, "to-order.ts"), "utf8");
    for (const src of [demands, toOrder]) {
      expect(src).toContain('from "../../lib/purchase-demand-read"');
      // Neither route may grow its own demand read.
      expect(src).not.toMatch(/^async function loadToOrder\(/m);
      expect(src).not.toMatch(/^function loadToOrder\(/m);
    }
    // The Register issues nothing.
    expect(demands).not.toMatch(/operation_create_po|purchasing_issue_pos_batch/);
    expect(demands).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(demands).not.toMatch(/router\.post\(/);
  });

  it("the arithmetic on the wire is the engine's own, not a second count", async () => {
    const { rows } = await rowsOf();
    // 2 asked for, nothing covering → 2 to buy.
    expect(bySku(rows, "B1201S-K")).toMatchObject({
      state: "can_order_early",
      qtyNeeded: 2,
      toBuy: 2,
      onPo: 0,
      readyStock: 0,
    });
  });
});

describe("the derived states — blockers and order timing", () => {
  it("a sold SKU absent from the Catalog stays visible as `SKU not found`", async () => {
    const { rows } = await rowsOf();
    const fees = bySku(rows, 'Transport Fees 4"');
    expect(fees).toBeDefined();
    expect(fees!.state).toBe("no_sku");
    // Catalog is the only authority able to decide what it is — so nothing is
    // asserted about coverage, and it is NOT called a Service.
    expect(fees!.category).toBeNull();
    expect(fees!.onPo).toBeNull();
    expect(fees!.readyStock).toBeNull();
    expect(fees!.toBuy).toBeNull();
    expect(fees!.item).toBe('Transport Fees 4"');
    expect(fees!.so).toBe(1207);
  });

  it("a Catalog SKU positively classified as Service is EXCLUDED, not blocked", async () => {
    const { rows } = await rowsOf();
    expect(bySku(rows, "SVC-1")).toBeUndefined();
  });

  it("a supplier-less product is named in full as `Supplier not assigned`", async () => {
    const { rows } = await rowsOf();
    const orphan = bySku(rows, "B9999-K");
    expect(orphan).toMatchObject({
      state: "no_supplier",
      lineIds: ["l5"],
      item: "Orphan",
      variant: "King",
      category: "mattress",
      qtyNeeded: 1,
      so: 1210,
      customer: "ANNE",
      customerDelivery: "2026-09-20",
      supplier: null,
    });
  });

  it("a dateless Sales Order stays visible and is not ready to buy", async () => {
    const { rows } = await rowsOf();
    const tbd = rows.find((r) => r.so === 1204);
    expect(tbd).toBeDefined();
    expect(tbd!.state).toBe("no_customer_date");
    expect(tbd!.customerDelivery).toBeNull();
    // It is still real demand — the arithmetic ran, it just cannot be bought.
    expect(tbd!.toBuy).toBe(1);
  });

  it("missing production days block ONLY the affected supplier × category", async () => {
    const { rows } = await rowsOf();
    expect(bySku(rows, "H1401S-K")).toMatchObject({
      state: "no_production_days",
      supplier: "Ohana",
      category: "mattress",
      qtyNeeded: 1,
      so: 1210,
    });
    // Nice Future × mattress has its number, so its rows are untouched.
    expect(bySku(rows, "B1201S-K")!.state).toBe("can_order_early");
  });

  it("every timing band classifies from the engine's own dates", async () => {
    const { rows } = await rowsOf();
    // Delivery 14 office working days after expected completion — Order By is today.
    expect(rows.find((r) => r.so === 1212)!.state).toBe("safety_days_full");
    // Delivery 5 office working days after expected completion.
    expect(rows.find((r) => r.so === 1211 && r.skus.includes("PART-K"))!.state).toBe(
      "safety_days_low",
    );
    // Delivery ON the expected completion day.
    expect(rows.find((r) => r.so === 1213)!.state).toBe("safety_days_none");
    // Delivery before production can finish.
    expect(rows.find((r) => r.so === 1214)!.state).toBe("not_enough_production_time");
  });

  it("every timing band remains orderable — the risk words are not `Cannot buy`", async () => {
    const { rows } = await rowsOf();
    for (const so of [1207, 1211, 1212, 1213, 1214]) {
      const r = rows.find(
        (x) => x.so === so && x.supplier === "Nice Future" && (x.toBuy ?? 0) > 0,
      )!;
      expect(r.issueRef, `SO-${so}`).not.toBeNull();
      expect(r.action?.action, `SO-${so}`).toBe("Issue PO to Nice Future");
    }
  });

  it("a fully covered build STAYS and stays buyable; a partly covered one keeps its numbers", async () => {
    const { rows } = await rowsOf();
    /* Every COV-K unit is on PO-2051. That coverage comes from a per-SKU pool
       with no customer attribution, so it may belong to another order and may
       move on the next refresh — the buyer is shown both numbers and decides.
       Before 2026-09-03 this row was dropped and the operator got a Sales
       Order with goods lines, no tick-box and no sentence. */
    expect(bySku(rows, "COV-K")).toMatchObject({
      qtyNeeded: 3,
      onPo: 3,
      toBuy: 3,
      poNumbers: ["PO-2051"],
    });
    expect(bySku(rows, "PART-K")).toMatchObject({
      state: "safety_days_low",
      qtyNeeded: 3,
      onPo: 2,
      toBuy: 1,
      poNumbers: ["PO-2052"],
    });
  });

  it("a cancelled covering PO returns the demand automatically — nothing is stored", async () => {
    const t = TABLES() as unknown as Record<string, { data: unknown; error: unknown }>;
    /* The read asks the database for OPEN purchase-order lines only
       (`.eq("purchase_orders.status", "open")`), so a cancelled PO-2051 simply
       stops coming back. */
    t.purchase_order_lines = {
      data: [
        { po_id: "PO-2052", sku: "PART-K", qty: 2, received_qty: 0,
          purchase_orders: { status: "open" } },
      ],
      error: null,
    };
    const { rows } = await rowsOf(t);
    // The coverage fell away on recomputation, so the demand is back in full.
    expect(bySku(rows, "COV-K")).toMatchObject({ qtyNeeded: 3, toBuy: 3, onPo: 0 });
  });

  it("a line taken out of the plan stays out", async () => {
    const { rows } = await rowsOf();
    expect(rows.some((r) => r.lineIds.includes("l9"))).toBe(false);
  });

  it("only PROCEEDED customer orders are asked for — the Card 02-C boundary in the SQL itself", async () => {
    const { sb } = await rowsOf();
    const statusFilter = sb.filters.find(
      (f) => f.table === "orders" && f.method === "eq" && f.col === "status",
    );
    expect(statusFilter?.val).toBe("proceed_order");
    // And the old two-status read is gone for good.
    expect(
      sb.filters.some((f) => f.table === "orders" && f.method === "in" && f.col === "status"),
    ).toBe(false);
  });

  it("no row carries a generic attention word or an invented status", async () => {
    const { rows } = await rowsOf();
    const states = new Set(rows.map((r) => r.state));
    for (const s of states) {
      expect([
        "can_order_early",
        "safety_days_full",
        "safety_days_low",
        "safety_days_none",
        "not_enough_production_time",
        "no_customer_date",
        "no_sku",
        "no_supplier",
        "no_production_days",
      ]).toContain(s);
    }
  });

  it("the governed Safety days value rides the payload for the rail words", async () => {
    const { body } = await rowsOf();
    expect(body.safetyDays).toBe(14);
  });
});

describe("the owner chip", () => {
  it("a missing customer date belongs to the Responsible Salesperson, by name", async () => {
    const { rows } = await rowsOf();
    const tbd = rows.find((r) => r.so === 1204)!;
    expect(tbd.ownerName).toBe("Siew Hong");
    expect(tbd.ownerDuty).toBeNull();
  });

  it("SKU and supplier preparation belong to the month's PO duty holder", async () => {
    const { rows } = await rowsOf();
    expect(bySku(rows, "B9999-K")!.ownerName).toBe("Yee Jin");
    expect(bySku(rows, 'Transport Fees 4"')!.ownerName).toBe("Yee Jin");
  });

  it("where no person resolves, the DUTY WORD stands — never a guessed name", async () => {
    const t = TABLES() as unknown as Record<string, { data: unknown; error: unknown }>;
    t.ops_po_duty = { data: [], error: null };
    const { rows } = await rowsOf(t);
    const orphan = bySku(rows, "B9999-K")!;
    expect(orphan.ownerName).toBeNull();
    expect(orphan.ownerDuty).toBe("PO duty");
    // Production days have no roster fact at all — the duty word always stands.
    expect(bySku(rows, "H1401S-K")!.ownerDuty).toBe("Purchasing Settings");
  });

  it("an orderable timing row has no owner — there is nothing to fix", async () => {
    const { rows } = await rowsOf();
    const ready = bySku(rows, "B1201S-K")!;
    expect(ready.ownerName).toBeNull();
    expect(ready.ownerDuty).toBeNull();
  });
});

describe("the guard, and the promise not to write", () => {
  it("admits operation and principal", async () => {
    for (const role of ["operation", "principal"]) {
      const { res } = await getDemands(TABLES() as unknown as Tbl, role);
      expect(res.status).toBe(200);
    }
  });

  it("refuses every external role", async () => {
    for (const role of ["dealer", "salesperson", "partner", "showroom"]) {
      const { res } = await getDemands(TABLES() as unknown as Tbl, role);
      expect([role, res.status]).toEqual([role, 403]);
    }
  });

  it("refuses a token carrying no known role at all", async () => {
    const { res } = await getDemands(TABLES() as unknown as Tbl, "customer");
    // Authentication refuses it before the guard is reached — the point is that
    // it never sees a demand row.
    expect(res.status).toBe(401);
  });

  it("reads the Register without a single write", async () => {
    const { sb } = await rowsOf();
    expect(sb.writes).toEqual([]);
    /* `purchasing_po_actor` is `stable` and writes nothing — it is a READ that
       happens to be a function, because the duty and cover answer is one rule
       and not two table joins repeated on four surfaces (0379). */
    expect(sb.rpcCalls).toEqual(["purchasing_po_actor", "purchasing_actor_may_issue"]);
  });
});


/**
 * CARD-2026-08-22-purchasing-02 — the SO Batch Purchase projection.
 *
 * The Register that EXPLAINS became the Register that also BUYS, so the same
 * read must now carry the four facts a buy needs and could not previously
 * state: the arrival date, the engine reference, the structured action and the
 * destinations a buy may be sent to.
 */
describe("the buying facts SO Batch Purchase needs", () => {
  it("blocks a missing Catalog cost before Issue review", async () => {
    const t = TABLES() as unknown as Record<string, { data: unknown; error: unknown }>;
    const sku = (t.product_skus.data as Record<string, unknown>[]).find(
      (r) => r.sku === "B1201S-K",
    )!;
    sku.cost = null;

    const { rows } = await rowsOf(t);
    const row = bySku(rows, "B1201S-K")!;
    expect(row.state).toBe("no_cost");
    expect(row.issueRef).toBeNull();
  });

  it("carries the supplier's governed collection rule into the review", async () => {
    const t = TABLES() as unknown as Record<string, { data: unknown; error: unknown }>;
    (t.suppliers.data as Record<string, unknown>[])[0]!.kind = "factory_pickup";
    t.purchasing_supplier_settings = {
      data: [{
        supplier_id: NICE,
        off_days: [0],
        transit_days: 1,
        fixed_destination_id: KLANG_DEST,
        collected_by_partner_id: "p-nets",
      }],
      error: null,
    };
    t.delivery_partners = { data: [{ id: "p-nets", name: "NETS" }], error: null };

    const { rows } = await rowsOf(t);

    expect(bySku(rows, "B1201S-K")!.supplierCollection).toEqual({
      procurementPartnerId: "p-nets",
      procurementPartnerName: "NETS",
      fixedDestinationId: KLANG_DEST,
    });
  });

  it("names a factory-collected supplier with NO collector, instead of failing at issue", async () => {
    /* YH, 2026-09-03. `to-order.ts` refuses this plan with
       `pickup_partner_required` AFTER the operator has ticked and pressed
       Issue PO — the same trap shape as `already_on_po`. The facts were on the
       row all along, so the refusal moves to where the tick is offered. */
    const t = TABLES() as unknown as Record<string, { data: unknown; error: unknown }>;
    (t.suppliers.data as Record<string, unknown>[])[0]!.kind = "factory_pickup";

    const { rows } = await rowsOf(t);
    const row = bySku(rows, "B1201S-K")!;
    expect(row.state).toBe("no_pickup_partner");
    expect(row.action!.action).toContain("Purchasing Settings");
  });

  it("a factory-collected supplier WITH a collector is orderable as normal", async () => {
    const t = TABLES() as unknown as Record<string, { data: unknown; error: unknown }>;
    (t.suppliers.data as Record<string, unknown>[])[0]!.kind = "factory_pickup";
    t.purchasing_supplier_settings = {
      data: [{
        supplier_id: NICE,
        off_days: [0],
        transit_days: 1,
        fixed_destination_id: KLANG_DEST,
        collected_by_partner_id: "p-nets",
      }],
      error: null,
    };
    t.delivery_partners = { data: [{ id: "p-nets", name: "NETS" }], error: null };

    const { rows } = await rowsOf(t);
    expect(bySku(rows, "B1201S-K")!.state).not.toBe("no_pickup_partner");
  });

  it("carries the arrival date off the ENGINE — the route subtracts nothing", async () => {
    const { rows } = await rowsOf();
    const ready = bySku(rows, "B1201S-K")!;
    expect(ready.goodsMustArrive).not.toBeNull();
    // It is EARLIER than the customer promise: production plus buffer is the
    // whole point of the date, and it is the engine that knows them.
    expect(ready.goodsMustArrive! < ready.customerDelivery!).toBe(true);
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "purchase-demands.ts"),
      "utf8",
    );
    // No working-day arithmetic may appear in this route.
    expect(src).not.toMatch(/addWorkingDays|subtractWorkingDays|addDaysIso/);
  });

  it("a line with no customer date has no arrival date to derive", async () => {
    const { rows } = await rowsOf();
    const tbd = rows.find((r) => r.state === "no_customer_date");
    expect(tbd).toBeDefined();
    expect(tbd!.goodsMustArrive).toBeNull();
  });

  it("a ready row carries the engine reference an issue is built from", async () => {
    const { rows } = await rowsOf();
    const ready = bySku(rows, "B1201S-K")!;
    expect(ready.issueRef).not.toBeNull();
    expect(ready.issueRef!.proposalKey.length).toBeGreaterThan(0);
    expect(ready.issueRef!.buildKey.length).toBeGreaterThan(0);
  });

  it("a line the engine REFUSED has no reference, so it can never be issued", async () => {
    const { rows } = await rowsOf();
    for (const state of ["no_sku", "no_supplier", "no_production_days"] as const) {
      const blocked = rows.find((r) => r.state === state);
      expect(blocked, state).toBeDefined();
      expect(blocked!.issueRef, state).toBeNull();
    }
  });

  it("every unfinished row carries the structured action, with its owner as metadata", async () => {
    const { rows } = await rowsOf();
    const ready = bySku(rows, "B1201S-K")!;
    expect(ready.action).toMatchObject({
      trigger: "can_order_early",
      ownerRule: "Current PO Duty",
      completionFact: "Current PO version reached supplier with evidence",
      sourceObject: { type: "sales_order", id: "o1", number: "SO-1207" },
    });
    expect(ready.action!.action).toBe("Issue PO to Nice Future");
    // The person is metadata, never inside the sentence.
    expect(ready.action!.action).not.toContain("Yee Jin");
  });

  it("the salesperson owns the missing customer date, by name", async () => {
    const { rows } = await rowsOf();
    const tbd = rows.find((r) => r.state === "no_customer_date")!;
    expect(tbd.action).toMatchObject({
      trigger: "no_customer_date",
      ownerRule: "Responsible Salesperson",
      ownerName: "Siew Hong",
      action: "Ask customer for a delivery date",
      completionFact: "Requested Delivery Date exists",
    });
    expect(tbd.action!.action).not.toContain("Siew Hong");
  });

  it("the buying action is DATED by the arrival the goods must make", async () => {
    const { rows } = await rowsOf();
    const ready = bySku(rows, "B1201S-K")!;
    expect(ready.action!.dueDate).toBe(ready.goodsMustArrive);
  });
});

describe("the destinations a buy may be sent to", () => {
  it("returns the active destinations and names the standing default", async () => {
    const { body } = await rowsOf();
    expect(body.destinations.map((d) => d.name)).toContain("Carres Klang");
    expect(body.defaultDestinationId).toBe(KLANG_DEST);
    const klang = body.destinations.find((d) => d.id === KLANG_DEST)!;
    expect(klang.isDefault).toBe(true);
    expect(klang.active).toBe(true);
  });

  it("a closed destination is RETURNED but marked inactive — history still reads", async () => {
    const { body } = await rowsOf();
    const closed = body.destinations.find((d) => d.id === CLOSED_DEST);
    expect(closed).toBeDefined();
    expect(closed!.active).toBe(false);
  });

  it("no default configured means no default is invented", async () => {
    const tables = TABLES();
    tables.purchasing_destinations = {
      data: [{ id: BULOH_DEST, name: "AL Sungai Buloh", is_default: false, active: true }],
      error: null,
    };
    const { body } = await rowsOf(tables);
    expect(body.defaultDestinationId).toBeNull();
  });
});

describe("who may issue", () => {
  it("names the current PO duty holder", async () => {
    const { body } = await rowsOf();
    expect(body.currentPoDuty).toEqual({ userId: PO_HOLDER, name: "Yee Jin" });
  });

  it("the duty holder may issue", async () => {
    const tables = TABLES();
    tables.ops_po_duty = { data: [{ user_id: "u1" }], error: null };
    tables.app_users = {
      data: [
        { id: SALES, name: "Siew Hong", email: "sh@carres.com" },
        { id: "u1", name: "On Duty", email: "od@carres.com" },
      ],
      error: null,
    };
    const { body } = await rowsOf(tables);
    expect(body.mayIssue).toBe(true);
  });

  it("offers Issue PO to the governed Operations Superuser while preserving Yu Jun as duty owner", async () => {
    const tables = TABLES() as unknown as Record<string, { data: unknown; error: unknown }>;
    tables.__mayIssue = { data: true, error: null };

    const { body, sb } = await rowsOf(tables);

    expect(body.mayIssue).toBe(true);
    expect(body.currentPoDuty).toEqual({ userId: PO_HOLDER, name: "Yee Jin" });
    expect(body.actingPoDuty).toBeNull();
    expect(sb.rpcCalls).toContain("purchasing_actor_may_issue");
  });

  it("an operator who is NOT on duty reads the page and may not issue", async () => {
    const { body } = await rowsOf();
    // The fixture's duty holder is PO_HOLDER; the caller is `u1`.
    expect(body.mayIssue).toBe(false);
  });

  it("nobody on duty means nobody may issue from this read", async () => {
    const tables = TABLES();
    tables.ops_po_duty = { data: [], error: null };
    const { body } = await rowsOf(tables);
    expect(body.currentPoDuty).toBeNull();
    expect(body.poDutyNameUnavailable).toBe(false);
    expect(body.poDutyUnavailable).toBe(false);
    expect(body.mayIssue).toBe(false);
  });

  it("keeps the configured duty fact when the holder name cannot be read", async () => {
    const tables = TABLES();
    tables.app_users = {
      data: [{ id: SALES, name: "Siew Hong", email: "sh@carres.com" }],
      error: null,
    };
    const { body } = await rowsOf(tables);
    expect(body.currentPoDuty).toBeNull();
    expect(body.actingPoDuty).toBeNull();
    expect(body.poDutyNameUnavailable).toBe(true);
    expect(body.poDutyUnavailable).toBe(false);
  });

  it("does not call a failed duty resolver an empty roster", async () => {
    const tables = TABLES();
    tables.ops_po_duty = {
      data: [],
      error: { message: "duty read failed" },
    } as unknown as (typeof tables)["ops_po_duty"];
    const { body } = await rowsOf(tables);
    expect(body.currentPoDuty).toBeNull();
    expect(body.actingPoDuty).toBeNull();
    expect(body.poDutyNameUnavailable).toBe(false);
    expect(body.poDutyUnavailable).toBe(true);
    expect(body.mayIssue).toBe(false);
  });
});

describe("SO demand only — Manual Purchase never leaks in", () => {
  it("a typed Ready Stock demand is not a customer demand and never appears", async () => {
    const { rows } = await rowsOf();
    for (const r of rows) {
      expect(r.orderId, r.id).not.toBe("");
      // Every row traces to a real customer order in the fixture.
      expect(["o1", "o2", "o3", "o4", "o5", "o6", "o7", "o13"], r.id).toContain(r.orderId);
    }
  });
});

/**
 * ⭐ THE REGISTER ASKS THE SAME ACTOR RESOLVER AS THE DOOR
 * (closure §1; 0379).
 *
 * A covering operator used to be shown a page with no `Issue PO` on it while
 * the door would have let them through — the Register read `ops_po_duty` and
 * knew nothing about cover.
 */
describe("closure §1 · the Register offers the act to whoever may act today", () => {
  it("offers Issue PO to the authorised cover, and names the holder it covers", async () => {
    const t = TABLES() as unknown as Record<string, { data: unknown; error: unknown }>;
    t.ops_po_duty = { data: [{ user_id: PO_HOLDER }], error: null };
    t.ops_po_duty_cover = {
      data: [{ normal_user_id: PO_HOLDER, acting_user_id: "u1" }],
      error: null,
    };
    t.app_users = {
      data: [
        ...((t.app_users?.data as { id: string; name: string; email: string }[]) ?? []),
        { id: "u1", name: "Shasha", email: "ss@carres.com" },
      ],
      error: null,
    };
    const { body } = await rowsOf(t);
    expect(body.mayIssue).toBe(true);
    /* BOTH people, separately. Team Work groups by the holder; the audit says
       who acted. Collapsing them would lose one for good. */
    expect(body.currentPoDuty?.userId).toBe(PO_HOLDER);
    expect(body.actingPoDuty).toEqual({ userId: "u1", name: "Shasha" });
  });

  it("does not offer it to an Operations login who is neither", async () => {
    const t = TABLES() as unknown as Tbl;
    t.ops_po_duty = { data: [{ user_id: PO_HOLDER }], error: null };
    const { body } = await rowsOf(t);
    expect(body.mayIssue).toBe(false);
    expect(body.actingPoDuty).toBeNull();
  });

  it("offers it to nobody when the month has no holder and no cover", async () => {
    const t = TABLES() as unknown as Tbl;
    t.ops_po_duty = { data: [], error: null };
    const { body } = await rowsOf(t);
    expect(body.mayIssue).toBe(false);
    expect(body.currentPoDuty).toBeNull();
    expect(body.actingPoDuty).toBeNull();
  });

  it("keeps the effective cover fact when the cover name cannot be read", async () => {
    const t = TABLES() as unknown as Record<string, { data: unknown; error: unknown }>;
    t.ops_po_duty_cover = {
      data: [{ normal_user_id: PO_HOLDER, acting_user_id: "u1" }],
      error: null,
    };
    const { body } = await rowsOf(t);
    expect(body.currentPoDuty).toEqual({ userId: PO_HOLDER, name: "Yee Jin" });
    expect(body.actingPoDuty).toBeNull();
    expect(body.poDutyNameUnavailable).toBe(true);
  });
});

/**
 * ⭐ CARD 02-B — ONE PERMANENT ROW PER PROCEEDED SALES ORDER (owner ruling
 * 2026-08-27).
 *
 * The fixture overlay adds the three authorities the order Register runs on:
 * `po_line_sources` (the ONLY visible PO attribution), `purchase_orders`
 * (status · version · `eta_date` · supplier · destination) and `po_sends`
 * (confirmed-sent evidence at the current version). Five extra orders cover
 * the five Status stories: fully sent, numbered-but-unsent, cancelled,
 * stale-revision and received.
 */
function registerTables() {
  const t = TABLES() as unknown as Record<string, { data: unknown; error: unknown }>;
  const orders = t.orders.data as Record<string, unknown>[];
  /* o1 gains the order facts the Register prints. */
  Object.assign(orders.find((o) => o.id === "o1")!, {
    proceed_date: "2026-08-20",
    proceeded_at: "2026-08-20T08:15:00+08:00",
    customer_address_city: "Petaling Jaya",
    customer_address_state: "Selangor",
  });
  orders.push(
    { id: "o8", so: 1215, customer_name: "ORDERED ONE", status: "proceed_order",
      delivery_date: DELIVERY_EARLY, delivery_date_tbd: false,
      placed_at: "2026-07-01", created_at: "2026-07-01", proceed_date: "2026-08-21",
      salesperson_id: null },
    { id: "o9", so: 1216, customer_name: "UNSENT ONE", status: "proceed_order",
      delivery_date: DELIVERY_EARLY, delivery_date_tbd: false,
      placed_at: "2026-07-01", created_at: "2026-07-01", proceed_date: null,
      salesperson_id: null },
    { id: "o10", so: 1217, customer_name: "CANCELLED ONE", status: "proceed_order",
      delivery_date: DELIVERY_EARLY, delivery_date_tbd: false,
      placed_at: "2026-07-01", created_at: "2026-07-01", proceed_date: null,
      salesperson_id: null },
    { id: "o11", so: 1218, customer_name: "REVISED ONE", status: "proceed_order",
      delivery_date: DELIVERY_EARLY, delivery_date_tbd: false,
      placed_at: "2026-07-01", created_at: "2026-07-01", proceed_date: null,
      salesperson_id: null },
  );
  const lines = t.order_lines.data as Record<string, unknown>[];
  lines.push(
    line("l13", "o8", "ORD-K", 2),
    line("l14", "o9", "UNS-K", 1),
    line("l15", "o10", "CAN-K", 1),
    line("l16", "o11", "REV-K", 1),
  );
  const skus = t.product_skus.data as Record<string, unknown>[];
  for (const sku of ["ORD-K", "UNS-K", "CAN-K", "REV-K"]) {
    skus.push({
      sku, supplier_id: NICE, cost: 100, variant: "King", variant_kind: "size",
      product_models: { category: "mattress", name: sku.slice(0, 3) },
    });
  }
  t.purchase_orders = {
    data: [
      /* Received, current version confirmed sent — stays Ordered forever. */
      { id: "PO-9001", status: "received", version: 1, eta_date: "2026-09-18",
        supplier_id: NICE, destination_id: KLANG_DEST },
      /* Numbered, never sent — visible under PO No, Status stays blank. */
      { id: "PO-9002", status: "open", version: 1, eta_date: null,
        supplier_id: NICE, destination_id: KLANG_DEST },
      /* Cancelled — never counts, never attributed. */
      { id: "PO-9003", status: "cancelled", version: 1, eta_date: "2026-09-10",
        supplier_id: NICE, destination_id: KLANG_DEST },
      /* Revised to v2; only v1 was ever sent — the old send completes nothing. */
      { id: "PO-9004", status: "open", version: 2, eta_date: "2026-09-12",
        supplier_id: NICE, destination_id: BULOH_DEST },
      /* The o4 covers, so Partial can be proven on a real engine order. */
      { id: "PO-2051", status: "open", version: 1, eta_date: "2026-09-15",
        supplier_id: NICE, destination_id: KLANG_DEST },
      { id: "PO-2052", status: "open", version: 1, eta_date: "2026-09-15",
        supplier_id: NICE, destination_id: KLANG_DEST },
    ],
    error: null,
  };
  t.po_line_sources = {
    data: [
      { id: "src1", po_id: "PO-9001", order_id: "o8", order_line_id: "l13", qty: 2 },
      { id: "src2", po_id: "PO-9002", order_id: "o9", order_line_id: "l14", qty: 1 },
      { id: "src3", po_id: "PO-9003", order_id: "o10", order_line_id: "l15", qty: 1 },
      { id: "src4", po_id: "PO-9004", order_id: "o11", order_line_id: "l16", qty: 1 },
      { id: "src5", po_id: "PO-2051", order_id: "o4", order_line_id: "l7", qty: 3 },
      { id: "src6", po_id: "PO-2052", order_id: "o4", order_line_id: "l8", qty: 2 },
    ],
    error: null,
  };
  t.po_sends = {
    data: [
      { po_id: "PO-9001", po_version: 1, kind: "confirmed_sent" },
      { po_id: "PO-9003", po_version: 1, kind: "confirmed_sent" },
      { po_id: "PO-9004", po_version: 1, kind: "confirmed_sent" },
      { po_id: "PO-2051", po_version: 1, kind: "confirmed_sent" },
      { po_id: "PO-2052", po_version: 1, kind: "confirmed_sent" },
      /* An app open is not an arrival — it must never count. */
      { po_id: "PO-9002", po_version: 1, kind: "external_open" },
    ],
    error: null,
  };
  return t;
}

const registerRow = (body: SoBatchPurchaseResponse, orderId: string) =>
  body.registerRows.find((r) => r.orderId === orderId);

describe("Card 02-B · one permanent row per proceeded Sales Order", () => {
  it("only `proceed_order` orders get a row — `place` does not, Service-only does not", async () => {
    const { body } = await rowsOf(registerTables());
    const ids = body.registerRows.map((r) => r.orderId);
    expect(ids).toContain("o1");
    expect(ids).toContain("o2"); // proceeded, even with no agreed date
    expect(ids).not.toContain("o12"); // status `place`
  });

  it("one SO with several item lines is ONE parent row, newest order first", async () => {
    const { body } = await rowsOf(registerTables());
    expect(body.registerRows.filter((r) => r.orderId === "o1")).toHaveLength(1);
    const soNumbers = body.registerRows.map((r) => r.so);
    expect([...soNumbers].sort((a, b) => (b ?? -1) - (a ?? -1))).toEqual(soNumbers);
  });

  it("carries the order facts the columns print — Proceed Date, Requested Delivery Date, locality", async () => {
    const { body } = await rowsOf(registerTables());
    const o1 = registerRow(body, "o1")!;
    expect(o1.proceededAt).toBe("2026-08-20T08:15:00+08:00");
    expect(o1.requestedDeliveryDate).toBe(DELIVERY_EARLY);
    expect(o1.deliveryCity).toBe("Petaling Jaya");
    expect(o1.deliveryState).toBe("Selangor");
    expect(o1.customer).toBe("PETER");
  });

  it("no lineage and outstanding demand is blank, with the outstanding supplier named", async () => {
    const { body } = await rowsOf(registerTables());
    const o1 = registerRow(body, "o1")!;
    expect(o1.status).toBe("blank");
    expect(o1.pos).toEqual([]);
    expect(o1.outstandingSuppliers).toEqual(["Nice Future"]);
  });

  it("a received PO with current-version confirmed-send stays Ordered — and the row stays", async () => {
    const { body } = await rowsOf(registerTables());
    const o8 = registerRow(body, "o8")!;
    expect(o8.status).toBe("ordered");
    expect(o8.pos.map((p) => p.poId)).toEqual(["PO-9001"]);
    expect(o8.pos[0]).toMatchObject({
      status: "received",
      supplierName: "Nice Future",
      destinationId: KLANG_DEST,
      etaDate: "2026-09-18",
      sentCurrentVersion: true,
    });
  });

  it("a numbered but unsent PO shows under PO No while Status stays blank — `external_open` never counts", async () => {
    const { body } = await rowsOf(registerTables());
    const o9 = registerRow(body, "o9")!;
    expect(o9.pos.map((p) => p.poId)).toEqual(["PO-9002"]);
    expect(o9.pos[0]!.sentCurrentVersion).toBe(false);
    expect(o9.status).toBe("blank");
    /* A PO without a date prints nothing — never an estimate. */
    expect(o9.pos[0]!.etaDate).toBeNull();
  });

  it("a cancelled PO neither counts nor attributes, even with send evidence", async () => {
    const { body } = await rowsOf(registerTables());
    const o10 = registerRow(body, "o10")!;
    expect(o10.pos).toEqual([]);
    expect(o10.status).toBe("blank");
  });

  it("a new unsent revision invalidates older-version send completeness", async () => {
    const { body } = await rowsOf(registerTables());
    const o11 = registerRow(body, "o11")!;
    expect(o11.pos.map((p) => p.poId)).toEqual(["PO-9004"]);
    expect(o11.pos[0]!.sentCurrentVersion).toBe(false);
    expect(o11.status).toBe("blank");
  });

  it("part of the buying-required quantity covered and sent is Partial, with the exact line mapping", async () => {
    const { body } = await rowsOf(registerTables());
    const o4 = registerRow(body, "o4")!;
    // COV-K: 3 of 3 on PO-2051 (sent) · PART-K: 2 of 3 on PO-2052 (sent).
    expect(o4.status).toBe("partial");
    expect(o4.pos.map((p) => p.poId)).toEqual(["PO-2051", "PO-2052"]);
    const part = o4.lines.find((l) => l.sku === "PART-K")!;
    expect(part.qty).toBe(3);
    expect(part.pos).toEqual([{ poId: "PO-2052", qty: 2 }]);
  });

  it("visible PO attribution comes ONLY from po_line_sources — a document with no lineage never appears", async () => {
    const t = registerTables();
    (t.purchase_orders.data as Record<string, unknown>[]).push({
      /* A PO that merely mentions the customer order some other way. */
      id: "PO-9099", status: "open", version: 1, eta_date: "2026-09-01",
      supplier_id: NICE, destination_id: KLANG_DEST, so: 1207, so_refs: [1207],
    });
    const { body } = await rowsOf(t);
    for (const r of body.registerRows) {
      expect(r.pos.map((p) => p.poId), r.orderId).not.toContain("PO-9099");
    }
  });

  it("a fully Ready-Stock covered order keeps its row, blank, with the coverage on its lines", async () => {
    const t = registerTables();
    /* One unit of B1201S-Q free in Klang, already drawn for SO-1212 (o5). */
    t.ops_stock_items = {
      data: [{ id: "st1", sku: "B1201S-Q", qty: 1, date_in: "2026-08-01", created_at: "2026-08-01" }],
      error: null,
    };
    t.ops_stock_pool_usage = {
      data: [{ sku: "B1201S-Q", qty: 1, ref: "SO-1212" }],
      error: null,
    };
    const { body, rows } = await rowsOf(t);
    const o5 = registerRow(body, "o5")!;
    expect(o5.status).toBe("blank");
    const covered = o5.lines.find((l) => l.orderLineId === "l10")!;
    expect(covered.stockTaken).toBe(1);
    expect(covered.qty).toBe(1);
    /* And the leaf listing no longer carries it — nothing left to buy — so the
       ROW is the only thing keeping the order visible. */
    expect(rows.find((r) => r.lineIds.includes("l10"))).toBeUndefined();
  });

  it("the wire schema parses the whole payload, registerRows included", async () => {
    const { res } = await getDemands(registerTables());
    expect(res.status).toBe(200);
    const parsed = (await import("@carres/shared")).soBatchPurchaseResponseSchema.parse(
      await res.json(),
    );
    expect(parsed.registerRows.length).toBeGreaterThan(0);
  });
});

/**
 * ⭐ CARD 02-C — THE PROCEEDED-ORDER BOUNDARY (RESOLVED FROM AUTHORITY,
 * 2026-08-27). A Sales Order enters SO Batch Purchase only after Sales
 * completes `Proceed`. A `place` order is invisible to Purchasing: no leaf
 * row (so no rail count — the rail counts unique orders OVER the leafs), no
 * Register row, and no ability to consume Open PO coverage ahead of a
 * proceeded order.
 */
describe("Card 02-C · a `place` order is invisible to Purchasing", () => {
  it("contributes ZERO leaf rows — the population every rail count draws from", async () => {
    const { rows } = await rowsOf();
    expect(rows.filter((r) => r.orderId === "o12")).toEqual([]);
    expect(rows.find((r) => r.so === 1219)).toBeUndefined();
  });

  it("has no Register row", async () => {
    const { body } = await rowsOf();
    expect(body.registerRows.find((r) => r.orderId === "o12")).toBeUndefined();
  });

  it("cannot consume Open PO coverage ahead of a proceeded order", async () => {
    /* One open unit of COV2-K; the `place` order asked first (2026-06-01).
       Under the corrected boundary the PROCEEDED order drinks that unit, so
       its build reports `onPo: 1`. If the `place` order were still allowed to
       take the coverage first, the proceeded order would report `onPo: 0`.
       That number is the assertion — the row itself is present either way
       since 2026-09-03, so its mere existence proves nothing. */
    const { rows, body } = await rowsOf();
    expect(bySku(rows, "COV2-K")).toMatchObject({ onPo: 1 });
    /* And the proceeded order's PERMANENT row is still on the Register. */
    expect(body.registerRows.find((r) => r.orderId === "o13")).toBeDefined();
  });

  it("a dateless PROCEEDED order still enters — the boundary is Proceed, not the date", async () => {
    const { rows } = await rowsOf();
    const tbd = rows.find((r) => r.so === 1204)!;
    expect(tbd.state).toBe("no_customer_date");
  });
});
