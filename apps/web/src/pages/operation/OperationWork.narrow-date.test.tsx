/**
 * 【WORK】 Narrow Date filter (owner correction, 2026-09-24).
 *
 * Below a 960px viewport the Date filter is never a permanent panel: it is one
 * 40px trigger — `Date: {selection} {count}` — that opens the Date controls in
 * a popover, and the work list starts right under it. Every test here failed
 * on origin/main 42c8bc9af, where 820px kept the 240px rail and 390px printed
 * a permanent wrapping strip with the holiday line under it.
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

const trigger = () => screen.getByRole("button", { name: /^Date: / });
const popover = () => screen.getByRole("dialog", { name: "Date" });
const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { configurable: true, value: w });

describe.each([820, 390])("【WORK】 narrow Date filter at %ipx", (width) => {
  beforeEach(() => setWidth(width));

  it("1 · renders no permanent Date panel — one 40px trigger instead", () => {
    workState.data = feed("2026-09-18", [item("2026-09-10", "delivery", 5), item("2026-09-18")]);
    show();
    expect(screen.queryByRole("region", { name: "Date" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Date" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Work filters" })).toBeNull();
    expect(trigger().className).toMatch(/\bh-10\b/);
    expect(trigger().querySelector('[data-icon="date"]')).not.toBeNull();
    expect(trigger().querySelector('[data-icon="expand"]')).not.toBeNull();
  });

  it("2 · the trigger names the current selection and its count", () => {
    workState.data = feed("2026-09-18", [item("2026-09-10", "delivery", 5), item("2026-09-11", "payment", 4), item("2026-09-15")]);
    const first = show("/operation?tab=work&day=missed");
    expect(trigger()).toHaveTextContent(/^Date: Missed2$/);
    first.unmount();
    show("/operation?tab=work&day=2026-09-15");
    expect(trigger()).toHaveTextContent(/^Date: Tue, 15 Sep1$/);
  });

  it("3 · opens the Date controls: title, week arrows, month, badges, Missed; No working date only above zero", () => {
    workState.data = feed("2026-09-18", [item("2026-09-10", "delivery", 5)]);
    const first = show();
    fireEvent.click(trigger());
    const box = popover();
    expect(within(box).getByRole("heading", { name: "Date" })).toBeInTheDocument();
    expect(within(box).getByRole("button", { name: "Previous week" })).toBeInTheDocument();
    expect(within(box).getByRole("button", { name: "Next week" })).toBeInTheDocument();
    expect(within(box).getByTestId("work-rail-month")).toHaveTextContent("Sep 2026");
    expect(within(box).getAllByRole("button", { name: /^(Mon|Tue|Wed|Thu|Fri), / })).toHaveLength(5);
    expect(within(box).getByRole("button", { name: "Missed · 1 action" })).toBeInTheDocument();
    expect(within(box).queryByRole("button", { name: /^No working date/ })).toBeNull();
    first.unmount();
    workState.data = feed("2026-09-18", [item(null)]);
    show();
    fireEvent.click(trigger());
    expect(within(popover()).getByRole("button", { name: "No working date · 1 action" })).toBeInTheDocument();
  });

  it("4 · choosing a date, Missed or No working date closes the popover and updates the trigger — one choice at a time", () => {
    workState.data = feed("2026-09-18", [item("2026-09-10", "delivery", 5), item("2026-09-16"), item(null)]);
    show();
    fireEvent.click(trigger());
    fireEvent.click(within(popover()).getByRole("button", { name: /^Wed, 16 Sep/ }));
    expect(screen.queryByRole("dialog", { name: "Date" })).toBeNull();
    expect(url().get("day")).toBe("2026-09-16");
    expect(trigger()).toHaveTextContent(/^Date: Wed, 16 Sep1$/);

    fireEvent.click(trigger());
    fireEvent.click(within(popover()).getByRole("button", { name: /^Missed/ }));
    expect(screen.queryByRole("dialog", { name: "Date" })).toBeNull();
    expect(trigger()).toHaveTextContent(/^Date: Missed1$/);

    fireEvent.click(trigger());
    expect(within(popover()).getAllByRole("button", { pressed: true }).map((b) => b.getAttribute("aria-label"))).toEqual(["Missed · 1 action"]);
    fireEvent.click(within(popover()).getByRole("button", { name: /^No working date/ }));
    expect(url().get("day")).toBe("no_date");
    expect(trigger()).toHaveTextContent(/^Date: No working date1$/);
  });

  it("5 · the week arrows move the week and keep the popover open", () => {
    show();
    fireEvent.click(trigger());
    fireEvent.click(within(popover()).getByRole("button", { name: "Next week" }));
    expect(url().get("week")).toBe("2026-09-21");
    expect(within(popover()).getByRole("button", { name: /^Mon, 21 Sep/ })).toBeInTheDocument();
  });

  it("6 · with Missed chosen, the page never prints Wed, 16 Sep · Malaysia Day", () => {
    workState.data = feed("2026-09-18", [item("2026-09-10", "delivery", 5)]);
    show("/operation?tab=work&day=missed");
    expect(document.body).not.toHaveTextContent("Malaysia Day");
  });

  it("7 · the work list starts immediately below the compact filter bar", () => {
    workState.data = feed("2026-09-18", [item("2026-09-10", "delivery", 5)]);
    show();
    const bar = trigger().closest("[data-testid='work-date-bar']") as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.parentElement).toBe(screen.getByTestId("work-list"));
    expect(bar.previousElementSibling).toBeNull();
    expect((bar.nextElementSibling as HTMLElement).textContent).toMatch(/SO-/);
  });
});

describe("【WORK】 the desktop rail is unchanged", () => {
  it.each([1440, 1180, 960])("%ipx keeps the Date and Module rail and has no Date trigger", (width) => {
    setWidth(width);
    show();
    expect(screen.getByRole("region", { name: "Date" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Module" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Date: / })).toBeNull();
  });
});
