import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WarehouseReceiptHistory from "./WarehouseReceiptHistory";
import ReceivingReportHistory from "@/components/receiving/ReceivingReportHistory";
const api=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/api",()=>({apiFetch:api}));
const id="11111111-1111-4111-8111-111111111111";
const unit="22222222-2222-4222-8222-222222222222";
const event={id:"event-1",receipt_id:id,event:"submitted" as const,event_at:"2026-10-04T17:30:00Z",actor_name:"Aina",line_labels:{[id]:"SKU-A"},unit_labels:{[unit]:"U1-000-001"},payload:{report:{po_id:"PO-20261005-1234",do_number:"DO-1",goods_received_at:"2026-10-05",goods_received_time:null,note:"Original report",lines:[{id,received_now:null,damaged_qty:0,wrong_item_qty:null}]}}};
function show(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><WarehouseReceiptHistory receiptId={id} onClose={vi.fn()}/></QueryClientProvider>);}
beforeEach(()=>{api.mockReset();api.mockResolvedValue({events:[event]});});
describe("Warehouse report history",()=>{
  it("uses supplied Operation snapshots and its own evidence door without calling Warehouse",async()=>{
    api.mockResolvedValue({url:"https://example.test/operation-proof.jpg"});
    const original={...event,payload:{report:{...event.payload.report,arrival_evidence:[{path:"PO-20261005-1234/photo.jpg",kind:"photo"}]}}};
    render(<QueryClientProvider client={new QueryClient()}><ReceivingReportHistory receiptId={id}
      events={[original]} initialEventId={original.id} evidenceBasePath={`/api/operation/warehouse-receipts/${id}`} onClose={vi.fn()}/></QueryClientProvider>);
    expect(screen.getByText("Original report")).toBeVisible();
    expect(api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Photo 1"}));
    expect(await screen.findByRole("img",{name:"Photo 1"})).toHaveAttribute("src","https://example.test/operation-proof.jpg");
    expect(api).toHaveBeenCalledWith(`/api/operation/warehouse-receipts/${id}/history/event-1/evidence?path=${encodeURIComponent("PO-20261005-1234/photo.jpg")}`);
  });

  it("opens the original reported facts with unknown counts and time preserved",async()=>{
    show();fireEvent.click(await screen.findByRole("button",{name:"View"}));
    expect(screen.getByText("Original report")).toBeVisible();
    expect(screen.getByText("PO-261005-1234")).toBeVisible();
    expect(screen.getByText("Time not recorded")).toBeVisible();
    const table=screen.getByRole("table",{name:"Items"});
    expect(within(table).getByText("SKU-A")).toBeVisible();
    expect(within(table).getAllByText("Not recorded")).toHaveLength(2);
    expect(within(table).getByText("0")).toBeVisible();
    expect(screen.queryByRole("button",{name:"Save Receiving"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"History"}));
    expect(screen.getByRole("button",{name:"View"})).toBeVisible();
    expect(screen.getByText(/Mon, 5 Oct 01:30/)).toBeVisible();
  });
  it("shows non-PO Unit results with human labels even without an Incoming source",async()=>{
    api.mockResolvedValue({events:[{...event,payload:{report:{arrival_source_id:id,arrival_units:[{stock_item_id:unit,outcome:"received_with_issue",issue_kind:"damaged",note:"Leg damaged"}]}}}]});
    show();fireEvent.click(await screen.findByRole("button",{name:"View"}));
    const table=screen.getByRole("table",{name:"Units"});
    expect(table).toHaveTextContent("U1-000-001");
    expect(table).toHaveTextContent("Received with issue");
    expect(table).toHaveTextContent("Leg damaged");
    expect(screen.queryByText(unit)).not.toBeInTheDocument();
    expect(screen.queryByText("PO No")).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("shows read failure with retry rather than an empty history",async()=>{
    api.mockRejectedValueOnce(new Error("History unavailable"));show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not be loaded");
    expect(screen.queryByText("No receiving activity yet.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Try again"}));
    expect(await screen.findByRole("button",{name:"View"})).toBeVisible();
  });
  it("does not print malformed raw JSON as a report",async()=>{
    api.mockResolvedValue({events:[{...event,payload:{report:{lines:"invalid"}}}]});show();
    fireEvent.click(await screen.findByRole("button",{name:"View"}));
    expect(screen.getByRole("alert")).toHaveTextContent("Not available. Go back and reload.");
    expect(screen.queryByText("invalid")).not.toBeInTheDocument();
  });
  it("reads the selected event's proof and opens saved photo evidence with its Unit binding",async()=>{
    const path="PO-20261005-1234/condition.jpg";
    api.mockImplementation((url:string)=>url.includes("/evidence?")?Promise.resolve({url:"https://example.test/proof.jpg"}):Promise.resolve({events:[{...event,payload:{report:{...event.payload.report,do_file_path:"PO-20261005-1234/do.pdf",lines:[{id,damaged_photos:[{path,unit_code:"U1-000-001"}]}]}}}]}));
    show();fireEvent.click(await screen.findByRole("button",{name:"View"}));
    expect(await screen.findByRole("link",{name:"View handover proof"})).toHaveAttribute("href","https://example.test/proof.jpg");
    fireEvent.click(screen.getByRole("button",{name:"Photo 1"}));
    const viewer=await screen.findByRole("dialog",{name:"Photo 1"});
    expect(viewer).toHaveTextContent("U1-000-001");
    expect(await within(viewer).findByRole("img",{name:"Photo 1"})).toHaveAttribute("src","https://example.test/proof.jpg");
    expect(api).toHaveBeenCalledWith(`/api/warehouse/receipts/${id}/history/event-1/evidence?path=${encodeURIComponent(path)}`);
  });
  it("loads each next file on demand without treating an unopened video as failed",async()=>{
    api.mockImplementation((url:string)=>url.includes("/evidence?")?Promise.resolve({url:"https://example.test/clip.mp4"}):Promise.resolve({events:[{...event,payload:{report:{...event.payload.report,arrival_evidence:[{path:"PO-20261005-1234/photo.jpg",kind:"photo"},{path:"PO-20261005-1234/clip.mp4",kind:"video"}]}}}]}));
    show();fireEvent.click(await screen.findByRole("button",{name:"View"}));
    fireEvent.click(screen.getByRole("button",{name:"Photo 1"}));
    await screen.findByRole("img",{name:"Photo 1"});
    expect(api.mock.calls.filter(([url])=>url.includes("/evidence?"))).toHaveLength(1);
    fireEvent.click(screen.getByRole("button",{name:"Next"}));
    const viewer=await screen.findByRole("dialog",{name:"Video 2"});
    await vi.waitFor(()=>expect(viewer.querySelector("video")).toHaveAttribute("src","https://example.test/clip.mp4"));
    expect(within(viewer).queryByRole("alert")).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledWith(`/api/warehouse/receipts/${id}/history/event-1/evidence?path=${encodeURIComponent("PO-20261005-1234/clip.mp4")}`);
  });
  it("keeps failed saved evidence visible and retries through the same report door",async()=>{
    let read=0;
    api.mockImplementation((url:string)=>url.includes("/evidence?")?(++read===1?Promise.reject(new Error("Denied")):Promise.resolve({url:"https://example.test/renewed.jpg"})):Promise.resolve({events:[{...event,payload:{report:{...event.payload.report,arrival_evidence:[{path:"PO-20261005-1234/photo.jpg",kind:"photo"}]}}}]}));
    show();fireEvent.click(await screen.findByRole("button",{name:"View"}));fireEvent.click(screen.getByRole("button",{name:"Photo 1"}));
    const viewer=await screen.findByRole("dialog",{name:"Photo 1"});
    expect(await within(viewer).findByRole("alert")).toHaveTextContent("Photo 1 could not be loaded");
    fireEvent.click(within(viewer).getByRole("button",{name:"Try again"}));
    expect(await within(viewer).findByRole("img",{name:"Photo 1"})).toHaveAttribute("src","https://example.test/renewed.jpg");
  });
});
