import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: api.fetch };
});
const pdf = vi.hoisted(() => ({
  so: vi.fn(async () => new Blob(["so"])),
  doc: vi.fn(async () => new Blob(["do"])),
  po: vi.fn(async () => new Blob(["po"])),
  grn: vi.fn(async () => new Blob(["grn"])),
}));
vi.mock("@/lib/pdf/render", () => ({
  renderCombinedSalesOrderPdf: pdf.so,
  renderDoPdf: pdf.doc,
  renderPoPdf: pdf.po,
  renderGrnPdf: pdf.grn,
}));
vi.mock("./components/grn-template-data", () => ({ grnTemplateDataOf: (d: unknown) => ({ from: d }) }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

import {
  printDeliveryOrder,
  printGrn,
  printPurchaseOrder,
  printSalesOrdersOrSay,
  receivingHasGrn,
} from "./record-print";

/* Print is the record's EXISTING flow: the same read, the same renderer, a new
   tab. It is a read — no POST, no send, no result is ever recorded. */
describe("record-print — one print flow per document", () => {
  const open = vi.fn();
  beforeEach(() => {
    api.fetch.mockReset().mockResolvedValue({ ok: true });
    open.mockReset();
    vi.stubGlobal("open", open);
    URL.createObjectURL = vi.fn(() => "blob:printed");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("Sales Order: the server's RLS-scoped data, the governed renderer, a new tab", async () => {
    await printSalesOrdersOrSay([{ id: "o1" }]);
    expect(api.fetch).toHaveBeenCalledWith("/api/orders/o1/sales-order-data");
    expect(pdf.so).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("blob:printed", "_blank");
  });

  it("a failed Sales Order read is said in words, never thrown", async () => {
    api.fetch.mockRejectedValueOnce(new Error("nope"));
    await printSalesOrdersOrSay([{ id: "o1" }]);
    expect(toastError).toHaveBeenCalledWith("Printing 1 sales order failed: Error: nope");
    expect(open).not.toHaveBeenCalled();
  });

  it("Delivery Order and Purchase Order read their print data, never write", async () => {
    await printDeliveryOrder("o9", "DO-1 2");
    expect(api.fetch).toHaveBeenLastCalledWith("/api/operation/orders/o9/print-do-data?do_number=DO-1%202");
    await printPurchaseOrder("PO-260901-4827");
    expect(api.fetch).toHaveBeenLastCalledWith("/api/operation/pos/PO-260901-4827/print-data");
    for (const call of api.fetch.mock.calls) expect(call[1]).toBeUndefined();
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("a GRN prints from the saved session; only a posted or voided receipt has paper", async () => {
    const read = vi.fn(async () => ({ receipt: { id: "s1" } }) as never);
    await printGrn("s1", read);
    expect(read).toHaveBeenCalledWith("s1");
    expect(pdf.grn).toHaveBeenCalledWith({ from: { receipt: { id: "s1" } } });
    expect(receivingHasGrn("posted")).toBe(true);
    expect(receivingHasGrn("voided")).toBe(true);
    expect(receivingHasGrn("submitted")).toBe(false);
    expect(receivingHasGrn(null)).toBe(false);
  });
});
