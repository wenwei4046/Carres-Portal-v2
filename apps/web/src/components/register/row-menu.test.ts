import { describe, expect, it, vi } from "vitest";
import { documentRowMenu, ROW_MENU_WORDS } from "./row-menu";

const words = (items: ReturnType<typeof documentRowMenu>) =>
  items.map((i) => (i.divider ? "─" : i.label));

describe("documentRowMenu — one row menu: View · Print (owner 2026-10-05)", () => {
  it("draws View then Print, in that order, with the shared words", () => {
    const items = documentRowMenu({ view: () => {}, print: () => {} });
    expect(words(items)).toEqual(["View", "Print"]);
    expect(ROW_MENU_WORDS).toEqual({ view: "View", print: "Print" });
  });

  it("omits a word the record cannot do — never a dead item", () => {
    expect(words(documentRowMenu({ view: () => {} }))).toEqual(["View"]);
    expect(words(documentRowMenu({ print: () => {} }))).toEqual(["Print"]);
    expect(documentRowMenu({})).toEqual([]);
  });

  it("puts a module's own items after exactly one divider", () => {
    const items = documentRowMenu({
      view: () => {},
      print: () => {},
      more: [{ divider: true }, { label: "Cancel SO", danger: true, onClick: () => {} }, { divider: true }],
    });
    expect(words(items)).toEqual(["View", "Print", "─", "Cancel SO"]);
    expect(items[3]?.danger).toBe(true);
  });

  it("draws no divider when one of the two groups is empty", () => {
    expect(words(documentRowMenu({ more: [{ label: "Open Order Route", onClick: () => {} }] })))
      .toEqual(["Open Order Route"]);
    expect(words(documentRowMenu({ view: () => {}, more: [] }))).toEqual(["View"]);
  });

  it("each word runs its own door", () => {
    const view = vi.fn();
    const print = vi.fn();
    const items = documentRowMenu({ view, print });
    items[0]?.onClick?.();
    expect(view).toHaveBeenCalledTimes(1);
    expect(print).not.toHaveBeenCalled();
    items[1]?.onClick?.();
    expect(print).toHaveBeenCalledTimes(1);
  });
});
