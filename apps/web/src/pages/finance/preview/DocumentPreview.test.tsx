/**
 * The Finance document preview (Chew 2026-10-21): the kit Modal, read only,
 * with facts, lines, ledger entries and ONE button, View. Escape closes the
 * top layer only.
 */
import { useEffect, useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import Modal from "@/components/kit/Modal";
import DocumentPreview, { type PreviewContent } from "./DocumentPreview";

const api = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    if (api.fail) throw new Error("boom");
    if (url !== "/api/finance/ledger/entries/JE-1") throw new Error(`unexpected ${url}`);
    return { entry: {}, related: [], lines: [
      { line_no: 1, account_code: "5100", account_name: null, debit: 10, credit: 0, party_type: null, party_id: null, party_name: null, memo: "Chair" },
      { line_no: 2, account_code: "2110", account_name: "Trade payables", debit: 0, credit: 10, party_type: null, party_id: null, party_name: null, memo: null },
    ] };
  }),
}));

const CONTENT: PreviewContent = {
  facts: [{ label: "Supplier", value: "Lumen Sofa Works" }],
  lines: { rows: [{ key: "1", description: "Chair", account: "5100 Cost of goods sold", amount: 10 }], empty: "No line yet." },
  entryNos: ["JE-1"],
  noEntry: "None yet.",
};

function Harness({ inner = false, onView = () => {} }: { inner?: boolean; onView?: () => void }) {
  const [open, setOpen] = useState(true);
  // The second layer opens after the preview, as one popup over another does.
  const [top, setTop] = useState(false);
  useEffect(() => { if (inner) setTop(true); }, [inner]);
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DocumentPreview open={open} onClose={() => setOpen(false)} title="BILL-1 · Lumen Sofa Works" onView={onView}
        read={{ isError: false, refetch: () => {} }} what="This bill" loadingWord="Loading bill…" content={CONTENT} />
      <Modal open={top} onOpenChange={setTop} title="On top"><p>Top layer</p></Modal>
      <p data-testid="state">{open ? "open" : "closed"}</p>
    </QueryClientProvider>
  );
}

describe("DocumentPreview", () => {
  it("is the kit's wide Modal with the facts, the lines and the ledger entry, totalled", async () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog", { name: "BILL-1 · Lumen Sofa Works" });
    expect(dialog).toHaveAttribute("data-kit", "modal");
    expect(within(dialog).getByTestId("preview-facts")).toHaveTextContent("SupplierLumen Sofa Works");
    expect(within(dialog).getByTestId("preview-lines")).toHaveTextContent("Lines");
    expect(within(dialog).getByTestId("preview-lines")).toHaveTextContent("5100 Cost of goods sold");
    const entry = within(dialog).getByTestId("preview-entry-JE-1");
    await waitFor(() => expect(entry).toHaveTextContent("5100 Account name not available"));
    expect(entry).toHaveTextContent("No memo");
    expect(entry).toHaveTextContent("Total");
    expect(within(dialog).getByTestId("preview-ledger")).toHaveTextContent("General Ledger");
    // One button besides Close: View.
    expect(within(dialog).getAllByRole("button").map((b) => b.textContent || b.getAttribute("aria-label"))).toEqual(["Close", "View"]);
  });

  it("View calls the page's full-page door", () => {
    const onView = vi.fn();
    render(<Harness onView={onView} />);
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it("Escape closes only the top layer, then the preview", async () => {
    render(<Harness inner />);
    const top = await screen.findByRole("dialog", { name: "On top" });
    fireEvent.keyDown(top, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "On top" })).not.toBeInTheDocument());
    expect(screen.getByTestId("state")).toHaveTextContent("open");
    fireEvent.keyDown(screen.getByRole("dialog", { name: "BILL-1 · Lumen Sofa Works" }), { key: "Escape" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("closed"));
  });

  it("a ledger entry that cannot be read says so and offers Try again", async () => {
    api.fail = true;
    render(<Harness />);
    expect(await screen.findByText("This entry could not be loaded. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    api.fail = false;
  });
});
