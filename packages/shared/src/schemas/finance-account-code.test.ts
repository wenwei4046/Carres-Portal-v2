import { describe, expect, it } from "vitest";
import { ledgerAccountCodeInput, ledgerAccountCodeShape, ledgerAccountUpdateInput, LEDGER_ACCOUNT_CODE_MESSAGE } from "./finance";
import { moneyMoveInput } from "../money-moves";
import { cardRouteInput } from "../money-accounts";
import { paymentMethodSaveInput } from "./order-payments";

/** Every account number in the AutoCount chart the owner is moving to (305
 *  numbers, 121 with a letter), as the file lists them. */
const AUTOCOUNT = [
  "100-0000 150-0000 151-0000 200-0000 200-2000 200-2005 200-3000 200-3005 200-4000 200-4005 210-0000",
  "300-0000 305-0000 310-0000 310-1000 310-2000 310-3000 310-4000 320-0000 330-0000 340-0000 340-0001",
  "350-0000 350-0010 350-0020 350-0030 400-0000 400-1000 405-0000 410-0000 410-0010 410-0011 410-0012",
  "410-0013 410-0014 410-0015 410-0016 410-0017 410-0020 410-0021 410-0022 410-0023 410-0024 410-0025",
  "410-0026 410-0027 410-0030 410-0031 410-0032 410-0033 410-0034 410-0035 410-0036 410-0037 410-0040",
  "410-0041 410-0042 410-0043 410-0044 410-0045 410-0046 410-0047 410-0050 410-0051 410-0052 410-0053",
  "410-0054 410-0055 410-0056 410-0060 410-0061 410-0062 410-0063 410-0070 410-0071 410-0072 410-0073",
  "410-0074 410-0075 410-0076 411-0000 412-0000 413-0000 414-0000 415-0000 416-0000 420-0000 420-1000",
  "430-0000 440-0000 450-0000 450-0010 450-0020 460-0000 460-0010 470-0000 490-0000 500-0000 500-1000",
  "510-0000 520-0000 530-0000 540-0000 550-0000 560-0000 570-0000 580-0000 600-0000 610-0000 610-0020",
  "610-0021 610-0022 610-0023 610-0024 610-0025 610-0026 610-0027 610-0028 610-0029 610-0030 610-0031",
  "610-0032 610-0033 610-0034 610-0035 610-0036 610-0037 610-0038 610-0039 610-0040 610-0041 610-0042",
  "610-0043 610-0044 610-0045 610-0046 610-0047 610-0048 610-0049 610-0050 610-0051 610-0052 610-0053",
  "610-0054 610-0055 610-0056 610-0057 610-0058 610-0059 610-0060 610-0061 610-0062 610-0063 610-0064",
  "610-0065 610-0066 610-0067 610-0068 610-0069 610-0070 610-0071 610-0072 610-0073 610-0074 610-0075",
  "610-0076 610-0077 610-0078 610-0079 610-0080 612-0000 615-0000 620-0000 630-0000 900-A001 900-A002",
  "900-A003 900-A004 900-A005 900-A006 900-A007 900-A008 900-A009 900-A010 900-A011 900-B001 900-C001",
  "900-C002 900-C003 900-C004 900-C005 900-C006 900-C007 900-D002 900-D003 900-E001 900-E002 900-E003",
  "900-E004 900-E005 900-E006 900-E007 900-E008 900-E009 900-E010 900-E011 900-E012 900-E013 900-E014",
  "900-E015 900-E016 900-E017 900-E018 900-E020 900-E021 900-E022 900-E023 900-E024 900-E025 900-E026",
  "900-E027 900-E028 900-E029 900-E030 900-G001 900-H001 900-H002 900-H003 900-H004 900-H005 900-H006",
  "900-H007 900-I001 900-L001 900-L002 900-L003 900-L004 900-L005 900-M002 900-M003 900-P001 900-P002",
  "900-P003 900-P004 900-P005 900-P006 900-P007 900-P008 900-P009 900-P010 900-P011 900-P012 900-R001",
  "900-R002 900-R003 900-R004 900-R005 900-S002 900-S003 900-S004 900-S005 900-S006 900-S007 900-S008",
  "900-S009 900-S010 900-S011 900-S012 900-S013 900-S014 900-S015 900-S016 900-S017 900-S018 900-S019",
  "900-S020 900-S021 900-S022 900-S023 900-T001 900-T002 900-T003 900-T004 900-T005 900-T006 900-T007",
  "900-U001 900-U002 900-U003 900-U004 900-U005 900-W001 900-W002 900-W003 900-W004 902-0000 903-0000",
  "904-0000 907-0000 908-0000 909-0000 916-0000 917-0000 918-0000 950-0000",
].join(" ").split(" ");

describe("an account number (0570)", () => {
  it("takes every number in the AutoCount chart, as typed and in lower case", () => {
    expect(AUTOCOUNT).toHaveLength(305);
    expect(AUTOCOUNT.filter((c) => /[A-Z]/.test(c))).toHaveLength(121);
    for (const code of AUTOCOUNT) {
      expect(ledgerAccountCodeShape.test(code), code).toBe(true);
      expect(ledgerAccountCodeInput.parse(code.toLowerCase())).toBe(code);
    }
  });

  it("still takes four digits and the all-digit dashed form", () => {
    expect(ledgerAccountCodeInput.parse(" 1210 ")).toBe("1210");
    expect(ledgerAccountCodeInput.parse("100-0001")).toBe("100-0001");
  });

  it("stores 900-a001 as 900-A001", () => {
    expect(ledgerAccountUpdateInput.parse({ name: "Advertisement", code: "900-a001" })).toEqual({ name: "Advertisement", code: "900-A001" });
  });

  it.each([
    "900-AA01", "90-A001", "900-A0011", "900-A00", "9000-A001", "900A001", "900_A001", "12345", "123", "",
    "900-É001", "900-ı001", "900-İ001", "900-ſ001", "900-Ａ001",
    "٩٠٠-A001", "９０００", "1２34",
  ])("refuses %j with the sentence", (code) => {
    const r = ledgerAccountCodeInput.safeParse(code);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(LEDGER_ACCOUNT_CODE_MESSAGE);
    expect(ledgerAccountCodeShape.test(code)).toBe(false);
  });

  it("the stored shape is capitals only: a path or a pick in lower case is not a number", () => {
    expect(ledgerAccountCodeShape.test("900-a001")).toBe(false);
  });

  it("the money doors take a letter code", () => {
    expect(moneyMoveInput.safeParse({
      kind: "TRANSFER", move_date: "2026-09-22", from_account_code: "310-2000", to_account_code: "311-G001",
      amount: 10, fee: 0, reference: null, note: null, idempotency_key: "aaaaaaaa-0000-4000-8000-000000000001",
    }).success).toBe(true);
    expect(cardRouteInput.safeParse({ holding_code: "311-G001", bank_code: "310-2000", channel: "showroom" }).success).toBe(true);
    expect(paymentMethodSaveInput.safeParse({ label: "Cash", accountCode: "320-0000" }).success).toBe(true);
  });
});
