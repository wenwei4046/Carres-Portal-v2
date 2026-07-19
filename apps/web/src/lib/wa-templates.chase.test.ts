import { describe, expect, it } from "vitest";
import {
  buildSupplierGroupMessage,
  itemsBlock,
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
    expect(msg).toContain("checking on these open orders");
    expect(msg).toContain("Appreciate a ready date per order. Thank you!");
    expect(msg).not.toContain("customers are waiting");
  });

  it("chase mode: firmer opener + closer, supplier name present", () => {
    const msg = buildSupplierGroupMessage("chase", "Nice Future", rows);
    expect(msg).toContain("Hi Nice Future 👋");
    expect(msg).toContain("following up");
    expect(msg).toContain("customers are waiting");
    expect(msg).toContain("Please confirm a ready date today so we can plan delivery.");
  });

  it("lists every row's ref and uses itemsBlock for items", () => {
    const msg = buildSupplierGroupMessage("remind", "Ohana", rows);
    expect(msg).toContain("CR-1001");
    expect(msg).toContain("TCF-1002");
    expect(msg).toContain(itemsBlock(rows[0].items));
    expect(msg).toContain(itemsBlock(rows[1].items));
  });

  it("a null ref renders '—'", () => {
    const msg = buildSupplierGroupMessage("remind", "Ohana", [
      { ref: null, items: [{ sku: "SF02", qty: 1 }] },
    ]);
    expect(msg).toContain("—\t");
  });

  it("includePo=false (default) shows ref only — no PO", () => {
    const msg = buildSupplierGroupMessage("remind", "Nice Future", [
      { ref: "CR-1001", po: "PO-99", items: [{ sku: "MS01", qty: 1 }] },
    ]);
    expect(msg).toContain("CR-1001");
    expect(msg).not.toContain("PO");
  });

  it("includePo=true shows 'ref · PO no' (sofa/bedframe suppliers)", () => {
    const msg = buildSupplierGroupMessage(
      "remind",
      "Ohana",
      [{ ref: "TCF-1002", po: "PO-77", items: [{ sku: "SF02", qty: 1 }] }],
      true,
    );
    expect(msg).toContain("TCF-1002 · PO PO-77");
  });

  it("includePo=true with a missing PO renders 'PO —'", () => {
    const msg = buildSupplierGroupMessage(
      "chase",
      "Ohana",
      [{ ref: "TCF-1003", po: null, items: [{ sku: "SF03", qty: 1 }] }],
      true,
    );
    expect(msg).toContain("TCF-1003 · PO —");
  });
});
