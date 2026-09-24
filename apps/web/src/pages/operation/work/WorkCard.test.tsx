import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WorkCard, { workDateStatus } from "./WorkCard";
import type { WorkRow } from "../use-open-work";

const row = (over: Partial<WorkRow> = {}) => ({
  id: "delivery:1:follow", module: "delivery", ruleKey: "follow", soRef: "SO-1318",
  problem: "Not delivered", action: "Arrange a new delivery date", recipient: "NETS",
  dueIso: "2026-09-15", timingBucket: "overdue", locked: false, ...over,
}) as unknown as WorkRow;

describe("workDateStatus — exactly one date-status badge", () => {
  it("reads MISSED for a passed date, TODAY, UPCOMING, and NO DATE", () => {
    expect(workDateStatus({ timingBucket: "later", dueIso: "2026-09-16" }, "2026-09-17")).toBe("missed");
    expect(workDateStatus({ timingBucket: "overdue", dueIso: "2026-09-15" }, "2026-09-17")).toBe("missed");
    expect(workDateStatus({ timingBucket: "today", dueIso: "2026-09-17" }, "2026-09-17")).toBe("today");
    expect(workDateStatus({ timingBucket: "later", dueIso: "2026-09-18" }, "2026-09-17")).toBe("upcoming");
    expect(workDateStatus({ timingBucket: "no_date", dueIso: null }, "2026-09-17")).toBe("no_date");
  });
});

describe("WorkCard", () => {
  it("is a fixed 124px card: date rail, module · party, fact, action, document and one door", () => {
    const select = vi.fn();
    const open = vi.fn();
    render(<WorkCard item={row()} moduleLabel="Delivery" action="Arrange a new delivery date" today="2026-09-17" selected={false} onSelect={select} onOpenRecord={open} />);
    const card = screen.getByTestId("work-row-SO-1318-follow");
    expect(card.className).toContain("h-[124px]");
    expect(card.className).not.toMatch(/shadow/);
    expect(card).toHaveTextContent("Tue15Missed");
    expect(card).toHaveTextContent("Delivery· NETS");
    expect(card.getAttribute("aria-label")).toContain("Tuesday, 15 September 2026");
    fireEvent.click(screen.getByRole("button", { name: "Open SO-1318 in Delivery" }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
    fireEvent.keyDown(card, { key: "Enter" });
    expect(select).toHaveBeenCalledTimes(1);
  });
});
