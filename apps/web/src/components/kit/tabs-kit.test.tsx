import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Tabs from "./Tabs";

/**
 * The kit's frame rules that every page takes from one place (01 §§2–4; the
 * package's own check measures them on the live page): tabs are the one
 * segmented control, card titles are 15/500 and the page title 20/600, and the
 * top bar carries its bottom hairline.
 */
const here = dirname(fileURLToPath(import.meta.url));
const TABS = [{ value: "a", label: "Open" }, { value: "b", label: "Delivered" }];

describe("Tabs: the one segmented control", () => {
  it.each(["underline", "segmented"] as const)("variant %s draws the grey track with the selected pill", (variant) => {
    render(<Tabs tabs={TABS} value="a" onValueChange={() => {}} label="Views" variant={variant} />);
    const list = screen.getByRole("tablist", { name: "Views" });
    expect(list.className).toContain("bg-c-track");
    expect(list.className).toContain("rounded-[10px]");
    expect(list.className).toContain("p-[3px]");
    const [on, off] = screen.getAllByRole("tab");
    // selected 500 on the theme's pill; the others 400 in the quiet grey
    expect(on!.className).toContain("data-[state=active]:font-medium");
    expect(on!.className).toContain("data-[state=active]:bg-c-select-pill");
    expect(on!.className).toContain("data-[state=active]:text-c-select-fg");
    expect(off!.className).toContain("data-[state=inactive]:font-normal");
    expect(off!.className).not.toContain("font-semibold");
    expect(on!.className).toContain("px-3");
    expect(on!.className).toContain("py-[5px]");
    expect(on!.className).toContain("text-body");
  });
});

describe("type pairs and the top bar", () => {
  const tailwind = readFileSync(join(here, "..", "..", "..", "tailwind.config.ts"), "utf8");

  it("a card or panel title is 15/500 and the page title 20/600", () => {
    expect(tailwind).toMatch(/strong: \["15px", \{ lineHeight: "22px", fontWeight: "500" \}\]/);
    expect(tailwind).toMatch(/page: \["20px", \{ lineHeight: "28px", fontWeight: "600" \}\]/);
    expect(tailwind).not.toMatch(/fontSize: \{[\s\S]{0,900}"24px"/);
  });

  it("the top bar is 56 high with its bottom hairline", () => {
    const header = readFileSync(join(here, "..", "..", "pages", "operation", "components", "ShellHeader.tsx"), "utf8");
    expect(header).toContain("h-14");
    expect(header).toContain("border-b border-c-head-line");
  });
});
