import { expect, test, type Page } from "@playwright/test";

/**
 * KIT LISTS KEEP THEIR LAST COLUMN IN VIEW (01 §5; Purchasing MASTER §9.1, §9.3).
 *
 * Every kit list is measured at the kit's three widths, with Tasks and the
 * filter rail wherever the page itself puts them, closed rows and one open
 * row. Numbers, not pictures:
 *
 *   page     the page never scrolls sideways
 *   list     the list's own scroll box holds its table (0 to spare)
 *   status   the last column's content ends inside the list
 *   cut      no value is cut with "..."
 *
 * 12 Oct 2026: `By supplier` was released after a look at 1131 and 1440; at
 * exactly 1164 the rail opened by itself and cut `Status` by 96. This file
 * exists so that cannot happen quietly again.
 */
const WIDTHS = [1025, 1164, 1440] as const;

const LISTS = [
  {
    name: "SO Batch Purchase · By supplier",
    page: "/so-batch-shell-preview.html",
    box: '[data-testid="by-supplier"]',
    last: '[data-testid^="by-supplier-status-"]',
    expand: '[data-testid^="by-supplier-expand-"]',
  },
  {
    name: "SO Batch Purchase · By category",
    page: "/so-batch-shell-preview.html?view=category",
    box: '[data-testid="by-supplier"]',
    last: '[data-testid^="by-supplier-status-"]',
    expand: '[data-testid^="by-supplier-expand-"]',
  },
  {
    name: "SO Batch Purchase · By order deadline",
    page: "/so-batch-shell-preview.html?view=deadline",
    box: '[data-testid="by-supplier"]',
    last: '[data-testid^="by-supplier-status-"]',
    expand: '[data-testid^="by-supplier-expand-"]',
  },
  {
    name: "Purchase Orders · Overview",
    page: "/purchase-orders-shell-preview.html",
    box: '[data-testid="po-register-content"]',
    last: '[data-testid^="po-overview-status-"]',
    expand: '[data-testid^="po-expand-"]',
  },
] as const;

async function measure(page: Page, box: string, last: string) {
  return page.evaluate(({ box, last }) => {
    const root = document.querySelector(box) as HTMLElement | null;
    if (!root) return null;
    const edge = root.getBoundingClientRect().right;
    const table = root.querySelector("table");
    const scroller = table?.parentElement ?? root;
    const cells = [...root.querySelectorAll(last)];
    const rights = cells.map((cell) => ((cell.firstElementChild ?? cell) as HTMLElement).getBoundingClientRect().right);
    const cut = [...root.querySelectorAll("*")].filter((el) =>
      el.children.length === 0 && (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1 &&
      getComputedStyle(el).textOverflow === "ellipsis").length;
    return {
      pageScroll: document.documentElement.scrollWidth - window.innerWidth,
      listSpare: scroller.scrollWidth - scroller.clientWidth,
      lastCells: cells.length,
      lastPastEdge: rights.length ? Math.round(Math.max(...rights) - edge) : null,
      cut,
    };
  }, { box, last });
}

for (const list of LISTS) {
  for (const width of WIDTHS) {
    test(`${list.name} keeps its last column in view at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(list.page, { waitUntil: "networkidle" });
      await page.locator(list.last).first().waitFor();
      // The lists size their flexible column after the first paint.
      await page.waitForTimeout(600);

      for (const state of ["rows closed", "one row open"] as const) {
        if (state === "one row open") {
          await page.locator(list.expand).first().click();
          await page.waitForTimeout(600);
        }
        const m = await measure(page, list.box, list.last);
        expect(m, `${state}: the list is on the page`).not.toBeNull();
        expect(m!.lastCells, `${state}: the last column is drawn`).toBeGreaterThan(0);
        expect(m!.pageScroll, `${state}: the page scrolls sideways`).toBeLessThanOrEqual(0);
        expect(m!.listSpare, `${state}: the list scrolls sideways`).toBeLessThanOrEqual(1);
        expect(m!.lastPastEdge, `${state}: the last column passes the list's edge`).toBeLessThanOrEqual(0);
        expect(m!.cut, `${state}: values cut with "..."`).toBe(0);
      }
    });
  }
}
