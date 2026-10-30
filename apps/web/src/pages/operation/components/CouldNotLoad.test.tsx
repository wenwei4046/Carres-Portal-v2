import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CouldNotLoad from "./CouldNotLoad";

describe("CouldNotLoad", () => {
  it("announces the failure and Try again calls onRetry", () => {
    const retry = vi.fn();
    render(<CouldNotLoad detail="Stock could not be loaded." onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
