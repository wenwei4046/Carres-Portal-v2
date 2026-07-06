/**
 * CreateSofaComboModal — principal captures the current build as a sofa combo.
 *  - a price + PWP input per canonical height; label prefilled with the codes
 *  - Create disabled until ≥1 price; a size with a BLANK price is skipped
 *  - PWP rides along only where a price is set; slots = one code per slot
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ProductModelDto } from "@carres/shared";
import CreateSofaComboModal from "./CreateSofaComboModal";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockCreate = vi.fn().mockResolvedValue({ sofaCombo: {} });
vi.mock("@/lib/queries", () => ({
  useCreateSofaCombo: () => ({ mutateAsync: mockCreate, isPending: false }),
}));

const MODEL: ProductModelDto = {
  id: "00000000-0000-0000-0000-000000000001",
  category: "sofa",
  modelKey: "booqit",
  name: "Booqit",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: "custom",
};

const CODES = ["1B(LHF)", "CNR", "2A(RHF)"];

function renderModal() {
  const onClose = vi.fn();
  render(
    <CreateSofaComboModal model={MODEL} moduleCodes={CODES} heights={["24", "28"]} onClose={onClose} />,
  );
  return { onClose };
}

beforeEach(() => mockCreate.mockClear());

describe("CreateSofaComboModal", () => {
  it("prefills the label with the codes and renders a price + PWP input per height", () => {
    renderModal();
    expect((screen.getByTestId("create-combo-label") as HTMLInputElement).value).toBe(
      "1B(LHF) + CNR + 2A(RHF)",
    );
    expect(screen.getByTestId("create-combo-price-24")).toBeInTheDocument();
    expect(screen.getByTestId("create-combo-pwp-24")).toBeInTheDocument();
    expect(screen.getByTestId("create-combo-price-28")).toBeInTheDocument();
    expect(screen.getByTestId("create-combo-pwp-28")).toBeInTheDocument();
  });

  it("keeps Create disabled until at least one size is priced", () => {
    renderModal();
    expect((screen.getByTestId("create-combo-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("create-combo-price-24"), { target: { value: "2990" } });
    expect((screen.getByTestId("create-combo-save") as HTMLButtonElement).disabled).toBe(false);
  });

  it("a blank-price size is skipped; slots = one code per slot; no PWP → null", async () => {
    const { onClose } = renderModal();
    // price 24 only; 28 left blank → 28 must NOT ride the payload
    fireEvent.change(screen.getByTestId("create-combo-price-24"), { target: { value: "2990" } });
    fireEvent.click(screen.getByTestId("create-combo-save"));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate).toHaveBeenCalledWith({
      modelId: MODEL.id,
      slots: [["1B(LHF)"], ["CNR"], ["2A(RHF)"]],
      pricesByHeight: { "24": 2990 },
      pwpPricesByHeight: null,
      label: "1B(LHF) + CNR + 2A(RHF)",
      active: true,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("PWP price rides along only where a base price is set", async () => {
    renderModal();
    fireEvent.change(screen.getByTestId("create-combo-price-24"), { target: { value: "2990" } });
    fireEvent.change(screen.getByTestId("create-combo-pwp-24"), { target: { value: "2490" } });
    // 28 gets a PWP but NO base price → 28 skipped entirely
    fireEvent.change(screen.getByTestId("create-combo-pwp-28"), { target: { value: "1999" } });
    fireEvent.click(screen.getByTestId("create-combo-save"));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.pricesByHeight).toEqual({ "24": 2990 });
    expect(arg.pwpPricesByHeight).toEqual({ "24": 2490 });
  });
});
