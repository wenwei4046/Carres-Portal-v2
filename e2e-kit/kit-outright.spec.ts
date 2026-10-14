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
 *   toolbar  one 36px line, every button on it 32 high
 *   rows     every list row 54: each cell on one line, none past its column
 *   frozen   scrolled to its right end, the list still shows SO no.
 *   check    `carres-check.js`, as the repository ships it, answers PASS
 *   align    `carres-align.js` gives v12's fingerprint (fix list 14 Oct): toolbar
 *            32, tabs 32, the view button with its name, ⋮ 32, header 40 grey
 *            12/500, rows 54/54, sticky header, pager, no year. The one permitted
 *            difference is a business word: the preserved date keeps its two-line
 *            header `Customer’s original` / `requested delivery` (owner 14 Oct),
 *            where v12 says `ETA`
 *
 * This list may scroll sideways in its own box when its columns do not fit
 * (Layout Standard 14 Oct: "the whole table scrolls sideways and the identifier
 * stays fixed on the left"), unlike the SO Batch lists in kit-lists.spec.ts.
 */
const WIDTHS = [1025, 1164, 1440] as const;
const CARRES_CHECK = readFileSync(fileURLToPath(new URL("../docs/ui-reference/sales-order-design/carres-check.js", import.meta.url)), "utf8");
const CARRES_ALIGN = readFileSync(fileURLToPath(new URL("../docs/ui-reference/sales-order-design/carres-align.js", import.meta.url)), "utf8");
/* v12's fingerprint, the fix list's acceptance (14 Oct 2026), with the owner's header word. */
const V12 = {
  toolbar: { height: 32, tabs: "32 rgb(226, 228, 232)", viewBtn: "32 · Sales Order", more: 32 },
  table: {
    headH: 40, headBg: "rgb(248, 249, 250)", headFont: "12px/500",
    headWords: "Proceed date · SO no. · Items · Sales location · Delivery location · Customer’s originalrequested delivery",
    rowH: "54/54", sticky: "sticky", footer: "pager",
  },
  dates: "no year",
};
const carresAlign = (page: Page) => page.evaluate((source) => (0, eval)(source) as Record<string, unknown>, CARRES_ALIGN);
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
    const soNo = [...card.querySelectorAll('[role="columnheader"]')].find((h) => h.textContent?.trim() === "SO no.") as HTMLElement;
    const soAt = soNo.getBoundingClientRect();
    const rows = [...card.querySelectorAll('[role="row"]')].filter((r) => !r.closest('[data-carres-table="item-rows"]')).slice(1);
    const cells = [...card.querySelectorAll('[role="row"] [role="cell"]')].filter((c) => !c.closest('[data-carres-table="item-rows"]'));
    const past = cells.filter((c) => [...c.children].some((s) => s.getBoundingClientRect().right > c.getBoundingClientRect().right + 1)).length;
    const buttons = toolbar ? [...toolbar.querySelectorAll("button")].filter((b) => (b as HTMLElement).offsetParent).map((b) => Math.round(b.getBoundingClientRect().height)) : [];
    const out = {
      rowHeights: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))],
      cellsPastColumn: past,
      buttonHeights: [...new Set(buttons.filter((h) => h > 26))],
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
          expect(m.buttonHeights, `${state}: every toolbar button is 32 high`).toEqual([32]);
          expect(m.rowHeights, `${state}: every list row is 54`).toEqual([54]);
          expect(m.cellsPastColumn, `${state}: no cell runs past its column`).toBe(0);
          expect(m.soNoInView, `${state}: SO no. stays in view at the list's right end`).toBe(true);
          expect(await carresCheck(page), `${state}: carres-check.js`).toEqual(PASS);
          /* With a row open its item sub-header (32) is the align's second row, as in v12: rows 54/54 is measured closed. */
          const { rowH: _rowH, ...openTable } = V12.table;
          expect(await carresAlign(page), `${state}: carres-align.js matches v12`).toMatchObject(state === "rows closed" ? V12 : { ...V12, table: openTable });
        }
      });
    }
  }
}

