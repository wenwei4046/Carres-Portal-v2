import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SalesOrderCardDocument from "./SalesOrderCardDocument";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), render: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch: mocks.fetch }));
vi.mock("@/lib/pdf/render", () => ({ renderSalesOrderPdf: mocks.render }));
vi.mock("@/components/kit/PdfPreview", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/components/kit/PdfPreview")>()), default: ({ src }: { src: string }) => <div data-testid="pdf" data-src={src} /> }));
beforeEach(() => {
  mocks.fetch.mockReset(); mocks.render.mockReset();
  mocks.fetch.mockResolvedValue({ saved: true });
  mocks.render.mockResolvedValue(new Blob(["mock PDF"]));
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:saved");
    static revokeObjectURL = vi.fn();
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("saved SO document lifecycle", () => {
  it("keeps identity and file close available before the source finishes", () => {
    mocks.fetch.mockReturnValue(new Promise(() => {}));
    const onClose = vi.fn();
    render(<SalesOrderCardDocument onClose={onClose} orderId="pending" reference="SO-1368" />);
    expect(screen.getByRole("heading", { name: "Sales order PDF · SO-1368" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close PDF" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("reads saved data and releases the preview Blob on close", async () => {
    const view = render(<SalesOrderCardDocument onClose={() => {}} orderId="order-a" reference="SO-1" />);
    await screen.findByTestId("pdf");
    expect(mocks.fetch).toHaveBeenCalledWith("/api/orders/order-a/sales-order-data", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(mocks.render).toHaveBeenCalledWith({ saved: true });
    expect(screen.getByTestId("pdf")).toHaveAttribute("data-src", "blob:saved");
    expect(screen.getByRole("heading", { name: "Sales order PDF · SO-1" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe("blob:saved");
      expect(this.download).toBe("SO-1.pdf");
    });
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:saved");
  });
  it("shows read failure without a fake PDF and retries", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("denied"));
    render(<SalesOrderCardDocument onClose={() => {}} orderId="a" reference="SO-1" />);
    await screen.findByText("Could not load the preview.");
    expect(mocks.render).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close PDF" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByTestId("pdf");
  });
  it("ignores late rendering after the order changes", async () => {
    let finish!: (blob: Blob) => void;
    mocks.render.mockImplementationOnce(() => new Promise<Blob>((resolve) => { finish = resolve; }));
    const view = render(<SalesOrderCardDocument onClose={() => {}} orderId="old" reference="SO-1" />);
    await waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1));
    view.rerender(<SalesOrderCardDocument onClose={() => {}} orderId="new" reference="SO-2" />);
    await screen.findByTestId("pdf");
    finish(new Blob(["old mock PDF"]));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
  });
});
