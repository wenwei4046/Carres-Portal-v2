/**
 * KEYBOARD ON A VIRTUAL LIST (Listing Standard follow-up, 2026-09-17).
 *
 * A flat register over 25 rows is windowed: only part of the list is in the
 * document. Row-to-row keys must count in the FULL list, scroll the
 * virtualizer to the target and then focus it — a DOM walk stops at the edge
 * of the window, which is the defect these tests exist to catch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { DataGrid, type DataGridColumn } from "./DataGrid";

interface Row { id: string; so: string }
const ROWS: Row[] = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, so: `SO-${2000 + i}` }));
const COLUMNS: DataGridColumn<Row>[] = [{ key: "so", label: "SO No", width: 120, accessor: (r) => r.so }];

const ROW_H = 38;
/** The grid's scroll viewport is the element that directly holds the table. */
const isViewport = (el: HTMLElement) => el.firstElementChild?.tagName === "TABLE";
const VIEWPORT_H = 380; // ten rows

beforeEach(() => {
  /* jsdom has no layout: give the scroll viewport a real height, rows a real
     height, and make scrolling move scrollTop and announce it — the three
     things the virtualizer reads. */
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return isViewport(this) ? VIEWPORT_H : 0;
  });
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return isViewport(this) ? ROWS.length * 40 + 40 : 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return isViewport(this) ? VIEWPORT_H : ROW_H;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const h = isViewport(this) ? VIEWPORT_H : this.tagName === "TR" ? ROW_H : 0;
    return { x: 0, y: 0, top: 0, left: 0, bottom: h, right: 800, width: 800, height: h, toJSON: () => ({}) } as DOMRect;
  });
  Element.prototype.scrollTo = function (this: Element, opts?: ScrollToOptions | number) {
    const top = typeof opts === "object" ? opts.top : undefined;
    if (top != null) (this as HTMLElement).scrollTop = top;
    this.dispatchEvent(new Event("scroll"));
  } as typeof Element.prototype.scrollTo;
});
afterEach(() => vi.restoreAllMocks());

const navRows = () => [...document.querySelectorAll<HTMLTableRowElement>("tr[data-row-nav]")];
const focusedSo = () => (document.activeElement as HTMLElement | null)?.textContent;

function mount() {
  return render(<DataGrid<Row> rows={ROWS} columns={COLUMNS} storageKey={`vk-${Math.random()}`} rowKey={(r) => r.id} />);
}

describe("keyboard on a virtual list", () => {
  it("renders only a window of the 60 rows (the case under test is real)", () => {
    mount();
    expect(navRows().length).toBeGreaterThan(0);
    expect(navRows().length).toBeLessThan(ROWS.length);
  });

  it("End reaches the LAST row of the full list and focuses it", async () => {
    mount();
    const first = navRows()[0]!;
    act(() => first.focus());
    fireEvent.keyDown(first, { key: "End" });
    await waitFor(() => expect(focusedSo()).toBe("SO-2059"));
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    await waitFor(() => expect(focusedSo()).toBe("SO-2000"));
  });

  it("↓ keeps walking past the edge of the rendered window", async () => {
    mount();
    const windowSize = navRows().length;
    act(() => navRows()[0]!.focus());
    for (let i = 0; i < windowSize + 5; i++) {
      fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
      await waitFor(() => expect(focusedSo()).toBe(`SO-${2001 + i}`));
    }
  });

  it("PageDown / PageUp move one screen of rows by list index", async () => {
    mount();
    act(() => navRows()[0]!.focus());
    fireEvent.keyDown(document.activeElement!, { key: "PageDown" });
    await waitFor(() => expect(focusedSo()).toBe("SO-2009")); // 380 / 38 = 10 rows, minus one of overlap
    fireEvent.keyDown(document.activeElement!, { key: "PageDown" });
    await waitFor(() => expect(focusedSo()).toBe("SO-2018"));
    fireEvent.keyDown(document.activeElement!, { key: "PageUp" });
    await waitFor(() => expect(focusedSo()).toBe("SO-2009"));
  });

  it("keeps exactly one Tab stop after moving far down the list", async () => {
    mount();
    act(() => navRows()[0]!.focus());
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    await waitFor(() => expect(focusedSo()).toBe("SO-2059"));
    expect(navRows().filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });
});

describe("the focused row is actually IN VIEW, not merely focused", () => {
  it("corrects the virtualizer's estimated scroll so End lands fully visible below the header", async () => {
    /* Real rows (38px) are taller than the virtualizer's estimate, so its own
       scroll stops short. Row geometry here follows scrollTop like a browser. */
    let viewport: HTMLElement | null = null;
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
      const rect = (top: number, h: number) => ({ x: 0, y: top, top, left: 0, bottom: top + h, right: 800, width: 800, height: h, toJSON: () => ({}) }) as DOMRect;
      if (isViewport(this)) { viewport = this; return rect(0, VIEWPORT_H); }
      if (this.tagName === "THEAD") return rect(0, ROW_H);
      if (this.tagName === "TR" && this.dataset.rowKey) {
        const index = Number(this.dataset.rowKey.slice(1));
        return rect(ROW_H + index * ROW_H - (viewport?.scrollTop ?? 0), ROW_H);
      }
      return rect(0, 0);
    });
    mount();
    act(() => navRows()[0]!.focus());
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    await waitFor(() => expect(focusedSo()).toBe("SO-2059"));
    const r = (document.activeElement as HTMLElement).getBoundingClientRect();
    expect(r.top).toBeGreaterThanOrEqual(ROW_H);
    expect(r.bottom).toBeLessThanOrEqual(VIEWPORT_H);
  });
});
