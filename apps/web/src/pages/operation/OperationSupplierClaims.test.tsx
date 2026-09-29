import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { claimNextMove } from "@carres/shared";
import type { SupplierClaimListRow, SupplierClaimRecord } from "@/lib/queries";
import OperationSupplierClaims from "./OperationSupplierClaims";
import { openRailGroups } from "@/test/rail";

/**
 * Supplier Claims — Purchasing MASTER §9.5: the confirmed register
 * (2026-09-18) and the record where the supplier reply is recorded
 * (2026-09-25).
 */
const renderOpen = ((...args: Parameters<typeof render>) => {
  const result = render(...args);
  openRailGroups();
  return result;
}) as typeof render;
const claimsQuery = vi.fn();
const photosQuery = vi.fn();
const recordQuery = vi.fn();
const doorMutate = vi.fn();
const refreshPhotos = vi.fn();
const apiMock = vi.fn();
const returnsQuery = vi.fn();
const writeMutate = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiMock(...args), ApiError: class ApiError extends Error {} }));
vi.mock("@/lib/queries", () => ({
  fetchOperationSupplierClaimPhotos: (...args: unknown[]) => refreshPhotos(...args),
  useOperationSupplierClaims: (...args: unknown[]) => claimsQuery(...args),
  useOperationSupplierClaimPhotos: (...args: unknown[]) => photosQuery(...args),
  useSupplierClaimRecord: (...args: unknown[]) => recordQuery(...args),
  useSupplierClaimDoor: (_id: string, door: string) => ({ mutate: (body: unknown, opts?: { onSuccess?: () => void }) => { doorMutate(door, body); opts?.onSuccess?.(); }, isPending: false, error: null }),
  useOperationPurchaseReturns: (...args: unknown[]) => returnsQuery(...args),
  usePurchaseReturnWrite: (path: string) => ({ mutate: (body: unknown, opts?: { onSuccess?: (out: unknown) => void }) => { writeMutate(path, body); opts?.onSuccess?.({ id: "pr1" }); }, isPending: false, error: null }),
  usePurchaseReturnIssueSource: () => ({ data: undefined, isLoading: true, isError: false }),
}));
vi.mock("./PurchasingTabs", () => ({ default: () => <header>Supplier Claims</header> }));
vi.mock("./components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("./SalesOrderLedger", () => ({ RecordRanks: ({ words }: { words: { title: string; identity: string; detail: string[] } }) => <><span>{words.title}</span><span>{words.identity}</span><span>{words.detail.join(" · ")}</span></> }));

const unit = (id: string, code: string | null, scope = "unit") => ({ id, unit_code: code, identity_scope: scope, qty: 1, status: "on_hold" });
function row(over: Partial<SupplierClaimListRow> = {}): SupplierClaimListRow {
  const base: SupplierClaimListRow = {
    id: "c1", claim_no: "SC-1001", po_id: "PO-2050", po_line_id: "l1", supplier_id: "s1", supplier_name: "Ohana",
    sku: "mattress:carres-cloud:King", product_category: "mattress", claim_type: "damaged", qty: 2, status: "open",
    do_number: "DO-5231", note: null, reported_by_name: "Shasha", reported_at: "2026-07-27T02:00:00Z", photo_count: 2,
    requested_action: null, requested_at: null, supplier_response: null, supplier_response_note: null, responded_at: null,
    closed_at: null, close_note: null, customer_resolution: null, customer_resolution_note: null, customer_resolution_at: null,
    carres_execution: null, carres_execution_note: null, carres_execution_at: null, line_pending: null, held_units: 0,
    hold_reason: null, product_description: "Carres Cloud", product_variant: "King",
    units: [unit("u1", "U1-000-075")], sent: false,
    next_move: { key: "ask", owner: "carres", label: "" },
    ...over,
  };
  return { ...base, next_move: claimNextMove(base) };
}
const RECORD = (over: Partial<SupplierClaimRecord> = {}): SupplierClaimRecord => ({
  replies: [], sends: [], units: [unit("u1", "U1-000-075"), unit("u2", "U1-000-076")], requested_by_name: "Shasha",
  repair_orders: [], purchase_returns: [], authorised_outcome: null, plan_repair: { allowed: false, missing: "Authorised Outcome" },
  po_duty_name: "Shasha", approver_name: "Jess", ...over,
});

function show(at = "/operation?tab=claims") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderOpen(<MemoryRouter initialEntries={[at]}><OperationSupplierClaims /></MemoryRouter>, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Thursday 1 Oct 2026, 12:00 KL.
  vi.setSystemTime(new Date("2026-10-01T04:00:00Z"));
  apiMock.mockReset();
  refreshPhotos.mockReset();
  doorMutate.mockReset();
  localStorage.clear();
  claimsQuery.mockReturnValue({ data: { claims: [row(), row({ id: "c2", claim_no: "SC-1002", supplier_name: "Hooka", status: "closed" })] }, isLoading: false, isError: false });
  photosQuery.mockReturnValue({ data: { photos: [] }, isLoading: false, isError: false });
  recordQuery.mockReturnValue({ data: RECORD(), isLoading: false, isError: false });
  returnsQuery.mockReturnValue({ data: { returns: [] }, isLoading: false, isError: false });
  writeMutate.mockReset();
});
afterEach(() => vi.useRealTimers());

