import {afterEach,describe,it,expect,vi} from "vitest";
import {cleanup,render,screen,fireEvent} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import WarehouseUnidentifiedReportModal from "./WarehouseUnidentifiedReportModal";
import {apiFetch,ApiError} from "@/lib/api";
vi.mock("@/lib/api",async()=>({...await vi.importActual("@/lib/api"),apiFetch:vi.fn()}));
const id="00000000-0000-4000-8000-000000000801";
const site={id:"00000000-0000-4000-8000-000000000802",name:"TEST receiving Site"};
const saved={id,receipt_id:id,status:"draft",grn_no:null,revision:0,already_saved:false,blockers:[{code:"receipt_source_not_available",message:"The source is not available to this receiving Site"}]};
function show(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><WarehouseUnidentifiedReportModal site={site} onClose={vi.fn()}/></QueryClientProvider>);}
const note=()=>fireEvent.change(screen.getByLabelText(/Note/),{target:{value:"TEST 2 sealed cartons; labels unreadable"}});
afterEach(()=>{cleanup();vi.resetAllMocks();});
describe("Unidentified delivery original report",()=>{
 it("records observations with no guessed identity, quantity acceptance or posting claim",async()=>{
  vi.mocked(apiFetch).mockResolvedValue(saved);show();
  expect(screen.getByRole("button",{name:"Save report"})).toBeDisabled();note();
  fireEvent.change(screen.getByLabelText("Handover person"),{target:{value:"TEST Driver"}});
  fireEvent.click(screen.getByRole("button",{name:"Save report"}));
  expect(await screen.findByText("Receiving report saved. No GRN created.")).toBeVisible();
  const [url,options]=vi.mocked(apiFetch).mock.calls[0]!;expect(url).toBe("/api/warehouse/receipts/confirm");
  const body=JSON.parse(options!.body as string);
  expect(body.report).toMatchObject({poId:null,arrivalSourceId:null,actualSiteId:site.id,goodsReceivedAt:null,goodsReceivedTime:null,lines:[],arrivalUnits:[],extraLines:[],arrivalEvidence:[],handoverPerson:"TEST Driver",note:"TEST 2 sealed cartons; labels unreadable"});
  expect(body).not.toHaveProperty("receiptId");expect(screen.queryByText("Receiving saved")).toBeNull();
 });
 it("retries a lost response with the identical body/key and blocks leaving or editing",async()=>{
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error("lost response")).mockResolvedValue(saved);show();note();
  fireEvent.click(screen.getByRole("button",{name:"Save report"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Not confirmed");
  expect(screen.getByLabelText(/Note/)).toBeDisabled();expect(screen.getByRole("button",{name:"Cancel"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Try again"}));
  await screen.findByText("Receiving report saved. No GRN created.");
  expect(vi.mocked(apiFetch).mock.calls[0]![1]!.body).toBe(vi.mocked(apiFetch).mock.calls[1]![1]!.body);
 });
 it("keeps a definitely refused observation editable and never claims it was saved",async()=>{
  vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(422,"Check the report",{}));show();note();
  fireEvent.click(screen.getByRole("button",{name:"Save report"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Check the report");
  expect(screen.getByLabelText(/Note/)).not.toBeDisabled();
  expect(screen.queryByText("Receiving report saved. No GRN created.")).toBeNull();
 });
 it("does not turn an unexpected posted answer into report success",async()=>{
  vi.mocked(apiFetch).mockResolvedValue({...saved,status:"posted",grn_no:"GRN-UNEXPECTED"});show();note();
  fireEvent.click(screen.getByRole("button",{name:"Save report"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Not confirmed");
  expect(screen.queryByText("Receiving report saved. No GRN created.")).toBeNull();
 });
 it.each([403,503])("does not offer pointless retry or a legacy fallback after admission/deployment refusal %s",async(status)=>{
  vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(status,"Unavailable",{code:"receiving_confirmation_unavailable"}));show();note();
  fireEvent.click(screen.getByRole("button",{name:"Save report"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Ask Operation");
  expect(screen.getByRole("button",{name:"Save report"})).toBeDisabled();
  expect(screen.queryByRole("button",{name:"Try again"})).toBeNull();
  expect(apiFetch).toHaveBeenCalledTimes(1);
 });

});
