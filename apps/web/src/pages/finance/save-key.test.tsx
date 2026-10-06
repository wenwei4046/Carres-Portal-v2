import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSaveKey } from "./save-key";

function Form({ save, ready }: { save: () => void; ready: boolean }) {
  useSaveKey(save, ready);
  return <input aria-label="Name" />;
}

describe("useSaveKey: F3 or Ctrl+S presses Save", () => {
  it("Ctrl+S and F3 save, and Ctrl+S never opens the browser's Save page", () => {
    const save = vi.fn();
    const { getByLabelText } = render(<Form save={save} ready />);
    // fireEvent returns false when the page called preventDefault.
    expect(fireEvent.keyDown(getByLabelText("Name"), { key: "s", ctrlKey: true })).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(fireEvent.keyDown(window, { key: "F3" })).toBe(false);
    expect(save).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: "S", metaKey: true });
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("does nothing while a Save gap is shown or a save is running, but still keeps the browser's Save page shut", () => {
    const save = vi.fn();
    render(<Form save={save} ready={false} />);
    expect(fireEvent.keyDown(window, { key: "s", ctrlKey: true })).toBe(false);
    fireEvent.keyDown(window, { key: "F3" });
    expect(save).not.toHaveBeenCalled();
  });

  it("a held key saves once, and other keys are left alone", () => {
    const save = vi.fn();
    render(<Form save={save} ready />);
    fireEvent.keyDown(window, { key: "s", ctrlKey: true, repeat: true });
    expect(fireEvent.keyDown(window, { key: "s" })).toBe(true);
    expect(fireEvent.keyDown(window, { key: "p", ctrlKey: true })).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("stops listening when the form closes", () => {
    const save = vi.fn();
    const { unmount } = render(<Form save={save} ready />);
    unmount();
    fireEvent.keyDown(window, { key: "F3" });
    expect(save).not.toHaveBeenCalled();
  });
});
