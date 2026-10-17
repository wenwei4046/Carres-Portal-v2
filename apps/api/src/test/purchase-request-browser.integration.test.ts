import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, expect as browserExpect } from "@playwright/test";
import { OwnedContextDatabase } from "./owned-context-client";
import { signTestJwt, useTestJwks } from "./jwt";
import { _setJwksForTesting } from "../middleware/auth";
vi.mock("../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../lib/supabase";
import app from "../index";
import { projectPurchaseOrderCancellationSendWork, manualPurchaseWorkInputsFromRegister } from "../routes/operation/work";
const url = process.env.CARRES_CONTEXT_TEST_DATABASE_URL;
const enabled = !!url && process.env.MPR_CONTEXT_API_BROWSER === "1";
const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "TEST-local", SUPABASE_SERVICE_ROLE_KEY: "TEST-not-used", SUPABASE_JWT_SECRET: "unused" };
let db: OwnedContextDatabase;
const owner = { id:"fffffff1-0000-4000-8000-000000009698", role:"operation", email:"TEST-context-owner@carres.test" };
const approver = { id:"fffffff1-0000-4000-8000-000000009699", role:"principal", email:"TEST-context-manager@carres.test" };
async function request(path:string,body?:unknown,method=body===undefined?"GET":"POST") {
  useTestJwks(); const actor={...db.actor}; const token=await signTestJwt(actor.id,{email:actor.email,app_metadata:{role:actor.role}});
  return app.fetch(new Request(`https://api.test${path}`,{method,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})}),env as never,{waitUntil(){},passThroughException(){}} as never);
}
describe.skipIf(!enabled)("owned local browser → actual API → PostgreSQL lifecycle",()=> {
  beforeAll(async()=> {
    db=new OwnedContextDatabase(url!);
    await db.start(readFileSync(new URL("../../../../output/forecast-mpr-delivery/purchase-request-context.local-check.sql",import.meta.url),"utf8"));
    await db.json("reset role; insert into public.floor_config default values on conflict(id) do nothing; select 'true'::jsonb;");
    vi.mocked(userClient).mockImplementation((_env,jwt)=> {
      const claims=JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString());
      return db.client({id:claims.sub,role:claims.app_metadata.role,email:claims.email}) as never;
    });
  },60000);
  afterAll(async()=> { if(db)await db.finish(); _setJwksForTesting(null); },30000);
  it.each([{purpose:"ready_stock",need:500,left:499},{purpose:"general_purchase",need:5,left:4}])("actual $purpose need$need → approval/partial1/parent2 → fully covered, last send pending; qualified cancel1 and active source readback, outer rollback",async({purpose,need,left})=> {
    const context=await db.json(`select request_context from public.purchase_requests where purpose='${purpose}' and jsonb_array_length(request_context->'lines')=1 and request_context#>>'{lines,0,qty}'='${need}' and jsonb_array_length(request_context#>'{lines,0,stockProposals}')=0 limit 1;`);
    const taskCounts=await db.json("reset role; select jsonb_build_object('tasks',(select count(*) from public.ops_tasks),'work_events',(select count(*) from public.work_occurrence_events));");
    expect(context).toBeTruthy(); db.actor=owner; db.requestIds=new Set();
    const registerResponse=await request("/api/operation/purchasing/requests"); const register=await registerResponse.json() as any;
    expect(registerResponse.status,JSON.stringify(register)).toBe(200);
    const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);
    const pageErrors:string[]=[];page.on("pageerror",error=>pageErrors.push(error.message));
    const apiErrors:unknown[]=[];let newId="";let poId="";let tearingDown=false;let inspectedPoId="";
    try {
      await page.addInitScript(seed=>{(globalThis as any).__mprLocalSeed=seed;},{context,destinations:register.destinations,suppliers:register.suppliers,users:register.users,actor:owner});
      await page.route("https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/**",async route=> {
        const weight=/-(400|500|600|700)-normal/.exec(route.request().url())?.[1];
        await route.fulfill({status:200,contentType:"font/ttf",body:readFileSync(`${process.env.NOTO_DIR}/noto${weight}.ttf`),headers:{"access-control-allow-origin":"*"}});
      });
      await page.route("http://127.0.0.1:8888/api/**",async route=> {
        const incoming=route.request();
        if(incoming.method()==="OPTIONS") { await route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"GET,POST,OPTIONS"}});return; }
        const incomingUrl=new URL(incoming.url());
        if(inspectedPoId&&incomingUrl.pathname==="/api/operation/pos"&&!incomingUrl.searchParams.has("poId"))incomingUrl.searchParams.set("poId",inspectedPoId);
        const response=await request(incomingUrl.pathname+incomingUrl.search,incoming.postData()?JSON.parse(incoming.postData()!):undefined,incoming.method());
        const text=await response.text();if(!response.ok) { apiErrors.push({path:incoming.url(),status:response.status,text});console.error("LOCAL API refusal",incoming.url(),response.status,text); }
        if(incoming.method()==="POST"&&new URL(incoming.url()).pathname.endsWith("/purchasing/requests")&&response.ok)newId=JSON.parse(text).id;
        if(new URL(incoming.url()).pathname.endsWith("/issue")&&response.ok)poId=JSON.parse(text).poIds[0];
        try { await route.fulfill({status:response.status,contentType:"application/json",body:text,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"GET,POST,OPTIONS"}}); }
        catch(error) { // Only navigation/cleanup may cancel an already asserted transport request.
          if (!tearingDown || !/Route is already handled|Target page, context or browser has been closed/i.test(String(error))) throw error;
        }
      });
      await page.goto(`${process.env.MPR_CONTEXT_BASE_URL??"http://localhost:5437"}/manual-purchase-context-preview.html?purpose=rs&transport=local`);
      const send=page.getByTestId("mp-send");await browserExpect(send).toBeEnabled({timeout:60000});await send.click();await browserExpect(send).toHaveText("Confirm and send");await browserExpect(page.getByTestId("mp-create-pdf-preview").locator("canvas").first()).toBeVisible({timeout:15000});await browserExpect(send).toBeEnabled({timeout:60000});await send.click();
      await browserExpect(page.getByTestId("mp-full-requested-need")).toContainText(String(need),{timeout:60000});expect(newId).not.toBe("");
      await browserExpect(page.getByTestId("mp-approve")).toHaveCount(0);
      db.actor=approver;await page.evaluate(actor=>(globalThis as any).__mprLocalSetActor(actor),approver);
      const approve=page.getByTestId("mp-approve");await browserExpect(approve).toBeEnabled({timeout:60000});await approve.click();await browserExpect(page.getByTestId("mp-approval-record")).toBeVisible();
      db.actor=owner;await page.evaluate(actor=>(globalThis as any).__mprLocalSetActor(actor),owner);
      await page.getByRole("link",{name:/Back/}).first().click();
      const tick=page.getByTestId(`mp-select-${newId}`);await browserExpect(tick).toBeEnabled({timeout:60000});await tick.click();await page.getByTestId("mp-issue-selected").click();
      const qty=page.getByLabel(`${context.lines[0].sku} · Qty`);await browserExpect(qty).toHaveValue(String(need));await qty.fill("1");
      if(purpose === "general_purchase") await page.getByLabel(context.recipients[0].name,{exact:true}).fill("1");
      const issue=page.getByTestId("so-batch-issue-create");await browserExpect(issue).toBeEnabled({timeout:60000});await issue.click();
      await browserExpect.poll(()=>poId,{timeout:60000}).not.toBe("");
      const documentResponse=await request(`/api/operation/pos/${encodeURIComponent(poId)}/print-data`);const document=await documentResponse.json() as any;
      expect(documentResponse.status,JSON.stringify(document)).toBe(200);expect(document.lines.reduce((total:number,line:any)=>total+line.qty,0)).toBe(1);
      // Synthetic local email declaration only, no email/WhatsApp/provider open.
      const channel=page.getByTestId("so-batch-evidence-channel");await browserExpect(channel).toBeVisible({timeout:60000});
      await channel.selectOption("email");await page.getByTestId("so-batch-evidence-recipient").fill("TEST@example.test");
      const confirm=page.getByTestId("so-batch-evidence-confirm");await browserExpect(confirm).toBeEnabled();await confirm.click();
      await browserExpect(page.getByTestId(`mp-select-${newId}`)).toBeVisible({timeout:60000});
      const sendsResponse=await request(`/api/operation/pos/${encodeURIComponent(poId)}/sends`);const sends=await sendsResponse.json() as any;
      expect(sendsResponse.status).toBe(200);expect(sends.sends).toEqual(expect.arrayContaining([expect.objectContaining({po_version:document.version,recipient:"TEST@example.test",kind:"confirmed_sent",sent_by:owner.id})]));
      const afterResponse=await request("/api/operation/purchasing/requests");const after=await afterResponse.json() as any;
      expect(afterResponse.status,JSON.stringify(after)).toBe(200);
      const work=manualPurchaseWorkInputsFromRegister({...after,requests:after.requests.filter((row:any)=>row.id===newId),lines:after.lines.filter((line:any)=>line.request_id===newId)});
      expect(work[0]).toMatchObject({remainingQty:left,hasPos:true,posAllSent:true});
      const saved=await db.json(`select jsonb_build_object('request_version',request_version,'approval_version',approval_version,'need',request_context#>'{lines,0,qty}') from public.purchase_requests where id='${newId}';`);
      expect(saved).toMatchObject({request_version:1,approval_version:1,need});
      // SAME existing parent revision API after the browser-issued PO. Explicit
      // source proof adds one within unchanged approval; old send remains V1.
      const ownerReviewResponse=await request(`/api/operation/purchasing/requests/${newId}/context-review`);
      const ownerReview=await ownerReviewResponse.json() as any;expect(ownerReviewResponse.status).toBe(200);expect(ownerReview.available).toBe(true);
      const physical=await db.json(`select jsonb_build_object('id',id,'destination_id',destination_id) from public.purchase_order_lines where po_id='${poId}';`);
      const source=ownerReview.coverage.find((row:any)=>row.kind==='purchase'&&row.to_buy>0);
      const revisionResponse=await request(`/api/operation/pos/${poId}/revise`,{reason:"TEST existing parent adds one approved source",lines:[{lineId:physical.id,qty:2,destinationId:physical.destination_id,expectedPoVersion:document.version,requestSources:[{demandId:source.demand_id,qty:2,requestVersion:ownerReview.approval.request_version,approvalVersion:ownerReview.approval.approval_version,approvalToken:ownerReview.approval.token,recipients:purpose==='ready_stock'?[]:[{recipientId:source.recipients[0].recipientId,qty:1}]}]}]});
      const parentRevision=await revisionResponse.json() as any;expect(revisionResponse.status,JSON.stringify(parentRevision)).toBe(200);
      const revisedRegisterResponse=await request("/api/operation/purchasing/requests");const revisedRegister=await revisedRegisterResponse.json() as any;
      expect(revisedRegisterResponse.status,JSON.stringify(revisedRegister)).toBe(200);
      const revisedWork=manualPurchaseWorkInputsFromRegister({...revisedRegister,requests:revisedRegister.requests.filter((row:any)=>row.id===newId),lines:revisedRegister.lines.filter((line:any)=>line.request_id===newId)});
      expect(revisedWork[0]).toMatchObject({remainingQty:left-1,hasPos:true,posAllSent:false});
      const revisedPrintResponse=await request(`/api/operation/pos/${poId}/print-data`);const revisedPrint=await revisedPrintResponse.json() as any;
      expect(revisedPrintResponse.status).toBe(200);expect(revisedPrint.version).toBe(document.version+1);expect(revisedPrint.lines.reduce((total:number,line:any)=>total+line.qty,0)).toBe(2);
      const revisedSendsResponse=await request(`/api/operation/pos/${poId}/sends`);const revisedSends=await revisedSendsResponse.json() as any;
      expect(revisedSendsResponse.status).toBe(200);expect(revisedSends.sends).toEqual(sends.sends);
      // Existing reason-only cancellation/reduction cannot certify supplier
      // facts. Exercise the actual HTTP doors, retain every committed fact.
      const cancellationFacts=()=>db.json(`select jsonb_build_object('po',(select to_jsonb(po) from public.purchase_orders po where id='${poId}'),'lines',(select jsonb_agg(to_jsonb(l) order by id) from public.purchase_order_lines l where po_id='${poId}'),'sources',(select jsonb_agg(to_jsonb(s) order by id) from public.po_line_sources s where po_id='${poId}'),'units',(select jsonb_agg(to_jsonb(u) order by id) from public.ops_stock_items u where po_no='${poId}'),'events',(select count(*) from public.purchase_request_events where request_id='${newId}'),'revisions',(select count(*) from public.po_revisions where po_id='${poId}'),'history',(select count(*) from public.po_history where po_id='${poId}'));`);
      const beforeCancel=await cancellationFacts();
      const cancelResponse=await request(`/api/operation/pos/${poId}/cancel`,{reason:"TEST reason without supplier agreement/fee/evidence is not effective cancellation"});
      expect(cancelResponse.status).toBeGreaterThanOrEqual(400);expect(cancelResponse.status).toBeLessThan(500);
      const reduceResponse=await request(`/api/operation/pos/${poId}/revise`,{reason:"TEST reason is not effective reduction",lines:[{lineId:physical.id,qty:1,destinationId:physical.destination_id}]});
      expect(reduceResponse.status).toBeGreaterThanOrEqual(400);expect(reduceResponse.status).toBeLessThan(500);
      expect(await cancellationFacts()).toEqual(beforeCancel);
      // Unchanged approved residual uses SAME MPR selected Review/Issue. It
      // does not require a new multi-source PO editor. Leave new send pending:
      // no real Work occurrence completion or supplier/provider message.
      await page.evaluate(()=>(globalThis as any).__mprLocalRefresh());
      const remainderTick=page.getByTestId(`mp-select-${newId}`);await browserExpect(remainderTick).toBeEnabled({timeout:60000});await remainderTick.click();
      await page.getByTestId("mp-issue-selected").click();
      await browserExpect(page.getByLabel(`${context.lines[0].sku} · Qty`)).toHaveValue(String(left-1));
      const priorPoId=poId;poId="";
      const issueRemainder=page.getByTestId("so-batch-issue-create");await browserExpect(issueRemainder).toBeEnabled({timeout:60000});await issueRemainder.click();
      await browserExpect.poll(()=>poId,{timeout:60000}).not.toBe("");expect(poId).not.toBe(priorPoId);
      const coveredResponse=await request("/api/operation/purchasing/requests");const covered=await coveredResponse.json() as any;expect(coveredResponse.status).toBe(200);
      const coveredWork=manualPurchaseWorkInputsFromRegister({...covered,requests:covered.requests.filter((row:any)=>row.id===newId),lines:covered.lines.filter((line:any)=>line.request_id===newId)});
      expect(coveredWork[0]).toMatchObject({remainingQty:0,hasPos:true,posAllSent:false});
      const fullCoverage=await db.json(`select jsonb_build_object('need',r.request_context#>'{lines,0,qty}','request_version',r.request_version,'approval_version',r.approval_version,'issued',(select sum(issued_qty) from public.purchase_demands where request_id=r.id),'original_po','${priorPoId}') from public.purchase_requests r where id='${newId}';`);
      expect(fullCoverage).toMatchObject({need,request_version:1,approval_version:1,issued:need});
      // Valid cancellation on the original PO through the SAME authenticated
      // API; pending retains coverage, effective cancellation releases exactly1.
      const selectedUnit=await db.json(`select to_jsonb(id) from public.ops_stock_items where po_line_id='${physical.id}' and status='incoming' order by id limit 1;`);
      const cancelScope={action:"record",key:randomUUID(),requestId:randomUUID(),expectedRequestVersion:0,expectedPoVersion:document.version+1,decisionReason:"",lines:[{lineId:physical.id,qty:1,receivedQty:0,unitIds:[selectedUnit],sources:[{demandId:source.demand_id,qty:1,recipients:purpose==='ready_stock'?[]:[{recipientId:source.recipients[0].recipientId,qty:1}]}]}],supplierFacts:{supplierStatement:"awaiting",fee:"not_confirmed",shipped:null,evidence:[]}};
      const pendingResponse=await request(`/api/operation/pos/${priorPoId}/cancel`,{reason:"TEST scoped supplier cancellation",cancellation:cancelScope});const pendingCancellation=await pendingResponse.json() as any;
      expect(pendingResponse.status,JSON.stringify(pendingCancellation)).toBe(200);expect(pendingCancellation.cancellation.state).toBe("pending");
      const pendingRead=await request("/api/operation/purchasing/requests");const pendingRegister=await pendingRead.json() as any;
      expect(pendingRead.status).toBe(200);expect(pendingRegister.lines.find((line:any)=>line.id===source.demand_id).context_to_buy).toBe(0);
      // Real Storage metadata contract inside owned TEST rollback; no remote
      // supplier file/upload is claimed by this SQL transport fixture.
      await db.json(`reset role; insert into storage.objects(bucket_id,name) values('delivery-orders','${priorPoId}/TEST-cancellation.pdf'); select 'true'::jsonb;`);
      const effectiveResponse=await request(`/api/operation/pos/${priorPoId}/cancel`,{reason:"TEST scoped supplier cancellation",cancellation:{...cancelScope,action:"complete",key:randomUUID(),expectedRequestVersion:1,supplierFacts:{supplierStatement:"agreed",fee:"no",shipped:false,evidence:[`${priorPoId}/TEST-cancellation.pdf`]}}});const effectiveCancellation=await effectiveResponse.json() as any;
      expect(effectiveResponse.status,JSON.stringify(effectiveCancellation)).toBe(200);expect(effectiveCancellation.cancellation).toMatchObject({state:"effective",poVersion:document.version+2});
      const cancellationRead=await request(`/api/operation/pos/${priorPoId}/cancellations`);const cancellationFactsRead=await cancellationRead.json() as any;
      expect(cancellationRead.status).toBe(200);expect(cancellationFactsRead.lines[0]).toMatchObject({orderedQty:2,receivedQty:0,cancelledQty:1,pendingQty:1});
      const cancelledRegisterResponse=await request("/api/operation/purchasing/requests");const cancelledRegister=await cancelledRegisterResponse.json() as any;
      expect(cancelledRegisterResponse.status,JSON.stringify(cancelledRegister)).toBe(200);
      const afterCancellationWork=manualPurchaseWorkInputsFromRegister({...cancelledRegister,requests:cancelledRegister.requests.filter((row:any)=>row.id===newId),lines:cancelledRegister.lines.filter((line:any)=>line.request_id===newId)});
      expect(afterCancellationWork[0]).toMatchObject({remainingQty:1,hasPos:true,posAllSent:false});
      const cancellationPoRead=await request(`/api/operation/pos?status=all&poId=${priorPoId}`);const cancellationPo=await cancellationPoRead.json() as any;
      expect(cancellationPoRead.status,JSON.stringify(cancellationPo)).toBe(200);expect(cancellationPo.pos[0]).toMatchObject({cancellation_version:document.version+2,purchase_order_lines:[{qty:2,received_qty:0,cancelled_qty:1,pending_qty:1}]});
      const cancellationSendWork=projectPurchaseOrderCancellationSendWork({pos:cancellationPo.pos,suppliers:register.suppliers,poDuty:null,today:"2026-10-18"});
      expect(cancellationSendWork.filter(item=>item.object.id===priorPoId)).toHaveLength(1);
      expect(cancellationSendWork.find(item=>item.object.id===priorPoId)).toMatchObject({ruleKey:"purchasing.cancellation_send",interaction:{componentKey:"purchasing.po_issue_evidence"}});
      await browserExpect(page.getByTestId("so-batch-evidence-channel")).toBeVisible({timeout:60000});
      await page.waitForLoadState("networkidle");
      const afterTasks=await db.json("reset role; select jsonb_build_object('tasks',(select count(*) from public.ops_tasks),'work_events',(select count(*) from public.work_occurrence_events));");
      expect(afterTasks).toEqual(taskCounts);
      const output=process.env.MPR_CONTEXT_API_OUTPUT??"/tmp/carres-context-api-browser";mkdirSync(output,{recursive:true});
      writeFileSync(`${output}/LOCAL-TEST-${purpose}-lifecycle.json`,JSON.stringify({environment:"owned loopback; outer ROLLBACK",requestId:newId,poId:priorPoId,remainderPoId:poId,documentVersion:document.version,qty:1,work,saved,sends,parentRevision,revisedWork,revisedDocumentVersion:revisedPrint.version,cancelStatus:cancelResponse.status,reductionStatus:reduceResponse.status,coveredWork,fullCoverage,pendingCancellation,effectiveCancellation,cancellationFactsRead,afterCancellationWork,cancellationSendWork,taskCounts,afterTasks,apiErrors,transport:"actual API + authenticated PG; test PostgREST-shaped adapter, not production PostgREST transport proof; register scoped to this newly-created TEST request, unrelated replay history retained; floor_config uses existing schema defaults only within rollback"},null,2));
      await page.screenshot({path:`${output}/LOCAL-TEST-${purpose}-issued.png`,fullPage:true});expect(apiErrors).toEqual([]);
      // Actual existing PO object/editor over the same signed local API. No
      // cancellation write here: inspect draft, keyboard entry and discard.
      inspectedPoId=priorPoId;
      await page.goto(`${process.env.MPR_CONTEXT_BASE_URL??"http://localhost:5437"}/manual-purchase-context-preview.html?transport=local&entry=po&po=${encodeURIComponent(priorPoId)}`);
      await browserExpect(page.getByTestId("purchase-order-object")).toBeVisible({timeout:60000});
      await page.getByTestId("po-object-edit").focus();await page.keyboard.press("Enter");
      await page.getByRole("menuitem",{name:"Cancel goods not received"}).click();
      const cancellationEditor=page.getByTestId("po-cancellation-fields");await browserExpect(cancellationEditor).toBeVisible();
      await cancellationEditor.getByLabel(/^Reason/).fill("TEST unsaved supplier cancellation draft");
      await browserExpect(page.getByTestId("pdf-pane").locator("canvas").first()).toHaveAttribute("data-pdf-rendered","true",{timeout:60000});
      await page.screenshot({path:`${output}/LOCAL-TEST-${purpose}-cancellation-1440.png`,fullPage:true});
      await page.setViewportSize({width:390,height:1000});
      await page.screenshot({path:`${output}/LOCAL-TEST-${purpose}-cancellation-390.png`,fullPage:true});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await page.getByTestId("pdf-pane").locator("canvas").first().scrollIntoViewIfNeeded();
      await browserExpect(page.getByTestId("pdf-pane").locator("canvas").first()).toBeInViewport();
      await page.screenshot({path:`${output}/LOCAL-TEST-${purpose}-cancellation-paper-390.png`,fullPage:true});
      await page.getByRole("button",{name:"Close document work"}).click();
      await browserExpect(page.getByRole("dialog",{name:"Discard"})).toBeVisible();
      await page.getByRole("dialog",{name:"Discard"}).getByRole("button",{name:"Cancel",exact:true}).click();
      await browserExpect(cancellationEditor.getByLabel(/^Reason/)).toHaveValue("TEST unsaved supplier cancellation draft");
      await page.getByRole("button",{name:"Close document work"}).click();
      await page.getByRole("dialog",{name:"Discard"}).getByRole("button",{name:"Discard",exact:true}).click();
      await browserExpect(cancellationEditor).toHaveCount(0);
      expect(await db.json("reset role; select jsonb_build_object('tasks',(select count(*) from public.ops_tasks),'work_events',(select count(*) from public.work_occurrence_events));")).toEqual(taskCounts);
      expect(apiErrors).toEqual([]);
    }catch(error){
      console.error("LOCAL browser TEST state",(await page.locator("body").innerText()).slice(-6500),JSON.stringify({apiErrors,pageErrors}));
      await page.screenshot({path:"/tmp/carres-context-api-browser-failed.png",fullPage:true});throw error;
    }finally{tearingDown=true;await page.unrouteAll({behavior:"ignoreErrors"});await browser.close();}
  },240000);
});
