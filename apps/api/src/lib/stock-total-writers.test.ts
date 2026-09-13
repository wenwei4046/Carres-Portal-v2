/**
 * 【DELIVERY】 CARD 21 — NO WRITER MAY STORE A SECOND STOCK QUANTITY TRUTH.
 *
 * Since 0366 `stock_balances.qty` / `.reserved` are derived from the unit
 * register by the rollup triggers (which run under `carres.stock_rollup`);
 * 0499 dropped the three legacy doors that still wrote them by hand. This
 * suite is the negative regression: a future migration that re-creates one
 * of those names, or writes a total by hand outside the rollup guard, fails
 * here before it reaches the database.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS = path.resolve(__dirname, "../../../../supabase/migrations");
const RETIRED = ["operation_warehouse_pick", "_operation_reserve_order", "operation_receive_po_line"];
const DERIVED_SINCE = 366;
const RETIRED_AT = 499;

function numberOf(file: string): number {
  const m = /^(\d{4})_/.exec(file);
  return m ? Number(m[1]) : -1;
}

function migrations(): Array<{ file: string; n: number; sql: string }> {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((file) => ({ file, n: numberOf(file), sql: fs.readFileSync(path.join(MIGRATIONS, file), "utf8") }));
}

describe("stock totals are derived, never written (0366 · 0499)", () => {
  it("0499 exists and drops the three retired writers", () => {
    const m = migrations().find((x) => x.n === RETIRED_AT);
    expect(m, "0499 must be in the repository").toBeTruthy();
    for (const name of RETIRED) {
      expect(m!.sql).toMatch(new RegExp(`drop function if exists public\\.${name}\\(`));
    }
  });

  it("no migration after 0499 re-creates a retired writer", () => {
    const offenders = migrations()
      .filter((m) => m.n > RETIRED_AT)
      .filter((m) => RETIRED.some((name) => new RegExp(`function\\s+(public\\.)?${name}\\s*\\(`, "i").test(m.sql)))
      .map((m) => m.file);
    expect(offenders).toEqual([]);
  });

  it("no migration after 0366 writes stock_balances.qty or .reserved by hand outside the rollup guard", () => {
    const offenders: string[] = [];
    for (const m of migrations()) {
      if (m.n <= DERIVED_SINCE || m.n === RETIRED_AT) continue;
      const writes = /update\s+(public\.)?stock_balances\s+set[\s\S]{0,200}?\b(qty|reserved)\s*=/i.test(m.sql);
      const inserts = /insert\s+into\s+(public\.)?stock_balances\s*\([^)]*\b(qty|reserved)\b/i.test(m.sql);
      const guarded = /carres\.stock_rollup/.test(m.sql);
      if ((writes || inserts) && !guarded) offenders.push(m.file);
    }
    expect(offenders).toEqual([]);
  });
});
