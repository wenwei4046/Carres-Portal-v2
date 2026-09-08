import { describe, expect, it } from "vitest";
import {
  COLLECTION_OUTCOME_WORD,
  latestOutcomeOf,
  missedPromise,
  type CollectionOutcomeRow,
} from "./payment-collection-outcome";

function row(over: Partial<CollectionOutcomeRow>): CollectionOutcomeRow {
  return {
    id: over.id ?? "o1", order_id: over.order_id ?? "ord1",
    invoice_id: null, outcome: over.outcome ?? "no_answer",
    promised_date: over.promised_date ?? null, note: null,
    recorded_at: over.recorded_at ?? "2026-09-08T01:00:00Z",
  };
}

describe("the §3 collection outcome", () => {
  it("says the five approved words and nothing else", () => {
    expect(Object.values(COLLECTION_OUTCOME_WORD)).toEqual([
      "Customer paid",
      "Customer will pay on a date",
      "Customer needs help",
      "Customer disputes the amount",
      "Customer did not answer",
    ]);
  });
  it("the latest recorded conversation is the current answer", () => {
    const rows = [
      row({ id: "a", outcome: "no_answer", recorded_at: "2026-09-06T01:00:00Z" }),
      row({ id: "b", outcome: "will_pay_on_date", promised_date: "2026-09-10",
        recorded_at: "2026-09-08T01:00:00Z" }),
      row({ id: "c", order_id: "other", outcome: "customer_paid",
        recorded_at: "2026-09-09T01:00:00Z" }),
    ];
    expect(latestOutcomeOf(rows, "ord1")?.id).toBe("b");
    expect(latestOutcomeOf([], "ord1")).toBeNull();
  });
  it("a missed promise is a derived fact: the day passed and money is still owed", () => {
    const promise = row({ outcome: "will_pay_on_date", promised_date: "2026-09-05" });
    expect(missedPromise(promise, "2026-09-08", true)).toBe(true);
    // Paid up — nothing was missed.
    expect(missedPromise(promise, "2026-09-08", false)).toBe(false);
    // The day has not come yet.
    expect(missedPromise(row({ outcome: "will_pay_on_date", promised_date: "2026-09-20" }),
      "2026-09-08", true)).toBe(false);
    // Another result is never a missed promise.
    expect(missedPromise(row({ outcome: "no_answer" }), "2026-09-08", true)).toBe(false);
    expect(missedPromise(null, "2026-09-08", true)).toBe(false);
  });
});
