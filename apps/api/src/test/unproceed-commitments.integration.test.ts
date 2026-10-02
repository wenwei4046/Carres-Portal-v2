import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

// Actual full-chain PostgreSQL doors; isolated local fixtures only.
const url = process.env.CARRES_TEST_DATABASE_URL ?? "";
const order = randomUUID(), line = randomUUID(), unit = randomUUID(), otherDealer = randomUUID();
const otherLocation = randomUUID();
const so = 900000 + Math.floor(Math.random() * 90000);
const migration = readFileSync(new URL("../../../../supabase/migrations/0634_unproceed_preserves_purchase_and_stock_commitments.sql", import.meta.url), "utf8");

describe.skipIf(!url)("Proceed reversal preserves purchase and stock commitments", () => {
  let db: pg.Client, po: string, poLine: string, boss: string;
  const q = (sql: string, args: unknown[] = []) => db.query(sql, args);
  async function actor(client: pg.Client, who: string | null) {
    await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
  }
  async function blocks() {
    await q("savepoint refusal");
    await expect(q("select unproceed_order($1)", [order])).rejects.toMatchObject({ code: "22023", detail: "wrong_stage" });
    await q("rollback to savepoint refusal");
    expect((await q("select status from orders where id=$1", [order])).rows[0].status).toBe("proceed_order");
    expect(Number((await q("select count(*) n from order_history where order_id=$1", [order])).rows[0].n)).toBe(0);
  }
  beforeAll(async () => {
    if (!/^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1):\d+\//.test(url)) throw new Error("Local database required");
    db = new pg.Client({ connectionString: url }); await db.connect();
    await q(migration);
    boss = (await q("select id from app_users where role='principal' and status='active' limit 1")).rows[0].id;
    const source = (await q("select p.id, l.id line from purchase_orders p join purchase_order_lines l on l.po_id=p.id limit 1")).rows[0];
    po = source.id; poLine = source.line;
    await q("begin"); await q("set local session_replication_role=replica");
    await q("insert into dealers select r.* from dealers d cross join lateral jsonb_populate_record(null::dealers,to_jsonb(d)||jsonb_build_object('id',$1::uuid,'name','Fixture guard dealer')) r limit 1", [otherLocation]);
    await q("insert into auth.users(id,email) values($1,$2)", [otherDealer,`guard-${otherDealer}@example.invalid`]);
    await q("insert into app_users(id,email,name,role,status,dealer_id) values($1,$2,'Fixture different dealer','dealer','active',$3)", [otherDealer,`guard-${otherDealer}@example.invalid`,otherLocation]);
    await q(`insert into orders select r.* from orders o cross join lateral jsonb_populate_record(null::orders,
      to_jsonb(o)||jsonb_build_object('id',$1::uuid,'so',$2::int,'status','proceed_order','operation_stage','confirmed',
      'proceed_date',current_date+10,'salesperson_id',(select id from salespersons limit 1))) r limit 1`, [order, so]);
    await q("insert into order_lines(id,order_id,sku,qty,unit_price) select $1,$2,sku,1,1000 from product_skus limit 1", [line, order]);
    await q(`insert into ops_stock_items select r.* from ops_stock_items i cross join lateral jsonb_populate_record(null::ops_stock_items,
      to_jsonb(i)||jsonb_build_object('id',$1::uuid,'unit_code',$2::text,'status','free','reserved_order_line_id',null,
      'reserved_purchase_demand_id',null,'reserved_ref',null,'sold_order_id',null)) r where i.qty=1 limit 1`, [unit, `U99-${String(so).slice(0,3)}-${String(so).slice(3)}`]);
    await q("commit");
  }, 30000);
  beforeEach(async () => { await q("begin"); await actor(db, boss); });
  afterEach(async () => { await q("rollback"); });
  afterAll(async () => {
    if (!db) return;
    await q("rollback"); await q("begin"); await q("set local session_replication_role=replica");
    await q("delete from po_line_sources where order_id=$1", [order]);
    await q("delete from ops_stock_items where id=$1", [unit]);
    await q("delete from order_history where order_id=$1", [order]);
    await q("delete from audit_log where ref=$1", [`SO-${so}`]);
    await q("delete from order_lines where order_id=$1", [order]);
    await q("delete from orders where id=$1", [order]);
    await q("delete from app_users where id=$1", [otherDealer]);
    await q("delete from auth.users where id=$1", [otherDealer]);
    await q("delete from dealers where id=$1", [otherLocation]);
    await q("commit"); await db.end();
  });
  it("an uncommitted order returns to Place and records its normal history", async () => {
    const result = (await q("select unproceed_order($1) r", [order])).rows[0].r;
    expect(result.status).toBe("place");
    expect(Number((await q("select count(*) n from order_history where order_id=$1", [order])).rows[0].n)).toBe(1);
  });
  it("exact PO source lineage blocks reversal", async () => {
    await q("set local session_replication_role=replica");
    await q("insert into po_line_sources(id,po_id,po_line_id,sku,order_id,so,order_line_id,qty) select $1,$2,$3,sku,$4,$5,id,1 from order_lines where id=$6", [randomUUID(),po,poLine,order,so,line]);
    await q("set local session_replication_role=origin"); await blocks();
  });
  it("legacy PO SO references block reversal without exact lineage", async () => {
    await q("update purchase_orders set so_refs=array[$1::int] where id=$2", [so,po]); await blocks();
  });
  it.each(["line", "reference", "sold"])("the %s Unit binding independently blocks reversal", async (kind) => {
    await q("set local session_replication_role=replica");
    await q("update ops_stock_items set status='reserved',reserved_order_line_id=$2,reserved_ref=$3,sold_order_id=$4 where id=$1", [unit,kind==="line"?line:null,kind==="reference"?`SO-${so}`:null,kind==="sold"?order:null]);
    await q("set local session_replication_role=origin"); await blocks();
  });
  it("a released reference on a free Unit is no commitment", async () => {
    await q("set local session_replication_role=replica");
    await q("update ops_stock_items set reserved_ref=$2 where id=$1", [unit,`SO-${so}`]);
    await q("set local session_replication_role=origin");
    expect((await q("select unproceed_order($1) r", [order])).rows[0].r.status).toBe("place");
  });
  it("a missing role and a different dealer retain their permission refusal", async () => {
    for (const claims of [{role:"authenticated"}, {sub:otherDealer,role:"authenticated"}]) {
      await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
      await q("savepoint forbidden");
      await expect(q("select unproceed_order($1)", [order])).rejects.toMatchObject({code:"42501",detail:"forbidden"});
      await q("rollback to savepoint forbidden");
    }
  });
  it("negative control: removing only the new guard reopens the exact bound-Unit bypass", async () => {
    await q("set local session_replication_role=replica");
    await q("update ops_stock_items set status='reserved',reserved_order_line_id=$2 where id=$1", [unit,line]);
    await q("set local session_replication_role=origin"); await blocks();
    await q(`create or replace function public.unproceed_order(p_order_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $old$ begin perform public._sales_order_lock_for_edit(p_order_id); return public._unproceed_order_0391_locked_impl(p_order_id); end; $old$`);
    expect((await q("select unproceed_order($1) r", [order])).rows[0].r.status).toBe("place");
  });
  it("waits for the shared source lock and sees a newly committed reservation", async () => {
    const a = new pg.Client({connectionString:url}), b = new pg.Client({connectionString:url});
    await a.connect(); await b.connect();
    try {
      await a.query("begin"); await actor(a,boss);
      await a.query("select so_lock_source_lines(array[$1::uuid])", [line]);
      await a.query("set local session_replication_role=replica");
      await a.query("update ops_stock_items set status='reserved',reserved_order_line_id=$2 where id=$1", [unit,line]);
      await b.query("begin"); await actor(b,boss);
      let settled = false;
      const reversing = b.query("select unproceed_order($1)", [order]).then(() => null, e => e).finally(() => { settled=true; });
      await new Promise(r => setTimeout(r,150));
      const waited = !settled;
      await a.query("commit");
      expect(waited).toBe(true);
      expect(await reversing).toMatchObject({code:"22023",detail:"wrong_stage"});
    } finally {
      await a.query("rollback"); await b.query("rollback"); await a.end(); await b.end();
    }
  });
});
