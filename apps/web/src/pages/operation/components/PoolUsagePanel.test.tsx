import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PoolUsagePanel from "./PoolUsagePanel";
import type { OpsStockUsageResponse } from "@carres/shared";

/**
 * Ready stock K4 — where the pool went, and how low it may go.
 *
 * The behaviours worth locking down are the ones a screenshot cannot prove:
 *  1. An unset reserve level reads "Set a number", never a reassuring tick —
 *     a quiet screen must mean "watched and fine", never "nobody looked".
 *  2. The pencil exists only for the seat allowed to use it (the server
 *     re-gates anyway, so this is about not offering what will be refused).
 *  3. An empty month says so, rather than rendering nothing.
 *  4. A payload from an API that predates K4 degrades to an empty month
 *     instead of white-screening the whole Stock tab.
 */

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api";

const PILLOW = "Essential Memory Pillow(L)";

function response(over: Partial<OpsStockUsageResponse> = {}): OpsStockUsageResponse {
  return {
    period: "2026-07",
    totalUnits: 0,
    totalDraws: 0,
    byReason: [],
    bySku: [],
    entries: [],
    levels: [],
    lowCount: 0,
    canEdit: false,
    ...over,
  };
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PoolUsagePanel period="2026-07" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("the usage split", () => {
  it("says an empty month is empty", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response() as never);
    renderPanel();
    expect(await screen.findByTestId("usage-empty")).toBeTruthy();
  });

  it("prints each reason's share, units and how many times", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      response({
        totalUnits: 10,
        totalDraws: 3,
        byReason: [
          { reason: "sales_urgent", label: "Sales urgent", units: 8, draws: 2, share: 80 },
          {
            reason: "supplier_delay",
            label: "Supplier delay",
            units: 2,
            draws: 1,
            share: 20,
          },
        ],
      }) as never,
    );
    renderPanel();

    const sales = await screen.findByTestId("usage-reason-sales_urgent");
    expect(sales.textContent).toContain("80%");
    expect(sales.textContent).toContain("8");
    const delay = screen.getByTestId("usage-reason-supplier_delay");
    expect(delay.textContent).toContain("20%");
  });

  it("can open the draws behind the percentages", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      response({
        totalUnits: 4,
        totalDraws: 1,
        byReason: [
          { reason: "vip", label: "VIP", units: 4, draws: 1, share: 100 },
        ],
        entries: [
          {
            id: "u1",
            sku: PILLOW,
            qty: 4,
            reason: "vip",
            label: "VIP",
            note: null,
            ref: "SO-1209",
            takenByName: "Shasha",
            takenAt: "2026-07-27T02:00:00Z",
          },
        ],
      }) as never,
    );
    renderPanel();

    fireEvent.click(await screen.findByTestId("usage-log-toggle"));
    const log = await screen.findByTestId("usage-log");
    expect(log.textContent).toContain(PILLOW);
    expect(log.textContent).toContain("SO-1209");
    expect(log.textContent).toContain("Shasha");
  });
});

describe("reserve levels", () => {
  it("asks for a number rather than claiming everything is fine", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      response({
        levels: [
          {
            sku: PILLOW,
            free: 555,
            reserved: 0,
            reserveLevel: null,
            state: "unset",
            shortfall: 0,
          },
        ],
      }) as never,
    );
    renderPanel();

    const pill = await screen.findByTestId(`reserve-level-state-${PILLOW}`);
    expect(pill.textContent).toContain("Set a number");
  });

  it("says how far below the level a SKU has fallen", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      response({
        lowCount: 1,
        levels: [
          {
            sku: PILLOW,
            free: 15,
            reserved: 4,
            reserveLevel: 20,
            state: "low",
            shortfall: 5,
          },
        ],
      }) as never,
    );
    renderPanel();

    const row = await screen.findByTestId(`reserve-level-${PILLOW}`);
    expect(row.textContent).toContain("below the level");
    expect((await screen.findByTestId("pool-low-count")).textContent).toContain("1");
  });

  it("offers the pencil only to the seat that may set it", async () => {
    const row = {
      sku: PILLOW,
      free: 15,
      reserved: 0,
      reserveLevel: 20,
      state: "low" as const,
      shortfall: 5,
    };
    vi.mocked(apiFetch).mockResolvedValue(response({ levels: [row] }) as never);
    const { unmount } = renderPanel();
    await screen.findByTestId(`reserve-level-${PILLOW}`);
    expect(screen.queryByTestId(`reserve-level-edit-${PILLOW}`)).toBeNull();
    unmount();

    vi.mocked(apiFetch).mockResolvedValue(
      response({ levels: [row], canEdit: true }) as never,
    );
    renderPanel();
    expect(await screen.findByTestId(`reserve-level-edit-${PILLOW}`)).toBeTruthy();
  });

  it("sends the new level and nothing else", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) =>
      path.startsWith("/api/ops/stock/usage")
        ? (response({
            canEdit: true,
            levels: [
              {
                sku: PILLOW,
                free: 15,
                reserved: 0,
                reserveLevel: null,
                state: "unset",
                shortfall: 0,
              },
            ],
          }) as never)
        : ({ sku: PILLOW, reserveLevel: 200 } as never),
    );
    renderPanel();

    fireEvent.click(await screen.findByTestId(`reserve-level-edit-${PILLOW}`));
    fireEvent.change(screen.getByTestId(`reserve-level-input-${PILLOW}`), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByTestId(`reserve-level-save-${PILLOW}`));

    await waitFor(() => {
      const call = vi
        .mocked(apiFetch)
        .mock.calls.find(([p]) => p === "/api/ops/stock/reserve-level");
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as { body: string }).body)).toEqual({
        sku: PILLOW,
        reserveLevel: 200,
      });
    });
  });
});

describe("an older API build", () => {
  it("degrades to an empty month instead of white-screening the tab", async () => {
    // Exactly what a pre-K4 Worker returns for an unknown path: something that
    // is not this shape at all.
    vi.mocked(apiFetch).mockResolvedValue({ rows: [], total: 0 } as never);
    renderPanel();
    expect(await screen.findByTestId("usage-empty")).toBeTruthy();
  });
});
