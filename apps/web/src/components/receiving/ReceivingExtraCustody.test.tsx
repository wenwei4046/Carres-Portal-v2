import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ReceivingExtraCustody from "./ReceivingExtraCustody";
import { ApiError, apiFetch } from "@/lib/api";
vi.mock("@/lib/api", async () => ({ ...(await vi.importActual("@/lib/api")), apiFetch: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function show(receiptId = "receipt-1") { return render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ReceivingExtraCustody receiptId={receiptId} /></QueryClientProvider></MemoryRouter>); }
const evidence = { custody: [{ id: "custody-1", reported_sku: "EXTRA", reported_qty: 2, reported_note: null, actual_site_id: "site", goods_received_at: "2026-10-05" }], notes: [], actorNames: {}, siteNames: { site: "Klang" } };
describe("Receiving extra-goods evidence", () => {
  it("opens the original receiving without presenting it as verified Extra provenance or a disposition", async () => {
    const receipt = "00000000-0000-4000-8000-000000000201";
    vi.mocked(apiFetch).mockResolvedValue({ ...evidence, recorded_with: { receipt_id: receipt, grn_no: "GRN-20261019-5181" } }); show(receipt);
    expect(await screen.findByRole("link", { name: "GRN-261019-5181" })).toHaveAttribute("href", `/operation?tab=receiving&session=${receipt}`);
    expect(screen.getByText("This is the original receiving report. It does not confirm the source of the extra goods.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accept|Return|Done/ })).not.toBeInTheDocument();
  });
  it("refuses an original-report link belonging to a different receipt", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...evidence, recorded_with: { receipt_id: "00000000-0000-4000-8000-000000000202", grn_no: "GRN-20261019-5181" } }); show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not be loaded");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("reads the receipt's custody observation with its actual Site and quantity", async () => {
    vi.mocked(apiFetch).mockResolvedValue(evidence); show();
    expect(await screen.findByRole("table", { name: "Extra goods" })).toBeInTheDocument();
    expect(screen.getByText("Klang")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/operation/warehouse-receipts/receipt-1/extra-custody");
  });
  it("keeps unknown Site explicit without displaying an internal id", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ...evidence, siteNames: {} }); show();
    await screen.findByRole("table");
    expect(screen.getAllByText("Not recorded")).toHaveLength(2);
    expect(screen.queryByText("site")).not.toBeInTheDocument();
  });
  it("keeps read failure visible and supports retry", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(evidence); show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });
  it("treats an incomplete response as unreadable instead of an empty observation", async () => {
    vi.mocked(apiFetch).mockResolvedValue({}); show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not be loaded");
  });
  it("does not show an empty custody table when the read proves none", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ custody: [], notes: [], actorNames: {}, siteNames: {} }); show();
    await vi.waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("retains the same evidence and key across an uncertain save and reopening", async () => {
    const writes: Array<{note:string;key:string}> = [];
    let savedNote: Record<string,string> | null = null;
    vi.mocked(apiFetch).mockImplementation(async (_path, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(init.body as string); writes.push(body);
        if (writes.length === 1) throw new Error("Connection lost after save");
        savedNote = { id: "note-1", custody_id: "custody-1", note: body.note, request_key: body.key,
          actor_id: "actor", recorded_at: "2026-10-05T01:00:00Z" };
        return savedNote;
      }
      return { ...evidence, notes: savedNote ? [savedNote] : [], actorNames: { actor: "Jess" } };
    });
    show(); fireEvent.click(await screen.findByRole("button", {name:"Open EXTRA"}));
    fireEvent.change(screen.getByLabelText("Note"), {target:{value:"Supplier checking source"}});
    fireEvent.click(screen.getByRole("button", {name:"Save"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not confirmed · Try again");
    expect(screen.getByLabelText("Note")).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), {key:"Escape",code:"Escape"});
    expect(await screen.findByRole("dialog",{name:"Leave without saving?"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Stay"}));
    expect(screen.getByLabelText("Note")).toHaveValue("Supplier checking source");
    fireEvent.click(screen.getByRole("button",{name:"Try again"}));
    expect(await screen.findByText(/Jess ·/)).toBeInTheDocument();
    expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]);
    expect(screen.getByLabelText("Note")).toHaveValue("");
  });

  it("names an unavailable custody capability without calling it empty or resolved", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(503, "Unavailable", {code:"receiving_extra_unavailable"}));
    show(); expect(await screen.findByRole("alert")).toHaveTextContent("Not available yet");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
