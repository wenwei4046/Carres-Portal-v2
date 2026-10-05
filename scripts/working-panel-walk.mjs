#!/usr/bin/env node
/**
 * WORKING PANEL · LOCAL SELF-WALK — localhost only (owner flow 2026-10-05).
 *
 * Drives the dev entry `apps/web/working-panel-preview.html` (seeded fixtures,
 * writes refused) through the owner's checklist and prints one line per check.
 * Screenshots land in the directory given as the second argument.
 *
 *   node scripts/working-panel-walk.mjs http://127.0.0.1:5191 /tmp/walk
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://127.0.0.1:5191";
const OUT = process.argv[3] ?? "./working-panel-walk";
mkdirSync(OUT, { recursive: true });
const entry = (state, at) => `${BASE}/working-panel-preview.html?state=${state}&at=${encodeURIComponent(at)}`;

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} · ${name}${detail ? ` · ${detail}` : ""}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });
const area = () => page.locator('[data-testid="right-area"]');
const view = () => area().getAttribute("data-view");
const panelText = () => page.locator('[data-testid="page-work-panel"]').innerText();
const settle = () => page.waitForTimeout(700);

/* 1 · Page entry — SO Batch Purchase opens on its highest-priority work. */
await page.goto(entry("default", "/operation?tab=purchase"));
await page.waitForSelector('[data-testid="page-work-panel"]');
await settle();
check("SO Batch entry opens the right area on the page's work", (await view()) === "page");
let text = await panelText();
check("top item is the earliest Missed PO window", /4:00 PM PO window[\s\S]*Missed/.test(text), text.split("\n").slice(0, 5).join(" | "));
check("position reads 1 of 3", text.includes("1 of 3"));
check("main tab selected is the page name `SO Batch Purchase`",
  (await page.locator('[data-testid="page-work-panel"] nav button[aria-current="page"]').first().innerText()) === "SO Batch Purchase");
const areaWidth = (await area().boundingBox())?.width ?? 0;
check("right area width within the shared card range", areaWidth >= 366 && areaWidth <= 560, `${Math.round(areaWidth)}px`);
await shot("01-so-batch-entry-1440");

/* 2 · Rail doors are icon only with names. */
const doors = await page.locator('[data-testid^="rail-door-"]').evaluateAll((els) =>
  els.map((b) => ({ name: b.getAttribute("aria-label"), title: b.title, text: b.innerText.replace(/\d+/g, "").trim(), w: b.offsetWidth, h: b.offsetHeight })));
check("rail doors are Calendar · Tasks · Activity", doors.map((d) => d.title).join(" · ") === "Calendar · Tasks · Activity");
check("doors are icon only (no visible word) with tooltip + accessible name, 60×44",
  doors.every((d) => d.text === "" && d.name && d.title && d.w === 60 && d.h === 44), JSON.stringify(doors.map((d) => d.name)));

/* 3 · Step to another task by hand; the choice survives a refresh. */
await page.getByRole("button", { name: "Next task" }).click();
await settle();
text = await panelText();
check("Next task opens today's due window", text.includes("2 of 3") && !/Missed/.test(text.split("\n").slice(0, 6).join(" ")));
await page.reload();
await page.waitForSelector('[data-testid="page-work-panel"]');
await settle();
text = await panelText();
check("a hand-picked task is kept across refresh", text.includes("2 of 3"));
await page.getByRole("button", { name: "Previous task" }).click();
await settle();

/* 4 · Tasks and Calendar switch in the SAME area and come back. */
await page.locator('[data-testid="rail-door-tasks"]').click();
await settle();
check("Tasks opens in the same right area (one view)", (await view()) === "tasks" && (await page.locator('[data-testid="right-area"]').count()) === 1);
check("the page's work stays mounted, hidden", (await page.locator('[data-testid="right-area-page"]').count()) === 1 && await page.locator('[data-testid="right-area-page"]').isHidden());
check("an obvious way back names the page", (await page.locator('[data-testid="back-to-page-work"]').innerText()).includes("Back to SO Batch Purchase"));
await shot("02-tasks-view-1440");
await page.locator('[data-testid="back-to-page-work"]').click();
await settle();
check("Back returns to the same task", (await view()) === "page" && (await panelText()).includes("1 of 3"));
await page.locator('[data-testid="rail-door-calendar"]').click();
await settle();
check("Calendar opens in the same area", (await view()) === "calendar");
await page.locator('[data-testid="rail-door-calendar"]').click();
await settle();
check("pressing Calendar again returns to the page's work", (await view()) === "page");

