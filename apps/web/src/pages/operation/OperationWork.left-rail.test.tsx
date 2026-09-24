/**
 * 【WORK】 Left rail (owner-approved UI, 2026-09-24).
 *
 * The nine acceptance tests of the rail card, on the Kuala Lumpur clock and at
 * the 1440px three-panel width. Every test here failed on origin/main
 * 7e9da6459, where the rail was a `Working day` text list with an `All` row, a
 * holiday that could not be chosen, printed zero counts and no week control.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { OperationWorkItem, OperationWorkResponse } from "@carres/shared";

const SH = "00000000-0000-4000-8000-0000000000aa";
let workState: { data: OperationWorkResponse | undefined; isLoading: boolean; isError: boolean };

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return { ...actual, useOperationWork: () => ({ ...workState, refetch: vi.fn() }) };
});
vi.mock("@/lib/auth", () => ({
  useAuth: (select: (state: { role: string; user: { id: string; email: string } }) => unknown) =>
    select({ role: "operation", user: { id: SH, email: "shasha@carres.test" } }),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

import OperationWork from "./OperationWork";

const SOURCES = ["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const;
type Module = (typeof SOURCES)[number];

let seq = 0;
function item(actionOn: string | null, module: Module = "orders", missedDays = 0): OperationWorkItem {
  seq += 1;
  const id = `obj-${seq}`;
  return {
    contractVersion: 2,
    id: `${module}:${id}:follow`,
    module,
    ruleKey: "follow",
    ruleVersion: 1,
    object: { kind: "sales_order", id, label: `SO-${1300 + seq}` },
    problem: "No delivery date",
    action: "Ask customer for a delivery date",
    recipient: "Tan Qu Qu",
    requiredResult: "Customer Delivery exists",
    completionPredicate: "orders.delivery_date exists",
    completionStatement: "Customer Delivery exists",
    owner: {
      rule: "salesperson",
      dutyKey: null,
      normal: { userId: SH, name: "Shasha" },
      activeCover: null,
      coverEvidence: null,
      acting: { userId: SH, name: "Shasha" },
      state: "primary",
    },
    timing: {
      businessDueOn: actionOn,
      actionOn,
      placement: actionOn === null ? "no_working_date" : missedDays > 0 ? "missed" : "on_day",
      missedAge: {
        state: "counted",
        workingDays: missedDays,
        basis: { calendarKey: "module+person", from: actionOn ?? "2026-09-17", to: "2026-09-17" },
      },
      eligibility: "eligible",
      noDateReason: actionOn === null ? "The owning rule has no working date" : null,
      calendar: {
        module: { key: module, source: module, state: "ready" },
        actor: { key: "person:shasha", source: "people", state: "ready" },
        holidayName: null,
      },
    },
    communication: null,
    blocker: null,
    nextConsequence: null,
    interaction: { mode: "open_module", fallbackDestination: `/operation/orders/so/${id}` },
    destination: `/operation/orders/so/${id}`,
    observedAt: "2026-09-17T01:00:00.000Z",
    sourceVersion: "2026-09-17T01:00:00.000Z",
    tone: "warning",
    locked: false,
    broken: false,
  };
}

function feed(generatedOn: string, items: OperationWorkItem[]): OperationWorkResponse {
  return {
    contractVersion: 2,
    complete: true,
    items,
    staff: [{ userId: SH, name: "Shasha", email: "shasha@carres.test" }],
    generatedOn,
    closureReceipt: null,
    sources: SOURCES.map((key) => ({
      key,
      state: "healthy" as const,
      observedAt: "2026-09-17T01:00:00.000Z",
      lastSuccessfulAt: "2026-09-17T01:00:00.000Z",
      errorLabel: null,
    })),
  };
}

let lastSearch = "";
function LocationProbe() {
  lastSearch = useLocation().search;
  return null;
}

function show(url = "/operation?tab=work") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <OperationWork />
      <LocationProbe />
    </MemoryRouter>,
  );
}

const dateSection = () => screen.getByRole("region", { name: "Date" });
const moduleSection = () => screen.getByRole("region", { name: "Module" });
const day = (name: RegExp) => within(dateSection()).getByRole("button", { name });
const listRows = () => within(screen.getByTestId("work-list")).queryAllByRole("button", { name: /Ask customer/ });
const countOf = (el: HTMLElement) => el.querySelector("[data-rail-count]")?.textContent ?? null;
const url = () => new URLSearchParams(lastSearch);

const savedTz = process.env.TZ;
const savedWidth = window.innerWidth;
beforeAll(() => {
  process.env.TZ = "Asia/Kuala_Lumpur";
});
afterAll(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 00:30 on Fri 18 Sep in Kuala Lumpur is still Thu 17 Sep in UTC: a rail
  // that read the date through UTC would name the wrong day as today.
  vi.setSystemTime(new Date("2026-09-17T16:30:00.000Z"));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  workState = { data: feed("2026-09-18", []), isLoading: false, isError: false };
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: savedWidth });
});

describe("【WORK】 left rail · Date", () => {
  it("runs at UTC+8", () => {
    expect(new Date("2026-09-18T00:00:00").getTimezoneOffset()).toBe(-480);
  });

  it("1 · Monday–Friday of the Malaysia week, each a badge holding the day number and weekday", () => {
    show();
    const expected = [
      ["Mon, 14 Sep", "14", "MON"],
      ["Tue, 15 Sep", "15", "TUE"],
      ["Wed, 16 Sep", "16", "WED"],
      ["Thu, 17 Sep", "17", "THU"],
      ["Fri, 18 Sep", "18", "FRI"],
    ] as const;
    for (const [label, number, weekday] of expected) {
      const badge = day(new RegExp(`^${label}`)).querySelector("[data-rail-badge]") as HTMLElement;
      expect(badge).toHaveTextContent(`${number}${weekday}`);
    }
    expect(dateSection()).not.toHaveTextContent("Sun");
    expect(dateSection()).not.toHaveTextContent("Sat");
    expect(within(dateSection()).getByTestId("work-rail-month")).toHaveTextContent("Sep 2026");
  });

  it("2 · today's badge stays solid blue while another date is selected, and never says Today", () => {
    show("/operation?tab=work&day=2026-09-15");
    const today = day(/^Fri, 18 Sep/);
    const todayBadge = today.querySelector("[data-rail-badge]") as HTMLElement;
    expect(todayBadge).toHaveAttribute("data-today", "true");
    expect(todayBadge.className).toMatch(/bg-kit-blue-9/);
    expect(todayBadge.className).toMatch(/text-white/);
    expect(today).toHaveAttribute("aria-pressed", "false");
    expect(day(/^Tue, 15 Sep/).querySelector("[data-rail-badge]")).not.toHaveAttribute("data-today");
    expect(dateSection()).not.toHaveTextContent("Today");
  });

  it("3 · the selected date carries the pale-blue full-row highlight; no other row does", () => {
    show("/operation?tab=work&day=2026-09-15");
    const selected = day(/^Tue, 15 Sep/);
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(selected.className).toMatch(/bg-kit-blue-3/);
    for (const other of within(dateSection()).getAllByRole("button").filter((b) => b !== selected)) {
      expect(other.className).not.toMatch(/bg-kit-blue-3/);
    }
  });

  it("4 · Malaysia Day is named beside Wed, 16 Sep and is a date that can be chosen", () => {
    workState.data = feed("2026-09-18", [item("2026-09-16")]);
    show();
    const holiday = day(/^Wed, 16 Sep · Malaysia Day · 1 action$/);
    expect(holiday).toHaveTextContent("Malaysia Day");
    expect(day(/^Thu, 17 Sep/)).not.toHaveTextContent("Malaysia Day");
    fireEvent.click(holiday);
    expect(url().get("day")).toBe("2026-09-16");
    expect(listRows()).toHaveLength(1);
  });

  it("5 · a zero count is not printed on a date or a module", () => {
    workState.data = feed("2026-09-18", [item("2026-09-18", "delivery"), item("2026-09-18", "delivery")]);
    show();
    expect(countOf(day(/^Mon, 14 Sep/))).toBeNull();
    expect(countOf(day(/^Missed/))).toBeNull();
    expect(countOf(day(/^Fri, 18 Sep/))).toBe("2");
    const modules = moduleSection();
    expect(countOf(within(modules).getByRole("button", { name: /^Payment/ }))).toBeNull();
    expect(countOf(within(modules).getByRole("button", { name: /^Delivery/ }))).toBe("2");
    expect(within(modules).getByRole("button", { name: /^Payment$/ })).toBeInTheDocument();
  });

  it("6 · No working date appears only while it has work", () => {
    const first = show();
    expect(within(dateSection()).queryByRole("button", { name: /^No working date/ })).toBeNull();
    first.unmount();
    workState.data = feed("2026-09-18", [item(null)]);
    show();
    expect(countOf(day(/^No working date · 1 action$/))).toBe("1");
  });

  it("Missed is the first option; Missed, a date and No working date are one choice", () => {
    workState.data = feed("2026-09-18", [item("2026-09-10", "orders", 5), item(null)]);
    show("/operation?tab=work&day=missed");
    const options = within(dateSection()).getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));
    expect(options[0]).toHaveAccessibleName("Missed · 1 action");
    expect(options.filter((b) => b.getAttribute("aria-pressed") === "true")).toEqual([options[0]]);
    fireEvent.click(day(/^No working date/));
    expect(url().get("day")).toBe("no_date");
    expect(within(dateSection()).getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(day(/^No working date/)).toHaveAttribute("aria-pressed", "true");
  });
});

describe("【WORK】 left rail · Module", () => {
  it("7 · module counts describe the selected Date list, add up to All modules and are not cut by the module choice", () => {
    workState.data = feed("2026-09-18", [
      item("2026-09-10", "delivery", 5),
      item("2026-09-11", "delivery", 4),
      item("2026-09-09", "payment", 6),
      item("2026-09-17", "purchasing"),
      item("2026-09-18", "orders"),
    ]);
    show("/operation?tab=work&day=missed");
    const modules = moduleSection();
    const all = within(modules).getByRole("button", { name: /^All modules/ });
    expect(countOf(all)).toBe("3");
    expect(countOf(within(modules).getByRole("button", { name: /^Delivery/ }))).toBe("2");
    expect(countOf(within(modules).getByRole("button", { name: /^Payment/ }))).toBe("1");
    expect(countOf(within(modules).getByRole("button", { name: /^Purchasing/ }))).toBeNull();
    expect(listRows()).toHaveLength(3);

    fireEvent.click(within(modules).getByRole("button", { name: /^Delivery/ }));
    expect(url().get("module")).toBe("delivery");
    expect(listRows()).toHaveLength(2);
    expect(countOf(within(moduleSection()).getByRole("button", { name: /^All modules/ }))).toBe("3");
    expect(countOf(within(moduleSection()).getByRole("button", { name: /^Payment/ }))).toBe("1");
    expect(within(moduleSection()).getByRole("button", { name: /^Delivery/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(moduleSection()).getByRole("button", { name: /^All modules/ }));
    expect(url().get("module")).toBeNull();
    expect(listRows()).toHaveLength(3);
  });

  it("module rows carry the name and count only — no icon on each row", () => {
    show();
    const rows = within(moduleSection()).getAllByRole("button");
    expect(rows[0]).toHaveAccessibleName(/^All modules/);
    for (const row of rows) expect(row.querySelector("svg")).toBeNull();
    expect(within(moduleSection()).getByRole("heading", { name: "Module" }).querySelector("svg")).not.toBeNull();
    expect(within(dateSection()).getByRole("heading", { name: /^Date/ }).querySelector("svg")).not.toBeNull();
  });
});

describe("【WORK】 left rail · URL and keyboard", () => {
  it("8 · the URL restores the visible week, the date bucket and the module; the arrows move one work week", () => {
    workState.data = feed("2026-09-18", [item("2026-09-22", "delivery"), item("2026-09-22", "payment")]);
    show("/operation?tab=work&week=2026-09-21&day=2026-09-22&module=delivery");
    expect(day(/^Mon, 21 Sep/)).toBeInTheDocument();
    expect(day(/^Tue, 22 Sep · 2 actions$/)).toHaveAttribute("aria-pressed", "true");
    expect(within(moduleSection()).getByRole("button", { name: /^Delivery/ })).toHaveAttribute("aria-pressed", "true");
    expect(listRows()).toHaveLength(1);

    fireEvent.click(within(dateSection()).getByRole("button", { name: "Next week" }));
    expect(url().get("week")).toBe("2026-09-28");
    expect(day(/^Mon, 28 Sep/)).toBeInTheDocument();
    expect(within(dateSection()).getByTestId("work-rail-month")).toHaveTextContent("Oct 2026");
    expect(url().get("day")).toBe("2026-09-22");
    expect(url().get("module")).toBe("delivery");

    fireEvent.click(within(dateSection()).getByRole("button", { name: "Previous week" }));
    fireEvent.click(within(dateSection()).getByRole("button", { name: "Previous week" }));
    expect(url().get("week")).toBe("2026-09-14");
    expect(day(/^Fri, 18 Sep/)).toBeInTheDocument();
  });

  it("a date chosen from outside the rail opens on its own week", () => {
    show("/operation?tab=work&day=2026-09-23");
    expect(day(/^Wed, 23 Sep/)).toHaveAttribute("aria-pressed", "true");
  });

  it("9 · every option is a real button in document order, reachable by keyboard, and activates", () => {
    workState.data = feed("2026-09-18", [item("2026-09-10", "delivery", 5), item(null, "payment")]);
    show();
    const rail = screen.getByRole("complementary", { name: "Work filters" });
    const controls = within(rail).getAllByRole("button");
    expect(controls.map((c) => c.getAttribute("aria-label") ?? c.textContent)).toEqual([
      "Previous week",
      "Next week",
      "Missed · 1 action",
      "Mon, 14 Sep",
      "Tue, 15 Sep",
      "Wed, 16 Sep · Malaysia Day",
      "Thu, 17 Sep",
      "Fri, 18 Sep · Today",
      "No working date · 1 action",
      "All modules · 1 action",
      "Sales Orders",
      "Purchasing",
      "Receiving",
      "Delivery · 1 action",
      "Payment",
      "Issue Tracker",
    ]);
    for (const control of controls) {
      expect(control.tagName).toBe("BUTTON");
      expect(control).toHaveAttribute("type", "button");
      expect(control).not.toBeDisabled();
      expect(control.getAttribute("tabindex")).toBeNull();
      expect(control.className).toMatch(/focus-visible:/);
      control.focus();
      expect(document.activeElement).toBe(control);
    }
    fireEvent.click(day(/^Missed/));
    expect(url().get("day")).toBe("missed");
    fireEvent.click(within(moduleSection()).getByRole("button", { name: /^Payment/ }));
    expect(url().get("module")).toBe("payment");
  });
});
