import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupplierBillDocument, SupplierNoteFollowup } from "@carres/shared/schemas/finance-ap";
import { itSaysNoBannedWord } from "@/test/banned-words";
import NotesToFollowUp, { noteFromWord, noteGroup } from "./NotesToFollowUp";
import { CreditNoteSettlesCard, LineFollowUp, NotesOwedHint } from "./NoteFollowUpParts";

/* Migration 0676 (Chew 2026-10-09): the credit and debit notes suppliers still
   owe. Every read and write goes through apiFetch; the mock answers by URL and
   records the writes. Names and amounts are invented. */
const api = vi.hoisted(() => ({
  routes: {} as Record<string, unknown>,
  calls: [] as Array<{ url: string; method: string; body: unknown }>,
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? "GET";
    api.calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined });
    if (method !== "GET") return { id: NOTE1 };
    if (!(url in api.routes)) throw new Error(`unexpected read ${url}`);
    return api.routes[url];
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: unknown) => unknown) => sel({ user: { id: "u1" }, role: "finance" }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const B = "/api/finance/payables";
const SUP = "11111111-1111-4111-8111-111111111111";
const BILL = "77777777-7777-4777-8777-777777777771";
const CN = "22222222-2222-4222-8222-222222222222";
const NOTE1 = "55555555-5555-4555-8555-555555555551";
const NOTE2 = "55555555-5555-4555-8555-555555555552";
const NOTE3 = "55555555-5555-4555-8555-555555555553";
const NOTE4 = "55555555-5555-4555-8555-555555555554";
const ST1 = "66666666-6666-4666-8666-666666666661";

const note = (over: Partial<SupplierNoteFollowup>): SupplierNoteFollowup => ({
  id: NOTE1, supplier_id: SUP, supplier_name: "Lumen Sofa Works", kind: "CREDIT", reason: "PRICE",
  amount: "150.00", settled: "0.00", left: "150.00", status: "waiting", remark: null,
  noted_on: "2026-10-09", next_follow_up_on: null, last_contact: null,
  bill_id: BILL, bill_no: "SB-20261009-1822", supplier_invoice_no: "LSW-901", bill_status: "confirmed",
  line_no: 1, line_item: "Sofa", line_qty: "2.00", line_unit_price: "100.00", po_unit_cost: "25.00",
  grn_no: "GRN-20261001-1111", po_id: "PO-2054", purchase_return_id: null, pr_no: null,
  closed_at: null, closed_by_name: null, close_reason: null, created_at: "2026-10-09T01:00:00Z",
  created_by_name: "Aina", ...over,
});

const LIST = {
  today: "2026-10-09",
  rows: [
    note({}),
    note({ id: NOTE2, reason: "RETURN", bill_id: null, bill_no: null, line_no: null, pr_no: "PR-0012", amount: "60.00", left: "60.00",
      next_follow_up_on: "2026-10-20", created_by_name: null,
      last_contact: { contacted_on: "2026-10-08", said: "Credit note next week" } }),
    note({ id: NOTE3, kind: "DEBIT", reason: "OTHER", bill_id: null, bill_no: null, line_no: null, remark: "Transport charge",
      amount: "30.00", left: "30.00", status: "closed", close_reason: "Supplier waived it" }),
    note({ id: NOTE4, amount: "80.00", settled: "80.00", left: "0.00", status: "settled", line_no: 2 }),
  ],
};

beforeEach(() => {
  api.calls = [];
  api.routes = {
    [`${B}/notes-to-follow-up`]: LIST,
    [`${B}/suppliers`]: { rows: [{ id: SUP, name: "Lumen Sofa Works", kind: "supplier", terms_days: null }] },
    [`${B}/notes-to-follow-up/${NOTE1}`]: {
      today: "2026-10-09",
      followup: note({ next_follow_up_on: "2026-10-16", remark: "Billed above the PO" }),
      contacts: [{ id: "c1", contacted_on: "2026-10-08", said: "Supplier says next week", created_at: "2026-10-08T02:00:00Z", created_by_name: "Aina" }],
      settlements: [{ id: ST1, credit_note_id: CN, note_no: "SCN-20261009-9191", supplier_note_no: "LSW-CN-7", note_date: "2026-10-09",
        note_status: "confirmed", amount: "50.00", counts: true, created_at: "2026-10-09T03:00:00Z", created_by_name: "Aina",
        taken_off_at: null, taken_off_by_name: null, take_off_reason: null }],
    },
  };
  localStorage.clear();
});

function wrap(children: ReactNode, at = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function show(at: string) {
  return wrap(
    <Routes>
      <Route path="/finance/notes-to-follow-up/*" element={<NotesToFollowUp />} />
    </Routes>,
    at,
  );
}

const writes = () => api.calls.filter((c) => c.method !== "GET");
const pick = async (scope: HTMLElement, field: RegExp, option: string) => {
  fireEvent.keyDown(within(scope).getByRole("combobox", { name: field }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: option }));
};

describe("its words", () => {
  it("groups a note: today when its next follow-up is due or not set, done once settled or closed", () => {
    expect(noteGroup({ status: "waiting", next_follow_up_on: null }, "2026-10-09")).toBe("today");
    expect(noteGroup({ status: "part", next_follow_up_on: "2026-10-09" }, "2026-10-09")).toBe("today");
    expect(noteGroup({ status: "waiting", next_follow_up_on: "2026-10-10" }, "2026-10-09")).toBe("waiting");
    expect(noteGroup({ status: "settled", next_follow_up_on: null }, "2026-10-09")).toBe("done");
    expect(noteGroup({ status: "closed", next_follow_up_on: "2026-10-01" }, "2026-10-09")).toBe("done");
  });

  it("says where a note came from", () => {
    expect(noteFromWord({ reason: "PRICE", bill_no: "SB-1", supplier_invoice_no: "INV", line_no: 2, pr_no: null })).toBe("SB-1 · line 2");
    expect(noteFromWord({ reason: "RETURN", bill_no: null, supplier_invoice_no: null, line_no: null, pr_no: "PR-0012" })).toBe("PR-0012");
    expect(noteFromWord({ reason: "OTHER", bill_no: null, supplier_invoice_no: null, line_no: null, pr_no: null })).toBe("Added by hand");
  });
});

describe("Notes to follow up", () => {
  it("lists every note in its group, in words", async () => {
    show("/finance/notes-to-follow-up");
    const first = await screen.findByTestId(`note-row-${NOTE1}`);
    expect(first).toHaveTextContent("Lumen Sofa Works");
    expect(first).toHaveTextContent("Credit note");
    expect(first).toHaveTextContent("Price differs from PO");
    expect(first).toHaveTextContent("SB-20261009-1822 · line 1");
    expect(first).toHaveTextContent("Not set");
    expect(first).toHaveTextContent("Not followed up yet");
    expect(first).toHaveTextContent("Waiting");
    const fromReturn = screen.getByTestId(`note-row-${NOTE2}`);
    expect(fromReturn).toHaveTextContent("Purchase return");
    expect(fromReturn).toHaveTextContent("PR-0012");
    expect(fromReturn).toHaveTextContent("Credit note next week");
    expect(screen.getByTestId(`note-row-${NOTE3}`)).toHaveTextContent("Added by hand");
    expect(screen.getByTestId(`note-row-${NOTE3}`)).toHaveTextContent("Closed");
    expect(screen.getByTestId("grid-group-toggle-today")).toHaveTextContent("Follow up today");
    expect(screen.getByTestId("grid-group-toggle-waiting")).toHaveTextContent("Waiting");
    expect(screen.getByTestId("grid-group-toggle-done")).toHaveTextContent("Settled or closed");
    // Credit notes still to come: RM 150.00 and RM 60.00; the debit note is not added in.
    expect(screen.getByTestId("notes-summary")).toHaveTextContent(
      "4 notes · RM 210.00 of credit notes still to come · A reminder only: nothing here posts to the ledger.",
    );
  });

  it("adds a note by hand; Save names what is missing until then", async () => {
    show("/finance/notes-to-follow-up");
    fireEvent.click(await screen.findByTestId("add-note"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Save: choose the supplier" })).toBeDisabled();
    await pick(dialog, /^Supplier/, "Lumen Sofa Works");
    expect(within(dialog).getByRole("button", { name: "Save: type the amount" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/^Amount/), { target: { value: "30" } });
    expect(within(dialog).getByRole("button", { name: "Save: say what it is for" })).toBeDisabled();
    await pick(dialog, /^Note/, "Debit note");
    fireEvent.change(within(dialog).getByLabelText(/^What it is for/), { target: { value: "Transport charge they will bill" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      url: `${B}/notes-to-follow-up`, method: "POST",
      body: { reason: "OTHER", kind: "DEBIT", supplierId: SUP, amount: 30, remark: "Transport charge they will bill", nextOn: null },
    });
  });
});

describe("A note to follow up", () => {
  it("shows what it is, its follow-ups and what settled it", async () => {
    show(`/finance/notes-to-follow-up/${NOTE1}`);
    expect(await screen.findByTestId("note-status")).toHaveTextContent("Waiting");
    expect(screen.getByText("SB-20261009-1822 · line 1").closest("a")).toHaveAttribute("href", `/finance/bills/${BILL}`);
    expect(screen.getByText(/Sofa · 2 at RM 100\.00 · RM 75\.00 above PO price/)).toBeInTheDocument();
    expect(screen.getByText("GRN-20261001-1111 · PO-2054")).toBeInTheDocument();
    expect(screen.getByTestId("note-contacts")).toHaveTextContent("Supplier says next week · Aina");
    expect(screen.getByTestId(`note-settlement-${ST1}`)).toHaveTextContent("SCN-20261009-9191 · RM 50.00");
  });

  it("records a follow-up; Save names what is missing", async () => {
    show(`/finance/notes-to-follow-up/${NOTE1}`);
    fireEvent.click(await screen.findByRole("button", { name: "Record a follow-up" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Save: say what the supplier said" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/^What the supplier said/), { target: { value: "Credit note on Friday" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]!.url).toBe(`${B}/notes-to-follow-up/${NOTE1}/contacts`);
    expect(writes()[0]!.body).toMatchObject({ said: "Credit note on Friday", nextOn: null });
  });

  it("closes with a reason, and takes a settlement off with a reason", async () => {
    show(`/finance/notes-to-follow-up/${NOTE1}`);
    fireEvent.click(await screen.findByRole("button", { name: "Close note" }));
    let dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Supplier refused" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close note" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ url: `${B}/notes-to-follow-up/${NOTE1}/close`, method: "POST", body: { reason: "Supplier refused" } });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(within(screen.getByTestId(`note-settlement-${ST1}`)).getByRole("button", { name: "Take off" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Wrong credit note" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Take off" }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toEqual({ url: `${B}/note-settlements/${ST1}/take-off`, method: "POST", body: { reason: "Wrong credit note" } });
  });

  it("a closed note offers nothing to do", async () => {
    api.routes[`${B}/notes-to-follow-up/${NOTE3}`] = { today: "2026-10-09", followup: LIST.rows[2], contacts: [], settlements: [] };
    show(`/finance/notes-to-follow-up/${NOTE3}`);
    expect(await screen.findByTestId("note-status")).toHaveTextContent("Closed");
    expect(screen.queryByRole("button", { name: "Record a follow-up" })).toBeNull();
    expect(screen.getByText(/Supplier waived it/)).toBeInTheDocument();
    // 0681: a debit note owed is settled by the supplier's debit note.
    expect(screen.getByTestId("note-settlements")).toHaveTextContent("No debit note has settled it yet. Settle it from the supplier's debit note.");
  });
});

describe("A bill's line", () => {
  const line = (over: Partial<SupplierBillDocument["lines"][number]>): SupplierBillDocument["lines"][number] => ({
    line_no: 1, account_code: "610-0000", account_name: "PURCHASES", description: "Sofa", sku: "SOFA-1", qty: "2.00",
    unit_price: "100.00", amount: "200.00", warehouse_receipt_id: "r1", grn_no: "GRN-1", grn_po_id: "PO-1",
    po_line_id: "pl1", po_unit_cost: "62.50", price_diff: "37.50", ...over,
  });

  it("a confirmed bill's line above its PO price offers Follow up: a credit note of the difference times the quantity", async () => {
    wrap(<LineFollowUp billId={BILL} billStatus="confirmed" line={line({})} notes={[]} />);
    fireEvent.click(screen.getByTestId("follow-up-line-1"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("combobox", { name: /^Note/ })).toHaveTextContent("Credit note");
    expect(within(dialog).getByLabelText(/^Amount/)).toHaveValue(75);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]!.body).toEqual({ reason: "PRICE", kind: "CREDIT", billId: BILL, lineNo: 1, amount: 75, remark: null, nextOn: null });
  });

  it("below its PO price it suggests a debit note", async () => {
    wrap(<LineFollowUp billId={BILL} billStatus="confirmed" line={line({ price_diff: "-10.00" })} notes={[]} />);
    fireEvent.click(screen.getByTestId("follow-up-line-1"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("combobox", { name: /^Note/ })).toHaveTextContent("Debit note");
    expect(within(dialog).getByLabelText(/^Amount/)).toHaveValue(20);
  });

  it("a line already marked shows its note; a draft or a line at its PO price offers nothing", () => {
    const { unmount } = wrap(<LineFollowUp billId={BILL} billStatus="confirmed" line={line({})}
      notes={[{ line_no: 1, id: NOTE1, kind: "CREDIT", status: "part", amount: "75.00", left: "25.00" }]} />);
    expect(screen.getByTestId("line-note-1")).toHaveTextContent("Credit note · Part settled");
    expect(screen.queryByTestId("follow-up-line-1")).toBeNull();
    unmount();
    const draft = wrap(<LineFollowUp billId={BILL} billStatus="draft" line={line({})} notes={[]} />);
    expect(screen.queryByTestId("follow-up-line-1")).toBeNull();
    draft.unmount();
    wrap(<LineFollowUp billId={BILL} billStatus="confirmed" line={line({ price_diff: "0.00" })} notes={[]} />);
    expect(screen.queryByTestId("follow-up-line-1")).toBeNull();
  });
});

describe("A credit note settles the notes owed", () => {
  beforeEach(() => {
    api.routes[`${B}/credit-notes/${CN}/notes-to-follow-up`] = {
      settled: "50.00", left_to_settle: "150.00",
      settlements: [{ id: ST1, followup_id: NOTE2, amount: "50.00", reason: "RETURN", remark: null, bill_no: null, pr_no: "PR-0012",
        created_at: "2026-10-09T03:00:00Z", created_by_name: "Aina", taken_off_at: null, taken_off_by_name: null, take_off_reason: null }],
      owed: [note({})],
    };
  });

  it("offers the supplier's credit notes owed, at most what both have left", async () => {
    wrap(<CreditNoteSettlesCard noteId={CN} confirmed />);
    await waitFor(() => expect(screen.getByTestId("credit-note-settles")).toHaveTextContent(
      "RM 50.00 settled · RM 150.00 left to settle notes owed",
    ));
    expect(screen.getByTestId(`credit-note-settlement-${ST1}`)).toHaveTextContent("PR-0012 · Purchase return · RM 50.00");
    fireEvent.click(screen.getByTestId(`settle-${NOTE1}`));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/^Amount/)).toHaveValue(150);
    fireEvent.change(within(dialog).getByLabelText(/^Amount/), { target: { value: "151" } });
    expect(within(dialog).getByRole("button", { name: "Settle: at most RM 150.00" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/^Amount/), { target: { value: "100" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Settle" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ url: `${B}/notes-to-follow-up/${NOTE1}/settlements`, method: "POST", body: { creditNoteId: CN, amount: 100 } });
  });

  it("a draft credit note settles nothing yet", () => {
    wrap(<CreditNoteSettlesCard noteId={CN} confirmed={false} />);
    expect(screen.getByTestId("credit-note-settles")).toHaveTextContent("once it is confirmed");
    expect(api.calls).toHaveLength(0);
  });
});

describe("The voucher's reminder", () => {
  it("says what notes the supplier still owes", async () => {
    api.routes[`${B}/notes-to-follow-up/owed?supplierId=${SUP}`] = { credit_count: 2, credit_left: "210.00", debit_count: 1, debit_left: "30.00" };
    wrap(<NotesOwedHint supplierId={SUP} />);
    expect(await screen.findByTestId("notes-owed-hint")).toHaveTextContent(
      "This supplier still owes 2 credit notes (RM 210.00) and 1 debit note (RM 30.00). See Notes to follow up",
    );
  });

  it("says nothing when the supplier owes none", async () => {
    api.routes[`${B}/notes-to-follow-up/owed?supplierId=${SUP}`] = { credit_count: 0, credit_left: 0, debit_count: 0, debit_left: 0 };
    wrap(<NotesOwedHint supplierId={SUP} />);
    await waitFor(() => expect(api.calls).toHaveLength(1));
    expect(screen.queryByTestId("notes-owed-hint")).toBeNull();
  });
});

const here = dirname(fileURLToPath(import.meta.url));
itSaysNoBannedWord(join(here, "NotesToFollowUp.tsx"), { minStrings: 30, expectString: "Record a follow-up" });
itSaysNoBannedWord(join(here, "NoteFollowUpParts.tsx"), { minStrings: 15, expectString: "Follow up a note from the supplier" });
