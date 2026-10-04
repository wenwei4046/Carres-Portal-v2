#!/usr/bin/env node
/**
 * Compact module card — state parity beyond the measured JSON.
 *
 * Drives the confirmed reference page (docs/ui-reference/delivery-card-approved.html)
 * and the kit `CompactModuleCard` on /ui through the SAME clicks, then compares
 * every visible element of the card (relative geometry within 0.6px, plus
 * font size/weight, colours, borders, radius). Reference browser widths
 * 1146 · 480 · 440 · 420 · 390 equal card widths 560 · 460 · 420 · 400 · 370.
 *
 * Usage: node scripts/compact-card-states.mjs [baseUrl=http://localhost:5173]
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF_URL = `file://${join(ROOT, "docs/ui-reference/delivery-card-approved.html")}`;
const BASE = process.argv[2] ?? "http://localhost:5173";
const WIDTHS = { 1146: 560, 480: 460, 440: 420, 420: 400, 390: 370 };
const KEYS = ["fontSize", "fontWeight", "lineHeight", "color", "backgroundColor", "borderTop", "borderRight", "borderBottom", "borderLeft", "borderRadius", "padding"];
const TOL = 0.6;

const comm = (p) => p.getByRole("button", { name: "Communication", exact: true }).click();
const menu = async (p) => { await comm(p); await p.getByRole("button", { name: "Message options" }).click(); };
const STATES = {
  "all closed": async () => {},
  "WhatsApp": comm,
  "Email + Subject": async (p) => { await comm(p); await p.getByRole("combobox", { name: "Communication channel" }).selectOption("email"); },
  "Message ⋯ menu": menu,
  "Find template": async (p) => { await menu(p); await p.getByRole("button", { name: "Find template…" }).click(); },
  "Manage templates (empty)": async (p) => { await menu(p); await p.getByRole("button", { name: "Manage templates…" }).click(); },
  "Logistics editor": (p) => p.getByRole("button", { name: /^Logistics/ }).click(),
  "Confirmed Delivery editor": (p) => p.getByRole("button", { name: /^Confirmed Delivery/ }).click(),
  "DO conditions": (p) => p.getByRole("button", { name: /^DO/ }).click(),
  "Stock opens items": (p) => p.getByRole("button", { name: /^Stock/ }).click(),
  "Items toggle": (p) => p.getByRole("button", { name: "Show delivery items" }).click(),
  "Address": (p) => p.getByRole("button", { name: "Show delivery address" }).click(),
  "Timeline": (p) => p.getByRole("button", { name: "Show timeline" }).click(),
};
const DIALOG = "Name template dialog";

function snap(keys) {
  const panel = document.querySelector('[data-testid="compact-card-frame"] section') ?? document.querySelector("#complete-panel");
  const o = panel.getBoundingClientRect();
  return [panel, ...panel.querySelectorAll("*")]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden" && e.tagName !== "DIALOG" && !e.closest("dialog"); })
    .map((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e), st = {}; keys.forEach((k) => { st[k] = cs[k]; });
      return { tag: e.tagName, text: [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim().slice(0, 30), x: r.x - o.x, y: r.y - o.y, w: r.width, h: r.height, st }; });
}
const dialogBox = () => { const d = document.querySelector("dialog[open]"); if (!d) return null; const r = d.getBoundingClientRect(); return { w: r.width, h: r.height }; };

const browser = await chromium.launch();
let failures = 0;
for (const [refW, cardW] of Object.entries(WIDTHS)) {
  const ref = await browser.newPage({ viewport: { width: +refW, height: 900 } });
  const kit = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  for (const [name, act] of [...Object.entries(STATES), [DIALOG, null]]) {
    await ref.goto(REF_URL);
    await ref.evaluate(() => { try { localStorage.clear(); } catch { /* none */ } });
    await kit.goto("about:blank");
    await kit.goto(`${BASE}/ui#compact-card`, { waitUntil: "networkidle" });
    await kit.evaluate(() => { try { localStorage.clear(); } catch { /* none */ } });
    await kit.getByTestId(`card-width-${cardW}`).click();
    await kit.getByTestId("card-state-closed").click();
    const card = kit.getByTestId("compact-card-frame");
    if (name === DIALOG) {
      await menu(ref); await ref.getByRole("button", { name: "Save as template…" }).click();
      await menu(card); await card.getByRole("button", { name: "Save as template…" }).click();
      const a = await ref.evaluate(dialogBox), b = await kit.evaluate(dialogBox);
      const ok = a && b && Math.abs(a.w - b.w) <= TOL && Math.abs(a.h - b.h) <= TOL;
      if (!ok) failures++;
      console.log(`${refW}px · ${name}: ${ok ? "match" : `DIFF ${JSON.stringify(a)} → ${JSON.stringify(b)}`}`);
      continue;
    }
    await act(ref); await act(card);
    const a = await ref.evaluate(snap, KEYS), b = await kit.evaluate(snap, KEYS);
    const diffs = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i], y = b[i];
      if (!x || !y) { diffs.push(`#${i} ${x ? `missing ${x.tag} "${x.text}"` : `extra ${y.tag} "${y.text}"`}`); continue; }
      const d = [];
      if (x.tag !== y.tag) d.push(`tag ${x.tag}→${y.tag}`);
      for (const k of ["x", "y", "w", "h"]) if (Math.abs(x[k] - y[k]) > TOL) d.push(`${k} ${x[k].toFixed(1)}→${y[k].toFixed(1)}`);
      for (const k of KEYS) if (x.st[k] !== y.st[k]) d.push(`${k} ${x.st[k]}→${y.st[k]}`);
      if (d.length) diffs.push(`#${i} ${x.tag} "${x.text}": ${d.join("; ")}`);
    }
    failures += diffs.length;
    console.log(`${refW}px · ${name}: ${a.length} elements, ${diffs.length ? `${diffs.length} DIFF` : "match"}`);
    for (const l of diffs.slice(0, 12)) console.log(`    ${l}`);
  }
  await ref.close(); await kit.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
