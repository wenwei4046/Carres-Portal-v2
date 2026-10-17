import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * THE TASKS PANEL AND THE ONE TASK VIEW ARE MEASURED (01 §2; 03 §8; owner's
 * round 3 brief of 13 Oct 2026, point 2).
 *
 * At the kit's three widths the panel is opened, then a task, then each of its
 * tabs. Numbers, not pictures:
 *
 *   check    the kit's OWN measurement, `carres-check.js`, answers PASS
 *   page     the page never scrolls sideways
 *   width    the panel is 320 below 1280, so a task takes no room from the list
 *   title    the Tasks title row is 36 high
 *   inside   nothing in the panel passes its right edge, and no value is cut
 *
 * The pages are the fixture previews: every party and number is TEST data.
 */
const WIDTHS = [1025, 1164, 1440] as const;
const CARRES_CHECK = readFileSync(fileURLToPath(new URL("../docs/ui-reference/sales-order-design/carres-check.js", import.meta.url)), "utf8");
const PASS = ["PASS — all measured items match the Standard"];
const carresCheck = (page: Page) =>
  page.evaluate((source) => { try { return (0, eval)(source) as string[]; } catch (error) { return [`CHECK ERROR ${(error as Error).message}`]; } }, CARRES_CHECK);

const TASKS = 'aside[aria-label="Tasks"]';

async function measure(page: Page) {
  return page.evaluate((selector) => {
    const panel = document.querySelector(selector) as HTMLElement | null;
    if (!panel) return null;
    const box = panel.getBoundingClientRect();
    const shown = [...panel.querySelectorAll("*")].filter((el) => el.getClientRects().length > 0) as HTMLElement[];
    return {
      // Below1100 the existing Drawer owns the 320px surface, including its
      // border; the retained Tasks contents fill the inner canvas.
      width: Math.round((panel.closest('[role="dialog"]') ?? panel).getBoundingClientRect().width),
      title: Math.round((panel.children[0] as HTMLElement).getBoundingClientRect().height),
      pageScroll: document.documentElement.scrollWidth - window.innerWidth,
      pastEdge: shown.filter((el) => el.getBoundingClientRect().right > box.right + 1).length,
      cut: shown.filter((el) => el.children.length === 0 && el.textContent?.trim() && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent!.trim().slice(0, 30)),
    };
  }, TASKS);
}

async function openTasks(page: Page, width: number, path: string) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(path, { waitUntil: "networkidle" });
  if (await page.locator(TASKS).count() === 0) await page.getByRole("button", { name: /^Tasks/ }).first().click();
  await expect(page.locator(TASKS)).toBeVisible();
  await page.locator("[data-task-card]").first().waitFor();
}

async function expectKit(page: Page, width: number, state: string) {
  // The lists size their flexible column after the panel settles.
  await page.waitForTimeout(700);
  await page.mouse.move(4, 4);
  const m = await measure(page);
  expect(m, `${state}: the Tasks panel is on the page`).not.toBeNull();
  expect(m!.pageScroll, `${state}: the page scrolls sideways`).toBeLessThanOrEqual(0);
  expect(m!.title, `${state}: the Tasks title row`).toBe(36);
  if (width < 1280) expect(m!.width, `${state}: the panel's width`).toBe(320);
  expect(m!.pastEdge, `${state}: parts pass the panel's right edge`).toBe(0);
  expect(m!.cut, `${state}: values cut`).toEqual([]);
  expect(await carresCheck(page), `${state}: carres-check.js`).toEqual(PASS);
}