test("Sales Order Outright headers read the v12 words and the preserved date's two lines (owner 14 Oct)", async ({ page }) => {
  await page.setViewportSize({ width: 1164, height: 900 });
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.locator('[data-testid^="outright-row-"]').first().waitFor();
  const heads = await page.locator(`${TABLE} [role="row"]`).first().locator('[role="columnheader"]').allInnerTexts();
  expect(heads.map((h) => h.replace(/\n/g, " / ")).filter(Boolean)).toEqual([
    "Proceed date", "SO no.", "Items", "Sales location", "Delivery location", "Customer’s original / requested delivery",
  ]);
});

test("Sales Order Outright footer reads one line of words in the fixed order (fix list 14 Oct)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.locator('[data-testid^="outright-row-"]').first().waitFor();
  await expect(page.getByTestId("outright-footer-qty")).toHaveText(/^\d+ orders · Qty: Mattress \d+ · Pillow \d+$/);
});

test("Sales Order Outright toolbar never cuts or hides a control with filters on, at 1025 with Tasks open (owner 14 Oct)", async ({ page }) => {
  await page.setViewportSize({ width: 1025, height: 900 });
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.locator('[data-testid^="outright-row-"]').first().waitFor();
  await setPanels(page, false, true);
  await page.getByRole("button", { name: /^View:/ }).click();
  await page.getByRole("menu").getByText("Overview", { exact: true }).click();
  for (const col of ["Payment", "Problems"]) {
    await page.locator('[role="columnheader"] button', { hasText: col }).click();
    await page.getByRole("menu").locator('[role^="menuitem"], button').first().click();
  }
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="outright-toolbar"]') as HTMLElement;
    const tasks = document.querySelector('aside[aria-label="Tasks"]') as HTMLElement;
    const edge = Math.min(bar.getBoundingClientRect().right, tasks.getBoundingClientRect().left);
    const buttons = [...bar.querySelectorAll("button")].filter((b) => (b as HTMLElement).offsetParent);
    return {
      overflow: bar.scrollWidth - bar.clientWidth,
      past: buttons.filter((b) => b.getBoundingClientRect().right > edge + 0.5).length,
      view: buttons.find((b) => (b.getAttribute("aria-label") ?? "").startsWith("View:"))?.textContent?.trim(),
      clear: buttons.find((b) => b.getAttribute("aria-label") === "Clear filters")?.title,
    };
  });
  expect(m.overflow, "the toolbar line holds every control").toBeLessThanOrEqual(0);
  expect(m.past, "no control runs under the Tasks panel").toBe(0);
  expect(m.view, "the view button keeps its name").toContain("Overview");
  expect(m.clear, "Clear filters names each filter on hover").toBe("Payment: Owes · Problems: None");
  expect(await carresCheck(page)).toEqual(PASS);
});

test("Sales Order Outright toolbar holds one search chip in the Sales Order view, at 1025 with Tasks and the menu open (real-data case, owner 14 Oct)", async ({ page }) => {
  await page.setViewportSize({ width: 1025, height: 900 });
  await page.goto(`${PAGE}?search=1314`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await setPanels(page, false, true);
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="outright-toolbar"]') as HTMLElement | null;
    const tasks = document.querySelector('aside[aria-label="Tasks"]') as HTMLElement;
    if (!bar) return null;
    const edge = Math.min(bar.getBoundingClientRect().right, tasks.getBoundingClientRect().left);
    const buttons = [...bar.querySelectorAll("button")].filter((b) => (b as HTMLElement).offsetParent);
    return { overflow: bar.scrollWidth - bar.clientWidth, past: buttons.filter((b) => b.getBoundingClientRect().right > edge + 0.5).length, view: buttons.find((b) => (b.getAttribute("aria-label") ?? "").startsWith("View:"))?.textContent?.trim() };
  });
  expect(m, "the toolbar is drawn").not.toBeNull();
  expect(m!.overflow).toBeLessThanOrEqual(0);
  expect(m!.past).toBe(0);
  expect(m!.view).toContain("Sales Order");
  expect(await carresCheck(page)).toEqual(PASS);
});
