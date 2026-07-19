import { describe, expect, it } from "vitest";
import {
  buildSupplierGroupMessage,
  type SupplierGroupRow,
} from "./wa-templates";

describe("buildSupplierGroupMessage", () => {
  const rows: SupplierGroupRow[] = [
    { ref: "CR-1001", items: [{ sku: "MS01-K", qty: 2 }] },
    { ref: "TCF-1002", items: [{ sku: "BF03-Q", qty: 1 }] },
  ];

  it("remind mode: gentle opener + closer, supplier name present", () => {
    const msg = buildSupplierGroupMessage("remind", "Ohana", rows);
    expect(msg).toContain("Hi Ohana 👋");
    expect(msg).toContain("please confirm the ready date for these");
    expect(msg).toContain("Appreciate a ready date per SKU. Thank you!");
    expect(msg).not.toContain("customers are waiting");
  });

  it("chase mode: firmer opener + closer, supplier name present", () => {
    const msg = buildSupplierGroupMessage("chase", "Nice Future", rows);
    expect(msg).toContain("Hi Nice Future 👋");
    expect(msg).toContain("following up");
    expect(msg).toContain("customers are waiting");
    expect(msg).toContain("Please confirm a ready date today so we can plan delivery.");
  });

  it("*bold* SKU + ×qty, _italic_ refs, and a units total", () => {
    const msg = buildSupplierGroupMessage("remind", "Ohana", rows);
    expect(msg).toContain("*MS01-K* ×2");
    expect(msg).toContain("*BF03-Q* ×1");
    expect(msg).toContain("_CR-1001_");
    expect(msg).toContain("_TCF-1002_");
    expect(msg).toContain("Total 3 units.");
  });

  it("AGGREGATES the same SKU across orders into one summed line", () => {
    const msg = buildSupplierGroupMessage("remind", "Nice Future", [
      { ref: "CR1195", items: [{ sku: "Haven-H1401F-K", qty: 1 }] },
      { ref: "CR1177", items: [{ sku: "Haven-H1401F-K", qty: 1 }] },
    ]);
    expect(msg).toContain("*Haven-H1401F-K* ×2");
    // both refs listed under the one SKU line
    expect(msg).toContain("_CR1195, CR1177_");
    expect(msg).toContain("Total 2 units.");
  });

  it("a null ref renders '—'", () => {
    const msg = buildSupplierGroupMessage("remind", "Ohana", [
      { ref: null, items: [{ sku: "SF02", qty: 1 }] },
    ]);
    expect(msg).toContain("_—_");
  });

  it("includePo=false (default) shows ref only — no PO", () => {
    const msg = buildSupplierGroupMessage("remind", "Nice Future", [
      { ref: "CR-1001", po: "PO-99", items: [{ sku: "MS01", qty: 1 }] },
    ]);
    expect(msg).toContain("_CR-1001_");
    expect(msg).not.toContain("PO-99");
  });

  it("includePo=true tags each ref with its PO (sofa/bedframe suppliers)", () => {
    const msg = buildSupplierGroupMessage(
      "remind",
      "Ohana",
      [{ ref: "TCF-1002", po: "PO-77", items: [{ sku: "SF02", qty: 1 }] }],
      true,
    );
    expect(msg).toContain("TCF-1002 (PO PO-77)");
  });
});
