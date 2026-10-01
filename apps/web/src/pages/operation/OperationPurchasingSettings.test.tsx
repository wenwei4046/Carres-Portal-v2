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
const createDestination = vi.fn();
const updateDestination = vi.fn();
const setSupplierCollection = vi.fn();
const setPoWindows = vi.fn();
const setCutoff = vi.fn();
const setAddress = vi.fn();
const setChannel = vi.fn();

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
    useCreatePurchasingDestination: () => mutation(createDestination),
    useUpdatePurchasingDestination: () => mutation(updateDestination),
    useSetPurchasingSupplierCollection: () => mutation(setSupplierCollection),
    useSetPurchasingPoWindows: () => mutation(setPoWindows),
    useSetSupplierPoCutoff: () => mutation(setCutoff),
    useSetSupplierAddress: () => mutation(setAddress),
    useSetSupplierChannel: () => mutation(setChannel),
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
const KLANG = "33333333-0000-0000-0000-000000000003";
const NETS = "66666666-0000-0000-0000-000000000006";

function settings(over: Partial<PurchasingSettingsResponse> = {}): PurchasingSettingsResponse {
  return {
    orderByBufferDays: 7,
    earliestSellDays: 21,
    logisticsCallWorkingDays: 1,
    poDays: [1, 3, 5],
    poWindows: { first: "11:30", second: "16:00", secondEnabled: true },
    manualPurchaseMinDeliveryDays: 0,
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
        address: "Lot 12, Klang",
        isDefault: true,
        active: true,
        warehouseLinked: true,
      },
      {
        id: "44444444-0000-0000-0000-000000000004",
        name: "AL Sungai Buloh",
        address: "Sungai Buloh",
        isDefault: false,
        active: true,
        warehouseLinked: false,
      },
      {
        id: "55555555-0000-0000-0000-000000000005",
        name: "Ohana",
        address: null,
        isDefault: false,
        active: true,
        warehouseLinked: false,
      },
    ],
    supplierCollections: [
      {
        supplierId: NICE,
        supplierName: "Nice Future",
        destinationId: KLANG,
        partnerId: NETS,
      },
    ],
    deliveryPartners: [{ id: NETS, name: "NETS" }],
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
  createDestination.mockResolvedValue(settings());
  updateDestination.mockResolvedValue(settings());
  setSupplierCollection.mockResolvedValue(settings());
});

