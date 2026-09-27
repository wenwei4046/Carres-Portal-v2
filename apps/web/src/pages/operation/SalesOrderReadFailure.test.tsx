import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SalesOrderReadFailure from "./SalesOrderReadFailure";

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}
const draw = (error: unknown, surface: Parameters<typeof SalesOrderReadFailure>[0]["surface"], onRetry = vi.fn()) => {
  render(
    <MemoryRouter initialEntries={["/operation/orders/so/x"]}>
      <SalesOrderReadFailure error={error} surface={surface} onRetry={onRetry} />
      <Where />
    </MemoryRouter>,
  );
  return onRetry;
};

/* ⭐ A READ FAILURE HAS THREE FACES — owner ruling 2026-09-26. */
describe("SalesOrderReadFailure", () => {
  it.each(["sales-orders-register", "sales-order", "revisions", "history", "order-route"] as const)(
    "a 403 on %s prints the permission words with NO retry",
    (surface) => {
      draw({ status: 403, message: "JWT role forbidden" }, surface);
      expect(screen.getByRole("alert")).toHaveTextContent(
        surface === "sales-orders-register" ? "You cannot view sales orders" : "You cannot view this record",
      );
      expect(screen.getByRole("alert")).toHaveTextContent("Ask an authorised operation user for access.");
      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).not.toHaveTextContent("JWT role forbidden");
    },
  );

  it("the way back opens the Sales Orders Register; the Register itself offers no way back to itself", () => {
    draw({ status: 403 }, "sales-order");
    fireEvent.click(screen.getByRole("button", { name: "Back to Sales Orders" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/operation/orders");
  });

  it("the Register refused shows no button at all", () => {
    draw({ status: 403 }, "sales-orders-register");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("a 404 says the record is not found", () => {
    draw({ status: 404 }, "sales-order");
    expect(screen.getByRole("alert")).toHaveTextContent("Sales Order not found.");
    expect(screen.getByRole("button", { name: "Back to Sales Orders" })).toBeInTheDocument();
  });

  it("anything else keeps the surface's sentence, offers Try again, and prints no transport message", () => {
    const onRetry = draw(new Error("Failed to fetch"), "order-route");
    expect(screen.getByRole("alert")).toHaveTextContent("This order route could not be opened");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Failed to fetch");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("is the kit's EmptyState and Button, centred and at most 480px wide", () => {
    draw({ status: 500 }, "sales-order");
    const block = screen.getByRole("alert");
    expect(block.querySelector("[data-kit='empty-state']")).not.toBeNull();
    expect(block.className).toContain("max-w-[480px]");
    expect(block.className).toContain("mx-auto");
    expect(block.className).toContain("w-full");
  });
});
