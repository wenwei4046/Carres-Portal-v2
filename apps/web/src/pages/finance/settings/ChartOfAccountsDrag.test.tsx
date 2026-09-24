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
 *
 * 0570 also pins what the screen must never offer, because the database would
 * refuse it: a heading moving under another heading, a move into or out of a
 * heading the chart read names in `rule_headings`, and the last account
 * leaving its heading. A drop on a sibling HEADING puts the account under it;
 * Alt + arrow beside that heading still only reorders.
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
        // 0570 gl_rule_headings: the customer-money heading below.
        rule_headings: ["403-0000"],
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
   402-B001 is the only account under 402-0000, so it may never leave. 403-0000 is a
   heading money rules read (`rule_headings`): nothing moves into or out of
   it. 404-0000 is a posting account beside the headings under 400-0000. The asset
   branch is a heading of another kind, which a drop may never reach. */
const CHART = [
  acc("300-0000", "Assets", null, "ASSET"),
  acc("310-0000", "Cash and bank", "300-0000", "ASSET"),
  acc("310-C001", "Cash on hand", "310-0000", "ASSET"),
  acc("400-0000", "Liabilities", null),
  acc("401-0000", "Payables", "400-0000"),
  acc("401-A001", "Trade payables", "401-0000"),
  acc("401-D001", "Deposits held", "401-0000"),
  acc("401-E001", "Accrued expenses", "401-0000"),
  acc("402-0000", "Borrowings", "400-0000"),
  acc("402-B001", "Bank loan", "402-0000"),
  acc("403-0000", "Customer money held", "400-0000"),
  acc("403-C001", "Customer deposits held", "403-0000"),
  acc("403-D001", "Advance deposits held", "403-0000"),
  acc("404-0000", "Director's account", "400-0000"),
];
const ASSETS = ["300-0000", "310-0000", "310-C001"];
const BORROWINGS = ["402-0000", "402-B001", "403-0000", "403-C001", "403-D001", "404-0000"];

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
  await waitFor(() => expect(row("401-A001")).toBeTruthy());
}

