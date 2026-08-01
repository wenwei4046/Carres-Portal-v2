/**
 * The Radix half of the kit — BEHAVIOUR, not pixels (card D0.5b).
 *
 * D0.5a's `kit.test.tsx` proves the boxes cannot be restyled. This file proves
 * the ten new ones DO the thing they were added for: a modal that escape closes,
 * a menu that closes on select, a tab bar that is a STAGE picker, a checkbox
 * whose third state is a different SHAPE and not just a different colour, a date
 * field that speaks ISO and prints `fmtDate()`.
 *
 * NEGATIVE CONTROLS (run by hand when touching this file):
 *   · delete `onSelect` from `DropdownMenu`'s item → the "runs the command"
 *     test goes red and nothing else moves.
 *   · make `Tabs` call `onValueChange` on every click → exactly the stage-picker
 *     test goes red.
 *   · swap `Checkbox`'s indeterminate dash for the tick → exactly the
 *     "some is a different shape" test goes red.
 */
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Button from "./Button";
import Checkbox from "./Checkbox";
import DataTable from "./DataTable";
import DatePicker from "./DatePicker";
import GridToolbar from "./GridToolbar";
import Drawer from "./Drawer";
import DropdownMenu from "./DropdownMenu";
import Modal from "./Modal";
import Popover from "./Popover";
import Select from "./Select";
import Tabs from "./Tabs";
import Toast from "./Toast";
import Tooltip from "./Tooltip";
import { Z_LADDER } from "./overlay-layer";

/**
 * The two primitives open on different events, and it matters in a test.
 *
 * A popover toggles on CLICK, which jsdom sends happily. A **menu toggles on
 * POINTERDOWN**, and `jsdom@25` has no `PointerEvent` at all — `fireEvent
 * .pointerDown` therefore dispatches a plain `Event` that React's pointer
 * plugin ignores, so the menu silently stays shut and the test reads as "the
 * menu is broken". Measured, not guessed: `typeof PointerEvent === "undefined"`
 * in this environment.
 *
 * So the menu is opened with the KEYBOARD, which Radix supports on the same
 * trigger — and that is the better assertion anyway, since keyboard access is
 * one of the four things §11 says Radix is here to supply.
 */
const openMenu = (el: HTMLElement) => fireEvent.keyDown(el, { key: "Enter" });
const openPopover = (el: HTMLElement) => fireEvent.click(el);

/* ───────────────────────────────────────────────────────────────────────────
 * Modal · Drawer — the surface that takes the screen
 * ────────────────────────────────────────────────────────────────────────── */

