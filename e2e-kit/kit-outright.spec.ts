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
 *   align    v12's fingerprint (fix list 14 Oct): toolbar 32, tabs 32, the view
 *            button with its name, ⋮ 32, header 40 grey 12/500, rows 54/54, sticky
 *            header, pager, no year. `carres-align.js` reads the toolbar and the
 *            dates; the list is the one listing engine (a real <table>), which the
 *            align script cannot read, so the same table facts are measured here.
 *            The one permitted difference is a business word: the preserved date
 *            keeps its two-line header `Customer’s original` / `requested
 *            delivery` (owner 14 Oct), where v12 says `ETA`
 *
 * This list may scroll sideways in its own box when its columns do not fit
 * (Layout Standard 14 Oct: "the whole table scrolls sideways and the identifier
 * stays fixed on the left"), unlike the SO Batch lists in kit-lists.spec.ts.
 */
const WIDTHS = [1025, 1164, 1440] as const;
const PASS = ["PASS — all measured items match the current Standard"];
const carresCheck = (page: Page) => page.evaluate(() => {
  const failures: string[] = [];
  const table = document.querySelector('section[aria-label="Sales orders"]');
  if (!table) return ["Missing Sales Orders"];
  const header = table.querySelector("thead tr");
  if (header && Math.round(header.getBoundingClientRect().height) !== 40) failures.push("Header must be40");
  const rows = [...table.querySelectorAll("tbody tr[data-row-key]")];
  if (rows.some(row => row.getBoundingClientRect().height < 43.5)) failures.push("Row below44");
  if (document.documentElement.scrollWidth > innerWidth) failures.push("Page overflow");
  return failures.length ? failures : ["PASS — all measured items match the current Standard"];
});
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
    const soNo = [...card.querySelectorAll("thead th")].find((h) => h.textContent?.trim() === "SO no.") as HTMLElement;
    const soAt = soNo.getBoundingClientRect();
    const rows = [...card.querySelectorAll("tbody tr")].filter((r) => !r.hasAttribute("data-expansion-of") && r.getAttribute("aria-hidden") !== "true");
    const cells = rows.flatMap((r) => [...r.querySelectorAll(":scope > td")]);
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
        test.skip(width < 1100 && summary && tasks, "Narrow panels use one foreground Drawer; each overlay is measured separately");
        await page.setViewportSize({ width, height: 900 });
        await page.goto(PAGE, { waitUntil: "networkidle" });
        await page.locator('[data-testid^="outright-row-"]').first().waitFor();
        await setPanels(page, summary, tasks);
        for (const state of ["rows closed", "one row open"] as const) {
          if (state === "one row open") {
            // A narrow modal protects the canvas. Edit it after closing, then
            // reopen the same panel and measure the retained expanded row.
            if (width < 1100 && (summary || tasks)) await page.keyboard.press("Escape");
            await page.getByRole("button", { name: "Show items" }).first().click();
            await page.locator('[data-carres-table="item-rows"]').first().waitFor();
            if (width < 1100 && (summary || tasks)) await setPanels(page, summary, tasks);
          }
          await page.mouse.move(4, 4);
          const m = await measure(page);
          expect(m.pageScroll, `${state}: the page scrolls sideways`).toBeLessThanOrEqual(0);
          expect(m.pagerInside, `${state}: the pager is inside the card`).toBe(true);
          expect(m.toolbar, `${state}: the toolbar is one 36px line`).toBe(36);
          expect(m.buttonHeights, `${state}: every toolbar button is 32 high`).toEqual([32]);
          expect(m.rowHeights.every(h => h >= 44), `${state}: rows keep the44px minimum and grow for complete facts`).toBe(true);
          expect(m.cellsPastColumn, `${state}: no cell runs past its column`).toBe(0);
          expect(m.soNoInView, `${state}: SO no. stays in view at the list's right end`).toBe(true);
          expect(await carresCheck(page), `${state}: carres-check.js`).toEqual(PASS);

        }
      });
    }
  }
}

