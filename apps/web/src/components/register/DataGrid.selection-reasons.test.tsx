import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DataGrid } from "./DataGrid";

const rows = [{ id: "same/id", name: "Blocked", allowed: false }, { id: "ready", name: "Ready", allowed: true }];
function grid(storageKey: string, explained = true, toggle = vi.fn()) {
  return <DataGrid rows={rows} rowKey={(row) => row.id} storageKey={storageKey}
    columns={[{ key: "name", label: "Name", accessor: (row) => row.name }]}
    selectable={{ selectedKeys: new Set(), onToggle: toggle, onToggleAll: vi.fn(),
      isSelectable: (row: typeof rows[number]) => row.allowed,
      ...(explained ? { unselectableReason: () => "Supplier not assigned" } : {}) }} />;
}
afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

it("makes refusal reachable by keyboard without enabling the protected selection", () => {
  const toggle = vi.fn();
  render(grid("selection.reason", true, toggle));
  const [blocked, ready] = screen.getAllByRole("checkbox", { name: "Select row" });
  expect(blocked).toBeDisabled();
  expect(blocked).toHaveAccessibleDescription("Supplier not assigned");
  expect(ready).toBeEnabled();
  expect(ready).not.toHaveAttribute("aria-describedby");
  const trigger = blocked.closest("label")!;
  expect(trigger).toHaveAttribute("tabindex", "0");
  trigger.focus();
  expect(trigger).toHaveFocus();
  fireEvent.keyDown(trigger, { key: " " });
  fireEvent.click(trigger);
  expect(toggle).not.toHaveBeenCalled();
});

it("keeps descriptions unique across grids with the same row identities", () => {
  render(<>{grid("selection.first")}{grid("selection.second")}</>);
  const disabled = screen.getAllByRole("checkbox", { name: "Select row" }).filter((el) => (el as HTMLInputElement).disabled);
  const ids = disabled.map((el) => el.getAttribute("aria-describedby"));
  expect(new Set(ids).size).toBe(2);
  for (const checkbox of disabled) expect(checkbox).toHaveAccessibleDescription("Supplier not assigned");
});

it("leaves callers without a reason unchanged", () => {
  render(grid("selection.legacy", false));
  const blocked = screen.getAllByRole("checkbox", { name: "Select row" })[0];
  expect(blocked).toBeDisabled();
  expect(blocked).not.toHaveAttribute("aria-describedby");
  expect(blocked.closest("label")).not.toHaveAttribute("tabindex");
});
