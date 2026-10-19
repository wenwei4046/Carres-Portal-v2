/** Owned loopback only. Actual signed API + authenticated PostgreSQL. Optional
 * HTTP host supports a native read-only page walk; Storage signing is TEST-only,
 * not a Supabase provider/upload claim. All business fixtures roll back. */
import { readFileSync, writeFileSync, existsSync, watch, unlinkSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { OwnedContextDatabase } from "./owned-context-client";
import { signTestJwt, useTestJwks } from "./jwt";
import { authMiddleware, _setJwksForTesting } from "../middleware/auth";
import type { AppEnv } from "../types";
vi.mock("../lib/supabase",()=>({userClient:vi.fn(),adminClient:vi.fn()}));
import { userClient, adminClient } from "../lib/supabase";
import scRouter from "../routes/ops/service-cases";
import type { ServiceCaseRemedyState } from "@carres/shared";
import { loadCaseRemedyWork } from "../lib/service-case-remedy-work";
import { workCompletedOf } from "../routes/operation/work";
const databaseUrl=process.env.CARRES_SC_TEST_DATABASE_URL;
const owner={id:"fffffff1-0000-4000-8000-000000009698",role:"operation",email:"TEST-sc-owner@carres.test"};
const approver={id:"fffffff1-0000-4000-8000-000000009699",role:"principal",email:"TEST-sc-approver@carres.test"};
const env={SUPABASE_URL:"https://test.supabase.co",SUPABASE_ANON_KEY:"TEST",SUPABASE_SERVICE_ROLE_KEY:"TEST-not-a-provider",SUPABASE_JWT_SECRET:"unused"};
const app=new Hono<AppEnv>();app.use("*",authMiddleware);app.route("/api/ops/service-cases",scRouter);
const quote=(v:string)=>"'"+v.replaceAll("'","''")+"'";
const root=new URL("../../../../output/forecast-mpr-delivery/",import.meta.url);
let db:OwnedContextDatabase;let server:Server|undefined;
async function call(actor:typeof owner,path:string,body?:unknown){useTestJwks();const token=await signTestJwt(actor.id,{email:actor.email,app_metadata:{role:actor.role}});return app.request(`/api/ops/service-cases/${path}`,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})},env);}
async function freshCase(){
 const id=randomUUID();
 await db.json(`reset role; select set_config('request.jwt.claims',${quote(JSON.stringify({sub:owner.id,role:"authenticated",app_metadata:{role:owner.role}}))},true);
 insert into public.service_cases(id,case_no,customer_name,carres_action,what_affected,product_sku,customer_wants,evidence,created_by)
 select '${id}','TEST-SC-'||left('${id}',8),'TEST customer','TEST replace two damaged goods','TEST exact goods',product_sku,customer_wants,
 jsonb_build_array(jsonb_build_object('slot','all_surfaces','path','${id}/TEST.jpg','kind','photo','at',now(),'by','${owner.id}','by_role','operation')),'${owner.id}' from public.service_cases where id='fffffff2-0000-4000-8000-000000000001';
 insert into storage.objects(bucket_id,name) values('service-case-evidence','${id}/TEST.jpg');
 select 'true'::jsonb;`);
 const context=await db.json(`select jsonb_set(request_context,'{serviceCaseId}',to_jsonb('${id}'::text)) from public.purchase_requests where for_service_case_id='fffffff2-0000-4000-8000-000000000001' limit 1;`);
 const request=await db.client(owner).rpc("purchasing_create_request_with_lines",{p_purpose:"service_case",p_destination_id:context.lines[0].allocations[0].destinationId,p_for_service_case_id:id,p_lines:[{request_context:context,submission_key:randomUUID()}],p_fulfilment_intent:"concrete_need"});
 expect(request.error).toBeNull();
 const assigned=await db.client(owner).rpc("service_case_set_pic",{p_case_id:id,p_owner_id:approver.id,p_expected_revision:0,p_reason:"TEST explicit Case PIC; outer rollback",p_key:randomUUID()});expect(assigned.error).toBeNull();
 return {id,requestId:request.data.id as string};
}
describe.skipIf(!databaseUrl)("Case remedy signed API / owned PostgreSQL",()=>{
 beforeAll(async()=>{
  db=new OwnedContextDatabase(databaseUrl!);
  const fixture=readFileSync(new URL("service-case-remedy.local-check.sql",root),"utf8").replace("\\ir service-case-remedy-approval.draft.sql",()=>readFileSync(new URL("service-case-remedy-approval.draft.sql",root),"utf8")).replace("\\ir service-case-remedy.assertions.sql",()=>readFileSync(new URL("service-case-remedy.assertions.sql",root),"utf8"));
  await db.start(fixture);
  await db.json("reset role; "+readFileSync(new URL("service-case-pic.draft.sql",root),"utf8")+"; select 'true'::jsonb;");
  useTestJwks();
  vi.mocked(userClient).mockImplementation((_env,jwt)=>{const claims=JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString());return db.client({id:claims.sub,role:claims.app_metadata.role,email:claims.email}) as never;});
  vi.mocked(adminClient).mockReturnValue({rpc:async(name:string,args:Record<string,unknown>)=>{
   if(name!=="work_record_completed")throw new Error("Unexpected TEST privileged RPC");
   const literal=(v:unknown)=>v==null?"null":quote(String(v));
   const actual=Object.entries(args).map(([k,v])=>`${k}=>${literal(v)}`).join(",");
   const data=await db.json(`reset role; select set_config('request.jwt.claims','{"role":"service_role"}',true); select to_jsonb(public.work_record_completed(${actual}));`);return{data,error:null};
  },storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:"http://127.0.0.1:43127/TEST-evidence.png"},error:null})})}} as never);
 },60000);
 afterAll(async()=>{if(server)await new Promise<void>(r=>server!.close(()=>r()));if(db)await db.finish();_setJwksForTesting(null);},30000);
 it("records the qualified Case actor through the real API, without Purchasing approval or execution side effects",async()=>{
  const source=await freshCase();const key=randomUUID();
  const proposal={key,requestId:source.requestId,expectedRequestVersion:1,affectedUnits:[],policy:"TEST policy",policyVersion:"TEST version",policyResult:"eligible",remedy:"replace",movement:"replace_first",charge:"free",amount:null,payer:"",payerAcceptance:null,reason:"TEST replace the exact two goods",evidence:[`${source.id}/TEST.jpg`]};
  const pending=await call(owner,`${source.id}/remedy/proposals`,proposal);expect(pending.status,await pending.clone().text()).toBe(200);
  expect((await call(owner,`${source.id}/remedy/decisions`,{approvalId:key,status:"approved",reason:""})).status).toBe(403);
  const token=await signTestJwt(owner.id,{email:owner.email,app_metadata:{role:owner.role}});
  const context={env,var:{auth:{jwt:token}}} as never;
  const open=(await loadCaseRemedyWork(context,"2026-10-18")).find(i=>i.object.id===key);
  expect(open).toMatchObject({owner:{acting:{userId:approver.id,name:"TEST approver"}},destination:`/operation?tab=service-notes&case=${source.id}`});
  expect(await db.json(`select count(*)::int from public.work_occurrence_events where occurrence_id like '%${key}%' and event='completed';`)).toBe(0);
  const decision=await call(approver,`${source.id}/remedy/decisions`,{approvalId:key,status:"approved",reason:"TEST reviewed exact source"});expect(decision.status,await decision.clone().text()).toBe(200);
  const read=await call(owner,`${source.id}/remedy`);expect(read.status).toBe(200);const state=await read.json() as ServiceCaseRemedyState;
  expect((await loadCaseRemedyWork(context,"2026-10-18")).some(i=>i.object.id===key)).toBe(false);
  const event=await db.json(`select jsonb_build_object('id',id,'occurrenceId',occurrence_id,'event',event,'actorId',actor_id,'at',at,'channel',channel,'contactKind',contact_kind,'contactId',contact_id,'replyDueOn',reply_due_on,'resultReference',result_reference,'sourceVersion',source_version,'actionOn',action_on,'objectLabel',object_label) from public.work_occurrence_events where occurrence_id like '%${key}%' and event='completed';`);
  expect(workCompletedOf(event,[{userId:approver.id,name:"TEST approver",email:approver.email}])).toMatchObject({module:"purchasing",ruleKey:"service_case.remedy_approve",completedBy:{userId:approver.id},resultReference:expect.stringContaining(`approvals:${key}:approved@`)});
  expect(state.approver.actorName).toBe("TEST approver");
  expect(state.canDecide).toBe(false);expect(state.proposals[0].decidedBy).toBe(approver.id);expect(state.proposals[0].scopeCurrent).toBe(true);
  expect(await db.json(`select jsonb_build_object('approved',approved_at,'issued',(select coalesce(sum(issued_qty),0) from public.purchase_demands where request_id='${source.requestId}')) from public.purchase_requests where id='${source.requestId}';`)).toEqual({approved:null,issued:0});
 });
 it.skipIf(process.env.CARRES_SC_NATIVE_BROWSER!=="1")("hosts only the owned native-browser confirmation until its done marker",async()=>{
  const source=await freshCase();const key=randomUUID();
  const proposal={key,requestId:source.requestId,expectedRequestVersion:1,affectedUnits:[],policy:"TEST existing policy",policyVersion:"TEST version",policyResult:"eligible",remedy:"replace",movement:"replace_first",charge:"free",amount:null,payer:"",payerAcceptance:null,reason:"TEST replace two damaged goods",evidence:[`${source.id}/TEST.jpg`]};
  expect((await call(owner,`${source.id}/remedy/proposals`,proposal)).status).toBe(200);
  server=createServer(async(req,res)=>{
   res.setHeader("Access-Control-Allow-Origin","http://127.0.0.1:5447");res.setHeader("Access-Control-Allow-Headers","Authorization,Content-Type");res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
   if(req.method==="OPTIONS"){res.writeHead(204).end();return;}
   const url=new URL(req.url??"/","http://127.0.0.1:43127");
   if(url.pathname==="/seed"){const actor=url.searchParams.get("actor")==="requester"?owner:approver;const token=await signTestJwt(actor.id,{email:actor.email,app_metadata:{role:actor.role}});res.setHeader("Content-Type","application/json");res.end(JSON.stringify({caseId:source.id,actor,token}));return;}
   if(url.pathname==="/TEST-evidence.png"){res.setHeader("Content-Type","image/png");res.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=","base64"));return;}
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
   const response=await app.fetch(new Request(url,{method:req.method,headers:new Headers(req.headers as Record<string,string>),...(["GET","HEAD"].includes(req.method??"GET")?{}:{body:Buffer.concat(chunks)})}),env);
   res.writeHead(response.status,{"Content-Type":response.headers.get("Content-Type")??"application/json"});res.end(await response.text());
  });
  await new Promise<void>(resolve=>server!.listen(43127,"127.0.0.1",resolve));
  const markerName=process.env.CARRES_SC_NATIVE_MARKER??"service-case-native.done";const marker=new URL(markerName,root);if(existsSync(marker))unlinkSync(marker);
  writeFileSync(new URL(markerName.replace(/\.done$/,".runtime.json"),root),JSON.stringify({url:"http://127.0.0.1:5447/service-case-remedy-preview.html",caseId:source.id,environment:"owned loopback, TEST Storage signing, outer rollback"}));
  await new Promise<void>(resolve=>{const watcher=watch(root,(_event,name)=>{if(String(name)===markerName&&existsSync(marker)){watcher.close();resolve();}});});
 },600000);
});
