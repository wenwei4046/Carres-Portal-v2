import { describe, it, expect } from "vitest";
import {
  netReservedToOrder,
  orderStockRef,
  reservedUnitsByRefAndKey,
  suggestReadyStockTake,
} from "./ready-stock-take";

/**
 * Card P10 — ready stock is SUGGESTED; the human decides whether to take it.
 *
 * The two properties every assertion here is about:
 *   · a suggestion is made of WHOLE register records, so it is always exactly
 *     executable and nobody types a quantity;
 *   · units already reserved to an order are that order's SUPPLY, so a take
 *     makes the row's quantity fall without a second store of "how much came
 *     off the shelf".
 */

describe("suggestReadyStockTake — the system suggests", () => {
  it("suggests the whole shelf when the row needs more than it holds", () => {
    const s = suggestReadyStockTake(5, [
      { id: "a", qty: 1 },
      { id: "b", qty: 1 },
    ]);
    expect(s).toEqual({ take: 2, available: 2, itemIds: ["a", "b"] });
  });

  it("stops at what the row needs — never suggests buying less than nothing", () => {
    const s = suggestReadyStockTake(2, [
      { id: "a", qty: 1 },
      { id: "b", qty: 1 },
      { id: "c", qty: 1 },
    ]);
    // `available` still states the whole shelf: the operator is owed both
    // numbers, not the smaller one alone.
    expect(s).toEqual({ take: 2, available: 3, itemIds: ["a", "b"] });
  });

  it("NEVER splits a bulk record — a 2-unit record cannot satisfy a need of 1", () => {
    // 0292's door flips a WHOLE record and its ledger row records that
    // record's qty. Suggesting `1` here would DRAW 2. Live proof this is not
    // theoretical: SONIC-L1202S-Q and DIVAN ONLY (K) are single records of 2.
    expect(suggestReadyStockTake(1, [{ id: "bulk", qty: 2 }])).toBeNull();
  });

  it("skips a record too big for what is left rather than ending the walk", () => {
    // A 2-unit record must not hide a 1-unit record behind it.
    const s = suggestReadyStockTake(1, [
      { id: "big", qty: 2 },
      { id: "small", qty: 1 },
    ]);
    expect(s).toEqual({ take: 1, available: 3, itemIds: ["small"] });
  });

  it("takes records in the order given — FIFO is the caller's, and it is kept", () => {
    const s = suggestReadyStockTake(2, [
      { id: "oldest", qty: 1 },
      { id: "newest", qty: 1 },
    ]);
    expect(s?.itemIds).toEqual(["oldest", "newest"]);
  });

  it("returns null on an empty shelf, so there is no zero to render", () => {
    expect(suggestReadyStockTake(5, [])).toBeNull();
    expect(suggestReadyStockTake(0, [{ id: "a", qty: 1 }])).toBeNull();
  });

  it("a bulk record that fits exactly is one take of its own size", () => {
    const s = suggestReadyStockTake(2, [{ id: "bulk", qty: 2 }]);
    expect(s).toEqual({ take: 2, available: 2, itemIds: ["bulk"] });
  });
});

