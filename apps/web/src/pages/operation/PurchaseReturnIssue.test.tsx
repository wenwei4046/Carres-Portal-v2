import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PurchaseReturnDetail, PurchaseReturnIssueSource } from "@carres/shared";
import { IssueForm, purchaseReturnDraftPrint } from "./components/PurchaseReturnIssue";
import { PurchaseReturnPanel } from "./PurchaseReturnRecord";

/**
 * §9.6 creation door (owner approval 2026-09-25): the `Issue Purchase Return`
 * form beside its DRAFT paper, and the full-width PR record after it.
 */
const mutate = vi.fn();
let doorError: unknown = null;
vi.mock("@/lib/queries", () => ({
  usePurchaseReturnWrite: (path: string) => ({ mutate: (body: unknown, opts?: { onSuccess?: (o: unknown) => void }) => { mutate(path, body); opts?.onSuccess?.({ id: "pr1" }); }, isPending: false, error: doorError }),
  usePurchaseReturn: () => ({ data: undefined, isLoading: true }),
  usePurchaseReturnIssueSource: () => ({ data: undefined, isLoading: true }),
}));
vi.mock("@/lib/pdf/purchase-return-pdf", () => ({
  usePurchaseReturnPdfUrl: () => ({ url: null, failed: false }),
  purchaseReturnPrintData: vi.fn(),
}));
vi.mock("./SalesOrderLedger", () => ({ RecordRanks: ({ words }: { words: { title: string; identity: string; detail: string[] } }) => <><span>{words.title}</span><span>{words.identity}</span><span>{words.detail.join(" · ")}</span></> }));

const SOURCE = (over: Partial<PurchaseReturnIssueSource> = {}): PurchaseReturnIssueSource => ({
  claim_id: "c1", claim_no: "SC-1001", supplier_name: "Ohana", return_address: "Lot 9, Jalan Industri, Muar", grn_no: null,
  units: [
    { stock_item_id: "a", unit_code: "U1-000-075", po_no: "PO-1", category: "Mattress", item: "Carres Cloud", item_spec: "King", pickup_location: "Carres Klang", seen: "t-a", refusal: null },
    { stock_item_id: "b", unit_code: "U1-000-076", po_no: "PO-1", category: "Mattress", item: "Carres Cloud", item_spec: "King", pickup_location: "Carres Klang", seen: "t-b", refusal: "Already on RO260928-4827" },
  ],
  ...over,
});

beforeEach(() => {
  mutate.mockReset();
  doorError = null;
});

describe("Issue Purchase Return", () => {
  it("lists this claim's Units, the refused one disabled with the door's own words", () => {
    render(<MemoryRouter><IssueForm source={SOURCE()} onClose={() => undefined} onIssued={() => undefined} /></MemoryRouter>);
    const units = screen.getByTestId("purchase-return-units");
    expect(within(units).getByRole("checkbox", { name: "U1-000-075" })).toBeChecked();
    expect(within(units).getByRole("checkbox", { name: "U1-000-076" })).toBeDisabled();
    expect(units).toHaveTextContent("Already on RO260928-4827");
    expect(screen.getByText("Lot 9, Jalan Industri, Muar")).toBeInTheDocument();
    expect(screen.getByTestId("purchase-return-issue-preview")).toBeInTheDocument();
  });

  it("issues exactly the ticked Units with the seen token and the edited Pickup Location", () => {
    const issued = vi.fn();
    render(<MemoryRouter><IssueForm source={SOURCE()} onClose={() => undefined} onIssued={issued} /></MemoryRouter>);
    fireEvent.change(screen.getByRole("textbox", { name: "U1-000-075" }), { target: { value: "Bay 3" } });
    fireEvent.click(screen.getByTestId("purchase-return-issue-save"));
    expect(mutate).toHaveBeenCalledWith("/api/operation/purchase-returns", {
      claim_id: "c1", units: [{ stock_item_id: "a", seen: "t-a", pickup_location: "Bay 3" }], confirmed_pickup_date: null,
    });
    expect(issued).toHaveBeenCalledWith("pr1");
  });

  it("with no recorded return address, names it and issues nothing", () => {
    render(<MemoryRouter><IssueForm source={SOURCE({ return_address: null })} onClose={() => undefined} onIssued={() => undefined} /></MemoryRouter>);
    expect(screen.getByTestId("purchase-return-no-address")).toHaveTextContent("Add the return address of Ohana");
    fireEvent.click(screen.getByTestId("purchase-return-issue-save"));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByTestId("purchase-return-missing")).toHaveTextContent("Add the return address of Ohana");
  });

  it("the preview is the DRAFT of exactly what will be issued — money-free", () => {
    const print = purchaseReturnDraftPrint(SOURCE(), ["a"], { a: "Bay 3" }, "2026-10-01");
    expect(print.pr_no).toBeNull();
    expect(print.units).toEqual([{ unit_id: "U1-000-075", po_no: "PO-1", category: "Mattress", item: "Carres Cloud", item_spec: "King", pickup_location: "Bay 3" }]);
    expect(print.return_to).toBe("Lot 9, Jalan Industri, Muar");
    expect(JSON.stringify(print)).not.toMatch(/price|amount|RM/);
  });
});

