#!/usr/bin/env node
/**
 * Compact module card — parity with the owner's reference page.
 *
 * Drives docs/ui-reference/module-card-reference.html (owner handoff
 * 2026-10-04) and the kit `CompactModuleCard` on /ui through the SAME clicks,
 * then compares every visible card element: geometry relative to the card
 * within 0.6px, plus font, colours, borders, radius and padding. Reference
 * browser widths 1146 · 480 · 440 · 420 · 390 equal card widths
 * 560 · 440 · 416 · 396 · 366.
 *
 * Owner-approved deviations from the reference page (2026-10-04 rules) are
 * listed in APPROVED and reported separately, never silently passed.
 *
 * Usage: node scripts/compact-card-states.mjs [baseUrl=http://localhost:5173] [--json out.json]
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF_URL = `file://${join(ROOT, "docs/ui-reference/module-card-reference.html")}`;
const BASE = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:5173";
const JSON_OUT = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
const WIDTHS = { 1146: 560, 480: 440, 440: 416, 420: 396, 390: 366 };
const KEYS = ["fontSize", "fontWeight", "lineHeight", "color", "backgroundColor", "borderTop", "borderRight", "borderBottom", "borderLeft", "borderRadius", "padding"];
const TOL = 0.6;
const LONG = "TEST long customer name to check that the header grows instead of overflowing";

const click = (p, role, name) => p.getByRole(role, { name, exact: true }).first().click();
const delivery = (p) => click(p, "button", "Delivery");
const comm = (p) => click(p, "button", "Communication");
const menu = async (p) => { await comm(p); await click(p, "button", "Message options"); };
const STATES = {
  "Info · default": async () => {},
  "Info · sales closed": (p) => click(p, "button", "Order details"),
  "Info · address closed": (p) => click(p, "button", "Delivery address"),
  "Info · items": (p) => click(p, "button", "Items"),
  "Info · long name": (p) => (typeof p.page === "function" ? p.page() : p).evaluate((t) => {
    const root = document.querySelector('[data-testid="compact-card-frame"]') ?? document;
    root.querySelector("header strong").textContent = t;
  }, LONG),
  "Delivery · default": delivery,
  "Delivery · sales open": async (p) => { await delivery(p); await click(p, "button", "Order details"); },
  "Delivery · Logistics editor": async (p) => { await delivery(p); await p.getByRole("button", { name: /^Logistics/ }).click(); },
  "Delivery · Confirmed Delivery editor": async (p) => { await delivery(p); await p.getByRole("button", { name: /^Confirmed Delivery/ }).click(); },
  "Delivery · DO conditions": async (p) => { await delivery(p); await p.getByRole("button", { name: /^DO/ }).click(); },
  "Delivery · Stock opens items": async (p) => { await delivery(p); await p.getByRole("button", { name: /^Stock/ }).click(); },
  "Delivery · items": async (p) => { await delivery(p); await click(p, "button", "Items"); },
  "Communication · WhatsApp": comm,
  "Communication · Email": async (p) => { await comm(p); await p.getByRole("combobox", { name: "Communication channel" }).selectOption("email"); },
  "Communication · ⋯ menu": menu,
  "Communication · Find template": async (p) => { await menu(p); await click(p, "button", "Find template…"); },
  "Communication · Manage templates": async (p) => { await menu(p); await click(p, "button", "Manage templates…"); },
  "Timeline": (p) => click(p, "button", "Show timeline"),
};
/** Owner rules 2026-10-04 that differ from the reference page on purpose. */
const APPROVED = {
  "Delivery · DO conditions": "DO: one condition per line (reference shows two per line on wide cards)",
};
const INFO_DIVIDER = "Info strip keeps the Paid | Outstanding divider on narrow cards (reference drops it through a Delivery-only rule)";

