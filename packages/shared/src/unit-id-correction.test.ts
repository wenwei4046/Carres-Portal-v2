import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ⭐ THE UNIT ID CORRECTION — Purchasing CARD 10, second pass · migration 0453.
 *
 * Card 10 closed the PO birth (0442 · 0443 · 0444) and operators still saw
 * lowercase `id-…` codes. Four doors were still open, and this scan holds the
 * committed file's contract for closing every one of them:
 *
 *   1 the column DEFAULT that keyed a row by omission
 *   2 `ops_stock_book_in_units`, which named no unit_code at all
 *   3 the four receiving mints that keyed a counted row like an identity
 *   4 a CHECK that still blessed the legacy shape for a NEW row
 *
 * It also holds the thing that matters most: THIS FILE REWRITES NO ROW. The
 * 140 historical codes are on labels and on supplier PDFs, and a migration
 * that "tidies" them destroys the only link between paper and record.
 *
 * Comments are stripped before every FORBIDDEN check, so a sentence explaining
 * a rule cannot fail its own test.
 */
const MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
);

const read = (prefix: string): string => {
  const name = readdirSync(MIGRATIONS).find((f) => f.startsWith(prefix));
  expect(name, `no migration starting ${prefix}`).toBeTruthy();
  return readFileSync(join(MIGRATIONS, name!), "utf8");
};
const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");

const FIX = read("0453_");
const CODE = strip(FIX);

/** The body of one `create [or replace] function public.<name>(` … `$…$;`. */
function fn(sql: string, name: string): string {
  const start = sql.search(
    new RegExp(`create (or replace )?function public\\.${name}\\(`),
  );
  expect(start, `${name} is not defined`).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.search(/\$(function|fn)\$;/);
  expect(end, `${name} has no terminator`).toBeGreaterThan(-1);
  return rest.slice(0, end);
}

