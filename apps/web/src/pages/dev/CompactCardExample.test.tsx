/**
 * The Delivery Customer cell on /ui (Delivery MASTER "Customer summary cell",
 * owner 2026-10-04), exercised through the real example. UI example only:
 * nothing here writes to the ERP.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CompactCardExample, { SAMPLE_ORDER_PATH } from "./CompactCardExample";

vi.mock("@/pages/operation/components/SalesOrderCardDocument", () => ({
  default: ({ reference, onClose }: { reference: string; onClose: () => void }) => <div>Saved document {reference}<button onClick={onClose}>Close PDF</button></div>,
}));

function delivery() {
  render(<CompactCardExample />);
  fireEvent.click(screen.getByTestId("card-state-delivery"));
  return within(screen.getByTestId("compact-card-frame"));
}
const cell = (c: ReturnType<typeof delivery>, title: RegExp) => c.getByRole("button", { name: title });
function confirm(c: ReturnType<typeof delivery>, { date = "2026-10-31", slot = "", time = "" } = {}) {
  fireEvent.click(cell(c, /^Customer/));
  fireEvent.change(c.getByLabelText("Contact result"), { target: { value: "Confirmed" } });
  fireEvent.change(c.getByLabelText("Confirmed Delivery"), { target: { value: date } });
  if (slot) fireEvent.change(c.getByLabelText("Confirmed Time · optional"), { target: { value: slot } });
  if (time) fireEvent.change(c.getByLabelText("Confirmed delivery time"), { target: { value: time } });
  fireEvent.click(c.getByRole("button", { name: "Save" }));
}

describe("Header actions", () => {
  it("Open order opens the existing Sales Order page in a new tab", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const c = delivery();
    fireEvent.click(c.getByRole("button", { name: "Open order" }));
    expect(open).toHaveBeenCalledWith(SAMPLE_ORDER_PATH, "_blank", "noopener");
    open.mockRestore();
  });

  it("Close panel hides the card; choosing a state brings it back", () => {
    const c = delivery();
    fireEvent.click(c.getByRole("button", { name: "Close panel" }));
    expect(screen.queryByRole("button", { name: "Open order" })).toBeNull();
    fireEvent.click(screen.getByTestId("card-state-info"));
    expect(screen.getByRole("button", { name: "Open order" })).toBeTruthy();
  });
});

describe("Delivery summary cells", () => {
  it("shows Stock / Logistics / Customer / DO with Stock quantity and Ready on separate lines", () => {
    const c = delivery();
    expect(cell(c, /^Stock/).textContent).toBe("Stock1/1Ready");
    expect(cell(c, /^Logistics/).textContent).toBe("Logistics▾Not assigned");
    expect(cell(c, /^Customer/).textContent).toBe("Customer▾Date not confirmed");
    expect(cell(c, /^DO/).textContent).toBe("DOData not loaded");
  });

  it("service lines read Service, never a dash, and are not counted as goods", () => {
    const c = delivery();
    fireEvent.click(cell(c, /^Stock/));
    const table = c.getByRole("table");
    expect(within(table).getAllByText("Service")).toHaveLength(2);
    expect(table.textContent).not.toMatch(/—/);
    expect(cell(c, /^Stock/).textContent).toContain("1/1");
  });
});

describe("Delivery Customer cell", () => {
  it("date only: shows the date with no placeholder time", () => {
    const c = delivery();
    confirm(c);
    expect(cell(c, /^Customer/).textContent).toBe("Customer▾31 OctDate confirmed");
    expect(c.queryByLabelText("Contact result")).toBeNull();
  });

  it("a period: 31 Oct · Afternoon", () => {
    const c = delivery();
    confirm(c, { slot: "Afternoon" });
    expect(cell(c, /^Customer/).textContent).toBe("Customer▾31 Oct · AfternoonDate confirmed");
  });

  it("a specific time: 31 Oct · 3:00 PM", () => {
    const c = delivery();
    confirm(c, { slot: "Specific time", time: "15:00" });
    expect(cell(c, /^Customer/).textContent).toBe("Customer▾31 Oct · 3:00 PMDate confirmed");
  });

  it("reopening shows what was saved", () => {
    const c = delivery();
    confirm(c, { slot: "Specific time", time: "15:00" });
    fireEvent.click(cell(c, /^Customer/));
    expect((c.getByLabelText("Contact result") as HTMLSelectElement).value).toBe("Confirmed");
    expect((c.getByLabelText("Confirmed Delivery") as HTMLInputElement).value).toBe("2026-10-31");
    expect((c.getByLabelText("Confirmed delivery time") as HTMLSelectElement).value).toBe("15:00");
  });

  it("Cancel leaves the summary unchanged", () => {
    const c = delivery();
    confirm(c, { slot: "Afternoon" });
    fireEvent.click(cell(c, /^Customer/));
    fireEvent.change(c.getByLabelText("Confirmed Time · optional"), { target: { value: "Morning" } });
    fireEvent.click(c.getByRole("button", { name: "Cancel" }));
    expect(cell(c, /^Customer/).textContent).toBe("Customer▾31 Oct · AfternoonDate confirmed");
  });

  it("a refused save names what is missing and keeps the form", () => {
    const c = delivery();
    fireEvent.click(cell(c, /^Customer/));
    fireEvent.click(c.getByRole("button", { name: "Save" }));
    expect(c.getByRole("alert").textContent).toBe("Choose the contact result.");
    fireEvent.change(c.getByLabelText("Contact result"), { target: { value: "Confirmed" } });
    fireEvent.click(c.getByRole("button", { name: "Save" }));
    expect(c.getByRole("alert").textContent).toBe("Choose the confirmed date.");
    fireEvent.change(c.getByLabelText("Confirmed Delivery"), { target: { value: "2026-10-31" } });
    fireEvent.change(c.getByLabelText("Confirmed Time · optional"), { target: { value: "Specific time" } });
    fireEvent.click(c.getByRole("button", { name: "Save" }));
    expect(c.getByRole("alert").textContent).toBe("Choose the time.");
    expect(cell(c, /^Customer/).textContent).toBe("Customer▾Date not confirmed");
  });

  it("a failed save keeps the input, says so, and leaves the summary unchanged", () => {
    const c = delivery();
    fireEvent.click(screen.getByTestId("card-fail-next"));
    confirm(c, { slot: "Afternoon" });
    expect(c.getByRole("alert").textContent).toBe("Customer date not recorded · Try again");
    expect((c.getByLabelText("Confirmed Time · optional") as HTMLSelectElement).value).toBe("Afternoon");
    expect(cell(c, /^Customer/).textContent).toBe("Customer▾Date not confirmed");
    fireEvent.click(c.getByRole("button", { name: "Save" }));
    expect(cell(c, /^Customer/).textContent).toBe("Customer▾31 Oct · AfternoonDate confirmed");
  });

  it("a not-agreed result keeps Date not confirmed", () => {
    const c = delivery();
    confirm(c, { slot: "Afternoon" });
    fireEvent.click(cell(c, /^Customer/));
    fireEvent.change(c.getByLabelText("Contact result"), { target: { value: "Requested Another Date" } });
    fireEvent.click(c.getByRole("button", { name: "Save" }));
    expect(cell(c, /^Customer/).textContent).toBe("Customer▾Date not confirmed");
  });

  it("a warehouse leg names its receiver and never says Customer", () => {
    render(<CompactCardExample />);
    fireEvent.click(screen.getByTestId("card-state-warehouseLeg"));
    const c = within(screen.getByTestId("compact-card-frame"));
    expect(c.queryByRole("button", { name: /^Customer/ })).toBeNull();
    expect(c.getByText("{Receiving warehouse}")).toBeTruthy();
  });
});

describe("Purchase Order · Sales Order tab (embedded presentation)", () => {
  function host() {
    render(<CompactCardExample />);
    fireEvent.click(screen.getByTestId("card-state-poSalesOrder"));
    return within(screen.getByTestId("compact-card-frame"));
  }

  it("the host keeps its own header and tabs; the Sales Order tab holds two embedded SOs", () => {
    const c = host();
    expect(c.getByText("{Supplier}")).toBeTruthy();
    expect(c.getByText("{PO No}")).toBeTruthy();
    expect(c.getByRole("button", { name: "Sales Order" })).toHaveAttribute("aria-current", "page");
    /* One Close: the host's. The embedded SOs draw none, and no module tabs. */
    expect(c.getAllByRole("button", { name: "Close panel" })).toHaveLength(1);
    expect(c.getAllByRole("navigation")).toHaveLength(1);
    const embedded = within(c.getByTestId("embedded-sample"));
    expect(embedded.getByRole("button", { name: "Sales Order SO-1368" })).toBeTruthy();
    expect(embedded.getByRole("button", { name: "Sales Order SO2609-4827(1)" })).toBeTruthy();
    expect(embedded.getAllByRole("table")).toHaveLength(2);
    expect(embedded.getAllByText("Customer’s original")).toHaveLength(2);
  });

  it("↗ only where a full page exists; the PDF opens and closes without folding the facts", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const c = host();
    const embedded = within(c.getByTestId("embedded-sample"));
    expect(embedded.getAllByRole("button", { name: "Open full page" })).toHaveLength(1);
    fireEvent.click(embedded.getByRole("button", { name: "Open full page" }));
    expect(open).toHaveBeenCalledWith(SAMPLE_ORDER_PATH, "_blank", "noopener");
    open.mockRestore();
    const number = embedded.getByRole("button", { name: "Sales Order SO2609-4827(1)" });
    fireEvent.click(number);
    expect(embedded.getByText("Saved document SO2609-4827(1)")).toBeTruthy();
    fireEvent.click(embedded.getByRole("button", { name: "Close PDF" }));
    expect(number).toHaveFocus();
    expect(embedded.getAllByText("SO Doc Date")).toHaveLength(2);
    expect(embedded.getByText(/Residensi Example Heights/)).toBeTruthy();
  });
});
