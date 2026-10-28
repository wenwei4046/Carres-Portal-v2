/** LOCAL ONLY parity check for the SQL verifier of the existing shared planner.
 * Requires an owned replay DB; refuses non-loopback and non-dryrun destinations.
 * No production identity, orders, approvals or stock changes. Everything rolls back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { expectedArrivalOf } from "@carres/shared";
const url = process.env.CARRES_CONTEXT_TEST_DATABASE_URL;
const local = url ? new URL(url) : null;
if (local && (!['127.0.0.1', 'localhost'].includes(local.hostname) || !local.pathname.startsWith('/carres_dryrun_'))) throw new Error('Calendar verification requires an owned loopback dryrun database');
const db = new Client({ connectionString: url });
let source: { sku: string; supplier_id: string; category: 'sofa' | 'bedframe' | 'mattress' };
describe.skipIf(!url)("request SQL verifies the existing supplier production calendar", () => {
  beforeAll(async () => {
    await db.connect(); await db.query('begin');
    await db.query(readFileSync(new URL('../../../../output/forecast-mpr-delivery/purchase-request-writers.draft.sql', import.meta.url), 'utf8'));
    source = (await db.query(`select s.sku,s.supplier_id,m.category::text category from product_skus s join product_models m on m.id=s.model_id join purchasing_production_days p on p.supplier_id=s.supplier_id and p.category=m.category::text order by s.sku limit 1`)).rows[0];
    if (!source) throw new Error('Replay needs a real Catalog supplier/category fixture');
  });
  afterAll(async () => { await db.query('rollback'); await db.end(); });
  it("admits every canonical earliest date and refuses the preceding day across weekdays, holidays and year rollover", async () => {
    let checked = 0;
    for (const fromIso of ['2026-10-20', '2026-12-24', '2027-01-29']) {
      for (const offDays of [[0], [0, 6], [0, 1, 2, 3, 4, 5]]) {
        for (const workingDays of [1, 7, 14]) {
          await db.query('update purchasing_production_days set working_days=$1 where supplier_id=$2 and category=$3', [workingDays, source.supplier_id, source.category]);
          await db.query('insert into purchasing_supplier_settings(supplier_id,off_days) values($1,$2) on conflict(supplier_id) do update set off_days=excluded.off_days', [source.supplier_id, offDays]);
          const earliest = expectedArrivalOf({ productionDays: [{ supplierId: source.supplier_id, category: source.category, workingDays }], suppliers: [{ id: source.supplier_id, offDays }] } as never, { supplierId: source.supplier_id, category: source.category, fromIso });
          expect(earliest).not.toBeNull();
          const context = { proceedDate: fromIso, lines: [{ id: '00000000-0000-4000-8000-000000000001', sku: source.sku, allocations: [{ supplierDeliveryDate: earliest }] }] };
          await db.query('select public._purchasing_check_context_supplier_dates($1::jsonb)', [JSON.stringify(context)]);
          const previous = new Date(`${earliest}T00:00:00Z`); previous.setUTCDate(previous.getUTCDate() - 1);
          context.lines[0]!.allocations[0]!.supplierDeliveryDate = previous.toISOString().slice(0, 10);
          await db.query('savepoint refusal');
          let refusal: unknown;
          try { await db.query('select public._purchasing_check_context_supplier_dates($1::jsonb)', [JSON.stringify(context)]); }
          catch (e) { refusal = e; }
          await db.query('rollback to savepoint refusal'); await db.query('release savepoint refusal');
          expect(refusal).toMatchObject({ code: '22023', detail: 'supplier_date_before_earliest' });
          checked++;
        }
      }
    }
    expect(checked).toBe(27);
  });
});