test("Sales Order Outright headers read the v12 words and the preserved date's two lines (owner 14 Oct)", async ({ page }) => {
  await page.setViewportSize({ width: 1164, height: 900 });
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.locator('[data-testid^="outright-row-"]').first().waitFor();
  const heads = await page.locator(`${TABLE} thead tr`).first().locator("th").allInnerTexts();
  expect(heads.map((h) => h.replace(/\n/g, " / ").toLowerCase()).filter(Boolean)).toEqual([
    "proceed date", "so no.", "items", "sales location", "delivery location", "customer’s original / requested delivery",
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
  await setPanels(page, false, false);
  await page.getByRole("button", { name: /^View:/ }).click();
  await page.getByRole("menu").getByText("Overview", { exact: true }).click();
  for (const col of ["Payment", "Problems"]) {
    /* The engine's header filter: hover the header, its funnel, one value. */
    const th = page.locator(`${TABLE} thead th`, { hasText: col }).first();
    await th.hover();
    await th.getByRole("button", { name: `Filter ${col}` }).click();
    await page.getByTestId("column-filter-menu").locator('input[type="checkbox"]').first().check();
    await page.keyboard.press("Escape");
  }
  const canvasWidth = await page.getByTestId("outright-toolbar").evaluate((bar) => bar.getBoundingClientRect().width);
  await setPanels(page, false, true);
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="outright-toolbar"]') as HTMLElement;
    const tasks = document.querySelector('aside[aria-label="Tasks"]') as HTMLElement;
    const edge = bar.getBoundingClientRect().right;
    const buttons = [...bar.querySelectorAll("button")].filter((b) => (b as HTMLElement).offsetParent);
    return {
      canvasWidth: bar.getBoundingClientRect().width,
      panelWidth: Math.round(tasks.closest('[role="dialog"]')!.getBoundingClientRect().width),
      modal: Boolean(tasks.closest('[role="dialog"][aria-modal="true"]')),
      overflow: bar.scrollWidth - bar.clientWidth,
      past: buttons.filter((b) => b.getBoundingClientRect().right > edge + 0.5).length,
      view: buttons.find((b) => (b.getAttribute("aria-label") ?? "").startsWith("View:"))?.textContent?.trim(),
    };
  });
  expect(m.canvasWidth, "the overlay preserves the canvas").toBe(canvasWidth);
  expect(m.panelWidth).toBe(340);
  expect(m.modal).toBe(true);
  expect(m.overflow, "the toolbar line holds every control").toBeLessThanOrEqual(0);
  expect(m.past, "every control fits the unchanged canvas").toBe(0);
  expect(m.view, "the view button keeps its name").toContain("Overview");
  expect(await carresCheck(page)).toEqual(PASS);
});

test("Sales Order Outright toolbar holds one search chip in the Sales Order view on one line, at 1025 with Tasks open (real-data case, owner 14 Oct)", async ({ page }) => {
  await page.setViewportSize({ width: 1025, height: 900 });
  await page.goto(`${PAGE}?search=1314`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await setPanels(page, false, true);
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="outright-toolbar"]') as HTMLElement | null;
    const tasks = document.querySelector('aside[aria-label="Tasks"]') as HTMLElement;
    if (!bar) return null;
    const edge = bar.getBoundingClientRect().right;
    const buttons = [...bar.querySelectorAll("button")].filter((b) => (b as HTMLElement).offsetParent);
    const table = document.querySelector('[data-carres-table="list"]') as HTMLElement;
    return {
      canvasWidth: bar.getBoundingClientRect().width,
      panelWidth: Math.round(tasks.closest('[role="dialog"]')!.getBoundingClientRect().width),
      modal: Boolean(tasks.closest('[role="dialog"][aria-modal="true"]')),
      overflow: bar.scrollWidth - bar.clientWidth,
      past: buttons.filter((b) => b.getBoundingClientRect().right > edge + 0.5).length,
      view: buttons.find((b) => (b.getAttribute("aria-label") ?? "").startsWith("View:"))?.textContent?.trim(),
      tableWidth: table.getBoundingClientRect().width,
      rows: Math.round(bar.getBoundingClientRect().height) > 40 ? 2 : 1,
    };
  });
  expect(m, "the toolbar is drawn").not.toBeNull();
  expect(m!.overflow).toBeLessThanOrEqual(0);
  expect(m!.past).toBe(0);
  expect(m!.view).toContain("Sales Order");
  expect(m!.panelWidth, "Tasks uses the governed narrow overlay").toBe(340);
  expect(m!.modal).toBe(true);
  expect(m!.tableWidth).toBeGreaterThan(0);
  expect(m!.rows, "the toolbar stays one line").toBe(1);
  expect(await carresCheck(page)).toEqual(PASS);
});

