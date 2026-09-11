import { describe, expect, it } from "vitest";
import { contentWidthOf } from "./SalesOrderWorkspace";

/**
 * THE DOCUMENT PANE'S USABLE WIDTH — the one number the clipping came from.
 *
 * The pages were scaled to `pane.clientWidth`, which INCLUDES the pane's own
 * horizontal padding. So every page was drawn wider than the box it had to sit
 * in, by exactly the padding, at EVERY width — not only narrow ones. The live
 * pane carries `px-4`, so that was 32px of the document cut off on every order.
 *
 * jsdom reports no layout, so `clientWidth` is stubbed: what is under test is
 * the arithmetic, which is the part that was wrong.
 */
function pane(clientWidth: number, padL: string, padR: string): HTMLElement {
  const el = document.createElement("div");
  el.style.paddingLeft = padL;
  el.style.paddingRight = padR;
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
  document.body.appendChild(el);
  return el;
}

describe("the document pane's usable width", () => {
  it("subtracts the pane's own padding — the 32px that used to be clipped", () => {
    expect(contentWidthOf(pane(639, "16px", "16px"))).toBe(607);
  });

  it("handles uneven padding", () => {
    expect(contentWidthOf(pane(500, "24px", "8px"))).toBe(468);
  });

  it("reads a pane with no padding as its whole box", () => {
    expect(contentWidthOf(pane(800, "", ""))).toBe(800);
  });

  it("never returns a negative width when padding exceeds the box", () => {
    /* A hidden pane reports clientWidth 0 while its padding still computes —
       measured in a background tab, where the page collapsed to nothing. */
    expect(contentWidthOf(pane(0, "16px", "16px"))).toBe(0);
    expect(contentWidthOf(pane(20, "16px", "16px"))).toBe(0);
  });
});
