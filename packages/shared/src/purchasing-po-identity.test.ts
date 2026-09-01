import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE LOCKED IDENTITIES (`docs/purchasing/MASTER.md` §6.1 · §6.2;
 * CARD-2026-08-22-purchasing-02 closure §5; migrations 0381 · 0382).
 *
 * ── WHY THIS IS A SQL SCAN AND NOT A UNIT TEST ──────────────────────────────
 *
 * Both allocators are database functions, because both must be safe under
 * concurrency and neither may be reachable from a browser. There is nothing in
 * TypeScript to call. What CAN be held is the CONTRACT: the shapes, the
 * uniqueness that makes them true, and the promise that no existing identity is
 * renumbered. A refactor that quietly restores `max(seq) + 1` fails here.
 *
 * It lives in `packages/shared` for the same reason `migration-gate.test.ts`
 * does: that is the workspace `pnpm test` already runs.
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

const ALLOCATORS = read("0381_");
const CREATION = read("0382_");

/* A scan that reads its own comments fails on the sentence explaining the rule
   (the D0.5b lesson). Both directions are needed: the SOURCE for strings the
   Law requires, the CODE for constructs it forbids. */
const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");
const ALLOCATORS_CODE = strip(ALLOCATORS);
const CREATION_CODE = strip(CREATION);

describe("the PO number is PREFIX-YYYYMMDD-RRRR and leaks no volume", () => {
  it("draws the visible code AT RANDOM, never counting up", () => {
    expect(ALLOCATORS).toMatch(/floor\(random\(\) \* 10000\)/);
    /* ⭐ THE DEFECT THIS REPLACES. `max(seq) + 1` tells any supplier holding
       two of our purchase orders how much Carres bought in between. */
    expect(ALLOCATORS_CODE).not.toMatch(/max\(\s*seq\s*\)/i);
    expect(ALLOCATORS_CODE).not.toMatch(/nextval/i);
  });

  it("prints four digits after the date, padded", () => {
    expect(ALLOCATORS).toMatch(/lpad\(\(floor\(random\(\) \* 10000\)\)::int::text, 4, '0'\)/);
    expect(ALLOCATORS).toMatch(/to_char\(v_date, 'YYYYMMDD'\)/);
    expect(ALLOCATORS).toMatch(/format\('%s-%s-%s', p_prefix/);
  });

  it("is unique across PREFIXES for one day, so a PO and a GRN cannot share a tail", () => {
    /* Unique on (date, code) and NOT on (prefix, date, code): two documents
       whose visible tails match invite the reading §6.1 forbids. */
    expect(ALLOCATORS).toMatch(/primary key \(code_date, code\)/);
  });

  it("survives a race by drawing again, and never by reusing a number", () => {
    expect(ALLOCATORS).toMatch(/exception when unique_violation/);
    /* A day that is genuinely exhausted fails LOUDLY. Silently reusing a code
       would break the one law this function exists to keep. */
    expect(ALLOCATORS).toMatch(/document_code_pool_exhausted/);
  });

  it("keeps a cancelled number taken forever", () => {
    expect(ALLOCATORS).toMatch(/never deleted|never reused/i);
  });

  it("is the ONLY thing the creation helper uses to mint a PO id", () => {
    expect(CREATION).toMatch(/v_po_id := public\.allocate_formal_document_code\('PO'\)/);
    /* No counter anywhere near the identity. */
    expect(CREATION_CODE).not.toMatch(/max\(/);
    expect(CREATION_CODE).not.toMatch(/nextval/i);
  });
});

describe("the Unit ID is U1-000-001, allocated once and never reset", () => {
  it("formats three digits, a dash and three digits", () => {
    expect(ALLOCATORS).toMatch(/format\('U%s-%s-%s'/);
    expect(ALLOCATORS).toMatch(/lpad\(\(p_number \/ 1000\)::int::text, 3, '0'\)/);
    expect(ALLOCATORS).toMatch(/lpad\(\(p_number % 1000\)::int::text, 3, '0'\)/);
  });

  it("holds ONE row and locks it, so two receipts cannot mint one Unit ID", () => {
    expect(ALLOCATORS).toMatch(/create table if not exists public\.unit_id_series/);
    expect(ALLOCATORS).toMatch(/id boolean primary key default true check \(id\)/);
    expect(ALLOCATORS).toMatch(/update public\.unit_id_series/);
  });

  it("rolls U1-999-999 into U2-000-001 instead of stopping", () => {
    expect(ALLOCATORS).toMatch(/last_number >= 999999 then series \+ 1/);
  });

  it("is not reachable from a browser at all", () => {
    /* A new Supabase table inherits every grant to `authenticated` (the 0367
       lesson). The series is revoked; the FUNCTION is the only door. */
    expect(ALLOCATORS).toMatch(/revoke all on public\.unit_id_series from authenticated/);
    expect(ALLOCATORS).toMatch(/grant execute on function public\.allocate_unit_id\(\) to authenticated/);
  });

  it("starts ABOVE anything already minted, because existing units are not renumbered", () => {
    expect(ALLOCATORS).toMatch(/set last_number = greatest\(/);
    expect(ALLOCATORS).toMatch(/unit_code ~ '\^U\\d-\\d\{3\}-\\d\{3\}\$'/);
  });

  it("finds one Unit however it was typed", () => {
    /* `U1-000-001`, `U1-000001` and `U1000001` are the same Unit (§6.2). */
    expect(ALLOCATORS).toMatch(/normalise_unit_id/);
    expect(ALLOCATORS).toMatch(/regexp_replace\(coalesce\(p, ''\), '\[\^A-Za-z0-9\]', '', 'g'\)/);
  });

  it("mints one Unit per piece, for EVERY governed destination", () => {
    expect(CREATION).toMatch(/public\.allocate_unit_id\(\)/);
    /* One row per unit, not one per line — a line of three is three pieces. */
    expect(CREATION).toMatch(/from generate_series\(1, v_qty\)/);
  });
});

describe("every PO line remembers which customer order it is for", () => {
  it("stores the order, the SO number and the order line", () => {
    expect(CREATION).toMatch(/create table if not exists public\.po_line_sources/);
    for (const col of ["po_line_id", "order_id", "so", "order_line_id", "qty"]) {
      expect(CREATION, col).toContain(col);
    }
  });

  it("validates the lineage rather than trusting it", () => {
    /* A browser that could name a source could put one customer's goods on
       another customer's order. */
    expect(CREATION).toMatch(/unknown_source_order/);
    expect(CREATION).toMatch(/source_line_mismatch/);
  });

  it("refuses a lineage whose parts do not add up to the line", () => {
    /* Worse than none: it would look authoritative while hiding units. */
    expect(CREATION).toMatch(/source_allocation_mismatch/);
    expect(CREATION).toMatch(/if v_src_total <> v_qty then/);
  });

  it("has no write policy — the creation helper is the only writer", () => {
    expect(CREATION).toMatch(/revoke all on public\.po_line_sources from authenticated/);
    expect(CREATION).toMatch(/grant select on public\.po_line_sources to authenticated/);
    expect(CREATION_CODE).not.toMatch(/for insert to authenticated/);
  });
});
