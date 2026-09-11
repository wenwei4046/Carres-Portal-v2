import { describe, it, expect } from "vitest";
/* Repository tooling, plain `.mjs` run by node in CI. Typed at the boundary here,
   the same way migration-gate.test.ts types migration-collisions.mjs. */
// @ts-expect-error -- untyped .mjs tooling module
import * as replay from "../../../scripts/migration-replay.mjs";

type ParsedError = { sqlstate: string | null; message: string; line: number | null; context: string | null };
type Result = { file: string; ok: boolean; error: ParsedError | null; cascadeOf?: string | null };
const {
  orderMigrations,
  parseError,
  needsNonTransactionalRetry,
  createdObjects,
  missingObject,
  attributeCascades,
  compareToBaseline,
  parseFixtures,
} = replay as {
  orderMigrations: (files: string[]) => string[];
  parseError: (stderr: string) => ParsedError;
  needsNonTransactionalRetry: (stderr: string) => boolean;
  createdObjects: (sql: string) => Record<"relation" | "type" | "function" | "column" | "constraint", Set<string>>;
  missingObject: (message: string) => { kind: string; name: string } | null;
  attributeCascades: (results: Result[], sqlOf: (file: string) => string) => Result[];
  compareToBaseline: (results: Result[], baseline: string[]) => { unexpected: string[]; nowPass: string[] };
  parseFixtures: (text: string) => Array<{ before: string; sql: string }>;
};

/** Tests for the helpers behind scripts/dry-run-migrations.mjs. */

const err = (message: string): ParsedError => ({ sqlstate: null, message, line: null, context: null });

describe("orderMigrations", () => {
  it("keeps only migration files, and puts 0398_ before 0398a_", () => {
    expect(orderMigrations(["0398a_b.sql", "README.md", "0398_a.sql", "0001_init.sql"])).toEqual([
      "0001_init.sql",
      "0398_a.sql",
      "0398a_b.sql",
    ]);
  });
});

describe("parseError", () => {
  it("reads the SQLSTATE, message, line and PL/pgSQL context from verbose psql output", () => {
    const stderr = [
      "psql:C:/x/0463_customer_money.sql:932: ERROR:  P0001: 0463 sanity: _customer_payment_post lost its signature",
      "CONTEXT:  PL/pgSQL function inline_code_block line 25 at RAISE",
      "LOCATION:  exec_stmt_raise, pl_exec.c:3911",
    ].join("\n");
    expect(parseError(stderr)).toEqual({
      sqlstate: "P0001",
      message: "0463 sanity: _customer_payment_post lost its signature",
      line: 932,
      context: "PL/pgSQL function inline_code_block line 25 at RAISE",
    });
  });

  it("still returns something readable when there is no ERROR line", () => {
    expect(parseError("could not connect to server").message).toBe("could not connect to server");
  });
});

describe("needsNonTransactionalRetry", () => {
  it("is true for an enum value used in the transaction that added it", () => {
    expect(needsNonTransactionalRetry('ERROR:  55P04: unsafe use of new value "void" of enum type pay_state')).toBe(true);
  });
  it("is true for CREATE INDEX CONCURRENTLY", () => {
    expect(needsNonTransactionalRetry("ERROR:  25001: CREATE INDEX CONCURRENTLY cannot run inside a transaction block")).toBe(true);
  });
  it("is false for an ordinary error", () => {
    expect(needsNonTransactionalRetry('ERROR:  42P01: relation "x" does not exist')).toBe(false);
  });
});

describe("createdObjects", () => {
  const sql = `
    -- create table not_this_one (comment)
    create table if not exists public.ops_stock_items (id uuid primary key, unit_id text, constraint ok_unit unique (unit_id));
    create or replace view stock_unit_availability_v as select 1;
    create type public.po_state as enum ('a');
    create or replace function public.operation_create_po(p uuid) returns void language sql as $$ select 1 $$;
    alter table orders add column if not exists ops_assigned_logistic text;
    alter table purchasing_old rename to purchasing_settings;
  `;
  const got = createdObjects(sql);

  it("finds tables, views, types, functions and added columns", () => {
    expect([...got.relation]).toEqual(expect.arrayContaining(["ops_stock_items", "stock_unit_availability_v", "purchasing_settings"]));
    expect(got.type.has("po_state")).toBe(true);
    expect(got.function.has("operation_create_po")).toBe(true);
    expect(got.column.has("ops_assigned_logistic")).toBe(true);
    expect(got.constraint.has("ok_unit")).toBe(true);
  });
  it("counts a table as a type too (every table has a row type)", () => {
    expect(got.type.has("ops_stock_items")).toBe(true);
  });
  it("counts columns declared inside create table", () => {
    expect(got.column.has("unit_id")).toBe(true);
  });
  it("ignores SQL inside comments", () => {
    expect(got.relation.has("not_this_one")).toBe(false);
  });
});

