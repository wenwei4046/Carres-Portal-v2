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
      unresolvedSources: [],
      page: { offset: 0, limit: 50, total: 0 },
      facets: {
        status: {
          all: 0,
          open: 0,
          expected: 0,
          "part-received": 0,
          received: 0,
          "with-issue": 0,
        },
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
