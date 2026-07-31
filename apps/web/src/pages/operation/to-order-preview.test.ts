import { describe, expect, it } from "vitest";
import type { ToOrderProposal } from "@carres/shared";
import {
  effectiveDocs,
  initialState,
  moveBuild,
  setBuildsIncluded,
  splitOut,
  toggleBuild,
} from "./to-order-preview";

/**
 * The `excluded` half of the arrangement — ☑ `Included in this Purchase
 * Order` (Loo, 2026-07-31). What these pin: membership is not removal (the
 * build stays on its document), the WIRE only ever sees shapes the server has
 * always accepted, and rearranging a document never loses the ticks.
 */

const proposal = {
  key: "s1::bedframe",
  supplierId: "s1",
  supplierName: "Ohana",
  category: "bedframe",
  label: "Ohana · Bedframe",
  orderBy: "2026-07-30",
  poCount: 1,
  blocked: null,
  productionDays: 7,
  rows: [
    {
      orderId: "o1",
      so: 1300,
      customer: "wong",
      qty: 3,
      summary: "Cody · 3 Bedframes",
      stockReady: "2026-07-29",
      builds: [
        {
          key: "b1", title: "Cody", spec: "1 Module", codes: "CODY-Q",
          qty: 3, size: "Queen", model: "Cody", ordinal: null,
          lines: [{ lineId: "b1-l1", sku: "CODY-Q", qty: 3, cost: null }],
        },
      ],
    },
    {
      orderId: "o2",
      so: 1301,
      customer: "lim",
      qty: 1,
      summary: "Cody · 1 Bedframe",
      stockReady: "2026-07-30",
      builds: [
        {
          key: "b2", title: "Cody", spec: "1 Module", codes: "CODY-K",
          qty: 1, size: "King", model: "Cody", ordinal: null,
          lines: [{ lineId: "b2-l1", sku: "CODY-K", qty: 1, cost: null }],
        },
      ],
    },
  ],
} as unknown as ToOrderProposal;

function buildKeys(p: ToOrderProposal) {
  return effectiveDocs(initialState(p)).flatMap((d) => d.buildKeys);
}

describe("Included in this Purchase Order", () => {
  it("an untick keeps the build ON its document — only the wire leaves it out", () => {
    const st0 = initialState(proposal);
    const [k1] = buildKeys(proposal);
    const st = toggleBuild(st0, k1!);

    // MEMBERSHIP, not removal: the document still holds the build, so the
    // row stays on screen and can be re-ticked where it was.
    expect(st.docs[0]!.buildKeys).toContain(k1);
    // The wire's shape drops it.
    expect(effectiveDocs(st)[0]!.buildKeys).not.toContain(k1);
    // Ticking back restores exactly the initial wire shape.
    expect(effectiveDocs(toggleBuild(st, k1!))).toEqual(effectiveDocs(st0));
  });

  it("a fully-unticked document goes out WHOLE as include:false — a known shape, not a new one", () => {
    const st0 = initialState(proposal);
    const keys = st0.docs[0]!.buildKeys;
    const st = setBuildsIncluded(st0, keys, false);

    const wire = effectiveDocs(st)[0]!;
    expect(wire.include).toBe(false);
    // Keys intact — the server has always accepted an include:false document.
    expect(wire.buildKeys).toEqual(keys);
  });

  it("the header ☑ sets exactly the named builds and leaves other ticks alone", () => {
    const st0 = initialState(proposal);
    const [k1, k2] = buildKeys(proposal);
    // k2 was already unticked by hand; the header re-ticks only k1's set.
    const st = setBuildsIncluded(toggleBuild(st0, k2!), [k1!], true);
    expect(st.excluded).toEqual([k2]);
  });

  it("rearranging never loses the ticks — a moved build carries its ☑ with it", () => {
    const st0 = initialState(proposal);
    const [k1, k2] = buildKeys(proposal);
    const st = moveBuild(splitOut(toggleBuild(st0, k1!), [k2!]), k1!, "d2");

    // k1 is excluded AND now lives on d2 — the wire shows d2 without it.
    const d2 = effectiveDocs(st).find((d) => d.key === "d2")!;
    expect(d2.buildKeys).toEqual([k2]);
    expect(st.excluded).toEqual([k1]);
  });
});
