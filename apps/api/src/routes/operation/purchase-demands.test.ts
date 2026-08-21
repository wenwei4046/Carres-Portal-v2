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
import type { PurchaseDemandsResponse } from "@carres/shared";
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
  purchasing_destinations: { data: [], error: null },
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
  const body = (await res.json()) as PurchaseDemandsResponse;
  return { body, rows: body.rows, sb };
}

const bySku = (rows: PurchaseDemandsResponse["rows"], sku: string) =>
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
    expect(sb.rpcCalls).toEqual([]);
  });
});
