import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * THE WORKSPACE PAGE IS MEASURED (01 §2; Workspace MASTER §5; owner's round 3
 * brief of 13 Oct 2026, point 3).
 *
 * At the kit's three widths, in both scopes, with the table and with one task
 * open. Numbers, not pictures:
 *
 *   check    the kit's OWN measurement, `carres-check.js`, answers PASS
 *   page     the page never scrolls sideways
 *   table    the table's own scroll box holds its columns (0 to spare)
 *   record   the Module rail's rows sum to the chosen tab's number
 *   one      the shell's Tasks panel is not shown beside the page
 *
 * The page is the Work fixture preview: every party and number is TEST data.
 */
const WIDTHS = [1025, 1164, 1440] as const;
const CARRES_CHECK = readFileSync(fileURLToPath(new URL("../docs/ui-reference/sales-order-design/carres-check.js", import.meta.url)), "utf8");
const PASS = ["PASS — all measured items match the Standard"];
const carresCheck = (page: Page) =>
  page.evaluate((source) => { try { return (0, eval)(source) as string[]; } catch (error) { return [`CHECK ERROR ${(error as Error).message}`]; } }, CARRES_CHECK);

const address = (query = "") => `/work-preview.html?shell=1&pw=1&at=${encodeURIComponent(`/operation?tab=work${query}`)}`;

async function measure(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="workspace-tasks"]') as HTMLElement | null;
    if (!root) return null;
    const scroller = root.querySelector('[data-testid="grid-scroll"]') as HTMLElement | null;
    const shown = [...root.querySelectorAll("*")].filter((el) => el.getClientRects().length > 0) as HTMLElement[];
    const number = (el: Element | null) => Number(el?.textContent?.match(/\d+/)?.[0] ?? NaN);
    const modules = [...root.querySelectorAll('button[data-testid^="workspace-module-"]')];
    const tabs = [...root.querySelectorAll('[data-testid="workspace-toolbar"] [role="tab"]')];
    return {
      pageScroll: document.documentElement.scrollWidth - window.innerWidth,
      tableSpare: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
      cut: shown.filter((el) => el.children.length === 0 && el.textContent?.trim() && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent!.trim().slice(0, 30)),
      all: number(modules[0] ?? null),
      moduleSum: modules.slice(1).reduce((sum, el) => sum + number(el), 0),
      chosenTab: number(tabs.find((tab) => tab.getAttribute("aria-selected") === "true" && /\d/.test(tab.textContent ?? "")) ?? null),
      tasksPanel: document.querySelectorAll('aside[aria-label="Tasks"]').length,
    };
  });
}

async function expectKit(page: Page, state: string) {
  await page.waitForTimeout(700);
  await page.mouse.move(4, 4);
  const m = await measure(page);
  expect(m, `${state}: the Workspace page is drawn`).not.toBeNull();
  expect(m!.pageScroll, `${state}: the page scrolls sideways`).toBeLessThanOrEqual(0);
  expect(m!.tableSpare, `${state}: the table scrolls sideways`).toBeLessThanOrEqual(1);
  expect(m!.cut, `${state}: values cut`).toEqual([]);
  expect(m!.all, `${state}: All modules is the chosen tab's number`).toBe(m!.chosenTab);
  expect(m!.moduleSum, `${state}: the module rows sum to All modules`).toBe(m!.all);
  expect(m!.tasksPanel, `${state}: the shell's Tasks panel beside the page`).toBe(0);
  expect(await carresCheck(page), `${state}: carres-check.js`).toEqual(PASS);
}

for (const width of WIDTHS) {
  for (const scope of ["My Task", "Team Work"] as const) {
    test(`Workspace · ${scope}: the table and one task at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(address(scope === "Team Work" ? "&scope=team" : ""), { waitUntil: "networkidle" });
      await page.locator('[data-testid^="workspace-row-"]').first().waitFor();
      await expect(page.getByRole("tab", { name: scope })).toHaveAttribute("aria-selected", "true");
      await expectKit(page, "the table");

      /* A row opens the one task view beside its list; ✕ returns to the table. */
      await page.locator('[data-testid^="workspace-row-"]', { hasText: "SO-1362" }).first().click();
      const view = page.locator('[data-testid="workspace-task"] [data-kit="task-view"]');
      await expect(view).toBeVisible();
      await expect(page.getByTestId("workspace-communication")).toBeVisible();
      await expectKit(page, "one task");
      await page.getByRole("button", { name: "Back to all tasks" }).click();
      await expect(page.getByTestId("workspace-table")).toBeVisible();
    });
  }

  /* `+ Task` on this page (the shell's Tasks panel steps aside here): the
     button is in the `Module` panel's title row, never on the toolbar (which
     had no room for it at 1025 on production, 14 Oct 2026); the toolbar keeps
     its search and page tools inside the page; `Staff tasks` is a Module row;
     an internal task opens beside the list with no Communication card,
     because nobody outside is asked. */
  test(`Workspace: New task and an internal task at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(address("&scope=team"), { waitUntil: "networkidle" });
    await page.locator('[data-testid^="workspace-row-"]').first().waitFor();
    const open = page.getByTestId("new-task-open");
    await expect(open).toHaveText("Task");
    expect(await open.evaluate((button) => button.closest('[data-testid="workspace-rail"]') !== null), "the button is in the Module panel").toBe(true);
    /* Every toolbar control, the page tools last, is whole inside the table's width. */
    const fits = await page.evaluate(() => {
      const table = document.querySelector('[data-testid="workspace-table"]')!.getBoundingClientRect();
      return [...document.querySelectorAll('[data-testid="workspace-table"] [data-testid="work-toolbar"] button')]
        .filter((el) => el.getClientRects().length)
        .every((el) => el.getBoundingClientRect().right <= table.right + 1);
    });
    expect(fits, "a toolbar control passes the table's right edge").toBe(true);
    await expect(page.getByTestId("workspace-module-workspace")).toContainText("Staff tasks");
    await expectKit(page, "the table with New task");

    await page.locator('[data-testid^="workspace-row-"]', { hasText: "TEST · Get the new product photographs" }).first().click();
    const view = page.locator('[data-testid="workspace-task"] [data-kit="task-view"]');
    await expect(view.getByRole("tab")).toHaveText(["Steps", "History"]);
    await expect(view.getByRole("button", { name: "Mark done" })).toBeVisible();
    await expect(page.getByTestId("workspace-communication")).toHaveCount(0);
    await expectKit(page, "one internal task");
  });
}
