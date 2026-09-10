import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {MemoryRouter} from "react-router-dom";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import ArrivalSourceWorkspace from "./ArrivalSourceWorkspace";
vi.mock("@/lib/api",()=>({apiFetch:vi.fn()}));
vi.mock("@/lib/queries",()=>({useReceivingDuty:vi.fn(()=>({data:{allowed:true},isLoading:false}))}));
vi.mock("@/components/DOFileUploadField",()=>({default:({onUploaded}:{onUploaded:(p:string)=>void})=><button type="button" onClick={()=>onUploaded("source/proof.pdf")}>Upload proof fixture</button>}));
vi.mock("./components/ModuleHeader",()=>({default:()=>null}));
import {apiFetch} from "@/lib/api";
import {useReceivingDuty} from "@/lib/queries";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const units=[1,2,3].map(n=>({id:id(n),unit_code:`U1-000-00${n}`,sku:"Fixture",status:n===3?"transferred":"free",qty:1,warehouse_id:id(20),reserved_ref:null}));
const detail={source:{id:id(10),source_no:"TR-TEST",kind:"transfer",to_site_id:id(20),from_site_id:id(21),party_id:id(30),expected_date:"2026-09-07",collection_date:"2026-09-06",reason:"Fixture request",claim_id:null,case_id:null,cancelled_at:null,created_at:"2026-09-05"},units:units.map(u=>({source_id:id(10),stock_item_id:u.id,replaces_item_id:null,unit:u})),events:[],receipts:[{id:id(40),grn_no:"GRN-TEST",status:"posted",goods_received_at:"2026-09-06",posted_at:"2026-09-06",do_number:"DO-TEST",do_file_path:"proof.pdf",unit_results:[{stock_item_id:id(1),unit_code:units[0].unit_code,outcome:"received",issue_kind:null},{stock_item_id:id(2),unit_code:units[1].unit_code,outcome:"received_with_issue",issue_kind:"damaged"}]}]};
const options={sites:[{id:id(20),name:"Destination"}],parties:[{id:id(30),name:"Recorded Warehouse",kind:"warehouse_operator"}],units,limit:100};
function show(receiving=false){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><MemoryRouter initialEntries={[`/operation?tab=receiving&arrival=${id(10)}`]}><ArrivalSourceWorkspace receiving={receiving}/></MemoryRouter></QueryClientProvider>);}
beforeEach(()=>{vi.clearAllMocks();vi.mocked(useReceivingDuty).mockReturnValue({data:{allowed:true},isLoading:false} as never);vi.mocked(apiFetch).mockImplementation(async url=>String(url).includes("/options")?options:detail as never);});
describe("source Receiving journey",()=>{
 it("opens the exact source and separates Outbound from Receiving",async()=>{show();expect(await screen.findByText(/TR-TEST/)).toBeInTheDocument();expect(screen.getByRole("link",{name:"Open Outbound"})).toHaveAttribute("href",`/operation?tab=warehouse-outbound&arrival=${id(10)}`);expect(screen.queryByRole("button",{name:"Save Receiving"})).not.toBeInTheDocument();});
 it("only offers the outstanding exact Unit and never guesses actual date/person",async()=>{show(true);expect(await screen.findByLabelText("Result U1-000-003")).toHaveValue("not_received");expect(screen.queryByLabelText("Result U1-000-001")).not.toBeInTheDocument();expect(screen.getByLabelText("Goods received on")).toHaveValue("");expect(screen.getByLabelText("Handover person")).toHaveValue("");});
 it("posts the selected exact result to Receiving, not Warehouse",async()=>{
  show(true);await screen.findByLabelText("Result U1-000-003");
  fireEvent.change(screen.getByLabelText("Goods received on"),{target:{value:"2026-09-07"}});fireEvent.change(screen.getByLabelText("Actual Site"),{target:{value:id(20)}});fireEvent.change(screen.getByLabelText("Receiving party"),{target:{value:id(30)}});fireEvent.change(screen.getByLabelText("Handover person"),{target:{value:"Recorded person"}});fireEvent.change(screen.getByLabelText("Handover document number"),{target:{value:"DO-2"}});fireEvent.click(screen.getByRole("button",{name:"Upload proof fixture"}));fireEvent.change(screen.getByLabelText("Result U1-000-003"),{target:{value:"received"}});fireEvent.click(screen.getByRole("button",{name:"Save Receiving"}));
  await waitFor(()=>expect(vi.mocked(apiFetch).mock.calls.some(([url])=>String(url).includes("/warehouse-receipts/arrival/"))).toBe(true));
  const call=vi.mocked(apiFetch).mock.calls.find(([url])=>String(url).includes("/warehouse-receipts/arrival/"))!;
  expect(JSON.parse(String(call[1]?.body)).units).toEqual([{stock_item_id:id(3),outcome:"received",issue_kind:null,note:""}]);
 });
 it("keeps the write action disabled without GRN Duty",async()=>{vi.mocked(useReceivingDuty).mockReturnValue({data:{allowed:false},isLoading:false} as never);show(true);expect(await screen.findByRole("button",{name:"Save Receiving"})).toBeDisabled();});
 it("a failed source read has a working retry",async()=>{let failed=false;vi.mocked(apiFetch).mockImplementation(async url=>{if(String(url).includes("/options"))return options as never;if(!failed){failed=true;throw new Error("Source unavailable");}return detail as never;});show();expect(await screen.findByRole("alert")).toHaveTextContent("Source unavailable");fireEvent.click(screen.getByRole("button",{name:"Retry"}));expect(await screen.findByText(/TR-TEST/)).toBeInTheDocument();});
});
