/**
 * WAREHOUSE — ARRIVAL SCHEDULE · PICKUP SCHEDULE (owner ruling 2026-09-14).
 *
 * The acceptance cases of the approved card, and they are almost all about the
 * same thing: **the board may not invent, merge or hide a fact.** Two POs on
 * one date are two cards; five categories in one scope are five lines on one
 * card; an absent receipt is not a zero; a broken feed is not an empty day.
 *
 * The data projection is BUILD B's and is mocked here — these tests own what
 * the UI DOES with a contract-shaped answer, not where the answer comes from.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  WarehouseScheduleCard,
  WarehouseScheduleLine,
  WarehouseScheduleResult,
} from "@carres/shared";

/* The page derives "today" from the app clock — pin it to the fixture week. */
vi.mock("@/lib/fmt-date", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fmt-date")>("@/lib/fmt-date");
  return { ...actual, appTodayIso: () => "2026-09-14" };
});

/** BUILD B's projection, mocked at the seam the two builds agreed on. */
let result: WarehouseScheduleResult;
vi.mock("./useWarehouseSchedule", () => ({
  useWarehouseSchedule: () => result,
}));

import WarehouseWorkspace, { __resetScheduleContext } from "./WarehouseWorkspace";

const DATES = [
  "2026-09-14",
  "2026-09-15",
  "2026-09-16",
  "2026-09-17",
  "2026-09-18",
  "2026-09-19",
];

function line(over: Partial<WarehouseScheduleLine> = {}): WarehouseScheduleLine {
  return {
    id: `l${Math.random()}`,
    categoryKey: "Mattress",
    modelLabel: "Ohana King",
    plannedQty: 3,
    receivedQty: null,
    loadedQty: null,
    damagedQty: null,
    ...over,
  };
}

function card(over: Partial<WarehouseScheduleCard> = {}): WarehouseScheduleCard {
  return {
    id: "c1",
    direction: "arrival",
    kind: "supplier-delivery",
    sourceId: "po-1",
    sourceRef: "PO-2609-0001",
    soRef: null,
    doRef: null,
    partyName: "Ohana",
    siteId: "wh-1",
    date: "2026-09-15",
    dateStatus: "expected",
    lines: [line()],
    driverConfirmedQty: null,
    logisticsName: "NETS Delivery",
    relatedRecords: [],
    openHref: "/operation?tab=warehouse-inbound&po=po-1",
    detailHref: null,
    overdue: false,
    ...over,
  };
}

function setSchedule(over: Partial<WarehouseScheduleResult> = {}) {
  result = {
    cards: [],
    operatingDates: DATES,
    loading: false,
    errors: [],
    ...over,
  };
}

