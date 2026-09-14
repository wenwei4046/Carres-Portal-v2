/**
 * ⛔ THE INTEGRATION TRIPWIRE.
 *
 * BUILD A (the Schedule UI) and BUILD B (the Schedule projection) were built
 * in parallel against a written contract. `warehouse-schedule-source.ts` is
 * the seam that let that happen, and a seam is exactly the kind of thing that
 * ships by accident: it compiles, it renders, and the page looks finished
 * because an empty board with an error banner is a legitimate state.
 *
 * So the seam is not allowed to be a judgement call. This test reads the
 * source file and FAILS while it still contains its own implementation —
 * there is no reviewer discipline involved, and no way to merge the UI wired
 * to a stub that would show an operator an empty warehouse day.
 *
 * It goes green the moment the file is B's re-export and nothing else.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE = join(
  dirname(fileURLToPath(import.meta.url)),
  "warehouse-schedule-source.ts",
);

describe("the Schedule data seam", () => {
  it("is wired to BUILD B's governed hook, not to a local stand-in", () => {
    const text = readFileSync(SOURCE, "utf8");
    const code = text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .trim();

    expect(
      code,
      "warehouse-schedule-source.ts must re-export ./useWarehouseSchedule — " +
        "the parallel-build stub may not reach production",
    ).toMatch(/export\s*\{[^}]*useWarehouseSchedule[^}]*\}\s*from\s*["']\.\/useWarehouseSchedule["']/);

    /* A re-export and nothing else: no fixture array, no invented window. */
    expect(code).not.toMatch(/\bfunction\s+useWarehouseSchedule\b/);
    expect(code).not.toMatch(/plainWindow/);
  });
});
