import { act, fireEvent } from "@testing-library/react";

/**
 * Rail groups open only when the operator opens them (owner ruling
 * 2026-09-28). A test that works inside a group opens it first, the way a
 * person does: one click on each closed group header.
 */
export function openRailGroups(root: ParentNode = document) {
  act(() => {
    for (const header of root.querySelectorAll<HTMLButtonElement>('[data-rail-group] > button[aria-expanded="false"]')) {
      fireEvent.click(header);
    }
  });
}
