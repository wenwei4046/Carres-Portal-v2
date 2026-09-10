import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";

/**
 * ONE ORDER, TWO KEYS, AND A PREFIX THAT DOES NOT REACH (YH, 2026-09-01 —
 * "ensure numbers and generated SO are correct").
 *
 * The POS reads an order at `["order", id]` and the office reads the SAME order
 * at `["operation","orders", id]`. React Query matches a key by PREFIX, so
 * invalidating `["orders"]` does not reach the office key — it does not begin
 * with `orders`.
 *
 * `useAddOrderLines` invalidated only `["orders"]`, so adding a service left
 * the Sales Order workspace showing an order without it: the Goods table, the
 * document preview and the Money total all stale until a reload. Its two
 * siblings, `useEditOrderAddon` and `useRemoveOrderAddon`, both invalidate the
 * office key — and both point at `useAddOrderLines` in their comments for the
 * rule it did not follow.
 *
 * This asserts the MATCHING, because the matching is what surprised us and what
 * a future key rename would break in silence. `isInvalidated` is the honest
 * probe: `invalidateQueries` only REFETCHES queries that have an observer, so a
 * refetch assertion would pass or fail for reasons that have nothing to do with
 * whether the key matched.
 */
describe("the office order key is reached by what the add hook invalidates", () => {
  const ID = "00000000-0000-0000-0000-0000000000ff";
  const OFFICE = ["operation", "orders", ID] as const;

  function seeded() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(OFFICE, { lines: [] });
    return qc;
  }

  it("[\"orders\"] does NOT reach the office key — which is why the bug existed", async () => {
    const qc = seeded();
    await qc.invalidateQueries({ queryKey: ["orders"] });
    expect(
      qc.getQueryState(OFFICE)?.isInvalidated,
      "prefix match starts at the FIRST element",
    ).toBe(false);
  });

  it("[\"operation\",\"orders\"] does reach it — the invalidation the add hook now sends", async () => {
    const qc = seeded();
    await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
    expect(
      qc.getQueryState(OFFICE)?.isInvalidated,
      "the office surface is refreshed after a service is added",
    ).toBe(true);
  });
});
