import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The hover fill follows the person's theme (01 §1 · §9). In Blue a pointed-at
 * menu item is the kit's grey and a pointed-at row its lighter grey; neither
 * is the shared warm fill the 9 Oct build gave every theme. The values are
 * read from the kit's own token file so the app and the kit cannot disagree.
 */
const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "carres-tokens.css"), "utf8");
const kit = readFileSync(join(here, "..", "..", "..", "..", "docs", "ui", "carres-tokens.css"), "utf8");
const tailwind = readFileSync(join(here, "..", "..", "tailwind.config.ts"), "utf8");

const theme = (css: string, key: string) => css.match(new RegExp(`\\[data-theme="${key}"\\]\\{([^}]*)\\}`))![1]!;
const value = (block: string, name: string) => block.match(new RegExp(`--c-${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];

describe("Carres tokens: hover follows the theme", () => {
  it("Blue takes the kit's hover, row hover and selection pair", () => {
    const [mine, theirs] = [theme(app, "blue"), theme(kit, "blue")];
    expect(value(mine, "hover")).toBe(value(theirs, "hover"));
    expect(value(mine, "row-hover")).toBe(value(theirs, "row-hover"));
    expect(value(mine, "select-fg")).toBe(value(theirs, "select-fg"));
    // The app's selected fill is the kit's soft selection fill.
    expect(value(mine, "select-bg")).toBe(value(theirs, "select-soft"));
    expect(value(mine, "hover")).toBe("#E2E4E8");
    expect(value(mine, "row-hover")).toBe("#F2F3F5");
  });

  it("Blue never falls back to the shared warm hover", () => {
    const root = app.slice(app.indexOf(":root{"), app.indexOf("}", app.indexOf(":root{")));
    for (const name of ["hover", "row-hover"]) {
      expect(value(theme(app, "blue"), name), name).toBeDefined();
      expect(value(theme(app, "blue"), name), name).not.toBe(value(root, name));
    }
  });

  it("every hover class reads a theme token, never a fixed colour", () => {
    expect(tailwind).toContain('hovertint: "var(--c-row-hover)"');
    expect(tailwind).toContain('hover: "var(--c-hover)"');
    expect(tailwind).toContain('"row-hover": "var(--c-row-hover)"');
    expect(readFileSync(join(here, "..", "index.css"), "utf8")).not.toMatch(/--hover-tint\s*:/);
  });
});