const START = [...ASSETS, "400-0000", "401-0000", "401-A001", "401-D001", "401-E001", ...BORROWINGS];

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
    expect(codesOnScreen()).toEqual([...ASSETS, "400-0000", "401-0000", "401-A001", "401-D001", "401-E001", ...BORROWINGS]);

    drag("401-A001", "401-E001");

    await waitFor(() => expect(net.posts).toHaveLength(1));
    expect(net.posts[0]).toEqual({
      parentCode: "401-0000",
      // The order it READ, not the order it wants. These two being the same
      // array is what silently disables the two-dragger check.
      was: ["401-A001", "401-D001", "401-E001"],
      now: ["401-D001", "401-E001", "401-A001"],
    });
    await waitFor(() =>
      expect(codesOnScreen()).toEqual([...ASSETS, "400-0000", "401-0000", "401-D001", "401-E001", "401-A001", ...BORROWINGS]),
    );
    // THE NUMBER IS UNTOUCHED: the same codes, still on the same names.
    expect([...codesOnScreen()].sort()).toEqual(CHART.map((a) => a.code).sort());
    expect(row("401-A001").textContent).toContain("401-A001");
    expect(row("401-A001").textContent).toContain("Trade payables");
  });

  it("drags an account to the top of its heading", async () => {
    show();
    await ready();

    drag("401-E001", "401-A001");

    await waitFor(() => expect(net.posts).toHaveLength(1));
    expect(net.posts[0]!.now).toEqual(["401-E001", "401-A001", "401-D001"]);
    await waitFor(() =>
      expect(codesOnScreen()).toEqual([...ASSETS, "400-0000", "401-0000", "401-E001", "401-A001", "401-D001", ...BORROWINGS]),
    );
  });

  it("says so and re-reads when somebody else moved first", async () => {
    net.refuse = "The chart changed while you were dragging. Open it again and redo the move.";
    show();
    await ready();
    const readsBefore = net.reads;

    drag("401-A001", "401-E001");

    expect(await screen.findByTestId("chart-refusal")).toHaveTextContent(
      "The chart changed while you were dragging. Open it again and redo the move.",
    );
    // The optimistic order is gone, and the chart was asked for again.
    await waitFor(() => expect(net.reads).toBeGreaterThan(readsBefore));
    await waitFor(() =>
      expect(codesOnScreen()).toEqual([...ASSETS, "400-0000", "401-0000", "401-A001", "401-D001", "401-E001", ...BORROWINGS]),
    );
  });

  it("moves the same account from the keyboard", async () => {
    show();
    await ready();

    const tr = row("401-A001");
    tr.focus();
    fireEvent.keyDown(tr, { key: "ArrowDown", altKey: true });

    await waitFor(() => expect(net.posts).toHaveLength(1));
    expect(net.posts[0]).toEqual({
      parentCode: "401-0000",
      was: ["401-A001", "401-D001", "401-E001"],
      now: ["401-D001", "401-A001", "401-E001"],
    });
    await waitFor(() =>
      expect(codesOnScreen()).toEqual([...ASSETS, "400-0000", "401-0000", "401-D001", "401-A001", "401-E001", ...BORROWINGS]),
    );
    // Plain ArrowDown is still plain row navigation, not a move.
    fireEvent.keyDown(row("401-A001"), { key: "ArrowDown" });
    expect(net.posts).toHaveLength(1);
  });

  it("keeps the keyboard inside the heading: the last child cannot go further", async () => {
    show();
    await ready();

    const tr = row("401-E001");
    tr.focus();
    // The next row down is 402-0000, a heading of the same kind that a DROP may
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

    drag("401-D001", "402-0000");

    await waitFor(() => expect(net.moves).toHaveLength(1));
    expect(net.posts).toHaveLength(0);
    expect(net.moves[0]).toEqual({
      code: "401-D001",
      toParentCode: "402-0000",
      // Each heading sends the order it READ and the order it WANTS. Never the
      // same array twice: that would switch the two-dragger check off.
      from: { was: ["401-A001", "401-D001", "401-E001"], now: ["401-A001", "401-E001"] },
      to: { was: ["402-B001"], now: ["402-B001", "401-D001"] },
    });
    // It now sits LAST under 402-0000, no longer under 401-0000.
    await waitFor(() =>
      expect(codesOnScreen()).toEqual([...ASSETS, "400-0000", "401-0000", "401-A001", "401-E001", "402-0000", "402-B001", "401-D001", "403-0000", "403-C001", "403-D001", "404-0000"]),
    );
    // Same number, same name.
    expect(row("401-D001").textContent).toContain("401-D001 Deposits held");
    expect(net.chart.find((a) => a.code === "401-D001")).toMatchObject({
      code: "401-D001", name: "Deposits held", parent_code: "402-0000", sort_order: 2,
    });
  });

  it("drops an account on an account under another heading: it goes under that heading, beside it (0577)", async () => {
    show();
    await ready();

    // 402-B001 is a posting account under 402-0000, a heading of the same kind.
    drag("401-D001", "402-B001");

    await waitFor(() => expect(net.moves).toHaveLength(1));
    expect(net.moves[0]).toMatchObject({ code: "401-D001", toParentCode: "402-0000", to: { was: ["402-B001"], now: ["401-D001", "402-B001"] } });
  });

  it("never offers a heading of another kind", async () => {
    show();
    await ready();

    // 310-0000 Cash and bank is an asset heading; 401-D001 is a liability.
    drag("401-D001", "310-0000");

    await nothingHappened();
  });

  it("puts a heading under another heading, and its accounts go with it (0577)", async () => {
    show();
    await ready();

    // 401-0000 and 402-0000 are headings side by side under 400-0000.
    drag("401-0000", "402-0000");

    await waitFor(() => expect(net.moves).toHaveLength(1));
    expect(net.posts).toHaveLength(0);
    expect(net.moves[0]).toMatchObject({ code: "401-0000", toParentCode: "402-0000" });
    expect(net.chart.filter((a) => a.parent_code === "401-0000").map((a) => a.code)).toEqual(["401-A001", "401-D001", "401-E001"]);
  });

  it("never puts a heading under a heading inside it (0577)", async () => {
    show();
    await ready();

    // 401-0000 is inside 400-0000.
    drag("400-0000", "401-0000");

    await nothingHappened();
  });

  it("offers a heading the headings of its kind to go under in its row menu (0577)", async () => {
    show();
    await ready();

    const tr = row("401-0000");
    tr.focus();
    fireEvent.keyDown(tr, { key: "F10", shiftKey: true });

    await waitFor(() =>
      expect(screen.queryAllByRole("menuitem").map((b) => b.textContent)).toContain("Move under 402-0000 Borrowings"),
    );
  });

  it("never moves an account into a heading whose accounts decide how money may be recorded", async () => {
    show();
    await ready();

    drag("401-D001", "403-0000");

    await nothingHappened();
  });

  it("never moves an account out of that heading", async () => {
    show();
    await ready();

    // 403-C001 has a sibling, so only the heading's rule stops it.
    drag("403-C001", "402-0000");

    await nothingHappened();
  });

  it("never moves the last account out of its heading", async () => {
    show();
    await ready();

    // 402-B001 is the only account under 402-0000.
    drag("402-B001", "401-0000");

    await nothingHappened();
  });

  it("drops a posting account on a heading BESIDE it: it goes under that heading", async () => {
    show();
    await ready();

    // 404-0000 and 402-0000 are both under 400-0000.
    drag("404-0000", "402-0000");

    await waitFor(() => expect(net.moves).toHaveLength(1));
    expect(net.posts).toHaveLength(0);
    expect(net.moves[0]).toEqual({
      code: "404-0000",
      toParentCode: "402-0000",
      from: { was: ["401-0000", "402-0000", "403-0000", "404-0000"], now: ["401-0000", "402-0000", "403-0000"] },
      to: { was: ["402-B001"], now: ["402-B001", "404-0000"] },
    });
    expect(net.chart.find((a) => a.code === "404-0000")).toMatchObject({
      code: "404-0000", name: "Director's account", parent_code: "402-0000",
    });
  });

  it("steps a posting account past a heading beside it with Alt + arrow: its place changes, its heading does not", async () => {
    show();
    await ready();

    const tr = row("404-0000");
    tr.focus();
    fireEvent.keyDown(tr, { key: "ArrowUp", altKey: true });

    await waitFor(() => expect(net.posts).toHaveLength(1));
    expect(net.moves).toHaveLength(0);
    expect(net.posts[0]).toEqual({
      parentCode: "400-0000",
      was: ["401-0000", "402-0000", "403-0000", "404-0000"],
      now: ["401-0000", "402-0000", "404-0000", "403-0000"],
    });
  });

  it("from the keyboard: Shift+F10 lists the headings it may go under, and choosing one moves it", async () => {
    show();
    await ready();

    const tr = row("401-D001");
    tr.focus();
    fireEvent.keyDown(tr, { key: "F10", shiftKey: true });

    const menu = await screen.findByRole("menu");
    // Same kind, not the heading it is under already, no asset heading.
    expect(within(menu).getAllByRole("menuitem").map((b) => b.textContent)).toEqual([
      "Move under 400-0000 Liabilities",
      "Move under 402-0000 Borrowings",
    ]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Move under 402-0000 Borrowings" }));

    await waitFor(() => expect(net.moves).toHaveLength(1));
    expect(net.moves[0]).toMatchObject({ code: "401-D001", toParentCode: "402-0000" });
    await waitFor(() =>
      expect(codesOnScreen()).toEqual([...ASSETS, "400-0000", "401-0000", "401-A001", "401-E001", "402-0000", "402-B001", "401-D001", "403-0000", "403-C001", "403-D001", "404-0000"]),
    );
  });

  it("says so and re-reads when the move is refused", async () => {
    net.refuse = "The chart changed while you were dragging. Open it again and redo the move.";
    show();
    await ready();
    const readsBefore = net.reads;

    drag("401-D001", "402-0000");

    expect(await screen.findByTestId("chart-refusal")).toHaveTextContent(
      "The chart changed while you were dragging. Open it again and redo the move.",
    );
    await waitFor(() => expect(net.reads).toBeGreaterThan(readsBefore));
    await waitFor(() =>
      expect(codesOnScreen()).toEqual([...ASSETS, "400-0000", "401-0000", "401-A001", "401-D001", "401-E001", ...BORROWINGS]),
    );
  });
});