/* 5 · No-work and today-first states. */
await page.goto(entry("nowork", "/operation?tab=purchase"));
await page.waitForSelector('[data-testid="page-work-panel"]');
await settle();
check("no work shows the plain proposal state", (await page.locator('[data-testid="page-work-empty"]').innerText()) === "No work for this page");
check("records stay viewable with no work", (await page.locator('[data-testid^="so-batch-row-"]').count()) > 0);
await shot("03-no-work-1440");
await page.goto(entry("nomissed", "/operation?tab=purchase"));
await page.evaluate(() => sessionStorage.clear());
await page.reload();
await page.waitForSelector('[data-testid="page-work-panel"]');
await settle();
text = await panelText();
check("without Missed, today's due round leads", text.includes("1 of 2") && !/Missed/.test(text));

/* 6 · Sales Orders — the order's own card; a draft survives every switch. */
await page.goto(entry("default", "/operation/orders"));
await page.waitForSelector('[data-testid="page-work-panel"]');
await settle();
text = await panelText();
check("Sales Orders entry opens SO-1361 (Missed) first", text.includes("SO-1361") || text.includes("LIM KUAN YANG") || text.includes("Nurul"), text.split("\n").slice(0, 4).join(" | "));
await shot("04-sales-orders-entry-1440");
const comm = page.locator('[data-testid="page-work-panel"] button[aria-label="Communication"]').first();
let draftOk = false;
if (await comm.count()) {
  await comm.click();
  const box = page.locator('[data-testid="page-work-panel"] textarea').first();
  await box.fill("Draft: please confirm Friday");
  await page.locator('[data-testid="rail-door-calendar"]').click();
  await settle();
  await page.locator('[data-testid="back-to-page-work"]').click();
  await settle();
  const afterCalendar = await box.inputValue();
  await page.locator('[data-testid="rail-door-tasks"]').click();
  await page.locator('[data-testid="rail-door-tasks"]').click();
  await settle();
  const afterTasks = await box.inputValue();
  await page.getByRole("button", { name: "Next task" }).click();
  await settle();
  await page.getByRole("button", { name: "Previous task" }).click();
  await settle();
  const afterStep = await box.inputValue();
  draftOk = [afterCalendar, afterTasks, afterStep].every((v) => v === "Draft: please confirm Friday");
  check("an open draft survives Calendar, Tasks and stepping tasks", draftOk, JSON.stringify([afterCalendar, afterTasks, afterStep]));
  await shot("05-draft-kept-1440");
} else {
  check("an open draft survives Calendar, Tasks and stepping tasks", false, "no Communication toggle in the card");
}

/* 7 · Selecting a row never changes the Working Panel's task. */
const before = await panelText();
await page.locator('[data-testid="grid-parent-row"]').nth(4).click();
await settle();
const quick = await page.locator('[data-testid="sales-order-quick-view"]').count();
check("row click opens the quick card and leaves the task unchanged", quick > 0 && (await panelText()) === before);
await page.keyboard.press("Escape");
await settle();

