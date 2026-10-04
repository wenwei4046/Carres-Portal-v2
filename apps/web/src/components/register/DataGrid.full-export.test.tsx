import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DataGrid } from "./DataGrid";
const mocks = vi.hoisted(() => ({ sheet: vi.fn((_data: unknown, _options?: unknown) => ({})), write: vi.fn(), error: vi.fn(), pdf: vi.fn(async (_options: unknown) => new Blob()) }));
vi.mock("xlsx", () => ({ utils: { json_to_sheet: mocks.sheet, book_new: () => ({}), book_append_sheet: vi.fn() }, writeFile: mocks.write }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@/lib/pdf/render", () => ({ renderRegisterListPdf: mocks.pdf }));
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
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
    vi.stubGlobal("URL", { createObjectURL: () => "blob:preview", revokeObjectURL: vi.fn() });
    vi.spyOn(window, "open").mockImplementation(() => null);
    show(async () => records); await exportAs("PDF");
    await waitFor(() => expect(mocks.pdf).toHaveBeenCalledTimes(1));
    expect(mocks.pdf.mock.calls[0][0]).toMatchObject({ headers: ["GRN No"], rows: records.map(row => [row.id]) });
    vi.unstubAllGlobals();
  });
});
