import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * 0722 ON A REAL POSTGRESQL — Weisiang's decision (Mr Lim, WhatsApp
 * 2026-10-22; Jess was not part of it): office staff add, rename or hide a
 * State, City or Postcode. One door, gated to the Sales Order Settings
 * editors, every save kept in settings_changes. Rolled back at the end.
 *
 *   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> pnpm --filter @carres/api test -- address-lists-0722
 *
 * Without the URL every case is SKIPPED — reported as skipped, never as passed.
 */
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(URL);
const HEX = (Date.now() % 100000).toString(16).padStart(5, "0");
const uid = (tail: string) => `eeeeeeee-0722-4000-8000-${HEX}${tail.padStart(7, "0")}`;
const U = { principal: uid("1"), operation: uid("2") };
const SAVE = "select public.settings_save_address_override($1, $2, $3, $4, $5, $6)";

describe.skipIf(!URL)("0722 — Settings → Address lists (real PostgreSQL)", () => {
  let db: pg.Client;
  const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
  async function attempt(sql: string, params: unknown[] = []): Promise<string> {
    await q("savepoint s");
    try {
      await q(sql, params);
      await q("release savepoint s");
      return "ok";
    } catch (e) {
      await q("rollback to savepoint s");
      const err = e as { detail?: string; code?: string; message: string };
      return err.detail && !err.detail.includes(" ") ? err.detail : err.code ?? err.message;
    }
  }
  const as = async (who: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    await q("set local role authenticated");
  };

  beforeAll(async () => {
    if (!LOCAL) throw new Error("CARRES_TEST_DATABASE_URL must point at localhost");
    db = new pg.Client({ connectionString: URL });
    await db.connect();
    await q("begin");
    for (const [id, role] of [[U.principal, "principal"], [U.operation, "operation"]] as const) {
      const email = `it-0722-${role}-${id.slice(-7)}@carres.test`;
      await q("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      await q("insert into app_users (id, email, name, role, status) values ($1, $2, $3, $4, 'active')", [id, email, `IT ${role}`, role]);
    }
  });
  afterAll(async () => {
    if (db) { await q("rollback"); await db.end(); }
  });

  it("refuses a person who is not a Sales Order Settings editor", async () => {
    await as(U.operation);
    expect(await attempt(SAVE, ["Selangor", "Klang", "41999", null, false, false])).toBe("not_settings_editor");
  });

  it("adds, renames, hides and removes, keeping each change", async () => {
    await as(U.principal);
    expect(await attempt(SAVE, ["Selangor", "Klang", "41999", null, false, false])).toBe("ok");
    expect(await attempt(SAVE, ["Selangor", "Klang", null, "Kelang", false, false])).toBe("ok");
    expect(await attempt(SAVE, ["Johor", null, null, null, true, false])).toBe("ok");
    // the same name again rewrites its one row (rename → hide)
    expect(await attempt(SAVE, ["Selangor", "Klang", null, null, true, false])).toBe("ok");
    expect(await attempt(SAVE, ["Johor", null, null, null, false, true])).toBe("ok");
    const rows = await q("select state, city, postcode, rename_to, hidden from address_list_overrides where state in ('Selangor','Johor') order by id");
    expect(rows.rows).toEqual([
      { state: "Selangor", city: "Klang", postcode: "41999", rename_to: null, hidden: false },
      { state: "Selangor", city: "Klang", postcode: null, rename_to: null, hidden: true },
    ]);
    const log = await q("select count(*)::int as n from settings_changes where section = 'sales_orders' and what = 'address_list' and actor_id = $1", [U.principal]);
    expect(log.rows[0].n).toBe(5);
  });

  it("refuses a postcode rename and a bad postcode", async () => {
    await as(U.principal);
    expect(await attempt(SAVE, ["Selangor", "Klang", "41000", "Other", false, false])).toBe("23514");
    expect(await attempt(SAVE, ["Selangor", "Klang", "4100", null, false, false])).toBe("23514");
    expect(await attempt(SAVE, ["Selangor", null, "41000", null, false, false])).toBe("23514");
  });

  it("every signed-in account reads the lists", async () => {
    await as(U.operation);
    const r = await q("select count(*)::int as n from address_list_overrides where state = 'Selangor'");
    expect(r.rows[0].n).toBeGreaterThan(0);
  });
});
