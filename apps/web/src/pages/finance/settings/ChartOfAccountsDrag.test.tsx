/**
 * Finance Settings → Chart of accounts: MOVING an account (0557, 0570).
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
 * order, not the after one. A move under another heading (0570) sends that
 * pair once for EACH heading.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChartOfAccounts from "./ChartOfAccounts";

type MoveBody = {
  code: string;
  toParentCode: string;
  from: { was: string[]; now: string[] };
  to: { was: string[]; now: string[] };
};

const net = vi.hoisted(() => ({
  /** Reorders inside one heading (0557). */
  posts: [] as Array<Record<string, unknown>>,
  /** Moves under another heading (0570). */
  moves: [] as Array<Record<string, unknown>>,
  /** Name and number saves from the form. */
  patches: [] as Array<{ path: string; body: Record<string, unknown> }>,
  reads: 0,
  refuse: null as string | null,
  /* The stored chart. An accepted write changes it the way the database does,
     so the re-read that follows answers with the new chart. */
  chart: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      net.reads += 1;
      // A heading is derived, as the chart read derives it: any account another names as parent.
      return {
        go_live_on: "2026-09-10",
        accounts: net.chart.map((a) => ({ ...a, is_header: net.chart.some((c) => c.parent_code === a.code) })),
      };
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (method === "PATCH") {
      net.patches.push({ path, body });
      if (net.refuse) throw new Error(net.refuse);
      const old = path.split("/").pop()!;
      const code = String(body.code ?? old);
      // gl_account_update: the row takes its new number and every child follows (on update cascade).
      net.chart = net.chart.map((a) => ({
        ...a,
        ...(a.code === old ? { code, name: body.name } : {}),
        ...(a.parent_code === old ? { parent_code: code } : {}),
      }));
      return { code };
    }
    if (path.endsWith("/accounts/move")) {
      const m = body as unknown as MoveBody;
      net.moves.push(body);
      if (net.refuse) throw new Error(net.refuse);
      net.chart = net.chart.map((a) => {
        if (a.code === m.code) return { ...a, parent_code: m.toParentCode, sort_order: m.to.now.indexOf(m.code) + 1 };
        const i = m.from.now.indexOf(String(a.code));
        if (i >= 0) return { ...a, sort_order: i + 1 };
        const j = m.to.now.indexOf(String(a.code));
        return j < 0 ? a : { ...a, sort_order: j + 1 };
      });
      return { code: m.code };
    }
    const reorder = body as { now: string[] };
    net.posts.push(body);
    if (net.refuse) throw new Error(net.refuse);
    net.chart = net.chart.map((a) => {
      const i = reorder.now.indexOf(String(a.code));
      return i < 0 ? a : { ...a, sort_order: i + 1 };
    });
    return { moved: reorder.now.length };
  }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));

const acc = (code: string, name: string, parent_code: string | null, kind = "LIABILITY") => ({
  code, name, kind, parent_code, is_control: false, control_for: null,
  is_active: true, is_header: false, sort_order: 0,
});
/* One heading with three children, and a second heading of the same kind right
   below them: the keyboard has to step OVER it, and a drop may land ON it.
   The asset branch is a heading of another kind, which a drop may never reach. */
const CHART = [
  acc("1000", "Assets", null, "ASSET"),
  acc("1100", "Cash and bank", "1000", "ASSET"),
  acc("1110", "Cash on hand", "1100", "ASSET"),
  acc("2000", "Liabilities", null),
  acc("2100", "Payables", "2000"),
  acc("2110", "Trade payables", "2100"),
  acc("2120", "Deposits held", "2100"),
  acc("2130", "Accrued expenses", "2100"),
  acc("2200", "Borrowings", "2000"),
  acc("2210", "Bank loan", "2200"),
];
const ASSETS = ["1000", "1100", "1110"];
const BORROWINGS = ["2200", "2210"];

