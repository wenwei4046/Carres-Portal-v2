import { describe, it, expect, beforeEach } from "vitest";
import type { DraftLine } from "../new-order/draft";
import {
  deleteQuote,
  listQuotes,
  quoteAgeLabel,
  quoteToDraftLines,
  sanitizeQuoteLines,
  saveQuote,
} from "./quotes";

function line(over: Partial<DraftLine> = {}): DraftLine {
  return {
    localId: "l1",
    sku: "CLOUD-QUEEN",
    qty: 1,
    attrs: null,
    unitPrice: 2890,
    label: "Carres Cloud · Queen",
    ...over,
  };
}

beforeEach(() => localStorage.clear());

describe("sanitizeQuoteLines", () => {
  it("drops claimed PWP reward + server-derived free-gift lines", () => {
    const out = sanitizeQuoteLines([
      line(),
      line({ localId: "l2", attrs: { pwp: { code: "X" } }, unitPrice: 300 }),
      line({ localId: "l3", attrs: { free_gift: true }, unitPrice: 0 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].sku).toBe("CLOUD-QUEEN");
  });

  it("strips free_item marks and restores the parked original price", () => {
    const out = sanitizeQuoteLines([
      line({ attrs: { free_item: "camp-1", color: "Oak" }, unitPrice: 0, origUnitPrice: 500 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].unitPrice).toBe(500);
    expect(out[0].attrs).toEqual({ color: "Oak" });
    expect("origUnitPrice" in out[0]).toBe(false);
  });
});

describe("save / list / delete / load", () => {
  it("round-trips a quote with computed total, newest first, and regenerates localIds on load", () => {
    const q1 = saveQuote({ label: "Tan", phone: "0123", lines: [line()], addons: [] });
    saveQuote({ label: "", phone: "", lines: [line({ qty: 2 })], addons: [] });

    const all = listQuotes();
    expect(all).toHaveLength(2);
    expect(all[0].label).toBe("Unnamed quote"); // newest first
    expect(all[0].total).toBe(2 * 2890);
    expect(all[1].id).toBe(q1.id);

    const loaded = quoteToDraftLines(all[1]);
    expect(loaded[0].sku).toBe("CLOUD-QUEEN");
    expect(loaded[0].localId).not.toBe("l1");

    deleteQuote(q1.id);
    expect(listQuotes()).toHaveLength(1);
  });
});

describe("quoteAgeLabel", () => {
  const now = new Date("2026-07-03T12:00:00Z");
  it("labels minutes, hours, days", () => {
    expect(quoteAgeLabel("2026-07-03T11:59:30Z", now)).toBe("just now");
    expect(quoteAgeLabel("2026-07-03T11:30:00Z", now)).toBe("30 min ago");
    expect(quoteAgeLabel("2026-07-03T09:00:00Z", now)).toBe("3 h ago");
    expect(quoteAgeLabel("2026-07-01T09:00:00Z", now)).toBe("2 d ago");
  });
});
