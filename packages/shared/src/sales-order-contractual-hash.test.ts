/**
 * 3.5 · ONE LIST, TWO RUNTIMES — held mechanically.
 *
 * `base_contractual_hash` decides whether a customer's acceptance still stands
 * (GATE 4's new floor). It is computed in SQL because staleness must be judged
 * atomically at APPLY, with the row locked. But the AUTHORITY on what "the
 * contract" is stays `CLASS_A_FIELDS` in this package, because 3.1's build-time
 * exhaustiveness test lives here.
 *
 * Two runtimes genuinely need the same constant, so the risk is not that
 * either is wrong today — it is that one of them changes alone. If a later
 * card adds `warranty_term` to CLASS_A_FIELDS and forgets the hash, the
 * hash silently stops covering a contractual field, and a customer's
 * acceptance of an old document would apply on top of a changed contract:
 * exactly the failure the hash exists to prevent.
 *
 * So this test reads the migration and compares. It needs no database — the
 * migration file IS the deployed definition, and a drift fails the build.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLASS_A_FIELDS } from "./sales-order-classification";

/** The migration that declares `sales_order_contractual_fields()`. */
function contractualFieldsFromMigration(): string[] {
  const dir = join(import.meta.dirname ?? __dirname, "../../../supabase/migrations");
  const file = readdirSync(dir).find((f) => f.includes("the_amendment_binds_the_contract"));
  expect(file, "the 3.5 amendment migration must exist").toBeTruthy();
  const sql = readFileSync(join(dir, file!), "utf8");
  /* Anchored on the DECLARATION, not on the bare name: the name also appears
   * in this migration's own header comment and in its GRANT, and splitting on
   * it landed in the comment — which parsed to an empty list and made the
   * guard pass vacuously in the wrong direction. */
  const fn = sql.split("create or replace function public.sales_order_contractual_fields()")[1] ?? "";
  const start = fn.indexOf("select array[");
  expect(start, "the function must still be a literal array this test can read").toBeGreaterThan(-1);
  const body = fn.slice(start, fn.indexOf("]", start));
  return [...body.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]!);
}

describe("3.5 · the SQL hash covers exactly the Class A allowlist", () => {
  it("names the same fields as CLASS_A_FIELDS, no more and no fewer", () => {
    const inSql = new Set(contractualFieldsFromMigration());
    const inTs = new Set(CLASS_A_FIELDS);

    const missingFromSql = [...inTs].filter((f) => !inSql.has(f)).sort();
    const extraInSql = [...inSql].filter((f) => !inTs.has(f)).sort();

    /* Named rather than counted: a failure must say WHICH field drifted, or
     * the next reader has to diff two lists by eye. */
    expect(
      missingFromSql,
      `CLASS_A_FIELDS names these, the contractual hash does not cover them: ${missingFromSql.join(", ")}`,
    ).toEqual([]);
    expect(
      extraInSql,
      `the contractual hash covers these, CLASS_A_FIELDS does not name them: ${extraInSql.join(", ")}`,
    ).toEqual([]);
  });

  it("covers no Class B field — a correction must never make an amendment stale", () => {
    const inSql = contractualFieldsFromMigration();
    /* This is the whole reason the hash is Class-A-only: a phone-number fix
     * while the customer holds the document must not invalidate it. */
    expect(inSql.some((f) => f.startsWith("orders.customer_"))).toBe(false);
    expect(inSql).not.toContain("orders.proceed_date");
    expect(inSql).not.toContain("orders.salesperson_id");
  });
});
