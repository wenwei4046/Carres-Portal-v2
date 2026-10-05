#!/usr/bin/env node
/**
 * TASKS · LOCAL SELF-WALK (owner direction 2026-10-05; LOCAL + SIMULATED).
 *
 * Drives `apps/web/tasks-preview.html` through every state at 1440 and 390
 * and prints one PASS/FAIL line per check. Screenshots go to the folder given
 * as the second argument.
 *
 *   node scripts/tasks-walk.mjs http://127.0.0.1:5191 ./tasks-walk
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://127.0.0.1:5191";
const OUT = process.argv[3] ?? "./tasks-walk";
mkdirSync(OUT, { recursive: true });
const url = (scenario, at = "/operation?tab=purchase") =>
  `${BASE}/tasks-preview.html?scenario=${scenario}&at=${encodeURIComponent(at)}`;

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} · ${name}${detail ? ` · ${detail}` : ""}`);
};
const attempt = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    check(name, false, String(e).split("\n")[0].slice(0, 200));
  }
};

const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const run = (part) => !ONLY || ONLY.includes(part);
const browser = await chromium.launch();
let shot = 0;

async function open(width, height, scenario, at) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(url(scenario, at), { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector('[data-testid="rail-door-tasks"], [data-testid="phone-tasks-door"]', { timeout: 240000 });
  await page.waitForTimeout(1500);
  return { page, ctx, errors, snap: (name) => page.screenshot({ path: join(OUT, `${String(++shot).padStart(2, "0")}-${name}.png`) }) };
}
const text = (page, sel) => page.locator(sel).first().innerText().catch(() => "");
const count = async (page, key) => (await text(page, `[data-testid="task-section-${key}"] [data-testid="section-count"]`)).trim();

/* ════ 1440 · default week ═══════════════════════════════════════════════ */
if (run("default")) {
  const { page, ctx, errors, snap } = await open(1440, 900, "default");
  await attempt("1440 entry", async () => {
    check("1440 · no reminder on the default walk (already shown today)", (await page.locator('[data-testid="pending-work-line"]').count()) === 0);
    const doors = await page.locator('[data-testid^="rail-door-"]').evaluateAll((els) =>
      els.map((b) => ({ title: b.title, name: b.getAttribute("aria-label"), words: b.innerText.replace(/\d+/g, "").trim(), w: b.offsetWidth, h: b.offsetHeight })));
    check("1440 · rail doors Calendar · Tasks · Activity, icon only, named, 60×44",
      doors.map((d) => d.title).join(" · ") === "Calendar · Tasks · Activity" && doors.every((d) => d.words === "" && d.name && d.w === 60 && d.h === 44),
      doors.map((d) => d.name).join(" | "));
    const badge = await page.locator('[data-testid="rail-door-tasks"] [data-rail-badge]').innerText();
    const red = await page.locator('[data-testid="rail-door-tasks"] [data-rail-badge]').evaluate((el) => el.className.includes("bg-danger"));
    check("1440 · Tasks badge = Missed 7 + today 2 = 9, red", badge === "9" && red, badge);
  });

  await attempt("1440 open tasks", async () => {
    const before = await page.evaluate(() => new URLSearchParams(location.search).get("at"));
    await page.locator('[data-testid="rail-door-tasks"]').click();
    await page.waitForSelector('[data-testid="tasks-list"]');
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => new URLSearchParams(location.search).get("at"));
    const w = (await page.locator('[data-testid="right-area"]').boundingBox())?.width ?? 0;
    check("1440 · Tasks opens beside the page; the page stays", before === after, after ?? "");
    check("1440 · area width within 366–560", w >= 366 && w <= 560, `${Math.round(w)}px`);
    await snap("list-default-1440");
    check("1440 · Missed first, open, red count 7", (await count(page, "missed")) === "7"
      && (await page.locator('[data-testid="task-section-missed"]').getAttribute("data-open")) === "true");
    const days = await page.locator('[data-testid^="task-section-20"]').evaluateAll((els) => els.map((e) => ({
      key: e.getAttribute("data-testid"), open: e.getAttribute("data-open"), count: e.querySelector('[data-testid="section-count"]')?.textContent ?? "", nothing: e.querySelector('[data-testid="section-nothing-due"]')?.textContent ?? "",
    })));
    check("1440 · Mon–Sat drawn, counts 2 · 3 · 1 · Nothing due · 2 · 1", days.length === 6
      && days.map((d) => d.count || d.nothing).join(" · ") === "2 · 3 · 1 · Nothing due · 2 · 1", days.map((d) => d.count || d.nothing).join(" · "));
    check("1440 · only today open with the blue circle", days[0]?.open === "true" && days.slice(1).every((d) => !d.open)
      && (await page.locator('[data-testid="today-circle"]').count()) === 1);
    check("1440 · No date section counts 1", (await count(page, "no-date")) === "1");
    const weekWords = await text(page, '[data-testid="tasks-week"]');
    const arrows = await page.locator('[data-testid="tasks-week"] button').evaluateAll((b) => b.map((x) => x.getAttribute("aria-label")));
    check("1440 · week: arrows only, named Previous week / Next week, no label", weekWords.trim() === "" && arrows.join(" · ") === "Previous week · Next week", arrows.join(" · "));
    check("1440 · no search box", (await page.locator('[data-testid="tasks-list"] input[type="search"], [data-testid="tasks-list"] [role="searchbox"]').count()) === 0);
  });

  await attempt("1440 rows", async () => {
    const missed = await page.locator('[data-testid="task-rows-missed"] [data-task-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute("aria-label")));
    const has = (s) => missed.some((m) => m?.includes(s));
    check("1440 · batch rows never say round / PO window", missed.every((m) => !/round|PO window/i.test(m ?? "")));
    check("1440 · Send 2 POs to Nice Future · 11:00 AM", has("Send 2 POs to Nice Future · 11:00 AM"));
    check("1440 · Send 14 POs to Nice Future · 4:00 PM", has("Send 14 POs to Nice Future · 4:00 PM"));
    check("1440 · Send PO to Nice Future · PO-260922-8987-V1", has("Send PO to Nice Future · PO-260922-8987-V1"));
    check("1440 · Issue PO to Nice Future · SO-1368 · 1 item to buy", has("Issue PO to Nice Future · SO-1368 · 1 item to buy"));
    check("1440 · Ask Nice Future when the goods will arrive · PO-260903-6426-V1", has("Ask Nice Future when the goods will arrive · PO-260903-6426-V1"));
    check("1440 · Call AL · SO-1313 · Get the scheduled delivery date", has("Call AL · SO-1313 · Get the scheduled delivery date"));
    check("1440 · covered row says For {normal owner}", has("For {normal owner}"));
    const red = await page.locator('[data-testid="task-rows-missed"] [data-testid="task-row-detail"] .text-danger').count();
    check("1440 · every missed row keeps its original date in red", red === missed.length, `${red}/${missed.length}`);
    /* Closed day preview, then open it with one tap on the 52px header. */
    const tue = page.locator('[data-testid^="task-section-20"]').nth(1);
    const preview = await tue.locator('[data-testid="section-preview"]').innerText();
    check("1440 · a closed day shows a one-line preview", /Call NETS/.test(preview), preview);
    const h = (await tue.locator("button").first().boundingBox())?.height ?? 0;
    await tue.locator("button").first().click();
    await page.waitForTimeout(400);
    check("1440 · the whole 52px header opens the day", h >= 52 && (await tue.getAttribute("data-open")) === "true", `${Math.round(h)}px`);
    const nodate = page.locator('[data-testid="task-section-no-date"]');
    await nodate.locator("button").first().click();
    await page.waitForTimeout(300);
    check("1440 · No date row says who owes the date", /No date · set by Delivery/.test(await nodate.innerText()));
    await snap("days-open-1440");
  });

  await attempt("1440 module filter", async () => {
    await page.locator('[data-testid="tasks-module"]').click();
    await page.waitForSelector('[data-testid="tasks-module-menu"]');
    const rows = await page.locator('[data-testid="tasks-module-menu"] button').evaluateAll((bs) => bs.map((b) => b.innerText.replace(/\s+/g, " ").trim()));
    check("1440 · Module counts 17 = 6 + 2 + 7 + 1 + 1", rows.join(" | ") === "All modules 17 | Purchasing 6 | Warehouse 2 | Delivery 7 | Payment 1 | Issue Tracker 1", rows.join(" | "));
    await snap("module-menu-1440");
    await page.locator('[data-testid="tasks-module-purchasing"]').click();
    await page.waitForTimeout(500);
    const days = await page.locator('[data-testid^="task-section-20"]').evaluateAll((els) => els.map((e) => e.querySelector('[data-testid="section-count"]')?.textContent || e.querySelector('[data-testid="section-nothing-due"]')?.textContent));
    check("1440 · Purchasing: Missed 5, Fri 1, other days Nothing due", (await count(page, "missed")) === "5" && days.join(" · ") === "Nothing due · Nothing due · Nothing due · Nothing due · 1 · Nothing due", days.join(" · "));
    await snap("filtered-purchasing-1440");
    await page.locator('[data-testid="tasks-module"]').click();
    await page.locator('[data-testid="tasks-module-all"]').click();
    await page.waitForTimeout(400);
  });

  await attempt("1440 delivery assign", async () => {
    await page.locator('[data-testid="task-rows-2026-10-05"] [data-task-row], [data-testid^="task-rows-20"] [data-task-row]').filter({ hasText: "Assign logistics" }).first().click();
    await page.waitForSelector('[data-testid="task-panel-delivery"]', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const tabs = await page.locator('[data-testid="task-panel-delivery"] nav button').evaluateAll((b) => b.map((x) => x.textContent).filter(Boolean));
    const act = await text(page, '[data-testid="task-delivery-act"]');
    check("1440 · Delivery task: standalone SO card, tabs Info · Delivery only", tabs.join(" · ") === "Info · Delivery", tabs.join(" · "));
    check("1440 · the only line above is the act and its due date", /^Assign logistics\s*due /.test(act), act.replace(/\n/g, " "));
    const editorOpen = (await page.locator('[data-testid="task-panel-delivery"] form, [data-testid="task-panel-delivery"] select, [data-testid="task-panel-delivery"] [role="combobox"]').count()) > 0;
    check("1440 · Assign logistics opens the existing Logistics editor", editorOpen);
    await snap("delivery-assign-1440");
  });

  await attempt("1440 draft guard", async () => {
    const input = page.locator('[data-testid="task-panel-delivery"] input[type="time"]').first();
    await input.fill("10:30");
    await page.locator('[data-testid="tasks-back"]').click();
    const shown = await page.getByText("Leave without saving?").isVisible().catch(() => false);
    check("1440 · ‹ Tasks with typed input asks Leave without saving?", shown);
    await page.locator('[data-testid="guard-stay"]').click();
    await page.waitForTimeout(300);
    check("1440 · Stay keeps the draft", (await input.inputValue()) === "10:30");
    await page.locator('[data-testid="rail-door-calendar"]').click();
    const shown2 = await page.getByText("Leave without saving?").isVisible().catch(() => false);
    check("1440 · another rail door also asks", shown2);
    await snap("draft-guard-1440");
    await page.locator('[data-testid="guard-leave"]').click();
    await page.waitForTimeout(500);
    check("1440 · Leave goes on (Calendar opens in the same area)", (await page.locator('[data-testid="right-area"]').getAttribute("data-view")) === "calendar");
    await page.locator('[data-testid="rail-door-tasks"]').click();
    await page.waitForTimeout(500);
    check("1440 · back on Tasks the list is where it was", (await page.locator('[data-testid="tasks-list"]').isVisible()));
  });

  await attempt("1440 delivery schedule", async () => {
    await page.locator('[data-task-row]').filter({ hasText: "Call NETS" }).first().click();
    await page.waitForSelector('[data-testid="task-panel-delivery"]', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const panel = page.locator('[data-testid="task-panel-delivery"]');
    const words = await panel.innerText();
    check("1440 · Call NETS opens the scheduled delivery editor, words governed",
      /Scheduled date/.test(words) && /Scheduled time \(optional\)/.test(words) && /Information received from/.test(words) && /Save scheduled delivery/.test(words)
      && !/Confirmed by/.test(words), "Scheduled date · Scheduled time (optional) · Information received from · Save scheduled delivery");
    const dateValue = await panel.locator('[data-testid="delivery-brief-dates-edit"] input').first().inputValue().catch(() => "");
    check("1440 · the editor opens empty (no prefill)", dateValue === "", dateValue);
    await snap("delivery-schedule-1440");
    /* Pick a date (next Wednesday) and the source, then save — SIMULATED. */
    await panel.locator('[data-testid="delivery-brief-dates-edit"] button').first().click();
    await page.waitForTimeout(400);
    const dayCell = page.locator('[role="dialog"] button, [data-radix-popper-content-wrapper] button').filter({ hasText: /^14$/ }).first();
    await dayCell.click().catch(() => {});
    await page.waitForTimeout(300);
    const source = panel.locator('[id^="delivery-brief-from-"]').first();
    await source.click().catch(() => {});
    await page.getByRole("option", { name: "NETS" }).click().catch(() => {});
    await page.waitForTimeout(300);
    await panel.getByRole("button", { name: /Save scheduled delivery/ }).click();
    await page.waitForSelector('[data-testid="tasks-result"]', { timeout: 15000 });
    const result = await text(page, '[data-testid="tasks-result"]');
    check("1440 · saving finishes the task: back in the list with the result line, SIMULATED", /Delivery scheduled/.test(result) && /SO-1296/.test(result) && /simulated/i.test(result), result.replace(/\n/g, " "));
    const tueCount = await page.locator('[data-testid^="task-section-20"]').nth(1).locator('[data-testid="section-count"]').innerText();
    check("1440 · the row left: Tuesday now 2", tueCount === "2", tueCount);
    await snap("delivery-result-1440");
  });

  await attempt("1440 PO duty", async () => {
    await page.locator('[data-task-row]').filter({ hasText: "Ask Nice Future when the goods will arrive" }).first().click();
    await page.waitForSelector('[data-testid="task-panel-po-duty"]', { timeout: 20000 });
    await page.waitForTimeout(800);
    const tabs = await page.locator('[data-testid="task-panel-po-duty"] nav button').evaluateAll((b) => b.map((x) => x.textContent));
    const body = await text(page, '[data-testid="task-po-duty"]');
    check("1440 · missed supplier date opens the PO host: Info · Purchase Order · Sales Order", tabs.join(" · ") === "Info · Purchase Order · Sales Order", tabs.join(" · "));
    check("1440 · lines read Order Qty · Received Qty · Pending Delivery Qty", /Order Qty/.test(body) && /Received Qty/.test(body) && /Pending Delivery Qty/.test(body));
    await page.locator('[data-testid="task-record-supplier-answer"]').click();
    await page.waitForTimeout(800);
    check("1440 · Record supplier answer opens the existing answer form", (await page.locator('[data-testid="po-answer-save"]').count()) === 1);
    await snap("po-duty-1440");
    await page.locator('[data-testid="tasks-back"]').click();
    await page.waitForTimeout(400);
    if (await page.getByText("Leave without saving?").isVisible().catch(() => false)) await page.locator('[data-testid="guard-leave"]').click();
  });

  await attempt("1440 receive", async () => {
    await page.locator('[data-task-row]').filter({ hasText: "Receive goods from Ohana" }).first().click();
    await page.waitForTimeout(800);
    await page.locator('[data-testid="task-receive"]').click();
    await page.waitForSelector('[data-testid="tasks-review"]', { timeout: 20000 });
    await page.waitForTimeout(1500);
    const reviewBox = await page.locator('[data-testid="tasks-review"]').boundingBox();
    check("1440 · Receive opens the submitted report's own session full width", (reviewBox?.width ?? 0) >= 1400 && (await page.locator('[data-testid="save-receiving-review"]').count()) === 1, `${Math.round(reviewBox?.width ?? 0)}px`);
    await snap("receive-full-width-1440");
    await page.locator('[data-testid="save-receiving-review"]').click();
    await page.waitForTimeout(1500);
    check("1440 · saving there returns to the SAME task", (await page.locator('[data-testid="tasks-review"]').count()) === 0
      && (await page.locator('[data-testid="tasks-task"]').count()) + (await page.locator('[data-testid="tasks-list"]:visible').count()) >= 1);
    if (await page.locator('[data-testid="tasks-back"]').isVisible().catch(() => false)) await page.locator('[data-testid="tasks-back"]').click();
    await page.waitForTimeout(800);
    const today = await page.locator('[data-testid^="task-rows-20"]').first().innerText().catch(() => "");
    check("1440 · the balance goes to PO Duty: Ask Ohana for the balance delivery date · 1 item still due", /Ask Ohana for the balance delivery date/.test(today) && /1 item still due/.test(today), today.replace(/\n/g, " | "));
    await snap("balance-po-duty-1440");
  });

  await attempt("1440 batch + issue", async () => {
    await page.locator('[data-task-row]').filter({ hasText: "Send 2 POs to Nice Future" }).first().click();
    await page.waitForSelector('[data-testid="task-panel-batch"]', { timeout: 20000 });
    await page.waitForTimeout(1500);
    check("1440 · a purchase batch opens its batch panel (local default until Purchasing A)", (await page.locator('[data-testid="po-window-pos"]').count()) === 1);
    await snap("batch-1440");
    await page.locator('[data-testid="tasks-back"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-task-row]').filter({ hasText: "Issue PO to Nice Future" }).first().click();
    await page.waitForSelector('[data-testid="task-batch-issue-po"]', { timeout: 20000 });
    const taskId = await page.locator('[data-testid="tasks-task"]').getAttribute("data-task");
    await page.locator('[data-testid="task-batch-issue-po"]').click();
    await page.waitForSelector('[data-testid="tasks-review"]', { timeout: 20000 });
    await page.waitForTimeout(2500);
    await snap("issue-review-1440");
    const issueButton = page.locator('[data-testid="tasks-review"] button').filter({ hasText: /^Issue/ }).last();
    await issueButton.click();
    await page.waitForTimeout(2500);
    const confirm = page.locator('[data-testid="tasks-review"] button, [role="dialog"] button').filter({ hasText: /^(Issue|Confirm)/ }).last();
    if (await page.locator('[data-testid="tasks-review"]').count()) await confirm.click().catch(() => {});
    await page.waitForTimeout(2500);
    const back = await page.locator('[data-testid="tasks-task"]').getAttribute("data-task").catch(() => null);
    check("1440 · after Issue PO the review closes and the SAME task is back", (await page.locator('[data-testid="tasks-review"]').count()) === 0 && back === taskId, `${back}`);
    await page.locator('[data-testid="tasks-back"]').click();
    await page.waitForTimeout(800);
    const missed = await page.locator('[data-testid="task-rows-missed"]').innerText();
    check("1440 · the row now reads Send PO to Nice Future (the new PO)", /Send PO to Nice Future\n.*-1104-V1|Send PO to Nice Future[\s\S]*1104/.test(missed), missed.split("\n").slice(0, 12).join(" | "));
    await snap("issued-1440");
  });

  await attempt("1440 DO page", async () => {
    const sat = page.locator('[data-testid^="task-section-20"]').nth(5);
    await sat.locator("button").first().click();
    await page.waitForTimeout(300);
    await page.locator('[data-task-row]').filter({ hasText: "Check delivery proof" }).first().click();
    await page.waitForTimeout(800);
    await page.locator('[data-testid="work-detail-open"]').click();
    await page.waitForSelector('[data-testid="task-do-page"]', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const doText = await text(page, '[data-testid="task-do-page"]');
    check("1440 · Check delivery proof opens the existing DO page", /DO-261003-2101/.test(doText), doText.slice(0, 80).replace(/\n/g, " "));
    await snap("do-page-1440");
    await page.locator('[data-testid="task-do-back"]').click();
    await page.waitForTimeout(500);
    check("1440 · ‹ Tasks from the DO page returns to the same task", (await page.locator('[data-testid="task-panel-do"]').count()) === 1);
  });

  await attempt("1440 close", async () => {
    await page.locator('[data-testid="tasks-back"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="tasks-close"]').click();
    await page.waitForTimeout(300);
    check("1440 · × closes the area", (await page.locator('[data-testid="right-area"]').getAttribute("data-view")) === "closed");
  });
  check("1440 · default walk: no page errors", errors.length === 0, errors.slice(0, 2).join(" ‖ "));
  await ctx.close();
}

/* ════ 1440 · list states ════════════════════════════════════════════════ */
if (run("states")) for (const [scenario, name, verify] of [
  ["loading", "loading: skeleton, no numbers, no badge", async (page) =>
    (await page.locator('[data-testid="tasks-loading"]').count()) === 1 && (await page.locator('[data-testid="section-count"]').count()) === 0
    && (await page.locator('[data-testid="rail-door-tasks"] [data-rail-badge]').count()) === 0],
  ["failed", "failed: Tasks could not be refreshed · Could not refresh Delivery · Try again, numbers kept", async (page) => {
    const t = await text(page, '[data-testid="tasks-failed"]');
    return /Tasks could not be refreshed/.test(t) && /Could not refresh Delivery/.test(t) && /Try again/.test(t) && (await count(page, "missed")) === "7";
  }],
  ["failed-no-data", "failed with nothing held: banner, no list, no 0, no badge", async (page) =>
    (await page.locator('[data-testid="tasks-failed"]').count()) === 1 && (await page.locator('[data-testid="section-count"]').count()) === 0
    && (await page.locator('[data-testid="rail-door-tasks"] [data-rail-badge]').count()) === 0],
  ["nothing", "nothing: Nothing assigned to you · this week", async (page) => /Nothing assigned to you/.test(await text(page, '[data-testid="tasks-nothing"]'))],
]) {
  const { page, ctx, errors, snap } = await open(1440, 900, scenario);
  await attempt(`1440 ${scenario}`, async () => {
    await page.locator('[data-testid="rail-door-tasks"]').click();
    await page.waitForTimeout(1500);
    check(`1440 · ${name}`, await verify(page));
    await snap(`state-${scenario}-1440`);
  });
  check(`1440 · ${scenario}: no page errors`, errors.length === 0, errors.slice(0, 2).join(" ‖ "));
  await ctx.close();
}

/* ════ reminder states, 1440 and 390 ═════════════════════════════════════ */
if (run("reminder")) for (const [width, height] of [[1440, 900], [390, 844]]) {
  const tag = String(width);
  {
    const { page, ctx, snap } = await open(width, height, "reminder-first-entry");
    await attempt(`${tag} reminder`, async () => {
      await page.waitForSelector('[data-testid="pending-work-line"]', { timeout: 15000 });
      const line = await text(page, '[data-testid="pending-work-line"]');
      const red = await page.locator('[data-testid="pending-work-line"] .text-danger').innerText();
      check(`${tag} · first entry today: Pending work · 3 missed · 5 due today (missed red)`, line === "3 missed · 5 due today" && red === "3 missed", line);
      const box = await page.getByRole("dialog").boundingBox();
      check(`${tag} · reminder fits the screen`, (box?.width ?? 9999) <= width && (box?.x ?? -1) >= 0, `${Math.round(box?.width ?? 0)}px`);
      await snap(`reminder-${tag}`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      check(`${tag} · Esc acknowledges only (no Tasks opened)`, (await page.locator('[data-testid="pending-work-line"]').count()) === 0 && (await page.locator('[data-testid="tasks-list"]:visible').count()) === 0);

    });
    await ctx.close();
  }
  {
    const { page, ctx, snap } = await open(width, height, "reminder-first-entry");
    await attempt(`${tag} reminder view`, async () => {
      await page.waitForSelector('[data-testid="pending-work-view"]', { timeout: 15000 });
      await page.locator('[data-testid="pending-work-view"]').click();
      await page.waitForTimeout(1500);
      check(`${tag} · View tasks opens the same list, Missed first, today open`, (await count(page, "missed")) === "3"
        && (await page.locator('[data-testid^="task-section-20"][data-open="true"] [data-testid="today-circle"]').count()) === 1);
      await snap(`reminder-view-${tag}`);
    });
    await ctx.close();
  }
  for (const [scenario, name, badge] of [
    ["reminder-zero", "zero tasks: no reminder", false],
    ["reminder-acknowledged", "already acknowledged today: no reminder, badge still red", true],
    ["reminder-draft", "draft open at entry: no reminder", true],
  ]) {
    const { page, ctx } = await open(width, height, scenario);
    await attempt(`${tag} ${scenario}`, async () => {
      await page.waitForTimeout(2500);
      const none = (await page.locator('[data-testid="pending-work-line"]').count()) === 0;
      const red = width >= 768 ? await page.locator('[data-testid="rail-door-tasks"] [data-rail-badge]').evaluate((el) => el.className.includes("bg-danger")).catch(() => false) : true;
      check(`${tag} · ${name}`, none && (!badge || red));
    });
    await ctx.close();
  }
}

/* ════ 390 · phone ═══════════════════════════════════════════════════════ */
if (run("phone")) {
  const { page, ctx, errors, snap } = await open(390, 844, "default");
  await attempt("390 phone", async () => {
    check("390 · Tasks door beside Calendar", (await page.locator('[data-testid="phone-tasks-door"]').count()) === 1);
    await page.locator('[data-testid="phone-tasks-door"]').click();
    await page.waitForSelector('[data-testid="tasks-list"]');
    await page.waitForTimeout(1200);
    const box = await page.locator('[data-testid="tasks-area"]').boundingBox();
    check("390 · the list is full screen", (box?.width ?? 0) >= 380, `${Math.round(box?.width ?? 0)}px`);
    check("390 · Missed 7 first, today open", (await count(page, "missed")) === "7" && (await page.locator('[data-testid="today-circle"]').count()) === 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("390 · no sideways page scroll", overflow <= 0, `${overflow}px`);
    await snap("phone-list-390");
    await page.locator('[data-task-row]').filter({ hasText: "Call AL" }).first().click();
    await page.waitForSelector('[data-testid="task-panel-delivery"]', { timeout: 20000 });
    await page.waitForTimeout(1500);
    check("390 · a task opens full screen with ‹ Tasks", (await page.locator('[data-testid="tasks-back"]').isVisible()));
    const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("390 · task: no sideways page scroll", overflow2 <= 0, `${overflow2}px`);
    await snap("phone-task-390");
    await page.locator('[data-testid="tasks-back"]').click();
    await page.waitForTimeout(500);
    check("390 · ‹ Tasks returns to the list", await page.locator('[data-testid="tasks-list"]').isVisible());
  });
  check("390 · phone walk: no page errors", errors.length === 0, errors.slice(0, 2).join(" ‖ "));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