const headers = () => screen.getAllByRole("columnheader").map((th) => th.getAttribute("title")).filter(Boolean);

describe("Supplier Claims register — the confirmed twelve columns (§9.5, 2026-09-18)", () => {
  it("keeps the confirmed order after the two leading controls", () => {
    show();
    expect(headers().slice(0, 10)).toEqual(["Claim status", "Supplier Claim No", "Claim Reported", "Supplier", "PO No", "GRN No", "Items", "Qty", "Problem", "Supplier Response"]);
    expect(screen.getAllByRole("checkbox", { name: "Select row" })).toHaveLength(2);
    expect(headers()).not.toContain("Customer Resolution");
    expect(headers()).not.toContain("Carres Execution");
  });
  it("reads In progress for an open claim, and Not issued when it has no number", () => {
    claimsQuery.mockReturnValue({ data: { claims: [row({ claim_no: "" })] }, isLoading: false });
    show();
    expect(screen.getByTestId("claim-status-in-progress")).toHaveTextContent("In progress");
    expect(screen.getByRole("button", { name: "Not issued" })).toBeInTheDocument();
    expect(screen.queryByText("Open")).not.toBeInTheDocument();
  });
  it("prints the Unit identity on PO No line two, five ways, never invented", () => {
    claimsQuery.mockReturnValue({ data: { claims: [
      row(),
      row({ id: "c3", claim_no: "SC-3", units: [unit("a", "U1-000-080"), unit("b", "U1-000-081")] }),
      row({ id: "c4", claim_no: "SC-4", units: [unit("q", null, "quantity")] }),
      row({ id: "c5", claim_no: "SC-5", units: [] }),
      row({ id: "c6", claim_no: "SC-6", units: null }),
    ] }, isLoading: false });
    show();
    const po = screen.getAllByRole("link", { name: "PO-2050" }).map((link) => link.closest("td")!.textContent);
    expect(po).toEqual(["PO-2050U1-000-075", "PO-20502 Units", "PO-2050Counted stock", "PO-2050Unit not recorded", "PO-2050Units could not be loaded"]);
  });
  it("opens the row's own expansion from `{n} Units`, the same state as ▸", () => {
    claimsQuery.mockReturnValue({ data: { claims: [row({ units: [unit("a", "U1-000-080"), unit("b", "U1-000-081")] })] }, isLoading: false });
    show();
    const link = screen.getByTestId("claim-units-c1");
    expect(link).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(link);
    const inspector = screen.getByTestId("claim-inspector");
    expect(inspector).toHaveTextContent("U1-000-080");
    expect(inspector).toHaveTextContent("U1-000-081");
    expect(within(inspector).queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("claim-inspect-SC-1001"));
    expect(screen.queryByTestId("claim-inspector")).not.toBeInTheDocument();
  });
  it("keeps GRN in its own column and Items on two lines; a Catalog-silent SKU says so", () => {
    claimsQuery.mockReturnValue({ data: { claims: [row({ warehouse_receipt_id: "r1", grn_no: "GRN-20260907-1" }), row({ id: "c9", claim_no: "SC-9", product_description: null, product_variant: null, sku: "SMOKE King" })] }, isLoading: false });
    show();
    expect(screen.getAllByRole("link", { name: "PO-2050" })[0]!.closest("td")).not.toBe(screen.getByRole("link", { name: "GRN-20260907-1" }).closest("td"));
    expect(screen.getByText("Carres Cloud").closest("td")).toBe(screen.getAllByText("King")[0]!.closest("td"));
    expect(screen.getByText("Recorded SKU").closest("td")).toHaveTextContent("SMOKE King");
  });
  it("counts claims only in the footer, filtered and whole", () => {
    show();
    expect(screen.getByText("2 Supplier Claims")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hooka 1" }));
    expect(screen.getByText("1 of 2 Supplier Claims")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("2 Supplier Claims")).toBeInTheDocument();
  });
  it("draws the four factual rail groups and no Evidence group", () => {
    show();
    const rail = screen.getByTestId("supplier-claims-rail");
    expect([...rail.querySelectorAll("[data-rail-group]")].map((g) => g.getAttribute("data-rail-group"))).toEqual(["Supplier", "Problem", "Claim status", "Supplier Response"]);
    expect(within(rail).getByRole("button", { name: "In progress 1" })).toBeInTheDocument();
  });
  it("keeps a failed read distinct from an empty register, inside the grid", () => {
    claimsQuery.mockReturnValue({ isError: true, error: Object.assign(new Error("boom"), { status: 500 }), refetch: vi.fn() });
    show();
    expect(screen.getByRole("alert")).toHaveTextContent("Supplier Claims could not be loaded");
    expect(screen.queryByText("No Supplier Claims yet.")).not.toBeInTheDocument();
    claimsQuery.mockReturnValue({ data: { claims: [] }, isLoading: false });
  });
  it("uses selection for Export only", () => {
    show();
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select row" })[0]!);
    expect(screen.getByRole("button", { name: /Export Excel.*1/ })).toBeInTheDocument();
  });
});

describe("the claim record — where the supplier reply is recorded (§9.5, 2026-09-25)", () => {
  it("replaces the not-available line with the two Supplier buttons, in order", () => {
    show("/operation?tab=claims&claim=c1");
    expect(screen.queryByText(/reply recording are not available here yet/)).not.toBeInTheDocument();
    const ask = screen.getByTestId("claim-record-ask");
    const reply = screen.getByTestId("claim-record-reply");
    expect(ask).toHaveTextContent("Record what we asked");
    expect(reply).toHaveTextContent("Record supplier reply");
    expect(ask.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("leads with ONE current action: record the ask, then the send, then the reply", () => {
    show("/operation?tab=claims&claim=c1");
    expect(screen.getByTestId("claim-current-action")).toHaveTextContent("The supplier claim is not issued");
    expect(screen.getByTestId("claim-primary")).toHaveTextContent("Record what we asked");
  });
  it("walks the reply state from the ask: Reply expected → Reply overdue → Escalated to {name}", () => {
    // Asked Mon 28 Sep → Reply expected Wed 30 Sep → escalation Fri 2 Oct.
    claimsQuery.mockReturnValue({ data: { claims: [row({ requested_action: "replace", requested_at: "2026-09-28T02:00:00Z", sent: true })] }, isLoading: false });
    recordQuery.mockReturnValue({ data: RECORD({ sends: [{ id: "s1", version: 1, recipient: "Ohana Mr Lee", channel: "whatsapp", note: null, sent_at: "2026-09-28T03:00:00Z", sent_by_name: "Shasha" }] }), isLoading: false });
    const view = show("/operation?tab=claims&claim=c1");
    expect(screen.getByTestId("claim-reply-state")).toHaveTextContent("Reply overdue · Wed, 30 Sep");
    expect(screen.getByTestId("claim-send-line")).toHaveTextContent("Claim sent · WhatsApp · Ohana Mr Lee");
    expect(screen.getByTestId("claim-primary")).toHaveTextContent("Record supplier reply");
    view.unmount();
    vi.setSystemTime(new Date("2026-10-02T04:00:00Z"));
    show("/operation?tab=claims&claim=c1");
    expect(screen.getByTestId("claim-reply-state")).toHaveTextContent("Escalated to Jess");
  });
  it("dates Reply expected from the timing the ask snapshotted (0607), not a live setting", () => {
    claimsQuery.mockReturnValue({ data: { claims: [row({ requested_action: "replace", requested_at: "2026-09-28T02:00:00Z", sent: true, reply_waiting_days: 3, escalation_extra_days: 2 })] }, isLoading: false });
    show("/operation?tab=claims&claim=c1");
    expect(screen.getByTestId("claim-reply-state")).toHaveTextContent("Reply expected Thu, 1 Oct");
  });
  it("names what is missing beside the button and does not save", () => {
    claimsQuery.mockReturnValue({ data: { claims: [row({ requested_action: "replace", requested_at: "2026-09-28T02:00:00Z", sent: true })] }, isLoading: false });
    show("/operation?tab=claims&claim=c1");
    fireEvent.click(screen.getByTestId("claim-record-reply"));
    fireEvent.click(screen.getByTestId("claim-reply-save"));
    expect(screen.getByTestId("claim-reply-missing")).toHaveTextContent("Choose the supplier's answer.");
    // `Applies to` starts on `Whole claim`, so it never reads as missing.
    expect(screen.getByTestId("claim-reply-missing")).not.toHaveTextContent("Choose what the answer applies to.");
    expect(screen.getByTestId("claim-reply-missing")).toHaveTextContent("Add the evidence: a file, or who spoke and when.");
    expect(doorMutate).not.toHaveBeenCalled();
  });
  it("opens on Whole claim with no Unit ticks, and shows the phone facts only for a Phone call", () => {
    claimsQuery.mockReturnValue({ data: { claims: [row({ requested_action: "replace", requested_at: "2026-09-28T02:00:00Z", sent: true })] }, isLoading: false });
    show("/operation?tab=claims&claim=c1");
    fireEvent.click(screen.getByTestId("claim-record-reply"));
    const form = screen.getByTestId("claim-reply-form");
    expect(within(form).getByRole("combobox", { name: "Applies to" })).toHaveTextContent("Whole claim");
    expect(screen.queryByTestId("claim-reply-units")).not.toBeInTheDocument();
    expect(within(form).queryByLabelText("Who spoke")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("claim-reply-phone"));
    expect(within(form).getByLabelText("Who spoke")).toBeInTheDocument();
    expect(screen.getByTestId("claim-reply-phone-fields")).toHaveTextContent("When they spoke");
    fireEvent.click(screen.getByTestId("claim-reply-phone"));
    expect(within(form).queryByLabelText("Who spoke")).not.toBeInTheDocument();
  });
  it("shows the recorded answer as a claim-level fact, never spread across Units", () => {
    claimsQuery.mockReturnValue({ data: { claims: [row({ requested_action: "replace", requested_at: "2026-09-28T02:00:00Z", supplier_response: "repair", sent: true })] }, isLoading: false });
    recordQuery.mockReturnValue({ data: RECORD({ replies: [{ id: "r1", response: "repair", scope: "claim", unit_ids: [], supplier_date: "2026-10-05", note: null, spoke_with: "Mr Lee", spoken_at: "2026-09-29T02:00:00Z", recorded_at: "2026-09-29T03:00:00Z", recorded_by_name: "Shasha", formal_at: "2026-09-29T03:00:00Z", current: true, evidence: [] }] }), isLoading: false });
    show("/operation?tab=claims&claim=c1");
    expect(screen.getByTestId("claim-answer")).toHaveTextContent("Repair · Whole claim · by Mon, 5 Oct · recorded Tue, 29 Sep · Shasha");
    expect(screen.getByTestId("claim-answer")).not.toHaveTextContent("U1-000-075");
    expect(screen.getByTestId("claim-answer")).toHaveTextContent("Evidence 1");
    // A supplier's Repair is an offer: no Plan Repair without an Authorised Outcome.
    expect(screen.queryByTestId("claim-plan-repair")).not.toBeInTheDocument();
    expect(screen.queryByTestId("claim-current-action")).not.toBeInTheDocument();
  });
  it("keeps saved claim photos in the ONE shared viewer with the claim's own context", () => {
    photosQuery.mockReturnValue({ data: { photos: [{ path: "lost.jpg", url: null, at: "2026-09-04T02:00:00Z" }] } });
    show("/operation?tab=claims&claim=c1");
    fireEvent.click(screen.getByRole("button", { name: "Photo 1" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/SC-1001 · Evidence/)).toHaveTextContent("Fri, 4 Sep");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Photo 1 could not be loaded");
  });
  it("opens a closed Claim outside the PO filter and preserves that filter on return", async () => {
    show("/operation?tab=claims&po=PO-other&claim=c2");
    expect(screen.getByTestId("object-identity")).toHaveTextContent("SC-1002");
    expect(screen.queryByTestId("claim-record-reply")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Supplier Claims" }));
    await waitFor(() => expect(screen.queryByTestId("claim-object")).not.toBeInTheDocument());
    expect(screen.getByTestId("claims-rail-source")).toHaveTextContent("PO: PO-other");
  });
  it("keeps a missing object distinct from an empty register", () => {
    show("/operation?tab=claims&claim=missing");
    expect(screen.getByText("Claim is not available.")).toBeInTheDocument();
  });
});

describe("the claim record's Result — `Record what Carres does next` and `Issue Purchase Return` (§9.6, 2026-09-25)", () => {
  it("says what Carres does is not recorded, and offers the door only when the server confirms PO Duty", () => {
    show("/operation?tab=claims&claim=c1");
    expect(screen.getByTestId("claim-what-carres-does")).toHaveTextContent("What Carres does · Not recorded");
    expect(screen.queryByTestId("claim-record-next")).not.toBeInTheDocument();
  });
  it("records one of the three supplier-side decisions through the existing route", () => {
    recordQuery.mockReturnValue({ data: RECORD({ may_record_next: true }), isLoading: false });
    show("/operation?tab=claims&claim=c1");
    fireEvent.click(screen.getByTestId("claim-record-next"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("combobox"));
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    // OWNER RULING 2026-09-29: the three supplier-side decisions only.
    expect(options).toEqual(["Return to supplier", "Repair", "Replacement"]);
    fireEvent.click(screen.getByRole("option", { name: "Return to supplier" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Record what Carres does next" }));
    expect(writeMutate).toHaveBeenCalledWith("/api/operation/supplier-claims/c1/carres-execution", { carres_execution: "return_to_supplier" });
  });
  it("once `Return to supplier` is recorded, leads with `Issue Purchase Return` and opens the 50/50 form", () => {
    recordQuery.mockReturnValue({ data: RECORD({ decision: "return_to_supplier", decision_at: "2026-09-29T02:00:00Z", decision_by_name: "Mei", may_record_next: true }), isLoading: false });
    claimsQuery.mockReturnValue({ data: { claims: [row({ requested_action: "replace", requested_at: "2026-09-28T02:00:00Z", supplier_response: "return_and_replace", carres_execution: "return_to_supplier" })] }, isLoading: false });
    show("/operation?tab=claims&claim=c1");
    expect(screen.getByTestId("claim-what-carres-does")).toHaveTextContent("What Carres does · Return to supplier · Tue, 29 Sep · Mei");
    expect(screen.getByTestId("claim-current-action")).toHaveTextContent("Issue the purchase return to Ohana");
    expect(screen.getByTestId("claim-primary")).toHaveTextContent("Issue Purchase Return");
    // One obvious button: the Result does not repeat the door the Current action leads with.
    expect(screen.queryByTestId("claim-issue-return")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("claim-primary"));
    expect(screen.queryByTestId("claim-result")).not.toBeInTheDocument();
  });
  it("an issued return reads `Sending not confirmed` and Stock's pickup word, never `not sent`", () => {
    recordQuery.mockReturnValue({ data: RECORD({ decision: "return_to_supplier", purchase_returns: [{ id: "pr1", pr_no: "PR-20260929-1001" }] }), isLoading: false });
    returnsQuery.mockReturnValue({ data: { returns: [{ id: "pr1", pr_no: "PR-20260929-1001", pr_doc_date: "2026-09-29T02:00:00Z", supplier_id: "s1", supplier_name: "Ohana", claim_no: "SC-1001", grn_no: null, sent_at: null, confirmed_pickup_date: null, sends: [], confirmations: [],
      units: [{ unit_id: "U1-000-075", po_id: null, category: null, item: null, item_spec: null, pickup_location: null, return_to: "Lot 9", collected_by: null, actual_pickup_date: null, supplier_received_date: null, evidence: [] }] }] }, isLoading: false });
    show("/operation?tab=claims&claim=c1");
    const box = screen.getByTestId("claim-purchase-returns");
    expect(box).toHaveTextContent("PR-20260929-1001");
    expect(box).toHaveTextContent("Sending not confirmed");
    expect(box).toHaveTextContent("Pickup date not confirmed · Not picked up");
    expect(box).toHaveTextContent("Supplier Received Date Not recorded");
    expect(box).not.toHaveTextContent(/not sent/i);
    expect(screen.queryByTestId("claim-issue-return")).not.toBeInTheDocument();
  });
  it("Replacement opens only its existing owning door; a legacy customer movement stays readable", () => {
    recordQuery.mockReturnValue({ data: RECORD({ decision: "replacement", decision_at: "2026-09-29T02:00:00Z", decision_by_name: "Mei", legacy_words: ["Collect First"], plan_replacement: { allowed: true } }), isLoading: false });
    show("/operation?tab=claims&claim=c1");
    expect(screen.getByTestId("claim-what-carres-does")).toHaveTextContent("What Carres does · Replacement");
    expect(screen.getByTestId("claim-plan-replacement")).toHaveAttribute("href", "/operation?tab=arrival-source&kind=supplier-replacement&claim=c1");
    expect(screen.getByTestId("claim-legacy-decision")).toHaveTextContent("Earlier record · Collect First");
    expect(screen.queryByTestId("claim-plan-repair")).not.toBeInTheDocument();
    expect(screen.queryByTestId("claim-issue-return")).not.toBeInTheDocument();
  });
  it("`Plan Repair` appears only when the server confirms all three facts", () => {
    recordQuery.mockReturnValue({ data: RECORD({ decision: "repair", authorised_outcome: "Repair", plan_repair: { allowed: true, missing: null } }), isLoading: false });
    show("/operation?tab=claims&claim=c1");
    expect(screen.getByTestId("claim-plan-repair")).toHaveAttribute("href", "/operation?tab=repair-orders&create=1&claim=c1");
  });
});
