import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import ReceivingReportEvidence from "./ReceivingReportEvidence";
import {apiFetch,ApiError} from "@/lib/api";
const {transfer}=vi.hoisted(()=>({transfer:vi.fn()}));
vi.mock("@/lib/api",async()=>({...await vi.importActual("@/lib/api"),apiFetch:vi.fn()}));
vi.mock("@/lib/supabase",()=>({supabase:{storage:{from:()=>({uploadToSignedUrl:transfer})}}}));
const id="00000000-0000-4000-8000-000000000901",event="00000000-0000-4000-8000-000000000904";
function show(office=false){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><ReceivingReportEvidence receiptId={id} office={office}/></QueryClientProvider>);}
beforeEach(()=>{URL.createObjectURL=vi.fn(()=>"blob:TEST");URL.revokeObjectURL=vi.fn();});
afterEach(()=>{cleanup();vi.resetAllMocks();});
describe("Receipt-owned file transfer",()=>{
 it.each([403,503])("shows admission/deployment refusal %s without upload or pointless retry",async status=>{vi.mocked(apiFetch).mockRejectedValue(new ApiError(status,"Unavailable",{}));show();expect(await screen.findByRole("alert")).toBeVisible();expect(screen.queryByLabelText("Arrival evidence")).toBeNull();expect(screen.queryByRole("button",{name:"Try again"})).toBeNull();});
 it("retries lost finalisation with the same file/slot and verifies an existing object",async()=>{
  let complete=0;let saved:Record<string,unknown>|null=null;
  vi.mocked(apiFetch).mockImplementation(async(url,options)=>{
   if(String(url).endsWith('/slots')){const input=JSON.parse(options!.body as string);return {id:input.fileId,path:`${id}/TEST/${input.fileId}.png`,token:'TEST',attached:false};}
   if(String(url).endsWith('/complete')){complete++;if(complete===1)throw new Error('lost finalisation response');const fileId=String(url).split('/').at(-2)!;saved={id:fileId,path:`${id}/TEST/${fileId}.png`,name:'TEST.png',kind:'photo',event_id:event,created_at:'2026-10-21T04:00:00Z'};return {event_id:event};}
   return {can_upload:true,files:saved?[saved]:[]};
  });
  transfer.mockResolvedValueOnce({error:null}).mockResolvedValueOnce({error:{statusCode:'409',message:'The resource already exists'}});
  show();const input=await screen.findByLabelText("Arrival evidence");
  fireEvent.change(input,{target:{files:[new File(['TEST screenshot'],'TEST.png',{type:'image/png'})]}});
  fireEvent.click(await screen.findByRole('button',{name:'Retry'}));
  await waitFor(()=>expect(screen.getByText('Uploaded')).toBeVisible());
  const slots=vi.mocked(apiFetch).mock.calls.filter(([url])=>String(url).endsWith('/slots'));
  expect(JSON.parse(slots[0]![1]!.body as string).fileId).toBe(JSON.parse(slots[1]![1]!.body as string).fileId);
  expect(transfer.mock.calls[0]![0]).toBe(transfer.mock.calls[1]![0]);expect(complete).toBe(2);
  expect(screen.queryByRole('button',{name:'Remove'})).toBeNull();expect(await screen.findByRole('button',{name:'View proof'})).toBeVisible();
 });
 it("Office never exposes upload even if a malformed permission response says it may",async()=>{vi.mocked(apiFetch).mockResolvedValue({can_upload:true,files:[]});show(true);await screen.findByText('Original report evidence');expect(screen.queryByLabelText('Arrival evidence')).toBeNull();});
});
