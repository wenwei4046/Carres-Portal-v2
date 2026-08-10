/**
 * A Stage 3 function may only read columns that exist.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BUG THIS IS THE ANSWER TO
 *
 * `sales_order_attribution_live` (0330) ordered by, and reported,
 * `order_change_requests.created_at`. The table has never had that column — it
 * stamps `requested_at`. Every call raised 42703, so
 * GET /api/operation/orders/:id/attribution answered 500 on every real order.
 *
 * Nothing caught it. `attribution-lane.test.ts` mocks the supabase client's
 * `rpc`, so it proved which function the door calls and with what — and could
 * not execute a line of the function body. plpgsql only parses a body at
 * creation; an unknown column surfaces at RUN time. The card's live evidence
 * exercised SUBMIT, APPROVE and APPLY and never called the READ.
 *
 * ── WHY IT READS THE MIGRATIONS, AND ONLY THE LIVE DEFINITION ──
 *
 * CI holds no database connection, so the committed snapshot is this test's
 * information_schema (the same bargain 3.1's exhaustiveness test makes).
 *
 * It resolves each function to the HIGHEST-numbered migration that defines it,
 * because a committed migration is never edited (red line 6): 0330 still
 * contains `v_req.created_at` and always will. What ships is whatever ran last
 * — 0335 — and that is what must be right.
 *
 * ── TWO SHAPES, AND THE FIRST DRAFT ONLY CAUGHT ONE ──
 *
 * `v_req` is declared `order_change_requests%rowtype`, so `v_req.<name>` is
 * exactly a column read. But the statement that ACTUALLY raised 42703 was
 * `order by created_at desc` — a BARE column inside the query against the
 * table. A guard that only knew the qualified shape passed happily when the
 * bug was put back, which is how this comment came to exist. Both shapes are
 * checked now, and the test below re-introduces each one to prove it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ORDER_CHANGE_REQUEST_COLUMNS } from "./sales-order-columns.snapshot";

const MIGRATIONS = join(import.meta.dirname ?? __dirname, "../../../supabase/migrations");

/** Every function whose body declares `v_req order_change_requests%rowtype`. */
const FUNCTIONS = [
  "sales_order_submit_attribution",
  "sales_order_decide_attribution",
  "sales_order_apply_attribution",
  "sales_order_attribution_live",
];

/** The text of the LAST migration that defines this function — what ships. */
function liveDefinitionOf(fn: string): { file: string; body: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // 0329 < 0330 < 0335 — zero-padded, so lexical order is numeric
  let found: { file: string; body: string } | null = null;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    const marker = `create or replace function public.${fn}(`;
    const at = sql.indexOf(marker);
    if (at === -1) continue;
    /* From this definition to the start of the next one (or end of file). */
    const rest = sql.slice(at + marker.length);
    const nextDef = rest.indexOf("create or replace function");
    found = { file, body: nextDef === -1 ? rest : rest.slice(0, nextDef) };
  }
  if (!found) throw new Error(`no migration defines ${fn}`);
  return found;
}

/** SQL words and local/parameter names that are not column references. */
const NOT_A_COLUMN = new Set([
  "select", "from", "where", "and", "or", "not", "order", "by", "desc", "asc",
  "limit", "into", "for", "update", "set", "null", "is", "in", "as", "on",
  "insert", "values", "returning", "delete", "exists", "case", "when", "then",
  "else", "end", "true", "false", "public", "order_change_requests", "coalesce",
  "nullif", "trim", "now", "auth", "uid", "distinct",
]);

/** Every column of `order_change_requests` a definition names, both shapes. */
function columnsRead(body: string): string[] {
  const qualified = [...body.matchAll(/v_req\.([a-z_]+)/g)].map((m) => m[1]!);

  /* Bare columns inside statements that query the table: take each
   * `from order_change_requests …` clause up to its terminating semicolon and
   * read the identifiers out of it. `order by created_at desc` — the shape
   * that actually 500'd — lives here and nowhere else. */
  const bare: string[] = [];
  for (const m of body.matchAll(/from\s+order_change_requests([\s\S]*?);/g)) {
    const clause = m[1]!
      .replace(/'[^']*'/g, " ") // string literals are values, not columns
      .replace(/\b(p_|v_)[a-z_]+/g, " "); // parameters and locals
    for (const id of clause.matchAll(/\b([a-z][a-z_]*)\b/g)) {
      if (!NOT_A_COLUMN.has(id[1]!)) bare.push(id[1]!);
    }
  }
  return [...new Set([...qualified, ...bare])];
}

describe("the live definition of each Stage 3 request function", () => {
  for (const fn of FUNCTIONS) {
    it(`${fn} reads only real order_change_requests columns`, () => {
      const { file, body } = liveDefinitionOf(fn);
      const unknown = columnsRead(body).filter(
        (c) => !ORDER_CHANGE_REQUEST_COLUMNS.includes(c),
      );
      expect(
        unknown,
        `${file} reads order_change_requests.${unknown.join(", ")} — ` +
          `the table has: ${ORDER_CHANGE_REQUEST_COLUMNS.join(", ")}`,
      ).toEqual([]);
    });
  }

  it("catches BOTH shapes — the qualified read and the bare one", () => {
    /* The bug, put back both ways. Without this the guard could pass while
     * the exact defect it was written for shipped again. */
    const bareBug = "select * from order_change_requests where id = p_id order by created_at desc;";
    expect(columnsRead(bareBug)).toContain("created_at");

    const qualifiedBug = "v_out := jsonb_build_object('at', v_req.created_at);";
    expect(columnsRead(qualifiedBug)).toContain("created_at");

    /* And it must not cry wolf on the real thing. */
    const good = "select * from order_change_requests where order_id = p_order_id order by requested_at desc;";
    expect(columnsRead(good).filter((c) => !ORDER_CHANGE_REQUEST_COLUMNS.includes(c))).toEqual([]);
  });

  it("resolves to the SUPERSEDING migration, not the first one that defined it", () => {
    /* The guard's own assumption, asserted: 0330 shipped the bad column and
     * must stay untouched, so a test that scanned every migration would fail
     * forever and get deleted. It has to follow the definition that ships. */
    const live = liveDefinitionOf("sales_order_attribution_live");
    expect(live.file).toMatch(/^0335_/);
    const zero = readFileSync(
      join(MIGRATIONS, "0330_the_approver_can_see_what_they_are_approving.sql"),
      "utf8",
    );
    expect(zero, "0330 keeps its history — a committed migration is never edited").toMatch(
      /v_req\.created_at/,
    );
  });
});