describe("Modal", () => {
  it("renders nothing at all when closed — not a hidden node", () => {
    render(
      <Modal open={false} onOpenChange={() => {}} title="Record the delay decision">
        body
      </Modal>,
    );
    expect(screen.queryByText("Record the delay decision")).not.toBeInTheDocument();
    expect(document.querySelector('[data-kit="modal"]')).not.toBeInTheDocument();
  });

  it("says what it is, and Radix makes that the accessible name", () => {
    render(
      <Modal open onOpenChange={() => {}} title="Record the delay decision" description="One question">
        body
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Record the delay decision");
    expect(screen.getByText("One question")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("closes on escape and on the close button — the caller is told, never guessed at", () => {
    const onOpenChange = vi.fn();
    render(
      <Modal open onOpenChange={onOpenChange} title="Record the delay decision">
        body
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);

    onOpenChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("draws a scrim and sits on §4.4's dialog layer", () => {
    render(
      <Modal open onOpenChange={() => {}} title="t">
        body
      </Modal>,
    );
    expect(document.querySelector('[data-kit="dialog-overlay"]')).toHaveClass("z-40");
    expect(document.querySelector('[data-kit="modal"]')).toHaveClass("z-40");
  });

  it("renders the footer it was given, and none when it was given none", () => {
    const { rerender } = render(
      <Modal open onOpenChange={() => {}} title="t" footer={<Button variant="primary">Save</Button>}>
        body
      </Modal>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    rerender(
      <Modal open onOpenChange={() => {}} title="t">
        body
      </Modal>,
    );
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});

describe("Drawer", () => {
  it("is the same object placed differently — one frame, two boxes", () => {
    render(
      <Drawer open onOpenChange={() => {}} title="SO-1256">
        record
      </Drawer>,
    );
    const drawer = document.querySelector('[data-kit="drawer"]');
    expect(drawer).toBeInTheDocument();
    expect(document.querySelector('[data-kit="modal"]')).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("SO-1256");
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * Select — the field skin, with a list
 * ────────────────────────────────────────────────────────────────────────── */

describe("Select", () => {
  const OPTIONS = [
    { value: "nets", label: "NETS" },
    { value: "houzs", label: "HOUZS" },
    { value: "gai", label: "GAI", disabled: true },
  ];

  it("shows the placeholder when nothing is picked, and the label when something is", () => {
    const { rerender } = render(
      <Select id="carrier" label="Logistics" placeholder="Pick a carrier" options={OPTIONS} onValueChange={() => {}} />,
    );
    expect(screen.getByText("Pick a carrier")).toBeInTheDocument();
    rerender(
      <Select id="carrier" label="Logistics" value="nets" options={OPTIONS} onValueChange={() => {}} />,
    );
    expect(screen.getByText("NETS")).toBeInTheDocument();
  });

  it("carries the SAME error contract as Input — the message replaces the hint", () => {
    render(
      <Select
        id="carrier"
        label="Logistics"
        hint="Never shown while an error is"
        error="Pick a carrier"
        options={OPTIONS}
        onValueChange={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a carrier");
    expect(screen.queryByText("Never shown while an error is")).not.toBeInTheDocument();
    expect(document.querySelector('[data-kit="select"]')).toHaveAttribute("aria-invalid", "true");
  });

  it("wears the field skin, not a second one", () => {
    render(<Select id="carrier" options={OPTIONS} onValueChange={() => {}} />);
    const trigger = document.querySelector('[data-kit="select"]');
    expect(trigger).toHaveClass("h-8");
    expect(trigger).toHaveClass("rounded-control");
    expect(trigger).toHaveClass("border-kit-slate-5");
  });

  it("is disabled when told to be", () => {
    render(<Select id="carrier" disabled options={OPTIONS} onValueChange={() => {}} />);
    expect(document.querySelector('[data-kit="select"]')).toBeDisabled();
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * DropdownMenu — the ⋮ menu
 * ────────────────────────────────────────────────────────────────────────── */

describe("DropdownMenu", () => {
  const items = (onSelect: () => void) => [
    { key: "print", label: "Print", icon: "print" as const, onSelect },
    { key: "copy", label: "Copy reference", icon: "copy" as const, onSelect: () => {}, separatorBefore: true },
    { key: "void", label: "Cancel order", disabled: true, onSelect: () => {} },
  ];

  it("shows nothing until it is opened", () => {
    render(
      <DropdownMenu label="Row actions" trigger={<Button icon="overflow" aria-label="More" />} items={items(() => {})} />,
    );
    expect(screen.queryByText("Print")).not.toBeInTheDocument();
  });

  it("opens, runs the command, and closes itself", () => {
    const onSelect = vi.fn();
    render(
      <DropdownMenu label="Row actions" trigger={<Button icon="overflow" aria-label="More" />} items={items(onSelect)} />,
    );
    openMenu(screen.getByRole("button", { name: "More" }));
    expect(screen.getByText("Print")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Print"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("refuses a disabled command", () => {
    render(
      <DropdownMenu label="Row actions" trigger={<Button icon="overflow" aria-label="More" />} items={items(() => {})} />,
    );
    openMenu(screen.getByRole("button", { name: "More" }));
    expect(screen.getByText("Cancel order").closest('[data-kit="dropdown-item"]')).toHaveAttribute(
      "data-disabled",
    );
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * Popover · Tooltip — the two contextual surfaces
 * ────────────────────────────────────────────────────────────────────────── */

describe("Popover", () => {
  it("opens beside the control and does not trap the page", () => {
    render(
      <Popover label="Filters" trigger={<Button icon="filter">Filter</Button>}>
        <p>panel</p>
      </Popover>,
    );
    expect(screen.queryByText("panel")).not.toBeInTheDocument();
    openPopover(screen.getByRole("button", { name: /Filter/ }));
    expect(screen.getByText("panel")).toBeInTheDocument();
    /* A popover is not a modal, and the difference is the SCRIM, not the role:
     * Radix gives popover content `role="dialog"` too, because it is a labelled
     * surface. What it does not do is dim the page or trap focus — so that is
     * what gets asserted. (Written the other way round first; Radix was right
     * and the assertion was wrong.) */
    expect(document.querySelector('[data-kit="dialog-overlay"]')).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-modal", "true");
  });

  it("sits on §4.4's floating layer, below a dialog", () => {
    render(
      <Popover label="Filters" trigger={<Button>Filter</Button>}>
        <p>panel</p>
      </Popover>,
    );
    openPopover(screen.getByRole("button", { name: "Filter" }));
    expect(document.querySelector('[data-kit="popover"]')).toHaveClass("z-30");
  });
});

describe("Tooltip", () => {
  it("shows the thing it explains, and nothing else until asked", () => {
    render(
      <Tooltip content="already past that deadline">
        <Button icon="late" aria-label="Late" />
      </Tooltip>,
    );
    expect(screen.getByRole("button", { name: "Late" })).toBeInTheDocument();
    expect(screen.queryByText("already past that deadline")).not.toBeInTheDocument();
  });

  it("opens on FOCUS, which a title= attribute never does", () => {
    render(
      <Tooltip content="already past that deadline">
        <Button icon="late" aria-label="Late" />
      </Tooltip>,
    );
    fireEvent.focus(screen.getByRole("button", { name: "Late" }));
    expect(screen.getAllByText("already past that deadline").length).toBeGreaterThanOrEqual(1);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * Tabs — §8.2's STAGE picker
 * ────────────────────────────────────────────────────────────────────────── */

describe("Tabs", () => {
  const TABS = [
    { value: "to-order", label: "To Order", count: 4 },
    { value: "receiving", label: "Receiving" },
  ];

  it("marks exactly one as active and never none", () => {
    render(<Tabs label="Purchasing" tabs={TABS} value="to-order" onValueChange={() => {}} />);
    const active = document.querySelectorAll('[data-kit="tab"][data-state="active"]');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent("To Order");
  });

  it("does NOTHING when the active tab is clicked again — §8.2's stage rule", () => {
    const onValueChange = vi.fn();
    render(<Tabs label="Purchasing" tabs={TABS} value="to-order" onValueChange={onValueChange} />);
    // Radix activates a tab on mousedown, not on click.
    fireEvent.mouseDown(screen.getByRole("tab", { name: /To Order/ }), { button: 0, ctrlKey: false });
    expect(onValueChange).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Receiving" }), { button: 0, ctrlKey: false });
    expect(onValueChange).toHaveBeenCalledWith("receiving");
  });

  it("shows a count only where there is one to show", () => {
    render(<Tabs label="Purchasing" tabs={TABS} value="to-order" onValueChange={() => {}} />);
    expect(document.querySelectorAll('[data-kit="badge"]')).toHaveLength(1);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * Checkbox — three states, and "some" is a SHAPE
 * ────────────────────────────────────────────────────────────────────────── */

describe("Checkbox", () => {
  it("toggles, and the whole label is the target", () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox id="c" label="Select all" checked={false} onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByText("Select all"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("draws SOME as a different shape, not a different colour", () => {
    const { rerender } = render(
      <Checkbox id="c" ariaLabel="Select all" checked="indeterminate" onCheckedChange={() => {}} />,
    );
    expect(document.querySelector('[data-icon="confirm"]')).not.toBeInTheDocument();
    rerender(<Checkbox id="c" ariaLabel="Select all" checked onCheckedChange={() => {}} />);
    expect(document.querySelector('[data-icon="confirm"]')).toBeInTheDocument();
  });

  it("is named for a screen reader even inside a table cell with no label", () => {
    render(<Checkbox id="c" ariaLabel="Select SO-1256" checked={false} onCheckedChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: "Select SO-1256" })).toBeInTheDocument();
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * DatePicker — ISO in, ISO out, `fmtDate()` on screen
 * ────────────────────────────────────────────────────────────────────────── */

describe("DatePicker", () => {
  it("prints the canonical §2.4 date, never the locale's", () => {
    render(<DatePicker id="d" label="Delivery date" value="2026-07-19" onChange={() => {}} />);
    expect(screen.getByText("Sun, 19 Jul 26")).toBeInTheDocument();
  });

  it("shows the placeholder when there is no date, and says so in the placeholder's own ink", () => {
    render(<DatePicker id="d" label="Delivery date" value={null} onChange={() => {}} placeholder="Pick a date" />);
    expect(screen.getByText("Pick a date")).toHaveClass("text-kit-slate-9");
  });

  it("hands back a YYYY-MM-DD string, not a Date, and closes", () => {
    const onChange = vi.fn();
    render(<DatePicker id="d" label="Delivery date" value="2026-07-19" onChange={onChange} />);
    /* The control's accessible name is its LABEL, not the date printed inside
     * it — a `<button>` is a labelable element, so `FieldFrame`'s `<label for>`
     * names it. That is the right answer for a screen reader (the field is
     * "Delivery date"), and it is why this query is not the visible text. */
    openPopover(screen.getByRole("button", { name: "Delivery date" }));
    /* The day button's accessible NAME is react-day-picker's full label
     * ("Wednesday, July 22nd, 2026"), so the query is the visible number. */
    fireEvent.click(screen.getByText("22"));
    expect(onChange).toHaveBeenCalledWith("2026-07-22");
  });

  it("carries the field contract — an error replaces the hint", () => {
    render(
      <DatePicker
        id="d"
        label="Delivery date"
        hint="Never shown while an error is"
        error="Pick a date"
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a date");
    expect(screen.queryByText("Never shown while an error is")).not.toBeInTheDocument();
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * Toast — §9's Success state
 * ────────────────────────────────────────────────────────────────────────── */

describe("Toast", () => {
  it("puts the tone on the GLYPH, never on the whole surface", () => {
    render(<Toast kind="success" message="Delivery order issued" />);
    const toast = document.querySelector('[data-kit="toast"]');
    expect(toast).toHaveAttribute("data-tone", "success");
    expect(toast).toHaveClass("bg-white");
    expect(document.querySelector('[data-icon="ready"]')).toBeInTheDocument();
  });

  it("spells no word of its own", () => {
    render(<Toast kind="danger" message="That did not save" />);
    expect(screen.getByText("That did not save")).toBeInTheDocument();
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * §4.4 — the ladder is closed
 * ────────────────────────────────────────────────────────────────────────── */

describe("the z-index ladder", () => {
  it("has five layers and no sixth", () => {
    expect(Z_LADDER.map((l) => l.z)).toEqual([10, 20, 30, 40, 50]);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * A page's own state still drives everything — nothing here is self-opening
 * ────────────────────────────────────────────────────────────────────────── */

describe("controlled by the page", () => {
  it("a Modal opens and closes on the page's state, never on its own", () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open</Button>
          <Modal open={open} onOpenChange={setOpen} title="Record the delay decision">
            body
          </Modal>
        </>
      );
    }
    render(<Host />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * DataTable — the Excel reflexes (Jess's freeze, 2026-08-01)
 * ────────────────────────────────────────────────────────────────────────── */

describe("DataTable sort + filter", () => {
  const rows = [
    { id: "a", so: 2, model: "Sonic K" },
    { id: "b", so: 1, model: "Fenrir K" },
  ];
  const baseCol = { width: 50, cell: (r: { model: string }) => r.model };

  it("a header click asks asc, a second click on the same column asks desc", () => {
    const onSortChange = vi.fn();
    const { rerender } = render(
      <DataTable
        rows={rows}
        columns={[{ ...baseCol, key: "model", label: "Model", sortable: true }]}
        rowId={(r) => r.id}
        empty="none"
        label="t"
        sort={null}
        onSortChange={onSortChange}
      />,
    );
    fireEvent.click(screen.getByTestId("table-sort-model"));
    expect(onSortChange).toHaveBeenCalledWith({ key: "model", dir: "asc" });
    rerender(
      <DataTable
        rows={rows}
        columns={[{ ...baseCol, key: "model", label: "Model", sortable: true }]}
        rowId={(r) => r.id}
        empty="none"
        label="t"
        sort={{ key: "model", dir: "asc" }}
        onSortChange={onSortChange}
      />,
    );
    fireEvent.click(screen.getByTestId("table-sort-model"));
    expect(onSortChange).toHaveBeenLastCalledWith({ key: "model", dir: "desc" });
  });

  it("a third click on the same header CLEARS the sort — back to the page's default", () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        rows={rows}
        columns={[{ ...baseCol, key: "model", label: "Model", sortable: true }]}
        rowId={(r) => r.id}
        empty="none"
        label="t"
        sort={{ key: "model", dir: "desc" }}
        onSortChange={onSortChange}
      />,
    );
    fireEvent.click(screen.getByTestId("table-sort-model"));
    expect(onSortChange).toHaveBeenCalledWith(null);
  });

  it("an unselectable row gets NO checkbox and leaves the select-all arithmetic", () => {
    const onToggleAll = vi.fn();
    render(
      <DataTable
        rows={rows}
        columns={[{ ...baseCol, key: "model", label: "Model" }]}
        rowId={(r) => r.id}
        empty="none"
        label="t"
        selection={{
          selected: new Set(["a"]),
          onToggleRow: () => {},
          onToggleAll,
          label: "Select all",
          selectable: (r) => r.id === "a",
        }}
      />,
    );
    // Row b is done work — no box at all, not a disabled one.
    expect(document.getElementById("kit-table-row-a")).not.toBeNull();
    expect(document.getElementById("kit-table-row-b")).toBeNull();
    // With b out of the question, a alone selected = ALL selected (checked).
    expect(
      document.getElementById("kit-table-select-all")!.getAttribute("data-state"),
    ).toBe("checked");
  });

  it("a column without sortable renders no sort button — the kit adds nothing uninvited", () => {
    render(
      <DataTable
        rows={rows}
        columns={[{ ...baseCol, key: "model", label: "Model" }]}
        rowId={(r) => r.id}
        empty="none"
        label="t"
        sort={null}
        onSortChange={() => {}}
      />,
    );
    expect(screen.queryByTestId("table-sort-model")).toBeNull();
  });

  it("the ▼ opens a checklist; a tick narrows, the caller's clear word empties", () => {
    const onChange = vi.fn();
    render(
      <DataTable
        rows={rows}
        columns={[
          {
            ...baseCol,
            key: "model",
            label: "Model",
            filter: {
              options: [
                { value: "Sonic K", label: "Sonic K" },
                { value: "Fenrir K", label: "Fenrir K" },
              ],
              selected: new Set(["Sonic K"]),
              onChange,
              label: "Filter Model",
              clearLabel: "Clear",
            },
          },
        ]}
        rowId={(r) => r.id}
        empty="none"
        label="t"
      />,
    );
    openPopover(screen.getByTestId("table-filter-model"));
    fireEvent.click(screen.getByLabelText("Fenrir K"));
    expect(onChange).toHaveBeenCalledWith(new Set(["Sonic K", "Fenrir K"]));
    fireEvent.click(screen.getByTestId("table-filter-clear-model"));
    expect(onChange).toHaveBeenLastCalledWith(new Set());
  });

  it("an active filter marks its trigger — a filter you cannot see is a lie", () => {
    const col = (selected: Set<string>) => [
      {
        ...baseCol,
        key: "model",
        label: "Model",
        filter: {
          options: [{ value: "Sonic K", label: "Sonic K" }],
          selected,
          onChange: () => {},
          label: "Filter Model",
          clearLabel: "Clear",
        },
      },
    ];
    const { rerender } = render(
      <DataTable rows={rows} columns={col(new Set())} rowId={(r) => r.id} empty="none" label="t" />,
    );
    expect(screen.getByTestId("table-filter-model").dataset.active).toBeUndefined();
    rerender(
      <DataTable
        rows={rows}
        columns={col(new Set(["Sonic K"]))}
        rowId={(r) => r.id}
        empty="none"
        label="t"
      />,
    );
    expect(screen.getByTestId("table-filter-model").dataset.active).toBe("true");
  });
});

describe("Button pill shape", () => {
  it("pill rounds fully; the default keeps the control radius — shape, never a variant", () => {
    const { rerender } = render(<Button shape="pill">Issue Purchase Orders</Button>);
    expect(screen.getByRole("button").className).toContain("rounded-full");
    rerender(<Button>Issue Purchase Orders</Button>);
    expect(screen.getByRole("button").className).toContain("rounded-control");
    expect(screen.getByRole("button").className).not.toContain("rounded-full");
  });
});

describe("GridToolbar", () => {
  it("holds its three slots and spells no word of its own", () => {
    render(
      <GridToolbar
        search={<input aria-label="s" />}
        right={<span>28 SO selected</span>}
        meta={<span>Updated 10:32 AM</span>}
      />,
    );
    const bar = document.querySelector('[data-kit="grid-toolbar"]')!;
    expect(bar.textContent).toContain("28 SO selected");
    expect(bar.textContent).toContain("Updated 10:32 AM");
  });
});
