import { describe, expect, it } from "vitest";
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import CPopover, { CMenuItem } from "./CPopover";

function Menu({ checked }: { checked?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <CPopover label="Views" role="menu" open={open} onOpenChange={setOpen} trigger={<button type="button">View: Sales Order</button>}>
      {["Sales Order", "Overview", "Payment"].map((l) => (
        <CMenuItem key={l} checked={checked ? l === checked : undefined} onSelect={() => setOpen(false)}>{l}</CMenuItem>
      ))}
    </CPopover>
  );
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("CPopover as a menu (WAI-ARIA menu button; Design Round 4 Carres Menu)", () => {
  it("says it opens a menu", () => {
    render(<Menu />);
    expect(screen.getByRole("button", { name: "View: Sales Order" })).toHaveAttribute("aria-haspopup", "menu");
  });

  it("↓ on the button opens it on the first item; ↑ ↓ Home End move; Escape gives focus back to the button", async () => {
    render(<Menu />);
    const button = screen.getByRole("button", { name: "View: Sales Order" });
    button.focus();
    fireEvent.keyDown(button, { key: "ArrowDown" });
    await flush();
    const items = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1]!, { key: "End" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(items[2]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(items[2]!, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await flush();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("opens a pick list on its ticked item, and Tab closes it back to the button", async () => {
    render(<Menu checked="Payment" />);
    const button = screen.getByRole("button", { name: "View: Sales Order" });
    button.focus();
    fireEvent.keyDown(button, { key: "ArrowDown" });
    await flush();
    expect(document.activeElement).toHaveTextContent("Payment");
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    await flush();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
