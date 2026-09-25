/**
 * HF-3 · RIGHT RAIL TRUTH (owner ruling 2026-09-17, Workspace MASTER §7.1).
 *
 * The rail badge, the rail panel and main My Work read ONE open set for ONE
 * person and must print ONE number: Missed + the focus day. Production had
 * three definitions (badge = every open item of mine · panel = Missed +
 * `generatedOn` · Work = Missed + `generatedOn` for an email-matched person)
 * and two identity rules (session id vs staff email).
 *
 * A REAL QueryClient runs here — only `apiFetch` is replaced — so the
 * refresh-failure case proves what React Query actually keeps after a failed
 * refetch, not what a hand-written mock claims it keeps.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationWorkItem, OperationWorkResponse } from "@carres/shared";
import { qk } from "@/lib/queries";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const net = vi.hoisted(() => ({
  work: null as unknown,
  mode: "ok" as "ok" | "fail" | "pending",
}));
const auth = vi.hoisted(() => ({
  state: {
    role: "operation",
    session: { user: { id: "", email: "" } },
    user: { id: "", email: "" },
  },
}));

vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => <span data-testid="top-bar-icons" /> }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      if (path !== "/api/operation/work") throw new Error(`unexpected ${path}`);
      if (net.mode === "pending") return new Promise(() => {});
      if (net.mode === "fail") throw new TypeError("Failed to fetch");
      return structuredClone(net.work);
    }),
  };
});
vi.mock("@/lib/auth", () => ({
  useAuth: (select: (state: typeof auth.state) => unknown) => select(auth.state),
}));
vi.mock("../../work/WorkActionPanel", () => ({ default: () => null }));

import OperationRightRail from "../OperationRightRail";
import TasksPanel from "./TasksPanel";
import OperationWork from "../../OperationWork";

function timing(actionOn: string | null, missedDays = 0): OperationWorkItem["timing"] {
  return {
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
      module: { key: "delivery", source: "delivery", state: "ready" },
      actor: { key: "person:me", source: "people", state: "ready" },
      holidayName: null,
    },
  };
}

function item(so: number, actionOn: string | null, missedDays = 0, ownerId = ME): OperationWorkItem {
  return {
    contractVersion: 2,
    id: `delivery:o${so}:delivery.confirm_date`,
    module: "delivery",
    ruleKey: "delivery.confirm_date",
    ruleVersion: 1,
    object: { kind: "order", id: `o${so}`, label: `SO-${so}` },
    problem: "Delivery date not confirmed",
    action: "Call NETS to confirm delivery date",
    recipient: "NETS",
    requiredResult: "Date confirmed",
    completionPredicate: "Confirmed date recorded",
    completionStatement: "Date confirmed",
    owner: {
      rule: "delivery_duty",
      dutyKey: "delivery_duty",
      normal: { userId: ownerId, name: "Owner" },
      activeCover: null,
      coverEvidence: null,
      acting: { userId: ownerId, name: "Owner" },
      state: "primary",
    },
    timing: timing(actionOn, missedDays),
    communication: null,
    blocker: null,
    nextConsequence: null,
    interaction: { mode: "open_module", fallbackDestination: "/operation/delivery" },
    destination: "/operation/delivery",
    tone: "warning",
    locked: false,
    broken: false,
    observedAt: "2026-09-17T01:00:00.000Z",
    sourceVersion: "2026-09-17T01:00:00.000Z",
  };
}

const SOURCE_KEYS = ["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const;

function response(
  items: OperationWorkItem[],
  { generatedOn = "2026-09-17", failed = [] as string[], staffEmail = "me@carres.test" } = {},
): OperationWorkResponse {
  return {
    contractVersion: 2,
    complete: failed.length === 0,
    items,
    staff: [
      { userId: ME, name: "Me", email: staffEmail },
      { userId: OTHER, name: "Other", email: "other@carres.test" },
    ],
    generatedOn,
    closureReceipt: null,
    sources: SOURCE_KEYS.map((key) => ({
      key,
      state: failed.includes(key) ? "failed" : "healthy",
      observedAt: "2026-09-17T01:00:00.000Z",
      lastSuccessfulAt: "2026-09-17T01:00:00.000Z",
      errorLabel: failed.includes(key) ? "Source failed" : null,
    })),
  } as OperationWorkResponse;
}

/** Thu 17 Sep: 1 missed · 1 today · 1 next week · 1 no working date · 1 of someone else's today. */
const WEEK = [
  item(1301, "2026-09-15", 2),
  item(1302, "2026-09-17"),
  item(1303, "2026-09-24"),
  item(1304, null),
  item(1305, "2026-09-17", 0, OTHER),
];

