import { Hono } from "hono";
import { describe, it, expect, vi } from "vitest";
import type { AppEnv } from "../../types";
import warehouse from "./warehouse";
vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";
function app(role = "operation") {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("auth", { role, jwt: "test" } as never);
    await next();
  });
  a.route("/", warehouse);
  return a;
}
function db(fail = false) {
  vi.mocked(userClient).mockReturnValue({
    from: () => {
      const q: any = {
        select: () => q,
        order: () => q,
        range: async () => ({
          data: [],
          error: fail ? { code: "42501", message: "permission denied" } : null,
        }),
      };
      return q;
    },
  } as never);
}

/** PRODUCTION SHAPE, 2026-09-07: the arrival-source objects are approved
 *  Inbound truth whose tables are still an unnumbered draft, so the deployed
 *  schema carries neither them nor `warehouse_receipts.arrival_source_id`.
 *  This is the shape that shipped broken; the register must open on it. */
function dbWithoutArrivalSources() {
  const ABSENT_TABLES = new Set([
    "arrival_sources",
    "arrival_source_units",
    "arrival_source_events",
    "stock_operating_parties",
  ]);
  const reads: string[] = [];
  vi.mocked(userClient).mockReturnValue({
    from: (table: string) => {
      const q: any = {
        select: (fields: string) => {
          reads.push(`${table}:${fields}`);
          q._fields = fields;
          return q;
        },
        order: () => q,
        range: async () => {
          if (ABSENT_TABLES.has(table))
            return {
              data: null,
              error: {
                code: "42P01",
                message: `relation "public.${table}" does not exist`,
              },
            };
          if (
            table === "warehouse_receipts" &&
            String(q._fields).includes("arrival_source_id")
          )
            return {
              data: null,
              error: {
                code: "42703",
                message: 'column warehouse_receipts.arrival_source_id does not exist',
              },
            };
          return { data: [], error: null };
        },
      };
      return q;
    },
  } as never);
  return reads;
}
describe("GET warehouse/inbound", () => {
  it("opens an empty real read projection with governed sites", async () => {
    db();
    const r = await app().request("/inbound");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      arrivals: [],
      sites: [],
      sourceFacts: [],
      skuCategories: [],
      unmappedDestinations: [],
      unresolvedSources: [],
      page: { offset: 0, limit: 50, total: 0 },
      /* Three filters, not five (owner ruling 2026-09-15). */
      facets: {
        status: { open: 0, received: 0, all: 0 },
        sourceType: {},
        site: {},
      },
    });
  });
  it("opens on the deployed schema, where the arrival-source tables do not exist", async () => {
    const reads = dbWithoutArrivalSources();
    const r = await app().request("/inbound");
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      arrivals: unknown[];
      facets: { sourceType: Record<string, number> };
    };
    /* Absence of a source kind is absence of its records — never a refusal
       to open, and never an invented row. */
    expect(body.arrivals).toEqual([]);
    expect(body.facets.sourceType).toEqual({});
    /* The receipts read fell back to the select without the absent column,
       so the PO-backed half still reads its own rows. */
    expect(
      reads.some(
        (r) =>
          r.startsWith("warehouse_receipts:") && !r.includes("arrival_source_id"),
      ),
    ).toBe(true);
  });

  it("reports a failed authority read instead of an empty success", async () => {
    db(true);
    expect((await app().request("/inbound")).status).toBe(403);
  });
  it("rejects non-operation access and exposes no receipt writer", async () => {
    db();
    expect((await app("dealer").request("/inbound")).status).toBe(403);
    expect((await app().request("/inbound", { method: "POST" })).status).toBe(
      404,
    );
  });
});

/** The ADDITIVE read-only facts the Warehouse Schedule needs: which ORIGINAL
 *  lines an arrangement ordered, and whether its date rests on an AGREEMENT or
 *  an estimate. Both come from rows this handler already reads. */
