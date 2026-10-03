import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SupplierFinancePage from "./SupplierFinancePage";

/* Finance → Payables → Suppliers (0636; Chew 2026-10-03). Every read and write
   goes through apiFetch; the mock answers by URL and records the writes so a
   test can read the exact payload the page sent. Names are invented. */
const api = vi.hoisted(() => ({
  routes: {} as Record<string, unknown>,
  calls: [] as Array<{ url: string; method: string; body: unknown }>,
  fail: new Set<string>(),
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? "GET";
    api.calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined });
    const path = url.replace(/\?.*$/, "");
    if (api.fail.has(path)) throw Object.assign(new Error("boom"), { status: 500, body: {} });
    if (method !== "GET") return { id: "11111111-1111-4111-8111-111111111111" };
    if (!(path in api.routes)) throw new Error(`unexpected read ${url}`);
    return api.routes[path];
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/lib/supabase", () => ({ supabase: { storage: { from: vi.fn() } } }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: unknown) => unknown) => sel({ user: { id: "u1" }, role: "finance" }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const LIST = "/api/finance/payables/supplier-finance";
const SOFA = "11111111-1111-4111-8111-111111111111";
const LANDLORD = "44444444-4444-4444-8444-444444444444";

const rows = [
  {
    supplier_id: SOFA, name: "Lumen Sofa Works", kind: "factory_pickup",
    tax_no: "C 2001234567", registration_no: "201901012345",
    bank_name: "Maybank", bank_account_no: "514012345678", bank_account_holder: "Lumen Sofa Works Sdn Bhd",
    updated_at: "2026-10-03T03:15:00Z", updated_by_name: "Chew",
  },
  {
    supplier_id: LANDLORD, name: "Bayview Properties", kind: "other_creditor",
    tax_no: null, registration_no: null, bank_name: null, bank_account_no: null, bank_account_holder: null,
    updated_at: null, updated_by_name: null,
  },
];

beforeEach(() => {
  api.routes = { [LIST]: { rows } };
  api.calls = [];
  api.fail = new Set();
  localStorage.clear();
});

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/finance/suppliers"]}>
        <Routes>
          <Route path="/finance/suppliers" element={<SupplierFinancePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const writes = () => api.calls.filter((c) => c.method !== "GET");

describe("Finance → Suppliers (0636)", () => {
  it("lists every supplier with Finance's details; a detail nobody keyed is an empty cell", async () => {
    show();
    expect(await screen.findByText("Lumen Sofa Works")).toBeInTheDocument();
    expect(screen.getByText("514012345678")).toBeInTheDocument();
    expect(screen.getByText("Bayview Properties")).toBeInTheDocument();
    expect(screen.getByText("Other creditor")).toBeInTheDocument();
    const empty = screen.getByTestId(`supplier-finance-row-${LANDLORD}`);
    expect(empty).not.toHaveTextContent(/on file|Never changed|Not recorded/);
    expect(empty).not.toHaveTextContent("—");
    expect(screen.getByTestId("supplier-finance-summary")).toHaveTextContent("2 suppliers · 1 with a bank account");
  });

  it("puts where the money goes before the tax facts", async () => {
    show();
    await screen.findByText("Lumen Sofa Works");
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent?.trim()).filter(Boolean);
    expect(heads.slice(0, 5)).toEqual(["Supplier", "Bank", "Account No", "Account holder", "Last changed"]);
  });

  it("saves the details a person typed, as typed (the server tidies them)", async () => {
    show();
    fireEvent.doubleClick(await screen.findByTestId(`supplier-finance-row-${LANDLORD}`));
    expect(await screen.findByTestId("supplier-finance-form")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Bank"), { target: { value: "Public Bank" } });
    fireEvent.change(screen.getByLabelText("Account No"), { target: { value: "3201-234 567" } });
    fireEvent.change(screen.getByLabelText("Account holder"), { target: { value: "Bayview Properties Sdn Bhd" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      url: `${LIST}/${LANDLORD}`,
      method: "PUT",
      body: {
        taxNo: "",
        registrationNo: "",
        bankName: "Public Bank",
        bankAccountNo: "3201-234 567",
        bankAccountHolder: "Bayview Properties Sdn Bhd",
      },
    });
  });

  it("refuses an account number that is not 6 to 20 digits, and sends nothing", async () => {
    show();
    fireEvent.doubleClick(await screen.findByTestId(`supplier-finance-row-${SOFA}`));
    fireEvent.change(await screen.findByLabelText("Account No"), { target: { value: "12AB45" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText("An account number is 6 to 20 digits.")).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it("refuses an account number with no bank, and sends nothing", async () => {
    show();
    fireEvent.doubleClick(await screen.findByTestId(`supplier-finance-row-${LANDLORD}`));
    fireEvent.change(await screen.findByLabelText("Account No"), { target: { value: "3201234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText("Choose the bank for this account number.")).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it("says so when the list cannot be read, never shows an empty list", async () => {
    api.fail.add(LIST);
    show();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Lumen Sofa Works")).not.toBeInTheDocument();
  });
});
