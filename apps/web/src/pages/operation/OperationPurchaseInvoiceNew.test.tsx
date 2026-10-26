import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OperationPurchaseInvoiceNew, { OperationPurchaseInvoiceEdit } from "./OperationPurchaseInvoiceNew";

/* 0721 (Chew, Finance, WhatsApp 2026-10-23, via YH): Purchasing enters a bill
   from goods received through Finance's own bill door. Names are invented. */
const api = vi.hoisted(() => ({
  routes: {} as Record<string, unknown>,
  calls: [] as Array<{ url: string; method: string; body: unknown }>,
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? "GET";
    api.calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined });
    const path = url.replace(/\?.*$/, "");
    if (method !== "GET") return { id: "33333333-3333-4333-8333-333333333333" };
    if (!(path in api.routes)) throw new Error(`unexpected read ${url}`);
    return api.routes[path];
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: unknown) => unknown) => sel({ user: { id: "u1" }, role: "operation" }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const B = "/api/finance/payables";
const SUP = "11111111-1111-4111-8111-111111111111";
const GRN = "55555555-5555-4555-8555-555555555555";
const POL = "66666666-6666-4666-8666-666666666661";

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/operation/purchase-invoices/new" element={<OperationPurchaseInvoiceNew />} />
          <Route path="/operation/purchase-invoices/from-grn" element={<OperationPurchaseInvoiceNew fromGrn />} />
          <Route path="/operation/purchase-invoices/:id/edit" element={<OperationPurchaseInvoiceEdit />} />
          <Route path="/operation" element={<div>Purchase Invoices list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.calls = [];
  api.routes = {
    [`${B}/accounts`]: { rows: [{ code: "6100", name: "Freight In", kind: "EXPENSE", for_bill_line: true },
      { code: "1000", name: "Bank", kind: "ASSET", for_bill_line: false }] },
    "/api/finance/ledger/departments": { rows: [{ department_type: "OFFICE", department_id: null, name: "Office" }] },
    "/api/operation/suppliers": { suppliers: [{ id: SUP, name: "Lumen Sofa Works" }] },
    [`${B}/bills/grn-candidates`]: { rows: [{ receipt_id: GRN, grn_no: "GRN-A1", po_id: "PO-3001", supplier_id: SUP,
      supplier_name: "Lumen Sofa Works", received_on: "2026-10-20", posted_at: "2026-10-20T02:00:00Z",
      open_lines: 1, open_qty: 2, open_value_at_po_cost: "200.00", po_terms_days: 30 }] },
    [`${B}/bills/grn-lines/${GRN}`]: { rows: [{ receipt_id: GRN, grn_no: "GRN-A1", po_id: "PO-3001", supplier_id: SUP,
      supplier_name: "Lumen Sofa Works", po_line_id: POL, sku: "SOFA-3S", received_qty: 2, billed_qty: 0, open_qty: 2,
      po_unit_cost: "100.00", commercial_treatment: "normal", channels: [], department_type: null, department_id: null }] },
  };
});

