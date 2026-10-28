import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/pdf/render", () => ({ renderPoPdf: vi.fn() }));
let reportPaint: ((ready: boolean) => void) | undefined;
vi.mock("@/components/kit/PdfPreview", () => ({ default: ({ onReady }: { onReady: (ready: boolean) => void }) => { reportPaint = onReady; return <div>TEST rendered document frame</div>; } }));
import { renderPoPdf } from "@/lib/pdf/render";
import ManualPurchasePdfPreview from "./ManualPurchasePdfPreview";
import { manualPurchaseDraftPos } from "./manual-purchase-draft-po";
beforeEach(() => {
  reportPaint = undefined; vi.useFakeTimers(); vi.mocked(renderPoPdf).mockReset();
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:TEST-preview"); static revokeObjectURL = vi.fn(); });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("does not certify failed/changed paper and becomes ready only after a successful preview retry", async () => {
  const drafts = manualPurchaseDraftPos({ lines: [{ key: "TEST", sku: "TEST-SKU", item: "TEST goods", supplierName: "TEST supplier", qty: 1, attrs: null }],
    purposeLabel: "Ready Stock", destination: null, suppliers: [], collectedSupplierNames: new Set() });
  const ready = vi.fn(); vi.mocked(renderPoPdf).mockRejectedValueOnce(new Error("TEST rendering failed"));
  const { rerender, unmount } = render(<ManualPurchasePdfPreview drafts={drafts} onReadyChange={ready} />);
  expect(ready).toHaveBeenLastCalledWith(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(ready).not.toHaveBeenCalledWith(true);
  vi.mocked(renderPoPdf).mockResolvedValue(new Blob(["TEST PDF"])); fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(ready).not.toHaveBeenCalledWith(true);
  act(() => reportPaint?.(true)); expect(ready).toHaveBeenLastCalledWith(true);
  act(() => reportPaint?.(false)); expect(ready).toHaveBeenLastCalledWith(false);
  act(() => reportPaint?.(true));
  const stalePaint = reportPaint;
  // Late supplier/category facts can change grouping identity without changing
  // one printed byte. It must get its own painted readiness, not hang on old key.
  const regrouped = structuredClone(drafts); regrouped[0].key = "TEST-resolved-group";
  rerender(<ManualPurchasePdfPreview drafts={regrouped} onReadyChange={ready} />);
  expect(ready).toHaveBeenLastCalledWith(false);
  act(() => stalePaint?.(true)); expect(ready).toHaveBeenLastCalledWith(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  act(() => reportPaint?.(true)); expect(ready).toHaveBeenLastCalledWith(true);
  const changed = structuredClone(regrouped); changed[0].data.lines[0].qty = 2;
  rerender(<ManualPurchasePdfPreview drafts={changed} onReadyChange={ready} />);
  expect(ready).toHaveBeenLastCalledWith(false);
  act(() => stalePaint?.(true)); expect(ready).toHaveBeenLastCalledWith(false);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:TEST-preview");
  unmount();
});
