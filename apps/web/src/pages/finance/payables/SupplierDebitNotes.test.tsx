import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { itSaysNoBannedWord } from "@/test/banned-words";
import SupplierDebitNotes from "./SupplierDebitNotes";

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
const NOTE = "44444444-4444-4444-8444-444444444444";
const DRAFT = "44444444-4444-4444-8444-444444444445";
const PV = "55555555-5555-4555-8555-555555555555";
const OWED = "66666666-6666-4666-8666-666666666666";

const register = { rows: [
  { id: NOTE, note_no: "PDN-20261005-3381", status: "confirmed", supplier_id: SUP, supplier_name: "Lumen Sofa Works",
    supplier_kind: "supplier", supplier_note_no: "LSW-DN-4", note_date: "2026-10-05", due_date: "2026-11-04",
    ap_account_code: "2110", total_amount: "180.00", paid_total: "100.00", held_total: "100.00", debit_open: "80.00",
    file_count: 1, created_at: "2026-10-05T02:00:00Z" },
  { id: DRAFT, note_no: null, status: "draft", supplier_id: SUP, supplier_name: "Lumen Sofa Works",
    supplier_kind: "supplier", supplier_note_no: "LSW-DN-5", note_date: "2026-10-06", due_date: null,
    ap_account_code: "2110", total_amount: "45.00", paid_total: null, held_total: null, debit_open: null,
    file_count: 0, created_at: "2026-10-06T02:00:00Z" },
] };

function noteDoc(over: { status: string; can: Record<string, boolean>; payments?: unknown[]; paid?: string }) {
  const confirmed = over.status === "confirmed";
  return {
    note: {
      id: NOTE, note_no: over.status === "draft" ? null : "PDN-20261005-3381", status: over.status,
      supplier_id: SUP, supplier_name: "Lumen Sofa Works", supplier_kind: "supplier", supplier_note_no: "LSW-DN-4",
      note_date: "2026-10-05", due_date: "2026-11-04", ap_account_code: "2110", ap_account_name: "Trade payables",
      total_amount: "180.00", narration: null, cancel_reason: null, created_at: "2026-10-05T02:00:00Z", created_by_name: "Aina",
      confirmed_at: null, confirmed_by_name: null, cancelled_at: null, cancelled_by_name: null,
      entry_no: over.status === "draft" ? null : "JE-20261005-0003", reversal_entry_no: null,
    },
    lines: [
      { line_no: 1, account_code: "5100", account_name: "Cost of goods sold", description: "Price raised on two sofas",
        amount: "150.00", department_type: "OFFICE", department_id: null },
      { line_no: 2, account_code: "5300", account_name: "Transport on purchases", description: "Delivery charge",
        amount: "30.00", department_type: "OFFICE", department_id: null },
    ],
    payments: over.payments ?? [],
    files: [],
    events: [],
    paid_total: confirmed ? (over.paid ?? "0.00") : null,
    held_total: confirmed ? (over.paid ?? "0.00") : null,
    debit_open: confirmed ? (180 - Number(over.paid ?? 0)).toFixed(2) : null,
    go_live_on: "2026-09-01",
    can: { edit: false, confirm: false, cancel: false, add_file: false, ...over.can },
  };
}