describe("Purchasing enters a supplier bill (0721)", () => {
  it("Bill from GRN: the GRN's lines come across at the PO's price and save through Finance's bill door", async () => {
    renderAt("/operation/purchase-invoices/from-grn");
    fireEvent.click(await screen.findByRole("button", { name: "Use this GRN" }));
    await screen.findByTestId("purchase-invoice-lines");
    expect(screen.getByLabelText("Supplier")).toHaveValue(SUP);
    expect(screen.getByTestId("purchase-invoice-total")).toHaveTextContent("200.00");

    // The supplier's bill says 95 each; Purchasing types what the bill says.
    fireEvent.change(screen.getByLabelText("Unit price on line 1"), { target: { value: "95" } });
    expect(screen.getByTestId("purchase-invoice-save")).toHaveTextContent("Save: type the supplier invoice No");
    fireEvent.change(screen.getByLabelText("Supplier invoice No"), { target: { value: "LSW-901" } });
    fireEvent.click(screen.getByTestId("purchase-invoice-save"));

    await screen.findByText("Purchase Invoices list");
    const post = api.calls.find((c) => c.method === "POST");
    expect(post?.url).toBe(`${B}/bills`);
    expect(post?.body).toMatchObject({
      supplierId: SUP, supplierInvoiceNo: "LSW-901", apAccountCode: null,
      lines: [{ warehouseReceiptId: GRN, poLineId: POL, accountCode: null, qty: 2, unitPrice: 95,
        departmentType: null, departmentId: null }],
    });
  });

  it("New bill: nothing saves until a GRN is added, and there is no account, payables or payment choice", async () => {
    renderAt("/operation/purchase-invoices/new");
    await screen.findByRole("option", { name: "Lumen Sofa Works" });
    fireEvent.change(screen.getByLabelText("Supplier"), { target: { value: SUP } });
    fireEvent.change(screen.getByLabelText("Supplier invoice No"), { target: { value: "LSW-902" } });
    expect(screen.getByTestId("purchase-invoice-save")).toBeDisabled();
    expect(screen.queryByLabelText("Payables account")).toBeNull();
    expect(screen.queryByText(/Confirm|Pay/)).toBeNull();
    fireEvent.click(screen.getByTestId("purchase-invoice-add-grn"));
    fireEvent.click(await screen.findByRole("button", { name: "Use this GRN" }));
    await waitFor(() => expect(screen.getByTestId("purchase-invoice-save")).toBeEnabled());
    expect(api.calls.some((c) => c.url.startsWith(`${B}/bills/grn-candidates?supplierId=${SUP}`))).toBe(true);
  });

  // YH (chat 2026-10-26), following Houzs: a freight or service line beside the GRN lines.
  it("Add other line: a no-GRN line with an account from Finance's list and a department saves beside the GRN", async () => {
    renderAt("/operation/purchase-invoices/from-grn");
    fireEvent.click(await screen.findByRole("button", { name: "Use this GRN" }));
    await screen.findByTestId("purchase-invoice-lines");
    fireEvent.change(screen.getByLabelText("Supplier invoice No"), { target: { value: "LSW-903" } });
    fireEvent.click(screen.getByTestId("purchase-invoice-add-other"));
    await screen.findByRole("option", { name: "6100 Freight In" });
    expect(screen.queryByRole("option", { name: "1000 Bank" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Description on line 2"), { target: { value: "Freight" } });
    fireEvent.change(screen.getByLabelText("Account on line 2"), { target: { value: "6100" } });
    fireEvent.change(screen.getByLabelText("Amount on line 2"), { target: { value: "30" } });
    expect(screen.getByTestId("purchase-invoice-save")).toHaveTextContent("Save: pick the department on line 2");
    await screen.findByRole("option", { name: "Office" });
    fireEvent.change(screen.getByLabelText("Department on line 2"), { target: { value: "OFFICE" } });
    fireEvent.click(screen.getByTestId("purchase-invoice-save"));
    await screen.findByText("Purchase Invoices list");
    expect(api.calls.find((c) => c.method === "POST")?.body).toMatchObject({
      lines: [{ warehouseReceiptId: GRN }, { accountCode: "6100", description: "Freight", amount: 30, departmentType: "OFFICE" }],
    });
  });

  it("Edit: Purchasing's own draft opens with its lines and saves back to the same bill", async () => {
    const BILL = "77777777-7777-4777-8777-777777777777";
    api.routes[`/api/operation/purchase-invoices/${BILL}`] = { id: BILL, supplier_id: SUP, supplier_invoice_no: "LSW-904",
      bill_date: "2026-10-21", due_date: null, narration: null,
      lines: [{ warehouse_receipt_id: GRN, po_line_id: POL, grn_no: "GRN-A1", sku: "SOFA-3S", description: "SOFA-3S",
        account_code: null, qty: 2, unit_price: 100, amount: 200, department_type: null, department_id: null }] };
    renderAt(`/operation/purchase-invoices/${BILL}/edit`);
    await screen.findByTestId("purchase-invoice-lines");
    expect(screen.getByLabelText("Supplier invoice No")).toHaveValue("LSW-904");
    fireEvent.change(screen.getByLabelText("Unit price on line 1"), { target: { value: "90" } });
    fireEvent.click(screen.getByTestId("purchase-invoice-save"));
    await screen.findByText("Purchase Invoices list");
    const put = api.calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe(`${B}/bills/${BILL}`);
    expect(put?.body).toMatchObject({ lines: [{ warehouseReceiptId: GRN, poLineId: POL, qty: 2, unitPrice: 90, accountCode: null }] });
  });
});
