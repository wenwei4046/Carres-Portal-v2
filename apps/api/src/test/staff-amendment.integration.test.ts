import { afterEach, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { priceStaffAmendment } from "../lib/staff-amendment-pricing";
import type { SupabaseClient } from "@supabase/supabase-js";

// Real PostgreSQL, local disposable fixtures only. Never count a skip as a pass.
const URL = process.env.CARRES_TEST_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/[^@/]*@?(localhost|127\.0\.0\.1)(:\d+)?\//.test(URL);
const OP = "b1000000-0000-4000-8000-000000000001";
const PR = "b1000000-0000-4000-8000-000000000002";
const OTHER = "b1000000-0000-4000-8000-000000000003";

describe.skipIf(!LOCAL)("staff amendment policy on real PostgreSQL", () => {
  let db: pg.Client;
  let order: string;
  let line: string;
  const q = (sql: string, values: unknown[] = []) => db.query(sql, values);
  const one = async (sql: string, values: unknown[] = []) => (await q(sql, values)).rows[0];
  const as = (id: string) => q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub:id,role:"authenticated"})]);
  const proposal = (price = 2749, qty = 2) => ({lines:[{id:line,sku:"TRION-Q",qty,unit_price:price,attrs:{gap:"KIV"}}]});
  const agreement = {kind:"customer_confirmation",reference:"WhatsApp fixture reply 1"};
  async function price(p: unknown) {
    const adapter={from:(table:string)=>({select:()=>({eq:()=>({maybeSingle:async()=>({error:null,data:table==="orders"
      ? await one("select o.*,coalesce((select jsonb_agg(to_jsonb(l)) from order_lines l where l.order_id=o.id),'[]') order_lines,coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'addon_key',a.addon_key,'qty',a.qty,'unit_price',a.unit_price,'attrs',a.attrs)) from order_addons a where a.order_id=o.id),'[]') order_addons from orders o where o.id=$1",[order])
      : table==="floor_config" ? await one("select * from floor_config where id=1") : await one("select key from addons where key='STAIR_CARRY'")})})})})};
    return (await priceStaffAmendment(adapter as unknown as SupabaseClient,order,p as Record<string,unknown>)).proposed;
  }
  async function submit(p: unknown = proposal(), evidence: unknown = agreement) {
    p=await price(p);
    return (await one("select sales_order_submit_staff_amendment($1,$2,'Customer request',null,$3) r",[order,JSON.stringify(p),evidence ? JSON.stringify(evidence):null])).r;
  }
  async function refused(sql: string, values: unknown[], code: string) {
    await q("savepoint refusal");
    let caught: unknown;
    try { await q(sql,values); } catch(e) { caught=e; }
    await q("rollback to savepoint refusal");
    expect(caught).toMatchObject({detail:code});
  }
  beforeEach(async()=>{
    db=new pg.Client({connectionString:URL}); await db.connect(); await q("begin");
    for(const [id,role] of [[OP,"operation"],[PR,"principal"],[OTHER,"principal"]]) {
      await q("insert into auth.users(id,email) values($1,$2)",[id,`${id}@test.local`]);
      await q("insert into app_users(id,email,name,role,status,is_person) values($1,$2,$3,$4,'active',true)",[id,`${id}@test.local`,role,role]);
    }
    const dealer=await one("select id from dealers limit 1");
    const sp=await one("insert into salespersons(dealer_id,name) values($1,'Test Seller') returning id",[dealer.id]);
    order=(await one("insert into orders(dealer_id,salesperson_id,customer_name,customer_phone,status,proceed_date,delivery_date,delivery_floor,delivery_has_lift) values($1,$2,'TEST','0100000000','proceed_order','2026-09-17','2026-10-26',1,false) returning id",[dealer.id,sp.id])).id;
    line=(await one("insert into order_lines(order_id,sku,qty,unit_price,attrs) values($1,'TRION-Q',1,2749,'{\"gap\":\"KIV\"}') returning id",[order])).id;
    await as(OP);
  });
  afterEach(async()=>{if(db){await q("rollback").catch(()=>{});await db.end();}});

  async function guarded(expected: unknown, proposed: unknown = proposal(), replace: string | null = null, evidence: unknown = agreement) {
    proposed=await price(proposed);
    return one("select sales_order_commit_staff_change($1,$2,'submit',null,$3,'Customer request',null,$4,$5) r",[order,JSON.stringify(expected),JSON.stringify(proposed),evidence ? JSON.stringify(evidence):null,replace]);
  }
  it("a draft opened before another staff edit cannot overwrite that change",async()=>{
    const expected=(await one("select _sales_order_edit_baseline($1) b",[order])).b;
    await q("update orders set customer_phone='0199999999' where id=$1",[order]);
    await refused("select sales_order_commit_staff_change($1,$2,'submit',null,$3,'Customer request',null,$4,null)",[order,JSON.stringify(expected),JSON.stringify(proposal()),JSON.stringify(agreement)],"order_edit_stale");
    expect((await one("select qty from order_lines where id=$1",[line])).qty).toBe(1);
    expect((await one("select count(*)::int n from sales_order_amendments where order_id=$1",[order])).n).toBe(0);
  });
  it("a current opened baseline commits the ordinary change once; retry is stale",async()=>{
    const expected=(await one("select _sales_order_edit_baseline($1) b",[order])).b;
    expect((await guarded(expected)).r.status).toBe("applied");
    await refused("select sales_order_commit_staff_change($1,$2,'submit',null,$3,'retry',null,$4,null)",[order,JSON.stringify(expected),JSON.stringify(proposal()),JSON.stringify(agreement)],"order_edit_stale");
  });
  it("a failed replacement retains the previous request and its evidence",async()=>{
    const old=await submit(proposal(),null);
    await q("update order_lines set unit_price=2800 where id=$1",[line]);
    const expected=(await one("select _sales_order_edit_baseline($1) b",[order])).b;
    const replacement=await price(proposal(2800));
    await refused("select sales_order_commit_staff_change($1,$2,'submit',null,$3,'replace',null,$4,$5)",[order,JSON.stringify(expected),JSON.stringify(replacement),JSON.stringify({...agreement,reference:" "}),old.id],"agreement_reference_required");
    expect((await one("select status from sales_order_amendments where id=$1",[old.id])).status).toBe("submitted");
    expect((await one("select count(*)::int n from sales_order_amendments where order_id=$1",[order])).n).toBe(1);
  });
  it("no PIC addresses the event to the resolved Delivery Duty without changing ownership",async()=>{
    await assign("delivery_duty",OTHER);
    const r=await submit();
    const event=await one("select detail from ops_activity_log where detail->>'amendment_id'=$1 order by occurred_at desc limit 1",[r.id]);
    expect(event.detail).toMatchObject({recipient_id:OTHER,recipient_duty:"delivery_duty",recipient_outcome:"assignment"});
    expect((await one("select assigned_staff from ops_order_control where order_id=$1",[order]))?.assigned_staff ?? null).toBeNull();
  });
  it("no PIC and no Delivery Duty leaves an explicit unassigned event, not a false notification",async()=>{
    const r=await submit();
    const event=await one("select detail from ops_activity_log where detail->>'amendment_id'=$1 order by occurred_at desc limit 1",[r.id]);
    expect(event.detail).toMatchObject({recipient_id:null,recipient_duty:"delivery_duty",recipient_outcome:"not_assigned"});
  });
  async function stairs() {
    await q("insert into floor_config(id,free_up_to_floor,per_floor_per_item) values(1,2,50) on conflict(id) do update set free_up_to_floor=2,per_floor_per_item=50");
    await q("update orders set delivery_floor=3,delivery_has_lift=false,delivery_stair_items=2,stair_rate_per_floor_per_item=50,stair_rate_free_up_to_floor=2 where id=$1",[order]);
    await q("insert into order_addons(order_id,addon_key,qty,unit_price) values($1,'STAIR_CARRY',1,50)",[order]);
  }
  async function money() {
    const row=await one("select (select qty from order_lines where id=$2) qty,(select coalesce(sum(qty*unit_price),0)::numeric from order_addons where order_id=$1 and addon_key='STAIR_CARRY') fee,(select snapshot->'addons' from sales_order_revisions where order_id=$1 order by revision desc limit 1) snapshot",[order,line]);
    return {...row,fee:Number(row.fee)};
  }
  async function failFeeWrite() {
    await q("create function pg_temp.refuse_stair_fixture() returns trigger language plpgsql as $$ begin if new.addon_key='STAIR_CARRY' then raise exception 'fixture fee write failed' using detail='fixture_fee_failure'; end if; return new; end $$");
    await q("create trigger local_stair_failure before insert on order_addons for each row execute function pg_temp.refuse_stair_fixture()");
  }
  it("ordinary no-PO goods and pinned fee become effective in the same immutable revision",async()=>{
    await stairs();
    const r=await submit();expect(r.status).toBe("applied");
    expect(await money()).toMatchObject({qty:2,fee:100,snapshot:[{addon_key:"STAIR_CARRY",qty:1,unit_price:100}]});
  });
  it("supplier-final apply includes the fee and price exception's complete financial impact",async()=>{
    await stairs();await assign("po_duty",OP);await assign("sales_approver",PR);
    const {po,pl}=await coverLine();const r=await submit(proposal(1000));
    expect((await one("select sales_order_amendment_impact($1) impact",[r.id])).impact.commercial_delta).toBe(-699);
    await as(PR);await q("select sales_order_decide_amendment($1,'approve','Price agreed')",[r.id]);
    expect(await money()).toMatchObject({qty:1,fee:50});
    await as(OP);await q("select sales_order_record_supplier_confirmation($1,$2,$3,$4,'confirmed','2026-10-29','Supplier reply')",[r.id,po,pl,line]);
    expect(await money()).toMatchObject({qty:2,fee:100,snapshot:[{addon_key:"STAIR_CARRY",qty:1,unit_price:100}]});
    await refused("select sales_order_record_supplier_confirmation($1,$2,$3,$4,'confirmed','2026-10-29','Retry')",[r.id,po,pl,line],"already_decided");
    expect((await one("select count(*)::int n from sales_order_revisions where order_id=$1",[order])).n).toBe(2);
  });
  it("failure writing a computed fee rolls back ordinary goods, fee, request and revision",async()=>{
    await stairs();const proposed=await price(proposal());await failFeeWrite();
    await refused("select sales_order_submit_staff_amendment($1,$2,'why',null,$3)",[order,JSON.stringify(proposed),JSON.stringify(agreement)],"fixture_fee_failure");
    expect(await money()).toMatchObject({qty:1,fee:50,snapshot:null});
    expect((await one("select count(*)::int n from sales_order_amendments where order_id=$1",[order])).n).toBe(0);
  });
  it("supplier-final fee failure leaves its prior pending request unchanged and can be retried",async()=>{
    await stairs();await assign("po_duty",OP);const {po,pl}=await coverLine();const r=await submit();await failFeeWrite();
    await refused("select sales_order_record_supplier_confirmation($1,$2,$3,$4,'confirmed','2026-10-29','Supplier reply')",[r.id,po,pl,line],"fixture_fee_failure");
    expect(await money()).toMatchObject({qty:1,fee:50});
    expect(await one("select status,supplier_confirmations from sales_order_amendments where id=$1",[r.id])).toEqual({status:"submitted",supplier_confirmations:[]});
    await q("drop trigger local_stair_failure on order_addons");
    await q("select sales_order_record_supplier_confirmation($1,$2,$3,$4,'confirmed','2026-10-29','Retry after recovery')",[r.id,po,pl,line]);
    expect(await money()).toMatchObject({qty:2,fee:100,snapshot:[{addon_key:"STAIR_CARRY",unit_price:100}]});
  });
  it("a changed pricing pin makes a pending proposal stale rather than changing its agreed fee",async()=>{
    await stairs();await assign("po_duty",OP);const {po,pl}=await coverLine();const r=await submit();
    await q("update orders set stair_rate_per_floor_per_item=60 where id=$1",[order]);
    expect((await one("select sales_order_amendment_live($1) r",[order])).r.amendment.stale).toBe(true);
    await refused("select sales_order_record_supplier_confirmation($1,$2,$3,$4,'confirmed','2026-10-29','Supplier reply')",[r.id,po,pl,line],"amendment_stale");
    expect(await money()).toMatchObject({qty:1,fee:50});
  });
  it("a later live tariff change cannot reprice an order's pinned fee",async()=>{
    await stairs();await assign("po_duty",OP);const {po,pl}=await coverLine();const r=await submit();
    await q("update floor_config set per_floor_per_item=90,free_up_to_floor=1 where id=1");
    await q("select sales_order_record_supplier_confirmation($1,$2,$3,$4,'confirmed','2026-10-29','Supplier reply')",[r.id,po,pl,line]);
    expect(await money()).toMatchObject({qty:2,fee:100,snapshot:[{addon_key:"STAIR_CARRY",unit_price:100}]});
    expect((await one("select stair_rate_per_floor_per_item rate from orders where id=$1",[order])).rate).toBe("50.00");
  });
  it("an unpinned tariff move invalidates the proposed amount before final effect",async()=>{
    await stairs();await q("update orders set stair_rate_per_floor_per_item=null,stair_rate_free_up_to_floor=null where id=$1",[order]);
    await q("update floor_config set per_floor_per_item=50,free_up_to_floor=2 where id=1");
    await assign("po_duty",OP);const {po,pl}=await coverLine();const r=await submit();
    await q("update floor_config set per_floor_per_item=60 where id=1");
    await refused("select sales_order_record_supplier_confirmation($1,$2,$3,$4,'confirmed','2026-10-29','Supplier reply')",[r.id,po,pl,line],"amendment_stale");
    expect(await money()).toMatchObject({qty:1,fee:50});
    expect((await one("select sales_order_amendment_live($1) r",[order])).r.amendment.stale).toBe(true);
  });
  it("a pre-Proceed floor correction keeps its original snapshot and removes the fee atomically",async()=>{
    await stairs();await q("update orders set status='place' where id=$1",[order]);
    const expected=(await one("select _sales_order_edit_baseline($1) b",[order])).b;
    const proposed=await price({header:{delivery_floor:2}});
    await q("select sales_order_commit_staff_change($1,$2,'save',$3,$4,'Floor corrected',null,null,null)",[order,JSON.stringify(expected),JSON.stringify({delivery_floor:2}),JSON.stringify(proposed)]);
    expect(await money()).toMatchObject({qty:1,fee:0,snapshot:[]});
    expect((await one("select snapshot->'addons' addons from sales_order_revisions where order_id=$1 and revision=1",[order])).addons).toEqual([{addon_key:"STAIR_CARRY",qty:1,unit_price:50,attrs:null}]);
  });
  it("ordinary no-PO amendment applies once with actual actor and evidence",async()=>{
    const r=await submit(); expect(r.status).toBe("applied");
    expect((await one("select qty from order_lines where id=$1",[line])).qty).toBe(2);
    const a=await one("select submitted_by,decided_by,customer_agreement_reference from sales_order_amendments where id=$1",[r.id]);
    expect(a).toMatchObject({submitted_by:OP,decided_by:OP,customer_agreement_reference:agreement.reference});
    await refused("select sales_order_decide_amendment($1,'approve','again')",[r.id],"already_decided");
  });
  it("evidence-free request remains pending and does not change goods",async()=>{
    const r=await submit(proposal(),null);expect(r.status).toBe("submitted");
    expect((await one("select qty from order_lines where id=$1",[line])).qty).toBe(1);
    await refused("select sales_order_decide_amendment($1,'approve','apply')",[r.id],"customer_agreement_required");
  });
  it("an invalid evidence reference rolls back the whole submit",async()=>{
    await refused("select sales_order_submit_staff_amendment($1,$2,'why',null,$3)",[order,JSON.stringify(proposal()),JSON.stringify({...agreement,reference:" "})],"agreement_reference_required");
    expect((await one("select count(*)::int n from sales_order_amendments where order_id=$1",[order])).n).toBe(0);
  });
  it("later date-only amendment applies without supplier review",async()=>{
    expect((await submit({delivery_date:"2026-11-02"})).status).toBe("applied");
    expect((await one("select delivery_date::text d from orders where id=$1",[order])).d).toBe("2026-11-02");
  });
  it("earlier date is refused when goods are not physically ready",async()=>{
    await refused("select sales_order_submit_staff_amendment($1,$2,'why',null,$3)",[order,JSON.stringify({delivery_date:"2026-10-20"}),JSON.stringify(agreement)],"earlier_date_goods_not_ready");
  });
  it("price decrease waits even when a Principal submits; role alone cannot approve",async()=>{
    const r=await submit(proposal(1000,1));expect(r.status).toBe("submitted");
    await as(PR);
    await refused("select sales_order_decide_amendment($1,'approve','agreed')",[r.id],"sales_approver_unassigned");
  });
  it("shared duty qualification requires Principal for Sales Approver and keeps other roles",async()=>{
    const r=await one("select workspace_duty_holder_roles('sales_approver') sales,workspace_duty_holder_roles('finance_approver') finance");
    expect(r).toEqual({sales:["principal"],finance:["finance"]});
  });
  async function assign(key: string, holder: string) {
    await q("select set_config('request.jwt.claims','',true)");
    await q("insert into workspace_duty_assignments(duty_key,holder_id,effective_from) values($1,$2,current_date)",[key,holder]);
    await as(OP);
  }
  async function coverLine(which = line) {
    const wh=await one("select id from warehouses limit 1");
    const supplier=await one("select id from suppliers limit 1");
    const po=`TEST-SO-${order.slice(0,8)}`;
    await q("insert into purchase_orders(id,supplier_id,warehouse_id) values($1,$2,$3)",[po,supplier.id,wh.id]);
    const pl=await one("insert into purchase_order_lines(po_id,sku,qty) values($1,'TRION-Q',1) returning id",[po]);
    await q("insert into po_line_sources(po_id,po_line_id,sku,order_id,order_line_id,qty) values($1,$2,'TRION-Q',$3,$4,1)",[po,pl.id,order,which]);
    return {po,pl:pl.id};
  }
  it("assigned Principal can approve a price decrease; another Principal cannot",async()=>{
    await assign("sales_approver",PR);
    const r=await submit(proposal(1000,1));
    await as(OTHER);
    await refused("select sales_order_decide_amendment($1,'approve','agreed')",[r.id],"sales_approver_required");
    await as(PR);
    expect((await one("select sales_order_decide_amendment($1,'approve','agreed') r",[r.id])).r.status).toBe("applied");
  });
  it("the resolved Sales Approver may approve their own exception with the real same-person audit",async()=>{
    await assign("sales_approver",PR);await as(PR);
    const r=await submit(proposal(1000,1));
    expect((await one("select sales_order_decide_amendment($1,'approve','own') r",[r.id])).r.status).toBe("applied");
    expect(await one("select submitted_by,sales_approved_by,sales_approval_note from sales_order_amendments where id=$1",[r.id]))
      .toEqual({submitted_by:PR,sales_approved_by:PR,sales_approval_note:"own"});
  });
  it("self-approval records only the decision until supplier and customer evidence are complete",async()=>{
    await assign("sales_approver",PR); await assign("po_duty",OP);
    const {po,pl}=await coverLine(); await as(PR);
    const r=await submit(proposal(1000,2),null);
    expect((await one("select sales_order_decide_amendment($1,'approve','own reason') r",[r.id])).r.status).toBe("submitted");
    expect((await one("select qty,unit_price from order_lines where id=$1",[line])).qty).toBe(1);
    await as(OP);
    expect((await one("select sales_order_record_supplier_confirmation($1,$2,$3,$4,'confirmed','2026-10-20','Supplier reply') r",[r.id,po,pl,line])).r.status).toBe("submitted");
    expect((await one("select sales_order_record_staff_agreement($1,'customer_confirmation','Customer WhatsApp',null) r",[r.id])).r.status).toBe("applied");
    expect(await one("select submitted_by,sales_approved_by,decided_by from sales_order_amendments where id=$1",[r.id]))
      .toEqual({submitted_by:PR,sales_approved_by:PR,decided_by:OP});
  });
  it("dated Principal cover is the resolved reviewer and can decide their own request",async()=>{
    await assign("sales_approver",PR);
    await q("select set_config('request.jwt.claims','',true)");
    await q("insert into workspace_duty_covers(duty_key,normal_user_id,acting_user_id,starts_on,ends_on,reason) values('sales_approver',$1,$2,current_date,current_date,'Local cover fixture')",[PR,OTHER]);
    await as(OTHER); const r=await submit(proposal(1000,1));
    await as(PR); await refused("select sales_order_decide_amendment($1,'approve','normal holder')",[r.id],"sales_approver_required");
    await as(OTHER);
    expect((await one("select sales_order_decide_amendment($1,'approve','cover decision') r",[r.id])).r.status).toBe("applied");
  });
  it("a PO on another line does not hold an ordinary change",async()=>{
    const other=(await one("insert into order_lines(order_id,sku,qty,unit_price) values($1,'TRION-Q',1,2749) returning id",[order])).id;
    await coverLine(other);
    expect((await submit({lines:[...proposal().lines,{id:other,sku:"TRION-Q",qty:1,unit_price:2749}]})).status).toBe("applied");
  });
  it("changed-line PO needs PO Duty and a known supplier date; one mixed outcome",async()=>{
    await assign("po_duty",OP);
    const {po,pl}=await coverLine();
    const r=await submit({...proposal(),delivery_date:"2026-11-02"});expect(r.status).toBe("submitted");
    await refused("select sales_order_decide_amendment($1,'approve','no reply')",[r.id],"supplier_confirmation_required");
    const call="select sales_order_record_supplier_confirmation($1,$2,$3,$4,'confirmed',$5,'Supplier WhatsApp fixture') r";
    const args=[r.id,po,pl,line];
    expect((await one(call,[...args,null])).r.status).toBe("submitted");
    expect((await one("select delivery_date::text d from orders where id=$1",[order])).d).toBe("2026-10-26");
    expect((await one(call,[...args,"2026-10-29"])).r.status).toBe("applied");
    expect((await one("select delivery_date::text d from orders where id=$1",[order])).d).toBe("2026-11-02");
    expect((await one("select qty from purchase_order_lines where id=$1",[pl])).qty).toBe(1);
  });
  it("approval can precede supplier confirmation without partial effectiveness",async()=>{
    await assign("po_duty",OP);await assign("sales_approver",PR);
    const {po,pl}=await coverLine();
    const mixed={...proposal(1000),delivery_date:"2026-11-02"};mixed.lines[0]!.attrs.gap="BLACK";
    const r=await submit(mixed);
    await as(PR);
    expect((await one("select sales_order_decide_amendment($1,'approve','price agreed') r",[r.id])).r.status).toBe("submitted");
    expect((await one("select unit_price from order_lines where id=$1",[line])).unit_price).toBe("2749.00");
    await as(OP);
    const applied=await one("select sales_order_record_supplier_confirmation($1,$2,$3,$4,'confirmed','2026-10-29','Supplier reply') r",[r.id,po,pl,line]);
    expect(applied.r.status).toBe("applied");
    expect(await one("select qty,unit_price,attrs from order_lines where id=$1",[line])).toEqual({qty:2,unit_price:"1000.00",attrs:{gap:"BLACK"}});
    expect((await one("select delivery_date::text d from orders where id=$1",[order])).d).toBe("2026-11-02");
    expect((await one("select sales_approved_by,decided_by from sales_order_amendments where id=$1",[r.id]))).toEqual({sales_approved_by:PR,decided_by:OP});
  });
  it("supplier refusal holds every part of a mixed goods, price and date change",async()=>{
    await assign("po_duty",OP);await assign("sales_approver",PR);
    const {po,pl}=await coverLine(); const r=await submit({...proposal(1000),delivery_date:"2026-11-02"});
    await as(PR); await q("select sales_order_decide_amendment($1,'approve','price agreed')",[r.id]);
    await as(OP);const answer=await one("select sales_order_record_supplier_confirmation($1,$2,$3,$4,'refused',null,'Supplier cannot change') r",[r.id,po,pl,line]);
    expect(answer.r.status).toBe("submitted");
    expect(await one("select qty,unit_price from order_lines where id=$1",[line])).toEqual({qty:1,unit_price:"2749.00"});
    expect((await one("select delivery_date::text d from orders where id=$1",[order])).d).toBe("2026-10-26");
    expect((await one("select qty from purchase_order_lines where id=$1",[pl])).qty).toBe(1);
  });
  async function readyUnit(kind="warehouse_operator", condition="new") {
    const wh=await one("select id from warehouses limit 1");
    const holder=await one("insert into stock_operating_parties(code,name,kind) values($1,'Test holder',$2) returning id",[order,kind]);
    await q("insert into ops_stock_items(unit_code,sku,warehouse_id,holder_party_id,status,reserved_order_line_id,condition) values(allocate_unit_id(),'TRION-Q',$1,$2,'reserved',$3,$4)",[wh.id,holder.id,line,condition]);
  }
  it("earlier date succeeds only with this line's ready warehouse Unit",async()=>{
    await readyUnit();expect((await submit({delivery_date:"2026-10-20"})).status).toBe("applied");
  });
  it.each([["showroom","new"],["warehouse_operator","damaged"]])("earlier date refuses %s / %s goods",async(kind,condition)=>{
    await readyUnit(kind,condition);
    await refused("select sales_order_submit_staff_amendment($1,$2,'why',null,$3)",[order,JSON.stringify({delivery_date:"2026-10-20"}),JSON.stringify(agreement)],"earlier_date_goods_not_ready");
  });
  it("a lower unit price cannot hide behind a higher quantity and total",async()=>{
    const r=await submit(proposal(2000,2));expect(r.status).toBe("submitted");expect(r.gates.sales_approval_required).toBe(true);
  });
  it("an unchanged payment plan does not add owner approval to ordinary goods",async()=>{
    const o=await one("select installment_months from orders where id=$1",[order]);
    expect((await submit({...proposal(),installment_months:o.installment_months})).status).toBe("applied");
  });
  it("addressed activity keeps the PIC separate from the colleague who acted",async()=>{
    await q("insert into ops_order_control(order_id,assigned_staff) values($1,$2) on conflict(order_id) do update set assigned_staff=excluded.assigned_staff",[order,OTHER]);
    const r=await submit();
    const event=await one("select actor_id,detail from ops_activity_log where order_id=$1 and action='amendment.applied'",[order]);
    expect(event.actor_id).toBe(OP);expect(event.detail.recipient_id).toBe(OTHER);expect(event.detail.amendment_id).toBe(r.id);
    expect((await one("select assigned_staff from ops_order_control where order_id=$1",[order])).assigned_staff).toBe(OTHER);
  });
  it("a later evidence record applies an ordinary pending request",async()=>{
    const r=await submit(proposal(),null);
    expect((await one("select sales_order_record_staff_agreement($1,'customer_confirmation','WhatsApp reply',null) r",[r.id])).r.status).toBe("applied");
  });
  it("refund approval uses Sales Approver and never pays money",async()=>{
    const refund=(await one("insert into order_refunds(order_id,amount,reason,requested_by) values($1,100,'Customer refund',$2) returning id",[order,OP])).id;
    await as(PR);await refused("select refund_decide($1,'approve','agreed')",[refund],"sales_approver_unassigned");
    await assign("sales_approver",PR);await as(PR);
    await q("select refund_decide($1,'approve','agreed')",[refund]);
    expect(await one("select status,paid_at from order_refunds where id=$1",[refund])).toEqual({status:"approved",paid_at:null});
  });
  it("pre-submit routing is read-only, named and matches the pending policy",async()=>{
    await assign("sales_approver",PR);await coverLine();
    const preview=(await one("select sales_order_amendment_route($1,$2) r",[order,JSON.stringify(proposal(1000))])).r;
    expect(preview.sales_approver.acting_user_name).toBe("principal");
    expect((await one("select count(*)::int n from sales_order_amendments where order_id=$1",[order])).n).toBe(0);
    const r=await submit(proposal(1000));expect(r.gates.supplier_scope).toEqual(preview.supplier_scope);
    const work=await q("select * from sales_order_amendment_work($1,null)",[r.id]);
    expect(work.rows[0].gates.sales_approval_required).toBe(true);
  });
  it("legacy source without a line id follows the unique same-SKU line only",async()=>{
    await coverLine();await q("update po_line_sources set order_line_id=null where order_id=$1",[order]);
    expect((await submit()).status).toBe("submitted");
  });
  it("a later waiting answer supersedes an earlier supplier confirmation",async()=>{
    await assign("po_duty",OP);await assign("sales_approver",PR);const {po,pl}=await coverLine();
    const r=await submit(proposal(1000));
    await q("select sales_order_record_supplier_confirmation($1,$2,$3,$4,'confirmed','2026-10-29','First reply')",[r.id,po,pl,line]);
    await q("select sales_order_record_supplier_confirmation($1,$2,$3,$4,'waiting',null,'Supplier checking again')",[r.id,po,pl,line]);
    await as(PR);expect((await one("select sales_order_decide_amendment($1,'approve','price agreed') r",[r.id])).r.status).toBe("submitted");
    expect((await one("select qty from order_lines where id=$1",[line])).qty).toBe(1);
  });
  it("Operation uses the granted public door under the actual authenticated database role",async()=>{
    const expected=(await one("select _sales_order_edit_baseline($1) b",[order])).b;
    await q("set local role authenticated");
    expect((await guarded(expected)).r.status).toBe("applied");
    expect((await one("select has_function_privilege('authenticated','sales_order_submit_staff_amendment(uuid,jsonb,text,date,jsonb)','execute') allowed")).allowed).toBe(false);
    await q("reset role");
  });
  it("ambiguous legacy PO lineage cannot silently bypass confirmation",async()=>{
    await coverLine();await q("update po_line_sources set order_line_id=null where order_id=$1",[order]);
    const other=(await one("insert into order_lines(order_id,sku,qty,unit_price) values($1,'TRION-Q',1,2749) returning id",[order])).id;
    await refused("select sales_order_submit_staff_amendment($1,$2,'why',null,$3)",
      [order,JSON.stringify({lines:[...proposal().lines,{id:other,sku:"TRION-Q",qty:1,unit_price:2749}]}),JSON.stringify(agreement)],"supplier_lineage_unresolved");
  });
  it("date-only change ignores an issued PO covering the same line",async()=>{
    await coverLine();expect((await submit({delivery_date:"2026-11-02"})).status).toBe("applied");
  });

  it("a held source line times out with no partial request; a changed line is stale after release",async()=>{
    const expected=(await one("select _sales_order_edit_baseline($1) b",[order])).b;
    // Commit only this disposable fixture so the second connection sees the source.
    await q("commit");
    const blocker=new pg.Client({connectionString:URL}); await blocker.connect();
    try {
      await blocker.query("begin");
      await blocker.query("update order_lines set qty=4 where id=$1",[line]);
      await q("begin"); await as(OP); await q("set local lock_timeout='150ms'");
      await expect(guarded(expected)).rejects.toMatchObject({code:"55P03"});
      await q("rollback");
      expect((await one("select count(*)::int n from sales_order_amendments where order_id=$1",[order])).n).toBe(0);
      await blocker.query("commit");
      await q("begin"); await as(OP);
      await refused("select sales_order_commit_staff_change($1,$2,'submit',null,$3,'retry',null,$4,null)",[order,JSON.stringify(expected),JSON.stringify(proposal()),JSON.stringify(agreement)],"order_edit_stale");
      expect((await one("select qty from order_lines where id=$1",[line])).qty).toBe(4);
    } finally {
      await blocker.query("rollback"); await blocker.end(); await q("rollback");
      await q("delete from orders where id=$1",[order]);
      await q("delete from app_users where id=any($1::uuid[])",[[OP,PR,OTHER]]);
      await q("delete from auth.users where id=any($1::uuid[])",[[OP,PR,OTHER]]);
      await q("begin");
    }
  });

});
