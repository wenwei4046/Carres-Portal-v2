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
 * and a size ticked (the selection bar showing). `Suggested` with every
 * model open, where a size carries its request line, is measured at the three
 * widths too, and `Send for approval` is walked once. Numbers, not pictures:
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
      toolbarHeight: toolbar?.getBoundingClientRect().height ?? 0,
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
      await expect(page.getByTestId("forecast-review-open")).toHaveText("Review 1 request");
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
    expect(m!.toolbarHeight, `${state}: shared toolbar follows the36px MASTER`).toBe(36);
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

/* AN OPEN MODEL FOLLOWS THE LIST WHEN IT GETS NARROWER (found on production,
   14 Oct 2026). A size line copies its model's column widths. If it copies
   them as fixed pixels, the open lines hold the whole list at the width it
   had, and a narrower window or a panel opened afterwards makes the list
   scroll sideways until the model is closed. Measured after each narrowing,
   with the model still open. */
test("Forecast Purchase: an open model follows the list when it gets narrower", async ({ page }) => {
  await open(page, 1440);
  /* The Tasks panel starts closed, as it does at 1164 and 1025, so each width
     is measured with its own panels; it is opened again at the end. */
  if (await page.locator('aside[aria-label="Tasks"]').count() > 0) await page.getByRole("button", { name: "Hide tasks" }).click();
  await expect(page.locator('aside[aria-label="Tasks"]')).toHaveCount(0);
  await page.locator('[data-testid^="forecast-expand-"]').first().click();
  await page.waitForTimeout(600);
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["1164 after 1440", () => page.setViewportSize({ width: 1164, height: 900 })],
    ["1025 after 1164", () => page.setViewportSize({ width: 1025, height: 900 })],
    ["1164 again with the Tasks panel", async () => {
      await page.setViewportSize({ width: 1164, height: 900 });
      await page.waitForTimeout(400);
      if (await page.locator('aside[aria-label="Tasks"]').count() === 0) await page.getByRole("button", { name: /^Tasks/ }).first().click();
      await expect(page.locator('aside[aria-label="Tasks"]')).toBeVisible();
    }],
  ];
  for (const [state, step] of steps) {
    await step();
    await page.waitForTimeout(700);
    await page.mouse.move(4, 4);
    const m = await measure(page);
    expect(m, `${state}: the list is on the page`).not.toBeNull();
    expect(await page.locator('[data-testid^="forecast-size-week-2-"]').count(), `${state}: the model is still open`).toBeGreaterThan(0);
    expect(m!.pageScroll, `${state}: the page scrolls sideways`).toBeLessThanOrEqual(0);
    expect(m!.listSpare, `${state}: the list scrolls sideways`).toBeLessThanOrEqual(1);
    expect(m!.lastPastEdge, `${state}: the last column passes the list's edge`).toBeLessThanOrEqual(0);
    expect(m!.lineDrift, `${state}: a size line's numbers sit under the model's`).toBeLessThanOrEqual(1);
    expect(await carresCheck(page), `${state}: carres-check.js`).toEqual(PASS);
    await shot(page, `narrowing · ${state}`);
  }
});

/* THE ONE WRITE (owner ruling 2026-10-14, A): `Send for approval` asks the
   forecast's submit door for Manual Purchase Requests. The page never issues a
   PO. A request in progress is shown as a request: the suggestion and Free
   stock do not move, and the size cannot be asked for again. The preview keeps
   the TEST requests in the page; nothing is written anywhere. */
test("Forecast Purchase: Send for approval, then the size reads its request", async ({ page }) => {
  await open(page, 1440);
  const first = page.locator('[data-testid^="forecast-select-"]:not([disabled])').first();
  const modelId = (await first.getAttribute("data-testid"))!.replace("forecast-select-", "");
  const suggested = await page.getByTestId(`forecast-week-0-${modelId}`).innerText();
  const free = await page.getByTestId(`forecast-free-${modelId}`).innerText();
  await first.click({ force: true });
  await expect(page.getByTestId("selection-bar")).not.toContainText(/\bPOs?\b/);
  await page.getByTestId("forecast-review-open").click();
  const review = page.getByRole("dialog");
  await expect(review).toContainText(/Review \d+ Manual Purchase Requests?/);
  await expect(review.getByTestId("forecast-review-requests")).toContainText(/Delivery Date \w{3}, \d{1,2} \w{3}/);
  await expect(review.getByTestId("forecast-review-deliver-to")).toHaveText("TEST Warehouse");
  await expect(review.getByTestId("forecast-review-who")).toHaveText("TEST · Approver approves. TEST · Staff A then issues the PO and sends it to the supplier.");
  await expect(review.getByText(/Place|Issue PO|Skip|Undo|Review \d+ PO/)).toHaveCount(0);
  const send = review.getByTestId("forecast-review-send");
  await expect(send).toHaveText("Send for approval");
  await expect(send).toBeEnabled();
  await shot(page, "1440 · review");
  await send.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("selection-bar")).toHaveCount(0);

  /* The model is still under `Suggested` with the same numbers: its request is
     not stock. Its sizes read the request and cannot be asked for again. It is
     NOT under `Ordered`, which is what is on a PO. */
  await page.getByRole("tab", { name: "Suggested" }).click();
  await expect(page.getByTestId(`forecast-week-0-${modelId}`)).toHaveText(suggested);
  await expect(page.getByTestId(`forecast-free-${modelId}`)).toHaveText(free);
  await expect(page.getByTestId(`forecast-select-${modelId}`)).toBeDisabled();
  await page.getByTestId(`forecast-expand-${modelId}`).click();
  await expect(page.locator(`[data-testid="forecast-sizes-${modelId}"] [data-testid^="forecast-size-request-"]`).first()).toContainText("Waiting for approval");
  await page.mouse.move(4, 4);
  const m = await measure(page);
  expect(m!.listSpare, "after sending: the list scrolls sideways").toBeLessThanOrEqual(1);
  expect(m!.cut, 'after sending: values cut with "..."').toBe(0);
  expect(m!.lineDrift, "after sending: a size line's numbers sit under the model's").toBeLessThanOrEqual(1);
  expect(await carresCheck(page), "after sending: carres-check.js").toEqual(PASS);
  await shot(page, "1440 · Suggested after sending");
  await page.getByRole("tab", { name: "Ordered" }).click();
  await expect(page.getByTestId(`forecast-row-${modelId}`)).toHaveCount(0);
});

