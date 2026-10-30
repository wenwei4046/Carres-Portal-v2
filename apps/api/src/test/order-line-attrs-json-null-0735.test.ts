import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { migration } from "./stock-register-database";

/**
 * SO-1375 (30 Oct 2026): a Sales Order with GRT-MATTRESS-15Y came back HTTP 500,
 * "lines.4.attrs" an array. create_order inserts `v_line->'attrs'`, which is the
 * JSON value null (not SQL NULL) when the client sends `attrs: null`. The 0267
 * guarantee mint then writes `coalesce(attrs, '{}') || {...}`; coalesce does not
 * catch JSON null, and `'null' || object` is an ARRAY, so the 201's orderSchema
 * parse throws. 0735 stores JSON null as SQL NULL on order_lines/order_addons.
 */
describe("order line attrs: JSON null is stored as SQL NULL (0735, real PostgreSQL)", () => {
  let db: PGlite;
  const val = async (sql: string, params: unknown[] = []) =>
    Object.values((await db.query<Record<string, unknown>>(sql, params)).rows[0] ?? {})[0];

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated;
      create table orders (id uuid primary key default gen_random_uuid());
      create table order_lines (id uuid primary key default gen_random_uuid(), order_id uuid, sku text, qty int, attrs jsonb, unit_price numeric);
      create table order_addons (id uuid primary key default gen_random_uuid(), order_id uuid, addon_key text, qty int, attrs jsonb, unit_price numeric);
      -- The write-back of guarantee_mint_from_line (0267 step c), verbatim.
      create function guarantee_writeback() returns trigger language plpgsql as $$
      begin
        if NEW.sku like 'GRT-%' then
          update order_lines
             set attrs = coalesce(attrs, '{}'::jsonb)
                       || jsonb_build_object('guarantee', coalesce(attrs->'guarantee', '{}'::jsonb) || jsonb_build_object('ids', to_jsonb(array['G-1'])))
                       || jsonb_build_object('remark', 'Guarantee ID: G-1')
           where id = NEW.id;
        end if;
        return NEW;
      end $$;
      create trigger guarantee_writeback after insert on order_lines for each row execute function guarantee_writeback();
      insert into orders default values;
      -- A line already broken by the bug before 0735.
      insert into order_lines (order_id, sku, qty, attrs, unit_price) select id, 'OLD-GRT', 1,
        '[null, {"guarantee": {"ids": ["G-0"]}}, {"remark": "Guarantee ID: G-0"}]'::jsonb, 0 from orders;
    `);
    await db.exec(migration("0735_an_empty_line_spec_is_sql_null"));
  }, 60_000);

  // How create_order inserts a line: `v_line->'attrs'` off the request JSON.
  const insertLine = (line: Record<string, unknown>) =>
    db.query<{ id: string }>(
      `insert into order_lines (order_id, sku, qty, attrs, unit_price)
       select (select id from orders), $1::jsonb->>'sku', 1, $1::jsonb->'attrs', 0 returning id`,
      [JSON.stringify(line)],
    );

  it("a guarantee line sent with attrs null is minted as an object, not an array", async () => {
    const { rows } = await insertLine({ sku: "GRT-MATTRESS-15Y", attrs: null });
    const id = rows[0].id;
    expect(await val("select jsonb_typeof(attrs) from order_lines where id = $1", [id])).toBe("object");
    expect(await val("select attrs->'guarantee'->'ids' from order_lines where id = $1", [id])).toEqual(["G-1"]);
  });

  it("a plain line sent with attrs null stores SQL NULL", async () => {
    const { rows } = await insertLine({ sku: "B1201S-K", attrs: null });
    expect(await val("select attrs is null from order_lines where id = $1", [rows[0].id])).toBe(true);
  });

  it("an update to JSON null, and an addon's JSON null, store SQL NULL too", async () => {
    await db.exec(`update order_lines set attrs = 'null'::jsonb where sku = 'B1201S-K'`);
    expect(await val("select attrs is null from order_lines where sku = 'B1201S-K'")).toBe(true);
    await db.exec(`insert into order_addons (order_id, addon_key, qty, attrs, unit_price)
                   select id, 'disposal', 1, 'null'::jsonb, 0 from orders`);
    expect(await val("select attrs is null from order_addons")).toBe(true);
  });

  it("folds a line the bug already turned into an array back into one object", async () => {
    expect(await val("select attrs from order_lines where sku = 'OLD-GRT'")).toEqual({
      guarantee: { ids: ["G-0"] },
      remark: "Guarantee ID: G-0",
    });
  });

  it("keeps a real spec object as sent", async () => {
    await insertLine({ sku: "B1201S-Q", attrs: { gap: "KIV" } });
    expect(await val("select attrs from order_lines where sku = 'B1201S-Q'")).toEqual({ gap: "KIV" });
  });
});
