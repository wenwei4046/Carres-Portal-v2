import {afterEach,describe,it,expect,vi} from "vitest";
import {Hono} from "hono";
import {receivingReportEvidenceRouter} from "./receiving-report-evidence";
import {userClient} from "../lib/supabase";
import type {AppEnv} from "../types";
vi.mock("../lib/supabase",()=>({userClient:vi.fn()}));
const id="00000000-0000-4000-8000-000000000901",actor="00000000-0000-4000-8000-000000000902",fileId="00000000-0000-4000-8000-000000000903",event="00000000-0000-4000-8000-000000000904";
const file={id:fileId,path:`${id}/${actor}/${fileId}.png`,name:"TEST.png",kind:"photo",event_id:event,created_at:"2026-10-21T04:00:00Z"};
function setup(mode:"warehouse"|"office"="warehouse",role=mode==="warehouse"?"warehouse":"operation"){
 const rpc=vi.fn(),signUpload=vi.fn().mockResolvedValue({data:{token:"TEST-slot"}}),signRead=vi.fn().mockResolvedValue({data:{signedUrl:"http://test.invalid/file"}});
 const from=vi.fn().mockReturnValue({createSignedUploadUrl:signUpload,createSignedUrl:signRead});vi.mocked(userClient).mockReturnValue({rpc,storage:{from}} as never);
 const app=new Hono<AppEnv>();app.use("*",async(c,next)=>{c.set("auth",{id:actor,role,jwt:"TEST-JWT",warehouseId:"00000000-0000-4000-8000-000000000905"} as never);await next();});app.route("/",receivingReportEvidenceRouter(mode));
 const req=(suffix="",method="GET",body?:unknown)=>app.request(`/${id}/report-evidence${suffix}`,{method,headers:{"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
 return {rpc,from,signRead,signUpload,req};
}
afterEach(()=>vi.resetAllMocks());
describe("Original report evidence user-JWT boundary",()=>{
 it("fails closed when SQL is absent without signing anything",async()=>{const s=setup();s.rpc.mockResolvedValue({error:{code:"PGRST202",message:"missing helper"}});expect((await s.req()).status).toBe(503);expect(s.from).not.toHaveBeenCalled();});
 it("does not sign for a denied person or Site",async()=>{const s=setup();s.rpc.mockResolvedValue({error:{code:"42501",message:"Not allowed"}});expect((await s.req("/slots","POST",{fileId,name:"TEST.png",mimeType:"image/png",sizeBytes:6209})).status).toBe(403);expect(s.from).not.toHaveBeenCalled();});
 it("only signs the DB-bound receipt/person slot",async()=>{const s=setup();s.rpc.mockResolvedValue({data:{id:fileId,path:file.path,attached:false}});expect((await s.req("/slots","POST",{fileId,name:"TEST.png",mimeType:"image/png",sizeBytes:6209})).status).toBe(200);expect(s.signUpload).toHaveBeenCalledWith(file.path);expect(s.from).toHaveBeenCalledWith("receiving-report-proofs");expect(s.rpc).toHaveBeenCalledWith("receiving_report_file_slot",expect.objectContaining({p_receipt_id:id,p_file_id:fileId}));});
 it("refuses a returned path outside this receipt and person",async()=>{const s=setup();s.rpc.mockResolvedValue({data:{id:fileId,path:`other/${fileId}`,attached:false}});expect((await s.req("/slots","POST",{fileId,name:"TEST.png",mimeType:"image/png",sizeBytes:6209})).status).toBe(502);expect(s.from).not.toHaveBeenCalled();});
 it("keeps an attached retry idempotent without requesting another upload token",async()=>{const s=setup();s.rpc.mockResolvedValue({data:{id:fileId,path:file.path,attached:true}});expect((await s.req("/slots","POST",{fileId,name:"TEST.png",mimeType:"image/png",sizeBytes:6209})).status).toBe(200);expect(s.signUpload).not.toHaveBeenCalled();});
 it("Office signs only an attached file from the authorised original report",async()=>{const s=setup("office");s.rpc.mockResolvedValue({data:{can_upload:false,files:[file]}});expect((await s.req(`/${fileId}`)).status).toBe(200);expect(s.signRead).toHaveBeenCalledWith(file.path,300);expect((await s.req("/slots","POST",{})).status).toBe(404);});
 it("does not sign an uncommitted file",async()=>{const s=setup();s.rpc.mockResolvedValue({data:{can_upload:true,files:[{...file,event_id:null}]}});expect((await s.req(`/${fileId}`)).status).toBe(403);expect(s.signRead).not.toHaveBeenCalled();});
 it("completes only through the owning SQL finaliser, with no receipt/Stock writer",async()=>{const s=setup();s.rpc.mockResolvedValue({data:{id:fileId,path:file.path,event_id:event,already_saved:true}});expect((await s.req(`/${fileId}/complete`,"POST")).status).toBe(200);expect(s.rpc).toHaveBeenCalledTimes(1);expect(s.rpc).toHaveBeenCalledWith("receiving_report_file_complete",{p_receipt_id:id,p_file_id:fileId});});
});
