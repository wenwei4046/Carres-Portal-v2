import { describe, expect, it } from "vitest";
import { collectionOwnerResolution, type CollectionOwnerContextRow } from "./payment-collection-owner";

const row = (over: Partial<CollectionOwnerContextRow> = {}): CollectionOwnerContextRow => ({
  order_id: "order", normal_user_id: "original", normal_user_name: "Original",
  acting_user_id: "current", acting_user_name: "Current", is_cover: false,
  cover_user_id: null, cover_user_name: null, cover_ends_on: null,
  source: "assigned", effective_from: null, established_on: null, history: [], ...over,
});
describe("collection current assignment", () => {
  it("reads the current actor even when it is not labelled a cover", () => {
    expect(collectionOwnerResolution(row(), "2026-09-30").actingPerson?.userId).toBe("current");
  });
  it("keeps the replacement when the original has departed", () => {
    expect(collectionOwnerResolution(row({ normal_user_id: null, normal_user_name: null }), "2026-09-30"))
      .toMatchObject({ normalOwner: null, actingPerson: { userId: "current" }, state: "primary" });
  });
  it("does not resurrect the original or stale cover when no current actor resolves", () => {
    expect(collectionOwnerResolution(row({ acting_user_id: null, acting_user_name: null,
      is_cover: true, cover_user_id: "stale", cover_user_name: "Stale" }), "2026-09-30"))
      .toMatchObject({ actingPerson: null, activeCover: null, state: "not_assigned" });
  });
  it("keeps an absent context unassigned", () => {
    expect(collectionOwnerResolution(null, "2026-09-30").state).toBe("not_assigned");
  });
});
