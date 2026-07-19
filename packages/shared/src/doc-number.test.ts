import { describe, it, expect } from "vitest";
import { docNumber, docTail, amendmentSuffix } from "./doc-number";

const ORDER_A = "a1b2c3d4-1111-2222-3333-444455556666";
const ORDER_B = "ffffffff-9999-8888-7777-666655554444";

describe("docTail", () => {
  it("is deterministic — same seed → same tail", () => {
    expect(docTail(ORDER_A)).toBe(docTail(ORDER_A));
  });

  it("returns exactly `digits` characters, zero-padded", () => {
    expect(docTail(ORDER_A, 4)).toMatch(/^\d{4}$/);
    expect(docTail(ORDER_B, 3)).toMatch(/^\d{3}$/);
    // a seed that hashes small still pads to width
    for (let i = 0; i < 200; i++) {
      expect(docTail(`seed-${i}`, 4)).toMatch(/^\d{4}$/);
    }
  });

  it("differs across different seeds (not a constant)", () => {
    expect(docTail(ORDER_A)).not.toBe(docTail(ORDER_B));
  });

  it("is not a counter — output order is independent of input order", () => {
    // sequential seeds must NOT produce sequential tails (volume privacy)
    const t0 = Number(docTail("order-1000"));
    const t1 = Number(docTail("order-1001"));
    expect(Math.abs(t1 - t0)).toBeGreaterThan(1);
  });
});

describe("amendmentSuffix", () => {
  it("original (0 / negative) has no suffix", () => {
    expect(amendmentSuffix(0)).toBe("");
    expect(amendmentSuffix(-3)).toBe("");
  });

  it("1 → -B, 2 → -C, 25 → -Z", () => {
    expect(amendmentSuffix(1)).toBe("-B");
    expect(amendmentSuffix(2)).toBe("-C");
    expect(amendmentSuffix(25)).toBe("-Z");
  });

  it("caps at -Z beyond 25", () => {
    expect(amendmentSuffix(99)).toBe("-Z");
  });
});

describe("docNumber", () => {
  it("builds PREFIX-DDMMYY-NNNN", () => {
    const n = docNumber({ prefix: "LN", date: "2026-07-19", seed: ORDER_A });
    expect(n).toMatch(/^LN-190726-\d{4}$/);
  });

  it("formats the date as DDMMYY, timezone-proof (parses ISO text)", () => {
    const n = docNumber({ prefix: "RC", date: "2026-01-05T23:30:00Z", seed: ORDER_A });
    expect(n.startsWith("RC-050126-")).toBe(true);
  });

  it("all documents of ONE order share the tail (per-order grouping)", () => {
    const ln = docNumber({ prefix: "LN", date: "2026-07-19", seed: ORDER_A });
    const rc = docNumber({ prefix: "RC", date: "2026-07-19", seed: ORDER_A });
    const tail = (s: string) => s.split("-")[2];
    expect(tail(ln)).toBe(tail(rc));
  });

  it("different orders get different tails", () => {
    const a = docNumber({ prefix: "LN", date: "2026-07-19", seed: ORDER_A });
    const b = docNumber({ prefix: "LN", date: "2026-07-19", seed: ORDER_B });
    expect(a).not.toBe(b);
  });

  it("is stable on reprint — identical inputs, identical number", () => {
    const first = docNumber({ prefix: "LN", date: "2026-07-19", seed: ORDER_A });
    const reprint = docNumber({ prefix: "LN", date: "2026-07-19", seed: ORDER_A });
    expect(reprint).toBe(first);
  });

  it("an amendment adds -B, keeping the base number", () => {
    const base = docNumber({ prefix: "LN", date: "2026-07-19", seed: ORDER_A });
    const amended = docNumber({ prefix: "LN", date: "2026-07-19", seed: ORDER_A, revision: 1 });
    expect(amended).toBe(`${base}-B`);
  });

  it("honours a custom digit width", () => {
    const n = docNumber({ prefix: "LN", date: "2026-07-19", seed: ORDER_A, digits: 3 });
    expect(n).toMatch(/^LN-190726-\d{3}$/);
  });

  it("malformed date degrades to 000000 rather than throwing", () => {
    const n = docNumber({ prefix: "LN", date: "not-a-date", seed: ORDER_A });
    expect(n).toMatch(/^LN-000000-\d{4}$/);
  });
});