function dbWithOnePo(promises: unknown[] = []) {
  const rows: Record<string, unknown[]> = {
    purchase_orders: [
      {
        id: "PO-1",
        version: 1,
        supplier_id: "sup-1",
        warehouse_id: "site-1",
        destination_id: null,
        status: "open",
        official_delivery_date: null,
        eta_date: "2026-09-20",
        placed_at: "2026-09-01",
        so: 1362,
      },
    ],
    warehouses: [{ id: "site-1", name: "Carres Klang" }],
    suppliers: [{ id: "sup-1", name: "Ohana" }],
    purchase_order_lines: [
      { id: "line-1", po_id: "PO-1", qty: 1, destination_id: null, sku: "sofa:Muro-K" },
      { id: "line-2", po_id: "PO-1", qty: 2, destination_id: null, sku: "bedframe:Jager-Q" },
      { id: "line-3", po_id: "PO-1", qty: 1, destination_id: null, sku: "sofa:NoModel-K" },
    ],
    product_skus: [
      { id: "ps1", sku: "sofa:Muro-K", variant: "King", model_id: "m-sofa" },
      { id: "ps2", sku: "bedframe:Jager-Q", variant: "Queen", model_id: "m-bed" },
      // A SKU the catalog holds no model for — asked, and silent.
      { id: "ps3", sku: "sofa:NoModel-K", variant: "King", model_id: null },
      // Present in the catalog but on no arrangement of this page.
      { id: "ps4", sku: "mattress:Unrelated-Q", variant: "Queen", model_id: "m-mat" },
    ],
    product_models: [
      { id: "m-sofa", name: "Muro", category: "sofa" },
      { id: "m-bed", name: "Jager", category: "bedframe" },
      { id: "m-mat", name: "Breeze", category: "mattress" },
    ],
    po_supplier_promises: promises,
    ops_stock_items: [
      { id: "u1", unit_code: "U-1", po_no: "PO-1", qty: 1, sku: "sofa:Muro-K" },
    ],
  };
  vi.mocked(userClient).mockReturnValue({
    from: (table: string) => {
      const q: any = {
        select: () => q,
        order: () => q,
        range: async (start: number) => ({
          data: start === 0 ? rows[table] ?? [] : [],
          error: null,
        }),
      };
      return q;
    },
  } as never);
}

describe("GET warehouse/inbound — arrival source facts", () => {
  it("returns each PO's OWN ordered lines, keeping two products apart", async () => {
    dbWithOnePo();
    const body = (await (await app().request("/inbound")).json()) as {
      sourceFacts: Array<{
        sourceId: string;
        dateStatus: string | null;
        lines: Array<{ id: string; sku: string | null; qty: number }>;
      }>;
    };
    expect(body.sourceFacts).toHaveLength(1);
    const [fact] = body.sourceFacts;
    expect(fact.sourceId).toBe("PO-1");
    expect(fact.lines).toEqual([
      { id: "line-1", sku: "sofa:Muro-K", qty: 1 },
      { id: "line-2", sku: "bedframe:Jager-Q", qty: 2 },
      { id: "line-3", sku: "sofa:NoModel-K", qty: 1 },
    ]);
  });

  it("calls a bare eta_date EXPECTED — a date alone is not an agreement", async () => {
    dbWithOnePo();
    const body = (await (await app().request("/inbound")).json()) as {
      sourceFacts: Array<{ dateStatus: string | null }>;
    };
    expect(body.sourceFacts[0].dateStatus).toBe("expected");
  });

  it("calls an EVIDENCED supplier reply SCHEDULED", async () => {
    dbWithOnePo([
      {
        id: "p1",
        po_id: "PO-1",
        po_version: 1,
        kind: "tomorrow_delivery",
        answer: "confirmed",
        new_date: "2026-09-22",
        about_date: null,
        previous_date: null,
        reason: null,
        channel: "whatsapp",
        recipient: "Ohana group",
        evidence: "shot.png",
        reported_by: "Lim",
        reported_at: "2026-09-11T02:00:00Z",
        recorded_by: "user-1",
        recorded_at: "2026-09-11T03:00:00Z",
      },
    ]);
    const body = (await (await app().request("/inbound")).json()) as {
      sourceFacts: Array<{ dateStatus: string | null }>;
    };
    expect(body.sourceFacts[0].dateStatus).toBe("scheduled");
  });

  it("keeps the facts scoped to the sources this page returned", async () => {
    dbWithOnePo();
    const body = (await (await app().request("/inbound?source=PO-MISSING")).json()) as {
      arrivals: unknown[];
      sourceFacts: unknown[];
    };
    /* No arrangement on this page means no facts about one — the field never
       describes a scope the rows beside it do not contain. */
    expect(body.arrivals).toEqual([]);
    expect(body.sourceFacts).toEqual([]);
  });
});

