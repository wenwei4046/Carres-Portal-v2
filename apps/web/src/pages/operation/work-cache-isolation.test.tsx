/**
 * ONE CACHE KEY PER READ — the regression the production re-walk found
 * (2026-09-13). The legacy `ops_tasks` read (header Bell, Orders Control)
 * cached under `["operation", "work"]`, the SAME key the shared Work feed
 * caches under. Whichever read landed second was served the other's shape:
 * My Work and Team Work printed "No open work", the Quick Rail counted
 * nothing and the Payment Monitor's owner cells went blank while the feed
 * carried 215 items.
 *
 * These tests run a REAL QueryClient — `@/lib/queries` is not mocked — so
 * they prove the cache entries themselves, in both mounting orders, and
 * they prove the shapes are incompatible (each entry is validated against
 * the OTHER read's zod schema and must fail). The negative control mounts
 * the old colliding key and shows the poisoning happen, so a revert of the
 * key fix cannot pass here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider, hashKey, useQuery } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import {
  operationWorkResponseSchema,
  opsTasksListResponseSchema,
  type OperationWorkItem,
  type OperationWorkResponse,
  type OpsTasksListResponse,
} from "@carres/shared";
import { apiFetch } from "@/lib/api";
import { qk, useOperationWork } from "@/lib/queries";
import PaymentMonitor from "@/pages/finance/PaymentMonitor";
import TasksPanel, { TASKS_KEY } from "./components/rail/TasksPanel";

const ME = "11111111-1111-4111-8111-111111111111";
const JESS = "22222222-2222-4222-8222-222222222222";

function iso(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

function timing(actionOn: string, workingDays: number): OperationWorkItem["timing"] {
  return {
    businessDueOn: actionOn,
    actionOn,
    placement: workingDays > 0 ? "missed" : "on_day",
    missedAge: {
      state: "counted",
      workingDays,
      basis: { calendarKey: "module+person", from: actionOn, to: iso(0) },
    },
    eligibility: "eligible",
    noDateReason: null,
    calendar: {
      module: { key: "payment", source: "payment", state: "ready" },
      actor: { key: "person:me", source: "people", state: "ready" },
      holidayName: null,
    },
  };
}

/** One issued invoice whose goods are ready and whose delivery already
 *  passed — the Monitor admits the collection action for it. */
function invoice(): InvoiceRegisterRow {
  return {
    id: "i3", invoice_no: "INV-1", status: "issued", kind: "sales", amount: 1000, tax_amount: 0,
    issued_at: "2026-09-01T00:00:00Z", voided_at: null, void_reason: null, replaces_invoice_id: null,
    created_at: "2026-09-06T00:00:00Z", order_id: "o3",
    orders: {
      id: "o3", so: 1302, customer_name: "LIM KUAN YANG", customer_phone: "0123456789",
      status: "proceed_order", paid: 0, delivery_date: null, delivery_date_tbd: false, delivered_at: null,
      ops_assigned_logistic: null, delivery_partners: { name: "NETS", contact: null },
      order_payments: [], payment_communications: [],
      order_lines: [{ sku: "A", qty: 1, unit_price: 1000 }], order_addons: [],
      ops_order_control: [{ balance: null, confirmed_date: iso(-3), line_etas: null, line_stock_status: { A: "ready" } }],
    },
  } as unknown as InvoiceRegisterRow;
}

