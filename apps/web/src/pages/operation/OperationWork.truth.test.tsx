/**
 * HF-1 · Work truth hotfix (owner ruling 2026-09-17).
 *
 * Every test here failed on origin/main a5776c50 and passes with the fix. They
 * run on the Kuala Lumpur clock, because the defect only exists at UTC+8.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { OperationWorkItem, OperationWorkResponse } from "@carres/shared";

const SH = "00000000-0000-4000-8000-0000000000aa";
let workState: {
  data: OperationWorkResponse | undefined;
  isLoading: boolean;
  isError: boolean;
};
const refetch = vi.fn();

/* The party cards read Delivery through their own queries; their behaviour is
   held by work/LogisticsCard.test.tsx. The shell tests do not render them. */
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => <span data-testid="top-bar-icons" /> }));
vi.mock("./work/WorkParties", async () => {
  /* The page tests stand the ACTION card in for the mission (no order reads). */
  const { default: WorkActionPanel } = await import("./work/WorkActionPanel");
  return { default: ({ item, onOpenRecord }: { item: import("@carres/shared").OperationWorkItem; onOpenRecord?: () => void }) => <WorkActionPanel item={item} onOpen={onOpenRecord ?? (() => {})} /> };
});
vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return { ...actual, useOperationWork: () => ({ ...workState, refetch }) };
});
vi.mock("@/lib/auth", () => ({
  // The one identity is the signed-in account id (HF-3).
  useAuth: (select: (state: { role: string; user: { id: string; email: string } }) => unknown) =>
    select({ role: "operation", user: { id: SH, email: "shasha@carres.test" } }),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

import OperationWork from "./OperationWork";

const SOURCES = ["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const;

function timing(actionOn: string | null, workingDaysLate = 0): OperationWorkItem["timing"] {
  return {
    businessDueOn: actionOn,
    actionOn,
    placement: actionOn === null ? "no_working_date" : workingDaysLate > 0 ? "missed" : "on_day",
    missedAge: {
      state: "counted",
      workingDays: workingDaysLate,
      basis: { calendarKey: "module+person", from: actionOn ?? "2026-09-17", to: "2026-09-17" },
    },
    eligibility: "eligible",
    noDateReason: actionOn === null ? "The owning rule has no working date" : null,
    calendar: {
      module: { key: "orders", source: "orders", state: "ready" },
      actor: { key: "person:shasha", source: "people", state: "ready" },
      holidayName: null,
    },
  };
}

let seq = 0;
function item(dueOn: string | null, overrides: Partial<OperationWorkItem> = {}): OperationWorkItem {
  seq += 1;
  const id = `order-${seq}`;
  return {
    contractVersion: 2,
    id: `orders:${id}:ask_delivery_date`,
    module: "orders",
    ruleKey: "ask_delivery_date",
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
    timing: timing(dueOn),
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
    ...overrides,
  };
}

function inModule(module: "delivery" | "payment", dueOn: string): OperationWorkItem {
  const base = item(dueOn);
  return { ...base, id: `${module}:${base.object.id}:follow`, module, ruleKey: "follow" };
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

function show(url = "/operation?tab=work") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <OperationWork />
    </MemoryRouter>,
  );
}

/* The rail every page follows (Payment Monitor's): one card per work day,
   then the fixed rows and the Page group. */
const rail = () => screen.getByTestId("work-rail");
const dayCard = (iso: string) => screen.getByTestId(`work-rail-day-${iso}`);

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
  vi.setSystemTime(new Date("2026-09-17T02:00:00.000Z"));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  workState = { data: feed("2026-09-17", []), isLoading: false, isError: false };
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: savedWidth });
});