/**
 * PRODUCTION ACCEPTANCE, 2026-09-14 — ten lines that all read "King".
 *
 * `PO-20260903-7907` rendered ten rows saying only `King` or `Queen`, because
 * this handler mapped the product name to `product_skus.variant` and never
 * read the model. A size is not a product: that PO carried `B1201S King`,
 * `H1401S King` and `S1601F King`, and on the board they were three identical
 * rows. The model name is the authoritative half and it was simply not read.
 */
function dbWithModels() {
  const rows: Record<string, unknown[]> = {
    purchase_orders: [
      {
        id: "PO-1",
        version: 1,
        supplier_id: "sup-1",
        warehouse_id: "site-1",
        destination_id: null,
        status: "open",
        official_delivery_date: null,
        eta_date: "2026-09-21",
        placed_at: "2026-09-01",
        so: 1362,
      },
    ],
    warehouses: [{ id: "site-1", name: "Carres Klang" }],
    suppliers: [{ id: "sup-1", name: "Ohana" }],
    purchase_order_lines: [
      { id: "l1", po_id: "PO-1", qty: 1, destination_id: null, sku: "B1201S-K" },
      { id: "l2", po_id: "PO-1", qty: 2, destination_id: null, sku: "H1401S-K" },
      { id: "l3", po_id: "PO-1", qty: 1, destination_id: null, sku: "NO-MODEL-K" },
    ],
    product_skus: [
      { id: "s1", sku: "B1201S-K", variant: "King", model_id: "m1" },
      { id: "s2", sku: "H1401S-K", variant: "King", model_id: "m2" },
      { id: "s3", sku: "NO-MODEL-K", variant: "King", model_id: null },
    ],
    product_models: [
      { id: "m1", name: "B1201S" },
      { id: "m2", name: "H1401S" },
    ],
  };
  vi.mocked(userClient).mockReturnValue({
    from: (table: string) => {
      const q: any = {
        select: () => q,
        order: () => q,
        range: async (start: number) => ({
          data: start === 0 ? rows[table] ?? [] : [],
          error: null,
        }),
      };
      return q;
    },
  } as never);
}

describe("GET warehouse/inbound — product identity", () => {
  it("names a product MODEL + VARIANT, never the size on its own", async () => {
    dbWithModels();
    const body = (await (await app().request("/inbound")).json()) as {
      arrivals: Array<{
        products: Array<{ sku: string | null; name: string | null }>;
      }>;
    };
    const named = new Map(
      body.arrivals.flatMap((r) =>
        r.products.map((p) => [p.sku, p.name] as const),
      ),
    );
    expect(named.get("B1201S-K")).toBe("B1201S King");
    expect(named.get("H1401S-K")).toBe("H1401S King");
    /* Two DIFFERENT products that both used to read `King`. */
    expect(named.get("B1201S-K")).not.toBe(named.get("H1401S-K"));
  });

  it("falls back to the variant when a SKU carries no model — never invents one", async () => {
    dbWithModels();
    const body = (await (await app().request("/inbound")).json()) as {
      arrivals: Array<{
        products: Array<{ sku: string | null; name: string | null }>;
      }>;
    };
    const named = new Map(
      body.arrivals.flatMap((r) =>
        r.products.map((p) => [p.sku, p.name] as const),
      ),
    );
    expect(named.get("NO-MODEL-K")).toBe("King");
  });
});

describe("GET warehouse/inbound — the catalog's own category", () => {
  it("carries product_models.category per SKU, scoped to the page", async () => {
    dbWithOnePo();
    const body = (await (await app().request("/inbound")).json()) as {
      skuCategories: Array<{ sku: string; category: string | null }>;
    };
    const bySku = new Map(body.skuCategories.map((r) => [r.sku, r.category]));
    /* The ladder can only reach the catalog rung if this field exists. Without
       it every `5539-*` sofa on the live surface reads `Other goods`. */
    expect(bySku.get("sofa:Muro-K")).toBe("sofa");
    expect(bySku.get("bedframe:Jager-Q")).toBe("bedframe");
    // A SKU no arrangement on this page mentions is not described.
    expect(bySku.has("mattress:Unrelated-Q")).toBe(false);
  });

  it("reports a catalog SILENCE as null, never as a guess", async () => {
    dbWithOnePo();
    const body = (await (await app().request("/inbound")).json()) as {
      skuCategories: Array<{ sku: string; category: string | null }>;
    };
    const row = body.skuCategories.find((r) => r.sku === "sofa:NoModel-K");
    expect(row).toBeDefined();
    expect(row!.category).toBeNull();
  });
});
