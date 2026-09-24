import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WorkCard, { WorkCardSkeleton, WorkListTabs, workDateStatus } from "./WorkCard";
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
  it("a future day prints no status word — `Upcoming` is banned (COPY Work timing)", () => {
    render(<WorkCard item={row({ dueIso: "2026-09-18", timingBucket: "later" } as never)} moduleLabel="Delivery" action="Arrange a new delivery date" today="2026-09-17" selected={false} onSelect={vi.fn()} onOpenRecord={vi.fn()} />);
    expect(document.body.textContent).not.toMatch(/upcoming/i);
  });


  it("is a fixed 104px card: date rail, module · party, fact, action, document and one door", () => {
    const select = vi.fn();
    const open = vi.fn();
    render(<WorkCard item={row()} moduleLabel="Delivery" action="Arrange a new delivery date" today="2026-09-17" selected={false} onSelect={select} onOpenRecord={open} />);
    const card = screen.getByTestId("work-row-SO-1318-follow");
    expect(card.className).toContain("h-[104px]");
    expect(card.className).toContain("grid-cols-[60px_minmax(0,1fr)]");
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

  /* THE OWNER DENSITY RULING 2026-09-25 — exact values, not a direction.
     A class is not a pixel; the production walk measures the computed
     styles. These lock the classes that decide them. */
  it("locks the exact density values: rail 60, weekday 11, date 22, problem 15, action 12, footer 28, icon 14", () => {
    render(<WorkCard item={row()} moduleLabel="Delivery" action="Arrange a new delivery date" today="2026-09-17" selected={false} onSelect={vi.fn()} onOpenRecord={vi.fn()} />);
    const card = screen.getByTestId("work-row-SO-1318-follow");
    const date = screen.getByTestId("work-card-date");
    expect(date.className).toContain("h-11");
    const [weekday, day] = Array.from(date.children) as HTMLElement[];
    expect(weekday.className).toContain("text-[11px]");
    expect(weekday.className).toContain("leading-[14px]");
    expect(day.className).toContain("text-[22px]");
    expect(day.className).toContain("leading-6");
    const badge = screen.getByText("Missed");
    expect(badge.className).toContain("text-[9px]");
    expect(badge.className).toContain("max-h-[17px]");
    expect(badge.className).toContain("px-1.5");
    const module = screen.getByTestId("work-card-module");
    expect(module.className).toContain("text-[10px]");
    expect(module.className).toContain("tracking-[0.06em]");
    expect(module.querySelector("svg")?.getAttribute("width")).toBe("14");
    const problem = screen.getByTestId("work-card-problem");
    expect(problem.className).toContain("text-[15px]");
    expect(problem.className).toContain("leading-5");
    expect(problem.className).toContain("truncate");
    const action = screen.getByTestId("work-card-action");
    expect(action.className).toContain("text-[12px]");
    expect(action.className).toContain("leading-4");
    expect(action.className).toContain("truncate");
    const footer = screen.getByTestId("work-card-footer");
    expect(footer.className).toContain("h-7");
    expect(footer.className).toContain("pl-3");
    expect(footer.className).toContain("pr-2");
    const open = screen.getByRole("button", { name: "Open SO-1318 in Delivery" });
    expect(open.className).toContain("h-8");
    expect(open.className).toContain("w-8");
    expect(open.querySelector("svg")?.getAttribute("width")).toBe("14");
  });

  it("the skeleton keeps the card's geometry: 104px, 60px rail", () => {
    render(<WorkCardSkeleton />);
    const cards = Array.from(screen.getByTestId("work-loading").children) as HTMLElement[];
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card.className).toContain("h-[104px]");
      expect(card.className).toContain("grid-cols-[60px_minmax(0,1fr)]");
    }
  });

  it("the tab bar is 36px, 3px padding, 13px tabs", () => {
    render(<WorkListTabs value="todo" counts={{ todo: 4 }} onChange={vi.fn()} />);
    const bar = screen.getByRole("tablist");
    expect(bar.className).toContain("h-9");
    expect(bar.className).toContain("p-[3px]");
    expect(bar.className).toContain("gap-0.5");
    expect(bar.className).toContain("rounded-[7px]");
    const tab = screen.getByTestId("work-tab-todo");
    expect(tab.className).toContain("text-[13px]");
    expect(tab.className).toContain("leading-[18px]");
    expect(tab.className).toContain("rounded-[5px]");
    expect(tab.querySelector("span")?.className).toContain("font-medium");
  });
});