describe("0453 · the legacy generator has no producer left", () => {
  it("drops gen_unit_code() outright", () => {
    expect(CODE).toMatch(/drop function if exists public\.gen_unit_code\(\)/);
  });

  it("drops the column DEFAULT, so nothing is keyed by omission", () => {
    expect(CODE).toMatch(
      /alter table public\.ops_stock_items alter column unit_code drop default/,
    );
  });

  it("never uses it as a VALUE again — the exact defect shape is gone", () => {
    // The defect read `(public.gen_unit_code(), v_sku, v_site, …)`.
    expect(CODE).not.toMatch(/public\.gen_unit_code\(\)\s*,/);
    // and it is not selected, defaulted or assigned anywhere either
    expect(CODE).not.toMatch(/default\s+(public\.)?gen_unit_code\(\)/i);
    expect(CODE).not.toMatch(/(select|=)\s+public\.gen_unit_code\(\)/i);
  });

  it("mentions it only to remove it or to assert it is gone", () => {
    const lines = CODE.split("\n").filter((l) => l.includes("gen_unit_code"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const legitimate =
        /drop function if exists public\.gen_unit_code\(\)/.test(line) ||
        /proname = 'gen_unit_code'/.test(line) ||
        /raise exception/.test(line) ||
        /pg_get_functiondef/.test(line) ||
        /^\s*'0453 —/.test(line); // the constraint's own documentation
      expect(legitimate, `unexpected gen_unit_code use: ${line.trim()}`).toBe(true);
    }
  });

  it("proves its own claims before it commits", () => {
    expect(CODE).toMatch(/0453 sanity: gen_unit_code\(\) still exists/);
    expect(CODE).toMatch(/0453 sanity: unit_code still has a DEFAULT/);
    expect(CODE).toMatch(/still call gen_unit_code\(\)/);
  });
});

describe("0453 · a counted row is KEYED, an exact unit is IDENTIFIED", () => {
  it("mints a key that cannot be mistaken for a Unit ID", () => {
    const body = fn(FIX, "gen_quantity_key");
    expect(body).toMatch(/'QTY-'/);
    expect(body).not.toMatch(/'id-'/);
  });

  it("keeps the key away from every client role", () => {
    expect(CODE).toMatch(
      /revoke all on function public\.gen_quantity_key\(\)\s+from public, anon, authenticated, service_role/,
    );
  });

  it("keys every receiving bulk row with it — all four sites", () => {
    const sites = CODE.match(/public\.gen_quantity_key\(\)/g) ?? [];
    // 4 bulk-row mints (3 in the receive engine, 1 in the amendment) + the
    // book-in door's counted branch.
    expect(sites.length).toBeGreaterThanOrEqual(5);
  });

  it("gives the book-in door a REAL identity for one piece, a key for many", () => {
    const body = fn(FIX, "ops_stock_book_in_units");
    expect(body).toMatch(/public\.allocate_unit_id\(\)/);
    expect(body).toMatch(/public\.gen_quantity_key\(\)/);
    // it must name unit_code explicitly — relying on a DEFAULT was the defect
    expect(body).toMatch(/\(unit_code, identity_scope,/);
  });
});

describe("0453 · the rule every future door inherits", () => {
  it("refuses a new exact unit that is not a Carres Unit ID", () => {
    const body = fn(FIX, "trg_stock_unit_code_matches_scope");
    expect(body).toMatch(/identity_scope = 'unit'/);
    expect(body).toMatch(/unit_needs_locked_identity/);
    expect(body).toMatch(/U\\d\+-\\d\{3\}-\\d\{3\}/);
  });

  it("refuses a new counted row that wears an identity", () => {
    const body = fn(FIX, "trg_stock_unit_code_matches_scope");
    expect(body).toMatch(/quantity_takes_no_identity/);
  });

  it("fires on INSERT ONLY, so a historical row stays updatable", () => {
    expect(CODE).toMatch(
      /create trigger trg_stock_unit_code_matches_scope\s+before insert on public\.ops_stock_items/,
    );
    expect(CODE).not.toMatch(/before insert or update on public\.ops_stock_items/);
  });
});

describe("0453 · history is preserved, not tidied", () => {
  it("REWRITES NO ROW — no top-level UPDATE, DELETE or TRUNCATE", () => {
    // Statements inside a function body are runtime behaviour and are indented;
    // a migration-time rewrite would sit at column 0.
    const topLevel = CODE.split("\n").filter((l) =>
      /^(update|delete\s+from|truncate)\b/i.test(l),
    );
    expect(topLevel).toEqual([]);
  });

  it("never bulk-uppercases or renumbers an existing code", () => {
    expect(CODE).not.toMatch(/set\s+unit_code\s*=/i);
    expect(CODE).not.toMatch(/upper\(\s*unit_code\s*\)/i);
  });

  it("keeps the legacy shape valid so a label stays readable", () => {
    expect(CODE).toMatch(/\^id-\[a-z\]\{3\}\[0-9\]\{6\}\$/);
  });

  it("asserts no production ROW COUNT (red line 8)", () => {
    // A migration owns schema. Data is what it walks past.
    expect(CODE).not.toMatch(/<>\s*140/);
    expect(CODE).not.toMatch(/count\(\*\)\s+into\s+v_n\s+from\s+public\.ops_stock_items/);
  });
});

describe("0453 · the surfaces can tell an identity from a key", () => {
  it("exposes identity_scope on both register views", () => {
    expect(CODE).toMatch(
      /create or replace view public\.stock_unit_availability_v[\s\S]*identity_scope/,
    );
    expect(CODE).toMatch(
      /create or replace view public\.stock_unit_register_v[\s\S]*v\.identity_scope/,
    );
  });

  it("checks the view actually gained the column before committing", () => {
    expect(CODE).toMatch(
      /0453 sanity: stock_unit_register_v does not expose identity_scope/,
    );
  });
});

describe("0453 · the receive engine keeps its guard and loses its public grant", () => {
  it("still refuses a caller who may not receive", () => {
    const body = fn(FIX, "operation_receive_po_with_do");
    expect(body).toMatch(/v_role := public\.app_role\(\)/);
    expect(body).toMatch(/42501/);
  });

  it("does not hand a re-created function to anon", () => {
    expect(CODE).toMatch(
      /revoke all on function public\.operation_receive_po_with_do\(text, text, text, jsonb, uuid\)\s+from public, anon/,
    );
  });
});
