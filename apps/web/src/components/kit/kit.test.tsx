/**
 * Foundation components — the RULES, not the pixels (card D0.5a).
 *
 * Two kinds of test live here and they are doing different jobs:
 *
 *   · `@ts-expect-error` blocks — the Type System / Component API half of
 *     UI-KIT's Enforcement ladder. They pass by FAILING TO COMPILE, so they
 *     are checked by `tsc -p tsconfig.app.json`, not by the runner. Delete the
 *     constraint they guard and typecheck goes red.
 *   · render assertions — the states §9 demands, especially the ugly ones.
 *
 * NEGATIVE CONTROL (run it by hand when touching this file):
 *   remove `Omit<…, "className" | "style">` from Button — the six className /
 *   style expectations below stop erroring and `tsc` reports six unused
 *   `@ts-expect-error` directives. Nothing else moves.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Badge from "./Badge";
import Button from "./Button";
import Card from "./Card";
import EmptyState from "./EmptyState";
import Icon, { ICON_NAMES } from "./Icon";
import Input from "./Input";
import Loading from "./Loading";
import Panel from "./Panel";
import SearchInput from "./SearchInput";
import StatusPill from "./StatusPill";
import Textarea from "./Textarea";
import { TONE_CLASS, TONES, TYPE_TOKENS } from "./tokens";

/* ───────────────────────────────────────────────────────────────────────────
 * 1 · Component API — a chat cannot restyle a kit component (UI-KIT §0.1)
 * ────────────────────────────────────────────────────────────────────────── */