describe("missingObject", () => {
  it.each([
    ['relation "public.ops_stock_items" does not exist', { kind: "relation", name: "ops_stock_items" }],
    ['type "purchase_demands" does not exist', { kind: "type", name: "purchase_demands" }],
    ["function public.purchasing_po_actor() does not exist", { kind: "function", name: "purchasing_po_actor" }],
    ["column o.ops_assigned_logistic does not exist", { kind: "column", name: "ops_assigned_logistic" }],
    ['column "req_no" of relation "purchase_requests" does not exist', { kind: "column", name: "req_no" }],
    ['constraint "po_promise_answer_allowed" of relation "po_supplier_promises" does not exist', { kind: "constraint", name: "po_promise_answer_allowed" }],
  ])("%s", (message, expected) => {
    expect(missingObject(message)).toEqual(expected);
  });
  it("is null for an error that is not about a missing object", () => {
    expect(missingObject("0437 requires Khor Yee, Yu Jun and Shasha accounts")).toBeNull();
  });
});

describe("attributeCascades", () => {
  const sql: Record<string, string> = {
    "0137_stock.sql": "create table ops_stock_items (id uuid);",
    "0150_rename.sql": "update ops_stock_items set x = 1;",
    "0153_unit.sql": "alter table ops_stock_items add column unit_id text;",
    "0160_other.sql": "select 1;",
  };
  const results: Result[] = [
    { file: "0137_stock.sql", ok: false, error: err("Carres Klang warehouse not found") },
    { file: "0140_fine.sql", ok: true, error: null },
    { file: "0150_rename.sql", ok: false, error: err('relation "ops_stock_items" does not exist') },
    { file: "0153_unit.sql", ok: false, error: err('relation "public.ops_stock_items" does not exist') },
    { file: "0160_other.sql", ok: false, error: err('relation "never_made" does not exist') },
  ];
  const out = attributeCascades(results, (f) => sql[f] ?? "");

  it("leaves the first failure as a root", () => {
    expect(out[0]!.cascadeOf).toBeNull();
  });
  it("blames a later failure on the earlier failed file that creates what it needs", () => {
    expect(out[2]!.cascadeOf).toBe("0137_stock.sql");
  });
  it("points a chain of knock-ons back to the original root, not the middle link", () => {
    expect(out[3]!.cascadeOf).toBe("0137_stock.sql");
  });
  it("keeps a failure as a root when no earlier failure explains it", () => {
    expect(out[4]!.cascadeOf).toBeNull();
  });
});

describe("parseFixtures", () => {
  it("splits the file at each @before marker and drops the header above the first", () => {
    const text = [
      "-- header comment",
      "-- @before 0032_suppliers_slug",
      "insert into suppliers (name) values ('A');",
      "-- @before 0136_orders",
      "insert into warehouses (name) values ('B');",
    ].join("\n");
    expect(parseFixtures(text)).toEqual([
      { before: "0032_suppliers_slug", sql: "insert into suppliers (name) values ('A');\n" },
      { before: "0136_orders", sql: "insert into warehouses (name) values ('B');\n" },
    ]);
  });
});

describe("compareToBaseline", () => {
  const results: Result[] = [
    { file: "a.sql", ok: false, error: err("x") },
    { file: "b.sql", ok: true, error: null },
    { file: "c.sql", ok: false, error: err("y") },
  ];
  it("reports failures not on the list, and listed files that now pass", () => {
    expect(compareToBaseline(results, ["a.sql", "b.sql", "not-run.sql"])).toEqual({
      unexpected: ["c.sql"],
      nowPass: ["b.sql"],
    });
  });
});
