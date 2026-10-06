import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import FollowUpForm, { PRESET_FOLLOWUPS } from "./FollowUpForm";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn().mockResolvedValue({ members: [] }) }));

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FollowUpForm orderId="o1" so={1303} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

/* Delivery MASTER §5.2 (owner correction 2026-09-25): Logistics contacts the
   customer and agrees the date, so no preset books it with the customer. */
describe("FollowUpForm presets", () => {
  it("never offers the retired customer-booking preset", () => {
    mount();
    const presets = screen.getByDisplayValue("Call logistics to confirm delivery date");
    const options = [...presets.querySelectorAll("option")].map((o) => o.textContent);
    expect(options).toEqual([...PRESET_FOLLOWUPS, "Other (type below)…"]);
    expect(options).not.toContain("Call customer to book delivery date");
    expect(PRESET_FOLLOWUPS.some((p) => /customer to book/i.test(p))).toBe(false);
  });
});
