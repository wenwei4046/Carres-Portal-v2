import { afterEach, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";

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
  async function submit(p: unknown = proposal(), evidence: unknown = agreement) {
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
    const {po,pl}=await coverLine();const r=await submit({...proposal(1000),delivery_date:"2026-11-02"});
    await as(PR);
    expect((await one("select sales_order_decide_amendment($1,'approve','price agreed') r",[r.id])).r.status).toBe("submitted");
    expect((await one("select unit_price from order_lines where id=$1",[line])).unit_price).toBe("2749.00");
    await as(OP);
    const applied=await one("select sales_order_record_supplier_confirmation($1,$2,$3,$4,'confirmed','2026-10-29','Supplier reply') r",[r.id,po,pl,line]);
    expect(applied.r.status).toBe("applied");
    expect((await one("select sales_approved_by,decided_by from sales_order_amendments where id=$1",[r.id]))).toEqual({sales_approved_by:PR,decided_by:OP});
  });
  async function readyUnit(kind="warehouse_operator", condition="new") {
    const wh=await one("select id from warehouses limit 1");
    const holder=await one("insert into stock_operating_parties(code,name,kind) values($1,'Test holder',$2) returning id",[order,kind]);
    await q("insert into ops_stock_items(sku,warehouse_id,holder_party_id,status,reserved_order_line_id,condition) values('TRION-Q',$1,$2,'reserved',$3,$4)",[wh.id,holder.id,line,condition]);
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
    await q("set local role authenticated");
    expect((await submit()).status).toBe("applied");
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

});
