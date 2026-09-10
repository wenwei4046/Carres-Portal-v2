import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(here, path), "utf8");

describe("ERP Shell V1 quick rail contract", () => {
  it("keeps Work as one navigation peek and uses the governed width", () => {
    const src = read("OperationRightRail.tsx");
    expect(src).not.toContain('label: "Team"');
    expect(src).toContain('label: "Calendar"');
    expect(src).toContain('label: "My Work"');
    expect(src).toContain('label: "Activity"');
    expect(src).not.toContain('label: "Follow-ups"');
    expect(src).toContain("w-[340px]");
  });

  /**
   * The rail's My Work is the `Work` destination's PEEK (ui/MASTER.md §5), so
   * it wears that destination's face — owner ruling 2026-08-15. It used to
   * wear the Flag borrowed from the Orders follow-up column, a different
   * system entirely. One TABS entry drives both the collapsed icon strip and
   * the expanded panel header, so the two states cannot drift apart.
   */
  it("gives My Work the same icon as the left-navigation Work destination", () => {
    const rail = read("OperationRightRail.tsx");
    const nav = read("../../portal/portal-nav.ts");
    const navIcon = /\{\s*key:\s*"work",[^}]*icon:\s*(\w+)/.exec(nav)?.[1];
    expect(navIcon).toBe("ListTodo");
    expect(rail).toMatch(
      new RegExp(`key:\\s*"tasks",\\s*label:\\s*"My Work",\\s*icon:\\s*${navIcon}\\b`),
    );
    expect(rail).not.toContain("icon: Flag");
  });

  it("does not put duty editing or a second Team queue in Quick Rail", () => {
    const src = read("OperationRightRail.tsx");
    expect(src).not.toContain("TeamPanel");
    expect(src).not.toContain("useUpdatePoDuty");
  });

  it("keeps Calendar about dated events instead of action taxonomy", () => {
    const src = read("rail/CalendarPanel.tsx");
    expect(src).not.toContain("No POs to send this day.");
    expect(src).not.toContain("Nothing arriving this day.");
    expect(src).not.toContain("No deliveries booked this day.");
  });

  it("makes My Work derived and removes generic manual workflow controls", () => {
    const src = read("rail/TasksPanel.tsx");
    expect(src).toContain('label: "Late"');
    expect(src).toContain('label: "Due today"');
    expect(src).toContain('label: "Later"');
    expect(src).toContain("useOpenWorkSet");
    expect(src).not.toContain("/api/ops/tasks");
    expect(src).not.toContain("Add a task");
    expect(src).not.toContain("Take it");
    expect(src).not.toContain("Mark done");
  });

  it("uses compact Activity filters instead of permanent category and staff pills", () => {
    const src = read("GlobalActivity.tsx");
    expect(src).toContain("Type");
    expect(src).toContain("Person");
    expect(src).toContain("Module");
    expect(src).not.toContain("presentCategories.map");
  });
});
