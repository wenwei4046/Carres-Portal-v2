import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NewGoodsReceiptModal from "./NewGoodsReceiptModal";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/components/DOFileUploadField", () => ({
  default: ({ onUploaded }: { onUploaded: (p: string) => void }) => (
    <button type="button" onClick={() => onUploaded("NO-PO/a.pdf")}>fake upload</button>
  ),
}));

const props = {
  open: true, onOpenChange: () => {}, onPosted: () => {},
  suppliers: [{ id: "s1", name: "Sup" }], destinations: [{ id: "d1", name: "WH" }],
  skus: [{ sku: "S1", label: "S1", supplierId: "s1" }] as never,
};

describe("New Goods Receipt form", () => {
  it("names what Post still needs", () => {
    render(<NewGoodsReceiptModal {...props} />);
    expect(screen.getByRole("status").textContent).toMatch(/DO number of 3 or more characters.*uploaded DO file/);
  });

  it("tells the user the file was dropped when the DO number changes", () => {
    render(<NewGoodsReceiptModal {...props} />);
    const doInput = screen.getByLabelText(/DO Number/i);
    fireEvent.change(doInput, { target: { value: "DO-1" } });
    fireEvent.click(screen.getByText("fake upload"));
    fireEvent.change(doInput, { target: { value: "DO-12" } });
    expect(screen.getByText("DO number changed, upload the file again.")).toBeTruthy();
  });

  it("labels the Remove button of each line", () => {
    render(<NewGoodsReceiptModal {...props} />);
    expect(screen.getByRole("button", { name: "Remove line 1" })).toBeTruthy();
  });
});
