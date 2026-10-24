import {describe,it,expect,vi,afterEach} from "vitest";
import {Hono} from "hono";
import {receivingExtraObservationsRouter} from "./receiving-extra-observations";
import {userClient} from "../lib/supabase";
import type {AppEnv} from "../types";
vi.mock("../lib/supabase",()=>({userClient:vi.fn()}));
const receipt="00000000-0000-4000-8000-000000000701",actor="00000000-0000-4000-8000-000000000702",id="00000000-0000-4000-8000-000000000703",key="00000000-0000-4000-8000-000000000704";
const observation={id,receipt_id:receipt,report_revision:0,report_snapshot:{po_id:null},label:null,qty:null,note:"Unidentified goods held",goods_received_at:null,actual_site_id:key,site_name:"TEST Site",holder_party_id:key,holder_name:"TEST NETS",recorded_by:actor,actor_name:"TEST Warehouse person",recorded_at:"2026-10-21T04:00:00Z",request_key:key};
const body={revision:0,key,label:null,qty:null,note:observation.note,day:null};
function setup(mode:"warehouse"|"office"="warehouse"){
 const rpc=vi.fn();vi.mocked(userClient).mockReturnValue({rpc} as never);const app=new Hono<AppEnv>();app.use("*",async(c,next)=>{c.set("auth",{id:actor,role:mode==="warehouse"?"warehouse":"operation",warehouseId:key,jwt:"TEST"} as never);await next();});app.route("/",receivingExtraObservationsRouter(mode));
 return {rpc,req:(method="GET",suffix="",data?:unknown)=>app.request(`/${receipt}/extra-observations${suffix}`,{method,headers:{"Content-Type":"application/json"},...(data?{body:JSON.stringify(data)}:{})})};
}
afterEach(()=>vi.resetAllMocks());
describe("Unposted custody observation boundary",()=>{
 it("refuses missing SQL without falling back to final receiving",async()=>{const s=setup();s.rpc.mockResolvedValue({error:{code:"PGRST202",message:"missing"}});expect((await s.req()).status).toBe(503);expect(s.rpc).toHaveBeenCalledTimes(1);});
 it("records unknown fields as null and calls no receipt/Stock/Work writer",async()=>{const s=setup();s.rpc.mockResolvedValue({data:observation});expect((await s.req("POST","",body)).status).toBe(200);expect(s.rpc).toHaveBeenCalledTimes(1);expect(s.rpc).toHaveBeenCalledWith("receiving_extra_observation_record",{p_receipt_id:receipt,p_revision:0,p_key:key,p_label:null,p_qty:null,p_note:body.note,p_day:null});});
 it("does not accept actor/company/Site supplied by the browser",async()=>{const s=setup();expect((await s.req("POST","",{...body,holder_party_id:key})).status).toBe(422);expect(s.rpc).not.toHaveBeenCalled();});
 it("does not confirm a foreign report/actor response",async()=>{const s=setup();s.rpc.mockResolvedValue({data:{...observation,recorded_by:key}});expect((await s.req("POST","",body)).status).toBe(502);});
 it("keeps stale original-report revisions as a conflict",async()=>{const s=setup();s.rpc.mockResolvedValue({error:{code:"40001",message:"Original report changed"}});expect((await s.req("POST","",body)).status).toBe(409);});
 it("never exposes Office investigation notes through the Warehouse route",async()=>{const s=setup();s.rpc.mockResolvedValue({data:{receipt_id:receipt,revision:0,can_record:true,can_investigate:true,observer:null,observations:[observation],notes:[{id,observation_id:id,note:"Office investigation",actor_id:actor,actor_name:"TEST Office",recorded_at:observation.recorded_at,request_key:key}]}});const r=await s.req();expect(await r.json()).toMatchObject({notes:[],can_investigate:false});});
 it("exposes no Office physical-record writer or Warehouse investigation writer",async()=>{const office=setup("office");expect((await office.req("POST","",body)).status).toBe(404);expect(office.rpc).not.toHaveBeenCalled();const warehouse=setup();expect((await warehouse.req("POST",`/${id}/notes`,{key,note:"x"})).status).toBe(404);expect(warehouse.rpc).not.toHaveBeenCalled();});
 it("writes investigation only against the exact original observation",async()=>{const s=setup("office");s.rpc.mockResolvedValue({data:{id,observation_id:id,note:"Source not verified",actor_id:actor,actor_name:"TEST Office",recorded_at:observation.recorded_at,request_key:key}});expect((await s.req("POST",`/${id}/notes`,{key,note:"Source not verified"})).status).toBe(200);expect(s.rpc).toHaveBeenCalledWith("receiving_extra_observation_note",{p_receipt_id:receipt,p_observation_id:id,p_note:"Source not verified",p_key:key});});
});
