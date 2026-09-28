/**
 * The owner-confirmed Repair Orders register (Purchasing MASTER §9.7, Jess
 * 2026-09-20) and the RO object page's one current action per stop (Jess
 * 2026-09-28). Every assertion names an owner ruling.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  REPAIR_ORDER_COLUMN_ORDER,
  REPAIR_ORDER_COLUMN_LABEL,
  type RepairOrderDetail,
  type RepairOrderListRow,
  type RepairOrderUnitRow,
} from "@carres/shared";
import { RepairOrdersRegister } from "./OperationRepairOrders";
import { RepairOrderView } from "./RepairOrderObject";

vi.mock("./PurchasingTabs", () => ({ default: () => <header>Repair Orders</header> }));
vi.mock("@/lib/queries", () => ({
  useOperationRepairOrders: () => ({ data: undefined, isLoading: false, isError: false }),
  useOperationRepairOrder: () => ({ data: undefined, isLoading: true }),
  useRepairOrderEvidence: () => ({ data: undefined, isError: false }),
  fetchRepairOrderEvidence: vi.fn(),
  useRepairOrderOptions: () => ({ data: undefined }),
  useRepairOrderEligibleUnits: () => ({ data: undefined }),
  useOperationSupplierClaims: () => ({ data: undefined }),
  useOperationSupplierClaimPhotos: () => ({ data: undefined }),
}));

const unit = (over: Partial<RepairOrderUnitRow> = {}): RepairOrderUnitRow => ({
  stock_item_id: "si1",
  unit_id: "U1-000-001",
  po_no: "PO260920-1111",
  sku: "SKU-1",
  category: "Sofa",
  item: "Sofa Lyra",
  item_spec: "3 seater",
  ownership: "carres_owned",
  display: false,
  problem: "damaged",
  problem_note: "Arm torn",
  repair_requirement: "Replace arm fabric",
  evidence: [],
  collected_by: null,
  actual_pickup_date: null,
  goods_received_date: null,
  grn_no: null,
  pickup_proof: null,
  return_proof: null,
  inspected: false,
  ...over,
});

const row = (over: Partial<RepairOrderListRow> = {}): RepairOrderListRow => ({
  id: "ro-1",
  ro_no: "RO-20260928-4827",
  ro_doc_date: "2026-09-28",
  version: 1,
  supplier_id: "s1",
  supplier_name: "Hooka",
  claim_id: null,
  claim_no: null,
  cost_responsibility: "not_decided",
  price: null,
  pickup_site_id: "w1",
  pickup_site_name: "Carres Klang",
  return_site_id: "w1",
  return_site_name: "Carres Klang",
  issued: false,
  supplier_received_at: null,
  return_target_date: null,
  cancelled_at: null,
  latest_reply: null,
  units: [unit(), unit({ stock_item_id: "si2", unit_id: "U1-000-002" })],
  ...over,
});

const detail = (over: Partial<RepairOrderDetail> = {}): RepairOrderDetail => ({
  ...row(),
  quotation_path: null,
  supplier_received_source: null,
  supplier_received_evidence: null,
  return_target_working_days: null,
  return_target_calendar: null,
  cancel_reason: null,
  created_by: "Faizal",
  created_at: "2026-09-28T02:00:00Z",
  sends: [],
  replies: [],
  consents: [],
  pickup_source_id: null,
  ...over,
});

function wrap(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/operation?tab=repair-orders"]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}
const headings = () => screen.getAllByRole("columnheader").map((th) => (th.textContent ?? "").trim()).filter(Boolean);

describe("the register (owner-confirmed 2026-09-20)", () => {
  it("draws the 17 columns exactly in the approved order", () => {
    wrap(<RepairOrdersRegister rows={[row()]} />);
    const approved = REPAIR_ORDER_COLUMN_ORDER.map((k) => REPAIR_ORDER_COLUMN_LABEL[k]);
    const drawn = headings().filter((h) => approved.includes(h));
    expect(drawn).toEqual(approved);
    expect(drawn).toHaveLength(17);
  });

  it("has no price, quotation, approval, finance or work column", () => {
    wrap(<RepairOrdersRegister rows={[row()]} />);
    expect(headings().join(" ")).not.toMatch(/Price|Quotation|Approval|Finance|Credit|Payment|Work/);
  });

  it("prints every Unit ID under the PO, and an unissued RO reads Not issued · Sending not confirmed", () => {
    wrap(<RepairOrdersRegister rows={[row()]} />);
    expect(screen.getByText("U1-000-001")).toBeInTheDocument();
    expect(screen.getByText("U1-000-002")).toBeInTheDocument();
    expect(screen.getByText("Not issued")).toBeInTheDocument();
    expect(screen.getByText("Sending not confirmed", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText("Not decided")).toBeInTheDocument();
  });

  it("the rail has the five groups in order and no quotation or approval facet", () => {
    wrap(<RepairOrdersRegister rows={[row()]} />);
    const rail = screen.getByTestId("repair-orders-rail");
    const text = rail.textContent ?? "";
    const order = ["Supplier", "Repair order", "Pickup", "Return", "Evidence"].map((t) => text.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).not.toMatch(/Quotation not recorded|Approval not recorded/);
  });

  it("the footer counts documents, never Units", () => {
    wrap(<RepairOrdersRegister rows={[row()]} />);
    expect(screen.getByText("1 Repair Order")).toBeInTheDocument();
  });

  it("an empty register says so, distinct from a failed read", () => {
    const { unmount } = wrap(<RepairOrdersRegister rows={[]} />);
    expect(screen.getByText("No Repair Orders yet.")).toBeInTheDocument();
    unmount();
    wrap(<RepairOrdersRegister rows={[]} isError onRetry={() => undefined} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Repair Orders could not be loaded");
  });
});

describe("the RO object: one primary door per stop, in the owner-approved words", () => {
  const door = () => within(screen.getByTestId("repair-order-current-action"));

  it("Not issued → Send {RO No} to {Supplier} · Issue repair order", () => {
    wrap(<RepairOrderView ro={detail()} />);
    expect(door().getByText("Send RO-20260928-4827 to Hooka")).toBeInTheDocument();
    expect(door().getByText("The 14 working days start when Hooka receives it.")).toBeInTheDocument();
    expect(door().getByRole("button", { name: "Issue repair order" })).toBeInTheDocument();
    expect(screen.getByTestId("repair-order-target")).toHaveTextContent("Awaiting Supplier receipt of RO");
  });

  it("Issued, receipt not recorded → Record Supplier receipt", () => {
    wrap(<RepairOrderView ro={detail({ issued: true })} />);
    expect(door().getByText("Ask Hooka to confirm they received RO-20260928-4827")).toBeInTheDocument();
    expect(door().getByText("Target starts when they confirm.")).toBeInTheDocument();
    expect(door().getByRole("button", { name: "Record Supplier receipt" })).toBeInTheDocument();
  });

  it("Waiting for pickup → Hand {n} Units to {Supplier}, opening Outbound", () => {
    wrap(<RepairOrderView ro={detail({ issued: true, supplier_received_at: "2026-09-28T03:00:00Z", return_target_date: "2026-10-16" })} />);
    expect(door().getByText("Hand 2 Units to Hooka")).toBeInTheDocument();
    expect(door().getByText("Warehouse records who collected them.")).toBeInTheDocument();
    expect(screen.getByTestId("repair-order-target")).toHaveTextContent("Carres return target:");
  });

  it("Out for repair → Waiting for {Supplier} to return {n} Units · Record Supplier reply", () => {
    const picked = [unit({ actual_pickup_date: "2026-09-29T02:00:00Z" }), unit({ stock_item_id: "si2", unit_id: "U1-000-002", actual_pickup_date: "2026-09-29T02:00:00Z" })];
    wrap(<RepairOrderView ro={detail({ issued: true, supplier_received_at: "2026-09-28T03:00:00Z", return_target_date: "2026-10-16", units: picked })} />);
    expect(door().getByText("Waiting for Hooka to return 2 Units")).toBeInTheDocument();
    expect(door().getByRole("button", { name: "Record Supplier reply" })).toBeInTheDocument();
  });

  it("Returned, not inspected → Inspect {n} returned Units", () => {
    const back = [unit({ actual_pickup_date: "2026-09-29T02:00:00Z", goods_received_date: "2026-10-10", grn_no: "GRN-1" }), unit({ stock_item_id: "si2", unit_id: "U1-000-002", actual_pickup_date: "2026-09-29T02:00:00Z", goods_received_date: "2026-10-10", grn_no: "GRN-1" })];
    wrap(<RepairOrderView ro={detail({ issued: true, supplier_received_at: "2026-09-28T03:00:00Z", return_target_date: "2026-10-16", units: back })} />);
    expect(door().getByText("Inspect 2 returned Units")).toBeInTheDocument();
    expect(door().getByText("Available again only after inspection.")).toBeInTheDocument();
  });

  it("Owner consent shows only when a Unit is not Carres-owned, and never blocks Issue", () => {
    const { unmount } = wrap(<RepairOrderView ro={detail()} />);
    expect(screen.queryByText("Owner consent")).not.toBeInTheDocument();
    unmount();
    wrap(<RepairOrderView ro={detail({ units: [unit({ ownership: "supplier_consignment" })] })} />);
    expect(screen.getByText("Owner consent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record owner consent" })).toBeInTheDocument();
    expect(door().getByRole("button", { name: "Issue repair order" })).toBeEnabled();
  });

  it("an unknown price reads Not recorded, never RM0", () => {
    wrap(<RepairOrderView ro={detail()} />);
    expect(screen.getByTestId("ro-fact-price")).toHaveTextContent("Not recorded");
  });
});
