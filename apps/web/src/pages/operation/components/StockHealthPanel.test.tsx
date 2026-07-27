import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StockHealthPanel from "./StockHealthPanel";
import type { OpsStockHealthResponse } from "@carres/shared";

/**
 * Stock health + proposal accuracy — card K5.
 *
 * The behaviours worth locking down are the ones a screenshot cannot prove:
 *  1. The digest opens with ONE sentence and five counts — the card's own
 *     Done-when is "knows what needs attention today WITHOUT reading SKU rows",
 *     so the rows are behind a click.
 *  2. An unconfigured warehouse reads "Set a number", never a green tick.
 *  3. The not-selling alert prints the reason it is silent rather than an
 *     all-clear, so a quiet screen never reads as a clean bill of health.
 *  4. A month still running shows the ask and the order but no percentage.
 *  5. A browser talking to a Worker that predates the route degrades to
 *     nothing on screen instead of taking the tab down.
 */

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api";

const PILLOW = "Essential Memory Pillow(L)";
const MP_K = "Microfiber Waterproof Mattress Protector-K";

function response(
  over: Partial<OpsStockHealthResponse> = {},
): OpsStockHealthResponse {
  return {
    headline: "Nothing is watched yet — 2 items still need a number.",
    counts: { critical: 0, low: 0, over: 0, healthy: 0, unrated: 2 },
    rows: [
      {
        sku: PILLOW,
        free: 555,
        reserved: 0,
        incoming: 0,
        cover: 555,
        reorderPoint: null,
        keepLevel: null,
        state: "unrated",
      },
      {
        sku: MP_K,
        free: 15,
        reserved: 4,
        incoming: 0,
        cover: 15,
        reorderPoint: null,
        keepLevel: null,
        state: "unrated",
      },
    ],
    slowMovers: [],
    slowWindows: [
      { days: 90, ready: false, count: 0 },
      { days: 180, ready: false, count: 0 },
    ],
    slowWithheldReason:
      "Sales records go back 7 days. The 90-day alert appears by itself once they go back 90.",
    accuracy: [],
    ...over,
  };
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StockHealthPanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

function serve(res: OpsStockHealthResponse) {
  vi.mocked(apiFetch).mockResolvedValue(res as never);
}

// ---------------------------------------------------------------------------

describe("the digest", () => {
  it("leads with one sentence, not with rows", async () => {
    serve(response());
    renderPanel();
    expect((await screen.findByTestId("health-headline")).textContent).toBe(
      "Nothing is watched yet — 2 items still need a number.",
    );
    // The card's Done-when, made literal: no SKU is on screen until asked for.
    expect(screen.queryByTestId(`health-row-${PILLOW}`)).toBeNull();
  });

  /** THE LIVE CASE — 49 prod SKUs, not one configured number. */
  it("says `Set a number` for an unconfigured warehouse, never a green tick", async () => {
    serve(response());
    renderPanel();
    const unrated = await screen.findByTestId("health-count-unrated");
    expect(unrated.textContent).toContain("Set a number");
    expect(unrated.textContent).toContain("2");
    expect(screen.getByTestId("health-count-healthy").textContent).toContain("0");
  });

  it("opens one rung's rows on click and closes them again", async () => {
    serve(response());
    renderPanel();
    fireEvent.click(await screen.findByTestId("health-count-unrated"));
    expect(screen.getByTestId(`health-row-${PILLOW}`).textContent).toContain("555");
    fireEvent.click(screen.getByTestId("health-count-unrated"));
    expect(screen.queryByTestId(`health-row-${PILLOW}`)).toBeNull();
  });

  it("teaches where the two numbers are set", async () => {
    serve(response());
    renderPanel();
    fireEvent.click(await screen.findByTestId("health-count-unrated"));
    expect(screen.getByTestId("health-rows-unrated").textContent).toContain(
      "Reorder card under On hand",
    );
  });

  it("shows both of the COO's numbers on a rated row", async () => {
    serve(
      response({
        headline: "1 item is below the keep level.",
        counts: { critical: 1, low: 0, over: 0, healthy: 0, unrated: 0 },
        rows: [
          {
            sku: MP_K,
            free: 4,
            reserved: 0,
            incoming: 900,
            cover: 904,
            reorderPoint: 200,
            keepLevel: 5,
            state: "critical",
          },
        ],
      }),
    );
    renderPanel();
    fireEvent.click(await screen.findByTestId("health-count-critical"));
    const row = screen.getByTestId(`health-row-${MP_K}`).textContent ?? "";
    expect(row).toContain("4");
    expect(row).toContain("900");
    expect(row).toContain("reorder at");
    expect(row).toContain("keep");
  });
});

describe("not selling", () => {
  it("prints why it is silent instead of an all-clear", async () => {
    serve(response());
    renderPanel();
    expect((await screen.findByTestId("not-selling-withheld")).textContent).toContain(
      "go back 7 days",
    );
    expect(screen.getByTestId("not-selling").textContent).not.toContain(
      "Everything on the floor has sold recently",
    );
  });

  it("names the quiet items once the records are long enough", async () => {
    serve(
      response({
        slowMovers: [
          { sku: PILLOW, free: 555, lastSoldOn: null, quietDays: 207, window: 180 },
        ],
        slowWindows: [
          { days: 90, ready: true, count: 1 },
          { days: 180, ready: true, count: 1 },
        ],
        slowWithheldReason: null,
      }),
    );
    renderPanel();
    const row = (await screen.findByTestId(`not-selling-${PILLOW}`)).textContent ?? "";
    expect(row).toContain("no sale in 207 days");
    expect(screen.getByTestId("not-selling").textContent).toContain("1 over 180 days");
  });

  it("says so plainly when nothing is sitting", async () => {
    serve(
      response({
        slowMovers: [],
        slowWindows: [
          { days: 90, ready: true, count: 0 },
          { days: 180, ready: true, count: 0 },
        ],
        slowWithheldReason: null,
      }),
    );
    renderPanel();
    expect((await screen.findByTestId("not-selling")).textContent).toContain(
      "Everything on the floor has sold recently",
    );
  });
});

describe("did the plan work", () => {
  it("says no month has been approved yet — today's live answer", async () => {
    serve(response());
    renderPanel();
    expect((await screen.findByTestId("accuracy-empty")).textContent).toContain(
      "No month has been approved yet",
    );
  });

  it("prints the percentage for a finished month", async () => {
    serve(
      response({
        accuracy: [
          {
            period: "2026-06",
            reported: true,
            withheld: null,
            askedQty: 300,
            orderedQty: 200,
            soldQty: 140,
            leftOnFloor: 60,
            movedPct: 70,
            rows: [],
          },
        ],
      }),
    );
    renderPanel();
    const month = (await screen.findByTestId("accuracy-2026-06")).textContent ?? "";
    expect(month).toContain("Jun 2026");
    expect(month).toContain("70%");
    expect(month).toContain("still on the floor");
  });

  it("calls out under-ordering rather than reading it as a win", async () => {
    serve(
      response({
        accuracy: [
          {
            period: "2026-06",
            reported: true,
            withheld: null,
            askedQty: 300,
            orderedQty: 200,
            soldQty: 260,
            leftOnFloor: 0,
            movedPct: 130,
            rows: [],
          },
        ],
      }),
    );
    renderPanel();
    expect((await screen.findByTestId("accuracy-2026-06")).textContent).toContain(
      "we ordered too little",
    );
  });

  it("withholds a month still running, keeping the facts already decided", async () => {
    serve(
      response({
        accuracy: [
          {
            period: "2026-07",
            reported: false,
            withheld: "month_not_over",
            askedQty: 300,
            orderedQty: 200,
            soldQty: 0,
            leftOnFloor: 60,
            movedPct: null,
            rows: [],
          },
        ],
      }),
    );
    renderPanel();
    const month = (await screen.findByTestId("accuracy-2026-07")).textContent ?? "";
    expect(month).toContain("asked");
    expect(month).toContain("300");
    expect(month).not.toContain("%");
    expect(
      screen.getByTestId("accuracy-withheld-2026-07").textContent,
    ).toContain("still running");
  });
});

describe("degrading", () => {
  it("renders nothing against a Worker that predates the route", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("404"));
    const { container } = renderPanel();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("stock-health")).toBeNull();
    expect(container.textContent).toBe("");
  });
});
