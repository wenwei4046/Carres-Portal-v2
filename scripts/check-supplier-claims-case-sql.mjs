// Isolated PostgreSQL contract checks; not a full production-schema replay.
// PGLITE_MODULE may point to an external installation of @electric-sql/pglite 0.5.8.
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create role authenticated; create role anon;
create schema auth;
create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''test.uid'',true),'''')::uuid';
create function auth.jwt() returns jsonb language sql as 'select jsonb_build_object(''app_metadata'',jsonb_build_object(''role'',current_setting(''test.role'',true)))';
create function public.is_internal() returns boolean language sql as 'select true';
create table service_case_statuses(id uuid primary key, is_closed boolean);
create sequence case_seq;
create function next_case_no() returns text language sql as 'select ''SC-'' || nextval(''case_seq'')';
create table service_cases(id uuid primary key, case_no text unique, customer_name text not null default '',
order_id uuid, order_line_id uuid, customer_phone text, customer_address text, usable text,
customer_wants text[] not null default '{}', reported_by text, product_sku text, product_category text,
issue_type text, what_happened text, evidence jsonb, created_by uuid, status_id uuid);
create table purchase_orders(id text primary key, supplier_id uuid);
create table purchase_order_lines(id uuid primary key, po_id text, sku text);
create table ops_stock_items(id uuid primary key default gen_random_uuid(), unit_code text unique, sku text, hold_claim_id uuid);
create table warehouse_receipts(id uuid primary key);
create table receiving_unit_results(id uuid primary key default gen_random_uuid(),
receipt_id uuid not null references warehouse_receipts(id), stock_item_id uuid not null references ops_stock_items(id),
unit_code text not null, outcome text not null, issue_kind text, note text,
created_at timestamptz not null default now(), unique (receipt_id, stock_item_id));
create table supplier_claims(id uuid primary key, status text, claim_type text, product_category text, sku text,
po_id text, po_line_id uuid, supplier_id uuid, warehouse_receipt_id uuid, qty int not null default 1,
photos jsonb not null default '[]'::jsonb, note text, reported_by uuid, reported_at timestamptz not null default now());
create function workspace_resolve_duty(text,date) returns jsonb language sql as 'select jsonb_build_object(''actor_user_id'',current_setting(''test.holder'',true),''normal_user_id'',''11111111-1111-4111-8111-111111111111'')';
set test.uid = '11111111-1111-4111-8111-111111111111'; set test.role = 'operation';
set test.holder = '11111111-1111-4111-8111-111111111111';
`);
// Use the actual evidence constraints, not a weaker fixture-only ledger.
const evidenceMigration = await readFile(new URL('../supabase/migrations/0289_service_case_evidence.sql', import.meta.url), 'utf8');
const evidenceFunction = evidenceMigration.match(/create or replace function public\.service_case_evidence_wellformed[\s\S]*?\$\$;/)[0];
await db.exec(evidenceFunction);
await db.exec(`alter table service_cases add constraint sc_evidence_wellformed check (service_case_evidence_wellformed(evidence));
alter table service_cases add constraint sc_evidence_required_with_issue check (issue_type is null or (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) > 0));`);
await db.exec(await readFile(process.env.CASE_SQL_PATH || new URL('../docs/cards/supplier-claims-case-intake.sql', import.meta.url),'utf8'));

// Replay the real intake enums as well: fixture-only reporter names mask failures.
const intakeMigration = await readFile(new URL('../supabase/migrations/0285_service_case_guided_intake.sql', import.meta.url), 'utf8');
for (const name of ['sc_reported_by_known', 'sc_product_category_known', 'sc_issue_type_known', 'sc_usable_known', 'sc_customer_wants_known']) {
  const sql = intakeMigration.match(new RegExp('alter table public\\.service_cases add constraint ' + name + '[\\s\\S]*?;'))?.[0];
  assert.ok(sql, name);
  await db.exec(sql);
}

// ── §A · atomic stock report: retry, changed payload, no fake customer ──────
const id='22222222-2222-4222-8222-222222222222';
const payload={reported_by:'warehouse',product_category:'sofa',issue_type:'damaged',what_happened:'Damaged sofa',evidence:[{slot:'overall_photo',path:`draft/${id}/overall.jpg`}]};
const create=()=>db.query('select service_case_create_stock_report($1,$2) as result',[id,payload]);
const first=await create(); const retry=await create();
assert.deepEqual(first.rows,retry.rows);
assert.equal(first.rows[0].result.matchedExisting,false);
assert.equal((await db.query('select count(*)::int as n from service_cases')).rows[0].n,1);
assert.equal((await db.query('select last_value::int as n from case_seq')).rows[0].n,1);
assert.deepEqual((await db.query('select customer_name, customer_impact, customer_wants from service_cases')).rows[0],{customer_name:'',customer_impact:'stock_only',customer_wants:[]});
await assert.rejects(db.query('select service_case_create_stock_report($1,$2)',[id,{...payload,what_happened:'Changed'}]),/different facts/);
await assert.rejects(db.query('update service_cases set customer_name=$1 where id=$2',['Fake',id]),/stock_case_has_no_customer/);

// ── §B · Claim ↔ Case link: duty, cover, verified source, no reparenting ────
const claim='33333333-3333-4333-8333-333333333333';
const line='44444444-4444-4444-8444-444444444444';
const supplier='55555555-5555-4555-8555-555555555555';
await db.query('insert into purchase_orders values ($1,$2)',['PO1',supplier]);
await db.query('insert into purchase_order_lines values ($1,$2,$3)',[line,'PO1','SOFA']);
await db.query('insert into supplier_claims(id,status,claim_type,product_category,sku,po_id,po_line_id,supplier_id) values ($1,$2,$3,$4,$5,$6,$7,$8)',[claim,'open','damaged','sofa','SOFA','PO1',line,supplier]);
await db.exec("set test.holder = '66666666-6666-4666-8666-666666666666'");
await assert.rejects(db.query('select service_case_link_supplier_claim($1,$2)',[id,claim]),/current Purchasing Duty/);
await db.exec("set test.uid = '66666666-6666-4666-8666-666666666666'");
await db.query('update supplier_claims set sku=$1 where id=$2',['FOREIGN-SKU',claim]);
await assert.rejects(db.query('select service_case_link_supplier_claim($1,$2)',[id,claim]),/original purchase source/);
assert.equal((await db.query('select case_id from supplier_claims where id=$1',[claim])).rows[0].case_id,null);
await db.query('update supplier_claims set sku=$1 where id=$2',['SOFA',claim]);
const linked=await db.query('select service_case_link_supplier_claim($1,$2) as result',[id,claim]);
assert.deepEqual(linked.rows[0].result,{caseId:id,claimId:claim});
assert.deepEqual((await db.query('select service_case_link_supplier_claim($1,$2) as result',[id,claim])).rows,linked.rows);
const event=(await db.query('select case_link_evidence from supplier_claims where id=$1',[claim])).rows[0].case_link_evidence;
assert.equal(event.actor,'66666666-6666-4666-8666-666666666666');
assert.equal(event.duty.normal_user_id,'11111111-1111-4111-8111-111111111111');
const otherId='77777777-7777-4777-8777-777777777777';
await db.query('select service_case_create_stock_report($1,$2)',[otherId,{...payload,evidence:payload.evidence.map(e=>({...e,path:e.path.replace(id,otherId)}))}]);
await assert.rejects(db.query('select service_case_link_supplier_claim($1,$2)',[otherId,claim]),/already belongs to another Case/);

// A two-Unit Claim cannot attach through one overlapping Unit.
const mixedClaim = '33333333-3333-4333-8333-333333333334';
await db.query("insert into supplier_claims(id,status,claim_type,product_category,sku,po_id,po_line_id,supplier_id,qty) values ($1,'open','damaged','sofa','SOFA','PO1',$2,$3,2)", [mixedClaim,line,supplier]);
const mixedUnits = (await db.query("insert into ops_stock_items(unit_code,sku,hold_claim_id) values ('id-mixed-a','SOFA',$1),('id-mixed-b','SOFA',$1) returning id,unit_code", [mixedClaim])).rows;
await db.query("insert into service_case_units(case_id,stock_item_id,unit_code,issue_type,added_by) values ($1,$2,$3,'damaged',auth.uid())", [id,mixedUnits[0].id,mixedUnits[0].unit_code]);
await assert.rejects(db.query('select service_case_link_supplier_claim($1,$2)',[id,mixedClaim]), /different Units/);
assert.equal((await db.query('select case_id from supplier_claims where id=$1',[mixedClaim])).rows[0].case_id,null);
await db.query('select service_case_link_supplier_claim($1,$2)',[otherId,mixedClaim]);
await db.query('update ops_stock_items set hold_claim_id=null where hold_claim_id=$1',[mixedClaim]);
assert.equal((await db.query('select count(*)::int n from service_case_units where case_id=$1 and claim_id=$2',[otherId,mixedClaim])).rows[0].n,2);

// ── §D · Receiving orchestration inside the posting hook ────────────────────
const receipt='88888888-8888-4888-8888-888888888888';
const reporter='99999999-9999-4999-8999-999999999999';
await db.query('insert into warehouse_receipts values ($1)',[receipt]);
const unitA=(await db.query("insert into ops_stock_items(unit_code,sku) values ('id-aaa000001','MATT-K') returning id")).rows[0].id;
const unitB=(await db.query("insert into ops_stock_items(unit_code,sku) values ('id-bbb000002','MATT-K') returning id")).rows[0].id;
const unitC=(await db.query("insert into ops_stock_items(unit_code,sku) values ('id-ccc000003','BED-Q') returning id")).rows[0].id;
const dmgClaim='aaaaaaaa-0000-4000-8000-00000000000a';
const wrongClaim='aaaaaaaa-0000-4000-8000-00000000000b';
await db.query(`insert into supplier_claims(id,status,claim_type,product_category,sku,po_id,warehouse_receipt_id,qty,photos,note,reported_by)
  values ($1,'open','damaged','mattress','MATT-K','PO1',$2,2,'[{"path":"claims/a1.jpg","at":"2026-09-06T01:00:00Z","by":"${reporter}"}]'::jsonb,'Torn corner',$3),
         ($4,'open','wrong_sku','bedframe','BED-Q','PO1',$2,1,'[{"path":"claims/b1.jpg","at":"2026-09-06T01:05:00Z","by":"${reporter}"}]'::jsonb,'Queen label on King order',$3)`,
  [dmgClaim,receipt,reporter,wrongClaim]);
await db.query('update ops_stock_items set hold_claim_id=$1 where id=any($2::uuid[])',[dmgClaim,[unitA,unitB]]);
await db.query('update ops_stock_items set hold_claim_id=$1 where id=$2',[wrongClaim,unitC]);
// Same SKU and problem on this receipt is insufficient: only the claim's exact held Units attach.
const unrelated=(await db.query("insert into ops_stock_items(unit_code,sku) values ('id-unrelated','MATT-K') returning id")).rows[0].id;
await db.query("insert into receiving_unit_results(receipt_id,stock_item_id,unit_code,outcome,issue_kind,created_at) values ($1,$2,'id-unrelated','received_with_issue','damaged','2026-01-01')", [receipt,unrelated]);
const lines=JSON.stringify([
  {units:[{stock_item_id:unitA,unit_code:'id-aaa000001',outcome:'received_with_issue',issue_kind:'damaged'},
          {stock_item_id:unitB,unit_code:'id-bbb000002',outcome:'received_with_issue',issue_kind:'damaged'}]},
  {units:[{stock_item_id:unitC,unit_code:'id-ccc000003',outcome:'received_with_issue',issue_kind:'wrong_item'}]},
]);
assert.equal((await db.query('select receiving_record_unit_results($1,$2::jsonb) as n',[receipt,lines])).rows[0].n,3);
const dmgCase=(await db.query('select case_id from supplier_claims where id=$1',[dmgClaim])).rows[0].case_id;
const wrongCase=(await db.query('select case_id from supplier_claims where id=$1',[wrongClaim])).rows[0].case_id;
assert.ok(dmgCase && wrongCase && dmgCase!==wrongCase);
const dmgRow=(await db.query('select * from service_cases where id=$1',[dmgCase])).rows[0];
assert.equal(dmgRow.customer_impact,'stock_only');
assert.equal(dmgRow.reported_by,'warehouse');
assert.equal(dmgRow.created_by,reporter); // original attribution, never the poster of record
assert.deepEqual(dmgRow.evidence,[{slot:'receiving_photo',path:'claims/a1.jpg',kind:'photo',at:'2026-09-06T01:00:00Z',by:reporter,by_role:'not_recorded',bucket:'delivery-orders'}]);
const occ=(await db.query('select case_id, unit_code, claim_id, receiving_unit_result_id, issue_type from service_case_units where case_id=$1 order by unit_code',[dmgCase])).rows;
assert.equal(occ.length,2);
assert.ok(occ.every(o=>o.claim_id===dmgClaim && o.receiving_unit_result_id && o.issue_type==='damaged'));
const link=(await db.query('select case_link_evidence from supplier_claims where id=$1',[dmgClaim])).rows[0].case_link_evidence;
assert.equal(link.source,'receiving'); assert.equal(link.actor,reporter);
// Re-running the orchestration attaches nothing twice.
assert.equal((await db.query('select service_case_attach_receiving_claims($1) as n',[receipt])).rows[0].n,0);
const caseCount=(await db.query('select count(*)::int as n from service_cases')).rows[0].n;

// ── §E · a repeated report of the same Unit + problem joins the same Case ───
const rpt='bbbbbbbb-0000-4000-8000-000000000001';
const rptPayload={reported_by:'staff',product_category:'mattress',issue_type:'damaged',what_happened:'Same torn corner seen at handover',unit_code:'id-aaa000001',receiving_unit_result_id:occ[0].receiving_unit_result_id,evidence:[{slot:'overall_photo',path:`draft/${rpt}/again.jpg`}]};
const matched=(await db.query('select service_case_create_stock_report($1,$2) as result',[rpt,rptPayload])).rows[0].result;
assert.equal(matched.id,dmgCase); assert.equal(matched.matchedExisting,true);
assert.equal((await db.query('select count(*)::int as n from service_cases')).rows[0].n,caseCount); // no second incident
const ev=(await db.query('select evidence from service_cases where id=$1',[dmgCase])).rows[0].evidence;
assert.equal(ev.length,2); // appended once
assert.deepEqual((await db.query('select service_case_create_stock_report($1,$2) as result',[rpt,rptPayload])).rows[0].result,matched); // retry: same answer
assert.equal((await db.query('select evidence from service_cases where id=$1',[dmgCase])).rows[0].evidence.length,2);
await assert.rejects(db.query('select service_case_create_stock_report($1,$2)',[rpt,{...rptPayload,what_happened:'Changed'}]),/different facts/);
// A DIFFERENT Unit with the same problem is related, never silently merged.
const rpt2='bbbbbbbb-0000-4000-8000-000000000002';
const other=(await db.query('select service_case_create_stock_report($1,$2) as result',[rpt2,{...rptPayload,unit_code:'id-ccc000003',receiving_unit_result_id:undefined,product_category:'bedframe',evidence:[{slot:'overall_photo',path:`draft/${rpt2}/c.jpg`}]}])).rows[0].result;
assert.equal(other.matchedExisting,false); assert.notEqual(other.id,dmgCase);
// An open earlier Case must not absorb a later fault without its occurrence.
const laterOpenId='bbbbbbbb-0000-4000-8000-000000000006';
const laterOpen=(await db.query('select service_case_create_stock_report($1,$2) as result',[
  laterOpenId,{...rptPayload,receiving_unit_result_id:undefined,
    evidence:[{slot:'overall_photo',path:`draft/${laterOpenId}/later.jpg`}]}])).rows[0].result;
assert.notEqual(laterOpen.id,dmgCase); assert.equal(laterOpen.matchedExisting,false);
const foreignId='bbbbbbbb-0000-4000-8000-000000000007';
await assert.rejects(db.query('select service_case_create_stock_report($1,$2)',[
  foreignId,{...rptPayload,unit_code:'id-bbb000002',
    evidence:[{slot:'overall_photo',path:`draft/${foreignId}/foreign.jpg`}]}]), /source occurrence does not match/);
// Hold release does not remove permanent source evidence or alter repeat matching.
await db.query('update ops_stock_items set hold_claim_id=null where id=$1',[unitA]);
assert.equal((await db.query('select service_case_match_unit_problem($1,$2,$3) as id',
  [unitA,'damaged',occ[0].receiving_unit_result_id])).rows[0].id,dmgCase);
// A LATER failure after the Case closes is a new occurrence with its own history.
const closed='cccccccc-0000-4000-8000-000000000001';
await db.query('insert into service_case_statuses values ($1,true)',[closed]);
await db.query('update service_cases set status_id=$1 where id=$2',[closed,dmgCase]);
const rpt3='bbbbbbbb-0000-4000-8000-000000000003';
const later=(await db.query('select service_case_create_stock_report($1,$2) as result',[rpt3,{...rptPayload,receiving_unit_result_id:undefined,evidence:[{slot:'overall_photo',path:`draft/${rpt3}/later.jpg`}]}])).rows[0].result;
assert.equal(later.matchedExisting,false); assert.notEqual(later.id,dmgCase);
// An explicit same-incident choice can append to a stock-origin Case as well.
const explicitId='bbbbbbbb-0000-4000-8000-000000000009';
const explicit=(await db.query('select service_case_create_stock_report($1,$2) as result',[
  explicitId,{...rptPayload,receiving_unit_result_id:undefined,existing_case_id:later.id,
    evidence:[{slot:'overall_photo',path:`draft/${explicitId}/same.jpg`}]}])).rows[0].result;
assert.equal(explicit.id,later.id); assert.equal(explicit.matchedExisting,true);
const invalidChoiceId='bbbbbbbb-0000-4000-8000-000000000010';
await assert.rejects(db.query('select service_case_create_stock_report($1,$2)',[
  invalidChoiceId,{...rptPayload,receiving_unit_result_id:undefined,existing_case_id:wrongCase,
    evidence:[{slot:'overall_photo',path:`draft/${invalidChoiceId}/wrong.jpg`}]}]),/selected Case does not match/);
// An unresolvable label is preserved as the reporter's fact — no guessed source.
const rpt4='bbbbbbbb-0000-4000-8000-000000000004';
const free=(await db.query('select service_case_create_stock_report($1,$2) as result',[rpt4,{...rptPayload,unit_code:'id-zzz999999',receiving_unit_result_id:undefined,evidence:[{slot:'overall_photo',path:`draft/${rpt4}/z.jpg`}]}])).rows[0].result;
assert.equal(free.matchedExisting,false);
assert.equal((await db.query('select source_unit_label from service_cases where id=$1',[free.id])).rows[0].source_unit_label,'id-zzz999999');
assert.equal((await db.query('select count(*)::int as n from service_case_units where case_id=$1',[free.id])).rows[0].n,0);
// A Unit label contradicting the reported product is a named refusal, not a guess.
const rpt5='bbbbbbbb-0000-4000-8000-000000000005';
await assert.rejects(db.query('select service_case_create_stock_report($1,$2)',[rpt5,{...rptPayload,product_sku:'OTHER-SKU',evidence:[{slot:'overall_photo',path:`draft/${rpt5}/m.jpg`}]}]),/Unit label and the reported product do not match/);

// Actual authenticated database role: RPCs work while direct table writes stay denied.
await db.exec('grant usage on schema auth to authenticated; grant select on service_cases to authenticated; set role authenticated');
const authId='bbbbbbbb-0000-4000-8000-000000000008';
const authReport=(await db.query('select service_case_create_stock_report($1,$2) as result',[
  authId,{...payload,evidence:[{slot:'overall_photo',path:`draft/${authId}/auth.jpg`}]}])).rows[0].result;
assert.equal(authReport.id,authId);
await assert.rejects(db.query('insert into service_case_reports(report_id,case_id,fingerprint) values ($1,$1,$2)',
  [authId,'forged']),/permission denied/);
await db.exec('reset role');
// ── roles ───────────────────────────────────────────────────────────────────
await db.exec("set test.role = 'dealer'");
await assert.rejects(create(),/Operation or principal/);
console.log('PASS: atomic retry, changed-payload refusal, no fake customer, duty denial, active cover, verified source, idempotent Case link, no reparenting, actor evidence, role denial, receiving orchestration (exact occurrences, referenced evidence, original attribution, idempotent), verified-occurrence matching, open-earlier/later-fault separation, foreign occurrence denial, hold-release preservation, authenticated RPC and direct-write denial.');
await db.close();
