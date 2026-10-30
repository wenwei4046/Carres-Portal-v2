import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The current owner-supplied palette; retired theme attributes cannot fork it. */
const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "carres-tokens.css"), "utf8");
const tailwind = readFileSync(join(here, "..", "..", "tailwind.config.ts"), "utf8");
const root = app.slice(app.indexOf(":root{"), app.indexOf("}", app.indexOf(":root{")));
const value = (name: string) => root.match(new RegExp(`--c-${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];

describe("Carres current shared palette", () => {
  it("uses the approved blue selection and quiet hover", () => {
    expect(value("row-hover")).toBe("#EEF3FF");
    expect(value("select-bg")).toBe("#DCE6FD");
    expect(value("select-fg")).toBe("#2F55E0");
  });
  it("keeps readable ink and the shared page and main-action colours", () => {
    expect(value("ink")).toBe("#111827");
    expect(value("ground")).toBe("#F6F7F9");
    expect(value("main")).toBe("#1B1B39");
  });
  it("saved retired themes cannot override the one palette", () => {
    expect(app).not.toMatch(/\[data-theme=/);
  });
  it("danger and waiting use their distinct approved pairs", () => {
    expect(value("err-bg")).toBe("#FDE8E6");
    expect(value("err-fg")).toBe("#B42318");
  });
  it("hover classes consume the common tokens", () => {
    expect(tailwind).toContain('hovertint: "var(--c-row-hover)"');
    expect(tailwind).toContain('hover: "var(--c-hover)"');
    expect(tailwind).toContain('"row-hover": "var(--c-row-hover)"');
  });
});
