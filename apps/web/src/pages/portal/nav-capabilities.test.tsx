import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@carres/shared/domain";
import { resetNavCapabilities, useNavCapabilities } from "./nav-capabilities";

/* Who the rail and the BD POS ask "may this person ask Finance to pay?"
   (0645; 0687, Chew 2026-10-12: HR and BD staff too). */
const api = vi.hoisted(() => ({ calls: [] as string[], mayRequest: true }));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string) => {
    api.calls.push(url);
    return { may_request: api.mayRequest, finance: false, boss: false, may_grant: false };
  }),
}));

function Probe({ role, id }: { role: Role | null; id: string }) {
  const caps = useNavCapabilities(role, id);
  return <output data-testid="caps">{caps.has("payment-requester") ? "may ask" : "may not ask"}</output>;
}

beforeEach(() => {
  api.calls = [];
  api.mayRequest = true;
  resetNavCapabilities();
});

describe("useNavCapabilities", () => {
  it.each(["operation", "principal", "hr", "bd"] as const)("asks for %s, and shows the grant", async (role) => {
    render(<Probe role={role} id={`u-${role}`} />);
    await waitFor(() => expect(screen.getByTestId("caps")).toHaveTextContent("may ask"));
    expect(api.calls).toEqual(["/api/finance/payment-requests/me"]);
  });

  it("an HR or BD person with no grant may not ask", async () => {
    api.mayRequest = false;
    render(<Probe role="bd" id="u-bd-2" />);
    await waitFor(() => expect(api.calls).toHaveLength(1));
    expect(screen.getByTestId("caps")).toHaveTextContent("may not ask");
  });

  it.each(["dealer", "salesperson", "showroom", "supplier"] as const)("never asks for %s", async (role) => {
    render(<Probe role={role} id={`u-${role}`} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(api.calls).toEqual([]);
    expect(screen.getByTestId("caps")).toHaveTextContent("may not ask");
  });
});