const PR = (over: Partial<PurchaseReturnDetail> = {}): PurchaseReturnDetail => ({
  id: "pr1", pr_no: "PR-20260929-1001", pr_doc_date: "2026-09-29T02:00:00Z", supplier_id: "s1", supplier_name: "Ohana",
  supplier_claim_id: "c1", claim_no: "SC-1001", grn_no: null, sent_at: null, confirmed_pickup_date: null, sends: [], confirmations: [],
  units: [{ unit_id: "U1-000-075", po_id: "PO-1", category: "Mattress", item: "Carres Cloud", item_spec: "King", pickup_location: "Carres Klang", return_to: "Lot 9", collected_by: null, actual_pickup_date: null, supplier_received_date: null, evidence: [] }],
  ...over,
});

describe("the Purchase Return record", () => {
  it("leads with the send and reads `Sending not confirmed`", () => {
    render(<MemoryRouter><PurchaseReturnPanel pr={PR()} today="2026-09-29" /></MemoryRouter>);
    expect(screen.getByTestId("purchase-return-current-action")).toHaveTextContent("Sending not confirmed");
    expect(screen.getByTestId("purchase-return-current-action")).toHaveTextContent("Send the return document to Ohana");
    expect(screen.getByTestId("purchase-return-send-state")).toHaveTextContent("Sending not confirmed");
    expect(screen.getByTestId("purchase-return-pickup-state")).toHaveTextContent("Pickup date not confirmed");
    expect(screen.getByTestId("purchase-return-pickup-state")).toHaveTextContent("Not picked up");
    fireEvent.click(screen.getByTestId("purchase-return-primary"));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Recipient"), { target: { value: "Ah Seng" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Return document sent to supplier" }));
    expect(mutate).toHaveBeenCalledWith("/api/operation/purchase-returns/pr1/send", { channel: "whatsapp", recipient: "Ah Seng", note: null });
  });

  it("the day before the Confirmed Pickup Date asks `Confirm tomorrow's pickup · {Supplier}`", () => {
    const sent = PR({ confirmed_pickup_date: "2026-10-01", sends: [{ id: "d", channel: "whatsapp", recipient: "Ah Seng", sent_at: "2026-09-29T03:00:00Z", sent_by_name: "Mei" }] });
    render(<MemoryRouter><PurchaseReturnPanel pr={sent} today="2026-09-30" /></MemoryRouter>);
    expect(screen.getByTestId("purchase-return-current-action")).toHaveTextContent("Confirm tomorrow's pickup · Ohana");
    expect(screen.getByTestId("purchase-return-send-state")).toHaveTextContent("Return document sent · WhatsApp · Tue, 29 Sep");
    expect(screen.getByTestId("purchase-return-primary")).toHaveTextContent("Confirmed Pickup");
  });

  it("a passed date with nothing collected reads `Pickup missed · Follow up supplier`", () => {
    const passed = PR({ confirmed_pickup_date: "2026-10-01", sends: [{ id: "d", channel: "email", recipient: "x", sent_at: "2026-09-29T03:00:00Z", sent_by_name: null }] });
    render(<MemoryRouter><PurchaseReturnPanel pr={passed} today="2026-10-02" /></MemoryRouter>);
    expect(screen.getByTestId("purchase-return-current-action")).toHaveTextContent("Pickup missed");
    expect(screen.getByTestId("purchase-return-current-action")).toHaveTextContent("Follow up supplier");
  });
});
