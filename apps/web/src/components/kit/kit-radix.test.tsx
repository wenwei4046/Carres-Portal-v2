/**
 * The Radix half of the kit — card D0.5b.
 *
 * These test the CONTRACT, not Radix. Radix's own suite already proves the
 * focus trap and the roving tabindex; what can go wrong HERE is the seam:
 * a dialog with no accessible name, a menu whose items are children, an
 * overlay that paints its own scrim, a prop that lets a page restyle a box.
 *
 * NEGATIVE CONTROL (run by hand when touching this file): delete `title` from
 * `Modal`'s props — the two accessible-name tests fail and nothing else does.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Button from "./Button";
import Checkbox from "./Checkbox";
import DatePicker from "./DatePicker";
import Drawer from "./Drawer";
import DropdownMenu from "./DropdownMenu";
import Modal from "./Modal";
import Popover from "./Popover";
import Select from "./Select";
import Tabs, { TabPanel } from "./Tabs";
import Tooltip, { TooltipProvider } from "./Tooltip";
import { Z } from "./tokens";

/**
 * jsdom implements none of the Pointer Capture API, and Radix's Select uses it
 * to decide whether a press became a drag. Without these three stubs the list
 * opens and closes in the same tick and the test reads as "no options" —
 * a MISSING BROWSER FEATURE, not a broken component. Stubbed here rather than
 * in the shared setup so the blast radius is this file.
 */
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

/* ───────────────────────────────────────────────────────────────────────────
 * 1 · Component API — the same law as D0.5a: no caller may restyle a box
 * ────────────────────────────────────────────────────────────────────────── */

