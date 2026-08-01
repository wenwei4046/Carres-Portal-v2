/**
 * CatalogSection (Loo 2026-08-01) — one band of the POS card wall. Locks the
 * two rules that make the banding honest: the header prints the word it was
 * GIVEN (the left rail's own), and it disappears entirely when there is only
 * one band to tell apart.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CatalogSection, { railLabelOf } from "./CatalogSection";

describe("CatalogSection", () => {
  it("prints the label it was given, verbatim, plus the piece count", () => {
    render(
      <CatalogSection label="Bed frames" count={4} withHeader>
        <div data-testid="card" />
      </CatalogSection>,
    );
    expect(screen.getByText("Bed frames")).toBeTruthy();
    expect(screen.getByText("4 pieces")).toBeTruthy();
  });

  it("a band of one says 'piece', not 'pieces'", () => {
    render(
      <CatalogSection label="Guarantees" count={1} withHeader>
        <div />
      </CatalogSection>,
    );
    expect(screen.getByText("1 piece")).toBeTruthy();
  });

  it("bundles are counted in the word the toolbar already uses for them", () => {
    render(
      <CatalogSection label="Bundles" count={1} noun="bundle" withHeader>
        <div />
      </CatalogSection>,
    );
    expect(screen.getByText("1 bundle")).toBeTruthy();
  });

  it("withHeader=false hides the header but never the cards", () => {
    render(
      <CatalogSection label="Mattresses" count={15} withHeader={false}>
        <div data-testid="card" />
      </CatalogSection>,
    );
    expect(screen.queryByText("Mattresses")).toBeNull();
    expect(screen.queryByText("15 pieces")).toBeNull();
    expect(screen.getByTestId("card")).toBeTruthy();
  });

  it("every band reuses .cat-grid, so the columns line up across bands", () => {
    const { container } = render(
      <CatalogSection label="Sofas" count={2} withHeader>
        <div />
      </CatalogSection>,
    );
    expect(container.querySelector(".cat-section > .cat-grid")).toBeTruthy();
  });
});

describe("railLabelOf", () => {
  const RAILS = [
    { key: "all" as const, label: "All open" },
    { key: "bedframe" as const, label: "Bed frames" },
  ];

  it("takes the rail's OWN word — the wall and the rail cannot drift", () => {
    // The card badge says "Bedframe"; the rail says "Bed frames". The band
    // header follows the rail, because the rail is the operator's index.
    expect(railLabelOf(RAILS, "bedframe", "Bedframe")).toBe("Bed frames");
  });

  it("falls back when the rail entry is absent (bundles / rental rails are conditional)", () => {
    expect(railLabelOf(RAILS, "rental", "Rental")).toBe("Rental");
  });
});
