import { describe, it, expect } from "vitest";
import {
  buildLogisticChase,
  buildSupplierChase,
  chaseItemsLabel,
  waEncode,
} from "./wa-templates";

describe("wa-templates (Round 1A locked copy)", () => {
  const oneLine = [{ sku: "Lumi FirmCare-L1201F-K", qty: 1 }];
  const multi = [
    { sku: "Lumi FirmCare-L1201F-K", qty: 2 },
    { sku: "Essential Memory Pillow(L)", qty: 3 },
  ];

  it("single item keeps the sku; multi collapses to n items (units)", () => {
    expect(chaseItemsLabel(oneLine)).toBe("Lumi FirmCare-L1201F-K");
    expect(chaseItemsLabel(multi)).toBe("2 items (5 units)");
  });

  it("logistic chase — full template incl. the overdue suffix", () => {
    const t = buildLogisticChase({
      logistic: "NETS",
      soId: "SO-1153",
      ref: "CR0902",
      customer: "LEE WEI YANG",
      region: "Puchong",
      lines: oneLine,
      deadline: "6 Jul 26",
      overdue: true,
    });
    expect(t).toBe(
      "Hi NETS, need delivery arrangement. SO-1153 · REF CR0902 · LEE WEI YANG (Puchong). " +
        "Item: Lumi FirmCare-L1201F-K. Deadline: 6 Jul 26 — overdue. " +
        "Pls confirm delivery date + time slot with customer. TQ",
    );
  });

  it("logistic chase — no overdue suffix when on time", () => {
    const t = buildLogisticChase({
      logistic: "NETS",
      soId: "SO-1",
      ref: null,
      customer: null,
      region: null,
      lines: multi,
      deadline: "TBD",
      overdue: false,
    });
    expect(t).toContain("Deadline: TBD. Pls confirm");
    expect(t).not.toContain("overdue");
    expect(t).toContain("Item: 2 items (5 units).");
  });

  it("supplier chase — full template", () => {
    const t = buildSupplierChase({
      poNo: "PO/2607-019",
      ref: "CR0902",
      soId: "SO-1153",
      lines: oneLine,
      deadline: "6 Jul 26",
    });
    expect(t).toBe(
      "Hi, checking stock ETA. PO/2607-019 · our ref CR0902 (SO-1153). " +
        "Item: Lumi FirmCare-L1201F-K. Needed by: 6 Jul 26. Pls advise when stock ready. TQ",
    );
  });

  it("waEncode is wa.me-ready", () => {
    expect(waEncode("a b · c")).toBe("a%20b%20%C2%B7%20c");
  });
});