function collectItem(owner: OperationWorkItem["owner"]): OperationWorkItem {
  return {
    contractVersion: 2,
    id: "payment:i3:payment.collect_customer_balance", module: "payment",
    ruleKey: "payment.collect_customer_balance",
    ruleVersion: 1,
    object: { kind: "invoice", id: "i3", label: "SO-1302" },
    problem: "Customer payment should have been received", action: "Ask customer to pay",
    recipient: "LIM KUAN YANG", requiredResult: "Payment received",
    completionPredicate: "Payment recorded", completionStatement: "Payment received",
    owner,
    timing: timing(iso(-5), 3),
    communication: null, blocker: null, nextConsequence: null,
    interaction: { mode: "open_module", fallbackDestination: "/finance/monitor?invoice=i3" },
    destination: "/finance/monitor?invoice=i3", tone: "danger", locked: false, broken: false,
    observedAt: "2026-09-13T01:00:00.000Z", sourceVersion: "2026-09-13T01:00:00.000Z",
  };
}
const UNASSIGNED: OperationWorkItem["owner"] = {
  rule: "collection_owner", dutyKey: "delivery_duty", normal: null, activeCover: null,
  coverEvidence: null, acting: null, state: "not_assigned",
};
const JESS_HOLDS: OperationWorkItem["owner"] = {
  rule: "collection_owner", dutyKey: "delivery_duty",
  normal: { userId: JESS, name: "Jess" }, activeCover: null, coverEvidence: null,
  acting: { userId: JESS, name: "Jess" }, state: "primary",
};
/** A delivery item I hold and am late on — the Quick Rail counts it under Late. */
const MINE: OperationWorkItem = {
  contractVersion: 2,
  id: "delivery:o9:delivery.confirm_date", module: "delivery", ruleKey: "delivery.confirm_date",
  ruleVersion: 1,
  object: { kind: "order", id: "o9", label: "SO-1309" },
  problem: "Delivery date not confirmed", action: "Call NETS to confirm delivery date",
  recipient: "NETS", requiredResult: "Date confirmed",
  completionPredicate: "Confirmed date recorded", completionStatement: "Date confirmed",
  owner: { rule: "delivery_duty", dutyKey: "delivery_duty", normal: { userId: ME, name: "Me" }, activeCover: null, coverEvidence: null, acting: { userId: ME, name: "Me" }, state: "primary" },
  timing: timing(iso(-2), 2),
  communication: null, blocker: null, nextConsequence: null,
  interaction: { mode: "open_module", fallbackDestination: "/operation/delivery" },
  destination: "/operation/delivery", tone: "danger", locked: false, broken: false,
  observedAt: "2026-09-13T01:00:00.000Z", sourceVersion: "2026-09-13T01:00:00.000Z",
};

function workResponse(items: OperationWorkItem[]): OperationWorkResponse {
  return {
    contractVersion: 2,
    complete: true,
    items,
    staff: [{ userId: ME, name: "Me", email: "me@carres.com" }],
    generatedOn: "2026-09-13",
    closureReceipt: null,
    sources: (["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const).map((key) => ({
      key,
      state: "healthy",
      observedAt: "2026-09-13T01:00:00.000Z",
      lastSuccessfulAt: "2026-09-13T01:00:00.000Z",
      errorLabel: null,
    })),
  };
}

const state = vi.hoisted(() => ({
  work: { items: [] as unknown[], staff: [] as unknown[], generatedOn: "2026-09-13" } as unknown,
  workCalls: 0,
  tasksCalls: 0,
}));
/** One complete legacy task — it must satisfy `opsTaskSchema` so the shape
 *  assertions below test the shapes, not a thin fixture. */
