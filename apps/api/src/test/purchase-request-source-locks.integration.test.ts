/** Owned LOCAL replay only. Cross-owner source locks use real row triggers;
 * stock inserts below are synthetic, never committed and never production.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
const url = process.env.CARRES_CONTEXT_TEST_DATABASE_URL;
const target = url ? new URL(url) : null;
if (target && (!['127.0.0.1', 'localhost'].includes(target.hostname) || !target.pathname.startsWith('/carres_dryrun_'))) throw new Error('Source-lock tests require owned loopback dryrun');
const owner = new Client({ connectionString: url });
const writer = new Client({ connectionString: url });
let sku: string, otherSku: string, warehouse: string;
describe.skipIf(!url)("context source consistency joins the real owner writes", () => {
  beforeAll(async () => {
    await Promise.all([owner.connect(), writer.connect()]);
    const rows = (await owner.query('select sku from product_skus order by sku limit 2')).rows;
    sku = rows[0]?.sku; otherSku = rows[1]?.sku;
    warehouse = (await owner.query('select id from warehouses order by id limit 1')).rows[0]?.id;
    if (!sku || !otherSku || !warehouse) throw new Error('Replay needs Catalog and warehouse fixtures');
  });
  afterAll(async () => {
    await Promise.all([owner.query('rollback'), writer.query('rollback')]);
    await Promise.all([owner.end(), writer.end()]);
  });
  it("refuses a same-SKU owner insert atomically while allowing unrelated SKU work", async () => {
    await owner.query('begin'); await owner.query('select public._purchasing_context_source_locks($1::text[])', [[sku]]);
    const before = (await owner.query('select count(*)::integer n from ops_stock_items where sku=$1', [sku])).rows[0].n;
    await writer.query('begin');
    let refusal: unknown;
    try { await writer.query("insert into ops_stock_items(sku,warehouse_id,status,condition) values($1,$2,'free','new')", [sku, warehouse]); }
    catch (e) { refusal = e; }
    expect(refusal).toMatchObject({ code: '40001', detail: 'request_source_busy' });
    await writer.query('rollback');
    // A Settings row insert/update also contributes source facts. It cannot
    // pass the SKU mutex just because its owning table differs from Stock.
    const production = (await owner.query('select s.supplier_id,m.category::text category from product_skus s join product_models m on m.id=s.model_id join purchasing_production_days p on p.supplier_id=s.supplier_id and p.category=m.category::text where s.sku=$1', [sku])).rows[0];
    if (production) {
      await writer.query('begin');
      let settingsRefusal: unknown;
      try { await writer.query('update purchasing_production_days set working_days=working_days where supplier_id=$1 and category=$2', [production.supplier_id, production.category]); }
      catch (e) { settingsRefusal = e; }
      expect(settingsRefusal).toMatchObject({ code: '40001', detail: 'request_source_busy' });
      await writer.query('rollback');
    }
    expect((await owner.query('select count(*)::integer n from ops_stock_items where sku=$1', [sku])).rows[0].n).toBe(before);
    await writer.query('begin');
    await writer.query("insert into ops_stock_items(sku,warehouse_id,status,condition) values($1,$2,'free','new')", [otherSku, warehouse]);
    await writer.query('rollback');
    await owner.query('rollback');
    // Release restores normal owner work; this retry is still rolled back.
    await writer.query('begin');
    await writer.query("insert into ops_stock_items(sku,warehouse_id,status,condition) values($1,$2,'free','new')", [sku, warehouse]);
    await writer.query('rollback');
    expect((await owner.query('select count(*)::integer n from ops_stock_items where sku=$1', [sku])).rows[0].n).toBe(before);
  });
});
