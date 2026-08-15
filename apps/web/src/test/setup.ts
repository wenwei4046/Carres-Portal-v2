import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup, configure } from "@testing-library/react";

/* ---------------------------------------------------------------------------
 * The async wait budget.
 *
 * Testing Library's `waitFor` / `findBy*` default to ONE second. Measured
 * 2026-08-15 on clean `origin/main`: under `pnpm test`, where the web, api and
 * shared suites run at once, a handful of the heaviest page renders land
 * between 1.3s and 1.9s and time out — a DIFFERENT one on each run, which is
 * the signature of a load-induced flake rather than a broken assertion. The
 * same tests pass every time in isolation.
 *
 * That made `pnpm test` — the CI gate itself — fail at random on code nobody
 * had touched. The budget is not what any test is asserting, so raising it
 * costs nothing and removes the randomness. A test that is genuinely broken
 * still fails; it just takes longer to say so.
 * ------------------------------------------------------------------------- */
configure({ asyncUtilTimeout: 5000 });

/* ---------------------------------------------------------------------------
 * jsdom gaps that Radix primitives depend on (card D0.5b).
 *
 * Radix reads element geometry and pointer capture to position and dismiss its
 * overlays. jsdom implements none of it, so a Modal or a Select throws before
 * a single assertion runs. Each polyfill is guarded on absence, so a future
 * jsdom that ships the real thing wins, and nothing here changes behaviour for
 * a test that was already passing.
 * ------------------------------------------------------------------------- */

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (typeof globalThis.DOMRect === "undefined") {
  globalThis.DOMRect = class {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
    top = 0;
    left = 0;
    right = 0;
    bottom = 0;
    static fromRect() {
      return new globalThis.DOMRect();
    }
    toJSON() {
      return {};
    }
  } as unknown as typeof DOMRect;
}

if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

afterEach(() => {
  cleanup();
});
