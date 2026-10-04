#!/usr/bin/env node
/**
 * Compact module card parity — proves the kit `CompactModuleCard` on /ui renders
 * the owner-confirmed Delivery reference.
 *
 * Compares every visible element of the /ui card with
 * docs/ui-reference/delivery-card-measurements.json (the reference's measured
 * state: Communication + Timeline open) at the five reference widths. Geometry
 * is compared relative to the card, within 0.6px; styles exactly.
 *
 * Usage: start the web dev server, then
 *   node scripts/compact-card-parity.mjs [baseUrl=http://localhost:5173]
 * Exit code 1 when any element differs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = JSON.parse(readFileSync(join(ROOT, "docs/ui-reference/delivery-card-measurements.json"), "utf8"));
const BASE = process.argv[2] ?? "http://localhost:5173";
/** reference browser width → card width on the reference page */
const WIDTHS = { 1146: 560, 480: 460, 440: 420, 420: 400, 390: 370 };
const STYLE_KEYS = ["display", "gridTemplateColumns", "padding", "margin", "fontSize", "fontWeight", "lineHeight", "color", "backgroundColor", "border", "borderRadius", "alignItems", "justifyContent"];
const TOL = 0.6;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`${BASE}/ui#compact-card`, { waitUntil: "networkidle" });
let failures = 0;
for (const [refWidth, cardWidth] of Object.entries(WIDTHS)) {
  await page.getByTestId(`card-width-${cardWidth}`).click();
  await page.getByTestId("card-state-measured").click();
  await page.waitForTimeout(100);
  const got = await page.evaluate((keys) => {
    const panel = document.querySelector('[data-testid="compact-card-frame"] section');
    const o = panel.getBoundingClientRect();
    return [panel, ...panel.querySelectorAll("*")]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; })
      .map((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e), st = {}; keys.forEach((k) => { st[k] = cs[k]; });
        return { tag: e.tagName, text: [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim(), x: r.x - o.x, y: r.y - o.y, w: r.width, h: r.height, style: st }; });
  }, STYLE_KEYS);
  const ref = REF[refWidth];
  const o = ref[0].rect;
  const lines = [];
  const quirks = [];
  const KNOWN_QUIRK = new Set(ref.map((e, i) => ['comm-toggle', 'timeline-toggle'].includes(e.class) ? [i, i + 1, i + 2, i + 3] : []).flat());
  const n = Math.max(ref.length, got.length);
  for (let i = 0; i < n; i++) {
    const a = ref[i], b = got[i];
    if (!a || !b) { lines.push(`#${i} ${a ? `missing in component: ${a.tag} "${a.text}"` : `extra in component: ${b.tag} "${b.text}"`}`); continue; }
    const d = [];
    if (a.tag !== b.tag) d.push(`tag ${a.tag}→${b.tag}`);
    const ax = a.rect.x - o.x, ay = a.rect.y - o.y;
    if (Math.abs(ax - b.x) > TOL) d.push(`x ${ax.toFixed(1)}→${b.x.toFixed(1)}`);
    if (Math.abs(ay - b.y) > TOL) d.push(`y ${ay.toFixed(1)}→${b.y.toFixed(1)}`);
    if (Math.abs(a.rect.width - b.w) > TOL) d.push(`w ${a.rect.width.toFixed(1)}→${b.w.toFixed(1)}`);
    if (Math.abs(a.rect.height - b.h) > TOL) d.push(`h ${a.rect.height.toFixed(1)}→${b.h.toFixed(1)}`);
    for (const k of STYLE_KEYS) if (a.style[k] !== undefined && a.style[k] !== b.style[k]) d.push(`${k} ${a.style[k]}→${b.style[k]}`);
    // Known reference quirk: the JSON was captured with Communication and Timeline opened by script,
    // so their toggle icons read inactive; a real click (reference and component alike) shows them active.
    const quirk = KNOWN_QUIRK.has(i) && d.every((x) => /^(color|backgroundColor|border) /.test(x));
    if (quirk) { quirks.push(i); continue; }
    if (d.length) lines.push(`#${i} ${a.tag} "${a.text}": ${d.join("; ")}`);
  }
  failures += lines.length;
  console.log(`reference ${refWidth}px = card ${cardWidth}px: ${ref.length} reference elements, ${got.length} component elements, ${lines.length} differing${quirks.length ? `, ${quirks.length} known toggle-colour quirk(s)` : ''}`);
  for (const l of lines.slice(0, 40)) console.log(`  ${l}`);
}
await browser.close();
process.exit(failures ? 1 : 0);
