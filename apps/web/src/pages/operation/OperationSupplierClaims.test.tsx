import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { claimNextMove } from "@carres/shared";
import type { SupplierClaimListRow } from "@/lib/queries";
import OperationSupplierClaims from "./OperationSupplierClaims";
const claimsQuery = vi.fn();
const photosQuery = vi.fn();
const apiMock = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiMock(...args) }));
vi.mock("@/lib/queries", () => ({ useOperationSupplierClaims: (...args: unknown[]) => claimsQuery(...args), useOperationSupplierClaimPhotos: (...args: unknown[]) => photosQuery(...args) }));
vi.mock("./PurchasingTabs", () => ({ default: () => <header>Supplier Claims</header> }));
vi.mock("./components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("./SalesOrderLedger", () => ({ RecordRanks: ({ words }: { words: { title: string; identity: string; detail: string[] } }) => <><span>{words.title}</span><span>{words.identity}</span><span>{words.detail.join(" · ")}</span></> }));
function row(over: Partial<SupplierClaimListRow> = {}): SupplierClaimListRow {
  const base: SupplierClaimListRow = {
    id: "c1",
    claim_no: "SC-1001",
    po_id: "PO-2050",
    po_line_id: "l1",
    supplier_id: "s1",
    supplier_name: "Ohana",
    sku: "mattress:carres-cloud:King",
    product_category: "mattress",
    claim_type: "damaged",
    qty: 2,
    status: "open",
    do_number: "DO-5231",
    note: null,
    reported_by_name: "Shasha",
    reported_at: "2026-07-27T02:00:00Z",
    photo_count: 2,
    requested_action: null,
    requested_at: null,
    supplier_response: null,
    supplier_response_note: null,
    responded_at: null,
    closed_at: null,
    close_note: null,
    customer_resolution: null,
    customer_resolution_note: null,
    customer_resolution_at: null,
    carres_execution: null,
    carres_execution_note: null,
    carres_execution_at: null,
    line_pending: null,
    held_units: 0,
    hold_reason: null,
    next_move: { key: "ask", owner: "carres", label: "" },
    ...over,
  };
  return { ...base, next_move: claimNextMove(base) };
}

function show(at = "/operation?tab=claims") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter initialEntries={[at]}><OperationSupplierClaims /></MemoryRouter>, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}
beforeEach(() => {
  apiMock.mockReset();
  localStorage.clear();
  claimsQuery.mockReturnValue({ data: { claims: [row(), row({ id: "c2", claim_no: "SC-1002", supplier_name: "Hooka", status: "closed" })] }, isLoading: false, isError: false });
  photosQuery.mockReturnValue({ data: { photos: [] }, isLoading: false, isError: false });
});
describe("Supplier Claims factual Register and owning object", () => {
  it("offers the Case link only in the owning object without writing on open", () => {
    show("/operation?tab=claims&claim=c1");
    expect(screen.getByRole("button", { name: "Link Case" })).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });
  it("uses facts and truthful totals without a local Work queue", () => {
    show();
    expect(claimsQuery).toHaveBeenCalledWith("all");
    expect(screen.getByText("2 claims · 4 affected quantity")).toBeInTheDocument();
    expect(screen.queryByText("Next move")).not.toBeInTheDocument();
    expect(screen.queryByText("Queues")).not.toBeInTheDocument();
    expect(screen.queryByText("New Claim")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SC-1001" })).toBeInTheDocument();
  });
  it("keeps the inspector read-only and opens the full Claim", () => {
    show(); fireEvent.click(screen.getByTestId("claim-inspect-SC-1001"));
    const inspector = screen.getByTestId("claim-inspector");
    expect(within(inspector).queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(within(inspector).getByRole("button", { name: "Open Claim" }));
    expect(screen.getByTestId("claim-object")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link Case" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close claim" })).not.toBeInTheDocument();
  });
  it("opens a closed Claim outside the PO filter and preserves that filter on return", async () => {
    show("/operation?tab=claims&po=PO-other&claim=c2");
    expect(screen.getByTestId("object-identity")).toHaveTextContent("SC-1002");
    fireEvent.click(screen.getByRole("link", { name: "Supplier Claims" }));
    await waitFor(() => expect(screen.queryByTestId("claim-object")).not.toBeInTheDocument());
    expect(screen.getByText("PO: PO-other")).toBeInTheDocument();
  });
  it("does not drop a named Claim while loading", () => {
    claimsQuery.mockReturnValue({ isLoading: true });
    const view = show("/operation?tab=claims&claim=c1");
    expect(screen.getByText("Loading claim…")).toBeInTheDocument();
    claimsQuery.mockReturnValue({ data: { claims: [row()] }, isLoading: false });
    view.rerender(<MemoryRouter initialEntries={["/operation?tab=claims&claim=c1"]}><OperationSupplierClaims /></MemoryRouter>);
    expect(screen.getByTestId("object-identity")).toHaveTextContent("SC-1001");
  });
  it("preserves independent recorded resolutions without duplicate editors", () => {
    claimsQuery.mockReturnValue({ data: { claims: [row({ customer_resolution: "no_replacement_required", carres_execution: "replace_first", supplier_response: "repair" })] } });
    show("/operation?tab=claims&claim=c1");
    expect(screen.getByTestId("claim-panel-SC-1001")).toHaveTextContent("No Replacement Required");
    expect(screen.getByTestId("claim-panel-SC-1001")).toHaveTextContent("Replace First");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save|Send|Close claim/ })).not.toBeInTheDocument();
  });
  it("shows unavailable files without reporting proof", () => {
    photosQuery.mockReturnValue({ data: { photos: [{ path: "lost.jpg", url: null }] } });
    show("/operation?tab=claims&claim=c1");
    expect(screen.getByText("Photo 1: unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Photo 1" })).not.toBeInTheDocument();
  });
  it("does not turn a failed read into zero claims", () => {
    claimsQuery.mockReturnValue({ isError: true, error: Object.assign(new Error("Access denied"), { status: 403 }), refetch: vi.fn() });
    show(); expect(screen.getByRole("alert")).toHaveTextContent("You do not have access to Supplier Claims.");
    expect(screen.queryByText("No matching claims.")).not.toBeInTheDocument();
    expect(screen.queryByText("0 claims · 0 affected quantity")).not.toBeInTheDocument();
  });
  it("filters by a factual supplier and retains the result after viewing a Claim", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Hooka 1" }));
    expect(screen.getByText("1 of 2 claims · 2 affected quantity")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SC-1001" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "SC-1002" }));
    fireEvent.click(screen.getByRole("link", { name: "Supplier Claims" }));
    expect(screen.getByText("1 of 2 claims · 2 affected quantity")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("2 claims · 4 affected quantity")).toBeInTheDocument();
  });
  it("keeps a missing object distinct from an empty register", () => {
    show("/operation?tab=claims&claim=missing"); expect(screen.getByText("Claim is not available.")).toBeInTheDocument();
  });
  it("draws the governed FilterRail, not the retired SectionCard facet chrome", () => {
    show();
    expect(screen.getByTestId("supplier-claims-rail")).toBeInTheDocument();
    expect(screen.queryByTestId("listshell-facet")).not.toBeInTheDocument();
    // §9.5: rail entries are factual predicates. A linked source is not an
    // "Evidence" fact, so with every fixture row carrying a PO the group is absent.
    expect(screen.queryByText("Source not linked")).not.toBeInTheDocument();
  });
  it("hides the rail from its own control, shows it back from the toolbar, and remembers the choice", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Hide filters" }));
    expect(screen.queryByTestId("supplier-claims-rail")).not.toBeInTheDocument();
    expect(localStorage.getItem("carres.supplier-claims.rail")).toBe("0");
    fireEvent.click(screen.getByTestId("claims-show-filters"));
    expect(screen.getByTestId("supplier-claims-rail")).toBeInTheDocument();
    expect(screen.queryByTestId("claims-show-filters")).not.toBeInTheDocument();
    expect(localStorage.getItem("carres.supplier-claims.rail")).toBe("1");
  });
  it("keeps a hidden rail's filters applied and counts a source-free claim as a fact", () => {
    claimsQuery.mockReturnValue({ data: { claims: [row(), row({ id: "c3", claim_no: "", po_id: "", supplier_name: "Hooka" })] }, isLoading: false, isError: false });
    show();
    fireEvent.click(screen.getByTestId("claims-rail-evidence-Source not linked"));
    expect(screen.getByText("1 of 2 claims · 2 affected quantity")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide filters" }));
    expect(screen.getByText("1 of 2 claims · 2 affected quantity")).toBeInTheDocument();
  });
});
