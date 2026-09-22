import { describe, expect, it } from "vitest";
import { chartTree, ledgerSourceWord, type LedgerAccount } from "./finance-ledger";

describe("ledgerSourceWord", () => {
  it("names money a supplier sent back out of an advance, and its reversal (0485)", () => {
    expect(ledgerSourceWord("SUPPLIER_MONEY_BACK")).toBe("Supplier money back");
    expect(ledgerSourceWord("SUPPLIER_MONEY_BACK_REVERSAL")).toBe("Supplier money back reversal");
  });

  it("names the two money moves and their reversals (0529)", () => {
    expect(ledgerSourceWord("MONEY_TRANSFER")).toBe("Bank transfer");
    expect(ledgerSourceWord("CARD_PAYOUT_REVERSAL")).toBe("Card payout reversal");
  });

  it("prints Other entry for a source it does not know, never the key", () => {
    expect(ledgerSourceWord("SOMETHING_NEW")).toBe("Other entry");
    expect(ledgerSourceWord("SOMETHING_NEW_REVERSAL")).toBe("Other entry reversal");
  });
});

describe("chartTree", () => {
  const acc = (code: string, parent_code: string | null, sort_order = 0): LedgerAccount => ({
    code, name: code, kind: "LIABILITY", parent_code, is_control: false, control_for: null, is_active: true, is_header: false,
    sort_order,
  });
  it("puts each account under its parent, siblings by code, with its depth", () => {
    const rows = chartTree([acc("2130", "2100"), acc("9100", "2000"), acc("2000", null), acc("2100", "2000"), acc("2110", "2100"), acc("1000", null)]);
    expect(rows.map((r) => `${r.code}:${r.depth}`)).toEqual(["1000:0", "2000:0", "2100:1", "2110:2", "2130:2", "9100:1"]);
  });
  it("puts an account whose parent is missing at the top", () => {
    expect(chartTree([acc("2110", "2100")]).map((r) => r.depth)).toEqual([0]);
  });
  /* 0557: the order Finance dragged wins over the code, and only among
     siblings — a drag under one heading never moves another heading's rows. */
  it("reads siblings in the order Finance dragged them, not by code", () => {
    const rows = chartTree([acc("2110", "2100", 3), acc("2120", "2100", 1), acc("2130", "2100", 2), acc("2100", null)]);
    expect(rows.map((r) => r.code)).toEqual(["2100", "2120", "2130", "2110"]);
  });
  it("keeps a dragged heading's order inside that heading only", () => {
    const rows = chartTree([
      acc("2000", null), acc("2100", "2000"), acc("2110", "2100", 2), acc("2120", "2100", 1), acc("9100", "2000"),
    ]);
    expect(rows.map((r) => r.code)).toEqual(["2000", "2100", "2120", "2110", "9100"]);
  });
});
