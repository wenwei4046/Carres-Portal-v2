import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";

import { MemoryRouter } from "react-router-dom";
import PartnerSidebar from "./PartnerSidebar";

vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: unknown) => unknown) => sel({ session: { user: { email: "lp@example.com" } } }),
}));

describe("PartnerSidebar on a phone", () => {
  it("menu button opens the same nav links in a drawer", async () => {
    render(<MemoryRouter><PartnerSidebar /></MemoryRouter>);
    const btn = screen.getByRole("button", { name: "Open menu" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: /Deliveries/ })).toHaveAttribute("href", "/delivery-partner/deliveries");
    expect(within(dialog).getByRole("link", { name: /Today/ })).toBeInTheDocument();
  });
});
