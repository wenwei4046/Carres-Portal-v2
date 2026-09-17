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

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return { ...actual, useOperationWork: () => ({ ...workState, refetch }) };
});
vi.mock("@/lib/auth", () => ({
  useAuth: (select: (state: { role: string; user: { email: string } }) => unknown) =>
    select({ role: "operation", user: { email: "shasha@carres.test" } }),
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

const dayNav = () => screen.getByRole("navigation", { name: "Working day" });

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
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
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

  it("1 · a Thursday shows the week Mon, 14 Sep … Fri, 18 Sep through fmtDate", () => {
    show();
    const nav = dayNav();
    expect(nav).toHaveTextContent("Mon, 14 Sep");
    expect(nav).toHaveTextContent("Tue, 15 Sep");
    expect(nav).toHaveTextContent("Thu, 17 Sep");
    expect(nav).toHaveTextContent("Fri, 18 Sep");
    expect(nav).not.toHaveTextContent("Sun 13 Sept");
    expect(nav).not.toHaveTextContent("Sept");
  });

  it("2 · an item due Fri, 18 Sep is counted under Fri, 18 Sep", () => {
    workState.data = feed("2026-09-17", [item("2026-09-18")]);
    show();
    expect(within(dayNav()).getByRole("button", { name: "Fri, 18 Sep · 1 action" })).toBeInTheDocument();
  });

  it("3 · Wed, 16 Sep reads Public holiday · Malaysia Day, with no count and no button", () => {
    show();
    const holiday = within(dayNav()).getByText(/Public holiday · Malaysia Day/);
    expect(holiday.closest("button")).toBeNull();
    const row = holiday.closest("[data-holiday]");
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent("Wed, 16 Sep");
    expect(row).not.toHaveTextContent("0");
  });

  it("4 · on the holiday itself the focus list uses Thu, 17 Sep", () => {
    workState.data = feed("2026-09-16", [item("2026-09-17"), item("2026-09-18")]);
    show();
    expect(within(dayNav()).getByRole("button", { name: /^Thu, 17 Sep/ })).toHaveAttribute("aria-pressed", "true");
    const list = screen.getByTestId("work-list");
    expect(list).toHaveTextContent(/SO-\d+/);
    expect(within(list).getAllByRole("button", { name: /Ask customer for a delivery date/ })).toHaveLength(1);
  });

  it("5 · Saturday appears only when something is due Sat, 19 Sep", () => {
    const first = show();
    expect(dayNav()).not.toHaveTextContent("Sat, 19 Sep");
    first.unmount();
    workState.data = feed("2026-09-17", [item("2026-09-19")]);
    show();
    expect(within(dayNav()).getByRole("button", { name: "Sat, 19 Sep · 1 action" })).toBeInTheDocument();
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

  it("7 · a module filter keeps every other module's real count, and all modules add up to the rows", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    workState.data = feed("2026-09-17", [
      inModule("payment", "2026-09-17"),
      inModule("delivery", "2026-09-17"),
      inModule("delivery", "2026-09-17"),
    ]);
    const first = show("/operation?tab=work&module=payment");
    const rail = screen.getByRole("complementary", { name: "Work filters" });
    expect(within(rail).getByRole("button", { name: /^Delivery/ })).toHaveTextContent(/2$/);
    expect(within(rail).getByRole("button", { name: /^Payment/ })).toHaveTextContent(/1$/);
    first.unmount();

    show();
    const allRail = screen.getByRole("complementary", { name: "Work filters" });
    const moduleSum = ["Sales Orders", "Purchasing", "Receiving", "Delivery", "Payment", "Issue Tracker"]
      .map((label) => Number(within(allRail).getByRole("button", { name: new RegExp(`^${label}`) }).textContent?.match(/(\d+)$/)?.[1]))
      .reduce((sum, n) => sum + n, 0);
    const rows = within(screen.getByTestId("work-list")).getAllByRole("button", { name: /Ask customer/ }).length;
    expect(rows).toBe(3);
    expect(moduleSum).toBe(rows);
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

  it("9 · a 950px Work area inside a 1280px window uses two panels", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 950, height: 800, top: 0, left: 0, right: 950, bottom: 800, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    show();
    expect(screen.getByTestId("work-split-shell")).toHaveAttribute("data-layout", "two");
  });

  it("10 · choosing All lists every open action, the same number All counts", () => {
    workState.data = feed("2026-09-17", [item("2026-09-17"), item("2026-09-18"), item(null)]);
    show();
    expect(within(screen.getByTestId("work-list")).getAllByRole("button", { name: /Ask customer/ })).toHaveLength(1);
    fireEvent.click(within(dayNav()).getByRole("button", { name: "All · 3 actions" }));
    expect(within(screen.getByTestId("work-list")).getAllByRole("button", { name: /Ask customer/ })).toHaveLength(3);
  });
});