describe("Purchasing → Settings", () => {
  it("introduces Settings as the owner of destinations and ordering rules", () => {
    render(wrap(<OperationPurchasingSettings />));
    expect(
      screen.getByText(
        "The settings the ordering engine reads. Change one here and SO Batch Purchase uses it the same day.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/The numbers the ordering engine reads/)).not.toBeInTheDocument();
  });

  it("lists AL and Ohana from the shared Deliver To master data", () => {
    render(wrap(<OperationPurchasingSettings />));
    const section = screen.getByTestId("deliver-to-settings");
    expect(within(section).getByText("AL Sungai Buloh")).toBeInTheDocument();
    expect(within(section).getByText("Ohana")).toBeInTheDocument();
    expect(within(section).getByText("Address not set")).toBeInTheDocument();
  });

  it("keeps the factory collector and destination in Settings, not Issue review", () => {
    render(wrap(<OperationPurchasingSettings />));
    const section = screen.getByTestId("supplier-collection-settings");
    expect(within(section).getByText("Nice Future")).toBeInTheDocument();
    expect(within(section).getByLabelText("Collector for Nice Future")).toHaveValue(NETS);
    expect(within(section).getByLabelText("Deliver To for Nice Future")).toHaveValue(KLANG);
    expect(within(section).getByText("NETS collects from Nice Future and delivers to Carres Klang.")).toBeInTheDocument();
  });

  it("saves one complete supplier collection rule", async () => {
    render(wrap(<OperationPurchasingSettings />));
    const section = screen.getByTestId("supplier-collection-settings");
    fireEvent.change(within(section).getByLabelText("Deliver To for Nice Future"), {
      target: { value: "44444444-0000-0000-0000-000000000004" },
    });
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(setSupplierCollection).toHaveBeenCalledWith({
        supplierId: NICE,
        destinationId: "44444444-0000-0000-0000-000000000004",
        partnerId: NETS,
      }),
    );
  });

  it("adds a future Deliver To from Settings", async () => {
    render(wrap(<OperationPurchasingSettings />));
    fireEvent.click(screen.getByRole("button", { name: "Add Deliver To" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Yard" } });
    /* 0611 · suppliers now have an `Address` too; this one is the Deliver To's. */
    fireEvent.change(within(screen.getByTestId("deliver-to-settings")).getByLabelText("Address"), {
      target: { value: "12 Jalan Baru" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(createDestination).toHaveBeenCalledWith({
        name: "New Yard",
        address: "12 Jalan Baru",
      }),
    );
  });

  it("does not let the current default be unchecked without choosing another", () => {
    render(wrap(<OperationPurchasingSettings />));
    const section = screen.getByTestId("deliver-to-settings");
    fireEvent.click(within(section).getAllByRole("button", { name: "Edit" })[0]);
    expect(within(section).getByLabelText("Default")).toBeDisabled();
  });

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
    /* The PO windows card has ONE Save; it stores whichever fact moved. */
    fireEvent.click(screen.getByTestId("po-windows-save"));
    await waitFor(() =>
      expect(setPoDays).toHaveBeenCalledWith({ days: [1, 3, 5, 4] }),
    );
    /* The times did not move, so their door is not called. */
    expect(setPoWindows).not.toHaveBeenCalled();
  });

  it("saves one of the single numbers by key", async () => {
    render(wrap(<OperationPurchasingSettings />));
    fireEvent.change(screen.getByTestId("safety-days"), { target: { value: "10" } });
    fireEvent.click(screen.getByTestId("safety-days-save"));
    await waitFor(() =>
      expect(setNumber).toHaveBeenCalledWith({ key: "order_by_buffer_days", value: 10 }),
    );
  });

  /* 0422 — the Manual Purchase number sits directly under the earliest-sell
     number, renders from the payload, and saves through the same door. */
  it("renders the Manual Purchase earliest-date number from the payload, under the earliest-sell number", () => {
    settingsQuery.mockReturnValue({
      data: settings({ manualPurchaseMinDeliveryDays: 3 }),
      isLoading: false,
      error: null,
    });
    render(wrap(<OperationPurchasingSettings />));
    expect(
      screen.getByText("Earliest Delivery Date a Manual Purchase Request may ask for"),
    ).toBeTruthy();
    const input = screen.getByTestId("manual-purchase-min-delivery-days") as HTMLInputElement;
    expect(input.value).toBe("3");
    expect(input).toHaveAttribute("min", "0");
    expect(input).toHaveAttribute("max", "365");
    const earliestSell = screen.getByTestId("earliest-sell-days");
    expect(
      earliestSell.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("saving the Manual Purchase number PUTs /purchasing/settings/number by key", async () => {
    render(wrap(<OperationPurchasingSettings />));
    fireEvent.change(screen.getByTestId("manual-purchase-min-delivery-days"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByTestId("manual-purchase-min-delivery-days-save"));
    await waitFor(() =>
      expect(setNumber).toHaveBeenCalledWith({
        key: "manual_purchase_min_delivery_days",
        value: 3,
      }),
    );
  });

  it("the buffer wears its approved name — `Safety days`, never `buffer` (Card 02-A)", () => {
    render(wrap(<OperationPurchasingSettings />));
    const text = document.body.textContent ?? "";
    expect(text).toContain("Safety days");
    expect(text).toContain("Extra time allowed for delays.");
    expect(text.toLowerCase()).not.toContain("buffer");
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
    expect(screen.queryByTestId("po-windows-save")).toBeNull();
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
    expect(text).toContain("Safety days");
    /* COPY: the Settings words are `PO Days` · `First PO window` · `Second PO window`. */
    expect(text).toContain("PO Days");
    expect(text).toContain("First PO window");
    expect(text).toContain("Second PO window");
    expect(text).toContain("Supplier work week");
    expect(text).toContain("Earliest date a store may sell");
  });
});

/**
 * 🔴 P20.4 — THE HISTORY LINE PRINTED A POSTGRES ARRAY ON SCREEN.
 *
 * `oldValue` is a plain `text` column and the two array-valued keys are
 * recorded with `v_old::text`, so the history carries the DATABASE's spelling.
 * This line rendered it raw. Measured in production 2026-08-08 the ENTIRE audit
 * trail was two rows, both `supplier_work_week` — so `· was {0}` and
 * `· was {0,6}` were not a corner case, they were the only two history lines
 * this page had ever shown.
 *
 * `po_days` is the same defect with no history rows yet, so it is pinned here
 * before a manager's first change finds it.
 */
describe("P20.4 · a work week reads as days", () => {
  const withArrayHistory = () =>
    settingsQuery.mockReturnValue({
      data: settings({
        lastChanges: [
          // PRODUCTION's own two rows, verbatim.
          {
            settingKey: "supplier_work_week",
            supplierId: OHANA,
            category: null,
            oldValue: "{0}",
            newValue: "{0,6}",
            changedBy: "Jess",
            changedAt: "2026-08-03T03:08:24.000Z",
          },
          {
            settingKey: "supplier_work_week",
            supplierId: NICE,
            category: null,
            oldValue: "{0,6}",
            newValue: "{0}",
            changedBy: "Jess",
            changedAt: "2026-08-03T03:08:16.000Z",
          },
          {
            settingKey: "po_days",
            supplierId: null,
            category: null,
            oldValue: "{1,3,5}",
            newValue: "{1,2,3,4,5}",
            changedBy: "Jess",
            changedAt: "2026-08-03T03:09:00.000Z",
          },
        ],
      }),
      isLoading: false,
      error: null,
    });

  it("no history line prints an array literal anywhere on the page", () => {
    withArrayHistory();
    const { container } = render(wrap(<OperationPurchasingSettings />));
    const text = container.textContent ?? "";
    for (const sql of ["{0}", "{0,6}", "{1,3,5}", "{1,2,3,4,5}"]) {
      expect(text).not.toContain(sql);
    }
  });

  it("each one reads as the days it means", () => {
    withArrayHistory();
    const { container } = render(wrap(<OperationPurchasingSettings />));
    const text = container.textContent ?? "";
    // `{0}` = off Sunday only → the factory works Monday to Saturday.
    expect(text).toContain("was Mon to Sat");
    // `{0,6}` = off Sunday and Saturday.
    expect(text).toContain("was Mon to Fri");
    // PO days stores the days the office SENDS, the other way round, and must
    // still read as days.
    expect(text).toContain("was Mon Wed Fri");
  });

  it("a plain number is untouched — only the two array keys are translated", () => {
    render(wrap(<OperationPurchasingSettings />));
    const row = screen.getByTestId("production-row-sofa");
    expect(within(row).getByTestId("setting-change-line").textContent).toContain("was 10");
  });
});

/**
 * ⭐ PO WINDOWS (Purchasing MASTER §5.6.1; storage + audited door 0585). The
 * window times had no screen, so changing 11:30 meant editing the database.
 */
describe("PO windows in Settings", () => {
  beforeEach(() => {
    setPoWindows.mockReset().mockResolvedValue(undefined);
    settingsQuery.mockReturnValue({ data: settings(), isLoading: false, error: null });
  });

  it("shows PO Days and both window times in ONE card", () => {
    render(wrap(<OperationPurchasingSettings />));
    const card = screen.getByTestId("po-windows-settings");
    expect(within(card).getByText("PO Days")).toBeTruthy();
    expect((document.getElementById("po-window-first") as HTMLInputElement).value).toBe("11:30");
    expect((document.getElementById("po-window-second") as HTMLInputElement).value).toBe("16:00");
    /* PO Days left `The other numbers`: one home per fact. */
    expect(within(card).getByTestId("po-days")).toBeTruthy();
    expect(screen.getAllByTestId("po-days")).toHaveLength(1);
  });

  it("saves a moved first window through the one door", async () => {
    render(wrap(<OperationPurchasingSettings />));
    const save = screen.getByTestId("po-windows-save");
    expect(save).toBeDisabled();
    fireEvent.change(document.getElementById("po-window-first")!, { target: { value: "11:00" } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(setPoWindows).toHaveBeenCalledWith({ first: "11:00", second: "16:00", secondEnabled: true }),
    );
  });

  it("switches the second window off and sends that", async () => {
    render(wrap(<OperationPurchasingSettings />));
    fireEvent.click(screen.getByRole("checkbox", { name: "Use a second PO window" }));
    expect(document.getElementById("po-window-second")).toBeDisabled();
    fireEvent.click(screen.getByTestId("po-windows-save"));
    await waitFor(() =>
      expect(setPoWindows).toHaveBeenCalledWith({ first: "11:30", second: "16:00", secondEnabled: false }),
    );
  });

  it("names the problem and does not save a second window earlier than the first", () => {
    render(wrap(<OperationPurchasingSettings />));
    fireEvent.change(document.getElementById("po-window-second")!, { target: { value: "10:00" } });
    expect(screen.getByTestId("po-windows-problem")).toHaveTextContent(
      "The second PO window must be later than the first.",
    );
    expect(screen.getByTestId("po-windows-save")).toBeDisabled();
  });

  it("reads the recorded change in clock words", () => {
    settingsQuery.mockReturnValue({
      data: settings({
        lastChanges: [
          {
            settingKey: "po_windows",
            supplierId: null,
            category: null,
            oldValue: "11:30:00 · 16:00:00 · on",
            newValue: "11:00:00 · 16:00:00 · on",
            changedBy: "Jess",
            changedAt: "2026-09-28T03:00:00Z",
          },
        ],
      }),
      isLoading: false,
      error: null,
    });
    render(wrap(<OperationPurchasingSettings />));
    const card = screen.getByTestId("po-windows");
    expect(card.textContent).toContain("was 11:30 AM and 4:00 PM");
  });
});

/**
 * ⭐ A SUPPLIER'S OWN LAST PO TIME (0585; owner 2026-09-29: "original
 * setting? why you cant??"). It had no screen; it sits under the PO windows.
 */
describe("Last PO time for one supplier", () => {
  beforeEach(() => {
    setCutoff.mockReset().mockResolvedValue(undefined);
  });

  it("lists every supplier, says which use the PO windows, and saves one supplier's time", async () => {
    settingsQuery.mockReturnValue({
      data: settings({
        suppliers: [
          { id: NICE, name: "Nice Future", categories: ["mattress"], offDays: [0, 6], poCutoff: "10:00" },
          { id: OHANA, name: "Ohana", categories: ["sofa"], offDays: [0], poCutoff: null },
        ],
      }),
      isLoading: false,
      error: null,
    });
    render(wrap(<OperationPurchasingSettings />));
    expect(screen.getByTestId(`last-po-time-${NICE}`)).toHaveTextContent("10:00 AM");
    expect(screen.getByTestId(`last-po-time-${OHANA}`)).toHaveTextContent("Uses the PO windows");
    /* No time yet: a door, never an empty `--:-- --` box. */
    expect(document.getElementById(`last-po-time-${OHANA}-input`)).toBeNull();
    fireEvent.click(screen.getByTestId(`last-po-time-${OHANA}-open`));
    fireEvent.change(document.getElementById(`last-po-time-${OHANA}-input`)!, { target: { value: "09:30" } });
    fireEvent.click(screen.getByTestId(`last-po-time-${OHANA}-save`));
    await waitFor(() => expect(setCutoff).toHaveBeenCalledWith({ supplierId: OHANA, cutoff: "09:30" }));
  });

  it("clears a time back to the PO windows, and refuses one that is not earlier than the last window", async () => {
    settingsQuery.mockReturnValue({
      data: settings({
        suppliers: [{ id: NICE, name: "Nice Future", categories: ["mattress"], offDays: [0, 6], poCutoff: "10:00" }],
      }),
      isLoading: false,
      error: null,
    });
    render(wrap(<OperationPurchasingSettings />));
    const input = document.getElementById(`last-po-time-${NICE}-input`)!;
    /* The last window is 4:00 PM (second window on). */
    fireEvent.change(input, { target: { value: "16:30" } });
    expect(screen.getByText("Must be earlier than the last PO window.")).toBeTruthy();
    expect(screen.getByTestId(`last-po-time-${NICE}-save`)).toBeDisabled();
    fireEvent.click(screen.getByTestId(`last-po-time-${NICE}-clear`));
    await waitFor(() => expect(setCutoff).toHaveBeenCalledWith({ supplierId: NICE, cutoff: null }));
  });

  it("a read-only viewer is told who can change Settings, and gets no Save", () => {
    settingsQuery.mockReturnValue({ data: settings({ canEdit: false }), isLoading: false, error: null });
    render(wrap(<OperationPurchasingSettings />));
    expect(screen.getByText(/Only a manager signed in with their own account can change these\./)).toBeTruthy();
    expect(screen.queryByTestId(`last-po-time-${NICE}-save`)).toBeNull();
  });
});

describe("Repair return target (0602 · 0603, Purchasing §9.7)", () => {
  it("edits the working days by its key", async () => {
    settingsQuery.mockReturnValue({ data: settings({ repairReturnWorkingDays: 14 }), isLoading: false, error: null });
    setNumber.mockReset().mockResolvedValue(undefined);
    render(wrap(<OperationPurchasingSettings />));
    expect(screen.getByText("Repair return target")).toBeTruthy();
    expect(screen.getByText("Counted from when the Supplier receives the Repair Order.")).toBeTruthy();
    fireEvent.change(screen.getByTestId("repair-return-working-days"), { target: { value: "10" } });
    fireEvent.click(screen.getByTestId("repair-return-working-days-save"));
    await waitFor(() => expect(setNumber).toHaveBeenCalledWith({ key: "repair_return_working_days", value: 10 }));
  });

  it("is not drawn when the Worker does not send it", () => {
    settingsQuery.mockReturnValue({ data: settings(), isLoading: false, error: null });
    render(wrap(<OperationPurchasingSettings />));
    expect(screen.queryByText("Repair return target")).toBeNull();
  });
});

describe("Supplier Claims reply timing (0606, Purchasing §9.5 owner-approved 2026-09-06)", () => {
  it("edits both Office working day numbers by their keys", async () => {
    settingsQuery.mockReturnValue({
      data: settings({ claimReplyWaitingDays: 2, claimEscalationExtraDays: 2 }),
      isLoading: false,
      error: null,
    });
    setNumber.mockReset().mockResolvedValue(undefined);
    render(wrap(<OperationPurchasingSettings />));
    const card = screen.getByTestId("supplier-claims-settings");
    expect(within(card).getByText("Reply waiting days")).toBeTruthy();
    expect(within(card).getByText("Extra days before escalation")).toBeTruthy();
    fireEvent.change(screen.getByTestId("claim-reply-waiting-days"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("claim-reply-waiting-days-save"));
    await waitFor(() => expect(setNumber).toHaveBeenCalledWith({ key: "claim_reply_waiting_days", value: 3 }));
    fireEvent.change(screen.getByTestId("claim-escalation-extra-days"), { target: { value: "4" } });
    fireEvent.click(screen.getByTestId("claim-escalation-extra-days-save"));
    await waitFor(() => expect(setNumber).toHaveBeenCalledWith({ key: "claim_escalation_extra_days", value: 4 }));
  });

  it("is not drawn when the Worker does not send the numbers", () => {
    settingsQuery.mockReturnValue({ data: settings(), isLoading: false, error: null });
    render(wrap(<OperationPurchasingSettings />));
    expect(screen.queryByTestId("supplier-claims-settings")).toBeNull();
  });
});

describe("Supplier addresses (0611, Purchasing §9.6 Return To)", () => {
  it("saves each address on its own, and never copies one into the other", async () => {
    setAddress.mockReset().mockResolvedValue({});
    settingsQuery.mockReturnValue({
      data: settings({
        suppliers: [
          { id: OHANA, name: "Ohana", categories: ["bedframe"], offDays: [0], address: "Ohana HQ, Klang", returnAddress: null },
        ],
      }),
      isLoading: false,
      error: null,
    });
    render(wrap(<OperationPurchasingSettings />));
    const row = screen.getByTestId(`address-row-${OHANA}`);
    expect(within(row).getByLabelText("Address")).toHaveValue("Ohana HQ, Klang");
    /* A blank Return address stays blank: the Address is never offered in its place. */
    expect(within(row).getByLabelText("Return address")).toHaveValue("");
    /* Owner ruling 2026-09-29: one address; a blank Return address means the Address. */
    expect(within(row).getByLabelText("Return address")).toHaveAttribute("placeholder", "Same as Address");
    expect(screen.getByTestId(`supplier-returnAddress-save-${OHANA}`)).toBeDisabled();
    fireEvent.change(within(row).getByLabelText("Return address"), { target: { value: "Ohana returns bay, Klang" } });
    fireEvent.click(screen.getByTestId(`supplier-returnAddress-save-${OHANA}`));
    await waitFor(() => expect(setAddress).toHaveBeenCalledTimes(1));
    expect(setAddress).toHaveBeenCalledWith({ supplierId: OHANA, kind: "returnAddress", text: "Ohana returns bay, Klang" });
  });

  it("a person who cannot edit sees the addresses but no Save", () => {
    settingsQuery.mockReturnValue({
      data: settings({
        canEdit: false,
        suppliers: [{ id: OHANA, name: "Ohana", categories: ["bedframe"], offDays: [0], address: null, returnAddress: "Returns bay" }],
      }),
      isLoading: false,
      error: null,
    });
    render(wrap(<OperationPurchasingSettings />));
    const row = screen.getByTestId(`address-row-${OHANA}`);
    expect(within(row).getByLabelText("Return address")).toBeDisabled();
    expect(screen.queryByTestId(`supplier-address-save-${OHANA}`)).not.toBeInTheDocument();
  });
});

describe("Supplier channels", () => {
  it("saves an email independently of the WhatsApp group", async () => {
    setChannel.mockReset().mockResolvedValue({});
    settingsQuery.mockReturnValue({ data: settings({ suppliers: [{ id: OHANA, name: "Ohana", categories: ["bedframe"], offDays: [0], contactEmail: null, whatsappGroupUrl: "https://chat.whatsapp.com/AbC" }] }), isLoading: false, error: null });
    render(wrap(<OperationPurchasingSettings />));
    const section = screen.getByTestId("supplier-channel-settings");
    const email = within(section).getByLabelText("Email");
    fireEvent.change(email, { target: { value: "orders@example.com" } });
    fireEvent.submit(email.closest("form")!);
    await waitFor(() => expect(setChannel).toHaveBeenCalledWith({ supplierId: OHANA, kind: "contactEmail", text: "orders@example.com" }));
    expect(within(section).getByLabelText("WhatsApp group")).toHaveValue("https://chat.whatsapp.com/AbC");
  });
  it("does not offer saving to a viewer", () => {
    settingsQuery.mockReturnValue({ data: settings({ canEdit: false }), isLoading: false, error: null });
    render(wrap(<OperationPurchasingSettings />));
    const section = screen.getByTestId("supplier-channel-settings");
    expect(within(section).queryByRole("button", { name: "Save" })).toBeNull();
    for (const input of within(section).getAllByRole("textbox")) expect(input).toBeDisabled();
  });
});
