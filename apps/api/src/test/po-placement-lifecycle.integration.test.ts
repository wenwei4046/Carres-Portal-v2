import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from "vitest";
import pg from "pg";
import { writeFileSync } from "node:fs";

// Full local migration chain; no real supplier messages or durable transactions.
const url = process.env.CARRES_TEST_DATABASE_URL ?? "";
const id = (n: number) => `aa062800-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OP=id(1), BOSS=id(2), SUP=id(3), WH=id(4), DEST=id(5), MODEL=id(6), SO=id(7), LINE=id(8);
const SKU="IT-PO-PLACEMENT";
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
      await q("insert into auth.users(id,email) values($1,$2)",[who,`${role}-0628@example.invalid`]);
      await q("insert into app_users(id,email,name,role,status,is_person) values($1,$2,$3,$4,'active',true)",[who,`${role}-0628@example.invalid`,`Fixture ${role}`,role]);
    }
    await q("insert into suppliers(id,name,slug,kind,address) values($1,'Fixture supplier','it-po-placement','own_logistics','Fixture supplier address')",[SUP]);
    await q("insert into warehouses(id,name,address) values($1,'Fixture warehouse','Fixture warehouse address')",[WH]);
    await q("insert into purchasing_destinations(id,name,warehouse_id) values($1,'Fixture destination',$2)",[DEST,WH]);
    await q("insert into product_models(id,category,model_key,name) values($1,'mattress','it-po-placement','Fixture mattress')",[MODEL]);
    await q("insert into product_skus(model_id,sku,variant,variant_kind,price,supplier_id,stock_identity_mode) values($1,$2,'King','size',1000,$3,'exact_unit')",[MODEL,SKU,SUP]);
    await q("insert into purchasing_production_days(supplier_id,category,working_days) values($1,'mattress',7)",[SUP]);
    await q("insert into workspace_duty_assignments(duty_key,holder_id,effective_from) values('purchasing_approver',$1,current_date)",[BOSS]);
    await q("insert into orders(id,so,dealer_id,customer_name,customer_phone,delivery_date,status,terms_accepted,salesperson_id) select $1,962800,id,'Fixture customer','0100000000',current_date+30,'proceed_order',true,'aa062800-0000-4000-8000-000000000001'::uuid from dealers limit 1",[SO]);
    await q("insert into order_lines(id,order_id,sku,qty,unit_price) values($1,$2,$3,1,1000)",[LINE,SO,SKU]);
    await q("set local session_replication_role=origin");
  },30000);
  beforeEach(async()=>{await q("savepoint test_case");});
  afterEach(async()=>{await q("rollback to savepoint test_case");});
  afterAll(async()=>{if(db){await q("rollback");await db.end();}});
  async function issue(lines:unknown[], so=false) {
    const r=await q("select purchasing_issue_pos_batch($1::jsonb) result",[JSON.stringify([{supplier_id:SUP,warehouse_id:WH,destination_id:DEST,eta_date:"2026-11-10",purpose:so?"customer_sales":"ready_stock",...(so?{so_refs:[962800]}:{}),lines}])]);
    return r.rows[0].result;
  }
  async function documentAndSend(po:string){
    const assigned=(await q("select purchasing_po_actor() a")).rows[0].a;
    const document=(await q("select purchasing_po_document($1) d",[po])).rows[0].d;
    expect(document.lines).toHaveLength(1);
    expect(document.lines[0]).not.toHaveProperty("cost");
    if (process.env.PO_PLACEMENT_ARTIFACTS) writeFileSync(`${process.env.PO_PLACEMENT_ARTIFACTS}/${po}.json`, JSON.stringify(document));
    await q("select purchasing_confirm_po_sent($1,1,'email','fixture@example.invalid','Local test only')",[po]);
    await q("reset role");
    const send=(await q("select sent_by,po_version from po_sends where po_id=$1 and kind='confirmed_sent'",[po])).rows[0];
    expect(send).toMatchObject({sent_by:OP,po_version:1});
    const history=(await q("select by_user_id,issue_authority,issue_duty_user_id,issue_cover_user_id from po_history where po_id=$1 and text='Purchase order issued'",[po])).rows[0];
    expect(history).toMatchObject({by_user_id:OP,issue_authority:"operation_staff",issue_duty_user_id:assigned.normal_user_id,issue_cover_user_id:assigned.acting_user_id});
    expect(assigned.normal_user_id).not.toBe(OP);
  }
  it("SO Batch issues, produces document data and records the actual sender",async()=>{
    await as(OP);
    const result=await issue([{sku:SKU,qty:1,cost:null,cost_source:null,commercial_treatment:null,sources:[{order_id:SO,so:962800,order_line_id:LINE,qty:1}]}],true);
    expect(result.po_ids).toHaveLength(1);
    await documentAndSend(result.po_ids[0]);
  });
  it("Manual Purchase requires its approver before ordinary staff issue",async()=>{
    await as(OP);
    const request=(await q("select purchasing_create_request_with_lines('ready_stock',$1,null,current_date+30,null,null,null,$2::jsonb,'additional_stock',null) r",[DEST,JSON.stringify([{sku:SKU,qty:1}])])).rows[0].r;
    await q("savepoint approval_refusal");
    await expect(q("select purchasing_decide_request($1,'approve',null)",[request.id])).rejects.toBeTruthy();
    await q("rollback to savepoint approval_refusal");
    await as(BOSS);
    await q("select purchasing_decide_request($1,'approve',null)",[request.id]);
    await as(OP);
    const demand=(await q("select id from purchase_demands where request_id=$1",[request.id])).rows[0].id;
    const result=await issue([{sku:SKU,qty:1,cost:null,cost_source:null,commercial_treatment:null,demand_id:demand}]);
    expect(result.po_ids).toHaveLength(1);
    await documentAndSend(result.po_ids[0]);
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
