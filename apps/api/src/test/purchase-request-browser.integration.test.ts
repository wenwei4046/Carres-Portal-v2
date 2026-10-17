import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, expect as browserExpect } from "@playwright/test";
import { OwnedContextDatabase } from "./owned-context-client";
import { signTestJwt, useTestJwks } from "./jwt";
import { _setJwksForTesting } from "../middleware/auth";
vi.mock("../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../lib/supabase";
import app from "../index";
import { manualPurchaseWorkInputsFromRegister } from "../routes/operation/work";
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
  it.each([{purpose:"ready_stock",need:500,left:499},{purpose:"general_purchase",need:5,left:4}])("actual $purpose need$need → qualified approval → partial1 → painted PO/send/Work readback, outer rollback",async({purpose,need,left})=> {
    const context=await db.json(`select request_context from public.purchase_requests where purpose='${purpose}' and jsonb_array_length(request_context->'lines')=1 and request_context#>>'{lines,0,qty}'='${need}' and jsonb_array_length(request_context#>'{lines,0,stockProposals}')=0 limit 1;`);
    const taskCounts=await db.json("reset role; select jsonb_build_object('tasks',(select count(*) from public.ops_tasks),'work_events',(select count(*) from public.work_occurrence_events));");
    expect(context).toBeTruthy(); db.actor=owner; db.requestIds=new Set();
    const registerResponse=await request("/api/operation/purchasing/requests"); const register=await registerResponse.json() as any;
    expect(registerResponse.status,JSON.stringify(register)).toBe(200);
    const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const apiErrors:unknown[]=[];let newId="";let poId="";
    try {
      await page.addInitScript(seed=>{(globalThis as any).__mprLocalSeed=seed;},{context,destinations:register.destinations,suppliers:register.suppliers,users:register.users,actor:owner});
      await page.route("https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/**",async route=> {
        const weight=/-(400|500|600|700)-normal/.exec(route.request().url())?.[1];
        await route.fulfill({status:200,contentType:"font/ttf",body:readFileSync(`${process.env.NOTO_DIR}/noto${weight}.ttf`),headers:{"access-control-allow-origin":"*"}});
      });
      await page.route("http://127.0.0.1:8888/api/**",async route=> {
        const incoming=route.request();
        if(incoming.method()==="OPTIONS") { await route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"GET,POST,OPTIONS"}});return; }
        const response=await request(new URL(incoming.url()).pathname+new URL(incoming.url()).search,incoming.postData()?JSON.parse(incoming.postData()!):undefined,incoming.method());
        const text=await response.text();if(!response.ok) { apiErrors.push({path:incoming.url(),status:response.status,text});console.error("LOCAL API refusal",incoming.url(),response.status,text); }
        if(incoming.method()==="POST"&&new URL(incoming.url()).pathname.endsWith("/purchasing/requests")&&response.ok)newId=JSON.parse(text).id;
        if(new URL(incoming.url()).pathname.endsWith("/issue")&&response.ok)poId=JSON.parse(text).poIds[0];
        await route.fulfill({status:response.status,contentType:"application/json",body:text,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization,content-type","access-control-allow-methods":"GET,POST,OPTIONS"}});
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
      const afterTasks=await db.json("reset role; select jsonb_build_object('tasks',(select count(*) from public.ops_tasks),'work_events',(select count(*) from public.work_occurrence_events));");
      expect(afterTasks).toEqual(taskCounts);
      const output=process.env.MPR_CONTEXT_API_OUTPUT??"/tmp/carres-context-api-browser";mkdirSync(output,{recursive:true});
      writeFileSync(`${output}/LOCAL-TEST-${purpose}-lifecycle.json`,JSON.stringify({environment:"owned loopback; outer ROLLBACK",requestId:newId,poId,documentVersion:document.version,qty:1,work,saved,sends,taskCounts,afterTasks,apiErrors,transport:"actual API + authenticated PG; test PostgREST-shaped adapter, not production PostgREST transport proof; register scoped to this newly-created TEST request, unrelated replay history retained; floor_config uses existing schema defaults only within rollback"},null,2));
      await page.screenshot({path:`${output}/LOCAL-TEST-${purpose}-issued.png`,fullPage:true});expect(apiErrors).toEqual([]);
    }catch(error){
      console.error("LOCAL browser TEST state",(await page.locator("body").innerText()).slice(-6500),JSON.stringify(apiErrors));
      await page.screenshot({path:"/tmp/carres-context-api-browser-failed.png",fullPage:true});throw error;
    }finally{await page.unrouteAll({behavior:"wait"});await browser.close();}
  },240000);
});