beforeEach(() => {
  net.posts = [];
  net.moves = [];
  net.patches = [];
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

const START = [...ASSETS, "2000", "2100", "2110", "2120", "2130", ...BORROWINGS];

/** Nothing was sent and nothing moved on screen. The request goes out a tick
    after the drop, so this waits before it looks. */
async function nothingHappened() {
  await new Promise((r) => setTimeout(r, 50));
  expect(net.posts).toHaveLength(0);
  expect(net.moves).toHaveLength(0);
  expect(codesOnScreen()).toEqual(START);
}

describe("Chart of accounts — a real row drag", () => {
  it("drags an account down: the order changes and the number does not", async () => {
    show();
    await ready();
    expect(codesOnScreen()).toEqual([...ASSETS, "2000", "2100", "2110", "2120", "2130", ...BORROWINGS]);

    drag("2110", "2130");

    await waitFor(() => expect(net.posts).toHaveLength(1));
    expect(net.posts[0]).toEqual({
      parentCode: "2100",
      // The order it READ, not the order it wants. These two being the same
      // array is what silently disables the two-dragger check.
      was: ["2110", "2120", "2130"],
      now: ["2120", "2130", "2110"],
    });
    await waitFor(() =>
      expect(codesOnScreen()).toEqual([...ASSETS, "2000", "2100", "2120", "2130", "2110", ...BORROWINGS]),
    );
    // THE NUMBER IS UNTOUCHED: the same codes, still on the same names.
    expect([...codesOnScreen()].sort()).toEqual(CHART.map((a) => a.code).sort());
    expect(row("2110").textContent).toContain("2110");
    expect(row("2110").textContent).toContain("Trade payables");
  });

  it("drags an account to the top of its heading", async () => {
    show();
    await ready();

    drag("2130", "2110");

    await waitFor(() => expect(net.posts).toHaveLength(1));
    expect(net.posts[0]!.now).toEqual(["2130", "2110", "2120"]);
    await waitFor(() =>
      expect(codesOnScreen()).toEqual([...ASSETS, "2000", "2100", "2130", "2110", "2120", ...BORROWINGS]),
    );
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
    await waitFor(() =>
      expect(codesOnScreen()).toEqual([...ASSETS, "2000", "2100", "2110", "2120", "2130", ...BORROWINGS]),
    );
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
    await waitFor(() =>
      expect(codesOnScreen()).toEqual([...ASSETS, "2000", "2100", "2120", "2110", "2130", ...BORROWINGS]),
    );
    // Plain ArrowDown is still plain row navigation, not a move.
    fireEvent.keyDown(row("2110"), { key: "ArrowDown" });
    expect(net.posts).toHaveLength(1);
  });

  it("keeps the keyboard inside the heading: the last child cannot go further", async () => {
    show();
    await ready();

    const tr = row("2130");
    tr.focus();
    // The next row down is 2200, a heading of the same kind that a DROP may
    // land on (0570). Alt + arrow is not a drop: it stays among siblings, and
    // there is no sibling below, so nothing is sent.
    fireEvent.keyDown(tr, { key: "ArrowDown", altKey: true });

    await nothingHappened();
  });
});

describe("Chart of accounts — an account under another heading (0570)", () => {
  it("drops an account on another heading: its parent and position change, its number and name do not", async () => {
    show();
    await ready();

    drag("2120", "2200");

    await waitFor(() => expect(net.moves).toHaveLength(1));
    expect(net.posts).toHaveLength(0);
    expect(net.moves[0]).toEqual({
      code: "2120",
      toParentCode: "2200",
      // Each heading sends the order it READ and the order it WANTS. Never the
      // same array twice: that would switch the two-dragger check off.
      from: { was: ["2110", "2120", "2130"], now: ["2110", "2130"] },
      to: { was: ["2210"], now: ["2210", "2120"] },
    });
    // It now sits LAST under 2200, no longer under 2100.
    await waitFor(() =>
      expect(codesOnScreen()).toEqual([...ASSETS, "2000", "2100", "2110", "2130", "2200", "2210", "2120"]),
    );
    // Same number, same name.
    expect(row("2120").textContent).toContain("2120 Deposits held");
    expect(net.chart.find((a) => a.code === "2120")).toMatchObject({
      code: "2120", name: "Deposits held", parent_code: "2200", sort_order: 2,
    });
  });

  it("never offers a drop onto an account that is not a heading", async () => {
    show();
    await ready();

    // 2210 is a posting account under another heading.
    drag("2120", "2210");

    await nothingHappened();
  });

  it("never offers a heading of another kind", async () => {
    show();
    await ready();

    // 1100 Cash and bank is an asset heading; 2120 is a liability.
    drag("2120", "1100");

    await nothingHappened();
  });

  it("never offers a heading under anything inside it", async () => {
    show();
    await ready();

    // 2100 sits inside 2000.
    drag("2000", "2100");

    await nothingHappened();
  });

  it("from the keyboard: Shift+F10 lists the headings it may go under, and choosing one moves it", async () => {
    show();
    await ready();

    const tr = row("2120");
    tr.focus();
    fireEvent.keyDown(tr, { key: "F10", shiftKey: true });

    const menu = await screen.findByRole("menu");
    // Same kind, not the heading it is under already, no asset heading.
    expect(within(menu).getAllByRole("menuitem").map((b) => b.textContent)).toEqual([
      "Move under 2000 Liabilities",
      "Move under 2200 Borrowings",
    ]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Move under 2200 Borrowings" }));

    await waitFor(() => expect(net.moves).toHaveLength(1));
    expect(net.moves[0]).toMatchObject({ code: "2120", toParentCode: "2200" });
    await waitFor(() =>
      expect(codesOnScreen()).toEqual([...ASSETS, "2000", "2100", "2110", "2130", "2200", "2210", "2120"]),
    );
  });

  it("says so and re-reads when the move is refused", async () => {
    net.refuse = "The chart changed while you were dragging. Open it again and redo the move.";
    show();
    await ready();
    const readsBefore = net.reads;

    drag("2120", "2200");

    expect(await screen.findByTestId("chart-refusal")).toHaveTextContent(
      "The chart changed while you were dragging. Open it again and redo the move.",
    );
    await waitFor(() => expect(net.reads).toBeGreaterThan(readsBefore));
    await waitFor(() =>
      expect(codesOnScreen()).toEqual([...ASSETS, "2000", "2100", "2110", "2120", "2130", ...BORROWINGS]),
    );
  });
});

describe("Chart of accounts — a heading's name and number (0570)", () => {
  it("opens the same form for a heading, saves a new number, and its accounts stay under it", async () => {
    show();
    await ready();

    fireEvent.click(screen.getByText("2100 Payables"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Number/), { target: { value: "210-0000" } });
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Trade and other payables" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(net.patches).toHaveLength(1));
    expect(net.patches[0]).toEqual({
      path: "/api/finance/ledger/accounts/2100",
      body: { name: "Trade and other payables", code: "210-0000" },
    });
    await waitFor(() =>
      expect(codesOnScreen()).toEqual([...ASSETS, "2000", "210-0000", "2110", "2120", "2130", ...BORROWINGS]),
    );
    expect(row("210-0000").textContent).toContain("210-0000 Trade and other payables");
  });
});
