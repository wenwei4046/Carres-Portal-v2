import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const apiIndex = readFileSync(resolve(here, "../index.ts"), "utf8");

describe("legacy PO-day task retirement", () => {
  it("does not schedule a second task beside the shared Work feed", () => {
    expect(apiIndex).not.toContain("runPoDutyCron");
    expect(existsSync(resolve(here, "po-duty.ts"))).toBe(false);
  });
});
