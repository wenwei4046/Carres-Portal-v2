import { describe, expect, it } from "vitest";
import { ledgerSourceWord } from "./finance-ledger";

describe("ledgerSourceWord", () => {
  it("names money a supplier sent back out of an advance, and its reversal (0485)", () => {
    expect(ledgerSourceWord("SUPPLIER_MONEY_BACK")).toBe("Supplier money back");
    expect(ledgerSourceWord("SUPPLIER_MONEY_BACK_REVERSAL")).toBe("Supplier money back reversal");
  });

  it("names the two money moves and their reversals (0528)", () => {
    expect(ledgerSourceWord("MONEY_TRANSFER")).toBe("Bank transfer");
    expect(ledgerSourceWord("CARD_PAYOUT_REVERSAL")).toBe("Card payout reversal");
  });

  it("prints Other entry for a source it does not know, never the key", () => {
    expect(ledgerSourceWord("SOMETHING_NEW")).toBe("Other entry");
    expect(ledgerSourceWord("SOMETHING_NEW_REVERSAL")).toBe("Other entry reversal");
  });
});