function signIn(email = "me@carres.test") {
  auth.state = {
    role: "operation",
    session: { user: { id: ME, email } },
    user: { id: ME, email },
  };
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

function mount(ui: React.ReactNode, qc = client(), url = "/operation?tab=work") {
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, qc };
}

const railButton = () => screen.getByRole("button", { name: /^My Work/ });

/** `My Work · {n} missed · {n} today` → [missed, today]. */
function badgeCounts(): [number, number] {
  const name = railButton().getAttribute("aria-label") ?? "";
  const match = /^My Work · (\d+) missed · (\d+) today$/.exec(name);
  if (!match) throw new Error(`badge accessible name does not state the counts: "${name}"`);
  return [Number(match[1]), Number(match[2])];
}

/** The number printed on the icon (null when no badge renders). */
function badgeNumber(): number | null {
  const text = railButton().querySelector("[data-rail-badge]")?.textContent ?? null;
  return text === null ? null : Number(text);
}

function panelCount(label: "Missed" | "Today"): number {
  const panel = screen.getByTestId("my-work-panel");
  const row = within(panel).queryByRole("link", { name: new RegExp(`^Open My Work · ${label} · `) });
  return row ? Number(/ · (\d+) action/.exec(row.getAttribute("aria-label") ?? "")?.[1]) : 0;
}

function workFocusRows(): number {
  return within(screen.getByTestId("work-list"))
    .queryAllByTestId(/^work-row-SO-/)
    .length;
}

beforeEach(() => {
  net.mode = "ok";
  net.work = response(WEEK);
  signIn();
});

