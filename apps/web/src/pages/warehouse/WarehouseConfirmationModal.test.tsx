import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WarehouseConfirmationModal from "./WarehouseConfirmationModal";
import { apiFetch, ApiError } from "@/lib/api";
vi.mock("@/lib/api", async () => ({ ...(await vi.importActual("@/lib/api")), apiFetch: vi.fn() }));
const id="00000000-0000-4000-8000-000000000201";
const po={po_id:"PO-TEST",supplier_name:"TEST Factory",eta_date:null,sup_status:"in_production",open_receipt_id:null,lines:[{id,sku:"TEST-QTY",qty:5,received_qty:0,damaged_qty:0,wrong_item_qty:0,category:"mattress" as const,identity_mode:"quantity" as const,pending_qty:3}]};
const reportId="00000000-0000-4000-8000-000000000202";
const blocked={id:reportId,receipt_id:reportId,status:"draft",grn_no:null,revision:0,already_saved:false,blockers:[{code:"received_date_required",message:"The physical Goods Received Date is not recorded"}]};
function show(saved?: NonNullable<Parameters<typeof WarehouseConfirmationModal>[0]["saved"]>){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><WarehouseConfirmationModal po={po} onClose={vi.fn()} saved={saved}/></QueryClientProvider>);}
afterEach(()=>{cleanup();vi.resetAllMocks();});
const confirm=()=>fireEvent.click(screen.getByRole("checkbox",{name:"I checked the goods and confirm these receiving results."}));
describe("Warehouse explicit final confirmation",()=>{
 it("reopens the original report and corrects its exact revision rather than creating another", async()=>{
  const saveKey="00000000-0000-4000-8000-000000000203";
  vi.mocked(apiFetch).mockResolvedValue({...blocked,revision:3});
  show({saveKey,result:{...blocked,status:"draft",revision:2},report:{poId:po.po_id,doNumber:"TEST-ORIGINAL",doFilePath:"PO-TEST/original.png",note:"TEST retained report",lines:[{id,receivedNow:1,damagedQty:0,wrongItemQty:0}]}});
  expect(screen.getByLabelText("Supplier DO No")).toHaveValue("TEST-ORIGINAL");
  confirm();fireEvent.click(screen.getByRole("button",{name:"Save Receiving"}));
  await waitFor(()=>expect(apiFetch).toHaveBeenCalled());
  const body=JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string);
  expect(body).toMatchObject({saveKey,receiptId:reportId,revision:2,report:{doFilePath:"PO-TEST/original.png",note:"TEST retained report"}});
 });
 it("keeps canonical pending and unknown physical facts without proposing acceptance",async()=>{
  vi.mocked(apiFetch).mockResolvedValue(blocked);show();
  expect(screen.getByText("3")).toBeInTheDocument();
  confirm();fireEvent.click(screen.getByRole("button",{name:"Save Receiving"}));
  expect(await screen.findByText("Receiving report saved. No GRN created.")).toBeInTheDocument();
  const body=JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string);
  expect(body.report.goodsReceivedAt).toBeNull();expect(body.report.lines[0]).toMatchObject({receivedNow:null,damagedQty:null,wrongItemQty:null});
  expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe("/api/warehouse/receipts/confirm");
 });
 it("clears the old problem when the confirmer changes a Unit to Received",async()=>{
  vi.mocked(apiFetch).mockResolvedValue(blocked);
  const exact={...po,lines:[{...po.lines[0],identity_mode:"exact_unit" as const}],expected_units:[{id:"unit",po_line_id:id,unit_code:"U1-000-301",sku:"TEST-QTY",status:"incoming"}]};
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><WarehouseConfirmationModal po={exact} saved={{saveKey:"00000000-0000-4000-8000-000000000203",result:{...blocked,status:"draft"},report:{poId:po.po_id,lines:[{id,units:[{unitCode:"U1-000-301",outcome:"received_with_issue",issueKind:"damaged"}]}]}}} onClose={vi.fn()}/></QueryClientProvider>);
  fireEvent.keyDown(screen.getByRole("combobox",{name:"U1-000-301"}),{key:"Enter"});
  fireEvent.click(await screen.findByRole("option",{name:"Received",exact:true}));
  confirm();fireEvent.click(screen.getByRole("button",{name:"Save Receiving"}));
  await waitFor(()=>expect(apiFetch).toHaveBeenCalled());
  const body=JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string);
  expect(body.report.lines[0].units[0]).toMatchObject({outcome:"received",issueKind:null});
 });
 it("allows correction after a definite validation refusal without treating it as a saved result",async()=>{
  vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(422,"Check the document number",{}));show();confirm();
  fireEvent.click(screen.getByRole("button",{name:"Save Receiving"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Check the document number");
  expect(screen.getByLabelText("Supplier DO No")).not.toBeDisabled();
  expect(screen.queryByRole("button",{name:"Try again"})).not.toBeInTheDocument();
  expect(screen.queryByText("Receiving saved")).not.toBeInTheDocument();
 });
 it("retains the identical report and key after an uncertain response",async()=>{
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error("offline after save")).mockResolvedValue(blocked);show();confirm();
  fireEvent.click(screen.getByRole("button",{name:"Save Receiving"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Not confirmed");
  fireEvent.click(screen.getByRole("button",{name:"Try again"}));
  await screen.findByText("Receiving report saved. No GRN created.");
  expect(vi.mocked(apiFetch).mock.calls[1][1]!.body).toEqual(vi.mocked(apiFetch).mock.calls[0][1]!.body);
 });
 it("shows a formal GRN only from the confirmed posted result",async()=>{
  vi.mocked(apiFetch).mockResolvedValue({...blocked,status:"posted",grn_no:"GRN-20261019-TEST",blockers:[]});show();confirm();
  fireEvent.click(screen.getByRole("button",{name:"Save Receiving"}));
  expect(await screen.findByText(/GRN.*TEST/)).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Save Receiving"})).not.toBeInTheDocument();
 });
 it("guards a changed report on Escape",async()=>{
  show();fireEvent.change(screen.getByLabelText("Supplier DO No"),{target:{value:"TEST-DO"}});
  fireEvent.keyDown(screen.getByRole("dialog"),{key:"Escape",code:"Escape"});
  expect(await screen.findByRole("dialog",{name:"Leave without saving?"})).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Stay"}));
  await waitFor(()=>expect(screen.getByLabelText("Supplier DO No")).toHaveValue("TEST-DO"));
 });
});
