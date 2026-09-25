/**
 * OWNER, TIMING AND SOURCE prints the one date spelling on the Carres clock
 * (owner decision 2026-09-25): production showed raw "2026-07-16" and UTC
 * "2026-09-25T01:15:05.207Z".
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { OperationWorkItem } from "@carres/shared";
import WorkOwnerSource from "./WorkOwnerSource";

describe("WorkOwnerSource", () => {
  it("spells the action day and the read time through fmtDate in Asia/Kuala_Lumpur — never raw ISO", () => {
    const item = {
      module: "delivery",
      object: { label: "SO-1222" },
      owner: { normal: { name: "Shasha" }, acting: { name: "Shasha" } },
      timing: { actionOn: "2026-07-16", businessDueOn: "2026-07-16", noDateReason: null },
      observedAt: "2026-09-25T01:15:05.207Z",
    } as unknown as OperationWorkItem;
    const { container } = render(<WorkOwnerSource item={item} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Thu, 16 Jul");
    expect(text).toContain("Fri, 25 Sep 09:15"); // 01:15Z is 09:15 in Kuala Lumpur
    expect(text).not.toMatch(/2026-07-16|T01:15|\.207Z/);
    expect(screen.getByText("Owner, timing and source")).toBeInTheDocument();
  });
});
