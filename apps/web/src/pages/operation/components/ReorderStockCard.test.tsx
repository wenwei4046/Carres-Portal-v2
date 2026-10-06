import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReorderStockCard from "./ReorderStockCard";
import type { OpsReorderResponse, OpsReorderRow } from "@carres/shared";

/**
 * Reorder band — Ready Stock K1.
 *
 * The behaviours worth locking down are the ones a screenshot cannot prove:
 *  1. `Reorder stock` shows while there is STILL stock on the shelf (the whole
 *     point — a 2-month import cannot be ordered after it hits zero).
 *  2. A SKU with no number says "Set a number", never a reassuring "Enough".
 *  3. The pencil only exists for the seat allowed to edit.
 */
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api";

const MP_K = "Microfiber Waterproof Mattress Protector-K";
const PILLOW = "Essential Memory Pillow(L)";

function row(over: Partial<OpsReorderRow> & { sku: string }): OpsReorderRow {
  return {
    kind: "Mattress protector",
    onHand: 0,
    reserved: 0,
    incoming: 0,
    cover: 0,
    reorderPoint: null,
    leadDays: null,
    state: "unset",
    shortfall: 0,
    ...over,
  };
}

const LOW = row({
  sku: MP_K,
  onHand: 15,
  cover: 15,
  reorderPoint: 200,
  leadDays: 60,
  state: "reorder",
  shortfall: 185,
});
const FINE = row({
  sku: PILLOW,
  kind: "Pillow",
  onHand: 555,
  cover: 555,
  reorderPoint: 200,
  leadDays: 60,
  state: "ok",
});

function payload(over: Partial<OpsReorderResponse> = {}): OpsReorderResponse {
  return {
    rows: [LOW, FINE],
    alertCount: 1,
    unsetCount: 0,
    canEdit: false,
    ...over,
  };
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("ReorderStockCard", () => {
  it("says Reorder stock while units are still on the shelf", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload());
    render(wrap(<ReorderStockCard />));

    await waitFor(() =>
      expect(screen.getByTestId("reorder-stock-card")).toBeInTheDocument(),
    );
    const state = screen.getByTestId(`reorder-state-${MP_K}`);
    expect(state.textContent).toMatch(/Reorder stock/);
    expect(state.textContent).toMatch(/185 short/);
    // ...and the row still reports stock on hand — this is the early warning.
    expect(screen.getByTestId(`reorder-row-${MP_K}`).textContent).toMatch(/15/);
    expect(screen.getByTestId("reorder-alert-count").textContent).toMatch(
      /1 to reorder/,
    );
  });

  it("shows current, incoming and the point for every watched SKU", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      payload({ rows: [{ ...LOW, incoming: 400 }] }),
    );
    render(wrap(<ReorderStockCard />));

    await waitFor(() =>
      expect(screen.getByTestId(`reorder-row-${MP_K}`)).toBeInTheDocument(),
    );
    const text = screen.getByTestId(`reorder-row-${MP_K}`).textContent ?? "";
    expect(text).toMatch(/15/); // now
    expect(text).toMatch(/400/); // coming
    expect(text).toMatch(/200/); // reorder at
  });

  it("asks for a number instead of pretending an unwatched SKU is fine", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      payload({
        rows: [row({ sku: PILLOW, kind: "Pillow", onHand: 555, cover: 555 })],
        alertCount: 0,
        unsetCount: 1,
      }),
    );
    render(wrap(<ReorderStockCard />));

    await waitFor(() =>
      expect(screen.getByTestId(`reorder-state-${PILLOW}`)).toBeInTheDocument(),
    );
    expect(screen.getByTestId(`reorder-state-${PILLOW}`).textContent).toBe(
      "Set a number",
    );
    expect(screen.getByTestId("reorder-unset-count").textContent).toMatch(
      /1 without a number/,
    );
  });

  it("reads 'No alert' when the point is the documented 0 = off", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      payload({
        rows: [row({ sku: PILLOW, kind: "Pillow", reorderPoint: 0, state: "ok" })],
        alertCount: 0,
      }),
    );
    render(wrap(<ReorderStockCard />));
    await waitFor(() =>
      expect(screen.getByTestId(`reorder-state-${PILLOW}`).textContent).toBe(
        "No alert",
      ),
    );
  });

  it("hides the pencil from anyone who may not edit", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload({ canEdit: false }));
    render(wrap(<ReorderStockCard />));

    await waitFor(() =>
      expect(screen.getByTestId("reorder-stock-card")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId(`reorder-edit-${MP_K}`)).not.toBeInTheDocument();
  });

  it("saves a new point through the API for the seat that may edit", async () => {
    vi.mocked(apiFetch).mockImplementation((async (_path: string, init?: RequestInit) => {
      if (init?.method === "PUT") return { sku: MP_K, reorderPoint: 250 };
      return payload({ canEdit: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
    render(wrap(<ReorderStockCard />));

    await waitFor(() =>
      expect(screen.getByTestId(`reorder-edit-${MP_K}`)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId(`reorder-edit-${MP_K}`));

    const input = screen.getByTestId(`reorder-input-${MP_K}`) as HTMLInputElement;
    expect(input.value).toBe("200"); // seeded with the current point
    fireEvent.change(input, { target: { value: "250" } });
    fireEvent.click(screen.getByTestId(`reorder-save-${MP_K}`));

    await waitFor(() => {
      const put = vi
        .mocked(apiFetch)
        .mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
      expect(put).toBeTruthy();
      expect(JSON.parse((put![1] as RequestInit).body as string)).toMatchObject({
        sku: MP_K,
        reorderPoint: 250,
      });
    });
  });

  it("refuses to save a blank number rather than sending a bad one", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload({ canEdit: true }));
    render(wrap(<ReorderStockCard />));

    await waitFor(() =>
      expect(screen.getByTestId(`reorder-edit-${MP_K}`)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId(`reorder-edit-${MP_K}`));
    fireEvent.change(screen.getByTestId(`reorder-input-${MP_K}`), {
      target: { value: "" },
    });
    expect(
      (screen.getByTestId(`reorder-save-${MP_K}`) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("renders nothing at all when there is nothing to watch", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      payload({ rows: [], alertCount: 0, unsetCount: 0 }),
    );
    const { container } = render(wrap(<ReorderStockCard />));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(screen.queryByTestId("reorder-stock-card")).not.toBeInTheDocument();
    expect(container.textContent).toBe("");
  });

  it("degrades instead of crashing against a Worker without the route", async () => {
    // A web deploy and an api deploy are never atomic, so a browser carrying
    // this build WILL briefly ask an older Worker. Its answer has the wrong
    // shape, and the Stock page around this band must survive it — this is the
    // exact crash the first run of OperationStockOnHand.test.tsx caught.
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0 } as never);
    const { container } = render(wrap(<ReorderStockCard />));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(screen.queryByTestId("reorder-stock-card")).not.toBeInTheDocument();
    expect(container.textContent).toBe("");
  });

  it("stays silent rather than shouting when the feed fails", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("boom"));
    render(wrap(<ReorderStockCard />));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(screen.queryByTestId("reorder-stock-card")).not.toBeInTheDocument();
  });
});