/* A request line under a size is longer than the size's name: at every width
   it wraps inside the Model column and is never cut. */
for (const width of WIDTHS) {
  test(`Forecast Purchase · Suggested keeps its request lines whole at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${PAGE}?show=suggested`, { waitUntil: "networkidle" });
    await page.locator(LAST).first().waitFor();
    await page.waitForTimeout(600);
    for (const expand of await page.locator('[data-testid^="forecast-expand-"]').all()) await expand.click();
    await page.waitForTimeout(600);
    await expect(page.locator('[data-testid^="forecast-size-request-"]').first()).toBeVisible();
    await page.mouse.move(4, 4);
    const m = await measure(page);
    expect(m!.pageScroll, "the page scrolls sideways").toBeLessThanOrEqual(0);
    expect(m!.listSpare, "the list scrolls sideways").toBeLessThanOrEqual(1);
    expect(m!.cut, 'values cut with "..."').toBe(0);
    expect(m!.lineDrift, "a size line's numbers sit under the model's").toBeLessThanOrEqual(1);
    expect(await carresCheck(page), "carres-check.js").toEqual(PASS);
    await shot(page, `${width} · Suggested, every model open`);
  });
}

test("Forecast Purchase: a request cannot be sent while production days are not set", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${PAGE}?state=nolead`, { waitUntil: "networkidle" });
  await page.locator(LAST).first().waitFor();
  await page.waitForTimeout(600);
  for (const box of await page.locator('[data-testid^="forecast-select-"]:not([disabled])').all()) await box.click({ force: true });
  await page.getByTestId("forecast-review-open").click();
  const review = page.getByRole("dialog");
  await expect(review).toContainText("Production days are not set");
  await expect(review).toContainText("Add production days for TEST Supplier Two · Bedframe in Settings");
  await expect(review.getByTestId("forecast-review-send")).toBeDisabled();
  await shot(page, "1440 · review, production days not set");
});

/* Owner17Oct: narrow panels overlay rather than taking list width. */
test("1025 shared panels overlay the unchanged canvas and restore the saved wide menu", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("carres-menu-collapsed", "0");
    localStorage.setItem("shell-tasks-open", "0");
  });
  await open(page, 1025);
  const nav = page.getByRole("navigation", { name: "Modules" });
  await expect.poll(async () => Math.round((await nav.boundingBox())!.width)).toBe(64);
  const canvasWidth = Math.round((await page.locator(BOX).boundingBox())!.width);
  await page.locator('[data-testid^="forecast-select-"]:not([disabled])').first().check();
  const selection = await page.getByTestId("selection-bar").textContent();
  // Selection owns the toolbar, so return to normal without changing the list.
  await page.locator('[data-testid^="forecast-select-"]:not([disabled])').first().uncheck();
  await page.getByTestId("forecast-show-summary").click();
  const summary = page.getByRole("dialog", { name: "Summary" });
  await expect(summary).toBeVisible();
  expect(Math.round((await summary.boundingBox())!.width)).toBe(264);
  expect(Math.round((await page.locator(BOX).boundingBox())!.width)).toBe(canvasWidth);
  await page.keyboard.press("Escape");
  await expect(summary).toHaveCount(0);
  await expect(page.getByTestId("forecast-show-summary")).toBeFocused();
  await page.getByRole("button", { name: /^Tasks/ }).first().click();
  const tasks = page.getByRole("dialog", { name: "Tasks" });
  await expect(tasks).toBeVisible();
  expect(Math.round((await tasks.boundingBox())!.width)).toBe(320);
  expect(Math.round((await page.locator(BOX).boundingBox())!.width)).toBe(canvasWidth);
  await page.keyboard.press("Escape");
  await expect(tasks).toHaveCount(0);
  await page.locator('[data-testid^="forecast-select-"]:not([disabled])').first().check();
  await expect(page.getByTestId("selection-bar")).toHaveText(selection);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => Math.round((await nav.boundingBox())!.width)).toBe(220);
  await expect(page.getByTestId("selection-bar")).toHaveText(selection);
  expect(await page.evaluate(() => localStorage.getItem("carres-menu-collapsed"))).toBe("0");
});


test("MPR1025 returns focus to its Summary door and keeps the shared36px toolbar", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("carres-menu-collapsed", "0");
    localStorage.setItem("shell-tasks-open", "0");
    localStorage.setItem("carres.manualPurchase.filterRail.v2", "0");
  });
  await page.setViewportSize({ width: 1025, height: 900 });
  await page.goto("/manual-purchase-shell-preview.html", { waitUntil: "networkidle" });
  const door = page.getByTestId("manual-purchase-show-filters");
  await expect(door).toBeVisible();
  await expect.poll(async () => Math.round((await page.getByRole("navigation", { name: "Modules" }).boundingBox())!.width)).toBe(64);
  const canvas = page.getByTestId("mp-register-surface");
  const before = (await canvas.boundingBox())!.width;
  expect((await page.getByTestId("work-toolbar").boundingBox())!.height).toBe(36);
  await door.click();
  const summary = page.getByRole("dialog", { name: "Summary" });
  await expect(summary).toBeVisible();
  expect((await summary.boundingBox())!.width).toBe(264);
  expect((await canvas.boundingBox())!.width).toBe(before);
  await summary.getByRole("button", { name: "Hide filters", exact: true }).click();
  await expect(summary).toHaveCount(0);
  await expect(door).toBeFocused();
  expect((await canvas.boundingBox())!.width).toBe(before);
});


// The released request-flow action adds real width. A narrower window must
// keep its View, Page tools and Tasks as separate reachable controls.
test("request-flow toolbar keeps its controls separate at801 and preserves desktop fit", async ({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem("carres-menu-collapsed","0");
  localStorage.setItem("shell-tasks-open","0");
  localStorage.setItem("carres.forecastPurchase.summary.open","0");
 });
 for(const width of [801,...WIDTHS]){
  await page.setViewportSize({width,height:900});
  await page.goto(`${PAGE}?requestFlow=1`,{waitUntil:"networkidle"});
  const toolbar=page.getByTestId("work-toolbar");
  const view=page.getByRole("button",{name:"View: By model · Outright",exact:true});
  const tools=page.getByRole("button",{name:"Page tools",exact:true});
  const tasks=page.getByTestId("tasks-pill");
  await expect(page.getByTestId("forecast-new-stock-request")).toBeVisible();
  await expect(tasks).toBeVisible();
  const v=(await view.boundingBox())!;const t=(await tools.boundingBox())!;const k=(await tasks.boundingBox())!;
  expect(v.x+v.width,`View overlaps Page tools at${width}`).toBeLessThanOrEqual(t.x+1);
  expect(t.x+t.width,`Page tools overlaps Tasks at${width}`).toBeLessThanOrEqual(k.x+1);
  expect((await toolbar.boundingBox())!.height).toBe(36);
  expect(await toolbar.evaluate(bar=>{const r=bar.getBoundingClientRect();return [...bar.querySelectorAll("button")].filter(e=>Math.round(e.getBoundingClientRect().height)===32).every(e=>{const b=e.getBoundingClientRect();return b.top>=r.top-1&&b.bottom<=r.top+bar.clientHeight+1;});})).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
  const overflow=await toolbar.evaluate(e=>e.scrollWidth-e.clientWidth);
  if(width===801){
   expect(overflow).toBeGreaterThan(0);
   await view.click();const viewMenu=page.getByRole("menu",{name:"Forecast Purchase view"});await expect(viewMenu).toBeVisible();
   expect(await viewMenu.evaluate(e=>!!e.closest('[data-testid="work-toolbar"]'))).toBe(false);
   await expect(viewMenu.getByTestId("forecast-view-outright")).toBeVisible();await page.keyboard.press("Escape");
   await expect(viewMenu).toHaveCount(0);await expect(view).toBeFocused();
   await tools.focus();await expect(tools).toBeFocused();await page.keyboard.press("Tab");await expect(tasks).toBeFocused();
   const b=(await toolbar.boundingBox())!;const focused=(await tasks.boundingBox())!;
   expect(focused.x).toBeGreaterThanOrEqual(b.x-1);expect(focused.x+focused.width).toBeLessThanOrEqual(b.x+b.width+1);
   await tools.click();const menu=page.getByRole("menu",{name:"Page tools"});await expect(menu).toBeVisible();
   expect(await menu.evaluate(e=>!!e.closest('[data-testid="work-toolbar"]'))).toBe(false);
   await expect(menu.getByRole("menuitem",{name:"Export",exact:true})).toBeVisible();
   await shot(page,"forecast-request-flow-801-tools");await page.keyboard.press("Escape");
  }else expect(overflow,`Unnecessary toolbar scroll at${width}`).toBeLessThanOrEqual(1);
 }
});
