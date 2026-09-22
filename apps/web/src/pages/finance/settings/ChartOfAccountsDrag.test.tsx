/**
 * Finance Settings → Chart of accounts: MOVING an account (0557).
 *
 * The four things a move has to get right, and one of them is the reason the
 * whole feature exists:
 *   · the order changes and the NUMBER does not — the owner's own wording;
 *   · a move to the top is a move like any other;
 *   · a refusal reaches the screen instead of being swallowed, and the
 *     optimistic order is thrown away;
 *   · the same move happens from the keyboard, because a drag-only control
 *     locks out anyone not using a mouse.
 *
 * It also pins the thing that is easy to break and impossible to see: the
 * screen sends the order it READ as `was` and the order it WANTS as `now`.
 * Sending the same array twice would make `gl_accounts_reorder`'s staleness
 * check pass every time — no error, no symptom, and two people dragging at
 * once silently overwrite each other. So the test asserts `was` is the BEFORE
 * order, not the after one.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChartOfAccounts from "./ChartOfAccounts";

const net = vi.hoisted(() => ({
  posts: [] as Array<Record<string, unknown>>,
  reads: 0,
  refuse: null as string | null,
  /* The stored chart. An accepted move writes sort_order 1..n over the codes
     it was sent, exactly as gl_accounts_reorder does, so the re-read that
     follows a move answers with the new order instead of the old one. */
  chart: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (_path: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "GET") {
      net.reads += 1;
      return { go_live_on: "2026-09-10", accounts: net.chart.map((a) => ({ ...a })) };
    }
    const body = JSON.parse(String(init?.body)) as { now: string[] };
    net.posts.push(body);
    if (net.refuse) throw new Error(net.refuse);
    net.chart = net.chart.map((a) => {
      const i = body.now.indexOf(String(a.code));
      return i < 0 ? a : { ...a, sort_order: i + 1 };
    });
    return { moved: body.now.length };
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

const acc = (code: string, name: string, parent_code: string | null, is_header = false) => ({
  code, name, kind: "LIABILITY", parent_code, is_control: false, control_for: null,
  is_active: true, is_header, sort_order: 0,
});
/* One heading with three children, plus a second heading whose child sits
   between two of them in tree order — that neighbour is what proves a move
   crosses no heading, and what the keyboard has to step OVER. */
const CHART = [
  acc("2000", "Liabilities", null, true),
  acc("2100", "Payables", "2000", true),
  acc("2110", "Trade payables", "2100"),
  acc("2120", "Deposits held", "2100"),
  acc("2130", "Accrued expenses", "2100"),
  acc("2200", "Borrowings", "2000", true),
];

beforeEach(() => {
  net.posts = [];
  net.reads = 0;
  net.refuse = null;
  net.chart = CHART.map((a) => ({ ...a }));
  localStorage.clear();
});

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ChartOfAccounts />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const codesOnScreen = () =>
  Array.from(document.querySelectorAll<HTMLTableRowElement>("tr[data-row-nav]")).map((tr) => tr.dataset.rowKey);

const row = (code: string) =>
  document.querySelector<HTMLTableRowElement>(`tr[data-row-key="${code}"]`)!;

/** A DataTransfer good enough for jsdom, which ships none. */
const dt = () => ({ setData: vi.fn(), getData: vi.fn(), effectAllowed: "", dropEffect: "" });

function drag(from: string, onto: string) {
  const dataTransfer = dt();
  fireEvent.dragStart(row(from), { dataTransfer });
  fireEvent.dragOver(row(onto), { dataTransfer });
  fireEvent.drop(row(onto), { dataTransfer });
  return dataTransfer;
}

async function ready() {
  await waitFor(() => expect(row("2110")).toBeTruthy());
}

describe("Chart of accounts — a real row drag", () => {
  it("drags an account down: the order changes and the number does not", async () => {
    show();
    await ready();
    expect(codesOnScreen()).toEqual(["2000", "2100", "2110", "2120", "2130", "2200"]);

    drag("2110", "2130");

    await waitFor(() => expect(net.posts).toHaveLength(1));
    expect(net.posts[0]).toEqual({
      parentCode: "2100",
      // The order it READ, not the order it wants. These two being the same
      // array is what silently disables the two-dragger check.
      was: ["2110", "2120", "2130"],
      now: ["2120", "2130", "2110"],
    });
    await waitFor(() => expect(codesOnScreen()).toEqual(["2000", "2100", "2120", "2130", "2110", "2200"]));
    // THE NUMBER IS UNTOUCHED: the same six codes, still on the same names.
    expect([...codesOnScreen()].sort()).toEqual(["2000", "2100", "2110", "2120", "2130", "2200"]);
    expect(row("2110").textContent).toContain("2110");
    expect(row("2110").textContent).toContain("Trade payables");
  });

  it("drags an account to the top of its heading", async () => {
    show();
    await ready();

    drag("2130", "2110");

    await waitFor(() => expect(net.posts).toHaveLength(1));
    expect(net.posts[0]!.now).toEqual(["2130", "2110", "2120"]);
    await waitFor(() => expect(codesOnScreen()).toEqual(["2000", "2100", "2130", "2110", "2120", "2200"]));
  });

  it("offers no move across a heading", async () => {
    show();
    await ready();

    // 2200 is a heading under 2000; 2120 lives under 2100. Different parents,
    // so the drop is never allowed and nothing is sent.
    drag("2120", "2200");

    expect(net.posts).toHaveLength(0);
    expect(codesOnScreen()).toEqual(["2000", "2100", "2110", "2120", "2130", "2200"]);
  });

  it("says so and re-reads when somebody else moved first", async () => {
    net.refuse = "The chart changed while you were dragging. Open it again and redo the move.";
    show();
    await ready();
    const readsBefore = net.reads;

    drag("2110", "2130");

    expect(await screen.findByTestId("chart-refusal")).toHaveTextContent(
      "The chart changed while you were dragging. Open it again and redo the move.",
    );
    // The optimistic order is gone, and the chart was asked for again.
    await waitFor(() => expect(net.reads).toBeGreaterThan(readsBefore));
    await waitFor(() => expect(codesOnScreen()).toEqual(["2000", "2100", "2110", "2120", "2130", "2200"]));
  });

  it("moves the same account from the keyboard", async () => {
    show();
    await ready();

    const tr = row("2110");
    tr.focus();
    fireEvent.keyDown(tr, { key: "ArrowDown", altKey: true });

    await waitFor(() => expect(net.posts).toHaveLength(1));
    expect(net.posts[0]).toEqual({
      parentCode: "2100",
      was: ["2110", "2120", "2130"],
      now: ["2120", "2110", "2130"],
    });
    await waitFor(() => expect(codesOnScreen()).toEqual(["2000", "2100", "2120", "2110", "2130", "2200"]));
    // Plain ArrowDown is still plain row navigation, not a move.
    fireEvent.keyDown(row("2110"), { key: "ArrowDown" });
    expect(net.posts).toHaveLength(1);
  });

  it("keeps the keyboard inside the heading: the last child cannot go further", async () => {
    show();
    await ready();

    const tr = row("2130");
    tr.focus();
    // The next row down is 2200, a heading under another parent. No sibling
    // below, so nothing is sent — the screen offers no refused move.
    fireEvent.keyDown(tr, { key: "ArrowDown", altKey: true });

    expect(net.posts).toHaveLength(0);
  });
});
