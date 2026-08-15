/**
 * ⭐ A PILL IS A CAPSULE — owner ruling 2026-08-15 (Chai), re-ruling
 * `docs/01-design-tokens.md` §4.
 *
 * **Shape cannot be proved by checksum**, which is why the PR carries
 * screenshots. What a test CAN hold is the thing that silently drifts back: a
 * pill re-acquiring the 4px class, or the 4px row quietly re-claiming "pill"
 * in the machine record and taking the next component with it.
 *
 * The checkbox is the exception and it is the reason the 4px value still
 * exists: a fully rounded 16px checkbox is a RADIO BUTTON — a different
 * control with a different meaning — so this is a shape that carries business
 * meaning, not a taste.
 *
 * `rounded-pill` KEEPS ITS NAME (§0: a label is presentation, an identifier is
 * a contract). The row's USE column is the law, not its historical spelling.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import StatusPill from "./StatusPill";
import Badge from "./Badge";
import Checkbox from "./Checkbox";
import { RADII } from "./tokens";

const here = dirname(fileURLToPath(import.meta.url));

describe("the radius law · a pill is a capsule", () => {
  it("the 4px row names the checkbox and NOTHING else", () => {
    const four = RADII.find((r) => r.px === 4)!;
    expect(four.use).toBe("checkbox");
    expect(four.use).not.toContain("pill");
    expect(four.use).not.toContain("tag");
  });

  it("`rounded-full` is where pills and small tags now live", () => {
    const full = RADII.find((r) => r.px === null)!;
    expect(full.use).toContain("pill");
    expect(full.use).toContain("small tag");
  });

  it("StatusPill and Badge render as capsules", () => {
    render(
      <>
        <StatusPill tone="info">Placed</StatusPill>
        <Badge>7</Badge>
      </>,
    );
    /* StatusPill truncates its label in an inner span, so the shape lives on
       the ancestor that draws the capsule — walk up to whichever element owns
       a radius rather than guessing the component's internals. */
    for (const text of ["Placed", "7"]) {
      let el: HTMLElement | null = screen.getByText(text);
      while (el && !/rounded-/.test(el.className)) el = el.parentElement;
      expect(el, `nothing around "${text}" draws a radius`).not.toBeNull();
      expect(el!.className).toContain("rounded-full");
      expect(el!.className).not.toContain("rounded-pill");
    }
  });

  it("the checkbox keeps 4px — a fully rounded checkbox is a radio button", () => {
    const { container } = render(<Checkbox checked={false} onChange={() => {}} label="Pick" />);
    expect(container.innerHTML).toContain("rounded-pill");
    expect(container.innerHTML).not.toContain("rounded-full");
  });

  /**
   * The sweep, held as a rule rather than a number: `Checkbox.tsx` is the ONE
   * kit component allowed to spell the 4px class. `tokens.ts` names it because
   * it IS the record. Anything else reaching for it is the drift this ruling
   * exists to stop.
   */
  it("no kit component but Checkbox spells the 4px class", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(here)) {
      if (!file.endsWith(".tsx") && !file.endsWith(".ts")) continue;
      if (file.includes(".test.")) continue;
      if (file === "Checkbox.tsx" || file === "tokens.ts") continue;
      if (readFileSync(join(here, file), "utf8").includes("rounded-pill")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