function snap(keys) {
  const panel = document.querySelector('[data-testid="compact-card-frame"] section') ?? document.querySelector("#complete-panel");
  const o = panel.getBoundingClientRect();
  // Content anchors: everything the operator sees or presses — text, controls, icons and the
  // main regions. Pure layout wrappers are skipped so a wrapper difference cannot hide or fake a change.
  const ANCHOR = new Set(["HEADER", "NAV", "ASIDE", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "TABLE", "TH", "TD", "OL", "LI", "H2", "TIME", "svg"]);
  const els = [panel, ...panel.querySelectorAll("*")]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden" && e.tagName !== "DIALOG" && !e.closest("dialog"); })
    .filter((e) => e === panel || ANCHOR.has(e.tagName) || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    .map((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e), st = {}; keys.forEach((k) => { st[k] = cs[k]; });
      return { tag: e.tagName, text: [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim().slice(0, 30), x: r.x - o.x, y: r.y - o.y, w: r.width, h: r.height, st }; });
  const part = (sel) => { const e = panel.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().height * 10) / 10 : 0; };
  return { els, height: Math.round(o.height * 10) / 10, header: part("header") };
}

const browser = await chromium.launch();
let failures = 0, approved = 0;
const report = {};
for (const [refW, cardW] of Object.entries(WIDTHS)) {
  const ref = await browser.newPage({ viewport: { width: +refW, height: 900 } });
  const kit = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  for (const [name, act] of Object.entries(STATES)) {
    await ref.goto("about:blank"); await ref.goto(REF_URL);
    await ref.evaluate(() => { try { localStorage.clear(); } catch { /* none */ } });
    await kit.goto("about:blank"); await kit.goto(`${BASE}/ui#compact-card`, { waitUntil: "networkidle" });
    await kit.evaluate(() => { try { localStorage.clear(); } catch { /* none */ } });
    await kit.getByTestId(`card-width-${cardW}`).click();
    await kit.getByTestId("card-state-info").click();
    const card = kit.getByTestId("compact-card-frame");
    await act(ref); await act(card);
    await ref.mouse.move(0, 0); await kit.mouse.move(0, 0);
    const a = await ref.evaluate(snap, KEYS), b = await kit.evaluate(snap, KEYS);
    const diffs = [];
    for (let i = 0; i < Math.max(a.els.length, b.els.length); i++) {
      const x = a.els[i], y = b.els[i];
      if (!x || !y) { diffs.push(`#${i} ${x ? `missing ${x.tag} "${x.text}"` : `extra ${y.tag} "${y.text}"`}`); continue; }
      const d = [];
      if (x.tag !== y.tag) d.push(`tag ${x.tag}→${y.tag}`);
      for (const k of ["x", "y", "w", "h"]) if (Math.abs(x[k] - y[k]) > TOL) d.push(`${k} ${x[k].toFixed(1)}→${y[k].toFixed(1)}`);
      for (const k of KEYS) if (x.st[k] !== y.st[k]) d.push(`${k} ${x.st[k]}→${y.st[k]}`);
      if (d.length) diffs.push(`#${i} ${x.tag} "${x.text}": ${d.join("; ")}`);
    }
    // The kept divider costs the middle Info cell 1px of width on narrow cards; nothing else may differ.
    const infoDivider = cardW <= 400 && diffs.length > 0 && diffs.every((l) => { const m = /"(Paid|RM1,380\.00)": w ([\d.]+)→([\d.]+)$/.exec(l); return !!m && Math.abs(m[2] - m[3] - 1) < 0.05; });
    const why = APPROVED[name] ?? (infoDivider ? INFO_DIVIDER : null);
    if (diffs.length && why) approved++; else failures += diffs.length;
    report[`${refW}|${name}`] = { cardWidth: cardW, reference: { height: a.height, header: a.header }, component: { height: b.height, header: b.header }, differing: diffs.length, approved: why };
    console.log(`${refW}px · ${name}: card ${b.height}px (reference ${a.height}px) · ${diffs.length ? (why ? `APPROVED DEVIATION — ${why}` : `${diffs.length} DIFF`) : "match"}`);
    if (!why) for (const l of diffs.slice(0, 10)) console.log(`    ${l}`);
  }
  await ref.close(); await kit.close();
}
await browser.close();
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
console.log(`\n${failures ? `${failures} unexplained differences` : "No unexplained differences"} · ${approved} approved deviation(s)`);
process.exit(failures ? 1 : 0);
