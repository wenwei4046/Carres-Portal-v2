import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { itSaysNoBannedWord } from "@/test/banned-words";
import SupplierCreditNotes from "./SupplierCreditNotes";

/* Every read and write goes through apiFetch; the mock answers by URL and
   records the writes, so a test reads the exact payload the page sent.
   Names are invented. */
const api = vi.hoisted(() => ({
  routes: {} as Record<string, unknown>,
  calls: [] as Array<{ url: string; method: string; body: unknown }>,
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? "GET";
    api.calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined });
    if (method !== "GET") return { id: NOTE };
    const path = url.replace(/\?.*$/, "");
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

const B = "/api/finance/payables";
const SUP = "11111111-1111-4111-8111-111111111111";
const NOTE = "22222222-2222-4222-8222-222222222222";
const DRAFT = "22222222-2222-4222-8222-222222222223";
const BILL1 = "77777777-7777-4777-8777-777777777771";
const BILL2 = "77777777-7777-4777-8777-777777777772";
const BILL3 = "77777777-7777-4777-8777-777777777773";
const APP = "33333333-3333-4333-8333-333333333331";

const register = { rows: [
  { id: NOTE, note_no: "SCN-20260920-4821", status: "confirmed", supplier_id: SUP, supplier_name: "Lumen Sofa Works",
    supplier_kind: "supplier", supplier_note_no: "LSW-CN-7", note_date: "2026-09-20", ap_account_code: "2110",
    total_amount: "350.00", applied_total: "200.00", credit_open: "150.00", file_count: 1, created_at: "2026-09-20T02:00:00Z" },
  { id: DRAFT, note_no: null, status: "draft", supplier_id: SUP, supplier_name: "Lumen Sofa Works",
    supplier_kind: "supplier", supplier_note_no: "LSW-CN-8", note_date: "2026-09-21", ap_account_code: "2110",
    total_amount: "80.00", applied_total: null, credit_open: null, file_count: 0, created_at: "2026-09-21T02:00:00Z" },
] };

function noteDoc(over: { status: string; can: Record<string, boolean>; applications?: unknown[] }) {
  return {
    note: {
      id: NOTE, note_no: over.status === "draft" ? null : "SCN-20260920-4821", status: over.status,
      supplier_id: SUP, supplier_name: "Lumen Sofa Works", supplier_kind: "supplier", supplier_note_no: "LSW-CN-7",
      note_date: "2026-09-20", ap_account_code: "2110", ap_account_name: "Trade payables", total_amount: "350.00",
      narration: null, cancel_reason: null, created_at: "2026-09-20T02:00:00Z", created_by_name: "Aina",
      confirmed_at: null, confirmed_by_name: null, cancelled_at: null, cancelled_by_name: null,
      entry_no: over.status === "draft" ? null : "JE-20260920-0007", reversal_entry_no: null,
    },
    lines: [
      { line_no: 1, account_code: "5100", account_name: "Cost of goods sold", description: "Two chairs returned",
        amount: "300.00", department_type: "OFFICE", department_id: null },
      { line_no: 2, account_code: "4900", account_name: "Other income", description: "Rebate",
        amount: "50.00", department_type: "SUBSCRIPTION", department_id: null },
    ],
    applications: over.applications ?? [],
    files: [],
    events: [],
    applied_total: over.status === "confirmed" ? "200.00" : null,
    credit_open: over.status === "confirmed" ? "150.00" : null,
    go_live_on: "2026-09-01",
    can: { edit: false, confirm: false, cancel: false, add_file: false, apply: false, take_off: false, ...over.can },
  };
}

const applied = { application_id: APP, bill_id: BILL1, bill_no: "BILL-4XK2", supplier_invoice_no: "LSW-901",
  bill_date: "2026-09-10", amount: "200.00", status: "applied", created_at: "2026-09-20T03:00:00Z",
  applied_on: "2026-09-20", created_by_name: "Aina", cancelled_at: null, cancel_reason: null };

beforeEach(() => {
  api.calls.length = 0;
  api.routes = {
    [`${B}/credit-notes`]: register,
    [`${B}/suppliers`]: { rows: [{ id: SUP, name: "Lumen Sofa Works", kind: "supplier" }] },
    [`${B}/accounts`]: { rows: [
      { code: "2110", name: "Trade payables", kind: "LIABILITY", parent_code: "2100", is_control: true, control_for: "SUPPLIER",
        for_bill_line: false, for_voucher_line: false, for_ap: true, for_pay_from: false, for_credit_line: false },
      { code: "4900", name: "Other income", kind: "INCOME", parent_code: "4000", is_control: false, control_for: null,
        for_bill_line: false, for_voucher_line: false, for_ap: false, for_pay_from: false, for_credit_line: true },
      { code: "5100", name: "Cost of goods sold", kind: "EXPENSE", parent_code: "5000", is_control: false, control_for: null,
        for_bill_line: true, for_voucher_line: true, for_ap: false, for_pay_from: false, for_credit_line: true },
      { code: "1120", name: "Bank", kind: "ASSET", parent_code: "1100", is_control: false, control_for: null,
        for_bill_line: false, for_voucher_line: false, for_ap: false, for_pay_from: true, for_credit_line: false },
    ] },
    "/api/finance/ledger/accounts": {
      go_live_on: "2026-09-01",
      accounts: [
        { code: "2110", name: "Trade payables", kind: "LIABILITY", parent_code: null, is_control: true, control_for: "SUPPLIER", is_active: true, is_header: false, sort_order: 0 },
      ],
      roles: { TRADE_PAYABLE: "2110" },
    },
    "/api/finance/ledger/departments": { rows: [
      { department_type: "SUBSCRIPTION", department_id: null, name: "Subscription" },
      { department_type: "OFFICE", department_id: null, name: "Office" },
    ] },
    [`${B}/bill-outstanding`]: { rows: [
      { bill_id: BILL1, bill_no: "BILL-4XK2", supplier_id: SUP, supplier_name: "Lumen Sofa Works", supplier_invoice_no: "LSW-901",
        bill_date: "2026-09-10", due_date: null, po_id: null, total_amount: "1000.00", paid_total: "200.00", balance_owing: "800.00",
        go_live_on: "2026-09-01", ap_account_code: "2110", allocated_total: "200.00", unallocated: "800.00", supplier_kind: "supplier" },
      { bill_id: BILL2, bill_no: "BILL-8PZ7", supplier_id: SUP, supplier_name: "Lumen Sofa Works", supplier_invoice_no: "LSW-902",
        bill_date: "2026-09-12", due_date: null, po_id: null, total_amount: "90.00", paid_total: "0.00", balance_owing: "90.00",
        go_live_on: "2026-09-01", ap_account_code: "2110", allocated_total: "0.00", unallocated: "90.00", supplier_kind: "supplier" },
      // Another payables account: never offered for this credit note.
      { bill_id: BILL3, bill_no: "BILL-2QQ1", supplier_id: SUP, supplier_name: "Lumen Sofa Works", supplier_invoice_no: "LSW-903",
        bill_date: "2026-09-13", due_date: null, po_id: null, total_amount: "40.00", paid_total: "0.00", balance_owing: "40.00",
        go_live_on: "2026-09-01", ap_account_code: "2120", allocated_total: "0.00", unallocated: "40.00", supplier_kind: "supplier" },
    ] },
  };
  localStorage.clear();
});

function show(at: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/finance/credit-notes/*" element={<SupplierCreditNotes />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const writes = () => api.calls.filter((c) => c.method !== "GET");
const pick = async (scope: HTMLElement, field: RegExp, option: string) => {
  fireEvent.keyDown(within(scope).getByRole("combobox", { name: field }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: option }));
};

describe("Credit Notes register", () => {
  it("lists credit notes in words, with what is left to knock off in the footer", async () => {
    show("/finance/credit-notes");
    const confirmed = await screen.findByTestId(`credit-note-row-${NOTE}`);
    expect(confirmed).toHaveTextContent("SCN-20260920-4821");
    expect(confirmed).toHaveTextContent("Lumen Sofa Works");
    expect(confirmed).toHaveTextContent("LSW-CN-7");
    expect(confirmed).toHaveTextContent("Confirmed");
    expect(confirmed).toHaveTextContent("RM 150.00");
    const draft = screen.getByTestId(`credit-note-row-${DRAFT}`);
    expect(draft).toHaveTextContent("Draft, no number yet");
    // A draft has knocked nothing off: those cells stay empty, never RM 0.00.
    expect(draft).not.toHaveTextContent("RM 0.00");
    expect(screen.getByTestId("credit-notes-summary")).toHaveTextContent("2 credit notes · RM 150.00 left to knock off");
    expect(screen.getByTestId("new-credit-note")).toHaveTextContent("New Credit Note");
  });
});

describe("A credit note", () => {
  it("a draft is confirmed from its page, and the database decides the rest", async () => {
    api.routes[`${B}/credit-notes/${NOTE}`] = noteDoc({ status: "draft", can: { edit: true, confirm: true, cancel: true } });
    show(`/finance/credit-notes/${NOTE}`);
    expect(await screen.findByTestId("credit-note-status")).toHaveTextContent("Draft");
    const lines = screen.getByTestId("credit-note-lines");
    expect(lines).toHaveTextContent("Two chairs returned");
    expect(lines).toHaveTextContent("5100 Cost of goods sold");
    expect(lines).toHaveTextContent("RM 350.00");
    expect(screen.getByTestId("credit-note-applications")).toHaveTextContent("A credit note is knocked off bills once it is confirmed.");
    fireEvent.click(screen.getByRole("button", { name: "Confirm credit note" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("RM 350.00 comes off what Carres owes Lumen Sofa Works");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm credit note" }));
    await waitFor(() => expect(writes()).toEqual([{ url: `${B}/credit-notes/${NOTE}/confirm`, method: "POST", body: undefined }]));
  });

  it("knocks off one of the supplier's bills on the same payables account, at most what both have left", async () => {
    api.routes[`${B}/credit-notes/${NOTE}`] = noteDoc({ status: "confirmed", can: { apply: true, take_off: true, add_file: true }, applications: [applied] });
    show(`/finance/credit-notes/${NOTE}`);
    const knocked = await screen.findByTestId(`credit-note-application-${APP}`);
    expect(knocked).toHaveTextContent("BILL-4XK2 · Applied · Sun, 20 Sep · RM 200.00");
    fireEvent.click(screen.getByRole("button", { name: "Knock off a bill" }));
    const form = await screen.findByTestId("knock-off-form");
    fireEvent.keyDown(await within(form).findByRole("combobox", { name: /Bill/ }), { key: "Enter" });
    const offered = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(offered).toEqual([
      "BILL-4XK2 · Thu, 10 Sep · RM 800.00 left to pay",
      "BILL-8PZ7 · Sat, 12 Sep · RM 90.00 left to pay",
    ]);
    fireEvent.click(screen.getByRole("option", { name: /BILL-8PZ7/ }));
    // The amount starts at the most it can be: the bill's RM 90.00, under the RM 150.00 left.
    expect(within(form).getByLabelText(/Amount/)).toHaveValue(90);
    fireEvent.change(within(form).getByLabelText(/Amount/), { target: { value: "120" } });
    expect(screen.getByRole("button", { name: "At most RM 90.00" })).toBeDisabled();
    fireEvent.change(within(form).getByLabelText(/Amount/), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Knock off" }));
    await waitFor(() => expect(writes()).toEqual([
      { url: `${B}/credit-notes/${NOTE}/applications`, method: "POST", body: { billId: BILL2, amount: 60 } },
    ]));
  });

  it("takes a knock-off off its bill with a reason", async () => {
    api.routes[`${B}/credit-notes/${NOTE}`] = noteDoc({ status: "confirmed", can: { take_off: true }, applications: [applied] });
    show(`/finance/credit-notes/${NOTE}`);
    fireEvent.click(await screen.findByRole("button", { name: "Take off the bill" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Wrong bill" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Take off the bill" }));
    await waitFor(() => expect(writes()).toEqual([
      { url: `${B}/credit-note-applications/${APP}/cancel`, method: "POST", body: { reason: "Wrong bill" } },
    ]));
  });
});

describe("New Credit Note", () => {
  it("names the next gap on Save, then sends the supplier's paper as typed", async () => {
    show("/finance/credit-notes/new");
    const form = await screen.findByTestId("credit-note-form");
    const save = screen.getByTestId("save-credit-note");
    expect(save).toHaveTextContent("Choose who sent this credit note");
    expect(save).toBeDisabled();

    await pick(form, /Supplier$/, "Lumen Sofa Works · Supplier");
    fireEvent.change(within(form).getByLabelText(/Supplier's credit note No/), { target: { value: " LSW-CN-9 " } });
    fireEvent.change(within(form).getByLabelText(/Line 1 · Description/), { target: { value: "Rebate for September" } });
    await pick(form, /^Account/, "4900 Other income");
    fireEvent.change(within(form).getByLabelText(/Amount/), { target: { value: "75.5" } });
    await screen.findAllByRole("option", { name: "Subscription" });
    fireEvent.change(within(form).getByLabelText("Line 1 department"), { target: { value: "SUBSCRIPTION" } });
    expect(screen.getByTestId("credit-note-form-total")).toHaveTextContent("Total RM 75.50");
    // The usual payables account is the database's own choice, named from its role.
    expect(within(form).getByRole("combobox", { name: /Payables account/ })).toHaveTextContent("2110 Trade payables (usual)");

    await waitFor(() => expect(save).toHaveTextContent("Save"));
    fireEvent.click(save);
    await waitFor(() => expect(writes()).toHaveLength(1));
    const sent = writes()[0]!;
    expect(sent.url).toBe(`${B}/credit-notes`);
    expect(sent.method).toBe("POST");
    expect(sent.body).toMatchObject({
      supplierId: SUP,
      supplierNoteNo: "LSW-CN-9",
      apAccountCode: null,
      narration: null,
      lines: [{ accountCode: "4900", description: "Rebate for September", amount: 75.5, departmentType: "SUBSCRIPTION", departmentId: null }],
    });
    expect((sent.body as { noteDate: string }).noteDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

itSaysNoBannedWord(join(dirname(fileURLToPath(import.meta.url)), "SupplierCreditNotes.tsx"), { minStrings: 40, expectString: "Knock off a bill" });
