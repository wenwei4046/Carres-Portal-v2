import { expect, test, type Page } from "@playwright/test";

/**
 * SCREENSHOT BASELINES OF THE APPROVED PAGES (UI MASTER, owner ruling 14 Oct 2026).
 *
 * Every approved page is photographed at the kit's three widths with its
 * Summary and Tasks open and closed. A later change that moves a pixel fails
 * here and blocks the merge until the new picture is approved: the PR that
 * changes a picture shows it before and after, and approving that PR approves
 * the picture.
 *
 * The pages are the fixture previews (the real page components, TEST data, no
 * network), on a fixed date, so a picture changes only when the code changes.
 * The pictures are Linux pictures: CI makes them (the `Screenshot baselines`
 * workflow, label `update-baselines`) and CI checks them. Elsewhere this file
 * skips, because another system draws fonts differently.
 */
test.skip(process.platform !== "linux" && !process.env.BASELINES_ANY_OS, "Baselines are Linux pictures; CI makes and checks them.");

const WIDTHS = [1025, 1164, 1440] as const;
const FIXED_NOW = new Date("2026-10-14T10:00:00+08:00");

const PAGES: ReadonlyArray<{ name: string; path: string; ready: string }> = [
  { name: "sales-order", path: "/sales-orders-shell-preview.html", ready: '[data-testid^="outright-row-"]' },
  { name: "so-batch", path: "/so-batch-shell-preview.html", ready: '[data-testid="by-supplier"]' },
  { name: "forecast-purchase", path: "/forecast-purchase-shell-preview.html", ready: "main" },
  {
    name: "workspace",
    path: `/work-preview.html?shell=1&pw=1&at=${encodeURIComponent("/operation?tab=work")}`,
    ready: '[role="tab"]',
  },
  {
    name: "workspace-team",
    path: `/work-preview.html?shell=1&pw=1&at=${encodeURIComponent("/operation?tab=work&scope=team")}`,
    ready: '[role="tab"]',
  },
];

const TASKS = 'aside[aria-label="Tasks"]';
/* The left panel is `Summary` on Sales Order and the filter rail on the kit lists. */
const SUMMARY_HIDE = 'button[aria-label="Hide summary"], button[aria-label="Hide filters"]';
const SUMMARY_SHOW = 'button[aria-label="Show filters"]';

async function open(page: Page, path: string, ready: string, width: number) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(path, { waitUntil: "networkidle" });
  await page.locator(ready).first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function settle(page: Page) {
  await page.mouse.move(2, 2);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

/** Puts the left panel in the asked state; false when the page has no such panel. */
async function setSummary(page: Page, on: boolean): Promise<boolean> {
  const isOpen = async () => (await page.locator(SUMMARY_HIDE).count()) > 0;
  if ((await isOpen()) === on) return true;
  const control = on
    ? page.locator(SUMMARY_SHOW).or(page.getByRole("button", { name: "Summary", exact: true }))
    : page.locator(SUMMARY_HIDE);
  if ((await control.count()) === 0) return false;
  await control.first().click();
  return (await isOpen()) === on;
}

/** Puts the Tasks panel in the asked state; false when the page has no Tasks panel. */
async function setTasks(page: Page, on: boolean): Promise<boolean> {
  const isOpen = async () => (await page.locator(TASKS).count()) > 0;
  if ((await isOpen()) === on) return true;
  const control = on
    ? page.getByRole("button", { name: /^Tasks/ })
    : page.locator(`${TASKS} button[aria-label="Hide tasks"]`);
  if ((await control.count()) === 0) return false;
  await control.first().click();
  if (on) await page.locator(TASKS).waitFor();
  return (await isOpen()) === on;
}

for (const { name, path, ready } of PAGES) {
  for (const width of WIDTHS) {
    for (const summary of [false, true]) {
      for (const tasks of [false, true]) {
        const state = `summary-${summary ? "on" : "off"}-tasks-${tasks ? "on" : "off"}`;
        test(`${name} at ${width}, ${state}`, async ({ page }) => {
          await open(page, path, ready, width);
          test.skip(!(await setSummary(page, summary)), `${name} has no Summary panel to ${summary ? "open" : "close"}`);
          test.skip(!(await setTasks(page, tasks)), `${name} has no Tasks panel to ${tasks ? "open" : "close"}`);
          await settle(page);
          await expect(page).toHaveScreenshot(`${name}-${width}-${state}.png`, {
            animations: "disabled",
            caret: "hide",
            maxDiffPixelRatio: 0.002,
          });
        });
      }
    }
  }
}

/* The Tasks panel on its own, as the approved round 3 draws it beside SO Batch. */
for (const width of WIDTHS) {
  test(`tasks panel at ${width}`, async ({ page }) => {
    await open(page, "/so-batch-shell-preview.html", '[data-testid="by-supplier"]', width);
    expect(await setTasks(page, true), "the Tasks panel opens").toBe(true);
    await page.locator("[data-task-card]").first().waitFor();
    await settle(page);
    await expect(page.locator(TASKS)).toHaveScreenshot(`tasks-panel-${width}.png`, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.002,
    });
  });
}
