import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
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
import type { SoBatchPurchaseResponse } from "@carres/shared";
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
      order_by_buffer_days: 7,
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
        delivery_date: "2026-09-30", delivery_date_tbd: false,
        placed_at: "2026-07-01", created_at: "2026-07-01", proceed_date: null,
        salesperson_id: SALES,
      },
      {
        id: "o2", so: 1204, customer_name: "ella", status: "place",
        delivery_date: null, delivery_date_tbd: true,
        placed_at: "2026-07-01", created_at: "2026-07-01", proceed_date: null,
        salesperson_id: SALES,
      },
      {
        id: "o3", so: 1210, customer_name: "ANNE", status: "proceed_order",
        delivery_date: "2026-09-20", delivery_date_tbd: false,
        placed_at: "2026-07-01", created_at: "2026-07-01", proceed_date: null,
        salesperson_id: null,
      },
      {
        id: "o4", so: 1211, customer_name: "BOB", status: "proceed_order",
        delivery_date: "2026-09-25", delivery_date_tbd: false,
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
    ],
    error: null,
  },
  purchase_order_lines: {
    data: [
      { po_id: "PO-2051", sku: "COV-K", qty: 3, received_qty: 0,
        purchase_orders: { status: "open" } },
      { po_id: "PO-2052", sku: "PART-K", qty: 2, received_qty: 0,
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
    /* 0379 · the ONE actor resolver, answered from the same two tables SQL
       reads, so a test still says who holds the duty with `ops_po_duty` and who
       covers it with `ops_po_duty_cover`. */
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
        },
        error: null,
      };
    }
    return { data: null, error: null };
  });
  return { from, rpc, writes, filters, rpcCalls };
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
      state: "ready_to_buy",
      qtyNeeded: 2,
      toBuy: 2,
      onPo: 0,
      readyStock: 0,
    });
  });
});

describe("the six derived states", () => {
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
    expect(bySku(rows, "B1201S-K")!.state).toBe("ready_to_buy");
  });

  it("fully and partly covered demand state the exact coverage and the PO numbers", async () => {
    const { rows } = await rowsOf();
    expect(bySku(rows, "COV-K")).toMatchObject({
      state: "covered",
      qtyNeeded: 3,
      onPo: 3,
      toBuy: 0,
      poNumbers: ["PO-2051"],
    });
    expect(bySku(rows, "PART-K")).toMatchObject({
      state: "ready_to_buy",
      qtyNeeded: 3,
      onPo: 2,
      toBuy: 1,
      poNumbers: ["PO-2052"],
    });
  });

  it("a line taken out of the plan stays out", async () => {
    const { rows } = await rowsOf();
    expect(rows.some((r) => r.lineIds.includes("l9"))).toBe(false);
  });

  it("only live customer orders are asked for", async () => {
    const { sb } = await rowsOf();
    const statusFilter = sb.filters.find(
      (f) => f.table === "orders" && f.method === "in" && f.col === "status",
    );
    expect(statusFilter?.val).toEqual(["place", "proceed_order"]);
  });

  it("no row carries a generic attention word or an invented status", async () => {
    const { rows } = await rowsOf();
    const states = new Set(rows.map((r) => r.state));
    for (const s of states) {
      expect([
        "ready_to_buy",
        "no_customer_date",
        "no_sku",
        "no_supplier",
        "no_production_days",
        "covered",
      ]).toContain(s);
    }
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

  it("a ready row has no owner — there is nothing to fix", async () => {
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
    expect(sb.rpcCalls).toEqual(["purchasing_po_actor"]);
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
      trigger: "ready_to_buy",
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
      completionFact: "Customer Delivery exists",
    });
    expect(tbd.action!.action).not.toContain("Siew Hong");
  });

  it("a covered row owes nobody anything", async () => {
    const { rows } = await rowsOf();
    const covered = rows.find((r) => r.state === "covered");
    expect(covered).toBeDefined();
    expect(covered!.action).toBeNull();
  });

  it("the ready action is DATED by the arrival the goods must make", async () => {
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
    expect(body.mayIssue).toBe(false);
  });
});

describe("SO demand only — Manual Purchase never leaks in", () => {
  it("a typed Ready Stock demand is not a customer demand and never appears", async () => {
    const { rows } = await rowsOf();
    for (const r of rows) {
      expect(r.orderId, r.id).not.toBe("");
      // Every row traces to a real customer order in the fixture.
      expect(["o1", "o2", "o3", "o4"], r.id).toContain(r.orderId);
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
});
