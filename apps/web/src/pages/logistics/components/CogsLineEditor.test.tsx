import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ManualCostSource } from "@carres/shared";
import CogsLineEditor from "./CogsLineEditor";

/**
 * CogsLineEditor — Phase 4.5 Chunk 2 Sprint E Task 28.
 *
 * The component fetches `GET /api/logistics/skus/:sku/recent-cost` lazily when
 * the user picks `prev_po` / `system_suggested`. We mock `apiFetch` so each
 * test can assert exact path + response shape without spinning up MSW.
 */
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});
import { apiFetch } from "@/lib/api";

const SKU = "mattress:carres-cloud:king";

/**
 * Test wrapper — drives CogsLineEditor as a controlled component. Exposes the
 * latest onChange args via a spy so tests can assert both DOM state AND the
 * exact (cost, costSource) tuple the parent would receive.
 */
function Harness({
  onChangeSpy,
  initialCost = null,
  initialSource = null,
}: {
  onChangeSpy: ReturnType<typeof vi.fn>;
  initialCost?: number | null;
  initialSource?: ManualCostSource | null;
}) {
  const [cost, setCost] = useState<number | null>(initialCost);
  const [source, setSource] = useState<ManualCostSource | null>(initialSource);
  return (
    <CogsLineEditor
      sku={SKU}
      cost={cost}
      costSource={source}
      onChange={(nextCost, nextSource) => {
        onChangeSpy(nextCost, nextSource);
        setCost(nextCost);
        setSource(nextSource);
      }}
    />
  );
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("CogsLineEditor", () => {
  it("hand-entered: typing cost calls onChange with (cost, 'hand_entered')", () => {
    const onChange = vi.fn();
    render(wrap(<Harness onChangeSpy={onChange} />));

    // Pick "Hand-entered" first — the onChange fires with (null, 'hand_entered').
    fireEvent.change(screen.getByTestId(`cogs-source-select-${SKU}`), {
      target: { value: "hand_entered" },
    });
    expect(onChange).toHaveBeenLastCalledWith(null, "hand_entered");

    // Now type a cost. onChange fires with (50, 'hand_entered').
    const costInput = screen.getByTestId(
      `cogs-cost-input-${SKU}`,
    ) as HTMLInputElement;
    fireEvent.change(costInput, { target: { value: "50" } });
    expect(onChange).toHaveBeenLastCalledWith(50, "hand_entered");

    // No network call for hand-entered.
    expect(apiFetch).not.toHaveBeenCalled();

    // DOM reflects the typed cost.
    expect(costInput.value).toBe("50");
  });

  it("previous PO: auto-fills cost from recent-cost endpoint", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      cost: 12.5,
      lastPoId: "PO-0007",
      lastReceivedAt: "2026-04-01T08:00:00Z",
    });
    const onChange = vi.fn();
    render(wrap(<Harness onChangeSpy={onChange} />));

    fireEvent.change(screen.getByTestId(`cogs-source-select-${SKU}`), {
      target: { value: "prev_po" },
    });

    // The component fetches via `apiFetch` once.
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe(
      `/api/logistics/skus/${encodeURIComponent(SKU)}/recent-cost`,
    );

    // After the round-trip, onChange was called with the populated cost.
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(12.5, "prev_po");
    });

    // Cost input shows the auto-filled value.
    const costInput = screen.getByTestId(
      `cogs-cost-input-${SKU}`,
    ) as HTMLInputElement;
    expect(costInput.value).toBe("12.5");

    // Dropdown still shows "prev_po".
    const select = screen.getByTestId(
      `cogs-source-select-${SKU}`,
    ) as HTMLSelectElement;
    expect(select.value).toBe("prev_po");
  });

  it("system suggested: 110% of recent cost (rounded to 2dp)", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      cost: 10.0,
      lastPoId: "PO-0007",
      lastReceivedAt: "2026-04-01T08:00:00Z",
    });
    const onChange = vi.fn();
    render(wrap(<Harness onChangeSpy={onChange} />));

    fireEvent.change(screen.getByTestId(`cogs-source-select-${SKU}`), {
      target: { value: "system_suggested" },
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(1);
    });

    // 10.00 * 1.10 = 11.00 — exactly representable in f64.
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(11, "system_suggested");
    });

    const costInput = screen.getByTestId(
      `cogs-cost-input-${SKU}`,
    ) as HTMLInputElement;
    expect(costInput.value).toBe("11");
  });

  it("no historical data: shows inline message and keeps prior cost", async () => {
    // Recent-cost returns cost:null — there is no prior PO for this SKU.
    vi.mocked(apiFetch).mockResolvedValue({
      cost: null,
      lastPoId: null,
      lastReceivedAt: null,
    });
    const onChange = vi.fn();
    render(
      wrap(
        <Harness
          onChangeSpy={onChange}
          initialCost={42}
          initialSource="hand_entered"
        />,
      ),
    );

    fireEvent.change(screen.getByTestId(`cogs-source-select-${SKU}`), {
      target: { value: "prev_po" },
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(1);
    });

    // Inline "no historical data" message renders.
    await waitFor(() => {
      expect(screen.getByTestId(`cogs-no-history-${SKU}`)).toBeInTheDocument();
    });

    // Cost stays at 42 (don't clobber). Source flipped optimistically.
    const costInput = screen.getByTestId(
      `cogs-cost-input-${SKU}`,
    ) as HTMLInputElement;
    expect(costInput.value).toBe("42");

    // onChange was called with the optimistic source flip BUT cost preserved.
    expect(onChange).toHaveBeenCalledWith(42, "prev_po");
    // It was NEVER called with cost=null (would mean we clobbered).
    const calls = onChange.mock.calls;
    const clobbered = calls.some(
      ([c, s]) => c === null && s === "prev_po",
    );
    expect(clobbered).toBe(false);
  });

  it("manual edit overrides: typing flips dropdown back to 'hand_entered'", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      cost: 12.5,
      lastPoId: "PO-0007",
      lastReceivedAt: "2026-04-01T08:00:00Z",
    });
    const onChange = vi.fn();
    render(wrap(<Harness onChangeSpy={onChange} />));

    // Pick "prev_po" — auto-fills 12.50.
    fireEvent.change(screen.getByTestId(`cogs-source-select-${SKU}`), {
      target: { value: "prev_po" },
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(12.5, "prev_po");
    });

    // User types a manual override — dropdown should snap back.
    fireEvent.change(screen.getByTestId(`cogs-cost-input-${SKU}`), {
      target: { value: "15" },
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(15, "hand_entered");
    });
    const select = screen.getByTestId(
      `cogs-source-select-${SKU}`,
    ) as HTMLSelectElement;
    expect(select.value).toBe("hand_entered");
  });
});
