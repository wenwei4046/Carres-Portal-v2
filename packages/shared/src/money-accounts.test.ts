import { describe, expect, it } from "vitest";
import {
  MONEY_ACCOUNT_KIND_WORD,
  moneyAccountAddInput,
  paysOut,
  takesIn,
  settlementBank,
  type CardRouteRow,
  type MoneyAccountRow,
} from "./money-accounts";

const row = (money_kind: MoneyAccountRow["money_kind"], is_active = true): MoneyAccountRow =>
  ({ code: "1121", name: "Public Bank", money_kind, is_active, is_card_account: false });

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

  it("says each kind in the standard's pay-method words, never the key", () => {
    expect(MONEY_ACCOUNT_KIND_WORD).toEqual({ CASH: "Cash", BANK: "Bank transfer", HOLDING: "Online payment" });
  });
});

describe("settlementBank (0541)", () => {
  const routes: CardRouteRow[] = [
    { holding_code: "1131", channel: "dealer", bank_code: "1124" },
    { holding_code: "1131", channel: "showroom", bank_code: "1123" },
    { holding_code: "1134", channel: "showroom", bank_code: "1123" },
  ];
  it("follows the route for the place chosen", () => {
    expect(settlementBank(routes, "1131", "dealer")).toBe("1124");
    expect(settlementBank(routes, "1131", "showroom")).toBe("1123");
  });
  it("without a place, defaults only when every route agrees", () => {
    expect(settlementBank(routes, "1131")).toBeUndefined();
    expect(settlementBank(routes, "1134")).toBe("1123");
    expect(settlementBank(routes, "1134", "dealer")).toBeUndefined();
    expect(settlementBank(routes, undefined)).toBeUndefined();
  });
});
