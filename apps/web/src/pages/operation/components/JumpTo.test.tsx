import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { JumpSearchResponse } from "@carres/shared";

/**
 * `Jump to…` — the locked interaction contract, asserted clause by clause
 * (`docs/ui/MASTER.md` · `JUMP TO… INTERACTION`, APPROVED / LOCKED 2026-08-11).
 *
 * The two claims that carry the most weight here are the ones a screenshot
 * cannot prove: a destination the role may not open never reaches the list, and
 * NOTHING on the surface performs workflow.
 */

const jumpResult = vi.fn<() => JumpSearchResponse>(() => ({ documents: [] }));
vi.mock("@/lib/queries", () => ({
  useJumpSearch: (q: string) => ({ data: q.trim() ? jumpResult() : undefined }),
}));

const role = vi.fn<() => string | null>(() => "operation");
vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: { role: string | null }) => unknown) => sel({ role: role() }),
}));

import JumpTo, {
  matchDestinations,
  permittedDestinations,
  resolveRecents,
} from "./JumpTo";

function Here() {
  const loc = useLocation();
  return <div data-testid="here">{`${loc.pathname}${loc.search}`}</div>;
}

function renderJump() {
  return render(
    <MemoryRouter initialEntries={["/operation"]}>
      <JumpTo />
      <Routes>
        <Route path="*" element={<Here />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Open the surface the way the operator does, then hand back its input. */
function openSurface() {
  fireEvent.click(screen.getByTestId("jump-to-trigger"));
  return screen.getByLabelText("Jump to", { selector: "input" });
}

beforeEach(() => {
  localStorage.clear();
  role.mockReturnValue("operation");
  jumpResult.mockReturnValue({ documents: [] });
});

describe("permission filtering — before display, never after", () => {
  it("an operation login is offered Operations doors and nothing from Finance or Admin", () => {
    const areas = new Set(permittedDestinations("operation").map((d) => d.area));
    expect(areas).toEqual(new Set(["Operations"]));
  });

  it("the principal is offered every area the sidebar gives them", () => {
    const areas = new Set(permittedDestinations("principal").map((d) => d.area));
    expect(areas).toEqual(new Set(["Operations", "Finance", "HR", "Admin"]));
  });

  /* ⭐ THE TWO-ROLE PROOF, at the surface. `Approvals` is an Admin door; an
   * operation login must not be able to type its way to it. */
  it("a destination one role may open is invisible to the other", () => {
    role.mockReturnValue("operation");
    const { unmount } = renderJump();
    fireEvent.change(openSurface(), { target: { value: "Approvals" } });
    expect(screen.queryByText("Approvals")).toBeNull();
    expect(screen.getByText("No results")).toBeInTheDocument();
    unmount();

    role.mockReturnValue("principal");
    renderJump();
    fireEvent.change(openSurface(), { target: { value: "Approvals" } });
    expect(screen.getByText("Approvals")).toBeInTheDocument();
  });

  it("a recent destination the role lost is dropped, not replayed from storage", () => {
    const opsDoors = permittedDestinations("operation");
    expect(resolveRecents(["principal:approvals", "operation:work"], opsDoors)).toEqual([
      opsDoors.find((d) => d.id === "operation:work"),
    ]);
  });
});

describe("the empty query", () => {
  it("shows at most FIVE recent destinations, then the permitted destinations", () => {
    localStorage.setItem(
      "carres-jump-recent",
      JSON.stringify([
        "operation:work",
        "operation:orders",
        "operation:stock",
        "operation:payments",
        "operation:delivery",
        "operation:suppliers",
      ]),
    );
    renderJump();
    openSurface();
    const list = screen.getByRole("listbox");
    const labels = within(list)
      .getAllByTestId("jump-to-destination")
      .map((el) => el.textContent);
    /* Six were stored; the MASTER caps the recent block at five, and the sixth
     * still appears once — below, as an ordinary destination. */
    /* `operation:stock` is the On hand page since the WAREHOUSE heading
     * (CARD-2026-08-19-warehouse-rail) — same key, the sidebar's own word. */
    expect(labels.slice(0, 5)).toEqual([
      "WorkOperations",
      "Sales OrdersOperations",
      "On handOperations",
      "PaymentsOperations",
      // `Delivery Work` since the Delivery module's pages joined the rail
      // (CARD-2026-08-19-sidebar-expandable-modules) — same key, same route,
      // the governed name.
      "Delivery WorkOperations",
    ]);
    expect(labels.filter((l) => l === "SuppliersOperations")).toHaveLength(1);
    expect(screen.getByText("Recent")).toBeInTheDocument();
  });

  it("asks the server for no documents while the box is empty", () => {
    renderJump();
    openSurface();
    expect(screen.queryByTestId("jump-to-document")).toBeNull();
  });
});

describe("what typing searches", () => {
  it("matches governed destination NAMES — the pages, never an unbuilt door", () => {
    // The PAGES are the destinations, never the module row. `Purchase Returns`
    // is `Coming soon` and a door the rail refuses to open may not be offered
    // here — grouping the rail (CARD-2026-08-20) changed no destination and
    // added no door, because a drawer is presentation and Jump To lists pages.
    //
    // Starts-with ranks first, then contains in nav order — and in the grouped
    // nav `Manual Purchase Requests` (REQUESTS) now precedes `SO Batch
    // Purchase` (BUY). Same three doors, same three routes.
    expect(
      matchDestinations(permittedDestinations("operation"), "purch").map((d) => d.label),
      // `Purchase Demands` joined on 2026-08-20 — it is a BUILT door now
      // (CARD-2026-08-20-purchase-demands), so Jump to must reach it.
    ).toEqual([
      "Purchase Demands",
      "Purchase Orders",
      "Manual Purchase Requests",
      "SO Batch Purchase",
    ]);
  });

  it("a document result prints its number, its type and the identifying party", async () => {
    jumpResult.mockReturnValue({
      documents: [
        {
          type: "SO",
          number: "SO-1307",
          party: "Stage Two Test",
          href: "/operation/orders/so/abc",
        },
      ],
    });
    renderJump();
    fireEvent.change(openSurface(), { target: { value: "SO-1307" } });
    /* The DOCUMENT lookup is debounced — destinations filter on the keystroke,
     * the network does not. Awaiting it here is the contract, not a workaround. */
    const row = await screen.findByTestId("jump-to-document");
    expect(row).toHaveTextContent("SO-1307");
    expect(row).toHaveTextContent("Sales Order");
    expect(row).toHaveTextContent("Stage Two Test");
  });

  it("no match renders the plain empty state, and offers nothing", () => {
    renderJump();
    fireEvent.change(openSurface(), { target: { value: "zzzz" } });
    expect(screen.getByText("No results")).toBeInTheDocument();
    expect(screen.queryByRole("option")).toBeNull();
  });
});

describe("the keyboard", () => {
  it("↓ moves the active result and Enter navigates to it", async () => {
    jumpResult.mockReturnValue({
      documents: [
        { type: "SO", number: "SO-1307", party: "Stage Two Test", href: "/operation/orders/so/abc" },
      ],
    });
    renderJump();
    const input = openSurface();
    /* `payments` matches exactly one destination, so the document is the row
     * after it and one ↓ is what reaches it. (`delivery` stopped being unique
     * when the Delivery Orders register joined the sidebar.) */
    fireEvent.change(input, { target: { value: "payments" } });
    await screen.findByTestId("jump-to-document"); // the debounced lookup lands
    const before = screen.getAllByRole("option");
    expect(before[0]).toHaveAttribute("data-active", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("data-active", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("here")).toHaveTextContent("/operation/orders/so/abc");
  });

  it("↑ from the first row wraps to the last — the list has no dead end", () => {
    renderJump();
    const input = openSurface();
    fireEvent.change(input, { target: { value: "orders" } });
    const rows = screen.getAllByRole("option");
    expect(rows.length).toBeGreaterThan(1);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getAllByRole("option").at(-1)).toHaveAttribute("data-active", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("data-active", "true");
  });

  it("exactly one row is active at a time, whatever the list is", () => {
    renderJump();
    const input = openSurface();
    fireEvent.change(input, { target: { value: "o" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const activeCount = screen
      .getAllByRole("option")
      .filter((el) => el.dataset.active === "true").length;
    expect(activeCount).toBe(1);
  });

  it("Esc closes without navigating", () => {
    renderJump();
    const input = openSurface();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByTestId("jump-to-surface")).toBeNull();
    expect(screen.getByTestId("here")).toHaveTextContent("/operation");
  });

  it("⌘K opens it from anywhere on the page", () => {
    renderJump();
    expect(screen.queryByTestId("jump-to-surface")).toBeNull();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByTestId("jump-to-surface")).toBeInTheDocument();
  });

  it("the trigger prints its keyboard hint", () => {
    renderJump();
    expect(screen.getByTestId("jump-to-trigger").textContent).toMatch(/⌘K|Ctrl K/);
  });
});

describe("navigate-only", () => {
  it("selecting a destination only opens it — and remembers it as recent", () => {
    renderJump();
    fireEvent.change(openSurface(), { target: { value: "Payments" } });
    fireEvent.click(screen.getByTestId("jump-to-destination"));
    expect(screen.getByTestId("here")).toHaveTextContent("/operation?tab=payments");
    expect(JSON.parse(localStorage.getItem("carres-jump-recent") ?? "[]")).toEqual([
      "operation:payments",
    ]);
  });

  /* ⭐ NO WORKFLOW ANYWHERE ON THE SURFACE. Not a create, not an approve, not a
   * receive — every control is a row that navigates, plus the kit's own close.
   * A future edit that adds a verb here fails this. */
  it("carries no create action and no workflow action, in any state", () => {
    jumpResult.mockReturnValue({
      documents: [
        { type: "PO", number: "PO-2051", party: "Ohana", href: "/operation/procurement?po=PO-2051" },
      ],
    });
    renderJump();
    const input = openSurface();
    for (const value of ["", "PO-2051", "zzzz"]) {
      fireEvent.change(input, { target: { value } });
      const surface = screen.getByTestId("jump-to-surface");
      const words = within(surface)
        .queryAllByRole("button")
        .map((b) => (b.textContent ?? "").toLowerCase());
      for (const w of words) {
        expect(
          /\b(new|create|add|issue|approve|receive|pay|collect|edit|delete|cancel|save|submit)\b/.test(w),
          `"${w}" while the box read "${value}"`,
        ).toBe(false);
      }
    }
  });
});