describe("netReservedToOrder — units already reserved to an order are its supply", () => {
  const key = (so: number, sku: string) => `${orderStockRef(so)}::${sku}`;

  it("reduces the line by what is already committed to that order", () => {
    const reserved = reservedUnitsByRefAndKey([
      { ref: "SO-1234", sku: "H1401S-Q", qty: 1 },
      { ref: "SO-1234", sku: "H1401S-Q", qty: 1 },
    ]);
    const out = netReservedToOrder(
      [{ lineId: "l1", sku: "H1401S-Q", qty: 5, ref: "SO-1234" }],
      reserved,
    );
    expect(out.get("l1")).toBe(3);
  });

  it("matches through the size WORD — `-Q` and `Queen` are one product", () => {
    const reserved = reservedUnitsByRefAndKey([
      { ref: "SO-5", sku: "Haven SoftCloud H1401S Queen", qty: 1 },
    ]);
    const out = netReservedToOrder(
      [{ lineId: "l1", sku: "Haven SoftCloud-H1401S-Q", qty: 2, ref: "SO-5" }],
      reserved,
    );
    expect(out.get("l1")).toBe(1);
  });

  /**
   * THE FINDING THIS CARD MEASURED, PINNED SO NOBODY "FIXES" IT BY GUESSING.
   *
   * `stockMatchKey` keeps the MODEL NAME in the key, so the catalog code
   * `H1401S-Q` and the Klang sheet's own `Haven SoftCloud-H1401S-Q` are two
   * different products to it — measured on production 2026-08-04: 0 of 31
   * live demand SKUs match any of the 87 free units, because those units are
   * the June sheet import and demand now carries catalog codes.
   *
   * That is NOT netted around with a second key rule. `stockMatchKey` is
   * Jess's locked 2026-07-01 rule and the readiness badge, the stock picker
   * and the booking gate all read it; a second rule here would be a second
   * answer to one question. The 42 units the PORTAL itself minted carry
   * catalog codes (`TRION-K`), so this heals as soon as portal-received goods
   * go free — and the database starts clean at go-live.
   */
  it("does NOT match a catalog code to a marketing name — measured, not assumed", () => {
    const reserved = reservedUnitsByRefAndKey([
      { ref: "SO-1234", sku: "Haven SoftCloud-H1401S-Q", qty: 1 },
    ]);
    const out = netReservedToOrder(
      [{ lineId: "l1", sku: "H1401S-Q", qty: 5, ref: "SO-1234" }],
      reserved,
    );
    expect(out.get("l1")).toBe(5);
  });

  it("never lets one order's units satisfy another order's line", () => {
    const reserved = reservedUnitsByRefAndKey([
      { ref: "SO-1", sku: "TRION-K", qty: 2 },
    ]);
    const out = netReservedToOrder(
      [{ lineId: "mine", sku: "TRION-K", qty: 2, ref: "SO-2" }],
      reserved,
    );
    expect(out.get("mine")).toBe(2);
  });

  it("drains the pool across two lines of one order — the same units cannot be claimed twice", () => {
    const reserved = reservedUnitsByRefAndKey([
      { ref: "SO-7", sku: "TRION-K", qty: 2 },
    ]);
    const out = netReservedToOrder(
      [
        { lineId: "a", sku: "TRION-K", qty: 1, ref: "SO-7" },
        { lineId: "b", sku: "TRION-K", qty: 3, ref: "SO-7" },
      ],
      reserved,
    );
    expect(out.get("a")).toBe(0);
    expect(out.get("b")).toBe(2);
  });

  it("never goes below zero — over-reservation is not credited elsewhere", () => {
    const reserved = reservedUnitsByRefAndKey([
      { ref: "SO-9", sku: "CODY-K", qty: 9 },
    ]);
    const out = netReservedToOrder(
      [
        { lineId: "a", sku: "CODY-K", qty: 1, ref: "SO-9" },
        { lineId: "b", sku: "FENRIR-K", qty: 4, ref: "SO-9" },
      ],
      reserved,
    );
    expect(out.get("a")).toBe(0);
    // A different product; the surplus of CODY units does not touch it.
    expect(out.get("b")).toBe(4);
  });

  it("a line with no reference is untouched — a ready stock demand nets nothing", () => {
    const reserved = reservedUnitsByRefAndKey([
      { ref: "SO-1", sku: "SONIC-S", qty: 2 },
    ]);
    const out = netReservedToOrder(
      [{ lineId: "demand:x", sku: "SONIC-S", qty: 5, ref: null }],
      reserved,
    );
    expect(out.get("demand:x")).toBe(5);
  });

  it("the reference is the one the drawer's picker has written since 0137", () => {
    expect(orderStockRef(1234)).toBe("SO-1234");
    expect([...reservedUnitsByRefAndKey([
      { ref: "SO-1234", sku: "TRION-K", qty: 1 },
    ]).keys()]).toEqual([key(1234, "trion|K")]);
  });
});
