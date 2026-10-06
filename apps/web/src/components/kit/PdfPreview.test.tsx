import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PdfPreview from "./PdfPreview";

const pdf = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument: pdf.getDocument }));

function documentPages(count = 2) {
  const renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  const doc = {
    numPages: count,
    getPage: vi.fn(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
      render: renderPage,
    })),
  };
  const destroy = vi.fn(async () => {});
  pdf.getDocument.mockReturnValue({ promise: Promise.resolve(doc), destroy });
  return { doc, destroy, renderPage };
}

beforeEach(() => {
  pdf.getDocument.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
});

describe("PDF preview", () => {
  it("paints every page, enlarges readable paper and restores fit width", async () => {
    documentPages();
    const ready = vi.fn();
    render(<PdfPreview src="blob:first" title="Draft PO" onReady={ready} />);
    await waitFor(() => expect(ready).toHaveBeenLastCalledWith(true));
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(screen.getByLabelText("Page 1 of 2").style.width).toBe("320px");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    await waitFor(() => expect(screen.getByLabelText("Page 1 of 2").style.width).toBe("400px"));
    fireEvent.click(screen.getByRole("button", { name: "Fit width" }));
    await waitFor(() => expect(screen.getByLabelText("Page 1 of 2").style.width).toBe("320px"));
  });

  it("keeps failed paper unreviewed and retries the actual PDF", async () => {
    const { doc, destroy } = documentPages();
    pdf.getDocument.mockReturnValueOnce({ promise: Promise.reject(new Error("decode failed")), destroy });
    const ready = vi.fn();
    render(<PdfPreview src="blob:broken" title="Draft PO" onReady={ready} />);
    expect(await screen.findByText("Could not load the preview.")).toBeVisible();
    expect(ready).not.toHaveBeenCalledWith(true);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(ready).toHaveBeenLastCalledWith(true));
    expect(doc.getPage).toHaveBeenCalledWith(2);
    expect(destroy).toHaveBeenCalled();
  });

  it("cannot paint a late page from the previous document after switching", async () => {
    let release!: (page: unknown) => void;
    const { doc, destroy } = documentPages(1);
    const oldPage = new Promise((resolve) => { release = resolve; });
    pdf.getDocument.mockReturnValueOnce({
      promise: Promise.resolve({ numPages: 1, getPage: () => oldPage }), destroy,
    });
    const ready = vi.fn();
    const view = render(<PdfPreview src="blob:old" title="PO" onReady={ready} />);
    await act(async () => {});
    view.rerender(<PdfPreview src="blob:new" title="PO" onReady={ready} />);
    await waitFor(() => expect(ready).toHaveBeenLastCalledWith(true));
    await act(async () => { release(await doc.getPage()); });
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(destroy).toHaveBeenCalled();
    view.unmount();
    expect(destroy).toHaveBeenCalledTimes(2);
  });
});
