import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * FORECAST PURCHASE · OUTRIGHT KEEPS EVERY COLUMN IN VIEW (01 §5; Purchasing
 * MASTER §9.14; owner 13 Oct 2026).
 *
 * The page is measured at the kit's three widths with its panels where the
 * page itself puts them, then at 1164 with the Summary open and with the
 * Tasks panel open. Each state is measured with rows closed, one model open,
 * and a size ticked (the selection bar showing). Numbers, not pictures:
 *
 *   page     the page never scrolls sideways
 *   list     the list's own scroll box holds its table (0 to spare)
 *   last     the last column's numbers end inside the list
 *   cut      no value is cut with "..."
 *   lines    a size line's numbers sit under its model's numbers
 *   check    the kit's OWN measurement, `carres-check.js`, answers PASS
 *
 * `KIT_SHOTS=<folder>` also saves a picture of every state.
 */
const WIDTHS = [1025, 1164, 1440] as const;
const PAGE = "/forecast-purchase-shell-preview.html";
const BOX = '[data-testid="forecast-purchase-list"]';
const LAST = '[data-testid^="forecast-week-2-"]';
const CARRES_CHECK = readFileSync(fileURLToPath(new URL("../docs/ui-reference/sales-order-design/carres-check.js", import.meta.url)), "utf8");
const PASS = ["PASS — all measured items match the Standard"];
const carresCheck = (page: Page) =>
  page.evaluate((source) => { try { return (0, eval)(source) as string[]; } catch (error) { return [`CHECK ERROR ${(error as Error).message}`]; } }, CARRES_CHECK);

const SHOTS = process.env.KIT_SHOTS;
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function measure(page: Page) {
  return page.evaluate(({ box, last }) => {
    const root = document.querySelector(box) as HTMLElement | null;
    if (!root) return null;
    const edge = root.getBoundingClientRect().right;
    const table = root.querySelector("table");
    const scroller = table?.parentElement ?? root;
    const rights = [...root.querySelectorAll(last)].map((cell) => ((cell.firstElementChild ?? cell) as HTMLElement).getBoundingClientRect().right);
    const cut = [...root.querySelectorAll("*")].filter((el) =>
      el.children.length === 0 && (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1 &&
      getComputedStyle(el).textOverflow === "ellipsis").length;
    const toolbar = root.querySelector('[class*="toolbar"]');
    const tops = toolbar ? [...toolbar.querySelectorAll("button")].filter((b) => (b as HTMLElement).offsetParent)
      .map((b) => Math.round(b.getBoundingClientRect().top + b.getBoundingClientRect().height / 2)) : [];
    /* A size line's last number against the header's right edge of the same column. */
    const heads = [...root.querySelectorAll("thead th")].map((th) => th.getBoundingClientRect());
    const lineCells = [...root.querySelectorAll('[data-testid^="forecast-size-week-2-"]')].map((cell) => cell.getBoundingClientRect());
    const lineDrift = lineCells.length && heads.length ? Math.max(...lineCells.map((cell) => Math.abs(cell.right - heads[heads.length - 1]!.right))) : 0;
    return {
      toolbarLines: tops.length ? (Math.max(...tops) - Math.min(...tops) > 12 ? 2 : 1) : 0,
      pageScroll: document.documentElement.scrollWidth - window.innerWidth,
      listSpare: scroller.scrollWidth - scroller.clientWidth,
      lastCells: rights.length,
      lastPastEdge: rights.length ? Math.round(Math.max(...rights) - edge) : null,
      cut,
      lineDrift: Math.round(lineDrift * 10) / 10,
    };
  }, { box: BOX, last: LAST });
}

async function walk(page: Page, label: string) {
  for (const state of ["rows closed", "one model open", "one size ticked"] as const) {
    if (state === "one model open") {
      await page.locator('[data-testid^="forecast-expand-"]').first().click();
      await page.waitForTimeout(600);
    }
    if (state === "one size ticked") {
      await page.locator('[data-testid^="forecast-size-tick-"]:not([disabled])').first().click({ force: true });
      await expect(page.getByTestId("selection-bar")).toContainText("1 item selected");
      await expect(page.getByTestId("forecast-create")).toHaveText(/Create 1 PO/);
      await page.waitForTimeout(300);
    }
    await page.mouse.move(4, 4);
    const m = await measure(page);
    expect(m, `${state}: the list is on the page`).not.toBeNull();
    expect(m!.lastCells, `${state}: the last column is drawn`).toBeGreaterThan(0);
    expect(m!.pageScroll, `${state}: the page scrolls sideways`).toBeLessThanOrEqual(0);
    expect(m!.listSpare, `${state}: the list scrolls sideways`).toBeLessThanOrEqual(1);
    expect(m!.lastPastEdge, `${state}: the last column passes the list's edge`).toBeLessThanOrEqual(0);
    expect(m!.cut, `${state}: values cut with "..."`).toBe(0);
    expect(m!.toolbarLines, `${state}: the toolbar is one line`).toBe(1);
    expect(m!.lineDrift, `${state}: a size line's numbers sit under the model's`).toBeLessThanOrEqual(1);
    expect(await carresCheck(page), `${state}: carres-check.js`).toEqual(PASS);
    await shot(page, `${label} · ${state}`);
  }
}

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.locator(LAST).first().waitFor();
  // The list sizes its Model column after the first paint.
  await page.waitForTimeout(600);
}

for (const width of WIDTHS) {
  test(`Forecast Purchase keeps every column in view at ${width}`, async ({ page }) => {
    await open(page, width);
    await walk(page, `${width}`);
  });
}

test("Forecast Purchase fits 1164 with the Summary open", async ({ page }) => {
  await open(page, 1164);
  if (await page.getByTestId("forecast-purchase-rail").count() === 0) await page.getByTestId("forecast-show-summary").click();
  await expect(page.getByTestId("forecast-purchase-rail")).toBeVisible();
  await page.waitForTimeout(600);
  await walk(page, "1164 Summary open");
});

test("Forecast Purchase fits 1164 with the Tasks panel open", async ({ page }) => {
  await open(page, 1164);
  await expect(page.locator('aside[aria-label="Tasks"]')).toHaveCount(0);
  await page.getByRole("button", { name: /^Tasks/ }).first().click();
  await expect(page.locator('aside[aria-label="Tasks"]')).toBeVisible();
  await page.waitForTimeout(700);
  await walk(page, "1164 Tasks open");
});

test("Forecast Purchase: the review lists what is ticked and writes nothing", async ({ page }) => {
  await open(page, 1440);
  await page.locator('[data-testid^="forecast-select-"]:not([disabled])').first().click({ force: true });
  await page.getByTestId("forecast-create").click();
  const review = page.getByRole("dialog");
  await expect(review).toContainText(/Review \d+ POs?/);
  await expect(review.getByTestId("forecast-review-place")).toBeDisabled();
  await expect(review.getByTestId("forecast-review-skip")).toBeDisabled();
  await shot(page, "1440 · review");
  await review.getByTestId("forecast-review-back").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
