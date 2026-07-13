/**
 * QuotesDrawer — detail preview (Loo 2026-07-14).
 * Each quote row gains an Eye button that opens a floating window listing every
 * line + addon as a card, with its own Load CTA — verify-before-load.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { SavedQuote } from "./quotes";
import QuotesDrawer from "./QuotesDrawer";

const QUOTE: SavedQuote = {
  id: "q1",
  label: "Tan Mei Ling",
  phone: "0162524154",
  savedAt: "2026-07-12T00:00:00Z",
  lines: [
    { localId: "L1", sku: "MATT-A", qty: 2, attrs: null, unitPrice: 3490, label: "Carres Cloud · Queen" },
    { localId: "L2", sku: "BF-B", qty: 1, attrs: null, unitPrice: 1200, label: "Oak Frame · Queen" },
  ],
  addons: [{ key: "dispose-old", qty: 1, unitPrice: 80, name: "Old mattress disposal", attrs: null }],
  total: 8260,
};

beforeEach(() => {
  localStorage.setItem("carres-pos-quotes", JSON.stringify([QUOTE]));
});

const noop = () => {};

describe("QuotesDrawer — quote detail floating window", () => {
  it("Eye button opens the detail window with one card per line + addon", () => {
    render(<QuotesDrawer onLoad={noop} onClose={noop} />);
    expect(screen.queryByTestId("pos-quote-detail-modal")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("pos-quote-detail-q1"));
    const modal = screen.getByTestId("pos-quote-detail-modal");
    expect(within(modal).getByText("Tan Mei Ling")).toBeInTheDocument();
    expect(within(modal).getByText("Carres Cloud · Queen")).toBeInTheDocument();
    expect(within(modal).getByText("Oak Frame · Queen")).toBeInTheDocument();
    expect(within(modal).getByText("Old mattress disposal")).toBeInTheDocument();
    // Line math: 2 × RM 3,490 shown per-card.
    expect(within(modal).getByText(/2 × RM 3,490/)).toBeInTheDocument();
  });

  it("Load inside the detail window hands the quote to onLoad", () => {
    const onLoad = vi.fn();
    render(<QuotesDrawer onLoad={onLoad} onClose={noop} />);
    fireEvent.click(screen.getByTestId("pos-quote-detail-q1"));
    fireEvent.click(screen.getByTestId("pos-quote-detail-load"));
    expect(onLoad).toHaveBeenCalledWith(expect.objectContaining({ id: "q1" }));
  });

  it("close X dismisses the detail window without closing the drawer", () => {
    const onClose = vi.fn();
    render(<QuotesDrawer onLoad={noop} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("pos-quote-detail-q1"));
    fireEvent.click(screen.getByLabelText("Close details"));
    expect(screen.queryByTestId("pos-quote-detail-modal")).not.toBeInTheDocument();
    expect(screen.getByTestId("pos-quotes-drawer")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clicking the detail backdrop dismisses only the detail window", () => {
    const onClose = vi.fn();
    render(<QuotesDrawer onLoad={noop} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("pos-quote-detail-q1"));
    fireEvent.click(screen.getByTestId("pos-quote-detail-modal").parentElement!);
    expect(screen.queryByTestId("pos-quote-detail-modal")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
