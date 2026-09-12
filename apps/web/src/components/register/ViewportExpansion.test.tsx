import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ViewportExpansion } from "./ViewportExpansion";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("fits beside the rendered gutter and updates when the viewport or gutter changes", () => {
  let viewportWidth = 1000;
  let gutter = 80;
  let resize = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => viewportWidth);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { left: this.tagName === "TD" ? gutter : 0 } as DOMRect;
  });
  const { unmount } = render(
    <div><table><tbody><tr><td>
      <ViewportExpansion><span>Goods</span></ViewportExpansion>
    </td></tr></tbody></table></div>,
  );
  const wrapper = screen.getByText("Goods").parentElement;
  expect(wrapper).toHaveStyle({ maxWidth: "920px" });
  act(() => { viewportWidth = 400; gutter = 60; resize(); });
  expect(wrapper).toHaveStyle({ maxWidth: "340px" });
  act(() => { viewportWidth = 1200; window.dispatchEvent(new Event("resize")); });
  expect(wrapper).toHaveStyle({ maxWidth: "1140px" });
  unmount();
  expect(disconnect).toHaveBeenCalled();
});
