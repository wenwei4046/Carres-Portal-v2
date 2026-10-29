import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";

import { MemoryRouter } from "react-router-dom";
import SupplierSidebar from "./SupplierSidebar";

vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: unknown) => unknown) => sel({ session: { user: { email: "s@example.com" } } }),
}));
vi.mock("@/lib/queries", () => ({ useSupplierPos: () => ({ data: [] }) }));

describe("SupplierSidebar on a phone", () => {
  it("menu button opens the same nav links in a drawer", async () => {
    render(<MemoryRouter><SupplierSidebar /></MemoryRouter>);
    const btn = screen.getByRole("button", { name: "Open menu" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: /Purchase Orders/ })).toHaveAttribute("href", "/supplier/pos");
    expect(within(dialog).getByRole("link", { name: /Total SKU/ })).toBeInTheDocument();
  });
});