describe("HF-3 · one count definition", () => {
  it("1 · an item due next week does not change the badge", async () => {
    net.work = response(WEEK.filter((i) => i.object.label !== "SO-1303"));
    const first = mount(<OperationRightRail />);
    await waitFor(() => expect(badgeNumber()).not.toBeNull());
    const before = badgeNumber();
    first.unmount();

    net.work = response(WEEK);
    mount(<OperationRightRail />);
    await waitFor(() => expect(badgeNumber()).not.toBeNull());
    expect(badgeNumber()).toBe(before);
    expect(badgeNumber()).toBe(2);
    expect(badgeCounts()).toEqual([1, 1]);
    // The number on the icon is Missed + today, and it is red because one is missed.
    expect(within(railButton()).getByText("2").className).toContain("bg-danger");
  });

  it("1b · the badge is not red when nothing is missed", async () => {
    net.work = response([item(1302, "2026-09-17"), item(1303, "2026-09-24")]);
    mount(<OperationRightRail />);
    await waitFor(() => expect(badgeCounts()).toEqual([0, 1]));
    expect(within(railButton()).getByText("1").className).not.toContain("bg-danger");
  });

  it.each([
    ["a working day", "2026-09-17", WEEK, [1, 1]],
    // Wed 16 Sep is Malaysia Day: the focus day is Thu 17 Sep.
    ["a public holiday", "2026-09-16", WEEK.map((i) => i.object.label === "SO-1301" ? item(1301, "2026-09-15", 1) : i), [1, 1]],
    // Sat 19 Sep with nothing due that Saturday: the focus day is Mon 21 Sep.
    ["a Saturday with nothing due", "2026-09-19", [item(1301, "2026-09-17", 2), item(1306, "2026-09-21"), item(1303, "2026-09-24"), item(1304, null)], [1, 1]],
  ] as const)("2 · badge = panel Missed + Today = Work focus list on %s", async (_label, generatedOn, items, expected) => {
    net.work = response([...items], { generatedOn });
    const qc = client();
    const rail = mount(<OperationRightRail />, qc);
    await waitFor(() => expect(badgeNumber()).not.toBeNull());
    expect(badgeNumber()).toBe(expected[0] + expected[1]);
    expect(badgeCounts()).toEqual(expected);
    const [missed, today] = badgeCounts();

    fireEvent.click(railButton());
    await screen.findByTestId("my-work-panel");
    expect([panelCount("Missed"), panelCount("Today")]).toEqual([missed, today]);
    rail.unmount();

    mount(<OperationWork />, qc);
    await waitFor(() => expect(workFocusRows()).toBe(missed + today));
  });

  it("3 · a staff email different from the login email is still the same person in the rail and in My Work", async () => {
    signIn("shasha.personal@gmail.com");
    net.work = response(WEEK, { staffEmail: "me@carres.test" });
    const qc = client();
    const work = mount(<OperationWork />, qc);
    await waitFor(() => expect(screen.queryByTestId("work-loading")).toBeNull());
    expect(screen.queryByText("Nothing assigned to you")).toBeNull();
    expect(workFocusRows()).toBe(2);
    work.unmount();

    mount(<OperationRightRail />, qc);
    await waitFor(() => expect(badgeNumber()).toBe(2));
    expect(badgeCounts()).toEqual([1, 1]);
  });
});

describe("HF-3 · failure and loading are never zero", () => {
  it("4 · success, then a refresh failure keeps the previous counts and says so", async () => {
    const { qc } = mount(<TasksPanel />);
    await waitFor(() => expect(panelCount("Missed")).toBe(1));
    expect(panelCount("Today")).toBe(1);

    net.mode = "fail";
    await act(async () => {
      await qc.refetchQueries({ queryKey: qk.operation.work() });
    });

    await screen.findByText(/My Work could not be refreshed/);
    expect(screen.getByText(/^Last updated /)).toBeTruthy();
    expect(panelCount("Missed")).toBe(1);
    expect(panelCount("Today")).toBe(1);
    expect(screen.queryByText("My Work could not be loaded.")).toBeNull();
    expect(screen.queryByText("No work due now")).toBeNull();
  });

  it("5a · loading keeps the count rows with placeholders and never prints 0", async () => {
    net.mode = "pending";
    mount(
      <>
        <OperationRightRail />
        <TasksPanel />
      </>,
    );
    const panel = await screen.findByTestId("my-work-panel");
    expect(within(panel).getByText("Missed")).toBeTruthy();
    expect(within(panel).getByText("Today")).toBeTruthy();
    expect(within(panel).queryByText("0")).toBeNull();
    expect(screen.queryByText("No work due now")).toBeNull();
    expect(within(railButton()).queryByText("0")).toBeNull();
  });

  it("5b · a failed source names the source in words and never prints 0 or a clear state", async () => {
    net.work = response([item(1302, "2026-09-17")], { failed: ["delivery", "issue_tracker"] });
    mount(
      <>
        <OperationRightRail />
        <TasksPanel />
      </>,
    );
    const panel = await screen.findByTestId("my-work-panel");
    await within(panel).findByText("Could not refresh Delivery");
    expect(within(panel).getByText("Could not refresh Issue Tracker")).toBeTruthy();
    expect(within(panel).queryByText(/issue_tracker/)).toBeNull();
    expect(within(panel).queryByText("0")).toBeNull();
    expect(within(panel).queryByText("No work due now")).toBeNull();
    expect(within(railButton()).queryByText("0")).toBeNull();
  });
});
