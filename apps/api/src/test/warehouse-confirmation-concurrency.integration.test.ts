import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

/** True competing transactions, not Promise.all on one serial connection.
 * Opt in only on a disposable local draft database. These fixtures COMMIT so
 * both connections can see them and are retained in that local test database.
 * No production connection or destructive cleanup is allowed by this suite.
 */
const databaseUrl = process.env.CARRES_RECEIVING_CONCURRENCY_DATABASE_URL ?? "";
const run = randomUUID().slice(0, 8);
const actor = randomUUID();
const site = randomUUID();
const supplier = randomUUID();
const destination = randomUUID();
const cases = ["same-key", "same-do"].map((name, index) => ({
  name, po: `PO-CONCURRENT-${run}-${index}`, line: randomUUID(),
  units: [randomUUID(), randomUUID()], key: randomUUID(),
  codes: [`U${Number.parseInt(run, 16)}-${index}01-001`, `U${Number.parseInt(run, 16)}-${index}02-001`],
}));

describe.skipIf(!databaseUrl)("Warehouse confirmation against concurrent transactions", () => {
  let admin: pg.Client | undefined;
  let first: pg.Client | undefined;
  let second: pg.Client | undefined;
  let firstPid = 0;
  let secondPid = 0;

  beforeAll(async () => {
    const url = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || !/^\/(carres_dryrun_|carres_receiving_)/.test(url.pathname)) {
      throw new Error("Concurrency proof requires a disposable local Carres test database");
    }
    admin = new pg.Client({ connectionString: databaseUrl });
    first = new pg.Client({ connectionString: databaseUrl });
    second = new pg.Client({ connectionString: databaseUrl });
    await Promise.all([admin.connect(), first.connect(), second.connect()]);
    firstPid = (await first.query("select pg_backend_pid() pid")).rows[0]!.pid;
    secondPid = (await second.query("select pg_backend_pid() pid")).rows[0]!.pid;
    await admin.query("begin");
    try {
      await admin.query("set local session_replication_role=replica");
      await admin.query("insert into auth.users(id,email) values($1,$2)", [actor, `concurrency-${run}@carres.test`]);
      await admin.query("insert into app_users(id,email,name,role,status,is_person,warehouse_id) values($1,$2,'Concurrent Warehouse fixture','warehouse','active',true,$3)", [actor, `concurrency-${run}@carres.test`, site]);
      await admin.query("insert into warehouses(id,name) values($1,$2)", [site, `Concurrent Site ${run}`]);
      await admin.query("insert into warehouse_site_profiles(site_id) values($1)", [site]);
      await admin.query("insert into suppliers(id,name,kind,slug) values($1,$2,(select enum_range(null::supplier_kind))[1],$3)", [supplier, `Concurrent supplier ${run}`, `concurrent-${run}`]);
      await admin.query("insert into purchasing_destinations(id,name,warehouse_id,active) values($1,$2,$3,true)", [destination, `Concurrent destination ${run}`, site]);
      for (const c of cases) {
        await admin.query("insert into purchase_orders(id,supplier_id,warehouse_id,destination_id,status,placed_at) values($1,$2,$3,$4,'open',now()-interval '3 days')", [c.po, supplier, site, destination]);
        await admin.query("insert into purchase_order_lines(id,po_id,sku,qty,received_qty,identity_mode) values($1,$2,$3,2,0,'exact_unit')", [c.line, c.po, `CON-${run}`]);
        for (let i = 0; i < 2; i++) {
          await admin.query("insert into ops_stock_items(id,unit_code,sku,warehouse_id,status,po_no,po_line_id,identity_scope,source_ref) values($1,$2,$3,$4,'incoming',$5,$6,'unit','po_mint')", [c.units[i], c.codes[i], `CON-${run}`, site, c.po, c.line]);
        }
        await admin.query("insert into storage.objects(id,bucket_id,name,owner) values($1,'delivery-orders',$2,$3)", [randomUUID(), `${c.po}/do.jpg`, actor]);
      }
      await admin.query("commit");
    } catch (error) {
      await admin.query("rollback");
      throw error;
    }
  });

  afterAll(async () => {
    for (const client of [first, second, admin]) {
      if (!client) continue;
      await client.query("rollback").catch(() => {});
      await client.end();
    }
  });

  it.each(cases)("serialises $name before the first transaction commits", async (c) => {
    const body = JSON.stringify({
      po_id: c.po, actual_site_id: site, do_number: `DO-${c.po}`,
      do_file_path: `${c.po}/do.jpg`, goods_received_time: new Date(Date.now() - 60000).toISOString(),
      arrival_evidence: [], extra_lines: [], lines: [{ id: c.line, units: [
        { unit_code: c.codes[0], outcome: "received" },
        { unit_code: c.codes[1], outcome: "not_received" },
      ] }],
    });
    for (const client of [first!, second!]) {
      await client.query("begin");
      await client.query("set local statement_timeout='8s'");
      await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: actor, role: "authenticated" })]);
      await client.query("set local role authenticated");
    }
    const sql = "select public.warehouse_confirm_receipt($1::jsonb,$2::uuid,null,null) result";
    const a = (await first!.query(sql, [body, c.key])).rows[0]!.result;
    expect(a.status, JSON.stringify(a.blockers)).toBe("posted");
    // Attach a rejection handler immediately; a timeout must not become an
    // unhandled promise while the independent observer checks the real lock.
    const pending = second!.query(sql, [body, c.name === "same-key" ? c.key : randomUUID()])
      .then((value) => ({ value }), (error: Error) => ({ error }));
    let blocked = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const locks = (await admin!.query("select pg_blocking_pids($1) pids", [secondPid])).rows[0]!.pids as number[];
      if (locks.includes(firstPid)) { blocked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    // Release either way so a failing observation cannot strand a transaction.
    await first!.query("commit");
    const outcome = await pending;
    if ("error" in outcome) throw outcome.error;
    const b = outcome.value.rows[0]!.result;
    await second!.query("commit");
    expect(blocked).toBe(true);
    if (c.name === "same-key") {
      expect(b.status).toBe("posted");
      expect(b.id).toBe(a.id);
      expect(b.grn_no).toBe(a.grn_no);
    } else {
      expect(b.status).toBe("draft");
      expect(b.id).not.toBe(a.id);
      expect(b.grn_no).toBeNull();
      expect(b.blockers).toEqual([expect.objectContaining({ code: "duplicate_receipt" })]);
    }
    expect((await admin!.query("select count(*)::int n from warehouse_receipts where po_id=$1 and status='posted'", [c.po])).rows[0]!.n).toBe(1);
    expect((await admin!.query("select received_qty from purchase_order_lines where id=$1", [c.line])).rows[0]!.received_qty).toBe(1);
    expect((await admin!.query("select count(*)::int n from receiving_unit_results where receipt_id=$1", [a.id])).rows[0]!.n).toBe(2);
  }, 15000);
  it("credits only the transaction receiving the final repair Unit across different sources and actors",async()=>{
    const ro=randomUUID(),party=randomUUID(),away=randomUUID(),secondActor=randomUUID();
    const legs=[{source:randomUUID(),unit:randomUUID(),key:randomUUID(),actor},
      {source:randomUUID(),unit:randomUUID(),key:randomUUID(),actor:secondActor}];
    await admin!.query("begin");
    await admin!.query("set local session_replication_role=replica");
    await admin!.query("insert into auth.users(id,email) values($1,$2)",[secondActor,`return-${run}@carres.test`]);
    await admin!.query("insert into app_users(id,email,name,role,status,is_person,warehouse_id) values($1,$2,'Second receiver','warehouse','active',true,$3)",[secondActor,`return-${run}@carres.test`,site]);
    await admin!.query("insert into warehouses(id,name) values($1,$2)",[away,`Return origin ${run}`]);
    await admin!.query("insert into stock_operating_parties(id,code,name,kind) values($1,$2,'Return company','warehouse_operator')",[party,`return_${run}`]);
    await admin!.query("update warehouse_site_profiles set operating_party_id=$2 where site_id=$1",[site,party]);
    await admin!.query("insert into repair_orders(id,request_id,ro_no,ro_doc_date,supplier_id,pickup_site_id,return_site_id,created_by) values($1,$2,$3,current_date,$4,$5,$6,$7)",[ro,randomUUID(),`RO-CON-${run}`,supplier,away,site,actor]);
    for(const [i,leg] of legs.entries()){
      const code=`U${Number.parseInt(run,16)}-9${i}1-001`;
      await admin!.query("insert into ops_stock_items(id,unit_code,sku,warehouse_id,status,identity_scope,source_ref) values($1,$2,$3,$4,'free','unit','po_mint')",[leg.unit,code,`RETURN-${run}`,away]);
      await admin!.query("insert into repair_order_units(repair_order_id,stock_item_id,unit_code,problem,problem_note,repair_requirement) values($1,$2,$3,'damaged','Test damage','Test repair')",[ro,leg.unit,code]);
      await admin!.query("insert into arrival_sources(id,source_no,kind,from_site_id,to_site_id,party_id,repair_order_id,expected_date,reason,created_by) values($1,$2,'repair-return',$3,$4,$5,$6,current_date,'Concurrent return',$7)",[leg.source,`RETURN-${run}-${i}`,away,site,party,ro,actor]);
      await admin!.query("insert into arrival_source_units(source_id,stock_item_id,status_before,holder_before) values($1,$2,'free',$3)",[leg.source,leg.unit,party]);
      await admin!.query("insert into storage.objects(id,bucket_id,name,owner) values($1,'arrival-proofs',$2,$3)",[randomUUID(),`${leg.source}/proof.jpg`,leg.actor]);
    }
    await admin!.query("commit");
    const reports=legs.map(leg=>JSON.stringify({arrival_source_id:leg.source,actual_site_id:site,
      do_number:`RETURN-${leg.source}`,do_file_path:`${leg.source}/proof.jpg`,handover_person:'Driver',
      goods_received_time:new Date(Date.now()-60000).toISOString(),arrival_units:[{stock_item_id:leg.unit,outcome:'received'}]}));
    for(const [i,client] of [first!,second!].entries()){
      await client.query("begin");await client.query("set local statement_timeout='8s'");
      await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:legs[i]!.actor,role:'authenticated'})]);
      await client.query("set local role authenticated");
    }
    const sql="select public.warehouse_confirm_receipt($1::jsonb,$2::uuid,null,null) result";
    const a=(await first!.query(sql,[reports[0],legs[0]!.key])).rows[0]!.result;
    expect(a.status,JSON.stringify(a.blockers)).toBe('posted');
    const pending=second!.query(sql,[reports[1],legs[1]!.key]).then(value=>({value}),error=>({error}));
    let blocked=false;
    for(let attempt=0;attempt<100;attempt++){
      const locks=(await admin!.query("select pg_blocking_pids($1) pids",[secondPid])).rows[0]!.pids as number[];
      if(locks.includes(firstPid)){blocked=true;break;}
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    await first!.query('commit');
    const outcome=await pending;if('error' in outcome)throw outcome.error;
    const b=outcome.value.rows[0]!.result;await second!.query('commit');
    expect(blocked).toBe(true);expect(b.status,JSON.stringify(b.blockers)).toBe('posted');
    // Both application after-reads may now observe ALL goods back. Only B's
    // immutable transaction marker proves who caused that transition.
    const events=(await admin!.query("select receipt_id,actor_id,payload->>'repair_return_completed_ro' completed_ro from receiving_events where receipt_id=any($1::uuid[]) and event='posted'",[[a.id,b.id]])).rows;
    expect(events).toContainEqual({receipt_id:a.id,actor_id:actor,completed_ro:null});
    expect(events).toContainEqual({receipt_id:b.id,actor_id:secondActor,completed_ro:ro});
    expect((await admin!.query("select public._receiving_repair_return_complete($1) complete",[ro])).rows[0]!.complete).toBe(true);
  },15000);

});