describe("Chart of accounts — a heading's name and number (0570)", () => {
  it("opens the same form for a heading, saves a new number, and its accounts stay under it", async () => {
    show();
    await ready();

    fireEvent.click(screen.getByText("401-0000 Payables"));
    const dialog = await screen.findByRole("dialog");
    // Typed in lower case: the letter goes up in capitals, as the database stores it.
    fireEvent.change(within(dialog).getByLabelText(/Number/), { target: { value: "400-l000" } });
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Trade and other payables" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(net.patches).toHaveLength(1));
    expect(net.patches[0]).toEqual({
      path: "/api/finance/ledger/accounts/401-0000",
      body: { name: "Trade and other payables", code: "400-L000" },
    });
    await waitFor(() =>
      expect(codesOnScreen()).toEqual([...ASSETS, "400-0000", "400-L000", "401-A001", "401-D001", "401-E001", ...BORROWINGS]),
    );
    expect(row("400-L000").textContent).toContain("400-L000 Trade and other payables");
  });
});

/* AutoCount nests headings three deep, and its numbers do not follow the tree:
   410-0010 sits under 401-0000, and 411-0000 is a heading under 410-0000. The
   screen reads parent_code only, so the tree is right whatever order the
   numbers sort in. */
const THREE_DEEP = [
  acc("499-0000", "Liabilities", null),
  acc("401-0000", "Payables", "499-0000"),
  acc("400-0000", "Trade creditors", "401-0000"),
  acc("410-0010", "Accrued expenses", "401-0000"),
  acc("410-0000", "Accruals", "499-0000"),
  acc("410-0060", "Accrued commission", "410-0000"),
  acc("411-0000", "Accruals - salaries", "410-0000"),
  acc("410-0011", "Accrued salaries - sales", "411-0000"),
];