test("Sales Order Outright opened row: Qty and Supplier are reachable by keyboard inside the list's own scroll box (1025, Tasks reopened)", async ({ page }) => {
  await page.setViewportSize({ width: 1025, height: 900 });
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.locator('[data-testid^="outright-row-"]').first().waitFor();
  await setPanels(page, false, false);
  await page.getByRole("button", { name: "Show items" }).first().click();
  const items = page.locator('[data-carres-table="item-rows"]').first();
  await items.waitFor();
  const inBox = (name: string) =>
    page.evaluate((n) => {
      const box = document.querySelector('[data-list-scroll]') as HTMLElement;
      const head = [...document.querySelectorAll('[data-carres-table="item-rows"] [role="columnheader"]')].find((h) => h.textContent?.trim() === n) as HTMLElement | undefined;
      if (!head) return "missing";
      const b = box.getBoundingClientRect(), r = head.getBoundingClientRect();
      return r.left >= b.left - 1 && r.right <= b.right + 1 ? "in view" : "out of view";
    }, name);
  /* Start scrolled left, so the keyboard has to bring them in. */
  await page.evaluate(() => { (document.querySelector('[data-list-scroll]') as HTMLElement).scrollLeft = 0; });
  await page.locator("[data-list-scroll]").focus();
  expect(await page.evaluate(() => document.activeElement?.hasAttribute("data-list-scroll"))).toBe(true);
  for (let i = 0; i < 60 && ((await inBox("Supplier")) !== "in view"); i++) await page.keyboard.press("ArrowRight");
  expect(await inBox("Qty")).not.toBe("missing");
  expect(await inBox("Supplier"), "Supplier comes into view with the arrow keys").toBe("in view");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), "the page itself never scrolls sideways").toBeLessThanOrEqual(0);
  const scrollLeft = await page.locator("[data-list-scroll]").evaluate((box) => box.scrollLeft);
  await setPanels(page, false, true);
  await expect(page.getByRole("dialog", { name: "Tasks", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(items).toBeVisible();
  expect(await page.locator("[data-list-scroll]").evaluate((box) => box.scrollLeft)).toBe(scrollLeft);
});

/* THE MONTHLY DEMAND DOOR (15 Oct 2026). Purchasing's Monthly demand opens the
   list at `?tab=all&requested=…`; the list narrows on the preserved request and
   says so in a chip that clears it. Fixture-independent: before Jan 1900 holds
   nothing, after Jan 1900 holds every order with a recorded request. */
test("Sales Order Outright opens from Monthly demand narrowed by the customer's original requested delivery, with a chip that clears it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const rows = () => page.locator('[data-testid^="outright-row-"]');
  await page.goto(`${PAGE}?tab=all`, { waitUntil: "networkidle" });
  await rows().first().waitFor();
  const footer = page.getByTestId("outright-footer-qty");
  const everyOrder = (await footer.textContent()) ?? "";

  await page.goto(`${PAGE}?tab=all&requested=before%3A1900-01`, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: /Customer’s original requested delivery: Before Jan 1900/ })).toBeVisible();
  await expect(rows()).toHaveCount(0);

  await page.goto(`${PAGE}?tab=all&requested=after%3A1900-01`, { waitUntil: "networkidle" });
  await rows().first().waitFor();
  expect(await carresCheck(page)).toEqual(PASS);
  await page.getByRole("button", { name: /Customer’s original requested delivery: After Jan 1900/ }).click();
  await expect(page.getByTestId("outright-toolbar").getByRole("button", { name: /Customer’s original requested delivery/ })).toHaveCount(0);
  await expect(footer).toHaveText(everyOrder);
});

test("Sales Order Outright toolbar at 375x812: New Sales Order, Views and More are inside the viewport, 24px+ high, no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.locator('[data-testid^="outright-row-"]').first().waitFor();
  const m = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="outright-toolbar"]') as HTMLElement;
    const pick = (match: (b: HTMLElement) => boolean) => {
      const b = [...bar.querySelectorAll("button")].find((x) => match(x as HTMLElement)) as HTMLElement | undefined;
      const r = b?.getBoundingClientRect();
      return r && { left: r.left, right: r.right, height: r.height };
    };
    const label = (b: HTMLElement) => b.getAttribute("aria-label") ?? "";
    return {
      overflow: bar.scrollWidth - bar.clientWidth,
      vw: document.documentElement.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      create: pick((b) => /New Sales Order/.test(b.textContent ?? "")),
      views: pick((b) => label(b).startsWith("View") || /Views/.test(label(b))),
      more: pick((b) => label(b) === "More actions"),
    };
  });
  expect(m.overflow).toBeLessThanOrEqual(0);
  expect(m.pageOverflow).toBeLessThanOrEqual(0);
  for (const r of [m.create, m.views, m.more]) {
    expect(r).toBeTruthy();
    expect(r!.left).toBeGreaterThanOrEqual(0);
    expect(r!.right).toBeLessThanOrEqual(m.vw);
    expect(r!.height).toBeGreaterThanOrEqual(24);
  }
});
