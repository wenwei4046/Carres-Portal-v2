import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * A REAL POSTGRES ON THE COMMITTED ALLOCATOR — the PO number's new shape and
 * the per-prefix pool (owner ruling 2026-09-23, MASTER §6.1; migration 0574).
 *
 * The migration's own sanity block proves the FORM through
 * `formal_document_code_text` and pins the key's definition. This test proves
 * the BEHAVIOUR the operator meets: a drawn PO number comes back in the new
 * shape, every other prefix comes back unchanged, two prefixes may hold the
 * same four digits on one day, and one prefix may not.
 *
 * Both migrations are EXECUTED from their committed files, so this cannot pass
 * against SQL that is not the SQL production runs.
 *
 * ⛔ WHAT THIS DOES NOT CLAIM. It does not exercise `_operation_create_po_inner`
 * (that needs the whole purchasing schema), so "the PO row's pool claim finds
 * its row by (prefix, tail)" is asserted by 0574's sanity block against
 * `pg_proc`, and the end-to-end birth of a `PO260924-4827` is owed by the
 * authenticated production walk.
 */
const POOL = "supabase/migrations/0381_the_locked_identities_get_their_allocators.sql";
const SHAPE = "supabase/migrations/0574_a_purchase_order_number_reads_po260924_4827.sql";

/** Cut one statement out of a migration by its first and last line. Line
 *  endings are normalised first: a CRLF checkout must match the same anchor. */
function statement(rawSql: string, start: string, end: string) {
  const sql = rawSql.replace(/\r\n/g, "\n");
  const from = sql.indexOf(start);
  if (from < 0) throw new Error(`Missing migration statement: ${start}`);
  const to = sql.indexOf(end, from);
  if (to < 0) throw new Error(`Missing statement end: ${end}`);
  return sql.slice(from, to + end.length);
}

function read(file: string) {
  return readFileSync(new URL(`../../../../${file}`, import.meta.url), "utf8");
}

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  const pool = read(POOL);
  const shape = read(SHAPE);
  /* ① the pool table, exactly as 0381 created it (it arrives with 0381's own
        key, which ② then widens — the same order production ran). */
  await db.exec(
    statement(pool, "create table if not exists public.formal_document_codes (", "\n);"),
  );
  /* ② 0574 · the one place a code becomes a number, then the re-key. */
  await db.exec(
    statement(shape, "create or replace function public.formal_document_code_text(", "\n$$;"),
  );
  await db.exec(
    statement(
      shape,
      "alter table public.formal_document_codes\n  drop constraint formal_document_codes_pkey;",
      "add constraint formal_document_codes_pkey primary key (code_date, prefix, code);",
    ),
  );
  /* ③ the allocator itself. `security definer` needs no role here; the draw,
        the unique-violation retry and the refusal are what we are testing. */
  await db.exec(
    statement(shape, "create or replace function public.allocate_formal_document_code(", "\n$$;"),
  );
});

afterAll(async () => {
  await db?.close();
});

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const res = await db.query<Record<string, T>>(sql, params);
  return Object.values(res.rows[0]!)[0] as T;
}

const MYT_TODAY = "(timezone('Asia/Kuala_Lumpur', now()))::date";

describe("the printed number for one (prefix, date, code)", () => {
  it("⭐ PO wears the owner's short form", async () => {
    expect(
      await one<string>("select public.formal_document_code_text('PO', date '2026-09-24', '4827')"),
    ).toBe("PO260924-4827");
  });

  it("a leading-zero code and a single-digit month survive", async () => {
    expect(
      await one<string>("select public.formal_document_code_text('PO', date '2026-01-05', '0007')"),
    ).toBe("PO260105-0007");
  });

  it("⛔ every OTHER prefix still mints exactly what it minted before", async () => {
    for (const prefix of ["MPR", "GRN", "PRTN", "RO", "SB", "PV", "ARI", "RV", "TR", "MM"]) {
      expect(
        await one<string>("select public.formal_document_code_text($1, date '2026-09-24', '4827')", [
          prefix,
        ]),
      ).toBe(`${prefix}-20260924-4827`);
    }
  });
});

describe("drawing a number from the pool", () => {
  it("a PO number comes back in the new shape, on today's Malaysian date", async () => {
    const no = await one<string>("select public.allocate_formal_document_code('PO')");
    const yymmdd = await one<string>(`select to_char(${MYT_TODAY}, 'YYMMDD')`);
    expect(no).toMatch(/^PO\d{6}-\d{4}$/);
    expect(no).toBe(`PO${yymmdd}-${no.slice(-4)}`);
  });

  it("⭐ THE NUMBER'S LAST FOUR CHARACTERS ARE ITS POOL CODE — what the PO helper claims by", async () => {
    const no = await one<string>("select public.allocate_formal_document_code('PO', 'PO-CLAIM')");
    const claimed = await one<number>(
      `select count(*)::int from public.formal_document_codes
        where code_date = ${MYT_TODAY} and prefix = 'PO' and code = right($1, 4)`,
      [no],
    );
    expect(claimed).toBe(1);
  });

  it("a GRN number is untouched by this file", async () => {
    expect(await one<string>("select public.allocate_formal_document_code('GRN')")).toMatch(
      /^GRN-\d{8}-\d{4}$/,
    );
  });

  it("⛔ an ungoverned prefix is still refused", async () => {
    /* The client reads `detail = unknown_prefix`; PGlite surfaces the message,
       and 0574's own sanity block asserts the detail code is still in the
       source. Both halves of the refusal are therefore held. */
    await expect(
      db.query("select public.allocate_formal_document_code('purchase')"),
    ).rejects.toThrow(/document prefix purchase is not governed/);
  });
});

describe("⭐ each prefix owns its own daily pool (the rule 0381 had the other way)", () => {
  it("two prefixes may hold the same four digits on one day", async () => {
    await db.query(
      `insert into public.formal_document_codes (code_date, code, prefix) values (date '2026-09-24', '4827', 'PO')`,
    );
    await expect(
      db.query(
        `insert into public.formal_document_codes (code_date, code, prefix) values (date '2026-09-24', '4827', 'GRN')`,
      ),
    ).resolves.toBeTruthy();
  });

  it("⛔ but ONE prefix may not take the same code twice — the draw still cannot repeat", async () => {
    await expect(
      db.query(
        `insert into public.formal_document_codes (code_date, code, prefix) values (date '2026-09-24', '4827', 'PO')`,
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it("the same code on a different day is a different row, as it always was", async () => {
    await expect(
      db.query(
        `insert into public.formal_document_codes (code_date, code, prefix) values (date '2026-09-25', '4827', 'PO')`,
      ),
    ).resolves.toBeTruthy();
  });

  it("⛔ the four-digit and prefix shape rules survived the re-key", async () => {
    await expect(
      db.query(
        `insert into public.formal_document_codes (code_date, code, prefix) values (date '2026-09-26', '482', 'PO')`,
      ),
    ).rejects.toThrow(/formal_document_codes_code_check/);
    await expect(
      db.query(
        `insert into public.formal_document_codes (code_date, code, prefix) values (date '2026-09-26', '4827', 'po')`,
      ),
    ).rejects.toThrow(/formal_document_codes_prefix_check/);
  });
});
