import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DataGrid } from "./DataGrid";
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("DataGrid server column controls", () => {
  it("offers choices outside the loaded page and sends filters/clear to the server without filtering that page twice", async () => {
    const onChange = vi.fn();
    render(<DataGrid rows={[{ id: "first", supplier: "First supplier" }]} columns={[
      { key: "supplier", label: "Supplier", width: 140, accessor: row => row.supplier, sortable: true },
    ]} storageKey="server-columns" rowKey={row => row.id}
      serverColumns={{ values: { supplier: ["First supplier", "Outside page"] }, onChange }} />);
    fireEvent.click(screen.getByRole("button", { name: "Filter Supplier" }));
    fireEvent.click(screen.getByText("Outside page"));
    await waitFor(() => expect(onChange.mock.lastCall?.[0].filters).toEqual({ supplier: ["Outside page"] }));
    // The caller owns pending/result rows. The kit must not fabricate an empty result
    // by applying the new filter only to the old loaded page.
    expect(screen.getByRole("cell", { name: "First supplier" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(onChange.mock.lastCall?.[0].filters).toEqual({}));
  });
  it("keeps a right-edge filter inside a narrow viewport and restores keyboard focus", () => {
    vi.stubGlobal("innerWidth", 545); vi.stubGlobal("innerHeight", 694);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === "column-filter-menu") return new DOMRect(534, 690, 200, 320);
      if (this.getAttribute("aria-label") === "Filter Supplier") return new DOMRect(534, 670, 10, 20);
      return new DOMRect();
    });
    render(<DataGrid appearance="reference" rows={[{ id: "one", supplier: "Supplier" }]}
      columns={[{ key: "supplier", label: "Supplier", width: 140, accessor: row => row.supplier }]}
      storageKey="narrow-filter" rowKey={row => row.id} />);
    const trigger = screen.getByRole("button", { name: "Filter Supplier" });
    fireEvent.click(trigger);
    expect(screen.getByTestId("column-filter-menu")).toHaveStyle({ left: "337px", top: "366px" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("column-filter-menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it("sends sort intent while preserving the server's page order", async () => {
    const onChange = vi.fn();
    render(<DataGrid rows={[{ id: "z" }, { id: "a" }]} columns={[
      { key: "id", label: "Record", width: 140, accessor: row => row.id, sortable: true },
    ]} storageKey="server-sort" rowKey={row => row.id}
      serverColumns={{ values: { id: ["a", "z"] }, onChange }} />);
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() => expect(onChange.mock.lastCall?.[0].sort).toEqual({ key: "id", dir: "asc" }));
    expect(screen.getAllByRole("cell").map(cell => cell.textContent)).toEqual(["z", "a"]);
  });
});
