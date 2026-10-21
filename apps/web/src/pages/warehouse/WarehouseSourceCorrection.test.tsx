import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import WarehouseConfirmationReports from "./WarehouseConfirmationReports";
import { apiFetch } from "@/lib/api";
const h=vi.hoisted(()=>({site:"00000000-0000-4000-8000-000000000401",line:"00000000-0000-4000-8000-000000000402",receipt:"00000000-0000-4000-8000-000000000403",key:"00000000-0000-4000-8000-000000000404",refetch:vi.fn()}));
const row={id:h.receipt,po_id:null,arrival_source_id:null,source_no:null,supplier_name:null,do_number:null,status:"draft",grn_no:null,submitted_at:"2026-10-19T12:00:00Z",save_key:h.key,revision:4,blockers:[{code:"source_not_available",message:"Source not available"}],raw_report:{po_id:"UNIDENTIFIED",actual_site_id:h.site,goods_received_at:"2026-10-19",do_number:"TEST-ORIGINAL",do_file_path:"UNIDENTIFIED/original.png",lines:[{id:"00000000-0000-4000-8000-000000000405",received_now:2,damaged_qty:0,wrong_item_qty:0}]}};
// Attachment reads have their own permission/retry tests. Keep this test
// focused on the original receipt writer, while checking its evidence identity.
vi.mock("@/components/receiving/ReceivingReportEvidence",()=>({default:({receiptId}:{receiptId:string})=><div data-testid="original-report-evidence-boundary" data-receipt-id={receiptId}/>}));
vi.mock("@/lib/api",async()=>({...await vi.importActual("@/lib/api"),apiFetch:vi.fn()}));
vi.mock("@/lib/warehouse-confirmation",async()=>({...await vi.importActual("@/lib/warehouse-confirmation"),
 useWarehouseConfirmationReports:()=>({data:{receipts:[row]},isPending:false,isError:false,refetch:h.refetch}),
 useWarehouseConfirmationSources:()=>({data:{warehouse:{id:h.site,name:"TEST Site"},pos:[{po_id:"PO-TEST-CORRECT",supplier_name:"TEST Factory",eta_date:null,sup_status:"in_production",open_receipt_id:null,lines:[{id:h.line,sku:"TEST SAME SKU",qty:3,received_qty:0,damaged_qty:0,wrong_item_qty:0,pending_qty:3,identity_mode:"quantity",category:"mattress"}]}]},isPending:false,isError:false,refetch:h.refetch}),
 useWarehouseConfirmationArrivals:()=>({data:{sources:[]},isPending:false,isError:false,refetch:h.refetch}),
 useWarehouseConfirmationHistory:()=>({data:{events:[]},isPending:false,isError:false,refetch:h.refetch}),
}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("unposted Receiving source correction",()=>{
 it("chooses an admitted source, rechecks unknown quantities and saves the original report rather than another",async()=>{
  vi.mocked(apiFetch).mockResolvedValue({id:h.receipt,receipt_id:h.receipt,status:"draft",grn_no:null,revision:5,already_saved:false,blockers:[{code:"physical_count_required",message:"Record the physical count"}]});
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><MemoryRouter initialEntries={["/warehouse/receipts"]}><Routes><Route path="/warehouse/receipts" element={<WarehouseConfirmationReports/>}/></Routes></MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByRole("row",{name:/UNIDENTIFIED/}));
  expect(screen.getByTestId("original-report-evidence-boundary")).toHaveAttribute("data-receipt-id",h.receipt);
  fireEvent.click(await screen.findByRole("button",{name:"Find PO or CO"}));
  fireEvent.click(await screen.findByRole("button",{name:"Count this delivery"}));
  expect(apiFetch).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Received Qty")).toHaveValue(null);
  fireEvent.click(screen.getByRole("checkbox",{name:"I checked the goods and confirm these receiving results."}));
  fireEvent.click(screen.getByRole("button",{name:"Save Receiving"}));
  await waitFor(()=>expect(apiFetch).toHaveBeenCalled());
  const request=JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string);
  expect(request).toMatchObject({receiptId:h.receipt,saveKey:h.key,revision:4,report:{poId:"PO-TEST-CORRECT",doFilePath:null,lines:[{id:h.line,receivedNow:null,damagedQty:null,wrongItemQty:null}]}});
  expect(await screen.findByText("Record the physical count")).toBeInTheDocument();
  expect(screen.queryByText("Receiving saved")).not.toBeInTheDocument();
 });
});