describe("Chart of accounts: headings three deep (0570)", () => {
  beforeEach(() => {
    net.chart = THREE_DEEP.map((a) => ({ ...a }));
  });

  it("shows each account under its own heading, indented by depth, not by number", async () => {
    show();
    await waitFor(() => expect(row("410-0011")).toBeTruthy());
    expect(codesOnScreen()).toEqual([
      "499-0000", "401-0000", "400-0000", "410-0010", "410-0000", "410-0060", "411-0000", "410-0011",
    ]);
    const indent = (code: string) => (row(code).querySelector("span[style]") as HTMLElement).style.paddingLeft;
    expect([indent("499-0000"), indent("410-0000"), indent("411-0000"), indent("410-0011")]).toEqual(["0px", "20px", "40px", "60px"]);
  });

  it("moves an account under the third-level heading", async () => {
    show();
    await waitFor(() => expect(row("410-0011")).toBeTruthy());
    drag("410-0010", "411-0000");
    await waitFor(() => expect(net.moves).toHaveLength(1));
    expect(net.moves[0]).toEqual({
      code: "410-0010",
      toParentCode: "411-0000",
      from: { was: ["400-0000", "410-0010"], now: ["400-0000"] },
      to: { was: ["410-0011"], now: ["410-0011", "410-0010"] },
    });
    await waitFor(() => expect(codesOnScreen()).toEqual([
      "499-0000", "401-0000", "400-0000", "410-0000", "410-0060", "411-0000", "410-0011", "410-0010",
    ]));
  });

  it("renumbers the middle heading to a letter code, and the level below follows", async () => {
    show();
    await waitFor(() => expect(row("410-0011")).toBeTruthy());
    fireEvent.click(screen.getByText("411-0000 Accruals - salaries"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Number/), { target: { value: "411-a000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(net.patches).toHaveLength(1));
    expect(net.patches[0]).toEqual({
      path: "/api/finance/ledger/accounts/411-0000",
      body: { name: "Accruals - salaries", code: "411-A000" },
    });
    await waitFor(() => expect(codesOnScreen()).toEqual([
      "499-0000", "401-0000", "400-0000", "410-0010", "410-0000", "410-0060", "411-A000", "410-0011",
    ]));
    expect(net.chart.find((a) => a.code === "410-0011")).toMatchObject({ parent_code: "411-A000" });
  });

  it.each(["900-AA01", "90-A001", "900-A0011", "900-\u0130001", "\uFF19\uFF10\uFF10-A001", "900-\u0131001"])(
    "refuses %s under the Number field without sending it",
    async (typed) => {
      show();
      await waitFor(() => expect(row("410-0011")).toBeTruthy());
      fireEvent.click(screen.getByText("410-0060 Accrued commission"));
      const dialog = await screen.findByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText(/Number/), { target: { value: typed } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      expect(await within(dialog).findByText(
        "A number is four digits, like 1210, or AutoCount's form, like 100-0001 or 900-A001.",
      )).toBeInTheDocument();
      expect(net.patches).toHaveLength(0);
    },
  );
});
