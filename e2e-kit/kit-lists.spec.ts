import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
 *
 * 13 Oct 2026 (owner's round 3 brief): the four SO Batch Purchase views also
 * run the kit's OWN measurement, `carres-check.js`, as the package ships it,
 * in every state. Its answer must be the one PASS line.
 */
const WIDTHS = [1025, 1164, 1440] as const;
const CARRES_CHECK = readFileSync(fileURLToPath(new URL("../docs/ui-reference/sales-order-design/carres-check.js", import.meta.url)), "utf8");
const PASS = ["PASS — all measured items match the Standard"];
const carresCheck = (page: Page) =>
  page.evaluate((source) => { try { return (0, eval)(source) as string[]; } catch (error) { return [`CHECK ERROR ${(error as Error).message}`]; } }, CARRES_CHECK);

const LISTS: ReadonlyArray<{ name: string; page: string; box: string; last: string; expand: string; kitCheck?: boolean }> = [
  {
    name: "SO Batch Purchase · By supplier",
    page: "/so-batch-shell-preview.html",
    box: '[data-testid="by-supplier"]',
    last: '[data-testid^="by-supplier-status-"]',
    expand: '[data-testid^="by-supplier-expand-"]',
    kitCheck: true,
  },
  {
    name: "SO Batch Purchase · By sales order",
    page: "/so-batch-shell-preview.html?view=table",
    box: '[data-testid="by-sales-order"]',
    last: '[data-testid^="so-batch-status-"]',
    expand: '[data-testid^="so-batch-expand-"]',
    kitCheck: true,
  },
  {
    name: "SO Batch Purchase · By category",
    page: "/so-batch-shell-preview.html?view=category",
    box: '[data-testid="by-supplier"]',
    last: '[data-testid^="by-supplier-status-"]',
    expand: '[data-testid^="by-supplier-expand-"]',
    kitCheck: true,
  },
  {
    name: "SO Batch Purchase · By order deadline",
    page: "/so-batch-shell-preview.html?view=deadline",
    box: '[data-testid="by-supplier"]',
    last: '[data-testid^="by-supplier-status-"]',
    expand: '[data-testid^="by-supplier-expand-"]',
    kitCheck: true,
  },
  {
    name: "Purchase Orders · Overview",
    page: "/purchase-orders-shell-preview.html",
    box: '[data-testid="po-register-content"]',
    last: '[data-testid^="po-overview-status-"]',
    expand: '[data-testid^="po-expand-"]',
  },
];

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
        if (list.kitCheck) {
          await page.mouse.move(4, 4);
          expect(await carresCheck(page), `${state}: carres-check.js`).toEqual(PASS);
        }
      }
    });
  }
}

/* THE LIST FITS THE ROOM IT IS GIVEN (Layout Standard, 13 Oct 2026): at 1164
   with the Tasks panel OPEN the fixed columns give way, so all four SO Batch
   views still show Status with no side scroll. Below 1280 the panel is closed
   until its button is pressed; this presses it. */
for (const list of LISTS.filter((candidate) => candidate.kitCheck)) {
  test(`${list.name} fits 1164 with the Tasks panel open`, async ({ page }) => {
    await page.setViewportSize({ width: 1164, height: 900 });
    await page.goto(list.page, { waitUntil: "networkidle" });
    await page.locator(list.last).first().waitFor();
    await expect(page.locator('aside[aria-label="Tasks"]')).toHaveCount(0);
    await page.getByRole("button", { name: /^Tasks/ }).first().click();
    await expect(page.locator('aside[aria-label="Tasks"]')).toBeVisible();
    await page.waitForTimeout(700);
    for (const state of ["rows closed", "one row open"] as const) {
      if (state === "one row open") {
        await page.locator(list.expand).first().click();
        await page.waitForTimeout(600);
      }
      await page.mouse.move(4, 4);
      const m = await measure(page, list.box, list.last);
      expect(m!.pageScroll, `${state}: the page scrolls sideways`).toBeLessThanOrEqual(0);
      expect(m!.listSpare, `${state}: the list scrolls sideways`).toBeLessThanOrEqual(1);
      expect(m!.lastPastEdge, `${state}: the last column passes the list's edge`).toBeLessThanOrEqual(0);
      expect(m!.cut, `${state}: values cut with "..."`).toBe(0);
      expect(await carresCheck(page), `${state}: carres-check.js`).toEqual(PASS);
    }
  });
}

/* `Use stock · n` is on the selection bar only while a ticked line has a free
   Unit, and never on the toolbar (owner's round 3 brief, point 1). The preview
   holds TEST Units for SO-1301. The same measures and the kit's check run
   with the bar showing and after the Units are taken. */
for (const width of WIDTHS) {
  test(`SO Batch Purchase · By sales order: Use stock on the selection bar at ${width}`, async ({ page }) => {
    const list = LISTS[1]!;
    await page.setViewportSize({ width, height: 900 });
    await page.goto(list.page, { waitUntil: "networkidle" });
    await page.locator(list.last).first().waitFor();
    await page.waitForTimeout(600);
    await expect(page.getByTestId("so-batch-use-stock")).toHaveCount(0);

    await page.getByTestId("so-batch-select-o1").click({ force: true });
    const useStock = page.getByTestId("so-batch-use-stock");
    await expect(useStock).toHaveText("Use stock · 1");
    await expect(page.getByTestId("selection-bar")).toContainText("Issue PO");
    await page.mouse.move(4, 4);
    let m = await measure(page, list.box, list.last);
    expect(m!.pageScroll, "ticked: the page scrolls sideways").toBeLessThanOrEqual(0);
    expect(m!.listSpare, "ticked: the list scrolls sideways").toBeLessThanOrEqual(1);
    expect(await carresCheck(page), "ticked: carres-check.js").toEqual(PASS);

    await useStock.click();
    /* Both Units are held for the line: nothing is left to buy on SO-1301, so
       it leaves `To buy` and its tick goes with it. */
    await expect(page.getByTestId("so-batch-row-o1")).toHaveCount(0);
    await expect(page.getByTestId("selection-bar")).toHaveCount(0);
    await page.mouse.move(4, 4);
    m = await measure(page, list.box, list.last);
    expect(m!.listSpare, "after Use stock: the list scrolls sideways").toBeLessThanOrEqual(1);
    expect(await carresCheck(page), "after Use stock: carres-check.js").toEqual(PASS);
  });
}
