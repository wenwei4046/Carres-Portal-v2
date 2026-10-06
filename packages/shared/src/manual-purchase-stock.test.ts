import { describe, expect, it } from "vitest";
import {
  MANUAL_PURCHASE_NEED_STATUS_WORDS,
  MANUAL_PURCHASE_STOCK_BLOCK_WORDS,
  manualPurchaseLineStockRemaining,
  manualPurchaseNeedStatusOf,
  manualPurchaseStockBlockOf,
  manualPurchaseStockCounts,
  manualPurchaseStockRefusal,
} from "./manual-purchase-stock";
import {
  PO_SAFETY_DAYS_NONE,
  poSafetyDaysOf,
  poSafetyDaysWord,
  tightestPoSafetyDays,
} from "./purchasing-safety-days";

/**
 * ⭐ MANUAL PURCHASE · READY STOCK ALLOCATION — owner ruling 2026-09-18.
 *
 * Every case here is one sentence of the ruling, and several of them REVERSE a
 * sentence this repository used to state as law.
 */
describe("what a Manual Purchase line still has to buy", () => {
  it("is the approved quantity, less what POs took, less the Units saved for it", () => {
    expect(
      manualPurchaseLineStockRemaining({
        qty: 5,
        approvedQty: null,
        issuedQty: 1,
        reservedQty: 2,
      }),
    ).toBe(2);
  });

  it("the approver's cut REPLACES the ask — it never adds to it", () => {
    expect(
      manualPurchaseLineStockRemaining({
        qty: 5,
        approvedQty: 3,
        issuedQty: 0,
        reservedQty: 1,
      }),
    ).toBe(2);
  });

  it("never goes below zero, however much has been taken", () => {
    expect(
      manualPurchaseLineStockRemaining({
        qty: 2,
        approvedQty: null,
        issuedQty: 2,
        reservedQty: 2,
      }),
    ).toBe(0);
  });

  it("a line nobody is going ahead with asks for nothing", () => {
    expect(
      manualPurchaseLineStockRemaining({
        qty: 9,
        approvedQty: null,
        issuedQty: 0,
        reservedQty: 0,
        cancelled: true,
      }),
    ).toBe(0);
  });
});

describe("whether a line may take a stock choice", () => {
  const base = {
    approved: true,
    intent: "concrete_need" as const,
    hasReference: true,
    cancelled: false,
    remainingQty: 2,
    reservedQty: 0,
  };

  it("an approved CONCRETE NEED with quantity left may choose", () => {
    expect(manualPurchaseStockBlockOf(base)).toBeNull();
  });

  it("⭐ APPROVAL IS ASKED FIRST — an unapproved request may not save, whatever its intent", () => {
    expect(manualPurchaseStockBlockOf({ ...base, approved: false })).toBe("not_approved");
    expect(
      manualPurchaseStockBlockOf({ ...base, approved: false, intent: "additional_stock" }),
    ).toBe("not_approved");
  });

  it("⛔ ADDITIONAL REPLENISHMENT IS READ-ONLY — the shelf never reduces an ask for extra", () => {
    expect(manualPurchaseStockBlockOf({ ...base, intent: "additional_stock" })).toBe(
      "additional_stock",
    );
    expect(MANUAL_PURCHASE_STOCK_BLOCK_WORDS.additional_stock).toBe(
      "This purchase buys extra stock. What is on the shelf does not reduce it.",
    );
  });

  it("⛔ AN UNRECORDED INTENT IS ITS OWN STATE — never guessed into either answer", () => {
    expect(manualPurchaseStockBlockOf({ ...base, intent: null })).toBe("intent_not_recorded");
  });

  it("a request with no MPR No has nothing to commit a Unit to", () => {
    expect(manualPurchaseStockBlockOf({ ...base, hasReference: false })).toBe(
      "request_has_no_number",
    );
  });

  it("a line with nothing left to buy and nothing saved is finished", () => {
    expect(manualPurchaseStockBlockOf({ ...base, remainingQty: 0 })).toBe(
      "nothing_left_to_buy",
    );
  });

  it("⭐ BUT A LINE THAT HOLDS UNITS STAYS REACHABLE AT ZERO REMAINING", () => {
    /* The operator's own save is what took the remainder to 0. Blocking here
       would trap them behind a number they created and remove the only journey
       that takes the choice back. */
    expect(
      manualPurchaseStockBlockOf({ ...base, remainingQty: 0, reservedQty: 2 }),
    ).toBeNull();
  });

  it("a cancelled line is answered by nothing", () => {
    expect(manualPurchaseStockBlockOf({ ...base, cancelled: true })).toBe(
      "line_not_going_ahead",
    );
  });
});

describe("the purchase need is not the approval state", () => {
  it("`Need PO` while the request waits for a decision is CORRECT", () => {
    expect(
      manualPurchaseNeedStatusOf({ known: true, remainingQty: 3, terminal: false }),
    ).toBe("need_po");
    expect(MANUAL_PURCHASE_NEED_STATUS_WORDS.need_po).toBe("Need PO");
  });

  it("a terminal request needs no PO whatever its quantity", () => {
    expect(
      manualPurchaseNeedStatusOf({ known: true, remainingQty: 9, terminal: true }),
    ).toBe("no_po_needed");
  });

  it("⛔ UNKNOWN COVERAGE IS NEITHER ANSWER — never guessed to zero", () => {
    expect(
      manualPurchaseNeedStatusOf({ known: false, remainingQty: 0, terminal: false }),
    ).toBeNull();
  });
});

