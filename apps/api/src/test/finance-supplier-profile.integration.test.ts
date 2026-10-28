import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0636 ON A REAL POSTGRESQL RUNNING THE WHOLE MIGRATION CHAIN: Finance's own
 * tax and bank details for a supplier (Chew 2026-10-03, docs/finance/MASTER.md
 * §3.2). The supplier stays Purchasing's record; only the door writes the
 * Finance row, and only Finance or the principal may call it.
 *
 * Everything runs inside ONE transaction that is rolled back at the end, so
 * the suite writes nothing that survives it. Identities are impersonated
 * through the request-claims GUC exactly as PostgREST sets it.
 * PREREQUISITE — a throwaway local cluster with the chain:
 *
 *   PG_BIN=<postgres bin> node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- finance-supplier-profile
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const RUN = Date.now() % 100000;
const HEX = RUN.toString(16).padStart(5, "0");
const uid = (tail: string) => `dddddddd-0000-4000-8000-${HEX}${tail.padStart(7, "0")}`;

const U = {
  finance: uid("1"),
  operation: uid("2"),
  principal: uid("3"),
};

describe.skipIf(!URL)("Finance keeps a supplier's tax and bank details (real PostgreSQL, 0636)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  const actAs = (id: string | null) =>
    q("select set_config('request.jwt.claims', $1, false)", [id ? JSON.stringify({ sub: id, role: "authenticated" }) : ""]);
  /** Runs one call in a savepoint: a refusal is returned as its detail code and
   *  does not abort the suite's transaction. */
  async function attempt(sql: string, params: unknown[] = []): Promise<{ ok: true; rows: Record<string, unknown>[] } | { ok: false; detail: string }> {
    await q("savepoint s");
    try {
      const r = await q(sql, params);
      await q("release savepoint s");
      return { ok: true, rows: r.rows };
    } catch (e) {
      await q("rollback to savepoint s");
      return { ok: false, detail: (e as { detail?: string }).detail ?? (e as Error).message };
    }
  }
  const save = (supplierId: string, tax: string | null, reg: string | null, bank: string | null, account: string | null, holder: string | null) =>
    attempt("select public.finance_supplier_profile_save($1, $2, $3, $4, $5, $6) as id", [supplierId, tax, reg, bank, account, holder]);
  const stored = async (supplierId: string) =>
    (await q("select tax_no, registration_no, bank_name, bank_account_no, bank_account_holder, updated_by from finance_supplier_profiles where supplier_id = $1", [supplierId])).rows[0];

  let supplierId = "";

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    const people: Array<[string, string]> = [
      [U.finance, "finance"],
      [U.operation, "operation"],
      [U.principal, "principal"],
    ];
    for (const [id, role] of people) {
      const email = `it-sp-${role}-${id.slice(-4)}-${RUN}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status, is_person) values ($1, $2, $3, $4, 'active', true)", [
        id, email, `IT ${role} ${id.slice(-4)}`, role,
      ]);
    }
    supplierId = (
      await q("insert into suppliers (name, kind, slug) values ($1, 'factory_pickup', $2) returning id", [
        `IT supplier ${RUN}`,
        `it-supplier-${RUN}`,
      ])
    ).rows[0].id as string;
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    await q("rollback").catch(() => undefined);
    await db.end();
  });

  it("Finance saves the details, trimmed, with spaces and dashes dropped from the account number", async () => {
    await actAs(U.finance);
    const r = await save(supplierId, "  C 1234567890 ", " ", " Maybank ", "5140-1234 5678", " Test Factory Sdn Bhd ");
    expect(r.ok).toBe(true);
    expect(await stored(supplierId)).toEqual({
      tax_no: "C 1234567890",
      registration_no: null,
      bank_name: "Maybank",
      bank_account_no: "514012345678",
      bank_account_holder: "Test Factory Sdn Bhd",
      updated_by: U.finance,
    });
  });

  it("saving again replaces the details, and a blank clears one", async () => {
    await actAs(U.principal);
    const r = await save(supplierId, null, "202301012345", "Public Bank", "3201234567", null);
    expect(r.ok).toBe(true);
    expect(await stored(supplierId)).toMatchObject({
      tax_no: null,
      registration_no: "202301012345",
      bank_name: "Public Bank",
      bank_account_no: "3201234567",
      bank_account_holder: null,
      updated_by: U.principal,
    });
  });

  it("the list shows every supplier with Finance's details beside it", async () => {
    await actAs(U.finance);
    const r = await attempt("select * from public.finance_supplier_list() where supplier_id = $1", [supplierId]);
    expect(r.ok).toBe(true);
    const row = r.ok ? r.rows[0] : {};
    expect(row).toMatchObject({ name: `IT supplier ${RUN}`, kind: "factory_pickup", bank_name: "Public Bank", bank_account_no: "3201234567" });
  });

  it("refuses an account number that is not 6 to 20 digits", async () => {
    await actAs(U.finance);
    expect(await save(supplierId, null, null, "Maybank", "12AB45", null)).toEqual({ ok: false, detail: "account_no_invalid" });
    expect(await save(supplierId, null, null, "Maybank", "12345", null)).toEqual({ ok: false, detail: "account_no_invalid" });
  });

  it("refuses an account number with no bank", async () => {
    await actAs(U.finance);
    expect(await save(supplierId, null, null, null, "514012345678", null)).toEqual({ ok: false, detail: "bank_name_missing" });
  });

  it("refuses a supplier that does not exist", async () => {
    await actAs(U.finance);
    expect(await save(uid("f1"), "C1", null, null, null, null)).toEqual({ ok: false, detail: "supplier_missing" });
  });

  it("refuses operation: only Finance or the principal writes it", async () => {
    await actAs(U.operation);
    expect(await save(supplierId, "C1", null, null, null, null)).toEqual({ ok: false, detail: "not_finance" });
  });

  it("the table is read through its policy and written only by the door", async () => {
    const r = await q(`select has_table_privilege('authenticated', 'public.finance_supplier_profiles', 'insert') as ins,
                              has_table_privilege('authenticated', 'public.finance_supplier_profiles', 'update') as upd,
                              has_table_privilege('anon', 'public.finance_supplier_profiles', 'select') as anon_sel`);
    expect(r.rows[0]).toEqual({ ins: false, upd: false, anon_sel: false });
  });
});
