import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Block } from "./SalesOrderWorkspace";

/**
 * ⭐ LESS AT ONCE, IN THE SAME ORDER (2026-08-24).
 *
 * The owner locked the block SEQUENCE (`docs/orders/MASTER.md` — SALES ORDER
 * OBJECT PAGE V2). Jess asked for a page a new hire can work without being
 * shown everything at once. Those are DIFFERENT AXES, so the sequence stays
 * byte-identical and only the default expansion state moves — no ruling governs
 * whether a card starts open.
 *
 * The `.ui-contract` suite beside this one reads SOURCE TEXT, which is the
 * right tool for "this block still exists in this order". It cannot see a
 * chevron actually opening, and it certainly cannot see one REFUSING to close.
 * That is what this file renders for real.
 */
describe("A left-pane block shows less at once, and never less than the truth", () => {
  /* ── A summary is what makes a block collapsible at all ─────────────────── */

  it("stays open when it has no summary — a chevron may not hide an unknown", () => {
    render(
      <Block title="Goods">
        <p>the six-column goods truth</p>
      </Block>,
    );
    /* No summary, no control, no way to close it. This is the shape `Goods`
       relies on: its ui-contract test asserts the COMPLETE six-column truth, so
       a collapsed one would be a contract failure wearing a chevron. */
    expect(screen.getByText("the six-column goods truth")).toBeTruthy();
    expect(screen.queryByTestId("block-expand-Goods")).toBeNull();
    expect(screen.queryByTestId("block-collapse-Goods")).toBeNull();
  });

  it("renders collapsed behind its one line when it has a summary", () => {
    render(
      <Block title="Emergency contact" summary="Not given">
        <p>the three contact fields</p>
      </Block>,
    );
    expect(screen.queryByText("the three contact fields")).toBeNull();
    const expand = screen.getByTestId("block-expand-Emergency contact");
    /* The collapsed line must SAY what is inside. A bare chevron would trade
       one kind of confusion for another. */
    expect(expand.textContent).toContain("Not given");
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    /* The locked title is still on screen — collapsing hides the body, never
       the block's name or its position in the sequence. */
    expect(screen.getByRole("heading", { name: "Emergency contact" })).toBeTruthy();
  });

  it("opens on click and closes again", () => {
    render(
      <Block title="Emergency contact" summary="Not given">
        <p>the three contact fields</p>
      </Block>,
    );
    fireEvent.click(screen.getByTestId("block-expand-Emergency contact"));
    expect(screen.getByText("the three contact fields")).toBeTruthy();

    const collapse = screen.getByTestId("block-collapse-Emergency contact");
    expect(collapse.textContent).toContain("Hide");
    expect(collapse.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(collapse);
    expect(screen.queryByText("the three contact fields")).toBeNull();
    expect(screen.getByTestId("block-expand-Emergency contact")).toBeTruthy();
  });

  /* ── ⭐ THE ONE THAT MATTERS ────────────────────────────────────────────── */

  /**
   * A COLLAPSED CARD MAY NEVER HIDE AN UNSAVED CHANGE.
   *
   * The dark bar says `⚠ {n} changes`. If one of those changes sat inside a
   * closed block, the operator would be told something changed and given no way
   * to find it — strictly worse than the crowded page this collapse exists to
   * fix. So a dirty block force-opens and the close control is dead.
   */
  it("force-opens while it holds an unsaved change, and REFUSES to close", () => {
    render(
      <Block title="Change delivery date" summary="No amendment open" forceOpen>
        <p>the amend trio</p>
      </Block>,
    );
    expect(screen.getByText("the amend trio")).toBeTruthy();
    expect(screen.queryByTestId("block-expand-Change delivery date")).toBeNull();

    const collapse = screen.getByTestId("block-collapse-Change delivery date") as HTMLButtonElement;
    expect(collapse.disabled).toBe(true);
    /* It does not merely fail silently — it says WHY it will not close. */
    expect(collapse.textContent).toContain("Unsaved changes here");
    expect(collapse.getAttribute("title")).toBe("This section has unsaved changes");

    fireEvent.click(collapse);
    expect(screen.getByText("the amend trio")).toBeTruthy();
  });

  it("re-opens a block the operator had already closed when a change lands in it", () => {
    /* The regression this guards: the operator collapses a card, THEN something
       makes it dirty (an amendment proposal arriving, a Discard being undone, a
       cascade writing a field). Local closed state must lose to `forceOpen`,
       or the save bar counts a change nobody can reach. */
    const { rerender } = render(
      <Block title="Emergency contact" summary="Not given">
        <p>the three contact fields</p>
      </Block>,
    );
    expect(screen.queryByText("the three contact fields")).toBeNull();

    rerender(
      <Block title="Emergency contact" summary="Not given" forceOpen>
        <p>the three contact fields</p>
      </Block>,
    );
    expect(screen.getByText("the three contact fields")).toBeTruthy();
    expect(
      (screen.getByTestId("block-collapse-Emergency contact") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  /* ── The subtitle teaches instead of renaming ───────────────────────────── */

  it("explains a locked block name instead of replacing it", () => {
    /* `Sales ownership` is the locked block word — COPY-STANDARD holds the
       action strings inside it and MASTER.md names the block itself. The
       operator-friendliness ask is answered by SAYING WHAT IT IS FOR, which
       leaves every locked string untouched. */
    render(
      <Block title="Sales ownership" subtitle="Who sold it — the dealer, the showroom and the salesperson credited.">
        <p>attribution</p>
      </Block>,
    );
    expect(screen.getByRole("heading", { name: "Sales ownership" })).toBeTruthy();
    expect(screen.getByTestId("block-subtitle-Sales ownership").textContent).toBe(
      "Who sold it — the dealer, the showroom and the salesperson credited.",
    );
  });

  it("adds no subtitle line when there is nothing to explain", () => {
    render(
      <Block title="Money">
        <p>total paid outstanding</p>
      </Block>,
    );
    expect(screen.queryByTestId("block-subtitle-Money")).toBeNull();
  });

  /* ── The control points at the thing it opens ───────────────────────────── */

  it("wires the control to the body it governs, both ways", () => {
    /* A screen reader is told `aria-expanded` and handed `aria-controls`; if
       that id does not exist on the body, the announcement points at nothing. */
    render(
      <Block title="Emergency contact" summary="Not given">
        <p>the three contact fields</p>
      </Block>,
    );
    const expand = screen.getByTestId("block-expand-Emergency contact");
    expect(expand.getAttribute("aria-controls")).toBe("block-b-emergency-contact");

    fireEvent.click(expand);
    const body = screen.getByText("the three contact fields").parentElement;
    expect(body?.id).toBe("block-b-emergency-contact");
    expect(
      screen.getByTestId("block-collapse-Emergency contact").getAttribute("aria-controls"),
    ).toBe("block-b-emergency-contact");
  });
});
