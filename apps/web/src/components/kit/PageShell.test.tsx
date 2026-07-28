/**
 * PageShell — the two rules the TYPE now carries (card D0.5c).
 *
 * The bands themselves are not re-tested here: they are `ListPageShell`'s,
 * moved unchanged, and Orders' own suite renders through them. What is new is
 * what a page can no longer DO, so that is what this file asserts.
 *
 * NEGATIVE CONTROL: give `ListProps` a `kpi?: ReactNode` — the first
 * `@ts-expect-error` stops erroring and `tsc` reports an unused directive.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PageShell from "./PageShell";

describe("what a page cannot do any more", () => {
  it("refuses a KPI band on a list, and a title on a module-tabbed page", () => {
    // @ts-expect-error — §1.3: a list page has no `kpi` slot. An eighth band has nowhere to go.
    void <PageShell variant="list" title="Orders" kpi={<div />}>x</PageShell>;
    // @ts-expect-error — §8.3: the module tab IS the title, so there is no `title` prop
    void <PageShell variant="module" title="Purchasing">x</PageShell>;
    // @ts-expect-error — same rule: no breadcrumb either
    void <PageShell variant="module" breadcrumb={<i />}>x</PageShell>;
    // @ts-expect-error — a variant nobody has a frame for does not compile
    void <PageShell variant="dashboard">x</PageShell>;
    // @ts-expect-error — className is not a prop of a kit component
    void <PageShell variant="list" title="Orders" className="p-10">x</PageShell>;
    // A list page must SAY what it is — `title` is required, not optional.
    // @ts-expect-error — missing `title`
    void <PageShell variant="list">x</PageShell>;
    expect(true).toBe(true);
  });
});

describe("the bands it did inherit", () => {
  it("draws the two-row header on a stand-alone page", () => {
    render(
      <PageShell variant="list" title="Orders" breadcrumb={<span>Operations</span>}>
        <div>rows</div>
      </PageShell>,
    );
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  it("draws NO header for a module-tabbed page — §8.3 is a shape now, not a rule to remember", () => {
    const { container } = render(
      <PageShell variant="module">
        <div>rows</div>
      </PageShell>,
    );
    expect(container.querySelector('[data-variant="module"]')).toBeInTheDocument();
    expect(container.querySelector(".border-b.border-base-200")).not.toBeInTheDocument();
  });

  it("gives the chips row zero height when no filter is active", () => {
    const { rerender } = render(
      <PageShell variant="list" title="Orders" activeChips={[]}>
        <div>rows</div>
      </PageShell>,
    );
    expect(screen.queryByTestId("listshell-active-chips")).not.toBeInTheDocument();
    rerender(
      <PageShell variant="list" title="Orders" activeChips={[{ label: "Region: KV", onClear: () => {} }]}>
        <div>rows</div>
      </PageShell>,
    );
    expect(screen.getByTestId("listshell-active-chips")).toBeInTheDocument();
  });

  it("lets the bulk band REPLACE the control band, so nothing on the page jumps", () => {
    render(
      <PageShell variant="list" title="Orders" toolbar={<div>tabs</div>} bulkBar={<div>3 selected</div>}>
        <div>rows</div>
      </PageShell>,
    );
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.queryByText("tabs")).not.toBeInTheDocument();
  });

  it("skips the control strip entirely when it would render empty", () => {
    const { container } = render(
      <PageShell variant="list" title="Orders">
        <div>rows</div>
      </PageShell>,
    );
    expect(container.querySelector(".rounded-\\[12px\\].shadow-sm")).not.toBeInTheDocument();
  });
});
