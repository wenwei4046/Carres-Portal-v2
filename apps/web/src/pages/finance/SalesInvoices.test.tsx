import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SalesInvoices from "./SalesInvoices";

const state = vi.hoisted(() => ({ data: [] as unknown[] | undefined, isSuccess: true, isError: false, refetch: vi.fn() }));
vi.mock("@/lib/queries", () => ({ useInvoiceRegister: () => state }));
vi.mock("@/pages/operation/components/ModuleHeader", () => ({ default: () => null }));

const order = { id: "o1", so: 123, customer_name: "Customer One", source_ref: ["REF-1"], status: "open", paid: 40,
  delivery_date: null, delivery_date_tbd: true, delivered_at: null };
const invoice = (over: object) => ({ id: "i1", invoice_no: "INV-1", status: "issued", kind: "sales", amount: 100, tax_amount: 6,
  issued_at: "2026-10-01T02:00:00Z", voided_at: null, void_reason: null, replaces_invoice_id: null,
  created_at: "2026-10-01T02:00:00Z", order_id: "o1", orders: order, ...over });

function Where() {
  const { pathname, search } = useLocation();
  return <div data-testid="where">{pathname + search}</div>;
}
const show = () => render(<MemoryRouter initialEntries={["/finance/sales-invoices"]}><SalesInvoices /><Where /></MemoryRouter>);

describe("Sales Invoices list", () => {
  it("starts with the document number and lists sales invoices only", () => {
    state.data = [invoice({}), invoice({ id: "s1", invoice_no: "STO-1", kind: "storage" })];
    show();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent ?? "").filter((t) => t.trim());
    expect(headers[0]).toContain("Invoice No");
    expect(screen.getByText("INV-1")).toBeInTheDocument();
    expect(screen.queryByText("STO-1")).toBeNull();
    expect(screen.getByTestId("sales-invoices-summary")).toHaveTextContent("1 sales invoice");
  });

  it("clicking a row opens that invoice", () => {
    state.data = [invoice({})];
    show();
    fireEvent.click(screen.getByText("Customer One"));
    expect(screen.getByTestId("where")).toHaveTextContent("/finance/monitor?invoice=i1");
  });

  it("names a draft and a voided invoice instead of failing on them", () => {
    state.data = [invoice({ invoice_no: null, status: "draft", issued_at: null }), invoice({ id: "i2", invoice_no: "INV-2", status: "voided" })];
    show();
    expect(screen.getByText("Draft, no number yet")).toBeInTheDocument();
    expect(screen.getByText("Voided")).toBeInTheDocument();
  });

  it("says so when the list cannot load, never an empty list", () => {
    Object.assign(state, { data: undefined, isError: true, isSuccess: false });
    show();
    expect(screen.getByRole("alert")).toHaveTextContent("Sales Invoices could not be loaded");
    Object.assign(state, { data: [], isError: false, isSuccess: true });
  });
});
