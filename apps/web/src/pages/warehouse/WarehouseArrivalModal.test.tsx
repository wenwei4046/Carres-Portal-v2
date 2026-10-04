import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WarehouseIncomingArrival, WarehouseConfirmationReportInput } from "@carres/shared";
import WarehouseArrivalModal from "./WarehouseArrivalModal";
import WarehouseIncoming from "./WarehouseIncoming";
import WarehouseMyReceipts from "./WarehouseMyReceipts";
const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async () => ({ ...await vi.importActual("@/lib/api"), apiFetch: api }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/DOFileUploadField", () => ({ default: () => <span>Handover proof</span> }));
const source: WarehouseIncomingArrival = { id: "11111111-1111-4111-8111-111111111111", source_no: "TR-20261005-1234",
  kind: "transfer", expected_date: "2026-10-05", to_site_id: "11111111-1111-4111-8111-111111111112",
  from_site_name: "Origin", party_name: "Warehouse company", units: [{ id: "11111111-1111-4111-8111-111111111113", unit_code: "U1-000-001", sku: "B1201-K" }] };
const blocked = { id: "11111111-1111-4111-8111-111111111114", receipt_id: "11111111-1111-4111-8111-111111111114",
  status: "draft" as const, revision: 1, grn_no: null, already_saved: false, blockers: [{ code: "received_date_required", message: "Goods Received Date is not recorded" }] };
const confirmLabel = "I checked the goods and confirm these receiving results.";
const savedReport: WarehouseConfirmationReportInput = { arrivalSourceId: source.id, actualSiteId: source.to_site_id,
  goodsReceivedAt: "2026-10-04", goodsReceivedTime: null, doNumber: "HANDOVER-1", doFilePath: `${source.id}/person/proof.pdf`,
  handoverPerson: "Driver", arrivalUnits: [{ stockItemId: source.units[0]!.id, outcome: "received", note: "Original observation" }] };
function wrap(node: React.ReactNode) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>); }
function saved(report = savedReport) { return { saveKey: "11111111-1111-4111-8111-111111111115", result: blocked, report }; }
const calls = () => api.mock.calls.filter(([path]) => path === "/api/warehouse/receipts/confirm").map(([, opts]) => JSON.parse(opts.body));
async function choose(label: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: "U1-000-001 · B1201-K" }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: label }));
}
beforeEach(() => { api.mockReset(); api.mockImplementation((path: string) => {
  if (path === "/api/warehouse/incoming") return Promise.resolve({ warehouse: { id: source.to_site_id, name: "Destination" }, pos: [] });
  if (path === "/api/warehouse/arrivals") return Promise.resolve({ arrivals: [source] });
  if (path.includes("/proof?")) return Promise.resolve({ url: "https://example.test/proof.pdf" });
  if (path === "/api/warehouse/receipts/confirm") return Promise.resolve(blocked);
  return Promise.resolve({ receipts: [] });
}); });
describe("Warehouse non-PO physical confirmation", () => {
  it("starts unknown, then preserves a blocked source report without manufacturing a PO or date", async () => {
    const close = vi.fn(); wrap(<WarehouseArrivalModal source={source} onClose={close} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Not recorded");
    expect(screen.getByRole("checkbox", { name: confirmLabel })).toBeDisabled();
    await choose("Received");
    fireEvent.click(screen.getByRole("checkbox", { name: confirmLabel }));
    fireEvent.click(screen.getByRole("button", { name: "Save Receiving" }));
    await screen.findByText("Receiving report saved. No GRN created.");
    expect(screen.queryByText("Receiving results confirmed. Not saved yet.")).not.toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    expect(calls()[0].report).toMatchObject({ arrivalSourceId: source.id, actualSiteId: source.to_site_id, goodsReceivedAt: null, goodsReceivedTime: null });
    expect(calls()[0].report).not.toHaveProperty("poId");
    fireEvent.change(screen.getByLabelText("Handover person"), { target: { value: "Correct driver" } });
    expect(screen.getByRole("checkbox", { name: confirmLabel })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: confirmLabel }));
    fireEvent.click(screen.getByRole("button", { name: "Save Receiving" }));
    await waitFor(() => expect(calls()).toHaveLength(2));
    expect(calls()[1]).toMatchObject({ saveKey: calls()[0].saveKey, receiptId: blocked.id, revision: 1 });
  });
  it("restores date-only evidence with unknown time and requires a fresh confirmation", async () => {
    wrap(<WarehouseArrivalModal source={source} saved={saved()} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Time")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: confirmLabel })).not.toBeChecked();
    expect(await screen.findByRole("link", { name: "View handover proof" })).toHaveAttribute("href", "https://example.test/proof.pdf");
    fireEvent.click(screen.getByRole("checkbox", { name: confirmLabel }));
    fireEvent.click(screen.getByRole("button", { name: "Save Receiving" }));
    await waitFor(() => expect(calls()).toHaveLength(1));
    expect(calls()[0]).toMatchObject({ saveKey: saved().saveKey, receiptId: blocked.id, revision: 1,
      report: { goodsReceivedAt: "2026-10-04", goodsReceivedTime: null, doFilePath: savedReport.doFilePath, arrivalUnits: savedReport.arrivalUnits } });
  });
  it("retains the retry identity after an uncertain response and closes only for a returned GRN", async () => {
    let attempt = 0; const close = vi.fn();
    api.mockImplementation((path: string) => {
      if (path === "/api/warehouse/receipts/confirm") return ++attempt === 1 ? Promise.reject(new Error("Connection lost")) : Promise.resolve({ ...blocked, status: "posted", grn_no: "GRN-20261005-1234" });
      return Promise.resolve({ url: "https://example.test/proof.pdf" });
    });
    wrap(<WarehouseArrivalModal source={source} saved={saved()} onClose={close} />);
    fireEvent.click(screen.getByRole("checkbox", { name: confirmLabel }));
    fireEvent.click(screen.getByRole("button", { name: "Save Receiving" }));
    await waitFor(() => expect(calls()).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Receiving" })).toBeEnabled());
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save Receiving" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(calls()[1]).toEqual(calls()[0]);
  });
  it("does not silently discard saved Units missing from the current source", () => {
    wrap(<WarehouseArrivalModal source={{ ...source, units: [] }} saved={saved()} onClose={vi.fn()} />);
    expect(screen.getByText("Not available. Go back and reload.")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: confirmLabel })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Save/ })).toBeDisabled();
  });
  it("opens a non-PO arrival from Incoming under its own document number", async () => {
    wrap(<WarehouseIncoming />);
    expect(await screen.findByText("TR-261005-1234")).toBeVisible();
    expect(screen.queryByText("Nothing is on its way here right now.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Receiving" }));
    expect(screen.getByRole("dialog", { name: "Receiving · TR-261005-1234" })).toBeVisible();
  });
  it("reopens the saved non-PO report from My receiving with its original evidence", async () => {
    const previous = api.getMockImplementation()!;
    api.mockImplementation((path: string, ...args: unknown[]) => path === "/api/warehouse/receipts" ? Promise.resolve({ receipts: [{
      ...blocked, raw_report: { arrival_source_id: source.id, goods_received_at: "2026-10-04", do_number: "HANDOVER-1", do_file_path: savedReport.doFilePath,
        arrival_units: [{ stock_item_id: source.units[0]!.id, outcome: "received" }] }, save_key: saved().saveKey, po_id: null, source_no: source.source_no,
      lines: [], submitted_at: "2026-10-05T01:00:00Z" }] }) : previous(path, ...args));
    wrap(<WarehouseMyReceipts />);
    const door = await screen.findByRole("button", { name: "Open Receiving" });
    await waitFor(() => expect(door).toBeEnabled()); fireEvent.click(door);
    expect(screen.getByLabelText("Document No")).toHaveValue("HANDOVER-1");
    expect(screen.getByRole("combobox")).toHaveTextContent("Received");
    expect(screen.getByRole("checkbox", { name: confirmLabel })).not.toBeChecked();
  });
});
