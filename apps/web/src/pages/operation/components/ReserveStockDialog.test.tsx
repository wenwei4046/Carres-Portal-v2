import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReserveStockDialog, { type ReserveFreeUnit } from "./ReserveStockDialog";

/**
 * Ready stock K4 — a unit does not leave the shelf without a reason.
 *
 * What is locked down here is the half of the card a migration cannot enforce
 * on its own:
 *  1. The confirm button is dark until the reason is answered, and the same
 *     shared rule that dims it is the one the server refuses on.
 *  2. `Other` needs words — the hole that would make the monthly split
 *     unreadable.
 *  3. The reason travels WITH the reserve, in the same request.
 *  4. The reserve-level reminder appears, and NEVER blocks: the button stays
 *     live while the warning is on screen.
 */

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api";

const PILLOW = "Essential Memory Pillow(L)";

const unit = (over: Partial<ReserveFreeUnit> = {}): ReserveFreeUnit => ({
  id: "unit-1",
  unitCode: null,
  sku: PILLOW,
  condition: "new",
  poNo: null,
  sourceRef: null,
  dateIn: "2026-07-01",
  ...over,
});

/** The usage payload the picker reads for reserve levels. */
function usage(level: number | null, free: number) {
  return {
    period: "2026-07",
    totalUnits: 0,
    totalDraws: 0,
    byReason: [],
    bySku: [],
    entries: [],
    levels: [
      {
        sku: PILLOW,
        free,
        reserved: 0,
        reserveLevel: level,
        state: level == null ? "unset" : "ok",
        shortfall: 0,
      },
    ],
    lowCount: 0,
    canEdit: false,
  };
}

function renderDialog(units: ReserveFreeUnit[] = [unit({ qty: 1 })]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onReserved = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <ReserveStockDialog
        sku={PILLOW}
        soRef="SO-1209"
        need={1}
        units={units}
        exact
        onClose={vi.fn()}
        onReserved={onReserved}
      />
    </QueryClientProvider>,
  );
  return { onReserved };
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation(async (path: string) =>
    path.startsWith("/api/ops/stock/usage")
      ? (usage(null, 555) as never)
      : ({ itemId: "unit-1" } as never),
  );
});

describe("the reason gate", () => {
  it("keeps the confirm dark until somebody says why", async () => {
    renderDialog();
    const confirm = screen.getByTestId("reserve-stock-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByTestId("reserve-stock-problem").textContent).toContain(
      "Why is this unit being taken",
    );

    fireEvent.change(screen.getByTestId("pool-reason"), {
      target: { value: "supplier_delay" },
    });
    await waitFor(() => expect(confirm.disabled).toBe(false));
  });

  it("refuses `Other` with no words", async () => {
    renderDialog();
    const confirm = screen.getByTestId("reserve-stock-confirm") as HTMLButtonElement;
    fireEvent.change(screen.getByTestId("pool-reason"), { target: { value: "other" } });
    await waitFor(() =>
      expect(screen.getByTestId("reserve-stock-problem").textContent).toContain(
        "Say what the reason is",
      ),
    );
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByTestId("pool-reason-note"), {
      target: { value: "showroom display swap" },
    });
    await waitFor(() => expect(confirm.disabled).toBe(false));
  });

  it("sends the reason in the same request as the reserve", async () => {
    renderDialog();
    fireEvent.change(screen.getByTestId("pool-reason"), {
      target: { value: "warranty_exchange" },
    });
    fireEvent.click(screen.getByTestId("reserve-stock-confirm"));

    await waitFor(() => {
      const call = vi
        .mocked(apiFetch)
        .mock.calls.find(([p]) => p === "/api/ops/stock/reserve-item");
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as { body: string }).body)).toEqual({
        itemId: "unit-1",
        ref: "SO-1209",
        reason: "warranty_exchange",
        note: null,
      });
    });
  });
});

describe("the reserve level reminds and never blocks", () => {
  it("says what the draw would leave, and still lets it through", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) =>
      path.startsWith("/api/ops/stock/usage")
        ? (usage(5, 6) as never)
        : ({ itemId: "unit-1" } as never),
    );
    renderDialog([unit({ qty: 3 })]);

    fireEvent.change(screen.getByTestId("pool-reason"), {
      target: { value: "vip" },
    });

    const warn = await screen.findByTestId("pool-reserve-warning");
    expect(warn.textContent).toContain("3"); // 6 free − 3 taken
    expect(warn.textContent).toContain("5"); // keep at least 5
    // THE point of the card's wording: warns, never blocks.
    expect(
      (screen.getByTestId("reserve-stock-confirm") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("stays quiet when the draw leaves the level intact", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) =>
      path.startsWith("/api/ops/stock/usage")
        ? (usage(5, 60) as never)
        : ({ itemId: "unit-1" } as never),
    );
    renderDialog([unit({ qty: 1 })]);
    fireEvent.change(screen.getByTestId("pool-reason"), { target: { value: "vip" } });
    await waitFor(() =>
      expect(
        (screen.getByTestId("reserve-stock-confirm") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(screen.queryByTestId("pool-reserve-warning")).toBeNull();
  });
});
