import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";

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

  it("Escape closes it and focus returns to the button", async () => {
    render(<MemoryRouter><PartnerSidebar /></MemoryRouter>);
    const btn = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(btn);
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(btn).toHaveFocus();
  });

  it.each(["/", "/delivery-partner/incoming"])("clicking a nav link at %s closes it", async (start) => {
    render(<MemoryRouter initialEntries={[start]}><PartnerSidebar /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = await screen.findByRole("dialog");
    const links = within(dialog).getAllByRole("link");
    fireEvent.click(links[0]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
