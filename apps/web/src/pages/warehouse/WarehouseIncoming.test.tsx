import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WarehouseIncoming from "./WarehouseIncoming";

/**
 * R6 (warehouse half) — what a warehouse login sees, and the gate on the count
 * it files.
 *
 * The claims under test: a PO whose count is already waiting offers no second
 * form, the count cannot be sent until it is complete, and the form says
 * plainly that saving it moves nothing.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PO = {
  po_id: "PO-2001",
  supplier_name: "Ohana",
  eta_date: "2026-07-30",
  sup_status: "in_production",
  open_receipt_id: null,
  lines: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      sku: "MS01-K",
      qty: 5,
      received_qty: 1,
      damaged_qty: 0,
      wrong_item_qty: 0,
      category: "mattress" as const,
    },
  ],
};

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

function mockIncoming(pos: unknown[]) {
  apiFetchMock.mockImplementation((path: string) => {
    if (typeof path === "string" && path.includes("/api/warehouse/incoming"))
      return Promise.resolve({
        warehouse: { id: "wh-klang", name: "Carres Klang" },
        pos,
      });
    return Promise.resolve({});
  });
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("WarehouseIncoming", () => {
  it("names the warehouse and what is on its way", async () => {
    mockIncoming([PO]);
    wrap(<WarehouseIncoming />);
    await screen.findByTestId("warehouse-incoming");
    expect(screen.getByText("Carres Klang")).toBeInTheDocument();
    expect(screen.getByText("PO-2001")).toBeInTheDocument();
    expect(screen.getByText("Ohana")).toBeInTheDocument();
    // R1's own words, from R1's own module.
    expect(screen.getByText("4 units pending delivery")).toBeInTheDocument();
  });

  it("says so and offers no second form when a count is already waiting", async () => {
    mockIncoming([{ ...PO, open_receipt_id: "r1" }]);
    wrap(<WarehouseIncoming />);
    await screen.findByTestId("warehouse-waiting-PO-2001");
    expect(screen.getByTestId("warehouse-waiting-PO-2001")).toHaveTextContent(
      "Waiting Carres check",
    );
    expect(screen.queryByTestId("warehouse-count-PO-2001")).not.toBeInTheDocument();
  });

  it("says nothing is on the way rather than showing an empty grid", async () => {
    mockIncoming([]);
    wrap(<WarehouseIncoming />);
    expect(
      await screen.findByText("Nothing is on its way here right now."),
    ).toBeInTheDocument();
  });
});

describe("the count form", () => {
  async function openForm() {
    mockIncoming([PO]);
    wrap(<WarehouseIncoming />);
    fireEvent.click(await screen.findByTestId("warehouse-count-PO-2001"));
    return screen.findByTestId("warehouse-count-lines");
  }

  it("states that saving moves nothing — Carres checks it in", async () => {
    await openForm();
    expect(screen.getByTestId("warehouse-count-note")).toHaveTextContent(
      "Nothing moves yet",
    );
  });

  it("never offers 'Receive' as a verb — the portal's word is Check in", async () => {
    await openForm();
    // The DO number field is the only place a stray verb could hide.
    expect(screen.queryByText(/^Receive/)).not.toBeInTheDocument();
  });

  it("refuses to save until the count is complete, and says what is missing", async () => {
    await openForm();
    // R8 — `Save count` is retired: this button hands the count to Carres and
    // the state becomes `Waiting Carres check`, so it is the `Return` verb.
    const save = screen.getByRole("button", { name: "Return count to Carres" });
    expect(save).toBeDisabled();
    expect(screen.getByTestId("warehouse-count-problems")).toHaveTextContent(
      "Type the DO number",
    );
    expect(screen.getByTestId("warehouse-count-problems")).toHaveTextContent(
      "Take a photo of the signed DO",
    );
    expect(screen.getByTestId("warehouse-count-problems")).toHaveTextContent(
      "Count at least one unit",
    );
  });

  it("asks for a photo the moment damage is reported (R2's evidence law)", async () => {
    await openForm();
    fireEvent.change(screen.getByTestId("warehouse-damaged-MS01-K"), {
      target: { value: "2" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("warehouse-claim-panel-MS01-K")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("warehouse-count-problems")).toHaveTextContent(
      "Add a photo of the damage",
    );
  });

  it("keeps the three numbers inside one budget — the line owes 4", async () => {
    await openForm();
    const good = screen.getByTestId("warehouse-good-MS01-K") as HTMLInputElement;
    fireEvent.change(good, { target: { value: "99" } });
    await waitFor(() => expect(good.value).toBe("4"));

    // With 4 good already counted, the damaged box has no room left.
    fireEvent.change(screen.getByTestId("warehouse-damaged-MS01-K"), {
      target: { value: "3" },
    });
    await waitFor(() =>
      expect(
        (screen.getByTestId("warehouse-damaged-MS01-K") as HTMLInputElement).value,
      ).toBe("0"),
    );
  });

  it("shows the wrong-item kinds this product family can have", async () => {
    await openForm();
    fireEvent.change(screen.getByTestId("warehouse-wrong-MS01-K"), {
      target: { value: "1" },
    });
    const picker = (await screen.findByTestId(
      "warehouse-wrong-kind-MS01-K",
    )) as HTMLSelectElement;
    const options = Array.from(picker.options).map((o) => o.value);
    // A mattress has no parts to be missing, and `damaged` has its own box.
    expect(options).toContain("wrong_sku");
    expect(options).not.toContain("missing_parts");
    expect(options).not.toContain("damaged");
  });
});
