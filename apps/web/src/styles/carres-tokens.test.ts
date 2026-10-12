import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The app's colours follow the kit (01 §1 · §9): Blue is the default, the page
 * ground is one grey in every theme, a theme changes only the selection
 * colours, and red is not used. Blue's values are read from the kit's own
 * token file so the app and the kit cannot disagree.
 */
const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "carres-tokens.css"), "utf8");
const kit = readFileSync(join(here, "..", "..", "..", "..", "docs", "ui", "carres-tokens.css"), "utf8");
const tailwind = readFileSync(join(here, "..", "..", "tailwind.config.ts"), "utf8");

const theme = (css: string, key: string) => css.match(new RegExp(`\\[data-theme="${key}"\\]\\{([^}]*)\\}`))![1]!;
const value = (block: string, name: string) => block.match(new RegExp(`--c-${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];

describe("Carres tokens: hover follows the theme", () => {
  it("Blue takes the kit's hover, row hover and selection pair", () => {
    const root = app.slice(app.indexOf(":root{"), app.indexOf("}", app.indexOf(":root{")));
    const [mine, theirs] = [theme(app, "blue"), theme(kit, "blue")];
    expect(value(root, "hover")).toBe(value(theirs, "hover"));
    expect(value(root, "row-hover")).toBe(value(theirs, "row-hover"));
    expect(value(mine, "select-fg")).toBe(value(theirs, "select-fg"));
    // The app's selected fill is the kit's soft selection fill; its pill is the kit's selected fill.
    expect(value(mine, "select-bg")).toBe(value(theirs, "select-soft"));
    expect(value(mine, "select-pill")).toBe(value(theirs, "select-bg"));
  });

  it("Blue is the default: the root holds its values, and no warm value is left", () => {
    const root = app.slice(app.indexOf(":root{"), app.indexOf("}", app.indexOf(":root{")));
    expect(value(root, "hover")).toBe("#E2E4E8");
    expect(value(root, "row-hover")).toBe("#F2F3F5");
    expect(value(root, "select-fg")).toBe("#2F55E0");
    expect(value(root, "ground")).toBe("#F6F7F9");
    expect(value(root, "ink")).toBe("#1F2937");
    expect(value(root, "main")).toBe("#1B1B39");
    expect(app).not.toMatch(/#F5F3F0|#EFECE8|#EEECE8|#221F20/i);
  });

  it("the page ground is one grey in every theme: a theme changes only the selection colours", () => {
    for (const key of ["blue", "slate", "teal", "violet", "carres", "honey", "olive", "rose", "latte"]) {
      const block = theme(app, key);
      expect(block, key).not.toMatch(/--c-ground|--c-hover|--c-row-hover/);
      expect(block.match(/--c-[a-z-]+/g), key).toEqual(["--c-select-bg", "--c-select-fg", "--c-select-pill"]);
    }
  });

  it("red is not used: an error is the amber pair", () => {
    const root = app.slice(app.indexOf(":root{"), app.indexOf("}", app.indexOf(":root{")));
    expect(value(root, "err-bg")).toBe(value(root, "warn-bg"));
    expect(value(root, "err-fg")).toBe(value(root, "warn-fg"));
  });

  it("every hover class reads a theme token, never a fixed colour", () => {
    expect(tailwind).toContain('hovertint: "var(--c-row-hover)"');
    expect(tailwind).toContain('hover: "var(--c-hover)"');
    expect(tailwind).toContain('"row-hover": "var(--c-row-hover)"');
    expect(readFileSync(join(here, "..", "index.css"), "utf8")).not.toMatch(/--hover-tint\s*:/);
  });
});
