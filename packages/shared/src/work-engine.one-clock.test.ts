/**
 * ONE CLOCK (owner decision 2026-09-25, Workspace §5.9 gap 6): the Work feed's
 * `confirm_delivery_date` is due on the Logistics card's `2 working days
 * before` check — never on a second `chase` count. Production SO-1222 showed
 * the card on THU 16 Jul while Logistics said "was due 17 Jul".
 */
import { describe, expect, it } from "vitest";
import { logisticsCardModel, logisticsCheckDueIso } from "./logistics-card";
import { workItemsForOrder } from "./work-engine";

const holidays: string[] = [];

function dueOfConfirm(promised: string, scheduled: string | null): string | null {
  const [item] = workItemsForOrder(
    [{ key: "confirm_delivery_date", track: "delivery", tone: "warning" }],
    {
      orderId: "o-1", so: 1222, picName: null, picUserId: null,
      promisedDateIso: promised, confirmedDateIso: scheduled,
      deliveredAtIso: null, delayDetectedAtIso: null, delayDecisionAtIso: null,
      loanOutstanding: false, proofReviewPending: false, dutyResolutions: {},
    } as never,
    "2026-07-10",
    { holidays },
  );
  return item?.dueIso ?? null;
}

describe("the Work item and the Logistics card name the same day", () => {
  it("requested Mon 20 Jul → both say Fri 17 Jul (2 delivery working days before)", () => {
    const card = logisticsCardModel({
      todayIso: "2026-07-10", holidays, requestedIso: "2026-07-20", scheduledIso: null, partnerName: "NETS",
      startedIso: "2026-07-01", detailsReceivedIso: null, answer: null, settled: false, dayBeforeGaps: [],
      moneyOwed: null, financeHold: null, spell: (iso) => iso,
    });
    expect(card.rows[1].dueIso).toBe("2026-07-17");
    expect(dueOfConfirm("2026-07-20", null)).toBe("2026-07-17");
    expect(logisticsCheckDueIso("t2", { requestedIso: "2026-07-20", scheduledIso: null, holidays })).toBe("2026-07-17");
  });
});