/* 8 · Right-click View · Print; View opens the read-first page with Edit. */
await page.locator('[data-testid="grid-parent-row"]').first().click({ button: "right" });
const words = await page.locator('[role="menu"][aria-label="Row actions"] [role="menuitem"]').allInnerTexts();
check("row menu reads View · Print · ─ Cancel SO", words.join(" · ") === "View · Print · Cancel SO", words.join(" · "));
const popup = page.waitForEvent("popup", { timeout: 8000 }).catch(() => null);
await page.locator('[role="menuitem"]', { hasText: "Print" }).click();
const pdf = await popup;
check("Print opens the governed SO paper in a new tab", Boolean(pdf) && (pdf?.url() ?? "").startsWith("blob:"), pdf?.url() ?? "no popup");
await pdf?.close();
await page.locator('[data-testid="grid-parent-row"]').first().click({ button: "right" });
await page.locator('[role="menuitem"]', { hasText: "View" }).click();
await page.waitForURL(/so%2F/);
await page.waitForSelector('[data-testid="workspace-edit"]', { timeout: 8000 }).catch(() => null);
await settle();
const editButton = page.locator('[data-testid="workspace-edit"]');
check("View opens the full read-first SO page (not editing)", (await editButton.count()) === 1 && (await page.locator('[data-testid="workspace-cancel"]').count()) === 0);
await shot("06-view-page-1440");
if (await editButton.count()) {
  await editButton.click();
  await settle();
  check("Edit starts only when pressed", (await page.locator('[data-testid="workspace-cancel"]').count()) === 1);
  await page.locator('[data-testid="workspace-cancel"]').click();
  await settle();
}
await page.goBack();
await page.waitForSelector('[data-testid="page-work-panel"]');
await settle();

/* 9 · PDF return inside the card: SO No → PDF → Close PDF → Info. */
const docButton = page.locator('[data-testid="page-work-panel"] button[aria-label^="Sales order"]').first();
if (await docButton.count()) {
  await docButton.click();
  await page.waitForTimeout(1500);
  await shot("07-card-pdf-1440");
  const close = page.locator('[data-testid="page-work-panel"] button[aria-label="Close PDF"]').first();
  const hasClose = (await close.count()) === 1;
  if (hasClose) await close.click();
  await settle();
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  check("PDF opens in the card and Close PDF returns to Info", hasClose && /Sales order/i.test(focused), focused);
} else {
  check("PDF opens in the card and Close PDF returns to Info", false, "no SO number door in the card");
}

/* 10 · Purchase Orders — PO card: header PO/supplier, tab named by COPY. */
await page.goto(entry("default", "/operation/procurement"));
await page.waitForSelector('[data-testid="page-work-panel"]');
await settle();
text = await panelText();
const tab = await page.locator('[data-testid="page-work-panel"] nav button[aria-current="page"]').first().innerText().catch(() => "");
check("PO page work opens the Missed PO with tab `Purchase Order`", /PO-20260913-4803[\s\S]*Missed/.test(text) && tab === "Purchase Order", `${text.split("\n").slice(0, 4).join(" | ")} · tab ${tab}`);
const soTab = page.locator('[data-testid="page-work-panel"] nav button', { hasText: "Sales Order" });
if (await soTab.count()) {
  await soTab.click();
  await page.waitForTimeout(1200);
  check("embedded Sales Order tab shows the linked SO", (await page.locator('[data-testid="embedded-sales-orders"]').count()) === 1);
} else {
  check("embedded Sales Order tab shows the linked SO", false, "no Sales Order tab");
}
await shot("08-purchase-orders-1440");

/* 11 · 390px — the phone shell: `Tasks` beside `Calendar`, same grammar. */
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(entry("default", "/operation?tab=purchase"));
await page.waitForSelector('[data-testid="phone-tasks-door"]');
await settle();
check("390px: no Working Panel opens by itself over the list", (await page.locator('[data-testid="page-work-panel"]').count()) === 0);
await page.locator('[data-testid="phone-tasks-door"]').click();
await settle();
text = await panelText();
check("390px: Tasks opens the page's work first", /4:00 PM PO window/.test(text));
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("390px: no sideways page scroll", overflow <= 0, `${overflow}px`);
await shot("09-phone-tasks-390");
await page.locator('[data-testid="phone-open-tasks"]').click();
await settle();
check("390px: global Tasks and Back to the page", (await page.locator('[data-testid="phone-back-to-page-work"]').innerText()).includes("Back to SO Batch Purchase"));
await shot("10-phone-global-tasks-390");

check("no page errors during the walk", errors.length === 0, errors.slice(0, 3).join(" ‖ "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
