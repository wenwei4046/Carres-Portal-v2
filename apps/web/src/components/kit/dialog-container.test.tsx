/**
 * A picker inside a dialog renders ABOVE it — card D0.5b.1.
 *
 * §4.4 puts popovers on 30 and dialogs on 40, and both Radix portals mount as
 * SIBLINGS on `<body>`, so a `Select` opened inside a `Modal` painted
 * underneath it. The fix is that the dialog publishes its content node and the
 * picker portals INTO it — **so the assertion is a DOM one, not a z-index one.**
 * Testing the number would test the thing that did not change.
 *
 * NEGATIVE CONTROLS (run by hand when touching this file):
 *   · remove `container={dialogContainer}` from `Select`'s portal
 *       → exactly the Select test fails.
 *   · remove it from `Popover`'s portal
 *       → exactly the Popover AND DatePicker tests fail — they share one door,
 *         which is the reason the card names three components and changes two.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Button from "./Button";
import DatePicker from "./DatePicker";
import Modal from "./Modal";
import Popover from "./Popover";
import Select from "./Select";
import { Z_LADDER } from "./overlay-layer";

const OPTIONS = [
  { value: "nets", label: "NETS" },
  { value: "ohana", label: "Ohana" },
];

/**
 * Opened with the KEYBOARD, for the reason `kit-behaviour.test.tsx` already
 * measured and wrote down: `jsdom@25` has no `PointerEvent` at all, so a
 * fired `pointerDown` is a plain `Event` that React's pointer plugin ignores
 * and the list silently stays shut. Radix supports Enter on the same trigger,
 * and keyboard access is one of the four things §11 says Radix is here for.
 */
const openWithKeyboard = (el: HTMLElement) => fireEvent.keyDown(el, { key: "Enter" });
/** A popover toggles on CLICK, which jsdom sends happily. */
const openWithClick = (el: HTMLElement) => fireEvent.click(el);

/**
 * The MODAL, found by its own marker. `getByRole("dialog")` turns ambiguous the
 * moment a Popover is open — Radix gives popover content that role too — and an
 * ambiguous query in a test about WHERE something rendered is a test that
 * cannot tell the two surfaces apart.
 */
const modal = () => document.querySelector('[data-kit="modal"]') as HTMLElement;

describe("a picker opened INSIDE a dialog", () => {
  it("puts the Select's list inside the dialog, not beside it on <body>", async () => {
    render(
      <Modal open onOpenChange={() => {}} title="Record the delay decision">
        <Select id="supplier" label="Supplier" options={OPTIONS} onValueChange={() => {}} />
      </Modal>,
    );
    openWithKeyboard(screen.getByRole("combobox", { name: /Supplier/ }));
    expect(modal().contains(screen.getByRole("listbox"))).toBe(true);
  });

  it("puts the Popover's panel inside the dialog", async () => {
    render(
      <Modal open onOpenChange={() => {}} title="Record the delay decision">
        <Popover label="Filters" trigger={<Button>Filters</Button>}>
          <p>panel</p>
        </Popover>
      </Modal>,
    );
    openWithClick(screen.getByRole("button", { name: "Filters" }));
    expect(modal().contains(screen.getByText("panel"))).toBe(true);
  });

  it("puts the DatePicker's calendar inside the dialog", async () => {
    render(
      <Modal open onOpenChange={() => {}} title="Arrange the delivery">
        <DatePicker id="d" label="Delivery date" value="2026-07-19" onChange={() => {}} />
      </Modal>,
    );
    openWithClick(screen.getByRole("button", { name: /Delivery date/ }));
    expect(modal().contains(screen.getByRole("grid"))).toBe(true);
  });
});

describe("the ordinary case does not move", () => {
  it("keeps a Select outside a dialog portalled to <body>", async () => {
    render(<Select id="supplier" label="Supplier" options={OPTIONS} onValueChange={() => {}} />);
    openWithKeyboard(screen.getByRole("combobox", { name: /Supplier/ }));
    const list = screen.getByRole("listbox");
    expect(document.querySelector('[data-kit="modal"]')).not.toBeInTheDocument();
    // Radix wraps portalled popper content; outside a dialog that wrapper is a
    // child of <body>, which is what "the fix changed nothing here" means.
    expect(list.closest("[data-radix-popper-content-wrapper]")?.parentElement).toBe(document.body);
  });
});

describe("the z-ladder", () => {
  it("is untouched — the fix is structural, and a diff that moves a number missed the point", () => {
    expect(Z_LADDER.map((l) => l.z)).toEqual([10, 20, 30, 40, 50]);
    expect(Z_LADDER.find((l) => l.layer.includes("popover"))?.z).toBe(30);
    expect(Z_LADDER.find((l) => l.layer.includes("modal"))?.z).toBe(40);
  });
});
