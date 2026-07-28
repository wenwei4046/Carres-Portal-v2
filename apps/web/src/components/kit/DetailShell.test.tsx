/**
 * DetailShell — L4's seven constraints, one test each (card D0.5c).
 *
 * The card's table is the checklist and this file is the proof. Six of the
 * seven pass by FAILING TO COMPILE, so they are checked by `tsc`, not by the
 * runner — and `tsc` also fails on an UNUSED `@ts-expect-error`, so a
 * constraint that is quietly deleted takes its own test down with it.
 *
 * NEGATIVE CONTROL: widen `persistentFacts` to `ReactNode[]` — constraint 5's
 * two directives stop erroring and typecheck reports them unused. Nothing else
 * moves.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import DetailShell, { type DetailShellProps } from "./DetailShell";

const base: DetailShellProps = {
  identity: {
    primary: <h2>Tan Wei Ming · SO-1256</h2>,
    persistentFacts: [<span key="a">Outstanding RM 2,000</span>, <span key="b">27 Jul</span>, <span key="c">NETS</span>, <span key="d">Klang</span>],
  },
  currentAction: { content: <p>Call NETS — confirm delivery date</p> },
  currentIssues: [],
  progress: { content: <p>Placed → Proceed</p> },
  sections: [{ id: "items", label: "Items", track: "goods", children: <button>Items</button> }],
  children: <div>the open section</div>,
};

describe("the seven constraints L4 froze", () => {
  it("1 · the reason the record is open cannot be hidden", () => {
    // @ts-expect-error — no `collapsible`: this is the bug T2 already fixed once
    void <DetailShell {...base} currentAction={{ content: <p>x</p>, collapsible: true }} />;
    // @ts-expect-error — and no `hidden` either
    void <DetailShell {...base} currentAction={{ content: <p>x</p>, hidden: true }} />;
    expect(true).toBe(true);
  });

  it("2 · an empty issues list renders NOTHING, and no reassuring tick is expressible", () => {
    const { rerender } = render(<DetailShell {...base} currentIssues={[]} />);
    expect(document.querySelector('[data-kit="detail-current-issues"]')).not.toBeInTheDocument();
    rerender(
      <DetailShell
        {...base}
        currentIssues={[{ id: "1", track: "money", content: <p>RM 2,000 is holding the delivery</p> }]}
      />,
    );
    expect(document.querySelector('[data-kit="detail-current-issues"]')).toBeInTheDocument();
    // @ts-expect-error — there is no `emptyLabel` to write "✓ None" into
    void <DetailShell {...base} currentIssues={[]} emptyLabel="✓ None" />;
  });

  it("3 · the blocks are named and ordered — a page cannot reorder them", () => {
    render(<DetailShell {...base} currentIssues={[{ id: "1", track: "goods", content: <p>no PO</p> }]} />);
    const rail = document.querySelector('[data-kit="detail-rail"]')!;
    const order = [...rail.children].map((c) => c.getAttribute("data-kit"));
    expect(order).toEqual([
      "detail-identity",
      "detail-current-action",
      "detail-current-issues",
      "detail-progress",
      "detail-sections",
    ]);
    // @ts-expect-error — the shell takes named slots; `children` is the surface, not the blocks
    void <DetailShell identity={base.identity}>{[]}</DetailShell>;
  });

  it("4 · Progress can never become a second timeline — §1.4's one Human-Review debt, closed", () => {
    // @ts-expect-error — no events
    void <DetailShell {...base} progress={{ content: <p>x</p>, events: [] }} />;
    // @ts-expect-error — no actor
    void <DetailShell {...base} progress={{ content: <p>x</p>, actor: "Jess" }} />;
    // @ts-expect-error — no timestamp
    void <DetailShell {...base} progress={{ content: <p>x</p>, timestamp: "2026-07-28" }} />;
    // @ts-expect-error — no KPI tiles
    void <DetailShell {...base} progress={{ content: <p>x</p>, kpi: <div /> }} />;
    // @ts-expect-error — and no buttons
    void <DetailShell {...base} progress={{ content: <p>x</p>, actions: <button /> }} />;
    expect(true).toBe(true);
  });

  it("5 · identity is values only, and the persistent facts are a FULL set of four", () => {
    // @ts-expect-error — a fifth fact does not fit: the set is full (Header Everything)
    void <DetailShell {...base} identity={{ primary: <i />, persistentFacts: [<i key="1" />, <i key="2" />, <i key="3" />, <i key="4" />, <i key="5" />] }} />;
    // @ts-expect-error — three is not four either
    void <DetailShell {...base} identity={{ primary: <i />, persistentFacts: [<i key="1" />, <i key="2" />, <i key="3" />] }} />;
    // @ts-expect-error — identity takes no action
    void <DetailShell {...base} identity={{ ...base.identity, onAction: () => {} }} />;
    expect(true).toBe(true);
  });

  it("6 · a fourth business category does not compile", () => {
    // @ts-expect-error — goods · delivery · money, and there is no fourth
    void <DetailShell {...base} sections={[{ id: "x", label: "Finance", track: "finance", children: <i /> }]} />;
    // A section that belongs to no track is legal, and says so with null.
    render(<DetailShell {...base} sections={[{ id: "docs", label: "Documents", track: null, children: <i /> }]} />);
    expect(document.querySelector('[data-section="docs"]')).toHaveAttribute("data-track", "none");
  });

  it("7 · Detail is a route, never a render prop", () => {
    // @ts-expect-error — a render prop here is how a page absorbs the rest of the system
    void <DetailShell {...base} sections={[{ id: "x", label: "X", track: null, renderDetail: () => <i />, children: <i /> }]} />;
    expect(true).toBe(true);
  });
});

describe("the state it can never be told", () => {
  it("has no `state` prop — the four states are produced by what the slots receive", () => {
    // @ts-expect-error — L4: a component that cannot be told a state cannot print one
    void <DetailShell {...base} state="blocked" />;
    expect(true).toBe(true);
  });

  it("renders what it was given, in the rail and on the surface", () => {
    render(<DetailShell {...base} />);
    expect(screen.getByRole("heading", { name: /Tan Wei Ming/ })).toBeInTheDocument();
    expect(screen.getByText("Call NETS — confirm delivery date")).toBeInTheDocument();
    expect(screen.getByText("the open section")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeInTheDocument();
  });

  it("narrows the rail when collapsed, and hides nothing in it", () => {
    const { rerender } = render(<DetailShell {...base} railCollapsed={false} />);
    const rail = () => document.querySelector('[data-kit="detail-rail"]')!;
    expect(rail().className).toContain("w-[280px]");
    rerender(<DetailShell {...base} railCollapsed />);
    expect(rail().className).toContain("w-14");
    // §1.4 rule 1 — Current Action is STILL there, narrower, not gone.
    expect(document.querySelector('[data-kit="detail-current-action"]')).toBeInTheDocument();
  });

  it("renders activity only when there is any", () => {
    const { rerender } = render(<DetailShell {...base} />);
    expect(document.querySelector('[data-kit="detail-activity"]')).not.toBeInTheDocument();
    rerender(<DetailShell {...base} activity={{ content: <p>Jess added a note</p> }} />);
    expect(document.querySelector('[data-kit="detail-activity"]')).toBeInTheDocument();
  });
});