const TASKS: OpsTasksListResponse = {
  tasks: [{
    id: "33333333-3333-4333-8333-333333333333", title: "Legacy task", detail: null, status: "open",
    priority: "normal", createdBy: null, createdByName: null, assignedTo: null, assignedToName: null,
    claimedBy: null, claimedByName: null, claimedAt: null, slaMinutes: 60, dueAt: null, doneAt: null,
    relatedOrderId: null, relatedSo: null, escalatedAt: null, escalateReason: null, escalateNote: null,
    createdAt: "2026-09-13T00:00:00Z", updatedAt: "2026-09-13T00:00:00Z", overdue: false,
  }],
};

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    if (url.startsWith("/api/operation/work")) { state.workCalls += 1; return state.work; }
    if (url.startsWith("/api/ops/tasks")) { state.tasksCalls += 1; return TASKS; }
    if (url.startsWith("/api/finance/invoices/register")) return { rows: [invoice()], total: 1 };
    if (url.startsWith("/api/finance/payment-storage/later-delivery-requests")) return { requests: [] };
    if (url.startsWith("/api/finance/payment-storage")) return { cases: [] };
    if (url.startsWith("/api/finance/payment-settings")) return { collection_timing: [], bank_accounts: [], storage_rules: [], setting_changes: [] };
    if (url.startsWith("/api/catalog")) return { models: [], skus: [] };
    if (url.includes("/templates")) return { templates: [] };
    return {};
  }),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string; session: { user: { id: string } } }) => unknown) =>
    selector({ role: "operation", session: { user: { id: ME } } }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

/** The legacy read exactly as `GlobalTopBar` and `OperationOrdersControl`
 *  define it — the source test below pins that this probe IS their query. */
function LegacyTasksProbe() {
  const q = useQuery<OpsTasksListResponse>({ queryKey: TASKS_KEY, queryFn: () => apiFetch("/api/ops/tasks") });
  return <div data-testid="legacy-tasks">{q.data ? ("tasks" in q.data ? `tasks:${q.data.tasks.length}` : "WRONG-SHAPE") : "loading"}</div>;
}
/** The OLD colliding key — the negative control only. */
function CollidingLegacyProbe() {
  const q = useQuery<OpsTasksListResponse>({ queryKey: ["operation", "work"], queryFn: () => apiFetch("/api/ops/tasks") });
  return <div data-testid="colliding-tasks">{q.data ? "loaded" : "loading"}</div>;
}
function WorkFeedProbe() {
  const q = useOperationWork();
  return <div data-testid="work-feed">{q.isError ? "error" : q.data ? ("items" in q.data ? `items:${(q.data as OperationWorkResponse).items.length}` : "WRONG-SHAPE") : "loading"}</div>;
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
}
function mount(qc: QueryClient, ui: React.ReactNode) {
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={["/finance/monitor"]}>{ui}</MemoryRouter></QueryClientProvider>);
}
/** The two entries must each satisfy their OWN reader's schema and FAIL the
 *  other's — the shapes are incompatible, so a shared key could never serve
 *  both. */
function expectIsolatedShapes(qc: QueryClient) {
  const tasks = qc.getQueryData(TASKS_KEY);
  const work = qc.getQueryData(qk.operation.work());
  expect(opsTasksListResponseSchema.safeParse(tasks).success).toBe(true);
  expect(operationWorkResponseSchema.safeParse(tasks).success).toBe(false);
  expect(operationWorkResponseSchema.safeParse(work).success).toBe(true);
  expect(opsTasksListResponseSchema.safeParse(work).success).toBe(false);
}

beforeEach(() => {
  state.work = workResponse([collectItem(UNASSIGNED), MINE]);
  state.workCalls = 0;
  state.tasksCalls = 0;
  localStorage.clear();
  Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
});

describe("one cache key per read — the keys", () => {
  it("the legacy tasks key and the Work feed key are distinct and neither is a prefix of the other", () => {
    const tasks = [...TASKS_KEY];
    const work = [...qk.operation.work()];
    expect(hashKey(tasks)).not.toBe(hashKey(work));
    const prefix = (a: readonly unknown[], b: readonly unknown[]) => a.length <= b.length && a.every((k, i) => k === b[i]);
    expect(prefix(tasks, work)).toBe(false);
    expect(prefix(work, tasks)).toBe(false);
    // Every key in the `operation` family is its own read.
    const family = [tasks, work, [...qk.operation.inbox()], [...qk.operation.dashboard()], [...qk.operation.badges()]].map(hashKey);
    expect(new Set(family).size).toBe(family.length);
  });

  it("every `/api/ops/tasks` reader in the web app caches under TASKS_KEY and nothing else caches under it", () => {
    const src = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
    for (const file of ["components/GlobalTopBar.tsx", "OperationOrdersControl.tsx"]) {
      const text = src(file);
      expect(text).toMatch(/queryKey:\s*TASKS_KEY,\s*\n\s*queryFn:\s*\(\)\s*=>\s*apiFetch\("\/api\/ops\/tasks"\)/);
      expect(text).not.toMatch(/\["operation",\s*"work"\]/);
    }
    expect(src("components/rail/TasksPanel.tsx")).not.toMatch(/TASKS_KEY\s*=\s*\["operation",\s*"work"\]/);
  });
});

