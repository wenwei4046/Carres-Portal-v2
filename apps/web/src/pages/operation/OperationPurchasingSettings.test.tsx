import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PurchasingSettingsResponse } from "@carres/shared";
import OperationPurchasingSettings from "./OperationPurchasingSettings";

/**
 * P1 — Purchasing → Settings.
 *
 * What these tests pin is the card's own two rules: a number a human has not
 * set says `Set a number` rather than showing a silent default, and every row
 * states who changed it, when, and what it was before. Plus the one behaviour
 * change of the ship: sofa reads 14 working days.
 */
const settingsQuery = vi.fn();
const setNumber = vi.fn();
const setPoDays = vi.fn();
const setProduction = vi.fn();
const setWorkWeek = vi.fn();
const setAddress = vi.fn();

function mutation(mutateAsync: ReturnType<typeof vi.fn>) {
  return { mutateAsync, isPending: false, isError: false, error: null };
}

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    usePurchasingSettings: () => settingsQuery(),
    useSetPurchasingNumber: () => mutation(setNumber),
    useSetPurchasingPoDays: () => mutation(setPoDays),
    useSetProductionDays: () => mutation(setProduction),
    useSetSupplierWorkWeek: () => mutation(setWorkWeek),
    useSetDestinationAddress: () => mutation(setAddress),
    // P4 — the partner NAME for the collection sentence. The rule stores an
    // id (facts, not the sentence), so the name has to come from somewhere.
    useDeliveryPartners: () => ({ data: { partners: [{ id: NETS, name: "NETS" }] } }),
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}

const NICE = "11111111-0000-0000-0000-000000000001";
const OHANA = "22222222-0000-0000-0000-000000000002";
// P4 (0307) — the three destinations, exactly the three locked names.
const KLANG = "33333333-0000-0000-0000-000000000003";
const AL = "44444444-0000-0000-0000-000000000004";
const HOUZS = "55555555-0000-0000-0000-000000000005";
const NETS = "66666666-0000-0000-0000-000000000006";

function settings(over: Partial<PurchasingSettingsResponse> = {}): PurchasingSettingsResponse {
  return {
    orderByBufferDays: 7,
    earliestSellDays: 21,
    logisticsCallWorkingDays: 1,
    poDays: [1, 3, 5],
    suppliers: [
      { id: NICE, name: "Nice Future", categories: ["mattress"], offDays: [0, 6] },
      { id: OHANA, name: "Ohana", categories: ["bedframe", "sofa"], offDays: [0] },
    ],
    productionDays: [
      { supplierId: NICE, category: "mattress", workingDays: 7 },
      { supplierId: OHANA, category: "bedframe", workingDays: 7 },
      { supplierId: OHANA, category: "sofa", workingDays: 14 },
    ],
    destinations: [
      {
        id: KLANG,
        name: "Carres Klang",
        // Linked to the own warehouse, so its address comes from that record
        // and is never blank — `Address not set` must never show against it.
        address: "NETS-managed facility (Klang)",
        linkedToWarehouse: true,
        isDefault: true,
      },
      { id: AL, name: "AL Sungai Buloh", address: null, linkedToWarehouse: false, isDefault: false },
      { id: HOUZS, name: "HOUZS", address: null, linkedToWarehouse: false, isDefault: false },
    ],
    supplierCollection: [],
    lastChanges: [
      {
        settingKey: "production_days",
        supplierId: OHANA,
        category: "sofa",
        oldValue: "10",
        newValue: "14",
        changedBy: "Jess",
        changedAt: "2026-07-28T02:00:00.000Z",
      },
    ],
    canEdit: true,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  settingsQuery.mockReturnValue({ data: settings(), isLoading: false, error: null });
  setProduction.mockResolvedValue(settings());
  setNumber.mockResolvedValue(settings());
  setPoDays.mockResolvedValue(settings());
});

