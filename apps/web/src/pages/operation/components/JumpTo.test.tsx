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
    expect(labels.slice(0, 5)).toEqual([
      "WorkOperations",
      "Sales OrdersOperations",
      "StockOperations",
      "PaymentsOperations",
      "DeliveryOperations",
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
  it("matches a governed destination NAME", () => {
    expect(
      matchDestinations(permittedDestinations("operation"), "purch").map((d) => d.label),
    ).toEqual(["Purchasing"]);
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
    /* `delivery` matches exactly one destination, so the document is the row
     * after it and one ↓ is what reaches it. */
    fireEvent.change(input, { target: { value: "delivery" } });
    await screen.findByTestId("jump-to-document"); // the debounced lookup lands
    const before = screen.getAllByRole("option");
    expect(before[0]).toHaveAttribute("data-active", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("data-active", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("here")).toHaveTextContent("/operation/orders/so/abc");
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
