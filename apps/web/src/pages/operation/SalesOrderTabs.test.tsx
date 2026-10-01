import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("./components/GlobalTopBar", () => ({ TopBarIcons: () => <span data-testid="global-icons" /> }));

import SalesOrderTabs from "./SalesOrderTabs";

/* ⭐ BELOW 768px THE HEADER IS TWO ROWS — owner ruling 2026-09-26 (Jess).
   Measured at 375px on production: `SO-1365` and `Print ▾` overprinted each
   other, because one 44px row held the back link, the number, the actions and
   the global icons, all `shrink-0`. */
describe("the object header below 768px", () => {
  const draw = () =>
    render(
      <MemoryRouter>
        <SalesOrderTabs
          identity="SO-1365"
          customer="A VERY LONG CUSTOMER NAME SDN BHD"
          right={<button type="button">Edit</button>}
          navigation={<nav />}
        />
      </MemoryRouter>,
    );

  it("row 1 is the back link and the global icons; row 2 is the identity and the actions", () => {
    draw();
    const header = screen.getByTestId("sales-order-tabs");
    const row = header.firstElementChild as HTMLElement;
    expect(row.className).toContain("flex-wrap");
    expect(row.className).toContain("md:flex-nowrap");
    const order = (el: HTMLElement) => /(?:^|\s)order-(\d)/.exec(el.className)?.[1];
    expect(order(screen.getByRole("link", { name: "Back to Sales Orders" }))).toBe("1");
    expect(order(screen.getByTestId("object-header-global"))).toBe("2");
    /* The mobile row breaks after icons; shared container rules also cover narrow shell content. */
    const breaker = screen.getByTestId("object-header-break");
    expect(breaker.className).toContain("basis-full");
    expect(breaker.className).toContain("md:hidden");
    expect(order(screen.getByTestId("object-header-identity"))).toBe("3");
    expect(order(screen.getByTestId("object-header-actions"))).toBe("4");
    expect(within(screen.getByTestId("object-header-actions")).getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("the number never shrinks; the customer ends in … and keeps its full name for a reader", () => {
    draw();
    expect(screen.getByTestId("object-identity").className).toContain("shrink-0");
    const customer = screen.getByTestId("object-identity-customer");
    expect(customer.className).toContain("truncate");
    expect(customer).toHaveAttribute("title", "A VERY LONG CUSTOMER NAME SDN BHD");
    expect(screen.getByTestId("object-header-identity")).toHaveAttribute(
      "aria-label",
      "SO-1365 · A VERY LONG CUSTOMER NAME SDN BHD",
    );
    /* The identity takes what the actions leave, so the two cannot overlap. */
    expect(screen.getByTestId("object-header-identity").className).toContain("min-w-0");
    expect(screen.getByTestId("object-header-identity").className).toContain("flex-1");
    expect(screen.getByTestId("object-header-actions").className).toContain("shrink-0");
  });
});
