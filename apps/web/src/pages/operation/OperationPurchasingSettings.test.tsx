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

function settings(over: Partial<PurchasingSettingsResponse> = {}): PurchasingSettingsResponse {
  return {
    orderByBufferDays: 7,
    earliestSellDays: 21,
    logisticsCallWorkingDays: 1,
    poDays: [1, 3, 5],
    suppliers: [
      { id: NICE, name: "Nice Future", categories: ["mattress"], offDays: [0, 6], transitDays: 1 },
      { id: OHANA, name: "Ohana", categories: ["bedframe", "sofa"], offDays: [0], transitDays: 1 },
    ],
    productionDays: [
      { supplierId: NICE, category: "mattress", workingDays: 7 },
      { supplierId: OHANA, category: "bedframe", workingDays: 7 },
      { supplierId: OHANA, category: "sofa", workingDays: 14 },
    ],
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
    expect(text).toContain("was Mon–Sat");
    // `{0,6}` = off Sunday and Saturday.
    expect(text).toContain("was Mon–Fri");
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