beforeEach(() => {
  api.calls.length = 0;
  api.routes = {
    [`${B}/debit-notes`]: register,
    [`${B}/suppliers`]: { rows: [{ id: SUP, name: "Lumen Sofa Works", kind: "supplier" }] },
    [`${B}/accounts`]: { rows: [
      { code: "2110", name: "Trade payables", kind: "LIABILITY", parent_code: "2100", is_control: true, control_for: "SUPPLIER",
        for_bill_line: false, for_voucher_line: false, for_ap: true, for_pay_from: false, for_credit_line: false },
      { code: "4900", name: "Other income", kind: "INCOME", parent_code: "4000", is_control: false, control_for: null,
        for_bill_line: false, for_voucher_line: false, for_ap: false, for_pay_from: false, for_credit_line: true },
      { code: "5100", name: "Cost of goods sold", kind: "EXPENSE", parent_code: "5000", is_control: false, control_for: null,
        for_bill_line: true, for_voucher_line: true, for_ap: false, for_pay_from: false, for_credit_line: true },
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
  };
  localStorage.clear();
});

function show(at: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/finance/debit-notes/*" element={<SupplierDebitNotes />} />
          <Route path="/finance/payment-vouchers/new" element={<p data-testid="voucher-new">New voucher</p>} />
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

describe("Debit Notes register", () => {
  it("lists debit notes in words, with what is left to pay in the footer", async () => {
    show("/finance/debit-notes");
    const confirmed = await screen.findByTestId(`debit-note-row-${NOTE}`);
    expect(confirmed).toHaveTextContent("PDN-20261005-3381");
    expect(confirmed).toHaveTextContent("Lumen Sofa Works");
    expect(confirmed).toHaveTextContent("LSW-DN-4");
    expect(confirmed).toHaveTextContent("Confirmed");
    expect(confirmed).toHaveTextContent("RM 80.00");
    const draft = screen.getByTestId(`debit-note-row-${DRAFT}`);
    expect(draft).toHaveTextContent("Draft, no number yet");
    // A draft owes nothing yet: those cells stay empty, never RM 0.00.
    expect(draft).not.toHaveTextContent("RM 0.00");
    expect(screen.getByTestId("debit-notes-summary")).toHaveTextContent("2 debit notes · RM 80.00 left to pay");
    expect(screen.getByTestId("new-debit-note")).toHaveTextContent("New Debit Note");
  });
});

describe("A debit note", () => {
  it("a draft is confirmed from its page, and the database decides the rest", async () => {
    api.routes[`${B}/debit-notes/${NOTE}`] = noteDoc({ status: "draft", can: { edit: true, confirm: true, cancel: true } });
    show(`/finance/debit-notes/${NOTE}`);
    expect(await screen.findByTestId("debit-note-status")).toHaveTextContent("Draft");
    const lines = screen.getByTestId("debit-note-lines");
    expect(lines).toHaveTextContent("Price raised on two sofas");
    expect(lines).toHaveTextContent("5100 Cost of goods sold");
    expect(lines).toHaveTextContent("RM 180.00");
    expect(screen.getByTestId("debit-note-payments")).toHaveTextContent("A payment voucher pays a debit note once it is confirmed.");
    expect(screen.getByTestId("debit-note-settles")).toHaveTextContent("A debit note settles the notes its supplier owes once it is confirmed.");
    expect(screen.queryByTestId("pay-debit-note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirm debit note" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("RM 180.00 is added to what Carres owes Lumen Sofa Works");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm debit note" }));
    await waitFor(() => expect(writes()).toEqual([{ url: `${B}/debit-notes/${NOTE}/confirm`, method: "POST", body: undefined }]));
  });

  it("a confirmed one shows its vouchers and opens a new voucher for what is left", async () => {
    api.routes[`${B}/debit-notes/${NOTE}`] = noteDoc({
      status: "confirmed", can: { add_file: true }, paid: "100.00",
      payments: [{ voucher_id: PV, voucher_no: "PV-20261006-1100", voucher_status: "approved", voucher_date: "2026-10-06",
        amount_applied: "100.00", created_at: "2026-10-06T02:00:00Z" }],
    });
    api.routes[`${B}/debit-notes/${NOTE}/notes-to-follow-up`] = { settled: "0.00", left_to_settle: "180.00", settlements: [], owed: [] };
    show(`/finance/debit-notes/${NOTE}`);
    expect(await screen.findByTestId(`debit-note-payment-${PV}`)).toHaveTextContent("PV-20261006-1100 · Approved · Tue, 6 Oct · RM 100.00");
    const scroll = screen.getByTestId("debit-note-object-scroll");
    expect(scroll).toHaveTextContent("Left to pay");
    expect(scroll).toHaveTextContent("RM 80.00");
    expect(await screen.findByTestId("debit-note-settles")).toHaveTextContent("This supplier owes no other debit note to follow up.");
    fireEvent.click(screen.getByTestId("pay-debit-note"));
    expect(await screen.findByTestId("voucher-new")).toBeInTheDocument();
  });

  it("settles a debit note its supplier owes, from the debit note", async () => {
    api.routes[`${B}/debit-notes/${NOTE}`] = noteDoc({ status: "confirmed", can: {} });
    api.routes[`${B}/debit-notes/${NOTE}/notes-to-follow-up`] = {
      settled: "0.00", left_to_settle: "180.00", settlements: [],
      owed: [{ id: OWED, supplier_id: SUP, supplier_name: "Lumen Sofa Works", kind: "DEBIT", reason: "OTHER", amount: "60.00",
        settled: "0.00", left: "60.00", status: "waiting", remark: "Transport they will charge", noted_on: "2026-10-01",
        next_follow_up_on: null, last_contact: null, bill_id: null, bill_no: null, supplier_invoice_no: null, bill_status: null,
        line_no: null, line_item: null, line_qty: null, line_unit_price: null, po_unit_cost: null, grn_no: null, po_id: null,
        purchase_return_id: null, pr_no: null, closed_at: null, closed_by_name: null, close_reason: null,
        created_at: "2026-10-01T02:00:00Z", created_by_name: "Aina" }],
    };
    show(`/finance/debit-notes/${NOTE}`);
    fireEvent.click(await screen.findByTestId(`settle-${OWED}`));
    const form = await screen.findByTestId("settle-note-form");
    expect(within(form).getByLabelText(/Amount/)).toHaveValue(60);
    fireEvent.click(screen.getByRole("button", { name: "Settle" }));
    await waitFor(() => expect(writes()).toEqual([
      { url: `${B}/notes-to-follow-up/${OWED}/settlements`, method: "POST", body: { debitNoteId: NOTE, amount: 60 } },
    ]));
  });
});

describe("New Debit Note", () => {
  it("names the next gap on Save, then sends the supplier's paper as typed", async () => {
    show("/finance/debit-notes/new");
    const form = await screen.findByTestId("debit-note-form");
    const save = screen.getByTestId("save-debit-note");
    expect(save).toHaveTextContent("Choose who sent this debit note");
    expect(save).toBeDisabled();

    await pick(form, /Supplier$/, "Lumen Sofa Works · Supplier");
    fireEvent.change(within(form).getByLabelText(/Supplier's debit note No/), { target: { value: " LSW-DN-9 " } });
    fireEvent.change(within(form).getByLabelText(/Line 1 · Description/), { target: { value: "Price raised" } });
    // A debit note line is a cost: only the accounts a bill line takes are offered.
    fireEvent.keyDown(within(form).getByRole("combobox", { name: /^Account/ }), { key: "Enter" });
    const offered = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(offered).toEqual(["5100 Cost of goods sold"]);
    fireEvent.click(screen.getByRole("option", { name: "5100 Cost of goods sold" }));
    fireEvent.change(within(form).getByLabelText(/Amount/), { target: { value: "75.5" } });
    await screen.findAllByRole("option", { name: "Office" });
    fireEvent.change(within(form).getByLabelText("Line 1 department"), { target: { value: "OFFICE" } });
    expect(screen.getByTestId("debit-note-form-total")).toHaveTextContent("Total RM 75.50");
    expect(within(form).getByRole("combobox", { name: /Payables account/ })).toHaveTextContent("2110 Trade payables (usual)");

    await waitFor(() => expect(save).toHaveTextContent("Save"));
    fireEvent.click(save);
    await waitFor(() => expect(writes()).toHaveLength(1));
    const sent = writes()[0]!;
    expect(sent.url).toBe(`${B}/debit-notes`);
    expect(sent.method).toBe("POST");
    expect(sent.body).toMatchObject({
      supplierId: SUP,
      supplierNoteNo: "LSW-DN-9",
      dueDate: null,
      apAccountCode: null,
      narration: null,
      lines: [{ accountCode: "5100", description: "Price raised", amount: 75.5, departmentType: "OFFICE", departmentId: null }],
    });
    expect((sent.body as { noteDate: string }).noteDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

itSaysNoBannedWord(join(dirname(fileURLToPath(import.meta.url)), "SupplierDebitNotes.tsx"), { minStrings: 40, expectString: "New Debit Note" });