describe("Purchasing → Settings", () => {
  it("shows the sofa at 14 working days — the one number this card changes", () => {
    render(wrap(<OperationPurchasingSettings />));
    expect(screen.getByTestId("production-days-sofa")).toHaveValue(14);
    expect(screen.getByTestId("production-days-bedframe")).toHaveValue(7);
    expect(screen.getByTestId("production-days-mattress")).toHaveValue(7);
  });

  it("states who changed a number, when, and what it was before", () => {
    render(wrap(<OperationPurchasingSettings />));
    const row = screen.getByTestId("production-row-sofa");
    expect(within(row).getByTestId("setting-change-line").textContent).toContain("Jess");
    expect(within(row).getByTestId("setting-change-line").textContent).toContain("was 10");
  });

  it("a pair with no number says `Set a number` — never a silent default", () => {
    settingsQuery.mockReturnValue({
      data: settings({
        productionDays: [{ supplierId: NICE, category: "mattress", workingDays: 7 }],
      }),
      isLoading: false,
      error: null,
    });
    render(wrap(<OperationPurchasingSettings />));
    // Ohana's two categories are unset; the mattress one is not.
    expect(screen.getAllByTestId("set-a-number")).toHaveLength(2);
    expect(screen.getByTestId("production-days-mattress")).toHaveValue(7);
    expect(screen.getByTestId("production-days-sofa")).toHaveValue(null);
  });

  it("only draws the supplier × category pairs that own SKUs", () => {
    render(wrap(<OperationPurchasingSettings />));
    // 2 suppliers × 3 categories would be 6 rows; the catalog says 3.
    expect(screen.getAllByTestId(/^production-row-/)).toHaveLength(3);
  });

  it("saves a changed production time, and only when it really changed", async () => {
    render(wrap(<OperationPurchasingSettings />));
    const save = screen.getByTestId("production-save-sofa");
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByTestId("production-days-sofa"), { target: { value: "18" } });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(setProduction).toHaveBeenCalledWith({
        supplierId: OHANA,
        category: "sofa",
        days: 18,
      }),
    );
  });

  it("saves the PO days as a weekday list", async () => {
    render(wrap(<OperationPurchasingSettings />));
    // Mon/Wed/Fri are on; turning Thursday on makes four.
    fireEvent.click(screen.getByTestId("po-days-4"));
    fireEvent.click(screen.getByTestId("po-days-save"));
    await waitFor(() =>
      expect(setPoDays).toHaveBeenCalledWith({ days: [1, 3, 5, 4] }),
    );
  });

  it("saves one of the single numbers by key", async () => {
    render(wrap(<OperationPurchasingSettings />));
    fireEvent.change(screen.getByTestId("order-by-buffer"), { target: { value: "10" } });
    fireEvent.click(screen.getByTestId("order-by-buffer-save"));
    await waitFor(() =>
      expect(setNumber).toHaveBeenCalledWith({ key: "order_by_buffer_days", value: 10 }),
    );
  });

  it("a reader who may not edit sees the numbers and no Save", () => {
    settingsQuery.mockReturnValue({
      data: settings({ canEdit: false }),
      isLoading: false,
      error: null,
    });
    render(wrap(<OperationPurchasingSettings />));
    expect(screen.getByTestId("production-days-sofa")).toBeDisabled();
    expect(screen.queryByTestId("production-save-sofa")).toBeNull();
    expect(screen.queryByTestId("po-days-save")).toBeNull();
  });

  it("every visible label comes from the standards — no banned word appears", () => {
    render(wrap(<OperationPurchasingSettings />));
    const text = document.body.textContent ?? "";
    for (const banned of [
      "Lead time",
      "lead time",
      "Arrival buffer",
      "Pending",
      "At Risk",
      "Chase",
    ]) {
      expect(text).not.toContain(banned);
    }
    // And the words that MUST be there, spelt as the standards spell them.
    expect(text).toContain("Production working days");
    expect(text).toContain("Order-by buffer");
    expect(text).toContain("PO days");
    expect(text).toContain("Supplier work week");
    expect(text).toContain("Earliest date a store may sell");
  });

  // ── P4 · Where the goods go (migration 0307) ──────────────────────────────

  it("lists the three destinations under the locked heading, spelt exactly", () => {
    render(wrap(<OperationPurchasingSettings />));
    const text = document.body.textContent ?? "";
    expect(text).toContain("Where the goods go");
    expect(text).toContain("Carres Klang");
    expect(text).toContain("AL Sungai Buloh");
    expect(text).toContain("HOUZS");
    // `HOUZS` is deliberately shorter than "HOUZS Balakong" — do not complete it.
    expect(text).not.toContain("HOUZS Balakong");
    // The three words COPY-STANDARD refuses for this field.
    expect(text).not.toMatch(/Ship-to|Drop point/);
  });

  it("an external destination with no address says `Address not set`", () => {
    render(wrap(<OperationPurchasingSettings />));
    expect(screen.getByTestId(`destination-unset-${AL}`).textContent).toBe("Address not set");
    expect(screen.getByTestId(`destination-unset-${HOUZS}`).textContent).toBe("Address not set");
    // NEVER against Carres Klang — its address comes from the warehouse record,
    // which is exactly what 0307's one-address constraint exists to guarantee.
    expect(screen.queryByTestId(`destination-unset-${KLANG}`)).toBeNull();
  });

  it("Carres Klang shows its warehouse address and offers no field to edit it", () => {
    render(wrap(<OperationPurchasingSettings />));
    expect(screen.getByTestId(`destination-row-${KLANG}`).textContent).toContain(
      "NETS-managed facility (Klang)",
    );
    // One address, one source: a second input here is a second place for it to
    // drift from the warehouse record.
    expect(screen.queryByTestId(`destination-address-${KLANG}`)).toBeNull();
    expect(screen.queryByTestId(`destination-save-${KLANG}`)).toBeNull();
    expect(screen.getByTestId(`destination-address-${AL}`)).toBeTruthy();
  });

  it("saves an external destination address, and only when it really changed", async () => {
    setAddress.mockResolvedValue(settings());
    render(wrap(<OperationPurchasingSettings />));
    const save = screen.getByTestId(`destination-save-${AL}`);
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByTestId(`destination-address-${AL}`), {
      target: { value: "12 Jalan Test, Sungai Buloh" },
    });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(setAddress).toHaveBeenCalledWith({
        destinationId: AL,
        address: "12 Jalan Test, Sungai Buloh",
      }),
    );
  });

  it("a supplier that does not deliver reads as the ONE locked sentence", () => {
    settingsQuery.mockReturnValue({
      data: settings({
        supplierCollection: [
          { supplierId: NICE, fixedDestinationId: KLANG, collectedByPartnerId: NETS },
        ],
      }),
      isLoading: false,
      error: null,
    });
    render(wrap(<OperationPurchasingSettings />));
    expect(screen.getByTestId(`supplier-collection-${NICE}`).textContent).toContain(
      "NETS collects from Nice Future and delivers to Carres Klang.",
    );
  });

  it("no collection rule means no section at all — never a row saying nobody collects", () => {
    render(wrap(<OperationPurchasingSettings />));
    expect(screen.queryByText("Suppliers that do not deliver")).toBeNull();
    expect(screen.queryByTestId(`supplier-collection-${NICE}`)).toBeNull();
  });

  it("a reader who may not edit sees the addresses and no Save", () => {
    settingsQuery.mockReturnValue({
      data: settings({ canEdit: false }),
      isLoading: false,
      error: null,
    });
    render(wrap(<OperationPurchasingSettings />));
    expect(screen.getByTestId(`destination-address-${AL}`)).toBeDisabled();
    expect(screen.queryByTestId(`destination-save-${AL}`)).toBeNull();
  });
});
