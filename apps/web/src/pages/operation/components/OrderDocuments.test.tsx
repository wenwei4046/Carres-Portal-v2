import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OrderDocuments, {
  deriveOrderDocuments,
  countDocumentsOnFile,
  countDocumentsMissing,
  type OrderDocSignals,
} from "./OrderDocuments";

/**
 * J1 — Documents panel. The derivation carries the whole card: which document
 * rows appear, which say "missing", and which stay silent because they cannot
 * exist yet. The component itself is dumb, so these tests pin the rules.
 */

/** A raw order: sold, nothing else has happened. Live prod today looks like
 *  this for all 56 orders — no invoice, no payment, no PO, nothing delivered. */
const RAW: OrderDocSignals = {
  so: 1258,
  invoiceNo: null,
  doNumber: null,
  dispatched: false,
  delivered: false,
  payments: [],
  pos: [],
  photos: [],
};

const kinds = (sig: OrderDocSignals) =>
  deriveOrderDocuments(sig).map((r) => r.kind);

describe("deriveOrderDocuments", () => {
  it("a raw order has exactly one document — its sales order", () => {
    const rows = deriveOrderDocuments(RAW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "sales_order",
      detail: "SO-1258",
      missing: false,
    });
  });

  it("stays silent about documents that cannot exist yet", () => {
    // No invoice / delivery-order / delivery-photo row while the order is
    // still in the warehouse — silence, not a wall of "missing".
    expect(kinds(RAW)).not.toContain("invoice");
    expect(kinds(RAW)).not.toContain("delivery_order");
    expect(kinds(RAW)).not.toContain("delivery_photo");
    expect(countDocumentsMissing(deriveOrderDocuments(RAW))).toBe(0);
  });

  it("a dispatched order owes an invoice and a delivery order", () => {
    const rows = deriveOrderDocuments({ ...RAW, dispatched: true });
    const invoice = rows.find((r) => r.kind === "invoice");
    const deliveryOrder = rows.find((r) => r.kind === "delivery_order");
    expect(invoice?.missing).toBe(true);
    expect(deliveryOrder?.missing).toBe(true);
    expect(countDocumentsMissing(rows)).toBe(2);
  });

  it("shows the real numbers once they are issued", () => {
    const rows = deriveOrderDocuments({
      ...RAW,
      dispatched: true,
      invoiceNo: "INV-000123",
      doNumber: "DO-1258-1",
    });
    expect(rows.find((r) => r.kind === "invoice")).toMatchObject({
      detail: "INV-000123",
      missing: false,
    });
    expect(rows.find((r) => r.kind === "delivery_order")).toMatchObject({
      detail: "DO-1258-1",
      missing: false,
    });
    expect(countDocumentsMissing(rows)).toBe(0);
  });

  it("renders one receipt per payment, falling back to the paid date", () => {
    const rows = deriveOrderDocuments({
      ...RAW,
      payments: [
        { id: "p1", receiptNo: "R1258-1", paidOnLabel: "20 Jul 26" },
        { id: "p2", receiptNo: null, paidOnLabel: "23 Jul 26" },
      ],
    });
    const receipts = rows.filter((r) => r.kind === "receipt");
    expect(receipts.map((r) => r.detail)).toEqual(["R1258-1", "23 Jul 26"]);
    expect(receipts.map((r) => r.paymentId)).toEqual(["p1", "p2"]);
  });

  it("names the supplier on each purchase order", () => {
    const rows = deriveOrderDocuments({
      ...RAW,
      pos: [
        { id: "PO-2031", supplierName: "Ohana", received: false, doFilePath: null },
      ],
    });
    expect(rows.find((r) => r.kind === "purchase_order")).toMatchObject({
      detail: "PO-2031 · Ohana",
      poId: "PO-2031",
    });
    // Not received yet — the supplier has not delivered, so no DO is due.
    expect(kinds({ ...RAW, pos: [{ id: "PO-2031", supplierName: "Ohana", received: false, doFilePath: null }] }))
      .not.toContain("supplier_do");
  });

  it("a received PO with no signed DO on file reads missing", () => {
    const rows = deriveOrderDocuments({
      ...RAW,
      pos: [
        { id: "PO-2031", supplierName: "Ohana", received: true, doFilePath: null },
      ],
    });
    const sdo = rows.find((r) => r.kind === "supplier_do");
    expect(sdo?.missing).toBe(true);
  });

  it("a supplier DO on file carries its storage path", () => {
    const rows = deriveOrderDocuments({
      ...RAW,
      pos: [
        {
          id: "PO-2031",
          supplierName: "Ohana",
          received: true,
          doFilePath: "PO-2031/abc-DO_1.pdf",
        },
      ],
    });
    expect(rows.find((r) => r.kind === "supplier_do")).toMatchObject({
      missing: false,
      storagePath: "PO-2031/abc-DO_1.pdf",
    });
  });

  it("a delivered order with no delivery photo says so", () => {
    const rows = deriveOrderDocuments({ ...RAW, delivered: true });
    expect(rows.find((r) => r.kind === "delivery_photo")?.missing).toBe(true);
  });

  it("lists every delivery photo once uploaded", () => {
    const rows = deriveOrderDocuments({
      ...RAW,
      delivered: true,
      photos: [
        { path: "order/1/a.jpg", url: "https://x/a" },
        { path: "order/1/b.jpg", url: null },
      ],
    });
    const photos = rows.filter((r) => r.kind === "delivery_photo");
    expect(photos.map((p) => p.detail)).toEqual(["Photo 1", "Photo 2"]);
    expect(countDocumentsMissing(rows)).toBe(0);
  });

  it("keeps the lifecycle order and counts what is on file", () => {
    const rows = deriveOrderDocuments({
      so: 1258,
      invoiceNo: "INV-000123",
      doNumber: "DO-1258-1",
      dispatched: true,
      delivered: true,
      payments: [{ id: "p1", receiptNo: "R1258-1", paidOnLabel: "20 Jul 26" }],
      pos: [
        {
          id: "PO-2031",
          supplierName: "Ohana",
          received: true,
          doFilePath: "PO-2031/abc-DO_1.pdf",
        },
      ],
      photos: [{ path: "order/1/a.jpg", url: "https://x/a" }],
    });
    expect(rows.map((r) => r.kind)).toEqual([
      "sales_order",
      "invoice",
      "receipt",
      "purchase_order",
      "supplier_do",
      "delivery_order",
      "delivery_photo",
    ]);
    expect(countDocumentsOnFile(rows)).toBe(7);
    expect(countDocumentsMissing(rows)).toBe(0);
    // Every row key is unique — the list is a react list.
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
});

describe("OrderDocuments", () => {
  it("offers Open on documents that exist and never on a missing one", () => {
    const onOpen = vi.fn();
    const rows = deriveOrderDocuments({
      ...RAW,
      dispatched: true,
      invoiceNo: "INV-000123",
    });
    render(<OrderDocuments rows={rows} onOpen={onOpen} />);

    // sales order + invoice are openable; the delivery order is missing.
    const opens = screen.getAllByRole("button", { name: /open/i });
    expect(opens).toHaveLength(2);
    expect(screen.getByText("missing")).toBeTruthy();

    fireEvent.click(opens[1]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0]).toMatchObject({ kind: "invoice" });
  });

  it("never leaks a banned word", () => {
    const rows = deriveOrderDocuments({
      ...RAW,
      dispatched: true,
      delivered: true,
    });
    render(<OrderDocuments rows={rows} onOpen={() => {}} />);
    for (const banned of ["POD", "Proof of Delivery", "Unscheduled"]) {
      expect(screen.queryByText(new RegExp(banned, "i"))).toBeNull();
    }
    // The missing photo row says the plain words, not an abbreviation.
    expect(screen.getByText("Delivery photo")).toBeTruthy();
  });
});
