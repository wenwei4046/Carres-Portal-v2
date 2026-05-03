import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal, ModalActions } from "./Modal";

describe("Modal", () => {
  it("renders title and children", () => {
    render(
      <Modal title="Test title" onClose={() => {}}>
        <div>Inner content</div>
      </Modal>,
    );
    expect(screen.getByText("Test title")).toBeInTheDocument();
    expect(screen.getByText("Inner content")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("closes on Esc key", () => {
    const onClose = vi.fn();
    render(
      <Modal title="X" onClose={onClose}>
        <button type="button">A</button>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click but not on dialog body click", () => {
    const onClose = vi.fn();
    render(
      <Modal title="X" onClose={onClose}>
        <button type="button">A</button>
      </Modal>,
    );
    // Click the dialog body — should NOT close.
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    // Click the backdrop — should close.
    fireEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ModalActions disables primary when primaryDisabled", () => {
    render(
      <ModalActions
        onCancel={() => {}}
        onPrimary={() => {}}
        primary="Submit"
        primaryDisabled
      />,
    );
    expect(screen.getByRole("button", { name: /Submit/ })).toBeDisabled();
  });

  it("ModalActions shows 'Working…' when pending", () => {
    render(
      <ModalActions
        onCancel={() => {}}
        onPrimary={() => {}}
        primary="Submit"
        primaryPending
      />,
    );
    expect(screen.getByRole("button", { name: /Working/ })).toBeDisabled();
  });
});
