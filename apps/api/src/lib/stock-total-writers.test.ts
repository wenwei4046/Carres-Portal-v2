/**
 * 【DELIVERY】 CARD 21 — NO WRITER MAY STORE A SECOND STOCK QUANTITY TRUTH.
 *
 * Since 0366 `stock_balances.qty` / `.reserved` are derived from the unit
 * register by the rollup triggers (which run under `carres.stock_rollup`);
 * 0501 dropped the three legacy doors that still wrote them by hand. This
 * suite is the negative regression: a future migration that re-creates one
 * of those names, or writes a total by hand outside the rollup guard, fails
 * here before it reaches the database.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS = path.resolve(__dirname, "../../../../supabase/migrations");
const RETIRED = ["operation_warehouse_pick", "_operation_reserve_order", "operation_receive_po_line"];
const RETIRED_AT = 501;

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

describe("stock totals are derived, never written (0366 · 0501)", () => {
  it("0501 exists and drops the three retired writers", () => {
    const m = migrations().find((x) => x.n === RETIRED_AT);
    expect(m, "0501 must be in the repository").toBeTruthy();
    for (const name of RETIRED) {
      expect(m!.sql).toMatch(new RegExp(`drop function if exists public\\.${name}\\(`));
    }
  });

  it("no migration after 0501 re-creates a retired writer", () => {
    const offenders = migrations()
      .filter((m) => m.n > RETIRED_AT)
      .filter((m) => RETIRED.some((name) => new RegExp(`function\\s+(public\\.)?${name}\\s*\\(`, "i").test(m.sql)))
      .map((m) => m.file);
    expect(offenders).toEqual([]);
  });

  it("no migration after the retirement writes stock_balances.qty or .reserved by hand outside the rollup guard", () => {
    /* Files between 0366 and 0501 are history the database already holds (0500
       re-pins search_path on hundreds of live bodies, guard included); the
       runtime guard is 0366's trigger. This scan keeps the door from returning. */
    const offenders: string[] = [];
    for (const m of migrations()) {
      if (m.n <= RETIRED_AT) continue;
      const writes = /update\s+(public\.)?stock_balances\s+set[\s\S]{0,200}?\b(qty|reserved)\s*=/i.test(m.sql);
      const inserts = /insert\s+into\s+(public\.)?stock_balances\s*\([^)]*\b(qty|reserved)\b/i.test(m.sql);
      const guarded = /carres\.stock_rollup/.test(m.sql);
      if ((writes || inserts) && !guarded) offenders.push(m.file);
    }
    expect(offenders).toEqual([]);
  });

  it("no Worker route and no web door names a retired writer", () => {
    const roots = [path.resolve(__dirname, ".."), path.resolve(__dirname, "../../../web/src")];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const src = fs.readFileSync(full, "utf8");
          /* A quoted name is a call (`sb.rpc("…")`); a back-ticked one is prose in a comment. */
          if (RETIRED.some((name) => new RegExp(`["']${name}["']`).test(src))) offenders.push(full);
        }
      }
    };
    for (const root of roots) walk(root);
    expect(offenders).toEqual([]);
  });
});
