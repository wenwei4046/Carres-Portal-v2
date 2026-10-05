#!/usr/bin/env node
/**
 * Tasks local walk — one screenshot of a state (DEV aid).
 *   node scripts/tasks-peek.mjs <url> <out.png> [width] [height] [click selectors separated by |]
 */
import { chromium } from "@playwright/test";

const [, , url, out, w = "1440", h = "900", click = ""] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on("pageerror", (e) => console.log("pageerror", String(e).slice(0, 400)));
page.on("console", (m) => { if (m.type() === "error") console.log("console.error", m.text().slice(0, 300)); });
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 240000 });
await page.waitForSelector('[data-testid="rail-door-tasks"], [data-testid="phone-tasks-door"]', { timeout: 240000 });
await page.waitForTimeout(2000);
for (const sel of click.split("|").filter(Boolean)) {
  await page.locator(sel).first().click();
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: out });
await browser.close();