describe("one cache key per read — both mounting orders, real QueryClient", () => {
  it("rejects an old or partial Work contract at the query boundary", async () => {
    state.work = { contractVersion: 1, items: [{ id: "legacy-item" }] };
    const qc = client();
    mount(qc, <WorkFeedProbe />);
    await waitFor(() => expect(screen.getByTestId("work-feed")).toHaveTextContent("error"));
    expect(qc.getQueryData(qk.operation.work())).toBeUndefined();
  });

  it("1 · TasksPanel's legacy read loads first → the shared Work feed still receives the Work feed", async () => {
    const qc = client();
    const first = mount(qc, <LegacyTasksProbe />);
    await waitFor(() => expect(screen.getByTestId("legacy-tasks")).toHaveTextContent("tasks:1"));
    first.unmount();
    mount(qc, <><LegacyTasksProbe /><WorkFeedProbe /><TasksPanel /></>);
    await waitFor(() => expect(screen.getByTestId("work-feed")).toHaveTextContent("items:2"));
    expect(screen.getByTestId("legacy-tasks")).toHaveTextContent("tasks:1");
    // The Quick Rail counted MY late item from the feed, not from `{ tasks }`.
    expect(within(screen.getByTestId("my-work-panel")).getByText("Missed").nextElementSibling).toHaveTextContent("1");
    expectIsolatedShapes(qc);
    expect(state.workCalls).toBe(1);
    expect(state.tasksCalls).toBe(1);
  });

  it("2 · the shared Work feed loads first → the legacy tasks read still receives its own task data", async () => {
    const qc = client();
    const first = mount(qc, <><WorkFeedProbe /><TasksPanel /></>);
    await waitFor(() => expect(screen.getByTestId("work-feed")).toHaveTextContent("items:2"));
    first.unmount();
    mount(qc, <><WorkFeedProbe /><LegacyTasksProbe /></>);
    await waitFor(() => expect(screen.getByTestId("legacy-tasks")).toHaveTextContent("tasks:1"));
    expect(screen.getByTestId("work-feed")).toHaveTextContent("items:2");
    expectIsolatedShapes(qc);
    expect(state.workCalls).toBe(1);
    expect(state.tasksCalls).toBe(1);
  });

  it("opens the exact My Work day and never exposes Team Work from the rail", async () => {
    const todayItem = { ...MINE, id: "delivery:o10:delivery.confirm_date", timing: timing("2026-09-13", 0) };
    state.work = workResponse([MINE, todayItem]);
    mount(client(), <TasksPanel />);
    const panel = await screen.findByTestId("my-work-panel");
    expect(within(panel).getByRole("link", { name: "Open My Work · Missed · 1 action" }))
      .toHaveAttribute("href", "/operation?tab=work&scope=mine&day=missed");
    expect(within(panel).getByRole("link", { name: "Open My Work · Today · 1 action" }))
      .toHaveAttribute("href", "/operation?tab=work&scope=mine&day=2026-09-13");
    expect(panel).not.toHaveTextContent("Team Work");
  });

  it("names incomplete source health instead of claiming My Work is clear", async () => {
    const response = workResponse([]);
    response.complete = false;
    response.sources = response.sources.map((source) => source.key === "delivery"
      ? { ...source, state: "failed", errorLabel: "Delivery could not be loaded" }
      : source);
    state.work = response;
    mount(client(), <TasksPanel />);
    const panel = await screen.findByTestId("my-work-panel");
    expect(panel).toHaveTextContent("My Work could not be refreshed · delivery");
    expect(panel).not.toHaveTextContent("No work due now");
    expect(within(panel).getByRole("link", { name: "Open My Work" })).toBeInTheDocument();
  });

  it("negative control · the old colliding key reproduces the poisoning, so this suite detects a revert", async () => {
    const qc = client();
    const first = mount(qc, <CollidingLegacyProbe />);
    await waitFor(() => expect(screen.getByTestId("colliding-tasks")).toHaveTextContent("loaded"));
    first.unmount();
    mount(qc, <WorkFeedProbe />);
    await waitFor(() => expect(screen.getByTestId("work-feed")).not.toHaveTextContent("loading"));
    expect(screen.getByTestId("work-feed")).toHaveTextContent("WRONG-SHAPE");
    expect(operationWorkResponseSchema.safeParse(qc.getQueryData(qk.operation.work())).success).toBe(false);
  });

  it("3 · Quick Rail and Payment Monitor mounted together with the legacy read → no cache-shape pollution", async () => {
    const qc = client();
    mount(qc, <><LegacyTasksProbe /><TasksPanel /><PaymentMonitor /></>);
    await waitFor(() => expect(screen.getByTestId("legacy-tasks")).toHaveTextContent("tasks:1"));
    const timing = await screen.findByTestId("monitor-timing-1302");
    await waitFor(() => expect(within(timing).getByTestId("monitor-owner-unassigned")).toBeInTheDocument());
    expect(timing).toHaveTextContent("Ask customer to pay");
    expect(within(screen.getByTestId("my-work-panel")).getByText("Missed").nextElementSibling).toHaveTextContent("1");
    expectIsolatedShapes(qc);
    expect(state.workCalls).toBe(1);
    expect(state.tasksCalls).toBe(1);
  });

  it("4 · invalidating the Work feed refreshes the Payment Monitor's owner state — and leaves the legacy entry alone", async () => {
    const qc = client();
    mount(qc, <><LegacyTasksProbe /><PaymentMonitor /></>);
    const timing = await screen.findByTestId("monitor-timing-1302");
    await waitFor(() => expect(within(timing).getByTestId("monitor-owner-unassigned")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("legacy-tasks")).toHaveTextContent("tasks:1"));

    // The collection owner is established (Delivery Duty held); the feed now resolves Jess.
    state.work = workResponse([collectItem(JESS_HOLDS), MINE]);
    await act(async () => { await qc.invalidateQueries({ queryKey: qk.operation.work() }); });

    await waitFor(() => expect(within(screen.getByTestId("monitor-timing-1302")).getByTestId("monitor-owner-avatar")).toHaveAttribute("aria-label", "Jess"));
    expect(screen.queryByTestId("monitor-owner-unassigned")).not.toBeInTheDocument();
    expect(state.workCalls).toBe(2);
    expect(state.tasksCalls).toBe(1);
    expect(screen.getByTestId("legacy-tasks")).toHaveTextContent("tasks:1");
    expectIsolatedShapes(qc);
  });

  it("5 · a collection owner nobody could be established for preserves the action and shows the configuration exception with the one assignment door", async () => {
    const qc = client();
    mount(qc, <PaymentMonitor />);
    const timing = await screen.findByTestId("monitor-timing-1302");
    const exception = await within(timing).findByTestId("monitor-owner-unassigned");
    expect(exception).toHaveTextContent("Nobody holds Delivery Duty.");
    expect(within(exception).getByRole("link", { name: "Staff & Duties" })).toHaveAttribute("href", "/operation?tab=staff-duties");
    expect(timing).toHaveTextContent("Payment should have been received");
    expect(timing).toHaveTextContent("Ask customer to pay");
    expect(screen.queryByTestId("monitor-owner-avatar")).not.toBeInTheDocument();
  });
});
