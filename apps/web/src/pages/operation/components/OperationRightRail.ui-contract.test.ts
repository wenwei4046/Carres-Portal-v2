import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(here, path), "utf8");

describe("ERP Shell V1 quick rail contract", () => {
  it("uses the approved four panels in order and governed width", () => {
    const src = read("OperationRightRail.tsx");
    expect(src).toContain('label: "Team"');
    expect(src).toContain('label: "Calendar"');
    expect(src).toContain('label: "My Work"');
    expect(src).toContain('label: "Activity"');
    expect(src).not.toContain('label: "Follow-ups"');
    expect(src).toContain("w-[340px]");
  });

  it("keeps Team an ERP-wide people snapshot with PO and GRN duty", () => {
    const src = read("rail/TeamPanel.tsx");
    expect(src).toContain("PO Duty");
    expect(src).toContain("GRN Duty");
    expect(src).toContain("View Team Work");
    expect(src).not.toContain("Issue PO");
    expect(src).not.toContain("Confirm ready date");
  });

  it("keeps Calendar about dated events instead of action taxonomy", () => {
    const src = read("rail/CalendarPanel.tsx");
    expect(src).not.toContain("No POs to send this day.");
    expect(src).not.toContain("Nothing arriving this day.");
    expect(src).not.toContain("No deliveries booked this day.");
  });

  it("makes My Work derived and removes generic manual workflow controls", () => {
    const src = read("rail/TasksPanel.tsx");
    expect(src).toContain("Overdue");
    expect(src).toContain("Today");
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