for (const width of WIDTHS) {
  test(`Tasks panel: the list and a Purchase Order task, every tab, at ${width}`, async ({ page }) => {
    await openTasks(page, width, "/so-batch-shell-preview.html");
    await expectKit(page, width, "the list");

    await page.locator("[data-task-card]").first().click();
    const view = page.locator(`${TASKS} [data-kit="task-view"]`);
    await expect(view).toBeVisible();
    await expect(view.getByTestId("task-view-head")).toContainText("Purchasing");
    await expect(view.getByRole("tab")).toHaveText(["Steps", "Route", "History", /^Files \d+$/]);
    await expectKit(page, width, "task · Steps");

    for (const tab of ["Route", "History", "Files"] as const) {
      await view.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
      await expectKit(page, width, `task · ${tab}`);
    }
    /* Back to the list: the same day and tab, the opened card marked. */
    await page.getByTestId("tasks-back").click();
    await expect(page.locator("[data-task-card][aria-pressed=true]")).toHaveCount(1);
  });

  test(`Tasks panel: a purchase batch task and its send steps at ${width}`, async ({ page }) => {
    await openTasks(page, width, "/work-preview.html?shell=1&pw=1");
    await page.locator("[data-task-card]", { hasText: "Send 2 POs" }).click();
    const view = page.locator(`${TASKS} [data-kit="task-view"]`);
    await expect(view.getByTestId("task-view-head")).toContainText("SO Batch Purchase");
    /* The PO to send, its PDF door and the three numbered steps all stay
       inside the panel (13 Oct 2026: at 320 the PO row passed the edge by 31). */
    await expect(view.getByTestId("batch-whatsapp-steps")).toBeVisible();
    await expectKit(page, width, "task · Steps");
  });

  test(`Tasks panel: a Sales Order task and its Order Route at ${width}`, async ({ page }) => {
    await openTasks(page, width, "/work-preview.html?shell=1");
    await page.locator("[data-task-card]", { hasText: "SO-1362" }).filter({ hasText: "Ask customer to pay" }).click();
    const view = page.locator(`${TASKS} [data-kit="task-view"]`);
    await expect(view.getByTestId("task-view-head")).toContainText("SO-1362");
    await expectKit(page, width, "task · Steps");
    await view.getByRole("tab", { name: "Route" }).click();
    /* The Order Route's own points, top to bottom. */
    await expect(view.getByTestId("task-route-point-proceed")).toBeVisible();
    await expect(view.getByTestId("task-route-point-delivery")).toBeVisible();
    await expectKit(page, width, "task · Route");
  });

  /* `+ Task` (Workspace MASTER "Employee-created internal tasks", Jess
     2026-10-14): the button is in the 36 title row, the dialog is whole on the
     page, and an internal task opens as the one task view with `Steps` and
     `History` only, because it serves no order and holds no document. */
  test(`Tasks panel: + Task, its dialog and an internal task at ${width}`, async ({ page }) => {
    await openTasks(page, width, "/so-batch-shell-preview.html");
    const open = page.locator(`${TASKS} [data-testid="new-task-open"]`);
    await expect(open).toHaveText("Task");
    expect(await open.evaluate((button) => button.closest("aside")!.children[0]!.contains(button)), "the button is in the title row").toBe(true);
    await expectKit(page, width, "the list with + Task");

    await open.click();
    const dialog = page.getByRole("dialog", { name: "New task" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#new-task-name")).toBeFocused();
    const box = (await dialog.boundingBox())!;
    expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 900, "the dialog is whole on the page").toBe(true);
    /* An empty name saves nothing and says so under the field. */
    await dialog.getByTestId("new-task-add").click();
    await expect(dialog.getByText("Task name is required.")).toBeVisible();
    await dialog.locator("#new-task-name").fill("TEST · Call TEST Supplier A about the price list");
    await dialog.locator("#new-task-assignee").click();
    await page.getByRole("option", { name: "TEST · Staff B" }).click();
    await dialog.getByTestId("new-task-add").click();
    await expect(dialog).toBeHidden();

    await page.locator("[data-task-card]", { hasText: "TEST · Get the new product photographs" }).click();
    const view = page.locator(`${TASKS} [data-kit="task-view"]`);
    await expect(view.getByRole("tab")).toHaveText(["Steps", "History"]);
    await expect(view.getByTestId("task-internal-detail")).toBeVisible();
    await expect(view.getByRole("button", { name: "Mark done" })).toBeVisible();
    await expectKit(page, width, "internal task · Steps");
    await view.getByRole("tab", { name: "History" }).click();
    await expect(view.getByText("Added by TEST · Staff B · for TEST · Staff A")).toBeVisible();
    await expectKit(page, width, "internal task · History");
  });
}