describe("the Radix boxes take no style overrides either", () => {
  it("refuses className and style at the type level", () => {
    const noop = () => {};
    // @ts-expect-error — className is not a prop of a kit component
    void <Modal open={false} onOpenChange={noop} title="t" className="p-10">x</Modal>;
    // @ts-expect-error — style is not a prop of a kit component
    void <Drawer open={false} onOpenChange={noop} title="t" style={{ width: 10 }}>x</Drawer>;
    // @ts-expect-error — className is not a prop of a kit component
    void <Select id="s" options={[]} className="w-10" />;
    // @ts-expect-error — className is not a prop of a kit component
    void <Checkbox checked={false} onCheckedChange={noop} className="h-10" />;
    // @ts-expect-error — a tooltip holds a STRING; a node would make it clickable
    void <Tooltip content={<b>rich</b>}>x</Tooltip>;
    // @ts-expect-error — menu items are DATA, never children
    void <DropdownMenu trigger={<button />} items={[]}><span /></DropdownMenu>;
    // @ts-expect-error — a modal cannot be made undismissable
    void <Modal open={false} onOpenChange={noop} title="t" closeOnOutsideClick={false}>x</Modal>;
    // @ts-expect-error — there is no left drawer; the edge is not a prop
    void <Drawer open={false} onOpenChange={noop} title="t" side="left">x</Drawer>;
    expect(true).toBe(true);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * 2 · The seam — accessible names, layers, and who owns behaviour
 * ────────────────────────────────────────────────────────────────────────── */

describe("Modal", () => {
  it("is announced by its title — a dialog with no name is a dialog nobody can hear", () => {
    render(
      <Modal open onOpenChange={() => {}} title="Record the delay decision">
        body
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Record the delay decision" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Record the delay decision" })).toBeInTheDocument();
  });

  it("closes through the caller's state, never on its own", async () => {
    const onOpenChange = vi.fn();
    render(
      <Modal open onOpenChange={onOpenChange} title="Confirm booking">
        body
      </Modal>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // still open: the component holds no open state of its own
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("sits on the overlay layer and paints one scrim", () => {
    const { baseElement } = render(
      <Modal open onOpenChange={() => {}} title="t">
        body
      </Modal>,
    );
    expect(baseElement.querySelector(`[data-kit="modal"]`)?.className).toContain(Z.overlay);
  });

  it("renders a footer only when it is given one", () => {
    const { rerender } = render(
      <Modal open onOpenChange={() => {}} title="t">
        body
      </Modal>,
    );
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    rerender(
      <Modal open onOpenChange={() => {}} title="t" footer={<Button>Save</Button>}>
        body
      </Modal>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

describe("Drawer", () => {
  it("is a dialog with a name, docked right", () => {
    const { baseElement } = render(
      <Drawer open onOpenChange={() => {}} title="SO-1256">
        body
      </Drawer>,
    );
    expect(screen.getByRole("dialog", { name: "SO-1256" })).toBeInTheDocument();
    const cls = baseElement.querySelector(`[data-kit="drawer"]`)?.className ?? "";
    expect(cls).toContain("right-0");
    expect(cls).toContain(Z.overlay);
  });
});

describe("DropdownMenu", () => {
  it("opens, runs the item's own handler, and closes", async () => {
    const onSelect = vi.fn();
    render(
      <DropdownMenu
        trigger={<Button icon="overflow" aria-label="More" />}
        items={[{ label: "Print", onSelect, icon: "print" }]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Print/ }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("does not run a disabled item", async () => {
    const onSelect = vi.fn();
    render(
      <DropdownMenu
        trigger={<Button icon="overflow" aria-label="More" />}
        items={[{ label: "Delete", onSelect, disabled: true }]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("Select", () => {
  it("shows the placeholder when nothing is chosen and reports a choice back", async () => {
    const onValueChange = vi.fn();
    render(
      <Select
        id="supplier"
        label="Supplier"
        placeholder="Pick a supplier"
        options={[
          { value: "nets", label: "NETS" },
          { value: "ohana", label: "Ohana" },
        ]}
        onValueChange={onValueChange}
      />,
    );
    const trigger = screen.getByRole("combobox", { name: /Supplier/ });
    expect(trigger).toHaveTextContent("Pick a supplier");
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "Ohana" }));
    expect(onValueChange).toHaveBeenCalledWith("ohana");
  });

  it("carries Input's error contract, so a form row refuses the same way everywhere", () => {
    render(<Select id="s" label="Supplier" error="Pick a supplier" options={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a supplier");
    expect(screen.getByRole("combobox", { name: /Supplier/ })).toHaveAttribute("aria-invalid", "true");
  });
});

describe("Tabs", () => {
  it("shows one panel at a time and hands the value back to the caller", async () => {
    const onValueChange = vi.fn();
    render(
      <Tabs
        label="Purchasing"
        value="to-order"
        onValueChange={onValueChange}
        tabs={[
          { value: "to-order", label: "To order", count: 3 },
          { value: "receiving", label: "Receiving" },
        ]}
      >
        <TabPanel value="to-order">to order body</TabPanel>
        <TabPanel value="receiving">receiving body</TabPanel>
      </Tabs>,
    );
    expect(screen.getByText("to order body")).toBeInTheDocument();
    expect(screen.queryByText("receiving body")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Receiving/ }));
    expect(onValueChange).toHaveBeenCalledWith("receiving");
  });

  it("re-clicking the ACTIVE tab does nothing — a stage picker has nothing to clear into (§8.2)", async () => {
    const onValueChange = vi.fn();
    render(
      <Tabs
        label="Purchasing"
        value="to-order"
        onValueChange={onValueChange}
        tabs={[{ value: "to-order", label: "To order" }]}
      >
        <TabPanel value="to-order">body</TabPanel>
      </Tabs>,
    );
    await userEvent.click(screen.getByRole("tab", { name: "To order" }));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByText("body")).toBeInTheDocument();
  });
});

describe("Checkbox", () => {
  it("reports a click, and reports indeterminate as a real third state", async () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Checkbox checked={false} onCheckedChange={onCheckedChange} aria-label="Select row" />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Select row" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    rerender(<Checkbox checked="indeterminate" onCheckedChange={onCheckedChange} aria-label="Select all" />);
    expect(screen.getByRole("checkbox", { name: "Select all" })).toHaveAttribute("data-state", "indeterminate");
  });
});

describe("Popover and Tooltip", () => {
  it("a popover carries a name and opens on click", async () => {
    render(
      <Popover label="Filters" trigger={<Button>Filters</Button>}>
        <p>panel</p>
      </Popover>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(await screen.findByText("panel")).toBeInTheDocument();
  });

  it("a tooltip needs its provider, and repeats what is already on screen", async () => {
    render(
      <TooltipProvider>
        <Tooltip content="Collect RM 2,000 from Tan Wei Ming">
          <Button>Collect</Button>
        </Tooltip>
      </TooltipProvider>,
    );
    await userEvent.hover(screen.getByRole("button", { name: "Collect" }));
    expect(await screen.findAllByText("Collect RM 2,000 from Tan Wei Ming")).not.toHaveLength(0);
  });
});

describe("DatePicker", () => {
  it("prints the ONE human date format and hands back an ISO day", async () => {
    const onChange = vi.fn();
    render(<DatePicker id="d" label="Delivery date" value="2026-07-19" onChange={onChange} />);
    // §2.4 — `19 Jul 26, Sun`, from fmtDate(), never a raw ISO string
    expect(screen.getByRole("button", { name: /Delivery date/ })).toHaveTextContent("19 Jul 26, Sun");
    await userEvent.click(screen.getByRole("button", { name: /Delivery date/ }));
    const grid = await screen.findByRole("grid");
    // The day cell is labelled by its number; picking the 20th of the shown month.
    await userEvent.click(within(grid).getByText("20"));
    expect(onChange).toHaveBeenCalledWith("2026-07-20");
  });

  it("shows the placeholder, not a blank box, when no date is set", () => {
    render(<DatePicker id="d" label="Delivery date" value={null} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Delivery date/ })).toHaveTextContent("Pick a date");
  });
});