describe("HF-1 · Work truth on the Kuala Lumpur clock", () => {
  it("runs at UTC+8", () => {
    expect(new Date("2026-09-17T00:00:00").getTimezoneOffset()).toBe(-480);
  });

  it("1 · a Thursday's rail is the whole month, Monday to Saturday (names through fmtDate); the chosen day is the one blue tile; header `Sep 2026`", () => {
    show();
    const grid = screen.getByTestId("work-rail-days");
    const week = within(screen.getByTestId("work-rail-days-week-2")).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? "");
    expect(week.map((n) => n.split(" · ")[0])).toEqual(["Mon, 14 Sep", "Tue, 15 Sep", "Wed, 16 Sep", "Thu, 17 Sep", "Fri, 18 Sep", "Sat, 19 Sep"]);
    expect(within(grid).getAllByRole("button")).toHaveLength(26); // 30 days minus 4 Sundays
    expect(screen.queryByTestId("work-rail-day-2026-09-20")).toBeNull(); // Sunday never drawn
    expect(dayCard("2026-09-17")).toHaveAttribute("data-today", "yes");
    expect(dayCard("2026-09-17")).toHaveAttribute("aria-pressed", "true"); // the focus day is chosen
    expect(dayCard("2026-09-17").className).toContain("bg-kit-blue-9");
    expect(dayCard("2026-09-14").className).not.toContain("bg-kit-blue");
    expect(dayCard("2026-09-17")).not.toHaveTextContent("Today");
    expect(screen.getByTestId("work-rail-week-label")).toHaveTextContent(/^Sep 2026$/);
  });

  it("2 · an item due Fri, 18 Sep is counted under Fri, 18 Sep; a day with nothing prints nothing", () => {
    workState.data = feed("2026-09-17", [item("2026-09-18")]);
    show();
    expect(dayCard("2026-09-18")).toHaveTextContent(/^181$/);
    expect(dayCard("2026-09-17")).toHaveTextContent(/^17$/);
    expect(dayCard("2026-09-18")).toHaveAttribute("aria-label", "Fri, 18 Sep · 1 action");
  });

  it("3 · Wed, 16 Sep is the grey tile — no words, Malaysia Day only in its name — and the fixed rows print their zero", () => {
    show();
    const holiday = dayCard("2026-09-16");
    expect(holiday).toHaveAttribute("data-closed", "yes");
    expect(holiday.className).toContain("text-kit-slate-9");
    expect(holiday).toHaveTextContent(/^16$/);
    expect(holiday).toHaveAttribute("aria-label", "Wed, 16 Sep · Malaysia Day · 0 actions");
    expect(holiday).toHaveAttribute("title", "Malaysia Day");
    expect(screen.getByTestId("work-rail-missed")).toHaveTextContent("0");
    expect(screen.getByTestId("work-rail-no-date")).toHaveTextContent("No date");
    expect(screen.getByTestId("work-rail-no-date")).toHaveTextContent("0");
    /* The Status rows (the three middle tabs moved here), To do on alone. */
    expect(screen.getByTestId("work-rail-status-todo")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("work-rail-status-waiting")).toHaveTextContent("Waiting for answer");
    expect(screen.getByTestId("work-rail-status-done")).toHaveTextContent("Done today");
    expect(screen.queryByRole("tablist")).toBeNull();
    /* The one line over the list names the chosen Date and nothing else. */
    expect(screen.getByTestId("work-list-heading")).toHaveTextContent(/^Thu, 17 Sep$/);
  });

  it("4 · on the holiday itself the focus list uses Thu, 17 Sep", () => {
    workState.data = feed("2026-09-16", [item("2026-09-17"), item("2026-09-18")]);
    show();
    expect(dayCard("2026-09-17")).toHaveAttribute("aria-pressed", "true");
    const list = screen.getByTestId("work-list");
    expect(list).toHaveTextContent(/SO-\d+/);
    expect(within(list).getAllByRole("button", { name: /Ask customer for a delivery date/ })).toHaveLength(1);
  });

  it("5 · Saturday is always drawn (the Warehouse works it) and carries its count when something is due Sat, 19 Sep", () => {
    const first = show();
    expect(dayCard("2026-09-19")).toHaveTextContent(/^19$/);
    first.unmount();
    workState.data = feed("2026-09-17", [item("2026-09-19")]);
    show();
    expect(dayCard("2026-09-19")).toHaveTextContent(/^191$/);
  });

  it("6 · My Work with nothing today and 2 on Friday does not say Nothing assigned to you", () => {
    workState.data = feed("2026-09-17", [item("2026-09-18"), item("2026-09-18")]);
    show();
    const empty = screen.getByTestId("work-empty");
    expect(empty).not.toHaveTextContent("Nothing assigned to you");
    expect(empty).toHaveTextContent("No work on Thu, 17 Sep");
    fireEvent.click(within(empty).getByRole("button", { name: "Open Fri, 18 Sep" }));
    expect(within(screen.getByTestId("work-list")).getAllByRole("button", { name: /Ask customer/ })).toHaveLength(2);
  });

  it("7 · a page filter narrows the list; the Page rows keep every page's real count", () => {
    workState.data = feed("2026-09-17", [inModule("delivery", "2026-09-17"), inModule("delivery", "2026-09-17"), inModule("payment", "2026-09-17")]);
    show("/operation?tab=work&module=delivery");
    expect(screen.getByTestId("work-rail-page-delivery")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("work-rail-page-delivery")).toHaveTextContent("2");
    expect(screen.getByTestId("work-rail-page-payment")).toHaveTextContent("1");
    expect(screen.getByTestId("work-rail-page-all")).toHaveTextContent("3");
    expect(within(screen.getByTestId("work-list")).getAllByRole("button", { name: /Ask customer/ })).toHaveLength(2);
  });

  it("8 · a failed source says which one and when, and never an empty sentence", () => {
    const data = feed("2026-09-17", []);
    data.complete = false;
    data.sources = data.sources.map((source) => source.key === "payment"
      ? { ...source, state: "failed" as const, errorLabel: "timeout" }
      : source);
    workState.data = data;
    show();
    const page = screen.getByTestId("work-list");
    expect(page).toHaveTextContent("Could not refresh Payment");
    expect(page).toHaveTextContent("Last updated 09:00");
    expect(page).not.toHaveTextContent("Nothing assigned to you");
    expect(page).not.toHaveTextContent("could not be loaded");
    expect(page).not.toHaveTextContent("payment");
    expect(screen.queryByTestId("work-empty")).not.toBeInTheDocument();
  });

  it("9 · a 1180px page shows the rail beside the list; Hide filters leaves the Show filters strip", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 1180, height: 800, top: 0, left: 0, right: 1180, bottom: 800, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    show();
    expect(screen.getByTestId("work-split-shell")).toHaveAttribute("data-layout", "two");
    expect(rail()).toBeInTheDocument();
    /* Rail OR detail at this width — never a 140px detail. */
    expect(screen.queryByRole("region", { name: "Selected work" })).toBeNull();
    fireEvent.click(within(rail()).getByRole("button", { name: "Hide filters" }));
    expect(screen.queryByTestId("work-rail")).toBeNull();
    expect(screen.getByRole("region", { name: "Selected work" })).toBeInTheDocument();
    expect(screen.getByTestId("work-rail-collapsed")).toHaveTextContent("Show filters");
    fireEvent.click(screen.getByTestId("work-show-filters-rail"));
    expect(screen.getByTestId("work-rail")).toBeInTheDocument();
  });

  it("10 · a link that opens every open action (`day=all`) still lists them all", () => {
    workState.data = feed("2026-09-17", [item("2026-09-17"), item("2026-09-18"), item(null)]);
    const first = show();
    expect(within(screen.getByTestId("work-list")).getAllByRole("button", { name: /Ask customer/ })).toHaveLength(1);
    first.unmount();
    show("/operation?tab=work&day=all");
    expect(within(screen.getByTestId("work-list")).getAllByRole("button", { name: /Ask customer/ })).toHaveLength(3);
  });

  it("11 · a missed age the server could not count is never printed as 0 working days", () => {
    const missed = item("2026-08-05");
    missed.timing = { ...timing("2026-08-05", 1), missedAge: { state: "not_calculable", workingDays: null, basis: null } };
    workState.data = feed("2026-09-17", [missed]);
    show();
    const list = screen.getByTestId("work-list");
    const card = list.querySelector("[data-work-row]") as HTMLElement;
    expect(card.getAttribute("aria-label")).toContain("Wed, 5 Aug");
    expect(card.querySelector("[data-testid=work-row-due]")?.className).toContain("text-danger");
    expect(list).not.toHaveTextContent("working days missed");
  });
});
