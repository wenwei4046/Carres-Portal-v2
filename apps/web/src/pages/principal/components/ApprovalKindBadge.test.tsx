import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ApprovalKindBadge from "./ApprovalKindBadge";

describe("ApprovalKindBadge", () => {
  it("labels refund correctly", () => {
    render(<ApprovalKindBadge kind="refund" />);
    expect(screen.getByText("Refund")).toBeInTheDocument();
  });

  it("labels new_dealer as 'Dealer'", () => {
    render(<ApprovalKindBadge kind="new_dealer" />);
    expect(screen.getByText("Dealer")).toBeInTheDocument();
  });

  it("falls back to 'Other' for unknown kinds", () => {
    render(<ApprovalKindBadge kind="zzzz_unknown" />);
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("applies the refund colour class (terracotta)", () => {
    render(<ApprovalKindBadge kind="refund" />);
    const span = screen.getByText("Refund");
    expect(span.className).toContain("text-primary");
  });
});
