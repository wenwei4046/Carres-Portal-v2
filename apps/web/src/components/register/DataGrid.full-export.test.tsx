import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DataGrid } from "./DataGrid";
const mocks = vi.hoisted(() => ({ sheet: vi.fn((_data: unknown, _options?: unknown) => ({})), write: vi.fn(), error: vi.fn(), pdf: vi.fn(async (_options: unknown) => new Blob()) }));
vi.mock("@/components/kit/PdfPreview", () => ({ default: ({src}: {src: string}) => <div data-testid="pdf-preview" data-src={src}>PDF pages</div> }));
vi.mock("xlsx", () => ({ utils: { json_to_sheet: mocks.sheet, book_new: () => ({}), book_append_sheet: vi.fn() }, writeFile: mocks.write }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@/lib/pdf/render", () => ({ renderRegisterListPdf: mocks.pdf }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
const records = Array.from({ length: 61 }, (_, i) => ({ id: `GRN-${i + 1}` }));
function show(loadExportRows: () => Promise<typeof records>) {
  return render(<DataGrid rows={records.slice(0, 5)} columns={[{ key: "id", label: "GRN No", width: 140, accessor: row => row.id }]}
    storageKey="full-export-test" exportName="Receiving" rowKey={row => row.id} loadExportRows={loadExportRows} />);
}
async function exportAs(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "Export" }));
  fireEvent.click(await screen.findByRole("menuitem", { name }));
}
describe("shared full-population export", () => {
  it("exports all authorised results instead of only the five loaded rows", async () => {
    const load = vi.fn(async () => records); show(load);
    await exportAs("Excel");
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
    expect(load).toHaveBeenCalledTimes(1);
    expect(mocks.sheet.mock.calls[0][0]).toHaveLength(61);
    expect(mocks.sheet.mock.calls[0][0]).toContainEqual({ "GRN No": "GRN-61" });
    expect(screen.queryByRole("cell", { name: "GRN-61" })).not.toBeInTheDocument();
  });
  it("creates no partial file when the full read fails, then permits retry", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("read failed")).mockResolvedValueOnce(records); show(load);
    await exportAs("Excel");
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("The list could not be exported. Try again."));
    expect(mocks.write).not.toHaveBeenCalled();
    await exportAs("Excel");
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
  });
  it("uses the same complete population for PDF", async () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: () => "blob:preview", revokeObjectURL: revoke });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    show(async () => records); await exportAs("PDF");
    await waitFor(() => expect(mocks.pdf).toHaveBeenCalledTimes(1));
    expect(mocks.pdf.mock.calls[0][0]).toMatchObject({ headers: ["GRN No"], rows: records.map(row => [row.id]) });
    expect(await screen.findByRole("dialog", { name: /Receiving.*PDF/ })).toBeVisible();
    expect(await screen.findByTestId("pdf-preview")).toHaveAttribute("data-src", "blob:preview");
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
    const downloads: Array<{ href: string; name: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ href: this.href, name: this.download });
    });
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(downloads).toEqual([{ href: "blob:preview", name: "Receiving.pdf" }]);
    expect(open).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Close$/ }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:preview"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
