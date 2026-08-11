import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import CaseOrderLink from "./CaseOrderLink";

/**
 * J2 — the case→order half. Three states, and the two that are easy to get
 * wrong are the ones without an SO number: a case with no order at all (the
 * live state of every case on file today) and a case whose order the API did
 * not name (an older Worker). Neither may crash, and neither may show a link
 * that goes nowhere.
 */

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigate };
});

function renderLink(props: Parameters<typeof CaseOrderLink>[0]) {
  navigate.mockClear();
  return render(
    <MemoryRouter>
      <CaseOrderLink {...props} />
    </MemoryRouter>,
  );
}

describe("<CaseOrderLink>", () => {
  it("names the order and opens its drawer", () => {
    renderLink({ orderId: "ord-1", so: 1258 });

    const link = screen.getByTestId("case-order-link");
    expect(link).toHaveTextContent("SO-1258");

    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith("/operation/old-orders?order=ord-1");
  });

  it("says plainly when the case has no order — no dead link", () => {
    renderLink({ orderId: null, so: null });
    expect(screen.queryByTestId("case-order-link")).toBeNull();
    expect(screen.getByText("Not linked to an order")).toBeInTheDocument();
  });

  it("still links when the SO number is absent (older Worker)", () => {
    // `so` undefined = the API did not send the field. The order id is the real
    // key, so the link must still work — just without its number.
    renderLink({ orderId: "ord-2" });

    const link = screen.getByTestId("case-order-link");
    expect(link).toHaveTextContent("Open order");
    expect(link).not.toHaveTextContent("undefined");

    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith("/operation/old-orders?order=ord-2");
  });

  it("does not let the click reach the row underneath", () => {
    const rowClick = vi.fn();
    navigate.mockClear();
    render(
      <MemoryRouter>
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
        <div onClick={rowClick}>
          <CaseOrderLink orderId="ord-3" so={1} />
        </div>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("case-order-link"));
    expect(navigate).toHaveBeenCalledTimes(1);
    // Without stopPropagation the case modal would open behind the order.
    expect(rowClick).not.toHaveBeenCalled();
  });

  it("escapes an order id so it cannot break out of the query string", () => {
    renderLink({ orderId: "a&b=c", so: 7 });
    fireEvent.click(screen.getByTestId("case-order-link"));
    expect(navigate).toHaveBeenCalledWith("/operation/old-orders?order=a%26b%3Dc");
  });
});
