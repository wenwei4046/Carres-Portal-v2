import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * A REAL POSTGRES ON THE COMMITTED CONSTRAINT — "price not recorded" is a
 * STATE, not a zero (owner instruction 2026-09-23, migration 0565).
 *
 * The issue door may now place an order for a line whose Catalog price is not
 * recorded. That only works if the row it writes is legal, and legality here
 * is a CHECK constraint, not TypeScript: the API tests prove which payload the
 * route sends, and this one proves the database accepts exactly that shape and
 * still refuses the shapes that would be a claim.
 *
 * The constraint is EXECUTED from its committed migration (0337), so this test
 * cannot pass against SQL that is not the SQL production runs.
 *
 * ⛔ WHAT THIS DOES NOT CLAIM. It does not exercise `purchasing_issue_pos_batch`
 * end to end — that door needs the whole purchasing schema — so the behaviour
 * "an unpriced line reaches a real PO and spends no commercial approval" is
 * still owed by the authenticated production walk. 0565's own sanity block
 * pins the door's structure; this pins the row it writes.
 */
const MIGRATION = "supabase/migrations/0337_governed_batch_purchase_issue.sql";

/** Cut one statement out of a migration by its first and last line. Line
 *  endings are normalised first: a CRLF checkout must match the same anchor. */
function statement(rawSql: string, start: string, end: string) {
  const sql = rawSql.replace(/\r\n/g, "\n");
  const from = sql.indexOf(start);
  const to = sql.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing migration statement: ${start}`);
  return sql.slice(from, to + end.length);
}

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  /* The columns the constraint judges — the base table's own shape, kept to
     what this rule needs so the fixture cannot drift into a second schema. */
  await db.exec(`
    create table purchase_order_lines (
      id uuid primary key default gen_random_uuid(),
      sku text not null,
      qty int not null check (qty > 0),
      cost numeric(14,2),
      cost_source text,
      commercial_treatment text,
      commercial_reason text,
      constraint purchase_order_lines_cost_check check (cost is null or cost >= 0)
    );
  `);
  const sql = readFileSync(new URL(`../../../../${MIGRATION}`, import.meta.url), "utf8");
  await db.exec(
    statement(
      sql,
      "alter table public.purchase_order_lines\n  add constraint purchase_order_lines_commercial_treatment_allowed",
      "  );",
    ).replace(/public\./g, ""),
  );
});

afterAll(async () => {
  await db?.close();
});

async function insert(line: Record<string, unknown>) {
  const cols = ["sku", "qty", "cost", "cost_source", "commercial_treatment", "commercial_reason"];
  const values = cols.map((c) => (line[c] === undefined ? null : line[c]));
  return db.query(
    `insert into purchase_order_lines (${cols.join(", ")})
     values ($1, $2, $3, $4, $5, $6) returning id`,
    values,
  );
}

describe("a purchase order line whose price is not recorded", () => {
  it("⭐ IS LEGAL: no treatment, no cost, no cost source", async () => {
    await expect(insert({ sku: "5539-2NA", qty: 2 })).resolves.toBeTruthy();
  });

  it("a recorded price keeps every existing rule", async () => {
    await expect(
      insert({
        sku: "5539-2NA",
        qty: 1,
        cost: 850,
        cost_source: "catalog",
        commercial_treatment: "normal",
      }),
    ).resolves.toBeTruthy();
  });

  it("⛔ `normal` with NO cost is refused — a treatment is a claim about a number", async () => {
    await expect(
      insert({ sku: "5539-2NA", qty: 1, commercial_treatment: "normal" }),
    ).rejects.toThrow(/commercial_treatment_complete/);
  });

  it("⛔ free of charge still needs its zero AND its reason", async () => {
    await expect(
      insert({ sku: "5539-2NA", qty: 1, cost: 0, commercial_treatment: "free_of_charge" }),
    ).rejects.toThrow(/commercial_treatment_complete/);
    await expect(
      insert({
        sku: "5539-2NA",
        qty: 1,
        cost: 0,
        cost_source: "hand_entered",
        commercial_treatment: "free_of_charge",
        commercial_reason: "Replacement for a damaged unit",
      }),
    ).resolves.toBeTruthy();
  });

  it("⛔ and an absence is NOT a zero: a zero with no treatment is not a discount", async () => {
    /* `cost = 0` with no treatment passes the CHECK — the constraint judges
       the treatment, not the number — so the distinction the portal relies on
       is the one the ROUTE writes: absent price means all three facts absent.
       This test states that boundary rather than pretending the database
       enforces it. */
    await expect(insert({ sku: "5539-2NA", qty: 1, cost: 0 })).resolves.toBeTruthy();
  });
});
