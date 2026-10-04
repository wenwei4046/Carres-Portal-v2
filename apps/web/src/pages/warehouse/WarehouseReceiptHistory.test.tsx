import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WarehouseReceiptHistory from "./WarehouseReceiptHistory";
const api=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/api",()=>({apiFetch:api}));
const id="11111111-1111-4111-8111-111111111111";
const unit="22222222-2222-4222-8222-222222222222";
const event={id:"event-1",receipt_id:id,event:"submitted",event_at:"2026-10-04T17:30:00Z",actor_name:"Aina",line_labels:{[id]:"SKU-A"},unit_labels:{[unit]:"U1-000-001"},payload:{report:{po_id:"PO-20261005-1234",do_number:"DO-1",goods_received_at:"2026-10-05",goods_received_time:null,note:"Original report",lines:[{id,received_now:null,damaged_qty:0,wrong_item_qty:null}]}}};
function show(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><WarehouseReceiptHistory receiptId={id} onClose={vi.fn()}/></QueryClientProvider>);}
beforeEach(()=>{api.mockReset();api.mockResolvedValue({events:[event]});});
describe("Warehouse report history",()=>{
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
});
