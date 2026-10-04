import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoTemplateData } from "@/lib/pdf/types";
import PoSupplierBundle from "./PoSupplierBundle";
const api = vi.hoisted(() => vi.fn());
const renderPdf = vi.hoisted(() => vi.fn());
const zip = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch: api }));
vi.mock("@/lib/pdf/render", () => ({ renderPoPdf: renderPdf }));
vi.mock("@/lib/purchasing/po-bundle", async () => {
  const actual = await vi.importActual<typeof import("@/lib/purchasing/po-bundle")>("@/lib/purchasing/po-bundle");
  return { ...actual, zipPoBundle: zip };
});
const pos = [
  { id: "PO-001", supplierId: "s1", supplierName: "Hooka", destinationId: "d1", destination: "Klang", contactEmail: "supplier@example.invalid", poSendChannel: "email" },
  { id: "PO-002", supplierId: "s1", supplierName: "Hooka", destinationId: "d2", destination: "Buloh" },
  { id: "PO-003", supplierId: "s2", supplierName: "Ohana", destinationId: "d1", destination: "Klang" },
];
function data(id: string) { return { po_id: id, po_number: id, version: 1 } as PoTemplateData; }
beforeEach(() => {
  api.mockReset().mockImplementation(async (path: string) => data(path.split("/").at(-2)!));
  renderPdf.mockReset().mockResolvedValue(new Blob(["%PDF-1.4"], { type: "application/pdf" }));
  zip.mockReset().mockResolvedValue(new Blob(["zip"], { type: "application/zip" }));
  URL.createObjectURL = vi.fn(() => "blob:bundle");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
async function ready() { await waitFor(() => expect(screen.getByRole("button", { name: "Download PDFs" })).toBeEnabled()); }
describe("issued supplier bundle", () => {
  it("shows exactly one supplier's separate POs and saved preferred channel", async () => {
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await ready();
    expect(screen.getByLabelText("Message")).toHaveValue("PO-001 · V1\nPO-002 · V1");
    expect(screen.getByLabelText("To")).toHaveValue("supplier@example.invalid");
    expect(screen.getByRole("button", { name: "Send Email" })).toBeDisabled();
    expect(screen.queryByLabelText("PO-003 · V1")).not.toBeInTheDocument();
    expect(api.mock.calls.every(call => call.length === 1)).toBe(true);
  });
  it("keeps message and archive on the same individual selection", async () => {
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await ready();
    fireEvent.click(screen.getByLabelText("PO-002 · V1"));
    expect(screen.getByLabelText("Message")).toHaveValue("PO-001 · V1");
    fireEvent.click(screen.getByRole("button", { name: "Download PDFs" }));
    await waitFor(() => expect(zip).toHaveBeenCalledOnce());
    expect(zip.mock.calls[0][0].map((po: { id: string }) => po.id)).toEqual(["PO-001"]);
    expect(api.mock.calls.every(call => call.length === 1)).toBe(true);
  });
  it("opens the selected independent PO preview", async () => {
    const open = vi.fn();
    render(<PoSupplierBundle pos={pos} onPreview={open} />);
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: "Open" })[1]);
    expect(open).toHaveBeenCalledWith("PO-002");
  });
  it("does not download or mark sent if rendering fails", async () => {
    renderPdf.mockRejectedValue(new Error("cannot render"));
    render(<PoSupplierBundle pos={pos} onPreview={() => {}} />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Download PDFs" }));
    await screen.findByRole("alert");
    expect(zip).not.toHaveBeenCalled();
    expect(api.mock.calls.every(call => call.length === 1)).toBe(true);
  });
});
