/**
 * The compact card, its words and its governing documents say the same thing.
 * Fails when a card word is missing from COPY-STANDARD, or when UI MASTER, the
 * card contract or the entry rules stop pointing at the kit component.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CARD_WORDS } from "./CompactModuleCard";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("compact module card authority", () => {
  const copy = read("docs/COPY-STANDARD.md");
  const start = copy.indexOf("## Compact module card words");
  const section = copy.slice(start, copy.indexOf("\n## ", start + 10));

  it("COPY-STANDARD has one card-words section", () => {
    expect(start).toBeGreaterThan(-1);
  });

  it("every fixed card word is in that section", () => {
    const missing = Object.entries(CARD_WORDS)
      .filter(([, v]) => typeof v === "string")
      .map(([k, v]) => [k, v as string])
      .filter(([, v]) => !section.includes(v));
    expect(missing).toEqual([]);
  });

  it("every Delivery word used by the /ui example is in that section, and retired words are gone", () => {
    for (const w of ["Customer", "Date not confirmed", "Date confirmed", "Not assigned", "Ready", "Service", "Morning", "Afternoon",
      "Choose the contact result.", "Choose the confirmed date.", "Choose the time.", "Choose the company.", "Customer date not recorded · Try again"]) {
      expect(section, w).toContain(w);
    }
    const example = read("apps/web/src/pages/dev/CompactCardExample.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(example).not.toMatch(/No logistics picked|Confirmed Delivery ▾|No confirmed date|<td>—<\/td>/);
  });

  it("the words the owner banned never appear in the component", () => {
    const src = read("apps/web/src/components/kit/CompactModuleCard.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/MYT|Order info|Saved in this preview/);
  });

  it("UI MASTER §0 and §4.3, the contract and the entry rules point at the component", () => {
    const master = read("docs/ui/MASTER.md");
    expect(master).toMatch(/\*\*Compact module card\*\*[^\n]*CompactModuleCard/);
    expect(master.slice(master.indexOf("## §4.3"))).toMatch(/CompactModuleCard/);
    expect(existsSync(join(ROOT, "docs/ui-reference/MODULE-CARD-TEMPLATE.md"))).toBe(true);
    expect(existsSync(join(ROOT, "docs/ui-reference/module-card-reference.html"))).toBe(true);
    expect(read("CLAUDE.md")).toMatch(/§0 Current kit index first[\s\S]*CompactModuleCard/);
    expect(read("AGENTS.md")).toMatch(/§0 Current kit index first/);
  });

  it("the retired reference link redirects to the shared card with its query string", () => {
    const redirects = read("apps/web/public/_redirects");
    expect(redirects).toMatch(/^\/ui-kit\/delivery-card\.html\s+\/ui-kit\/module-card\s+301$/m);
    expect(redirects).toMatch(/^\/ui-kit\/delivery-card\s+\/ui-kit\/module-card\s+301$/m);
    expect(redirects.indexOf("/ui-kit/delivery-card")).toBeLessThan(redirects.indexOf("/*"));
  });

  it("no document still points at the retired Delivery-only reference", () => {
    for (const p of ["docs/ui/MASTER.md", "docs/02-components.md", "docs/ui-reference/MODULE-CARD-TEMPLATE.md", "CLAUDE.md", "AGENTS.md", "docs/COPY-STANDARD.md", "docs/delivery/MASTER.md"]) {
      expect(read(p), p).not.toMatch(/delivery-card-approved|DELIVERY-CARD-TEMPLATE|delivery-card-measurements|compact-card-parity/);
    }
  });
});
