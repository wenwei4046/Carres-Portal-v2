import {afterEach,describe,it,expect,vi} from "vitest";
import {render,screen,fireEvent,cleanup,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import ReceivingExtraObservations from "./ReceivingExtraObservations";
import {apiFetch,ApiError} from "@/lib/api";
vi.mock("@/lib/api",async()=>({...await vi.importActual("@/lib/api"),apiFetch:vi.fn()}));
const receipt="00000000-0000-4000-8000-000000000701",id="00000000-0000-4000-8000-000000000703",actor="00000000-0000-4000-8000-000000000702";
const row={id,receipt_id:receipt,report_revision:4,report_snapshot:{po_id:null},label:null,qty:null,note:"Labels unreadable",goods_received_at:null,actual_site_id:actor,site_name:"TEST Site",holder_party_id:actor,holder_name:"TEST NETS",recorded_by:actor,actor_name:"TEST Warehouse person",recorded_at:"2026-10-21T04:00:00Z",request_key:actor};
const data={receipt_id:receipt,revision:4,can_record:true,can_investigate:false,observer:{site_name:"TEST Site",holder_name:"TEST NETS",actor_name:"TEST Warehouse person"},observations:[] as typeof row[],notes:[]};
function show(office=false){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><ReceivingExtraObservations receiptId={receipt} office={office}/></QueryClientProvider>);}
afterEach(()=>{cleanup();vi.resetAllMocks();});
describe("Original custody observations and investigation",()=>{
 it.each([403,503])("keeps unavailable/denied %s distinct from empty and offers no pointless retry",async status=>{vi.mocked(apiFetch).mockRejectedValue(new ApiError(status,"Unavailable",{}));show();await screen.findByRole("alert");expect(screen.queryByText("No observations recorded yet.")).toBeNull();expect(screen.queryByRole("button",{name:"Record goods held"})).toBeNull();expect(screen.queryByRole("button",{name:"Try again"})).toBeNull();});
 it("preserves unknown quantity/date/label and actual context without calling confirmation",async()=>{
  let saved:typeof row|null=null;
  vi.mocked(apiFetch).mockImplementation(async(_url,options)=>{if(options?.method==="POST"){const b=JSON.parse(options.body as string);saved={...row,request_key:b.key,note:b.note};return saved;}return {...data,observations:saved?[saved]:[]};});show();
  fireEvent.click(await screen.findByRole("button",{name:"Record goods held"}));expect(screen.getByText("TEST NETS")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Note"),{target:{value:"Labels unreadable"}});fireEvent.click(screen.getByRole("button",{name:"Save observation"}));
  await screen.findByText("Observation recorded. No GRN or Stock created.");
  const write=vi.mocked(apiFetch).mock.calls.find(([,o])=>o?.method==="POST")!;expect(write[0]).toBe(`/api/warehouse/confirmation/receipts/${receipt}/extra-observations`);expect(JSON.parse(write[1]!.body as string)).toMatchObject({revision:4,label:null,qty:null,day:null});
  expect(screen.queryByRole("button",{name:/Accept|Return|Done/})).toBeNull();
 });
 it("keeps the exact observation body/key on an uncertain save",async()=>{
  let attempts=0;
  vi.mocked(apiFetch).mockImplementation(async(_url,options)=>{if(options?.method==="POST"){attempts++;if(attempts===1)throw new Error("lost response");const b=JSON.parse(options.body as string);return {...row,request_key:b.key,note:b.note};}return data;});show();
  fireEvent.click(await screen.findByRole("button",{name:"Record goods held"}));fireEvent.change(screen.getByLabelText("Note"),{target:{value:"Labels unreadable"}});fireEvent.click(screen.getByRole("button",{name:"Save observation"}));
  await screen.findByRole("alert");expect(screen.getByLabelText("Note")).toBeDisabled();expect(screen.getByRole("button",{name:"Cancel"})).toBeDisabled();fireEvent.click(screen.getByRole("button",{name:"Try again"}));await screen.findByText("Observation recorded. No GRN or Stock created.");
  const writes=vi.mocked(apiFetch).mock.calls.filter(([,o])=>o?.method==="POST");expect(writes[1]![1]!.body).toBe(writes[0]![1]!.body);
 });
 it("appends an Office note to the observation with the same request on retry",async()=>{
  let attempts=0;let saved:Record<string,unknown>|null=null;
  vi.mocked(apiFetch).mockImplementation(async(_url,options)=>{if(options?.method==="POST"){attempts++;if(attempts===1)throw new Error("lost note reply");const b=JSON.parse(options.body as string);saved={id,observation_id:row.id,note:b.note,actor_id:actor,actor_name:"TEST Office investigator",recorded_at:row.recorded_at,request_key:b.key};return saved;}return {...data,can_record:false,can_investigate:true,observations:[row],notes:saved?[saved]:[]};});show(true);
  fireEvent.click(await screen.findByRole("button",{name:"Open observation 1"}));expect(screen.getByText(/TEST Warehouse person/)).toBeVisible();fireEvent.click(screen.getByRole("button",{name:"Add investigation note"}));fireEvent.change(screen.getByLabelText("Investigation note"),{target:{value:"Source is not verified"}});fireEvent.click(screen.getByRole("button",{name:"Save note"}));await screen.findByRole("alert");fireEvent.click(screen.getByRole("button",{name:"Try again"}));await screen.findByText("Investigation note recorded. No goods accepted or returned.");
  const writes=vi.mocked(apiFetch).mock.calls.filter(([,o])=>o?.method==="POST");expect(writes[0]![0]).toBe(`/api/operation/warehouse-receipts/${receipt}/extra-observations/${row.id}/notes`);expect(writes[1]![1]!.body).toBe(writes[0]![1]!.body);
  fireEvent.click(screen.getByRole("button",{name:"Open observation 1"}));await waitFor(()=>expect(screen.getByText("Source is not verified")).toBeVisible());expect(screen.getByText(/TEST Warehouse person/)).toBeVisible();
 });
});
