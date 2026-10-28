import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

// Controlled local database; no production writes or real supplier messages.
// Local replay has documented baseline failures; this proves the exercised doors only.
const url = process.env.CARRES_TEST_DATABASE_URL ?? "";
const run = randomUUID().slice(0,8);
const id = (n: number) => `${run}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OP=id(1), BOSS=id(2), SUP=id(3), WH=id(4), DEST=id(5), MODEL=id(6), SO=id(7), LINE=id(8);
const SKU=`IT-PO-${run}`;
const SO_NO=900000+Math.floor(Math.random()*90000);
describe.skipIf(!url)("ordinary Operation PO placement lifecycle", () => {
  let db: pg.Client;
  const q=(sql:string, args:unknown[]=[])=>db.query(sql,args);
  async function as(who:string) {
    await q("reset role");
    await q("select set_config('request.jwt.claims', $1, true)",[JSON.stringify({sub:who,role:"authenticated"})]);
    await q("set local role authenticated");
  }
  beforeAll(async()=>{
    if (!/^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1):\d+\//.test(url)) throw new Error("Local database required");
    db=new pg.Client({connectionString:url}); await db.connect(); await q("begin");
    await q("set local session_replication_role=replica");
    for (const [who,role] of [[OP,"operation"],[BOSS,"principal"]]) {
      await q("insert into auth.users(id,email) values($1,$2)",[who,`${role}-${run}@example.invalid`]);
      await q("insert into app_users(id,email,name,role,status,is_person) values($1,$2,$3,$4,'active',true)",[who,`${role}-${run}@example.invalid`,`Fixture ${role}`,role]);
    }
    await q("insert into suppliers(id,name,slug,kind,address) values($1,'Fixture supplier','it-po-' || ($1::uuid)::text,'own_logistics','Fixture supplier address')",[SUP]);
    await q("insert into warehouses(id,name,address) values($1,'Fixture warehouse','Fixture warehouse address')",[WH]);
    await q("insert into purchasing_destinations(id,name,warehouse_id) values($1,'Fixture destination ' || ($1::uuid)::text,$2)",[DEST,WH]);
    await q("insert into product_models(id,category,model_key,name) values($1,'mattress','it-po-' || ($1::uuid)::text,'Fixture mattress')",[MODEL]);
    await q("insert into product_skus(model_id,sku,variant,variant_kind,price,supplier_id,stock_identity_mode) values($1,$2,'King','size',1000,$3,'exact_unit')",[MODEL,SKU,SUP]);
    await q("insert into purchasing_production_days(supplier_id,category,working_days) values($1,'mattress',7)",[SUP]);
    await q("insert into workspace_duty_assignments(duty_key,holder_id,effective_from) values('purchasing_approver',$1,current_date)",[BOSS]);
    await q("insert into orders(id,so,dealer_id,customer_name,customer_phone,delivery_date,status,terms_accepted,salesperson_id) select $1, $3,id,'Fixture customer','0100000000',current_date+30,'proceed_order',true,$2::uuid from dealers limit 1",[SO,OP,SO_NO]);
    await q("insert into order_lines(id,order_id,sku,qty,unit_price) values($1,$2,$3,3,1000)",[LINE,SO,SKU]);
    await q("insert into order_lines(id,order_id,sku,qty,unit_price) values($1,$2,$3,1,1000)",[id(20),SO,SKU]);
    await q("insert into ops_stock_items(id,unit_code,sku,warehouse_id,status,condition,date_in) values($1,allocate_unit_id(),$2,$3,'free','new',current_date)",[id(21),SKU,WH]);
    await q("set local session_replication_role=origin");
    // Private local fixtures must be visible to two concurrent connections.
    // They use unique identities and remain only in this local acceptance DB.
    await q("commit");
  },30000);
  beforeEach(async()=>{await q("begin");});
  afterEach(async()=>{await q("rollback");});
  afterAll(async()=>{if(db){await q("rollback");await db.end();}});
  async function issue(lines:unknown[], so=false) {
    const r=await q("select purchasing_issue_pos_batch($1::jsonb) result",[JSON.stringify([{supplier_id:SUP,warehouse_id:WH,destination_id:DEST,eta_date:"2026-11-10",purpose:so?"customer_sales":"ready_stock",...(so?{so_refs:[SO_NO]}:{}),lines}])]);
    return r.rows[0].result;
  }
  async function documentAndSend(po:string){
    const assigned=(await q("select purchasing_po_actor() a")).rows[0].a;
    const document=(await q("select purchasing_po_document($1) d",[po])).rows[0].d;
    expect(document.lines).toHaveLength(1);
    expect(Number(document.lines[0].qty)).toBe(3);
    expect(document.lines[0]).not.toHaveProperty("cost");
    if (process.env.PO_PLACEMENT_ARTIFACTS) writeFileSync(`${process.env.PO_PLACEMENT_ARTIFACTS}/${po}.json`, JSON.stringify(document));
    await q("select purchasing_confirm_po_sent($1,1,'email','fixture@example.invalid','Local test only')",[po]);
    // A repeat declaration is another send event, never another PO or quantity.
    await q("select purchasing_confirm_po_sent($1,1,'email','fixture@example.invalid','Retry simulation')",[po]);
    await q("savepoint stale_send");
    await expect(q("select purchasing_confirm_po_sent($1,2,'email','fixture@example.invalid',null)",[po])).rejects.toMatchObject({detail:"stale_po_version"});
    await q("rollback to savepoint stale_send");
    await q("reset role");
    expect(Number((await q("select sum(qty) n from purchase_order_lines where po_id=$1",[po])).rows[0].n)).toBe(3);
    expect(Number((await q("select count(*) n from po_version_documents where po_id=$1",[po])).rows[0].n)).toBe(1);
    expect(Number((await q("select count(*) n from po_sends where po_id=$1 and kind='confirmed_sent'",[po])).rows[0].n)).toBe(2);
    const send=(await q("select sent_by,po_version from po_sends where po_id=$1 and kind='confirmed_sent'",[po])).rows[0];
    expect(send).toMatchObject({sent_by:OP,po_version:1});
    const history=(await q("select by_user_id,issue_authority,issue_duty_user_id,issue_cover_user_id from po_history where po_id=$1 and text='Purchase order issued'",[po])).rows[0];
    expect(history).toMatchObject({by_user_id:OP,issue_authority:"operation_staff",issue_duty_user_id:assigned.normal_user_id,issue_cover_user_id:assigned.acting_user_id});
    expect(assigned.normal_user_id).not.toBe(OP);
  }
  it("SO Batch issues, produces document data and records the actual sender",async()=>{
    await as(OP);
    const result=await issue([{sku:SKU,qty:3,cost:null,cost_source:null,commercial_treatment:null,sources:[{order_id:SO,so:SO_NO,order_line_id:LINE,qty:3}]}],true);
    expect(result.po_ids).toHaveLength(1);
    await q("savepoint retry_issue");
    await expect(issue([{sku:SKU,qty:3,cost:null,cost_source:null,commercial_treatment:null,sources:[{order_id:SO,so:SO_NO,order_line_id:LINE,qty:3}]}],true)).rejects.toBeTruthy();
    await q("rollback to savepoint retry_issue");
    expect(Number((await q("select sum(qty) n from po_line_sources where order_line_id=$1",[LINE])).rows[0].n)).toBe(3);
    await documentAndSend(result.po_ids[0]);
  });
  it("Manual Purchase requires its approver before ordinary staff issue",async()=>{
    await as(OP);
    const request=(await q("select purchasing_create_request_with_lines('ready_stock',$1,null,current_date+30,null,null,null,$2::jsonb,'additional_stock',null) r",[DEST,JSON.stringify([{sku:SKU,qty:3}])])).rows[0].r;
    await q("savepoint approval_refusal");
    await expect(q("select purchasing_decide_request($1,'approve',null)",[request.id])).rejects.toBeTruthy();
    await q("rollback to savepoint approval_refusal");
    await as(BOSS);
    await q("select purchasing_decide_request($1,'approve',null)",[request.id]);
    await as(OP);
    const demand=(await q("select id from purchase_demands where request_id=$1",[request.id])).rows[0].id;
    const result=await issue([{sku:SKU,qty:3,cost:null,cost_source:null,commercial_treatment:null,demand_id:demand}]);
    expect(result.po_ids).toHaveLength(1);
    await q("savepoint retry_issue");
    await expect(issue([{sku:SKU,qty:3,cost:null,cost_source:null,commercial_treatment:null,demand_id:demand}])).rejects.toBeTruthy();
    await q("rollback to savepoint retry_issue");
    expect(Number((await q("select issued_qty from purchase_demands where id=$1",[demand])).rows[0].issued_qty)).toBe(3);
    expect((await q("select created_by,approved_by from purchase_requests where id=$1",[request.id])).rows[0]).toMatchObject({created_by:OP,approved_by:BOSS});
    await documentAndSend(result.po_ids[0]);
  });
  it("two partial buys preserve one source cap and three permanent Units", async()=>{
    await as(OP);
    const part=(qty:number)=>[{sku:SKU,qty,cost:null,cost_source:null,commercial_treatment:null,sources:[{order_id:SO,so:SO_NO,order_line_id:LINE,qty}]}];
    const first=await issue(part(1),true);
    expect((await q("select so_line_remaining_requirement($1) n",[LINE])).rows[0].n).toBe(2);
    const second=await issue(part(2),true);
    expect(first.po_ids[0]).not.toBe(second.po_ids[0]);
    expect((await q("select so_line_remaining_requirement($1) n",[LINE])).rows[0].n).toBe(0);
    await q("reset role");
    expect(Number((await q("select count(*) n from ops_stock_items where po_no=any($1)",[[...first.po_ids,...second.po_ids]])).rows[0].n)).toBe(3);
  });
  it("a repeated source inside one batch cannot overbuy and leaves no PO", async()=>{
    await as(OP);
    const before=Number((await q("select count(*) n from purchase_orders where supplier_id=$1",[SUP])).rows[0].n);
    await q("savepoint repeated_source");
    await expect(issue([1,2].map(()=>({sku:SKU,qty:2,cost:null,cost_source:null,commercial_treatment:null,sources:[{order_id:SO,so:SO_NO,order_line_id:LINE,qty:2}]})),true)).rejects.toMatchObject({detail:"unknown_demand"});
    await q("rollback to savepoint repeated_source");
    expect(Number((await q("select count(*) n from purchase_orders where supplier_id=$1",[SUP])).rows[0].n)).toBe(before);
  });
  it("a reserved Unit on its linked PO covers once, not twice", async()=>{
    await as(OP);
    const first=await issue([{sku:SKU,qty:1,cost:null,cost_source:null,commercial_treatment:null,sources:[{order_id:SO,so:SO_NO,order_line_id:LINE,qty:1}]}],true);
    await q("reset role");
    await q("update ops_stock_items set reserved_order_line_id=$1 where po_no=$2",[LINE,first.po_ids[0]]);
    await as(OP);
    expect((await q("select so_line_remaining_requirement($1) n",[LINE])).rows[0].n).toBe(2);
    await issue([{sku:SKU,qty:2,cost:null,cost_source:null,commercial_treatment:null,sources:[{order_id:SO,so:SO_NO,order_line_id:LINE,qty:2}]}],true);
    expect((await q("select so_line_remaining_requirement($1) n",[LINE])).rows[0].n).toBe(0);
  });
  it("distinct same-SKU SO lines keep separate caps and identity", async()=>{
    await q("insert into order_lines(id,order_id,sku,qty,unit_price) values($1,$2,$3,2,1000)",[id(9),SO,SKU]);
    await as(OP);
    const result=await issue([{sku:SKU,qty:5,cost:null,cost_source:null,commercial_treatment:null,sources:[{order_id:SO,so:SO_NO,order_line_id:LINE,qty:3},{order_id:SO,so:SO_NO,order_line_id:id(9),qty:2}]}],true);
    expect((await q("select order_line_id,qty from po_line_sources where po_id=$1 order by order_line_id",[result.po_ids[0]])).rows).toEqual([{order_line_id:LINE,qty:3},{order_line_id:id(9),qty:2}]);
  });
  it("an unproceeded source is refused before numbering", async()=>{
    await q("update orders set status='place' where id=$1",[SO]);
    await as(OP); await q("savepoint changed_order");
    await expect(issue([{sku:SKU,qty:3,cost:null,cost_source:null,commercial_treatment:null,sources:[{order_id:SO,so:SO_NO,order_line_id:LINE,qty:3}]}],true)).rejects.toMatchObject({detail:"unknown_demand"});
    await q("rollback to savepoint changed_order");
    expect(Number((await q("select count(*) n from purchase_orders where supplier_id=$1",[SUP])).rows[0].n)).toBe(0);
  });
  it("legitimate reserve, partial buy, release and final buy keep their quantities", async()=>{
    await as(OP);
    await q("select ops_stock_pool_draw($1,'used_instead_of_ordering',null,$2,null,null,null,$3,null)",[`SO-${SO_NO}`,id(21),LINE]);
    expect((await q("select so_line_remaining_requirement($1) n",[LINE])).rows[0].n).toBe(2);
    const part=(qty:number)=>[{sku:SKU,qty,cost:null,cost_source:null,commercial_treatment:null,sources:[{order_id:SO,so:SO_NO,order_line_id:LINE,qty}]}];
    await issue(part(2),true);
    expect((await q("select so_line_remaining_requirement($1) n",[LINE])).rows[0].n).toBe(0);
    await q("select ops_stock_release($1)",[id(21)]);
    expect((await q("select so_line_remaining_requirement($1) n",[LINE])).rows[0].n).toBe(1);
    await issue(part(1),true);
    expect((await q("select so_line_remaining_requirement($1) n",[LINE])).rows[0].n).toBe(0);
  });
  it("anonymous incoming stock remains an explicit choice and keeps its Unit IDs on release", async()=>{
    await as(OP);
    const pool=await issue([{sku:SKU,qty:2,cost:null,cost_source:null,commercial_treatment:null}]);
    expect((await q("select so_line_remaining_requirement($1) n",[LINE])).rows[0].n).toBe(3);
    await q("select so_batch_use_po_units($1,'used_instead_of_ordering',null,$2,$3,$4)",[`SO-${SO_NO}`,SO,LINE,pool.po_ids[0]]);
    expect((await q("select so_line_remaining_requirement($1) n",[LINE])).rows[0].n).toBe(1);
    const ids=(await q("select id,unit_code from ops_stock_items where po_no=$1 order by id",[pool.po_ids[0]])).rows;
    await q("select so_batch_save_ready_units($1,'used_instead_of_ordering',null,$2,$3,$4::jsonb)",[`SO-${SO_NO}`,SO,LINE,JSON.stringify([ids[0].id])]);
    expect((await q("select so_line_remaining_requirement($1) n",[LINE])).rows[0].n).toBe(2);
    expect((await q("select id,unit_code from ops_stock_items where po_no=$1 order by id",[pool.po_ids[0]])).rows).toEqual(ids);
  });
  it("concurrent ordinary issuers cannot commit the same SO quantity twice", async()=>{
    const a=new pg.Client({connectionString:url}), b=new pg.Client({connectionString:url});
    await Promise.all([a.connect(),b.connect()]);
    const batch=JSON.stringify([{supplier_id:SUP,warehouse_id:WH,destination_id:DEST,eta_date:"2026-11-10",purpose:"customer_sales",so_refs:[SO_NO],lines:[{sku:SKU,qty:3,cost:null,cost_source:null,commercial_treatment:null,sources:[{order_id:SO,so:SO_NO,order_line_id:LINE,qty:3}]}]}]);
    async function attempt(c:pg.Client) {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:OP,role:"authenticated"})]);
      await c.query("set local role authenticated");
      try {
        const r=await c.query("select purchasing_issue_pos_batch($1::jsonb) result",[batch]);
        await c.query("commit"); return {ok:true,result:r.rows[0].result};
      } catch(e) { await c.query("rollback"); return {ok:false,detail:(e as {detail:string}).detail}; }
    }
    try {
      const results=await Promise.all([attempt(a),attempt(b)]);
      expect(results.filter(r=>r.ok)).toHaveLength(1);
      expect(results.find(r=>!r.ok)?.detail).toBe("unknown_demand");
      expect(Number((await q("select sum(qty) n from po_line_sources where order_line_id=$1",[LINE])).rows[0].n)).toBe(3);
      expect(Number((await q("select count(*) n from purchase_orders where supplier_id=$1",[SUP])).rows[0].n)).toBe(1);
    } finally { await Promise.all([a.end(),b.end()]); }
  });
  it("issue and exact Ready Stock reservation cannot both consume one source", async()=>{
    const a=new pg.Client({connectionString:url}), b=new pg.Client({connectionString:url});
    await Promise.all([a.connect(),b.connect()]);
    async function begin(c:pg.Client){await c.query("begin");await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:OP,role:"authenticated"})]);await c.query("set local role authenticated");}
    try {
      await Promise.all([begin(a),begin(b)]);
      await a.query("select purchasing_issue_pos_batch($1::jsonb)",[JSON.stringify([{supplier_id:SUP,warehouse_id:WH,destination_id:DEST,eta_date:"2026-11-10",purpose:"customer_sales",so_refs:[SO_NO],lines:[{sku:SKU,qty:1,cost:null,cost_source:null,commercial_treatment:null,sources:[{order_id:SO,so:SO_NO,order_line_id:id(20),qty:1}]}]}])]);
      let settled=false;
      const draw=b.query("select ops_stock_pool_draw($1,'used_instead_of_ordering',null,$2,null,null,null,$3,null)",[`SO-${SO_NO}`,id(21),id(20)])
        .then(()=>({ok:true,code:null}),e=>({ok:false,code:e.message})).finally(()=>{settled=true;});
      await new Promise(r=>setTimeout(r,150));
      const waited=!settled;
      await a.query("commit");
      const result=await draw;
      await b.query("rollback");
      expect(waited).toBe(true);
      expect(result).toMatchObject({ok:false,code:"line_already_covered"});
    } finally {await a.query("rollback");await b.query("rollback");await Promise.all([a.end(),b.end()]);}
  });
  it("supplier channel maintenance preserves other contacts and audits the actual editor", async()=>{
    await as(BOSS);
    await q("select purchasing_set_supplier_channel($1,'contact_email','fixture@example.invalid')",[SUP]);
    await q("select purchasing_set_supplier_channel($1,'po_send_channel','email')",[SUP]);
    await q("reset role");
    expect((await q("select contact_email,po_send_channel from suppliers where id=$1",[SUP])).rows[0])
      .toEqual({contact_email:"fixture@example.invalid",po_send_channel:"email"});
    expect((await q("select changed_by,old_value,new_value from purchasing_setting_changes where supplier_id=$1 and setting_key='supplier_contact_email'",[SUP])).rows[0])
      .toMatchObject({changed_by:BOSS,old_value:null,new_value:"fixture@example.invalid"});
    await as(OP); await q("savepoint channel_refusal");
    await expect(q("select purchasing_set_supplier_channel($1,'contact_email','other@example.invalid')",[SUP])).rejects.toBeTruthy();
    await q("rollback to savepoint channel_refusal");
  });

});
