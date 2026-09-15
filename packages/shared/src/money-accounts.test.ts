import { describe, expect, it } from "vitest";
import {
  moneyAccountAddInput,
  moneyAccountKindWord,
  paysOut,
  takesIn,
  type MoneyAccountRow,
} from "./money-accounts";

const row = (money_kind: MoneyAccountRow["money_kind"], is_active = true): MoneyAccountRow =>
  ({ code: "1121", name: "Public Bank", money_kind, is_active });

describe("the money-account rule (0512)", () => {
  it("pays out of cash and banks only, never a holding account", () => {
    expect(paysOut(row("CASH"))).toBe(true);
    expect(paysOut(row("BANK"))).toBe(true);
    expect(paysOut(row("HOLDING"))).toBe(false);
  });

  it("takes money into cash, banks and holding accounts", () => {
    expect(["CASH", "BANK", "HOLDING"].every((k) => takesIn(row(k as MoneyAccountRow["money_kind"])))).toBe(true);
  });

  it("offers nothing that is out of use", () => {
    expect(paysOut(row("BANK", false))).toBe(false);
    expect(takesIn(row("BANK", false))).toBe(false);
  });

  it("adds only a bank or a holding account; cash is 1110 alone", () => {
    expect(moneyAccountAddInput.safeParse({ name: "RHB", kind: "BANK" }).success).toBe(true);
    expect(moneyAccountAddInput.safeParse({ name: "Petty cash", kind: "CASH" }).success).toBe(false);
    expect(moneyAccountAddInput.safeParse({ name: "  ", kind: "BANK" }).success).toBe(false);
  });

  it("never prints a kind key", () => {
    expect(moneyAccountKindWord("HOLDING")).toBe("Online payment");
    expect(moneyAccountKindWord("SAVINGS")).toBe("Not known");
  });
});