let wide = true;
beforeEach(() => {
  __resetScheduleContext();
  wide = true;
  setSchedule();
  window.matchMedia = ((query: string) => ({
    /* The page asks `(max-width: 1279px)` — true means the agenda. */
    matches: !wide,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  __resetScheduleContext();
});

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{`${loc.pathname}${loc.search}`}</div>;
}

function mount(
  direction: "arrival" | "pickup" = "arrival",
  url = "/operation?tab=warehouse-arrival-schedule",
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/operation"
          element={
            <>
              <WarehouseWorkspace direction={direction} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("the board", () => {
  it("is six equal date columns, and it is NOT the combined Monitor", () => {
    mount();
    for (const d of DATES) expect(screen.getByTestId(`ws-col-${d}`)).toBeInTheDocument();
    const grid = screen.getByTestId("ws-board").firstElementChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("repeat(6, minmax(0, 1fr))");
  });

  it("names the page Arrival Schedule or Pickup Schedule — never Monitor", () => {
    mount("arrival");
    expect(screen.getByTestId("warehouse-arrival-schedule-header")).toHaveTextContent(
      "Arrival Schedule",
    );
    expect(screen.queryByText("Monitor")).toBeNull();
  });

  it("carries NO internal direction tab and no upper/lower split", () => {
    setSchedule({ cards: [card()] });
    mount("arrival");
    expect(screen.queryByText("Pickup")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("uses the projection's operating dates and applies NO off-day rule of its own", () => {
    /* A Sunday (2026-09-20) the Site DOES operate must render. */
    setSchedule({ operatingDates: ["2026-09-20", "2026-09-21"] });
    mount();
    expect(screen.getByTestId("ws-col-2026-09-20")).toBeInTheDocument();
  });

  it("the date heading carries the weekday, the number and the month", () => {
    mount();
    const head = screen.getByTestId("ws-head-2026-09-15");
    expect(head).toHaveTextContent("Tue");
    expect(head).toHaveTextContent("15");
    expect(head).toHaveTextContent("Sep");
  });
});

describe("one card per owning record — never merged, never capped", () => {
  it("two POs from the same supplier on the same date are TWO cards", () => {
    setSchedule({
      cards: [
        card({ id: "a", sourceId: "po-a", sourceRef: "PO-2609-0001" }),
        card({ id: "b", sourceId: "po-b", sourceRef: "PO-2609-0002" }),
      ],
    });
    mount();
    const col = screen.getByTestId("ws-col-2026-09-15");
    expect(col.querySelectorAll("article[data-direction]")).toHaveLength(2);
    expect(within(col).getByText("PO-2609-0001")).toBeInTheDocument();
    expect(within(col).getByText("PO-2609-0002")).toBeInTheDocument();
  });

  it("one PO holding two categories is ONE card with TWO lines", () => {
    setSchedule({
      cards: [
        card({
          lines: [
            line({ id: "m", categoryKey: "Mattress", modelLabel: "Ohana King" }),
            line({ id: "b", categoryKey: "Bedframe", modelLabel: "Ohana Frame" }),
          ],
        }),
      ],
    });
    mount();
    expect(document.querySelectorAll("article[data-direction]")).toHaveLength(1);
    expect(screen.getAllByTestId("ws-line")).toHaveLength(2);
  });

  it("one delivery scope holding five categories is ONE card with FIVE lines", () => {
    setSchedule({
      cards: [
        card({
          direction: "pickup",
          lines: (
            ["Mattress", "Bedframe", "Sofa", "Pillow", "Topper"] as const
          ).map((c, i) => line({ id: `l${i}`, categoryKey: c, loadedQty: null })),
        }),
      ],
    });
    mount("pickup");
    expect(screen.getAllByTestId("ws-line")).toHaveLength(5);
  });

  it("repeated same-category source lines stay SEPARATE — no aggregation, no `+N more`", () => {
    setSchedule({
      cards: [
        card({
          lines: [
            line({ id: "1", categoryKey: "Mattress", modelLabel: "Ohana King" }),
            line({ id: "2", categoryKey: "Mattress", modelLabel: "Ohana King" }),
            line({ id: "3", categoryKey: "Mattress", modelLabel: "Ohana King" }),
          ],
        }),
      ],
    });
    mount();
    expect(screen.getAllByTestId("ws-line")).toHaveLength(3);
    expect(screen.queryByText(/\+\d+ more/)).toBeNull();
  });
});

describe("progress — the four states are distinguishable", () => {
  it("an ABSENT receipt shows the planned quantity alone, never 0/3", () => {
    setSchedule({ cards: [card({ lines: [line({ receivedQty: null, plannedQty: 3 })] })] });
    mount();
    const p = screen.getByTestId("ws-line-progress");
    expect(p).toHaveAttribute("data-state", "unknown");
    expect(p).toHaveTextContent("3 expected, receipt not recorded");
    expect(p.textContent).not.toContain("0/3");
  });

  it("a RECORDED zero is visibly a different answer from an absent one", () => {
    setSchedule({ cards: [card({ lines: [line({ receivedQty: 0, plannedQty: 3 })] })] });
    mount();
    const p = screen.getByTestId("ws-line-progress");
    expect(p).toHaveAttribute("data-state", "none");
    expect(p).toHaveTextContent("0/3");
    expect(p).toHaveTextContent("0 of 3 received");
  });

  it("partial and complete each carry their numbers and their meaning", () => {
    setSchedule({
      cards: [
        card({
          lines: [
            line({ id: "p", receivedQty: 2, plannedQty: 3 }),
            line({ id: "c", receivedQty: 3, plannedQty: 3 }),
          ],
        }),
      ],
    });
    mount();
    const states = screen
      .getAllByTestId("ws-line-progress")
      .map((n) => n.getAttribute("data-state"));
    expect(states).toEqual(["partial", "complete"]);
  });

  it("a pickup reads the LOADING count, never a receipt count", () => {
    setSchedule({
      cards: [
        card({
          direction: "pickup",
          lines: [line({ loadedQty: 1, receivedQty: 3, plannedQty: 2 })],
        }),
      ],
    });
    mount("pickup");
    expect(screen.getByTestId("ws-line-progress")).toHaveTextContent("1 of 2 loaded");
  });
});

describe("damage, the driver, and the records a card may link to", () => {
  it("damage stays INSIDE the received count and gets its own warning", () => {
    setSchedule({
      cards: [card({ lines: [line({ receivedQty: 3, plannedQty: 3, damagedQty: 1 })] })],
    });
    mount();
    /* 3 of 3 arrived — the damaged Unit is one of them, not a fourth. */
    expect(screen.getByTestId("ws-line-progress")).toHaveTextContent("3/3");
    expect(screen.getByTestId("ws-card-exception-damaged")).toHaveTextContent(
      "1 received with issue · counted in received, not available stock",
    );
  });

  it("damage ALONE creates no related record and no return link", () => {
    setSchedule({
      cards: [
        card({ lines: [line({ receivedQty: 3, damagedQty: 1 })], relatedRecords: [] }),
      ],
    });
    mount();
    expect(screen.queryByTestId("ws-card-related")).toBeNull();
  });

  it("an authorised return links back to the source record the projection named", () => {
    setSchedule({
      cards: [
        card({
          kind: "customer-return",
          relatedRecords: [
            { id: "r1", ref: "DO-2609-019", href: "/operation/delivery-orders/do-19" },
          ],
        }),
      ],
    });
    mount();
    expect(screen.getByText("DO-2609-019")).toHaveAttribute(
      "href",
      "/operation/delivery-orders/do-19",
    );
  });

  it("driver confirmation is its own line and never the loading progress", () => {
    setSchedule({
      cards: [
        card({
          direction: "pickup",
          driverConfirmedQty: 2,
          lines: [line({ loadedQty: 3, plannedQty: 3 })],
        }),
      ],
    });
    mount("pickup");
    expect(screen.getByTestId("ws-card-exception-driver")).toHaveTextContent(
      "Driver confirmed 2",
    );
    expect(screen.getByTestId("ws-line-progress")).toHaveTextContent("3/3");
  });

  it("an unevidenced driver count shows nothing at all", () => {
    setSchedule({ cards: [card({ direction: "pickup", driverConfirmedQty: null })] });
    mount("pickup");
    expect(screen.queryByTestId("ws-card-exception-driver")).toBeNull();
  });
});

describe("the card's own anatomy", () => {
  it("prints NO event-type heading for an ordinary arrival or an ordinary pickup", () => {
    setSchedule({
      cards: [
        card({ kind: "supplier-delivery" }),
        card({ id: "c2", direction: "pickup", kind: "customer_delivery_pickup" }),
      ],
    });
    mount();
    expect(screen.queryByTestId("ws-card-special")).toBeNull();
  });

  it("names a SPECIAL movement", () => {
    setSchedule({ cards: [card({ kind: "transfer" })] });
    mount();
    expect(screen.getByTestId("ws-card-special")).toHaveTextContent("Transfer arrival");
  });

  it("a customer pickup leads with the SO and puts the DO second", () => {
    setSchedule({
      cards: [card({ direction: "pickup", soRef: "SO-1362", doRef: "DO-2609-019" })],
    });
    mount("pickup");
    expect(screen.getByTestId("ws-card-ref-primary")).toHaveTextContent("SO-1362");
    expect(screen.getByTestId("ws-card-ref-secondary")).toHaveTextContent("DO-2609-019");
  });

  it("has NO footer, NO `Received` heading and NO visible Logistics row", () => {
    setSchedule({ cards: [card({ logisticsName: "NETS Delivery" })] });
    mount();
    const c = screen.getByTestId("ws-card-c1");
    expect(within(c).queryByText("Received")).toBeNull();
    expect(within(c).queryByText(/NETS Delivery/)).toBeNull();
    expect(c.querySelector("footer")).toBeNull();
  });

  it("an unknown date agreement stays neutral — a date alone is never `Scheduled`", () => {
    setSchedule({ cards: [card({ dateStatus: null })] });
    mount();
    expect(screen.queryByTestId("ws-card-date-status")).toBeNull();
    expect(screen.getByTestId("ws-card-c1").className).not.toContain("amber");
    expect(screen.getByTestId("ws-card-c1").className).not.toContain("blue");
  });
});

describe("the door into work", () => {
  it("opens the source the projection named, and says so to a screen reader", () => {
    setSchedule({ cards: [card()] });
    mount();
    const open = screen.getByTestId("ws-card-open");
    expect(open).toHaveAttribute("href", "/operation?tab=warehouse-inbound&po=po-1");
    expect(open).toHaveAccessibleName("Open receiving work for Ohana · PO-2609-0001");
  });

  it("is reachable by keyboard", () => {
    setSchedule({ cards: [card()] });
    mount();
    const open = screen.getByTestId("ws-card-open");
    open.focus();
    expect(open).toHaveFocus();
  });

  it("renders NO door when there is no scope to open — never a link to something adjacent", () => {
    setSchedule({ cards: [card({ openHref: null })] });
    mount();
    expect(screen.queryByTestId("ws-card-open")).toBeNull();
  });
});

describe("a broken feed is never an empty day", () => {
  it("announces the failure and refuses to say `Nothing arriving`", () => {
    setSchedule({
      cards: [],
      errors: [{ direction: "arrival", message: "The schedule could not be read." }],
    });
    mount();
    expect(screen.getByTestId("ws-feed-error")).toHaveTextContent(
      "The schedule could not be read.",
    );
    expect(screen.getByTestId("ws-empty-2026-09-15")).toHaveTextContent(
      "The schedule could not be read for this date.",
    );
    expect(screen.queryByText("Nothing arriving.")).toBeNull();
  });

  it("a partial failure still renders the cards that DID arrive", () => {
    setSchedule({
      cards: [card()],
      errors: [{ direction: "arrival", message: "Site operating dates unavailable." }],
    });
    mount();
    expect(screen.getByTestId("ws-feed-error")).toBeInTheDocument();
    expect(screen.getByTestId("ws-card-c1")).toBeInTheDocument();
  });

  it("a genuinely clear day says so", () => {
    setSchedule({ cards: [], errors: [] });
    mount();
    expect(screen.getByTestId("ws-empty-2026-09-15")).toHaveTextContent("Nothing arriving.");
    expect(screen.queryByTestId("ws-feed-error")).toBeNull();
  });

  it("a card with NO date is reported, never silently dropped", () => {
    setSchedule({ cards: [card({ date: null })] });
    mount();
    expect(screen.getByTestId("ws-undated")).toHaveTextContent("1 with no date yet");
    expect(screen.queryByTestId("ws-card-c1")).toBeNull();
  });
});

describe("long values and the narrow viewport", () => {
  it("a long party name and a long reference WRAP — they are never clipped away", () => {
    const longName = "Ohana Furniture Manufacturing Sendirian Berhad (Klang Branch)";
    setSchedule({
      cards: [card({ partyName: longName, sourceRef: "PO-2609-0001-REV-B-REISSUE" })],
    });
    mount();
    expect(screen.getByTestId("ws-card-party")).toHaveTextContent(longName);
    expect(screen.getByTestId("ws-card-party").className).toContain("break-words");
    expect(screen.getByTestId("ws-card-party").className).not.toContain("truncate");
    expect(screen.getByTestId("ws-card-ref-primary")).toHaveTextContent(
      "PO-2609-0001-REV-B-REISSUE",
    );
  });

  it("below 1280px shows ONE date with the same records and the same doors", () => {
    wide = false;
    setSchedule({ cards: [card({ date: "2026-09-14" })] });
    mount();
    expect(screen.getByTestId("ws-agenda")).toBeInTheDocument();
    expect(screen.queryByTestId("ws-board")).toBeNull();
    expect(screen.getByTestId("ws-card-c1")).toBeInTheDocument();
    expect(screen.getByTestId("ws-card-open")).toBeInTheDocument();
  });

  it("the board pages a WHOLE window, never one day at a time", () => {
    /* Six operating dates across a closed Sunday — the window SPANS seven
       calendar days, so Previous must jump seven, not one. */
    setSchedule({
      operatingDates: [
        "2026-09-14",
        "2026-09-15",
        "2026-09-16",
        "2026-09-17",
        "2026-09-18",
        "2026-09-19",
      ],
    });
    mount();
    fireEvent.click(screen.getByTestId("ws-prev"));
    /* 2026-09-14 minus the window's own 6-day span. Anything closer would put
       five already-visible dates back on the board. */
    expect(screen.getByTestId("location")).toHaveTextContent("from=2026-09-08");
  });

  it("Next starts the day AFTER the last date shown — never a repeated column", () => {
    setSchedule();
    mount();
    fireEvent.click(screen.getByTestId("ws-next"));
    expect(screen.getByTestId("location")).toHaveTextContent("from=2026-09-20");
  });

  it("narrow previous/next walks ONE governed operating date, not a raw calendar day", () => {
    wide = false;
    setSchedule();
    mount();
    fireEvent.click(screen.getByTestId("ws-next"));
    expect(screen.getByTestId("location")).toHaveTextContent("date=2026-09-15");
  });
});

describe("context survives the walk", () => {
  it("keeps `site` when the date window moves", () => {
    setSchedule();
    mount("arrival", "/operation?tab=warehouse-arrival-schedule&site=wh-1");
    fireEvent.click(screen.getByTestId("ws-next"));
    expect(screen.getByTestId("location")).toHaveTextContent("site=wh-1");
  });

  it("the sibling Schedule opens on the date and Site the operator was standing on", () => {
    setSchedule();
    const first = mount(
      "arrival",
      "/operation?tab=warehouse-arrival-schedule&date=2026-09-17&site=wh-9",
    );
    first.unmount();

    /* The sidebar link carries no parameters — the page must remember. */
    setSchedule({ cards: [card({ direction: "pickup", date: "2026-09-17" })] });
    mount("pickup", "/operation?tab=warehouse-pickup-schedule");
    expect(screen.getByTestId("ws-card-c1")).toBeInTheDocument();
    expect(screen.getByTestId("ws-col-2026-09-17")).toBeInTheDocument();
  });
});


/**
 * PRODUCTION ACCEPTANCE, 2026-09-14.
 */
describe("the findings the production walk raised", () => {
  it("undated work OPENS IN PLACE, each record reaching its own source", () => {
    setSchedule({
      cards: [
        card({
          id: "u1",
          date: null,
          partyName: "Ohana",
          sourceRef: "PO-2609-0009",
          openHref: "/operation?tab=warehouse-inbound&site=wh-1&source=po-9",
        }),
      ],
    });
    mount("arrival", "/operation?tab=warehouse-arrival-schedule&site=wh-1");
    expect(screen.getByTestId("ws-undated")).toHaveTextContent(
      "1 with no date yet",
    );
    const open = screen.getByTestId("ws-undated-open");
    expect(open).toHaveTextContent("PO-2609-0009");
    /* The record's OWN door — and it carries no date, because a date filter
       would exclude the very record the link is for. */
    expect(open).toHaveAttribute(
      "href",
      "/operation?tab=warehouse-inbound&site=wh-1&source=po-9",
    );
    expect(open.getAttribute("href")).not.toContain("date=");
  });

  it("lists every undated record, and never calls one overdue", () => {
    setSchedule({
      cards: [
        card({ id: "a", date: null, sourceRef: "PO-A", overdue: false }),
        card({ id: "b", date: null, sourceRef: "PO-B", overdue: false }),
      ],
    });
    mount();
    expect(
      screen.getByTestId("ws-undated-list").querySelectorAll("li"),
    ).toHaveLength(2);
    expect(screen.getByTestId("ws-undated")).not.toHaveTextContent(/overdue/i);
  });

  it("the SO appears ONCE, as a link, and not again at the foot of the card", () => {
    setSchedule({
      cards: [
        card({
          direction: "pickup",
          soRef: "SO-1362",
          doRef: "DO-2609-019",
          relatedRecords: [
            { id: "so", ref: "SO-1362", href: "/operation/orders/so/order-19" },
          ],
        }),
      ],
    });
    mount("pickup");
    expect(screen.getAllByText("SO-1362")).toHaveLength(1);
    expect(screen.getByText("SO-1362")).toHaveAttribute(
      "href",
      "/operation/orders/so/order-19",
    );
    expect(screen.queryByTestId("ws-card-related")).toBeNull();
    /* The DO still stands on its own line. */
    expect(screen.getByTestId("ws-card-ref-secondary")).toHaveTextContent(
      "DO-2609-019",
    );
  });

  it("ten lines render as ten distinguishable products", () => {
    /* The projection supplies model + variant; the card must not collapse
       them. `King` alone identified nothing on the production walk. */
    const models = [
      "B1201S King",
      "B1201S Queen",
      "H1401S King",
      "H1401S Queen",
      "L1201S King",
      "M1401F Queen",
      "N1001S Queen",
      "S1601F King",
      "S1601S Queen",
      "TEst Rental King",
    ];
    setSchedule({
      cards: [
        card({
          lines: models.map((m, i) =>
            line({ id: `l${i}`, modelLabel: m, plannedQty: 1 }),
          ),
        }),
      ],
    });
    mount();
    expect(screen.getAllByTestId("ws-line")).toHaveLength(10);
    for (const m of models) expect(screen.getByText(m)).toBeInTheDocument();
    expect(screen.queryByText(/\+\d+ more/)).toBeNull();
  });
});
