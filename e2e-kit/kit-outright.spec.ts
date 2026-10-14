import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * SALES ORDER OUTRIGHT LIST — page 1 on the shared kit (fix list 14 Oct 2026,
 * UI MASTER one kit). Measured at the kit's three widths, with Summary and
 * Tasks open and closed, rows closed and one row opened by ▸:
 *
 *   page     the page never scrolls sideways
 *   pager    Rows and the pager stay inside the table card (the footer's
 *            quantity line never widens the list)
 *   toolbar  one 36px line
 *   frozen   scrolled to its right end, the list still shows SO No
 *   check    `carres-check.js`, as the repository ships it, answers PASS
 *
 * This list may scroll sideways in its own box when its columns do not fit
 * (Layout Standard 14 Oct: "the whole table scrolls sideways and the identifier
 * stays fixed on the left"), unlike the SO Batch lists in kit-lists.spec.ts.
 */
const WIDTHS = [1025, 1164, 1440] as const;
const CARRES_CHECK = readFileSync(fileURLToPath(new URL("../docs/ui-reference/sales-order-design/carres-check.js", import.meta.url)), "utf8");
const PASS = ["PASS — all measured items match the Standard"];
const carresCheck = (page: Page) =>
  page.evaluate((source) => { try { return (0, eval)(source) as string[]; } catch (error) { return [`CHECK ERROR ${(error as Error).message}`]; } }, CARRES_CHECK);

const PAGE = "/sales-orders-shell-preview.html";
const TABLE = 'section[aria-label="Sales orders"]';

async function setPanels(page: Page, summary: boolean, tasks: boolean) {
  const summaryOpen = async () => (await page.locator('aside[aria-label="Summary"]').count()) > 0;
  const tasksOpen = async () => (await page.locator('aside[aria-label="Tasks"]').count()) > 0;
  if ((await summaryOpen()) !== summary) {
    await (summary ? page.getByRole("button", { name: "Summary", exact: true }) : page.getByRole("button", { name: "Hide summary" })).click();
  }
  if ((await tasksOpen()) !== tasks) {
    await (tasks ? page.getByRole("button", { name: /^Tasks/ }).first() : page.getByRole("button", { name: "Hide tasks" })).click();
  }
  await page.waitForTimeout(500);
}

async function measure(page: Page) {
  return page.evaluate((table) => {
    const card = document.querySelector(table) as HTMLElement;
    const box = card.querySelector("[data-list-scroll]") as HTMLElement;
    const next = card.querySelector('[aria-label="Next page"]') as HTMLElement;
    const toolbar = document.querySelector('[data-testid="outright-toolbar"]') as HTMLElement | null;
    const edge = card.getBoundingClientRect();
    box.scrollLeft = box.scrollWidth;
    const soNo = [...card.querySelectorAll('[role="columnheader"]')].find((h) => h.textContent?.trim() === "SO No") as HTMLElement;
    const soAt = soNo.getBoundingClientRect();
    const out = {
      pageScroll: document.documentElement.scrollWidth - window.innerWidth,
      pagerInside: next.getBoundingClientRect().right <= edge.right,
      toolbar: toolbar ? Math.round(toolbar.getBoundingClientRect().height) : null,
      soNoInView: soAt.left >= edge.left && soAt.right <= edge.right,
    };
    box.scrollLeft = 0;
    return out;
  }, TABLE);
}

for (const width of WIDTHS) {
  for (const summary of [false, true]) {
    for (const tasks of [false, true]) {
      test(`Sales Order Outright at ${width}, Summary ${summary ? "open" : "closed"}, Tasks ${tasks ? "open" : "closed"}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(PAGE, { waitUntil: "networkidle" });
        await page.locator('[data-testid^="outright-row-"]').first().waitFor();
        await setPanels(page, summary, tasks);
        for (const state of ["rows closed", "one row open"] as const) {
          if (state === "one row open") {
            await page.getByRole("button", { name: "Show items" }).first().click();
            await page.locator('[data-carres-table="item-rows"]').first().waitFor();
          }
          await page.mouse.move(4, 4);
          const m = await measure(page);
          expect(m.pageScroll, `${state}: the page scrolls sideways`).toBeLessThanOrEqual(0);
          expect(m.pagerInside, `${state}: the pager is inside the card`).toBe(true);
          expect(m.toolbar, `${state}: the toolbar is one 36px line`).toBe(36);
          expect(m.soNoInView, `${state}: SO No stays in view at the list's right end`).toBe(true);
          expect(await carresCheck(page), `${state}: carres-check.js`).toEqual(PASS);
        }
      });
    }
  }
}

test("Sales Order Outright headers read the dictionary words (fix list 14 Oct)", async ({ page }) => {
  await page.setViewportSize({ width: 1164, height: 900 });
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.locator('[data-testid^="outright-row-"]').first().waitFor();
  const heads = await page.locator(`${TABLE} [role="row"]`).first().locator('[role="columnheader"]').allInnerTexts();
  expect(heads.map((h) => h.replace(/\n/g, " / ")).filter(Boolean)).toEqual([
    "Proceed Date", "SO No", "Items", "Sales Location", "Delivery Location", "Customer’s original / requested delivery",
  ]);
});
