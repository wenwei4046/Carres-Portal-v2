/**
 * CartDrawer — Save Quote capture (Loo 2026-07-11).
 * Pressing "Save Quote" must NOT save immediately: it opens a name+phone form
 * (both REQUIRED — that's what makes the quote findable in the Quotes drawer),
 * and only the form's confirm actually persists the quote. The captured
 * name/phone are also written back into draft.customer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { emptyDraft, type DraftLine, type WizardDraft } from "../new-order/draft";
import CartDrawer from "./CartDrawer";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockSaveQuote = vi.fn();
vi.mock("./quotes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./quotes")>();
  return {
    ...actual,
    saveQuote: (input: Parameters<typeof actual.saveQuote>[0]) => {
      mockSaveQuote(input);
      return { ...input, id: "q1", savedAt: "2026-07-11T00:00:00Z", total: 1200 };
    },
  };
});

function draft(over?: Partial<WizardDraft>): WizardDraft {
  const line: DraftLine = {
    localId: "L1",
    sku: "MATT-A",
    qty: 1,
    attrs: null,
    unitPrice: 1200,
    label: "Matt X · Queen",
  };
  return { ...emptyDraft(), lines: [line], ...over };
}

const noop = () => {};

beforeEach(() => mockSaveQuote.mockClear());

describe("CartDrawer — Save Quote requires customer name + phone", () => {
  it("clicking Save Quote opens the capture form instead of saving", () => {
    render(<CartDrawer draft={draft()} onChange={noop} onProceed={noop} onClose={noop} />);
    fireEvent.click(screen.getByTestId("pos-save-quote"));
    expect(screen.getByTestId("save-quote-form")).toBeInTheDocument();
    expect(mockSaveQuote).not.toHaveBeenCalled();
  });

  it("confirm stays disabled until BOTH name and phone are filled", () => {
    render(<CartDrawer draft={draft()} onChange={noop} onProceed={noop} onClose={noop} />);
    fireEvent.click(screen.getByTestId("pos-save-quote"));
    const confirm = screen.getByTestId("save-quote-confirm");
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId("save-quote-name"), { target: { value: "Tan Mei Ling" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId("save-quote-phone"), { target: { value: "0123456789" } });
    expect(confirm).not.toBeDisabled();
  });

  it("confirm saves the quote with the typed name+phone and writes them back to the draft customer", () => {
    const onChange = vi.fn();
    render(<CartDrawer draft={draft()} onChange={onChange} onProceed={noop} onClose={noop} />);
    fireEvent.click(screen.getByTestId("pos-save-quote"));
    fireEvent.change(screen.getByTestId("save-quote-name"), { target: { value: "Tan Mei Ling" } });
    fireEvent.change(screen.getByTestId("save-quote-phone"), { target: { value: "0123456789" } });
    fireEvent.click(screen.getByTestId("save-quote-confirm"));

    expect(mockSaveQuote).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Tan Mei Ling", phone: "0123456789" }),
    );
    const next = onChange.mock.calls[0][0] as WizardDraft;
    expect(next.customer.name).toBe("Tan Mei Ling");
    expect(next.customer.phone).toBe("0123456789");
    // Form closes after save.
    expect(screen.queryByTestId("save-quote-form")).not.toBeInTheDocument();
  });

  it("confirm clears the cart (lines + addons) and closes the drawer — the quote holds the items", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    const d = draft({
      addons: [{ key: "dispose-old", qty: 1, unitPrice: 80, name: "Disposal", attrs: null }],
    });
    render(<CartDrawer draft={d} onChange={onChange} onProceed={noop} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("pos-save-quote"));
    fireEvent.change(screen.getByTestId("save-quote-name"), { target: { value: "Tan Mei Ling" } });
    fireEvent.change(screen.getByTestId("save-quote-phone"), { target: { value: "0123456789" } });
    fireEvent.click(screen.getByTestId("save-quote-confirm"));

    const next = onChange.mock.calls[0][0] as WizardDraft;
    expect(next.lines).toEqual([]);
    expect(next.addons).toEqual([]);
    expect(onClose).toHaveBeenCalled();
  });

  it("the form is pre-seeded from draft.customer when already known", () => {
    const d = draft();
    d.customer = { ...d.customer, name: "Known Customer", phone: "0111222333" };
    render(<CartDrawer draft={d} onChange={noop} onProceed={noop} onClose={noop} />);
    fireEvent.click(screen.getByTestId("pos-save-quote"));
    expect((screen.getByTestId("save-quote-name") as HTMLInputElement).value).toBe(
      "Known Customer",
    );
    expect((screen.getByTestId("save-quote-phone") as HTMLInputElement).value).toBe(
      "0111222333",
    );
    expect(screen.getByTestId("save-quote-confirm")).not.toBeDisabled();
  });

  it("Cancel closes the form without saving", () => {
    render(<CartDrawer draft={draft()} onChange={noop} onProceed={noop} onClose={noop} />);
    fireEvent.click(screen.getByTestId("pos-save-quote"));
    fireEvent.click(screen.getByTestId("save-quote-cancel"));
    expect(screen.queryByTestId("save-quote-form")).not.toBeInTheDocument();
    expect(mockSaveQuote).not.toHaveBeenCalled();
  });
});