describe("the two counts stay two counts", () => {
  it("prints available and reserved on their own lines", () => {
    expect(manualPurchaseStockCounts({ availableQty: 3, reservedQty: 1 })).toEqual({
      available: "3 available",
      reserved: "1 reserved",
    });
  });

  it("nothing reserved has no second line — a `0 reserved` states nothing", () => {
    expect(manualPurchaseStockCounts({ availableQty: 0, reservedQty: 0 })).toEqual({
      available: "0 available",
      reserved: null,
    });
  });
});

describe("the refusals speak the operator's words", () => {
  it("names the intent refusal rather than a generic one", () => {
    expect(manualPurchaseStockRefusal("request_not_a_concrete_need")).toEqual({
      wrong:
        "This purchase buys extra stock, so what is on the shelf cannot be saved against it.",
      todo: "Issue a PO for the extra stock instead.",
    });
  });

  it("an unknown code still says what is true — the save is atomic", () => {
    expect(manualPurchaseStockRefusal("something_new").wrong).toBe(
      "The stock selection was not saved.",
    );
  });
});

/**
 * ⭐ `PO Safety Days` — the MARGIN, and four things it is not
 * (Purchasing UI dictionary, 2026-09-18).
 */
describe("PO Safety Days", () => {
  /* 2026-09-18 is a Friday; 2026-09-21 the following Monday. */
  it("counts WORKING days to Order By — not calendar days, and not the date", () => {
    expect(poSafetyDaysOf("2026-09-18", "2026-09-21").days).toBe(1);
    expect(poSafetyDaysOf("2026-09-18", "2026-09-25").days).toBe(5);
  });

  it("a passed Order By is NEGATIVE, so the worst sorts first without a second field", () => {
    const m = poSafetyDaysOf("2026-09-18", "2026-09-15");
    expect(m.passed).toBe(true);
    expect(m.days).toBeLessThan(0);
  });

  it("⛔ AN UNPLANNABLE LINE IS UNKNOWN, NEVER 0 — `0` means order today or be late", () => {
    expect(poSafetyDaysOf("2026-09-18", null)).toEqual(PO_SAFETY_DAYS_NONE);
    expect(poSafetyDaysOf("2026-09-18", null).days).toBeNull();
  });

  it("the parent shows the TIGHTEST outstanding line", () => {
    expect(
      tightestPoSafetyDays("2026-09-18", ["2026-09-25", "2026-09-21"]).days,
    ).toBe(1);
  });

  it("a line the engine could not plan contributes no number, and no zero", () => {
    expect(tightestPoSafetyDays("2026-09-18", [null, "2026-09-25"]).days).toBe(5);
  });

  it("nothing outstanding is BLANK — a finished request is not late and not early", () => {
    expect(tightestPoSafetyDays("2026-09-18", [])).toEqual(PO_SAFETY_DAYS_NONE);
    expect(tightestPoSafetyDays("2026-09-18", [null, null]).days).toBeNull();
  });

  /**
   * ⛔ THE SIGNED NUMBER IS FOR THE SORT, NOT FOR THE CELL. SO Batch's shipped
   * cell already refuses a negative in a days column; the dictionary applies
   * the shared margin display to Manual Purchase, so the refusal is the
   * formatter's, not one page's private habit.
   */
  it("⛔ A DAYS COLUMN NEVER PRINTS A NEGATIVE NUMBER — a passed date is WORDS", () => {
    const passed = poSafetyDaysOf("2026-09-18", "2026-09-15");
    expect(poSafetyDaysWord(passed, "Order date passed")).toBe("Order date passed");
    expect(poSafetyDaysWord(passed, "Order date passed")).not.toMatch(/-\d/);
  });

  it("a real margin is its own number, and the lane's word is not used", () => {
    const live = poSafetyDaysOf("2026-09-18", "2026-09-25");
    expect(poSafetyDaysWord(live, "Order date passed")).toBe("5");
  });

  it("nothing to state is null — the formatter never invents an absence word", () => {
    expect(poSafetyDaysWord(PO_SAFETY_DAYS_NONE, "Order date passed")).toBeNull();
  });

  /**
   * THE SENTENCE IS THE LANE'S, because the FACT is the lane's: SO Batch's
   * negative means supplier production cannot make the customer's date; Manual
   * Purchase's means the day to order by has gone. A caller that passes no word
   * gets null rather than the other lane's claim.
   */
  it("a caller that names no word gets null, never another lane's sentence", () => {
    expect(poSafetyDaysWord(poSafetyDaysOf("2026-09-18", "2026-09-15"))).toBeNull();
    expect(
      poSafetyDaysWord(poSafetyDaysOf("2026-09-18", "2026-09-15"), "Not enough production days"),
    ).toBe("Not enough production days");
  });
});
