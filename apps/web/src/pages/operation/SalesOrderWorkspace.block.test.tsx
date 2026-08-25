import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Block, relatedDocumentsSummary } from "./SalesOrderWorkspace";

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
      <Block title="Related Documents">
        <p>every downstream document</p>
      </Block>,
    );
    /* No summary, no control, no way to close it. This is the shape Related
       Documents relies on: its ui-contract test asserts a COMPLETE index, so a
       collapsed one would be a contract failure wearing a chevron. */
    expect(screen.getByText("every downstream document")).toBeTruthy();
    expect(screen.queryByTestId("block-expand-Related Documents")).toBeNull();
    expect(screen.queryByTestId("block-collapse-Related Documents")).toBeNull();
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
      <Block title="Amend delivery date" summary="No amendment open" forceOpen>
        <p>the amend trio</p>
      </Block>,
    );
    expect(screen.getByText("the amend trio")).toBeTruthy();
    expect(screen.queryByTestId("block-expand-Amend delivery date")).toBeNull();

    const collapse = screen.getByTestId("block-collapse-Amend delivery date") as HTMLButtonElement;
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

/**
 * ⭐ RELATED DOCUMENTS FOLDS, AND SAYS WHAT IS BEHIND THE FOLD (2026-08-25).
 *
 * I refused this on 2026-08-24 and was over-cautious. `docs/orders/MASTER.md`
 * :226 rules the index COMPLETE — "must not show only the latest or first
 * Delivery Order when more exist" — and sanctions a summary in the same breath:
 * "the summary says, for example, `2 Delivery Orders →`". Nothing there says the
 * card must stand open, and a fold removes no door.
 *
 * What the summary must never do is READ AS EMPTY WHEN IT IS NOT — a fold the
 * operator cannot see past is a fold they open every time to learn there was
 * nothing behind it, which is the crowding this exists to fix, moved one click
 * away.
 */
describe("Related Documents says what is behind the fold", () => {
  const G = (over: Record<string, number> = {}) =>
    [
      { label: "Purchase Orders", count: 0 },
      { label: "Receiving Sessions", count: 0 },
      { label: "Stock Units", count: 0 },
      { label: "Delivery Orders", count: 0 },
      { label: "Payments", count: 0 },
      { label: "Service Cases", count: 0 },
      { label: "Guarantees", count: 0 },
    ].map((g) => ({ ...g, count: over[g.label] ?? 0 }));

  it("⭐ never reads as empty while the answer is still in flight", () => {
    /* The failure this guards: saying "—" during load tells the operator this
       order has no documents, then silently contradicts itself a second later.
       It borrows `Loading…` from the rows below rather than minting a second
       way to say the same thing. */
    expect(relatedDocumentsSummary(G({ "Delivery Orders": 2 }), true)).toBe("Loading…");
  });

  it("uses the governed em dash when there is genuinely nothing", () => {
    expect(relatedDocumentsSummary(G(), false)).toBe("—");
  });

  it("names what exists, count first, in MASTER's own shape", () => {
    expect(relatedDocumentsSummary(G({ "Delivery Orders": 2 }), false)).toBe("2 Delivery Orders");
  });

  it("takes the singular of the same noun for one document", () => {
    /* Grammar, not a second word for the same thing — "1 Delivery Orders" is
       the kind of sentence that makes an operator distrust the number. */
    expect(relatedDocumentsSummary(G({ "Purchase Orders": 1 }), false)).toBe("1 Purchase Order");
    expect(relatedDocumentsSummary(G({ Guarantees: 1 }), false)).toBe("1 Guarantee");
    expect(relatedDocumentsSummary(G({ "Receiving Sessions": 1 }), false)).toBe(
      "1 Receiving Session",
    );
  });

  it("keeps the fold to one line, and says how much it did not name", () => {
    const all = relatedDocumentsSummary(
      G({
        "Purchase Orders": 1,
        "Delivery Orders": 2,
        Payments: 1,
        "Service Cases": 3,
        Guarantees: 1,
      }),
      false,
    );
    /* Three named, the rest counted. A summary that grows to seven groups is a
       second copy of the block, not a summary of it. */
    expect(all).toBe("1 Purchase Order · 2 Delivery Orders · 1 Payment · +2 more");
  });

  it("counts only what is there — an empty owner never reaches the line", () => {
    expect(relatedDocumentsSummary(G({ Payments: 1 }), false)).toBe("1 Payment");
  });
});