describe("no kit component accepts a style override", () => {
  it("refuses className and style at the type level", () => {
    // @ts-expect-error — className is not a prop of a kit component
    void <Button className="text-red-500">x</Button>;
    // @ts-expect-error — style is not a prop of a kit component
    void <Button style={{ color: "red" }}>x</Button>;
    // @ts-expect-error — className is not a prop of a kit component
    void <Input id="a" className="w-10" />;
    // @ts-expect-error — className is not a prop of a kit component
    void <Textarea id="b" className="w-10" />;
    // @ts-expect-error — className is not a prop of a kit component
    void <SearchInput id="c" className="w-10" />;
    // @ts-expect-error — className is not a prop of a kit component
    void <StatusPill tone="neutral" className="bg-black">x</StatusPill>;
    // @ts-expect-error — className is not a prop of a kit component
    void <Badge className="bg-black">1</Badge>;
    // @ts-expect-error — className is not a prop of a kit component
    void <Card className="p-10">x</Card>;
    // @ts-expect-error — className is not a prop of a kit component
    void <Panel title="t" className="p-10">x</Panel>;
    // @ts-expect-error — className is not a prop of a kit component
    void <EmptyState title="t" className="p-10" />;
    // @ts-expect-error — className is not a prop of a kit component
    void <Loading className="h-10" />;
    expect(true).toBe(true);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * 2 · The closed sets — icons, tones, sizes (UI-KIT §5 · §3.6)
 * ────────────────────────────────────────────────────────────────────────── */

describe("closed sets", () => {
  it("refuses a meaning, a size and a tone that the law does not have", () => {
    // @ts-expect-error — §5.2 retired Edit3; `edit` is the one meaning
    void <Icon name="edit3" />;
    // @ts-expect-error — §5.1 allows exactly 14 / 16 / 18
    void <Icon name="edit" size={20} />;
    // @ts-expect-error — §3.6 lists a sixth "money" tone; OrderActionTone has five (reported)
    void <StatusPill tone="money">RM 2,000</StatusPill>;
    // @ts-expect-error — a pill takes a STATUS glyph, not an action one
    void <StatusPill tone="info" icon="add">x</StatusPill>;
    // @ts-expect-error — Badge has no tone: a coloured badge is a status in disguise
    void <Badge tone="danger">3</Badge>;
    // @ts-expect-error — there is no danger button; red is a state, not a control
    void <Button variant="danger">Delete</Button>;
    // @ts-expect-error — the spinner matches the three icon sizes
    void <Loading size={24} />;
    expect(true).toBe(true);
  });

  it("carries §5.3's 40 meanings and renders the mapped glyph", () => {
    expect(ICON_NAMES).toHaveLength(40);
    // one meaning, one glyph — `ready` and `confirm` deliberately share Check
    render(
      <>
        <Icon name="edit" />
        <Icon name="on-hold" />
      </>,
    );
    expect(document.querySelector('[data-icon="edit"]')).toBeInTheDocument();
    expect(document.querySelector('[data-icon="on-hold"]')).toBeInTheDocument();
  });

  it("has six type tokens and no seventh", () => {
    expect(TYPE_TOKENS).toHaveLength(6);
    expect(TYPE_TOKENS.map((t) => t.px)).toEqual([24, 20, 15, 13, 12, 11]);
  });

  it("has one class pair per tone and no more", () => {
    expect(Object.keys(TONE_CLASS).sort()).toEqual([...TONES].sort());
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * 3 · §9 states — the ugly ones especially
 * ────────────────────────────────────────────────────────────────────────── */

describe("Button states", () => {
  it("is disabled and shows the spinner instead of the icon while loading", () => {
    render(
      <Button variant="primary" icon="call" loading>
        Sending
      </Button>,
    );
    const btn = screen.getByRole("button", { name: /sending/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector('[data-testid="kit-loading-spinner"]')).toBeInTheDocument();
    expect(document.querySelector('[data-icon="call"]')).not.toBeInTheDocument();
  });

  it("is disabled when told to be, without loading", () => {
    render(<Button disabled>Open order</Button>);
    expect(screen.getByRole("button", { name: "Open order" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open order" })).not.toHaveAttribute("aria-busy");
  });

  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Open order</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});

describe("Input states", () => {
  it("shows the hint when there is no error", () => {
    render(<Input id="f" label="Phone" hint="Mobile only" />);
    expect(screen.getByText("Mobile only")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).not.toHaveAttribute("aria-invalid");
  });

  it("REPLACES the hint with the error — never stacks two lines of guidance", () => {
    render(<Input id="f" label="Phone" hint="Mobile only" error="Enter a Malaysian mobile number" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a Malaysian mobile number");
    expect(screen.queryByText("Mobile only")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("renders an empty value as the placeholder, not as a blank labelled box", () => {
    render(<Input id="f" label="Customer" placeholder="Search a customer" />);
    expect(screen.getByPlaceholderText("Search a customer")).toHaveValue("");
  });

  it("marks a required field on the label, not only in the DOM", () => {
    render(<Input id="f" label="Reason" required />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });
});

describe("Textarea and SearchInput", () => {
  it("carries the same error contract as Input", () => {
    render(<Textarea id="t" label="Reason" error="A reason is required" />);
    expect(screen.getByRole("alert")).toHaveTextContent("A reason is required");
  });

  it("labels the search box even though it shows no label", () => {
    render(<SearchInput id="s" />);
    expect(screen.getByRole("searchbox", { name: "Search" })).toBeInTheDocument();
  });
});

describe("StatusPill", () => {
  it("paints the tone the engine computed and says which one it was", () => {
    render(<StatusPill tone="danger">Late</StatusPill>);
    const pill = screen.getByText("Late").closest('[data-kit="status-pill"]');
    expect(pill).toHaveAttribute("data-tone", "danger");
    for (const cls of TONE_CLASS.danger.split(" ")) expect(pill).toHaveClass(cls);
  });

  it("renders every tone without a page choosing a colour", () => {
    render(
      <>
        {TONES.map((tone) => (
          <StatusPill key={tone} tone={tone}>
            {tone}
          </StatusPill>
        ))}
      </>,
    );
    expect(document.querySelectorAll('[data-kit="status-pill"]')).toHaveLength(TONES.length);
  });
});

describe("EmptyState and Loading", () => {
  it("says something and stays silent about the rest", () => {
    render(<EmptyState title="No orders match this filter" />);
    expect(screen.getByText("No orders match this filter")).toBeInTheDocument();
    expect(document.querySelector("[data-icon]")).not.toBeInTheDocument();
  });

  it("draws the skeleton bars it was asked for, the last one short", () => {
    render(<Loading variant="skeleton" lines={4} />);
    const bars = document.querySelectorAll('[data-testid="kit-loading-skeleton"] > div');
    expect(bars).toHaveLength(4);
    expect(bars[3]).toHaveClass("w-3/5");
    expect(bars[0]).toHaveClass("w-full");
  });

  it("announces itself to a screen reader in both shapes", () => {
    render(<Loading label="Loading orders" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading orders");
  });
});

describe("Card and Panel", () => {
  it("lets a table-bodied card drop its padding, and nothing else", () => {
    const { container } = render(<Card padding="none">x</Card>);
    expect(container.querySelector('[data-kit="card"]')).not.toHaveClass("p-4");
  });

  it("gives a Panel a real heading, so a screen reader finds the section", () => {
    render(<Panel title="Items ordered">x</Panel>);
    expect(screen.getByRole("heading", { name: "Items ordered" })).toBeInTheDocument();
  });
});
